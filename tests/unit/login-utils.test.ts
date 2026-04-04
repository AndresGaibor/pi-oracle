import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
    classifyChatPage,
    type PageState,
} from "../../extensions/oracle/shared/login-utils";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSnapshot(name: string): string {
    return readFileSync(join(__dirname, "../fixtures/snapshots", name), "utf-8");
}

describe("classifyChatPage", () => {
    it("detects challenge_blocking page", () => {
        const snapshot = loadSnapshot("challenge-page.snapshot.txt");
        const result = classifyChatPage({
            snapshot,
            url: "https://chatgpt.com/",
            body: "Just a moment... Verify you are human",
            chatUrl: "https://chatgpt.com/",
        });
        expect(result.state).toBe("challenge_blocking");
    });

    it("detects transient_outage_error page", () => {
        const snapshot = loadSnapshot("outage-page.snapshot.txt");
        const result = classifyChatPage({
            snapshot,
            url: "https://chatgpt.com/",
            body: "Something went wrong — a network error occurred",
            chatUrl: "https://chatgpt.com/",
        });
        expect(result.state).toBe("transient_outage_error");
    });

    it("detects login_required when on auth path", () => {
        const snapshot = loadSnapshot("login-page.snapshot.txt");
        const result = classifyChatPage({
            snapshot,
            url: "https://chatgpt.com/auth/login",
            body: "Log in to your account",
            chatUrl: "https://chatgpt.com/",
        });
        expect(result.state).toBe("login_required");
    });

    it("detects login_required when probe returns 401", () => {
        const snapshot = loadSnapshot("login-page.snapshot.txt");
        const result = classifyChatPage({
            snapshot,
            url: "https://chatgpt.com/",
            body: "",
            chatUrl: "https://chatgpt.com/",
            probe: {
                ok: false,
                status: 401,
                domLoginCta: false,
                onAuthPage: false,
                bodyKeys: [],
                bodyHasId: false,
                bodyHasEmail: false,
            },
        });
        expect(result.state).toBe("login_required");
    });

    it("detects login_required when probe returns 403", () => {
        const result = classifyChatPage({
            snapshot: "",
            url: "https://chatgpt.com/",
            body: "",
            chatUrl: "https://chatgpt.com/",
            probe: {
                ok: false,
                status: 403,
                domLoginCta: false,
                onAuthPage: false,
                bodyKeys: [],
                bodyHasId: false,
                bodyHasEmail: false,
            },
        });
        expect(result.state).toBe("login_required");
    });

    it("returns unknown for unexpected URL", () => {
        const result = classifyChatPage({
            snapshot: "",
            url: "https://some-other-site.com/",
            body: "",
            chatUrl: "https://chatgpt.com/",
        });
        expect(result.state).toBe("unknown");
    });

    it("returns unknown when unable to determine state", () => {
        const result = classifyChatPage({
            snapshot: "",
            url: "https://chatgpt.com/",
            body: "",
            chatUrl: "https://chatgpt.com/",
        });
        expect(result.state).toBe("unknown");
    });

    it("detects auth_transitioning when on auth page with bodyHasId", () => {
        const result = classifyChatPage({
            snapshot: "",
            url: "https://chatgpt.com/auth/login",
            body: "",
            chatUrl: "https://chatgpt.com/",
            probe: {
                ok: false,
                status: 200,
                domLoginCta: false,
                onAuthPage: true,
                bodyKeys: ["id"],
                bodyHasId: true,
                bodyHasEmail: false,
            },
        });
        expect(result.state).toBe("auth_transitioning");
    });

    it("detects auth_transitioning when on auth page with bodyHasEmail", () => {
        const result = classifyChatPage({
            snapshot: "",
            url: "https://chatgpt.com/auth/login",
            body: "",
            chatUrl: "https://chatgpt.com/",
            probe: {
                ok: false,
                status: 200,
                domLoginCta: false,
                onAuthPage: true,
                bodyKeys: ["email"],
                bodyHasId: false,
                bodyHasEmail: true,
            },
        });
        expect(result.state).toBe("auth_transitioning");
    });
});
