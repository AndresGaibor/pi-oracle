import { describe, it, expect, vi } from "vitest";

// Mock the pi-coding-agent dependency before importing config
vi.mock("@mariozechner/pi-coding-agent", () => ({
    getAgentDir: () => "/mock/agent/dir",
}));

const {
    MODEL_FAMILIES,
    EFFORTS,
    BROWSER_RUN_MODES,
    CLONE_STRATEGIES,
    DEFAULT_CONFIG,
} = await import("../../extensions/oracle/lib/config");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("MODEL_FAMILIES", () => {
    it("includes instant, thinking, pro", () => {
        expect(MODEL_FAMILIES).toStrictEqual(["instant", "thinking", "pro"]);
    });
});

describe("EFFORTS", () => {
    it("includes light, standard, extended, heavy", () => {
        expect(EFFORTS).toStrictEqual(["light", "standard", "extended", "heavy"]);
    });
});

describe("BROWSER_RUN_MODES", () => {
    it("includes headless and headed", () => {
        expect(BROWSER_RUN_MODES).toStrictEqual(["headless", "headed"]);
    });
});

describe("CLONE_STRATEGIES", () => {
    it("includes apfs-clone and copy", () => {
        expect(CLONE_STRATEGIES).toStrictEqual(["apfs-clone", "copy"]);
    });
});

// ---------------------------------------------------------------------------
// DEFAULT_CONFIG
// ---------------------------------------------------------------------------
describe("DEFAULT_CONFIG", () => {
    it("has defaults for model family and effort", () => {
        expect(DEFAULT_CONFIG.defaults.modelFamily).toBe("pro");
        expect(DEFAULT_CONFIG.defaults.effort).toBe("extended");
        expect(DEFAULT_CONFIG.defaults.autoSwitchToThinking).toBe(false);
    });

    it("has browser config", () => {
        expect(DEFAULT_CONFIG.browser.sessionPrefix).toBe("oracle");
        expect(DEFAULT_CONFIG.browser.maxConcurrentJobs).toBe(2);
        // cloneStrategy is platform-dependent: apfs-clone on macOS, copy elsewhere
        const expectedCloneStrategy = process.platform === "darwin" ? "apfs-clone" : "copy";
        expect(DEFAULT_CONFIG.browser.cloneStrategy).toBe(expectedCloneStrategy);
        expect(DEFAULT_CONFIG.browser.chatUrl).toBe("https://chatgpt.com/");
        expect(DEFAULT_CONFIG.browser.authUrl).toBe("https://chatgpt.com/auth/login");
        expect(DEFAULT_CONFIG.browser.runMode).toBe("headless");
        expect(Array.isArray(DEFAULT_CONFIG.browser.args)).toBe(true);
    });


    it("has auth config", () => {
        expect(DEFAULT_CONFIG.auth.pollMs).toBe(1000);
        expect(DEFAULT_CONFIG.auth.bootstrapTimeoutMs).toBe(10 * 60 * 1000);
    });

    it("has worker config", () => {
        expect(DEFAULT_CONFIG.worker.pollMs).toBe(5000);
        expect(DEFAULT_CONFIG.worker.completionTimeoutMs).toBe(90 * 60 * 1000);
    });

    it("has poller config", () => {
        expect(DEFAULT_CONFIG.poller.intervalMs).toBe(5000);
    });

    it("has artifacts config", () => {
        expect(DEFAULT_CONFIG.artifacts.capture).toBe(true);
    });

    it("has cleanup config", () => {
        expect(DEFAULT_CONFIG.cleanup.completeJobRetentionMs).toBe(14 * 24 * 60 * 60 * 1000);
        expect(DEFAULT_CONFIG.cleanup.failedJobRetentionMs).toBe(30 * 24 * 60 * 60 * 1000);
    });
});
