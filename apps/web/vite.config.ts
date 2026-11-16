import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // "/" locally; "/Nodoteca/" on GitHub Pages (set by the deploy workflow).
  base: process.env.NODOTECA_BASE ?? "/",
  // The single .env lives at the repo root, shared by every app.
  envDir: "../..",
  // Port 3000 matches Supabase's default Site URL, so sign-in links work out of the box.
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
});
