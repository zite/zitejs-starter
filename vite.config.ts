import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { ziteId } from "./ziteId";
import { insertHtml, h } from "vite-plugin-insert-html";

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    insertHtml({
      headPrepend: [h("script", { src: "https://zite.com/app-runtime.js" })],
      // headPrepend: [
      //   h("script", { src: "http://localhost:2500/runtime/app-runtime.js" }),
      // ], // dom todo
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
    },
  },
});
