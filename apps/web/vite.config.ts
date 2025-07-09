import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@ai-tutor/ui": path.resolve(__dirname, "../../packages/ui"),
      "@ai-tutor/tailwind-config": path.resolve(
        __dirname,
        "../../packages/config/tailwind"
      ),
      "@ai-tutor/hooks": path.resolve(__dirname, "../../packages/hooks"),
      "@ai-tutor/utils": path.resolve(__dirname, "../../packages/utils"),
      "@ai-tutor/api-client": path.resolve(
        __dirname,
        "../../packages/api-client"
      ),
      "@ai-tutor/types": path.resolve(__dirname, "../../packages/types"),
    },
  },
  server: {
    port: 3000,
    host: true,
    fs: {
      allow: [".."], // required for monorepo access
    },
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
