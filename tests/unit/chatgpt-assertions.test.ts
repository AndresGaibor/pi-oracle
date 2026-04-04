import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
    hasComposer,
    canSend,
    hasAddFiles,
    hasModelSelector,
    hasStopButton,
    isResponseComplete,
    isStreamingActive,
    isThinkingModel,
    hasThinkingChip,
    getVisibleEffort,
    isEffortVisible,
    modelMatchesFamily,
    findArtifactCandidates,
    isLikelyArtifactLabel,
    preferredArtifactName,
    findModelButton,
    buildAssistantMessagesScript,
} from "../../extensions/oracle/pages/chatgpt/chatgpt.assertions";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSnapshot(name: string): string {
    return readFileSync(join(__dirname, "../fixtures/snapshots", name), "utf-8");
}

// ---------------------------------------------------------------------------
// isResponseComplete
// ---------------------------------------------------------------------------
describe("isResponseComplete", () => {
    it("returns true when snapshot has 'Copy response' and no 'Stop streaming'", () => {
        const snapshot = loadSnapshot("response-complete.snapshot.txt");
        expect(isResponseComplete(snapshot)).toBe(true);
    });

    it("returns false when snapshot has 'Stop streaming'", () => {
        const snapshot = loadSnapshot("response-in-progress.snapshot.txt");
        expect(isResponseComplete(snapshot)).toBe(false);
    });

    it("returns false for empty snapshot", () => {
        expect(isResponseComplete("")).toBe(false);
    });

    it("returns false when neither copy nor stop present", () => {
        expect(isResponseComplete('- heading "Hello" ref=e1')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// isStreamingActive
// ---------------------------------------------------------------------------
describe("isStreamingActive", () => {
    it("detects streaming when 'Stop streaming' button exists", () => {
        const snapshot = loadSnapshot("response-in-progress.snapshot.txt");
        expect(isStreamingActive(snapshot)).toBe(true);
    });

    it("returns false when response is complete (no stop button)", () => {
        const snapshot = loadSnapshot("response-complete.snapshot.txt");
        expect(isStreamingActive(snapshot)).toBe(false);
    });

    it("returns false for empty snapshot", () => {
        expect(isStreamingActive("")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// isThinkingModel
// ---------------------------------------------------------------------------
describe("isThinkingModel", () => {
    it("detects thinking when 'Thought for' is in snapshot", () => {
        const snapshot = loadSnapshot("response-complete.snapshot.txt");
        expect(isThinkingModel(snapshot)).toBe(true);
    });

    it("detects thinking when 'thinking' text is present", () => {
        const snapshot = loadSnapshot("response-in-progress.snapshot.txt");
        expect(isThinkingModel(snapshot)).toBe(true);
    });

    it("returns false for snapshots without thinking indicators", () => {
        expect(isThinkingModel('button "Copy response" ref=e1')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// hasComposer
// ---------------------------------------------------------------------------
describe("hasComposer", () => {
    it("returns true when composer textbox is present", () => {
        const snapshot = loadSnapshot("chat-ready.snapshot.txt");
        expect(hasComposer(snapshot)).toBe(true);
    });

    it("returns false for login page snapshot", () => {
        const snapshot = loadSnapshot("login-page.snapshot.txt");
        expect(hasComposer(snapshot)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// canSend
// ---------------------------------------------------------------------------
describe("canSend", () => {
    it("returns true when send button is not disabled", () => {
        // Build a snapshot with a non-disabled send button
        const snapshot = [
            '- textbox "Ask anything" ref=e10',
            '- button "Send prompt" ref=e20',
        ].join("\n");
        expect(canSend(snapshot)).toBe(true);
    });

    it("returns false when send button is disabled", () => {
        const snapshot = [
            '- textbox "Ask anything" ref=e10',
            '- button "Send prompt" ref=e20 disabled',
        ].join("\n");
        expect(canSend(snapshot)).toBe(false);
    });

    it("returns false when no send button exists", () => {
        const snapshot = loadSnapshot("login-page.snapshot.txt");
        expect(canSend(snapshot)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// hasAddFiles
// ---------------------------------------------------------------------------
describe("hasAddFiles", () => {
    it("returns true when add files button is present", () => {
        const snapshot = loadSnapshot("chat-ready.snapshot.txt");
        expect(hasAddFiles(snapshot)).toBe(true);
    });

    it("returns false for login page", () => {
        const snapshot = loadSnapshot("login-page.snapshot.txt");
        expect(hasAddFiles(snapshot)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// hasModelSelector
// ---------------------------------------------------------------------------
describe("hasModelSelector", () => {
    it("returns true when model selector button is present", () => {
        const snapshot = loadSnapshot("chat-ready.snapshot.txt");
        expect(hasModelSelector(snapshot)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// hasStopButton
// ---------------------------------------------------------------------------
describe("hasStopButton", () => {
    it("returns true when stop button is present", () => {
        const snapshot = loadSnapshot("response-in-progress.snapshot.txt");
        expect(hasStopButton(snapshot)).toBe(true);
    });

    it("returns false when no stop button exists", () => {
        const snapshot = loadSnapshot("chat-ready.snapshot.txt");
        expect(hasStopButton(snapshot)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// hasThinkingChip
// ---------------------------------------------------------------------------
describe("hasThinkingChip", () => {
    it("returns true when thinking effort chips are visible", () => {
        expect(hasThinkingChip('button "Standard thinking, click to remove" ref=e1')).toBe(true);
        expect(hasThinkingChip('button "Extended" ref=e1')).toBe(true);
    });

    it("returns false when no thinking chip patterns match", () => {
        expect(hasThinkingChip('button "Copy response" ref=e1')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// findModelButton
// ---------------------------------------------------------------------------
describe("findModelButton", () => {
    it("finds model button for a given family", () => {
        const snapshot = '- button "Instant" ref=e1\n- button "Pro Extended" ref=e2';
        const found = findModelButton(snapshot, "pro");
        expect(found).toBeDefined();
    });

    it("returns first button for unknown family (empty prefix matches all)", () => {
        // For unknown families, MODEL_FAMILY_PREFIX[family] is undefined,
        // which defaults to "" prefix, so any button matches.
        const snapshot = '- button "Instant" ref=e1';
        const found = findModelButton(snapshot, "nonexistent");
        expect(found).toBeDefined();
        expect(found!.label).toBe("Instant");
    });
});

// ---------------------------------------------------------------------------
// modelMatchesFamily
// ---------------------------------------------------------------------------
describe("modelMatchesFamily", () => {
    it("returns true when snapshot contains matching model button", () => {
        const snapshot = '- button "Pro Extended" ref=e1';
        expect(modelMatchesFamily(snapshot, "pro")).toBe(true);
    });

    it("returns false when no matching model button", () => {
        const snapshot = '- button "Instant" ref=e1';
        expect(modelMatchesFamily(snapshot, "pro")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// isLikelyArtifactLabel
// ---------------------------------------------------------------------------
describe("isLikelyArtifactLabel", () => {
    it("returns true for labels with file extensions", () => {
        expect(isLikelyArtifactLabel("report.pdf")).toBe(true);
        expect(isLikelyArtifactLabel("data.csv")).toBe(true);
    });

    it("returns true for ATTACHED and DONE", () => {
        expect(isLikelyArtifactLabel("ATTACHED")).toBe(true);
        expect(isLikelyArtifactLabel("DONE")).toBe(true);
    });

    it("returns false for labels without file extensions", () => {
        expect(isLikelyArtifactLabel("Hello world")).toBe(false);
    });

    it("returns false for empty labels", () => {
        expect(isLikelyArtifactLabel("")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// preferredArtifactName
// ---------------------------------------------------------------------------
describe("preferredArtifactName", () => {
    it("extracts filename from label", () => {
        expect(preferredArtifactName("View report.pdf", 0)).toBe("report.pdf");
    });

    it("returns fallback when no filename found", () => {
        expect(preferredArtifactName("some text without extension", 0)).toBe("artifact-01");
    });
});

// ---------------------------------------------------------------------------
// findArtifactCandidates
// ---------------------------------------------------------------------------
describe("findArtifactCandidates", () => {
    it("returns artifact-like buttons excluding UI actions", () => {
        const snapshot = [
            '- button "Copy response" ref=e1',
            '- button "report.pdf" ref=e2',
            '- button "Stop streaming" ref=e3',
        ].join("\n");
        const candidates = findArtifactCandidates(snapshot);
        expect(candidates.some((c) => c.label === "report.pdf")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// buildAssistantMessagesScript
// ---------------------------------------------------------------------------
describe("buildAssistantMessagesScript", () => {
    it("returns a non-empty string containing JS code", () => {
        const script = buildAssistantMessagesScript();
        expect(typeof script).toBe("string");
        expect(script.length).toBeGreaterThan(0);
        expect(script).toContain("document.querySelectorAll");
    });
});
