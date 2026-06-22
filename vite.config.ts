import tailwindcss from "@tailwindcss/vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const config = defineConfig({
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
  test: {
    exclude: [
      "**/.{cache,git,output,temp}/**",
      "**/dist/**",
      "**/node_modules/**",
      "tests/browser/**",
    ],
  },
});

export default config;
