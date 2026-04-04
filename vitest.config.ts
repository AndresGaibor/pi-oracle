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
                "extensions/oracle/lib/**/*.ts",
                "extensions/oracle/pages/**/*.ts",
                "extensions/oracle/shared/**/*.ts",
            ],
            exclude: [
                "extensions/oracle/pages/**/chatgpt.page.ts",
                "extensions/oracle/pages/**/chatgpt-auth.page.ts",
                "extensions/oracle/pages/**/claude*.ts",
                "stubs/**",
                "tests/**",
            ],
            thresholds: {
                statements: 60,
                branches: 50,
                functions: 60,
                lines: 60,
            },
        },
        env: {
            NODE_ENV: "test",
        },
    },
});
