import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        passWithNoTests: true,
        pool: "threads",
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
        },
        include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    },
});
