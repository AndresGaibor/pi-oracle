/**
 * ChatGPT Assertions – state checks and queries for the ChatGPT page.
 * Each method returns a boolean or structured data about the page state.
 */
import { parseSnapshotEntries, findEntry, findLastEntry, type ParsedSnapshotEntry } from "../../shared/snapshot-utils";
import { CHATGPT_LABELS, CHATGPT_SELECTORS, MODEL_FAMILY_PREFIX, EFFORT_LABELS, labelMatches } from "./chatgpt.selectors";

// ---------------------------------------------------------------------------
// UI presence assertions
// ---------------------------------------------------------------------------

/** Check if composer textbox is visible */
export function hasComposer(snapshot: string): boolean {
	return parseSnapshotEntries(snapshot).some(
		(e) => e.kind === "textbox" && labelMatches(e.label, CHATGPT_LABELS.composer),
	);
}

/** Check if send button is enabled */
export function canSend(snapshot: string): boolean {
	const entry = findEntry(
		snapshot,
		(e) => e.kind === "button" && labelMatches(e.label, CHATGPT_LABELS.send) && !e.disabled,
	);
	return !!entry;
}

/** Check if add files button is available */
export function hasAddFiles(snapshot: string): boolean {
	return parseSnapshotEntries(snapshot).some(
		(e) => e.kind === "button" && labelMatches(e.label, CHATGPT_LABELS.addFiles),
	);
}

/** Check if model selector is visible */
export function hasModelSelector(snapshot: string): boolean {
	return parseSnapshotEntries(snapshot).some(
		(e) => e.kind === "button" && labelMatches(e.label, CHATGPT_LABELS.modelSelector),
	);
}

/** Check if stop button is visible */
export function hasStopButton(snapshot: string): boolean {
	return parseSnapshotEntries(snapshot).some(
		(e) => e.kind === "button" && labelMatches(e.label, CHATGPT_LABELS.stop),
	);
}

// ---------------------------------------------------------------------------
// Model configuration assertions
// ---------------------------------------------------------------------------

/** Find model button entry for a given family */
export function findModelButton(snapshot: string, family: string): ParsedSnapshotEntry | undefined {
	const prefix = MODEL_FAMILY_PREFIX[family] || "";
	return findEntry(
		snapshot,
		(e) => e.kind === "button" && typeof e.label === "string" && e.label.startsWith(prefix) && !e.disabled,
	);
}

/** Check if Thinking effort chip is visible */
export function hasThinkingChip(snapshot: string): boolean {
	return /button "(?:Light|Standard|Extended|Heavy|Ligero|Estándar|Ampliado|Extendido|Alto|Razonamiento ampliado)(?: thinking)?(?:, click to remove)?"/i.test(snapshot);
}

/** Get visible effort label */
export function getVisibleEffort(snapshot: string): string | undefined {
	const entries = parseSnapshotEntries(snapshot);
	const allLabels = [...new Set(Object.values(EFFORT_LABELS).flat())];

	const comboEntry = entries.find(
		(e) => e.kind === "combobox" && e.value && allLabels.includes(e.value) && !e.disabled,
	);
	if (comboEntry?.value) return comboEntry.value;

	const btnEntry = entries.find((e) => {
		if (e.kind !== "button" || e.disabled || !e.label) return false;
		return allLabels.some((l) => e.label!.toLowerCase().includes(l.toLowerCase()));
	});
	return btnEntry?.label;
}

/** Check if effort selection is visible for a given effort */
export function isEffortVisible(snapshot: string, effort: string): boolean {
	const labels = EFFORT_LABELS[effort];
	if (!labels) return false;
	const entries = parseSnapshotEntries(snapshot);
	return entries.some((entry) => {
		if (entry.disabled) return false;
		if (entry.kind === "combobox" && labels.includes(entry.value || "")) return true;
		if (entry.kind !== "button") return false;
		const label = String(entry.label || "").toLowerCase();
		return labels.some((candidate) => {
			const normalized = candidate.toLowerCase();
			return (
				label === normalized ||
				label === `${normalized} thinking` ||
				label === `${normalized}, click to remove` ||
				label === `${normalized} thinking, click to remove`
			);
		});
	});
}

/** Check if model configuration matches requested family */
export function modelMatchesFamily(snapshot: string, family: string): boolean {
	const entries = parseSnapshotEntries(snapshot);
	return entries.some((e) => {
		if (e.kind !== "button" || !e.label) return false;
		return e.label.startsWith(MODEL_FAMILY_PREFIX[family] || "");
	});
}

// ---------------------------------------------------------------------------
// Response assertions
// ---------------------------------------------------------------------------

/** Check if snapshot shows a completed response (has copy, no stop) */
export function isResponseComplete(snapshot: string): boolean {
	const hasCopy = CHATGPT_LABELS.copyResponse.some((l) => snapshot.includes(`"${l}"`));
	const hasStop = CHATGPT_LABELS.stop.some((l) => snapshot.includes(`"${l}"`));
	return hasCopy && !hasStop;
}

/** Check if artifact candidates are present */
export function findArtifactCandidates(snapshot: string): Array<{ label: string; ref: string }> {
	const excluded = new Set([
		...CHATGPT_LABELS.copyResponse,
		...CHATGPT_LABELS.stop,
		"Share",
		"Switch model",
		"More actions",
		...CHATGPT_LABELS.addFiles,
		"Start dictation",
		"Start Voice",
		...CHATGPT_LABELS.modelSelector,
		"Open conversation options",
		"Scroll to bottom",
		...CHATGPT_LABELS.close,
	]);

	const seen = new Set<string>();
	const candidates: Array<{ label: string; ref: string }> = [];

	for (const entry of parseSnapshotEntries(snapshot)) {
		if (!entry.label) continue;
		if (excluded.has(entry.label)) continue;
		if (entry.label.startsWith("Thought for ")) continue;
		if (entry.kind !== "button" && entry.kind !== "link") continue;
		if (!isLikelyArtifactLabel(entry.label)) continue;
		if (seen.has(entry.label)) continue;
		seen.add(entry.label);
		candidates.push({ label: entry.label, ref: entry.ref });
	}
	return candidates;
}

function isLikelyArtifactLabel(label: string): boolean {
	const normalized = label.trim();
	if (!normalized) return false;
	const upper = normalized.toUpperCase();
	if (upper === "ATTACHED" || upper === "DONE") return true;
	return /(?:^|[^\w])[^\n]*\.[A-Za-z0-9]{1,12}(?:$|[^\w])/.test(normalized);
}

// ---------------------------------------------------------------------------
// Message extraction
// ---------------------------------------------------------------------------

/** Build the JS script to extract assistant messages */
export function buildAssistantMessagesScript(): string {
	return `
		JSON.stringify((() => {
			const turnStartAssistantMessages = Array.from(
				document.querySelectorAll('${CHATGPT_SELECTORS.responseMessage[0]}'),
			);
			const assistantMessages = turnStartAssistantMessages.length
				? turnStartAssistantMessages
				: Array.from(document.querySelectorAll('${CHATGPT_SELECTORS.responseMessage[1]}'));
			const renderText = (node) => {
				if (!node) return '';
				const clone = node.cloneNode(true);
				const host = document.createElement('div');
				host.style.position = 'fixed';
				host.style.left = '-99999px';
				host.style.top = '0';
				host.style.whiteSpace = 'pre-wrap';
				host.style.pointerEvents = 'none';
				host.appendChild(clone);
				document.body.appendChild(host);
				let text = (host.innerText || host.textContent || '').trim();
				host.remove();
				const endings = [
					'\\\\nChatGPT can make mistakes. Check important info.',
					'\\\\nChatGPT puede cometer errores. Comprueba la información importante.',
				];
				for (const ending of endings) {
					if (text.includes(ending)) text = text.split(ending)[0].trim();
				}
				text = text
					.split('\\\\n')
					.map((line) => line.trimEnd())
					.filter((line) => line.trim() && !/^Thought for\\\\b/i.test(line.trim()))
					.join('\\\\n')
					.trim();
				return text;
			};
			return {
				messages: assistantMessages.map((message) => ({ text: renderText(message) })),
			};
		})(), null, 2)
	`;
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export { parseSnapshotEntries, findEntry, findLastEntry };
export type { ParsedSnapshotEntry as SnapshotEntry };
