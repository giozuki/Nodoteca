import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative URLs: extension pages live at chrome-extension://<id>/
  base: "./",
  envDir: "../..",
  // The popup reuses the web app's data layer, components and styles.
  resolve: { alias: { "@web": fileURLToPath(new URL("../web/src", import.meta.url)) } },
  // Implicit flow: the sign-in link carries the session in the URL fragment, which
  // connect-extension.html forwards to us (PKCE would need our storage on that page).
  define: { "import.meta.env.VITE_AUTH_FLOW": JSON.stringify("implicit") },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: fileURLToPath(new URL("popup.html", import.meta.url)),
        background: fileURLToPath(new URL("src/background.ts", import.meta.url)),
      },
      // manifest.json points at a fixed name for the service worker.
      output: { entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js") },
    },
  },
});
