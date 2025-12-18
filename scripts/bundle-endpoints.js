/**
 * Bundle endpoints using esbuild's in-memory API
 *
 * Usage: node scripts/bundle-endpoints.js <baseDir> <endpoint1> <endpoint2> ...
 *
 * Output: JSON object with bundled code keyed by endpoint name
 * { "getUsers": "bundled code...", "createUser": "bundled code..." }
 *
 * Errors are output as JSON: { "error": "message" }
 */

import * as esbuild from 'esbuild';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(JSON.stringify({
      error: 'Usage: node bundle-endpoints.js <baseDir> <endpoint1> [endpoint2] ...'
    }));
    process.exit(1);
  }

  const [baseDir, ...endpointNames] = args;
  const results = {};
  const errors = [];

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
        logLevel: 'silent',
      });

      if (result.outputFiles && result.outputFiles.length > 0) {
        results[name] = result.outputFiles[0].text;
      } else {
        errors.push(`${name}: No output generated`);
      }
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }

  // Output results
  if (errors.length > 0 && Object.keys(results).length === 0) {
    // All failed
    console.log(JSON.stringify({ error: errors.join('; ') }));
    process.exit(1);
  }

  // Return results (partial success is ok - some endpoints might not exist yet)
  console.log(JSON.stringify({
    bundledEndpoints: results,
    ...(errors.length > 0 ? { warnings: errors } : {}),
  }));
}

main().catch(err => {
  console.log(JSON.stringify({ error: err.message }));
  process.exit(1);
});
