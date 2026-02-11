import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { ziteId } from "./ziteId";
import { insertHtml, h } from "vite-plugin-insert-html";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
);

const pkgDeps = Object.keys(pkg.dependencies)
  // Need to exclude @tiptap/pm from optimization, since it doesn't have a top level entry point
  .filter(dep => dep !== '@tiptap/pm');

/**
 * Vite's main focus is on startup speed, so it doesn't check your package.json to see which dependencies you have at startup.
 * When it spots a file that imports a dependency, it optimizes that dependency on the fly and reloads the page. If I use something
 * that relies on another dependency, like lucide-react depending on react, it has to optimize lucide first and then reoptimize react
 * since lucide depends on react. It might have tree-shaken something lucide was using.
 *
 * This works fine in local development because it sends the websocket events quickly. But I noticed that if there's a decent gap
 * between the HMR update event and the HMR full-reload event (over ~500ms), it tries to use the new dependencies before the page reloads.
 * React throws an "invalid hook call" error in this case because there are now two different versions of react in play—the one it
 * initially rendered with and the newly optimized version.
 *
 * So we force Vite optimize all dependencies upfront at startup. This way, we avoid having to reoptimize dependencies on file
 * changes and reload the page. Since we have so few dependencies, the impact on startup speed is minimal.
 */
const deps = new Set([
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom/client",
  ...pkgDeps,
]);

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    allowedHosts: [".zite-sandbox.com", ".zite-dev-sandbox.com"],
  },
  legacy: {
    skipWebSocketTokenCheck: true,
  },
  optimizeDeps: {
    include: [...deps],
  },
  plugins: [
    react(),
    insertHtml({
      headPrepend: [h("script", { src: "https://zite.com/app-runtime.js" })],
    }),
    ziteId(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@zite": path.resolve(__dirname, "./src/__zite__"),
      "zite-endpoints-sdk": path.resolve(__dirname, "./src/__zite__/sdk.ts"),
      "zite-auth-sdk": path.resolve(__dirname, "./src/__zite__/auth.ts"),
      "zite-file-upload-sdk": path.resolve(
        __dirname,
        "./src/__zite__/fileUpload.ts"
      ),
      "zite-integrations-backend-sdk": path.resolve(
        __dirname,
        "./src/__zite__/integrations.ts"
      ),
    },
  },
});
