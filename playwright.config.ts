import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/integration",
    timeout: 120_000,
    expect: {
        timeout: 30_000,
    },
    retries: 2,
    outputDir: "./test-results/playwright",
    reporter: [["html", { open: "never" }]],
    projects: [
        {
            name: "chatgpt",
            testMatch: /.*\.chatgpt\.spec\.ts$/,
            use: {
                ...devices["Desktop Chrome"],
                headless: false,
            },
        },
    ],
});
