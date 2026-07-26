import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["**/dist/**", "**/*.d.ts"],
      provider: "v8",
      reporter: ["text", "html"],
    },
    include: ["packages/**/*.test.ts"],
    passWithNoTests: false,
    restoreMocks: true,
  },
});
