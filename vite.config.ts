import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const config = defineConfig({
  plugins: [tanstackStart(), viteReact()],
  test: {
    testTimeout: 30_000,
    exclude: [
      "archive/**",
      "**/.{cache,git,output,temp}/**",
      "**/dist/**",
      "**/node_modules/**",
      "tests/browser/**",
    ],
  },
});

export default config;
