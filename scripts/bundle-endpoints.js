/**
 * Bundle endpoints using esbuild's in-memory API
 *
 * Usage: node scripts/bundle-endpoints.js <baseDir> <endpoint1> <endpoint2> ...
 *
 * Output: JSON object with bundled code and per-endpoint errors
 * {
 *   "bundledEndpoints": { "getUsers": "bundled code...", "createUser": "bundled code..." },
 *   "endpointErrors": { "brokenEndpoint": "Error message..." }
 * }
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

/**
 * Node.js built-ins to externalize (CF Workers provides these via nodejs_compat)
 */
const NODE_BUILTINS = [
  'http', 'https', 'http2', 'stream', 'buffer', 'util', 'events', 'crypto',
  'path', 'fs', 'url', 'querystring', 'zlib', 'net', 'tls', 'os',
  'assert', 'process', 'child_process', 'cluster', 'dgram', 'dns',
  'inspector', 'module', 'perf_hooks', 'readline', 'repl',
  'string_decoder', 'timers', 'tty', 'v8', 'vm', 'worker_threads',
  'async_hooks', 'trace_events', 'punycode',
];

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

/**
 * Create an esbuild plugin that resolves SDK aliases and rewrites external imports
 * Maps 'zite-integrations-backend-sdk' -> './__zite__/integrations.ts'
 * Maps pre-bundled libs to their Worker Loader module paths (e.g., 'zod' -> './__zod__.js')
 * Maps '@fillout/zite-lambda-sdk' -> './__zite-lambda-sdk__.js' (pre-installed in E2B sandbox)
 */
function createAliasPlugin(baseDir) {
  return {
    name: 'zite-alias',
    setup(build) {
      // Handle zite-integrations-backend-sdk alias
      build.onResolve({ filter: /^zite-integrations-backend-sdk$/ }, () => ({
        path: path.resolve(baseDir, 'src/__zite__/integrations.ts'),
      }));

      // Rewrite pre-bundled library imports to Worker Loader module paths
      // cloudflare-lambda provides these as modules (e.g., '__zod__.js', '__openai__.js')
      for (const [pkgName, modulePath] of Object.entries(PREBUNDLED_LIBS)) {
        // Escape special regex characters in package names (e.g., @, /)
        const escapedName = pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const filter = new RegExp(`^${escapedName}$`);
        build.onResolve({ filter }, () => ({
          path: `./${modulePath}`,
          external: true,
        }));
      }

      // Rewrite '@fillout/zite-lambda-sdk' imports - externalized for E2B execution
      // The shim file re-exports from the actual package which is pre-installed in E2B
      build.onResolve({ filter: /^@fillout\/zite-lambda-sdk$/ }, () => ({
        path: './__zite-lambda-sdk__.js',
        external: true,
      }));
    },
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(JSON.stringify({
      error: 'Usage: node bundle-endpoints.js <baseDir> <endpoint1> [endpoint2] ...'
    }));
    process.exit(1);
  }

  const [baseDir, ...endpointNames] = args;
  const bundledEndpoints = {};
  const endpointErrors = {};

  // Create alias plugin once for all endpoints
  const aliasPlugin = createAliasPlugin(baseDir);

  for (const name of endpointNames) {
    // Create wrapper that imports SDK and endpoint
    // Paths are relative to resolveDir which is ${baseDir}/src
    const wrapperCode = `
import * as sdk from './__zite__/integrations';
Object.assign(globalThis, sdk);
import endpoint from './api/${name}';
globalThis.__endpoint = endpoint;
`;

    try {
      const result = await esbuild.build({
        stdin: {
          contents: wrapperCode,
          resolveDir: `${baseDir}/src`,
          loader: 'ts',
        },
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'neutral',
        target: 'es2022',
        // Externalize Node.js built-ins (CF Workers provides these via nodejs_compat)
        external: NODE_BUILTINS,
        // Prefer ESM exports when available
        mainFields: ['module', 'main'],
        conditions: ['worker', 'browser', 'import', 'default'],
        // Don't suppress errors - capture them for debugging
        logLevel: 'warning',
        plugins: [aliasPlugin],
      });

      // Capture any warnings from esbuild (treat as errors for visibility)
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
      // esbuild throws on errors - format them nicely
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

  // Always return results - endpointErrors will contain any failures per-endpoint
  console.log(JSON.stringify({
    bundledEndpoints,
    endpointErrors: Object.keys(endpointErrors).length > 0 ? endpointErrors : undefined,
  }));
}

main().catch(err => {
  console.log(JSON.stringify({ error: err.message }));
  process.exit(1);
});
