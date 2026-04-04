import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
    isOnAuthPage,
    detectChallenge,
    detectOutage,
    getLoginProbeScript,
    parseLoginProbeResult,
    hasLoginCta,
    hasComposer,
} from "../../extensions/oracle/pages/chatgpt/chatgpt-auth.assertions";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSnapshot(name: string): string {
    return readFileSync(join(__dirname, "../fixtures/snapshots", name), "utf-8");
}

// ---------------------------------------------------------------------------
// isOnAuthPage
// ---------------------------------------------------------------------------
describe("isOnAuthPage", () => {
    it("returns true for /auth/login path", () => {
        expect(isOnAuthPage("https://chatgpt.com/auth/login")).toBe(true);
    });

    it("returns true for /auth/signin path", () => {
        expect(isOnAuthPage("https://chatgpt.com/auth/signin")).toBe(true);
    });

    it("returns true for auth.openai.com hostname", () => {
        expect(isOnAuthPage("https://auth.openai.com/authorize")).toBe(true);
    });

    it("returns false for regular chat URL", () => {
        expect(isOnAuthPage("https://chatgpt.com/")).toBe(false);
    });

    it("returns false for a conversation URL", () => {
        expect(isOnAuthPage("https://chatgpt.com/c/abc123")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// detectChallenge
// ---------------------------------------------------------------------------
describe("detectChallenge", () => {
    it("detects Cloudflare challenge", () => {
        const result = detectChallenge("Just a moment... please wait");
        expect(result.detected).toBe(true);
        expect(result.type).toBe("cloudflare");
    });

    it("detects human verification", () => {
        const result = detectChallenge("Verify you are human before proceeding");
        expect(result.detected).toBe(true);
        expect(result.type).toBe("human-verification");
    });

    it("detects CAPTCHA", () => {
        const result = detectChallenge("Please complete the captcha challenge");
        expect(result.detected).toBe(true);
        expect(result.type).toBe("captcha");
    });

    it("detects suspicious activity patterns", () => {
        const result = detectChallenge("We detect suspicious activity on your account");
        expect(result.detected).toBe(true);
    });

    it("returns false for normal text", () => {
        const result = detectChallenge("Hello ChatGPT!");
        expect(result.detected).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// detectOutage
// ---------------------------------------------------------------------------
describe("detectOutage", () => {
    it("detects generic error", () => {
        const result = detectOutage("Something went wrong. Please try again.");
        expect(result.detected).toBe(true);
        expect(result.type).toBe("generic-error");
    });

    it("detects network error", () => {
        const result = detectOutage("A network error occurred while connecting");
        expect(result.detected).toBe(true);
        expect(result.type).toBe("network-error");
    });

    it("detects websocket error", () => {
        const result = detectOutage("An error occurred while connecting to the websocket");
        expect(result.detected).toBe(true);
        expect(result.type).toBe("websocket-error");
    });

    it("detects rate limit", () => {
        const result = detectOutage("Rate limit exceeded. Please try again later.");
        expect(result.detected).toBe(true);
        expect(result.type).toBe("rate-limit");
    });

    it("returns false for normal text", () => {
        const result = detectOutage("Hello world");
        expect(result.detected).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// getLoginProbeScript
// ---------------------------------------------------------------------------
describe("getLoginProbeScript", () => {
    it("returns a non-empty script string", () => {
        const script = getLoginProbeScript();
        expect(typeof script).toBe("string");
        expect(script.length).toBeGreaterThan(0);
    });

    it("includes the expected endpoint URL fragment", () => {
        const script = getLoginProbeScript();
        expect(script).toContain("/backend-api/me");
    });

    it("uses custom timeout when provided", () => {
        const script = getLoginProbeScript(3000);
        expect(script).toContain("3000");
    });
});

// ---------------------------------------------------------------------------
// parseLoginProbeResult
// ---------------------------------------------------------------------------
describe("parseLoginProbeResult", () => {
    it("parses a valid successful probe result", () => {
        const input = {
            ok: true,
            status: 200,
            pageUrl: "https://chatgpt.com/",
            domLoginCta: false,
            onAuthPage: false,
            bodyKeys: ["id", "email"],
            bodyHasId: true,
            bodyHasEmail: true,
        };
        const result = parseLoginProbeResult(input);
        expect(result).not.toBeNull();
        expect(result!.ok).toBe(true);
        expect(result!.status).toBe(200);
        expect(result!.bodyHasId).toBe(true);
        expect(result!.bodyHasEmail).toBe(true);
    });

    it("parses a failed probe result", () => {
        const input = {
            ok: false,
            status: 401,
            domLoginCta: true,
            onAuthPage: true,
            bodyKeys: [],
            bodyHasId: false,
            bodyHasEmail: false,
            error: "Unauthorized",
        };
        const result = parseLoginProbeResult(input);
        expect(result).not.toBeNull();
        expect(result!.ok).toBe(false);
        expect(result!.status).toBe(401);
    });

    it("returns null for null input", () => {
        expect(parseLoginProbeResult(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
        expect(parseLoginProbeResult(undefined)).toBeNull();
    });

    it("returns null for primitive input", () => {
        expect(parseLoginProbeResult("test")).toBeNull();
        expect(parseLoginProbeResult(42)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// hasLoginCta
// ---------------------------------------------------------------------------
describe("hasLoginCta", () => {
    it("returns true when login link is present", () => {
        const snapshot = loadSnapshot("login-page.snapshot.txt");
        expect(hasLoginCta(snapshot)).toBe(true);
    });

    it("returns false for chat ready page", () => {
        const snapshot = loadSnapshot("chat-ready.snapshot.txt");
        expect(hasLoginCta(snapshot)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// hasComposer (auth version)
// ---------------------------------------------------------------------------
describe("hasComposer (auth)", () => {
    it("returns true when composer textbox with ChatGPT label is present", () => {
        // The auth version looks for specific composer labels
        const snapshot = [
            '- textbox "Chat with ChatGPT" ref=e1',
        ].join("\n");
        expect(hasComposer(snapshot)).toBe(true);
    });

    it("returns false when no matching composer textbox", () => {
        const snapshot = '- textbox "Email address" ref=e1';
        expect(hasComposer(snapshot)).toBe(false);
    });
});
