import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The site is fully static: there is no API to proxy to. `vite preview` serves the
// build with the same security headers Vercel applies (from vercel.json), so the
// Content-Security-Policy can be checked locally before deploying.
const vercel = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8"));
const siteHeaders: Record<string, string> = Object.fromEntries(
  vercel.headers[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]),
);

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173, headers: siteHeaders },
});
