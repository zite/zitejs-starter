/**
 * Bundle endpoints or one-off scripts using esbuild's in-memory API
 *
 * Endpoint mode (default):
 *   node scripts/bundle-endpoints.js <baseDir> <endpoint1> <endpoint2> ...
 *   Bundles src/api/*.ts endpoints with SDK resolved from src/__zite__/integrations.ts
 *
 * Script mode:
 *   node scripts/bundle-endpoints.js --script <scriptPath> [--sdk <sdkPath>]
 *   Bundles a single script file, wraps the body in async execute().
 *   If --sdk is provided, resolves 'zite-integrations-backend-sdk' to that file.
 *
 * Output: JSON to stdout
 *   Endpoint mode: { bundledEndpoints: Record<string, string>, endpointErrors?: Record<string, string> }
 *   Script mode:   { bundledCode: string } or { error: string }
 *
 * Pre-bundled libraries:
 * The following libraries are externalized and provided by cloudflare-lambda as
 * Worker Loader modules. They are lazily loaded on demand to minimize cold starts:
 * - zod, openai, @anthropic-ai/sdk, stripe, airtable, @notionhq/client
 * - @slack/web-api, googleapis, @mailchimp/mailchimp_marketing
 * - @hubspot/api-client, @linear/sdk, @microsoft/microsoft-graph-client
 *
 * Endpoint code can import these directly (e.g., `import OpenAI from 'openai'`)
 * and they will be resolved at runtime from the pre-bundled modules.
 */

import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs";
import { parse } from "@babel/parser";

// ============================================================================
// Shared config — single source of truth for esbuild aliases and externals
// ============================================================================

/**
 * Node.js built-ins to externalize (CF Workers provides these via nodejs_compat)
 */
const _NODE_BUILTIN_NAMES = [
  "http",
  "https",
  "http2",
  "stream",
  "buffer",
  "util",
  "events",
  "crypto",
  "path",
  "fs",
  "url",
  "querystring",
  "zlib",
  "net",
  "tls",
  "os",
  "assert",
  "process",
  "child_process",
  "cluster",
  "dgram",
  "dns",
  "inspector",
  "module",
  "perf_hooks",
  "readline",
  "repl",
  "string_decoder",
  "timers",
  "tty",
  "v8",
  "vm",
  "worker_threads",
  "async_hooks",
  "trace_events",
  "punycode",
];

/** Externalize both 'fs' and 'node:fs' forms */
const NODE_BUILTINS = _NODE_BUILTIN_NAMES.flatMap((m) => [m, `node:${m}`]);

/**
 * Pre-bundled libraries provided by cloudflare-lambda as Worker Loader modules
 * These are lazily loaded on demand to minimize cold starts
 * Maps npm package names to the module filenames in cloudflare-lambda
 */
const PREBUNDLED_LIBS = {
  // Zite runtime - always loaded (log collector, helpers, ZiteError, createEndpoint)
  "@zite/endpoints-runtime-sdk": "__zite-runtime__.js",
  // Zod - always loaded (small, commonly used for validation)
  zod: "__zod__.js",
  // SDK libraries - lazily loaded based on app's integrations
  openai: "__openai__.js",
  "@anthropic-ai/sdk": "__anthropic__.js",
  stripe: "__stripe__.js",
  airtable: "__airtable__.js",
  "@notionhq/client": "__notion__.js",
  "@slack/web-api": "__slack__.js",
  googleapis: "__googleapis__.js",
  "@mailchimp/mailchimp_marketing": "__mailchimp__.js",
  "@hubspot/api-client": "__hubspot__.js",
  jsforce: "__jsforce__.js",
  "@linear/sdk": "__linear__.js",
  "@microsoft/microsoft-graph-client": "__microsoft-graph__.js",
  twilio: "__twilio__.js",
  "intercom-client": "__intercom__.js",
  "@google/generative-ai": "__gemini__.js",
};

// ============================================================================
// Shared esbuild config
// ============================================================================

/**
 * Base esbuild config shared between endpoint and script bundling.
 */
const BASE_BUILD_OPTIONS = {
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  treeShaking: true,
  external: NODE_BUILTINS,
  mainFields: ["module", "main"],
  conditions: ["worker", "browser", "import", "default"],
};

// ============================================================================
// Tree-shaking helper — extract only the SDK imports used by each endpoint
// ============================================================================

/**
 * Parse an endpoint file and extract the named imports from 'zite-integrations-backend-sdk'.
 * This enables tree-shaking by only including the SDK classes/functions that are actually used.
 *
 * For example, if an endpoint only imports { Users, createEndpoint }, we generate a wrapper
 * that only imports those, allowing esbuild to tree-shake the other 50+ table classes.
 *
 * @param {string} endpointCode - The TypeScript source code of the endpoint
 * @returns {string[]} - Array of named imports (e.g., ['Users', 'createEndpoint', 'ZiteError'])
 */
function getUsedSdkImports(endpointCode) {
  try {
    const ast = parse(endpointCode, {
      sourceType: "module",
      plugins: ["typescript"],
    });

    const usedImports = new Set();

    // Walk the AST to find imports from our SDK
    for (const node of ast.program.body) {
      if (
        node.type === "ImportDeclaration" &&
        node.source.value === "zite-integrations-backend-sdk"
      ) {
        // Skip type-only imports: `import type { Foo } from '...'`
        // These don't exist at runtime and would cause "No matching export" errors
        if (node.importKind === "type") {
          continue;
        }

        for (const spec of node.specifiers) {
          if (spec.type === "ImportSpecifier") {
            // Skip individual type imports: `import { type Foo, Bar } from '...'`
            if (spec.importKind === "type") {
              continue;
            }
            // Handle both `import { Foo }` and `import { Foo as Bar }`
            const importedName = spec.imported.name || spec.imported.value;
            usedImports.add(importedName);
          } else if (spec.type === "ImportDefaultSpecifier") {
            // Default import - shouldn't happen for our SDK, but handle gracefully
            usedImports.add("default");
          } else if (spec.type === "ImportNamespaceSpecifier") {
            // `import * as sdk` - if they do this, we can't tree-shake
            // Return null to signal we should fall back to importing everything
            return null;
          }
        }
      }
    }

    return Array.from(usedImports);
  } catch {
    // If parsing fails, fall back to importing everything
    // This is a graceful degradation - the bundling will still work, just without tree-shaking
    return null;
  }
}

/**
 * Parse the SDK file and extract which exports are type-only vs value exports.
 * Type-only exports (`export type Foo = ...`) don't exist at runtime.
 * Value exports (`export class Foo`, `export function foo`, `export { foo }`) exist at runtime.
 *
 * @param {string} sdkCode - The TypeScript source code of the SDK
 * @returns {{ typeExports: Set<string>, valueExports: Set<string> } | null}
 */
function getSdkExportKinds(sdkCode) {
  try {
    const ast = parse(sdkCode, {
      sourceType: "module",
      plugins: ["typescript"],
    });

    const typeExports = new Set();
    const valueExports = new Set();

    for (const node of ast.program.body) {
      // export type Foo = ...
      if (node.type === "ExportNamedDeclaration") {
        // Type alias: export type Foo = ...
        if (node.declaration?.type === "TSTypeAliasDeclaration") {
          typeExports.add(node.declaration.id.name);
        }
        // Interface: export interface Foo { ... }
        else if (node.declaration?.type === "TSInterfaceDeclaration") {
          typeExports.add(node.declaration.id.name);
        }
        // Class: export class Foo { ... }
        else if (node.declaration?.type === "ClassDeclaration") {
          valueExports.add(node.declaration.id.name);
        }
        // Function: export function foo() { ... }
        else if (node.declaration?.type === "FunctionDeclaration") {
          valueExports.add(node.declaration.id.name);
        }
        // Variable: export const foo = ...
        else if (node.declaration?.type === "VariableDeclaration") {
          for (const decl of node.declaration.declarations) {
            if (decl.id.type === "Identifier") {
              valueExports.add(decl.id.name);
            }
          }
        }
        // Re-export: export { Foo, Bar }
        else if (node.specifiers && node.specifiers.length > 0) {
          for (const spec of node.specifiers) {
            if (spec.type === "ExportSpecifier") {
              const name = spec.exported.name || spec.exported.value;
              // Check if it's a type-only re-export: export { type Foo }
              if (spec.exportKind === "type") {
                typeExports.add(name);
              } else {
                // For re-exports, we assume they're values unless marked as type
                // The actual kind depends on what's being re-exported
                valueExports.add(name);
              }
            }
          }
        }
      }
    }

    return { typeExports, valueExports };
  } catch {
    return null;
  }
}

/**
 * Generate a wrapper that only imports the SDK classes/functions that are actually used.
 * Falls back to importing everything if we can't determine the used imports (null case).
 * If the endpoint doesn't use the SDK at all (empty array), generates minimal wrapper.
 *
 * IMPORTANT: Types (e.g., UsersRecordType) must be imported with `import type` and
 * cannot be assigned to globalThis. Only values (classes, functions) go in globalThis.
 *
 * @param {string} endpointName - The endpoint filename (without .ts)
 * @param {string[] | null} usedImports - Array of named imports, or null to import everything
 * @param {{ typeExports: Set<string>, valueExports: Set<string> } | null} sdkExportKinds - Export kinds from SDK parsing
 * @returns {string} - The wrapper code
 */
function generateEndpointWrapper(endpointName, usedImports, sdkExportKinds) {
  // null means we couldn't parse - fall back to importing everything
  if (usedImports === null) {
    return `
import * as sdk from './__zite__/integrations';
Object.assign(globalThis, sdk);
import endpoint from './api/${endpointName}';
globalThis.__endpoint = endpoint;
`;
  }

  // Empty array means no SDK imports - minimal wrapper
  if (usedImports.length === 0) {
    return `
import endpoint from './api/${endpointName}';
globalThis.__endpoint = endpoint;
`;
  }

  // Separate type imports from value imports based on SDK parsing
  // If we couldn't parse the SDK, treat everything as a value (will error if wrong, but that's correct)
  const typeImports = [];
  const valueImports = [];

  for (const name of usedImports) {
    if (sdkExportKinds?.typeExports.has(name)) {
      typeImports.push(name);
    } else {
      // If it's in valueExports OR we don't know, treat as value
      valueImports.push(name);
    }
  }

  // Build the import statements
  const importStatements = [];
  if (typeImports.length > 0) {
    importStatements.push(
      `import type { ${typeImports.join(", ")} } from './__zite__/integrations';`
    );
  }
  if (valueImports.length > 0) {
    importStatements.push(
      `import { ${valueImports.join(", ")} } from './__zite__/integrations';`
    );
  }

  // Only assign values to globalThis (types don't exist at runtime)
  const globalAssign =
    valueImports.length > 0
      ? `Object.assign(globalThis, { ${valueImports.join(", ")} });`
      : "";

  return `
${importStatements.join("\n")}
${globalAssign}
import endpoint from './api/${endpointName}';
globalThis.__endpoint = endpoint;
`;
}

// ============================================================================
// Endpoint mode — bundles src/api/*.ts files
// ============================================================================

/**
 * Create the shared esbuild alias plugin.
 * Resolves SDK and pre-bundled library imports.
 *
 * @param {object} options
 * @param {string} [options.baseDir] - App base directory (endpoint mode: resolves SDK from src/__zite__/integrations.ts)
 * @param {string} [options.sdkPath] - Direct path to SDK file (script mode: resolves SDK from temp file)
 */
function createAliasPlugin({ baseDir, sdkPath } = {}) {
  return {
    name: "zite-alias",
    setup(build) {
      // Handle zite-integrations-backend-sdk alias
      build.onResolve({ filter: /^zite-integrations-backend-sdk$/ }, () => {
        if (sdkPath) {
          return { path: path.resolve(sdkPath) };
        }
        if (baseDir) {
          return {
            path: path.resolve(baseDir, "src/__zite__/integrations.ts"),
          };
        }
        return { path: "zite-integrations-backend-sdk", external: true };
      });

      // Rewrite pre-bundled library imports to Worker Loader module paths
      for (const [pkgName, modulePath] of Object.entries(PREBUNDLED_LIBS)) {
        const escapedName = pkgName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const filter = new RegExp(`^${escapedName}$`);
        build.onResolve({ filter }, () => ({
          path: `./${modulePath}`,
          external: true,
        }));
      }
    },
  };
}

async function bundleEndpoints(baseDir, endpointNames) {
  const bundledEndpoints = {};
  const endpointErrors = {};

  const aliasPlugin = createAliasPlugin({ baseDir });

  // Parse the SDK file once to determine which exports are types vs values
  // This is used to generate correct import statements (import type vs import)
  let sdkExportKinds = null;
  try {
    const sdkPath = path.join(baseDir, "src", "__zite__", "integrations.ts");
    const sdkCode = fs.readFileSync(sdkPath, "utf-8");
    sdkExportKinds = getSdkExportKinds(sdkCode);
  } catch (err) {
    // If we can't read/parse the SDK, we'll fall back to treating everything as values
  }

  for (const name of endpointNames) {
    // Read the endpoint file and parse its imports for tree-shaking
    let usedImports = null;
    try {
      const endpointPath = path.join(baseDir, "src", "api", `${name}.ts`);
      const endpointCode = fs.readFileSync(endpointPath, "utf-8");
      usedImports = getUsedSdkImports(endpointCode);
    } catch (err) {
      // If we can't read/parse the file, fall back to importing everything
      // The actual bundling will catch any real errors
    }

    const wrapperCode = generateEndpointWrapper(
      name,
      usedImports,
      sdkExportKinds
    );

    try {
      const result = await esbuild.build({
        ...BASE_BUILD_OPTIONS,
        stdin: {
          contents: wrapperCode,
          resolveDir: `${baseDir}/src`,
          loader: "ts",
        },
        logLevel: "warning",
        plugins: [aliasPlugin],
      });

      if (result.warnings && result.warnings.length > 0) {
        const warningMessages = result.warnings.map(
          (w) =>
            `${w.location?.file || "unknown"}:${w.location?.line || "?"} - ${w.text}`
        );
        endpointErrors[name] = `Warnings: ${warningMessages.join("; ")}`;
      }

      if (result.outputFiles && result.outputFiles.length > 0) {
        bundledEndpoints[name] = result.outputFiles[0].text;
      } else {
        endpointErrors[name] = "No output generated";
      }
    } catch (err) {
      if (err.errors && Array.isArray(err.errors)) {
        const errorMessages = err.errors.map((e) => {
          const loc = e.location
            ? `${e.location.file || "unknown"}:${e.location.line || "?"}:${e.location.column || "?"}`
            : "unknown";
          return `${loc} - ${e.text}`;
        });
        endpointErrors[name] = errorMessages.join("\n");
      } else {
        endpointErrors[name] = err.message;
      }
    }
  }

  console.log(
    JSON.stringify({
      bundledEndpoints,
      endpointErrors:
        Object.keys(endpointErrors).length > 0 ? endpointErrors : undefined,
    })
  );
}

// ============================================================================
// Script mode — bundles a single one-off script
// ============================================================================

async function bundleOneOffScript(scriptPath, sdkPath) {
  const rawScript = fs.readFileSync(scriptPath, "utf-8");
  const plugin = createAliasPlugin({ sdkPath });

  // Split imports from body using the AST so we can wrap the body in an
  // async function before esbuild sees it. This allows `return` in user scripts.
  let importSection = "";
  let bodySection = rawScript;

  try {
    const ast = parse(rawScript, {
      sourceType: "module",
      plugins: ["typescript"],
      allowReturnOutsideFunction: true,
    });

    // Find the end position of the last ImportDeclaration
    let lastImportEnd = 0;
    for (const node of ast.program.body) {
      if (node.type === "ImportDeclaration") {
        lastImportEnd = node.end;
      }
    }

    if (lastImportEnd > 0) {
      importSection = rawScript.slice(0, lastImportEnd);
      bodySection = rawScript.slice(lastImportEnd);
    }
  } catch {
    // If parsing fails, treat the entire script as body (no imports).
    // esbuild will surface the real syntax error.
  }

  const wrappedScript = `${importSection}
export async function execute() {
${bodySection}
}`;

  try {
    // Pass 1: Bundle the wrapped script — resolves TS, inlines non-externals,
    // rewrites pre-bundled libs to worker module paths.
    const result = await esbuild.build({
      ...BASE_BUILD_OPTIONS,
      stdin: {
        contents: wrappedScript,
        loader: "ts",
        resolveDir: "/workspace",
      },
      minify: false,
      logLevel: "silent",
      plugins: [plugin],
    });

    if (result.errors.length > 0) {
      console.log(
        JSON.stringify({
          error: result.errors.map((e) => e.text).join("\n"),
        })
      );
      process.exit(1);
    }

    if (!result.outputFiles || result.outputFiles.length === 0) {
      console.log(JSON.stringify({ error: "esbuild produced no output" }));
      process.exit(1);
    }

    // Pass 2: Append globalThis.__endpoint assignment.
    // The script is already wrapped with `export async function execute()`,
    // so we just need to wire it up for the CF Worker.
    const esbuildOutput = result.outputFiles[0].text;
    const bundledCode = `${esbuildOutput}
globalThis.__endpoint = { execute };
`;
    console.log(JSON.stringify({ bundledCode }));
  } catch (err) {
    if (err.errors && Array.isArray(err.errors)) {
      const errorMessages = err.errors.map((e) => {
        const loc = e.location
          ? `${e.location.file || "unknown"}:${e.location.line || "?"}`
          : "unknown";
        return `${loc} - ${e.text}`;
      });
      console.log(JSON.stringify({ error: errorMessages.join("\n") }));
    } else {
      console.log(JSON.stringify({ error: err.message || String(err) }));
    }
    process.exit(1);
  }
}

// ============================================================================
// CLI entry point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Script mode: --script <path> [--sdk <path>]
  const scriptFlagIndex = args.indexOf("--script");
  if (scriptFlagIndex !== -1) {
    const scriptPath = args[scriptFlagIndex + 1];
    if (!scriptPath) {
      console.log(
        JSON.stringify({
          error: "Usage: --script <scriptPath> [--sdk <sdkPath>]",
        })
      );
      process.exit(1);
    }

    const sdkFlagIndex = args.indexOf("--sdk");
    const sdkPath = sdkFlagIndex !== -1 ? args[sdkFlagIndex + 1] : undefined;

    return bundleOneOffScript(scriptPath, sdkPath);
  }

  // Endpoint mode: <baseDir> <endpoint1> [endpoint2] ...
  if (args.length < 2) {
    console.log(
      JSON.stringify({
        error:
          "Usage: node bundle-endpoints.js <baseDir> <endpoint1> [endpoint2] ...\n       node bundle-endpoints.js --script <scriptPath> [--sdk <sdkPath>]",
      })
    );
    process.exit(1);
  }

  const [baseDir, ...endpointNames] = args;
  return bundleEndpoints(baseDir, endpointNames);
}

main().catch((err) => {
  console.log(JSON.stringify({ error: err.message }));
  process.exit(1);
});
