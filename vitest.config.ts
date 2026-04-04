import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: [
            "tests/unit/**/*.test.ts",
        ],
        testTimeout: 10_000,
        retry: 1,
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            include: [
                "extensions/oracle/shared/**/*.ts",
                "extensions/oracle/pages/chatgpt/**/*.ts",
                "extensions/oracle/pages/chatgpt-auth/**/*.ts",
                "extensions/oracle/pages/browser-actions.types.ts",
                "extensions/oracle/pages/ai-provider.types.ts",
            ],
            exclude: [
                "stubs/**",
                "tests/**",
                "**/*.page.ts",
            ],
            thresholds: {
                statements: 45,
                branches: 40,
                functions: 45,
                lines: 45,
            },
        },
        env: {
            NODE_ENV: "test",
        },
    },
});
