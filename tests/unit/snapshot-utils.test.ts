import { describe, it, expect } from "vitest";
import {
    parseSnapshotEntries,
    findEntry,
    findLastEntry,
    findLabeledEntry,
    labelMatches,
    filterByKind,
    filterByLabel,
    enabledEntries,
    findButtons,
    findLinks,
    findTextboxes,
    type ParsedSnapshotEntry,
} from "../../extensions/oracle/shared/snapshot-utils";

// ---------------------------------------------------------------------------
// Helper: build a snapshot line that parseSnapshotEntries understands.
// Format required by the parser:
//   - each line must contain ref=eNNN
//   - must start with "- <kind>"
//   - may contain "label" and :value
// ---------------------------------------------------------------------------
function line(kind: string, label?: string, ref?: string, extras?: string): string {
    const r = ref ?? "e1";
    const l = label !== undefined ? ` "${label}"` : "";
    return `- ${kind}${l} ref=${r}${extras ? ` ${extras}` : ""}`;
}

// ---------------------------------------------------------------------------
// parseSnapshotEntries
// ---------------------------------------------------------------------------
describe("parseSnapshotEntries", () => {
    it("returns empty array for empty string", () => {
        expect(parseSnapshotEntries("")).toEqual([]);
    });

    it("returns empty array for whitespace-only string", () => {
        expect(parseSnapshotEntries("   \n  \n  ")).toEqual([]);
    });

    it("returns empty array when no ref token is present", () => {
        expect(parseSnapshotEntries('button "Hello"')).toEqual([]);
    });

    it("parses a single button line", () => {
        const snapshot = line("button", "Send prompt", "e10");
        const entries = parseSnapshotEntries(snapshot);
        expect(entries).toHaveLength(1);
        expect(entries[0].kind).toBe("button");
        expect(entries[0].label).toBe("Send prompt");
        expect(entries[0].ref).toBe("@e10");
    });

    it("parses multiple lines", () => {
        const snapshot = [
            line("button", "Submit", "e1"),
            line("textbox", "Prompt", "e2"),
            line("link", "Home", "e3"),
        ].join("\n");
        const entries = parseSnapshotEntries(snapshot);
        expect(entries).toHaveLength(3);
    });

    it("normalizes ref to start with @", () => {
        const snapshot = line("button", "Click", "e5");
        const entries = parseSnapshotEntries(snapshot);
        expect(entries[0].ref).toBe("@e5");
    });

    it("keeps ref that already has @", () => {
        const snapshot = `- button "Click" ref=@e5`;
        const entries = parseSnapshotEntries(snapshot);
        expect(entries[0].ref).toBe("@e5");
    });

    it("handles various kinds", () => {
        const snapshot = [
            line("heading", "Title", "e1"),
            line("link", "Home", "e2"),
            line("button", "Submit", "e3"),
            line("textbox", "Email", "e4"),
            line("textfield", "Name", "e5"),
        ].join("\n");
        const entries = parseSnapshotEntries(snapshot);
        expect(entries.map((e) => e.kind)).toEqual([
            "heading",
            "link",
            "button",
            "textbox",
            "textfield",
        ]);
    });

    it("marks entries as disabled when disabled keyword present", () => {
        const snapshot = line("button", "Submit", "e1", "disabled");
        const entries = parseSnapshotEntries(snapshot);
        expect(entries[0].disabled).toBe(true);
    });

    it("marks entries as checked when checked keyword present", () => {
        const snapshot = line("checkbox", "Stay logged in", "e1", "checked");
        const entries = parseSnapshotEntries(snapshot);
        expect(entries[0].checked).toBe(true);
    });

    it("does not mark disabled when keyword absent", () => {
        const snapshot = line("button", "Submit", "e1");
        const entries = parseSnapshotEntries(snapshot);
        expect(entries[0].disabled).toBe(false);
    });

    it("parses value (colon syntax)", () => {
        const snapshot = `- combobox "effort" ref=e1 :Light`;
        const entries = parseSnapshotEntries(snapshot);
        expect(entries[0].value).toBe("Light");
    });

    it("skips lines that do not start with - <kind>", () => {
        const snapshot = `generic text
- button "Click me" ref=e1`;
        const entries = parseSnapshotEntries(snapshot);
        expect(entries).toHaveLength(1);
        expect(entries[0].label).toBe("Click me");
    });
});

// ---------------------------------------------------------------------------
// findEntry
// ---------------------------------------------------------------------------
describe("findEntry", () => {
    it("returns the first entry matching the predicate", () => {
        const snapshot = [
            line("button", "Submit", "e1"),
            line("button", "Cancel", "e2"),
        ].join("\n");
        const found = findEntry(snapshot, (e) => e.label === "Cancel");
        expect(found).toBeDefined();
        expect(found!.label).toBe("Cancel");
    });

    it("returns undefined when no entry matches", () => {
        const snapshot = line("button", "Submit", "e1");
        const found = findEntry(snapshot, (e) => e.label === "Cancel");
        expect(found).toBeUndefined();
    });

    it("returns the first of multiple matches", () => {
        const snapshot = [
            line("button", "Uno", "e1"),
            line("button", "Dos", "e2"),
        ].join("\n");
        const found = findEntry(snapshot, (e) => e.kind === "button");
        expect(found!.label).toBe("Uno");
    });
});

// ---------------------------------------------------------------------------
// findLastEntry
// ---------------------------------------------------------------------------
describe("findLastEntry", () => {
    it("returns the last entry matching the predicate", () => {
        const snapshot = [
            line("button", "Uno", "e1"),
            line("button", "Dos", "e2"),
            line("button", "Tres", "e3"),
        ].join("\n");
        const found = findLastEntry(snapshot, (e) => e.kind === "button");
        expect(found).toBeDefined();
        expect(found!.label).toBe("Tres");
    });

    it("returns undefined when no entry matches", () => {
        const snapshot = line("link", "Home", "e1");
        const found = findLastEntry(snapshot, (e) => e.kind === "button");
        expect(found).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// findLabeledEntry
// ---------------------------------------------------------------------------
describe("findLabeledEntry", () => {
    it("finds entry by kind and label (case insensitive, substring)", () => {
        const snapshot = [
            line("button", "Copy response", "e1"),
            line("button", "Stop streaming", "e2"),
        ].join("\n");
        const entries = parseSnapshotEntries(snapshot);
        const found = findLabeledEntry(entries, "button", ["copy"]);
        expect(found).toBeDefined();
        expect(found!.label).toBe("Copy response");
    });

    it("returns undefined when label does not match", () => {
        const snapshot = line("button", "Copy response", "e1");
        const entries = parseSnapshotEntries(snapshot);
        const found = findLabeledEntry(entries, "button", ["delete"]);
        expect(found).toBeUndefined();
    });

    it("ignores disabled entries", () => {
        const snapshot = line("button", "Copy response", "e1", "disabled");
        const entries = parseSnapshotEntries(snapshot);
        const found = findLabeledEntry(entries, "button", ["copy"]);
        expect(found).toBeUndefined();
    });

    it("returns undefined for entries with empty label", () => {
        const snapshot = line("button", "", "e1");
        const entries = parseSnapshotEntries(snapshot);
        const found = findLabeledEntry(entries, "button", ["anything"]);
        expect(found).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// labelMatches
// ---------------------------------------------------------------------------
describe("labelMatches", () => {
    it("returns true when actual includes a candidate (case insensitive)", () => {
        expect(labelMatches("Copy response", ["copy"])).toBe(true);
    });

    it("returns true for exact match (case insensitive)", () => {
        expect(labelMatches("Send prompt", ["Send prompt"])).toBe(true);
    });

    it("returns false when no candidate matches", () => {
        expect(labelMatches("Hello world", ["foo", "bar"])).toBe(false);
    });

    it("returns false for undefined actual", () => {
        expect(labelMatches(undefined, ["copy"])).toBe(false);
    });

    it("trims actual before matching", () => {
        expect(labelMatches("  Copy  ", ["copy"])).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// filterByKind
// ---------------------------------------------------------------------------
describe("filterByKind", () => {
    it("filters entries by kind", () => {
        const entries: ParsedSnapshotEntry[] = [
            { line: "", ref: "@e1", kind: "button", label: "Submit", disabled: false },
            { line: "", ref: "@e2", kind: "link", label: "Home", disabled: false },
            { line: "", ref: "@e3", kind: "button", label: "Cancel", disabled: false },
        ];
        const filtered = filterByKind(entries, "button");
        expect(filtered).toHaveLength(2);
        expect(filtered.every((e) => e.kind === "button")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// filterByLabel
// ---------------------------------------------------------------------------
describe("filterByLabel", () => {
    it("filters entries by label candidates", () => {
        const entries: ParsedSnapshotEntry[] = [
            { line: "", ref: "@e1", kind: "button", label: "Copy response", disabled: false },
            { line: "", ref: "@e2", kind: "button", label: "Stop streaming", disabled: false },
        ];
        const filtered = filterByLabel(entries, ["copy"]);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].label).toBe("Copy response");
    });
});

// ---------------------------------------------------------------------------
// enabledEntries
// ---------------------------------------------------------------------------
describe("enabledEntries", () => {
    it("filters out disabled entries", () => {
        const entries: ParsedSnapshotEntry[] = [
            { line: "", ref: "@e1", kind: "button", label: "A", disabled: false },
            { line: "", ref: "@e2", kind: "button", label: "B", disabled: true },
        ];
        const filtered = enabledEntries(entries);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].label).toBe("A");
    });
});

// ---------------------------------------------------------------------------
// findButtons / findLinks / findTextboxes
// ---------------------------------------------------------------------------
describe("findButtons", () => {
    it("returns all button entries", () => {
        const snapshot = [
            line("button", "Submit", "e1"),
            line("link", "Home", "e2"),
            line("button", "Cancel", "e3"),
        ].join("\n");
        const buttons = findButtons(snapshot);
        expect(buttons).toHaveLength(2);
    });
});

describe("findLinks", () => {
    it("returns all link entries", () => {
        const snapshot = [
            line("link", "Home", "e1"),
            line("button", "Click", "e2"),
            line("link", "About", "e3"),
        ].join("\n");
        const links = findLinks(snapshot);
        expect(links).toHaveLength(2);
    });
});

describe("findTextboxes", () => {
    it("returns all textbox entries", () => {
        const snapshot = [
            line("textbox", "Prompt", "e1"),
            line("button", "Send", "e2"),
        ].join("\n");
        const boxes = findTextboxes(snapshot);
        expect(boxes).toHaveLength(1);
        expect(boxes[0].label).toBe("Prompt");
    });
});
