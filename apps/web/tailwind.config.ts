import baseConfig from "@ai-tutor/tailwind-config";
import type { Config } from "tailwindcss";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config: Config = {
  ...baseConfig,
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    path.resolve(__dirname, "../../packages/ui/**/*.{js,ts,jsx,tsx}"),
  ],
};

export default config;
