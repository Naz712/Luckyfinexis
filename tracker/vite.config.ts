import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The config runs under Node; this keeps the project free of @types/node just for one env read.
declare const process: { env: Record<string, string | undefined> };

// VITE_BASE lets the GitHub Pages build live under /Luckyfinexis/; local dev and the single-file build stay at "/".
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react(), tailwindcss()],
});
