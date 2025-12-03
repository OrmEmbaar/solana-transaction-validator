import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // Global test settings
        globals: true,
        environment: "node",

        // Include patterns for different test types
        include: [
            "src/**/*.test.ts", // Unit tests
            "test/**/*.test.ts", // Integration tests
        ],

        // Test timeouts
        testTimeout: 10_000, // 10 seconds default
        hookTimeout: 10_000,

        // Coverage configuration (optional)
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            include: ["src/**/*.ts"],
            exclude: [
                "src/**/*.test.ts",
                "src/**/__tests__/**",
                "src/**/index.ts",
                "src/types.ts",
                "src/errors.ts",
            ],
        },
    },
});
