/**
 * Bundle endpoints or one-off scripts using esbuild's in-memory API
 *
 * Endpoint mode (default):
 *   node scripts/bundle-endpoints.js <baseDir> <endpoint1> <endpoint2> ...
 *   Bundles src/api/*.ts endpoints with SDK resolved from src/__zite__/integrations.ts
 *
 * Script mode:
 *   node scripts/bundle-endpoints.js --script <scriptPath> [--sdk <sdkPath>]
 *   Bundles a single script file. Blocks relative/local imports for security.
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

import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Shared config — single source of truth for esbuild aliases and externals
// ============================================================================

/**
 * Node.js built-ins to externalize (CF Workers provides these via nodejs_compat)
 */
const _NODE_BUILTIN_NAMES = [
  'http', 'https', 'http2', 'stream', 'buffer', 'util', 'events', 'crypto',
  'path', 'fs', 'url', 'querystring', 'zlib', 'net', 'tls', 'os',
  'assert', 'process', 'child_process', 'cluster', 'dgram', 'dns',
  'inspector', 'module', 'perf_hooks', 'readline', 'repl',
  'string_decoder', 'timers', 'tty', 'v8', 'vm', 'worker_threads',
  'async_hooks', 'trace_events', 'punycode',
];

/** Externalize both 'fs' and 'node:fs' forms */
const NODE_BUILTINS = _NODE_BUILTIN_NAMES.flatMap(m => [m, `node:${m}`]);

/**
 * Pre-bundled libraries provided by cloudflare-lambda as Worker Loader modules
 * These are lazily loaded on demand to minimize cold starts
 * Maps npm package names to the module filenames in cloudflare-lambda
 */
const PREBUNDLED_LIBS = {
  // Zite runtime - always loaded (log collector, helpers, ZiteError, createEndpoint)
  '@zite/endpoints-runtime-sdk': '__zite-runtime__.js',
  // Zod - always loaded (small, commonly used for validation)
  'zod': '__zod__.js',
  // SDK libraries - lazily loaded based on app's integrations
  'openai': '__openai__.js',
  '@anthropic-ai/sdk': '__anthropic__.js',
  'stripe': '__stripe__.js',
  'airtable': '__airtable__.js',
  '@notionhq/client': '__notion__.js',
  '@slack/web-api': '__slack__.js',
  'googleapis': '__googleapis__.js',
  '@mailchimp/mailchimp_marketing': '__mailchimp__.js',
  '@hubspot/api-client': '__hubspot__.js',
  '@linear/sdk': '__linear__.js',
  '@microsoft/microsoft-graph-client': '__microsoft-graph__.js',
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
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  external: NODE_BUILTINS,
  mainFields: ['module', 'main'],
  conditions: ['worker', 'browser', 'import', 'default'],
};

// ============================================================================
// Endpoint mode — bundles src/api/*.ts files
// ============================================================================

/**
 * Create an esbuild plugin for endpoint bundling.
 * Resolves SDK and pre-bundled library imports.
 * Allows relative imports (endpoints can import from src/utils/ etc.)
 */
function createEndpointAliasPlugin(baseDir) {
  return {
    name: 'zite-alias',
    setup(build) {
      // Handle zite-integrations-backend-sdk alias
      build.onResolve({ filter: /^zite-integrations-backend-sdk$/ }, () => ({
        path: path.resolve(baseDir, 'src/__zite__/integrations.ts'),
      }));

      // Rewrite pre-bundled library imports to Worker Loader module paths
      for (const [pkgName, modulePath] of Object.entries(PREBUNDLED_LIBS)) {
        const escapedName = pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  const aliasPlugin = createEndpointAliasPlugin(baseDir);

  for (const name of endpointNames) {
    const wrapperCode = `
import * as sdk from './__zite__/integrations';
Object.assign(globalThis, sdk);
import endpoint from './api/${name}';
globalThis.__endpoint = endpoint;
`;

    try {
      const result = await esbuild.build({
        ...BASE_BUILD_OPTIONS,
        stdin: {
          contents: wrapperCode,
          resolveDir: `${baseDir}/src`,
          loader: 'ts',
        },
        logLevel: 'warning',
        plugins: [aliasPlugin],
      });

      if (result.warnings && result.warnings.length > 0) {
        const warningMessages = result.warnings.map(w =>
          `${w.location?.file || 'unknown'}:${w.location?.line || '?'} - ${w.text}`
        );
        endpointErrors[name] = `Warnings: ${warningMessages.join('; ')}`;
      }

      if (result.outputFiles && result.outputFiles.length > 0) {
        bundledEndpoints[name] = result.outputFiles[0].text;
      } else {
        endpointErrors[name] = 'No output generated';
      }
    } catch (err) {
      if (err.errors && Array.isArray(err.errors)) {
        const errorMessages = err.errors.map(e => {
          const loc = e.location
            ? `${e.location.file || 'unknown'}:${e.location.line || '?'}:${e.location.column || '?'}`
            : 'unknown';
          return `${loc} - ${e.text}`;
        });
        endpointErrors[name] = errorMessages.join('\n');
      } else {
        endpointErrors[name] = err.message;
      }
    }
  }

  console.log(JSON.stringify({
    bundledEndpoints,
    endpointErrors: Object.keys(endpointErrors).length > 0 ? endpointErrors : undefined,
  }));
}

// ============================================================================
// Script mode — bundles a single one-off script
// ============================================================================

/**
 * Create an esbuild plugin for script bundling.
 * Resolves SDK and pre-bundled library imports, but BLOCKS relative/local imports
 * for security (scripts shouldn't read files from the sandbox filesystem).
 */
function createScriptPlugin(sdkPath) {
  // Build the set of allowed import specifiers
  const allowedImports = new Set([
    ...Object.keys(PREBUNDLED_LIBS),
    ...Object.values(PREBUNDLED_LIBS).map(m => `./${m}`),
    ...NODE_BUILTINS,
  ]);

  if (sdkPath) {
    allowedImports.add('zite-integrations-backend-sdk');
  }

  return {
    name: 'zite-script-alias',
    setup(build) {
      // Handle SDK alias — resolve to temp file if provided, otherwise externalize
      build.onResolve({ filter: /^zite-integrations-backend-sdk$/ }, () => {
        if (sdkPath) {
          return { path: path.resolve(sdkPath) };
        }
        return { path: 'zite-integrations-backend-sdk', external: true };
      });

      // Rewrite pre-bundled library imports to Worker Loader module paths
      for (const [pkgName, modulePath] of Object.entries(PREBUNDLED_LIBS)) {
        const escapedName = pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const filter = new RegExp(`^${escapedName}$`);
        build.onResolve({ filter }, () => ({
          path: `./${modulePath}`,
          external: true,
        }));
      }

      // Block all other non-entry imports (security: prevent filesystem access)
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') return undefined;
        if (allowedImports.has(args.path)) return undefined;

        // Allow sub-path imports of allowed packages (e.g. 'googleapis/v4')
        for (const allowed of allowedImports) {
          if (args.path.startsWith(allowed + '/')) return undefined;
        }

        return {
          errors: [{
            text: `Import "${args.path}" is not allowed. Scripts can only import from integration SDK packages.`,
          }],
        };
      });
    },
  };
}

/**
 * Wrap esbuild's bundled output as an endpoint module for the CF Worker.
 * The Worker expects `globalThis.__endpoint` with an `execute` method.
 *
 * We split on esbuild's OUTPUT (not user code) — esbuild always generates
 * import statements in a deterministic single-line format at the top of the
 * file, so this split is safe and reliable.
 */
function wrapBundledAsEndpoint(bundledCode) {
  const lines = bundledCode.split('\n');

  // esbuild puts all imports at the top in single-line format:
  //   import x from "./module.js";
  //   import {a, b} from "./module.js";
  let lastImportLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith('import ') || trimmed.startsWith('import{')) {
      lastImportLine = i;
    } else if (trimmed.startsWith('//') || trimmed.length === 0) {
      // Skip comments (e.g. esbuild's "// <stdin>") and blank lines
      continue;
    } else {
      // First real non-import line — all imports are above
      break;
    }
  }

  const importSection = lines.slice(0, lastImportLine + 1).join('\n');
  const bodySection = lines.slice(lastImportLine + 1).join('\n    ');

  return `${importSection}

const __scriptModule = {
  async execute() {
    ${bodySection}
  }
};

globalThis.__endpoint = { execute: __scriptModule.execute };
`;
}

async function bundleOneOffScript(scriptPath, sdkPath) {
  const rawScript = fs.readFileSync(scriptPath, 'utf-8');
  const plugin = createScriptPlugin(sdkPath);

  try {
    // Pass 1: Bundle the raw user script — resolves TS, inlines non-externals,
    // rewrites pre-bundled libs to worker module paths.
    const result = await esbuild.build({
      ...BASE_BUILD_OPTIONS,
      stdin: {
        contents: rawScript,
        loader: 'ts',
        resolveDir: '/workspace',
      },
      minify: false,
      logLevel: 'silent',
      plugins: [plugin],
    });

    if (result.errors.length > 0) {
      console.log(JSON.stringify({
        error: result.errors.map(e => e.text).join('\n'),
      }));
      process.exit(1);
    }

    if (!result.outputFiles || result.outputFiles.length === 0) {
      console.log(JSON.stringify({ error: 'esbuild produced no output' }));
      process.exit(1);
    }

    // Pass 2: Wrap the bundled output — split esbuild's deterministic import
    // lines from the body, then wrap the body in async execute().
    const bundledCode = wrapBundledAsEndpoint(result.outputFiles[0].text);
    console.log(JSON.stringify({ bundledCode }));
  } catch (err) {
    if (err.errors && Array.isArray(err.errors)) {
      const errorMessages = err.errors.map(e => {
        const loc = e.location
          ? `${e.location.file || 'unknown'}:${e.location.line || '?'}`
          : 'unknown';
        return `${loc} - ${e.text}`;
      });
      console.log(JSON.stringify({ error: errorMessages.join('\n') }));
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
  const scriptFlagIndex = args.indexOf('--script');
  if (scriptFlagIndex !== -1) {
    const scriptPath = args[scriptFlagIndex + 1];
    if (!scriptPath) {
      console.log(JSON.stringify({ error: 'Usage: --script <scriptPath> [--sdk <sdkPath>]' }));
      process.exit(1);
    }

    const sdkFlagIndex = args.indexOf('--sdk');
    const sdkPath = sdkFlagIndex !== -1 ? args[sdkFlagIndex + 1] : undefined;

    return bundleOneOffScript(scriptPath, sdkPath);
  }

  // Endpoint mode: <baseDir> <endpoint1> [endpoint2] ...
  if (args.length < 2) {
    console.log(JSON.stringify({
      error: 'Usage: node bundle-endpoints.js <baseDir> <endpoint1> [endpoint2] ...\n       node bundle-endpoints.js --script <scriptPath> [--sdk <sdkPath>]'
    }));
    process.exit(1);
  }

  const [baseDir, ...endpointNames] = args;
  return bundleEndpoints(baseDir, endpointNames);
}

main().catch(err => {
  console.log(JSON.stringify({ error: err.message }));
  process.exit(1);
});
