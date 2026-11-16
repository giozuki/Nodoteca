import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The single .env lives at the repo root, shared by every app.
  envDir: "../..",
  // Port 3000 matches Supabase's default Site URL, so sign-in links work out of the box.
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
});
