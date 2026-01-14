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
 */

import * as esbuild from 'esbuild';
import * as path from 'path';

/**
 * Create an esbuild plugin that resolves SDK aliases and rewrites zod imports
 * Maps 'zite-integrations-backend-sdk' -> './__zite__/integrations.ts'
 * Maps 'zod' -> '__zod_external__' (resolved by cloudflare-lambda Worker Loader)
 */
function createAliasPlugin(baseDir) {
  return {
    name: 'zite-alias',
    setup(build) {
      // Handle zite-integrations-backend-sdk alias
      build.onResolve({ filter: /^zite-integrations-backend-sdk$/ }, () => ({
        path: path.resolve(baseDir, 'src/__zite__/integrations.ts'),
      }));

      // Rewrite 'zod' imports to './__zod__.js' which cloudflare-lambda provides
      build.onResolve({ filter: /^zod$/ }, () => ({
        path: './__zod__.js',
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
        platform: 'browser',
        // Note: zod is externalized via the alias plugin (rewrites to './__zod__.js')
        // cloudflare-lambda provides './__zod__.js' as a Worker Loader module
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
