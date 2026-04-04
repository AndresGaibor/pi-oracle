/**
 * ChatGPTJobRunner – orchestrates a single oracle job.
 * Encapsulates the workflow: launch browser → verify auth → upload archive →
 * send prompt → wait for response → download artifacts.
 *
 * Clean architecture: this is the application/service layer that coordinates
 * the infrastructure (browser) and domain (AIProviderPage) layers.
 *
 * SNAPSHOT FORMAT & SELECTOR STRATEGY:
 * ───────────────────────────────────────────────────────────────────────────────
 * This class uses TEXT-LABEL-BASED selectors (snapshot format) as primary strategy:
 *
 * Snapshot text format (from agent-browser, accessibility tree):
 *   button "Send prompt"
 *   textbox "Message..." : placeholder value
 *   combobox "Model" : "GPT-4o" selected
 *   heading "ChatGPT said:"
 *   link "download.json" href="/artifacts/...."
 *   ref=e123 kind "label" [disabled] [checked]
 *
 * ADVANTAGES OF TEXT-LABEL SELECTORS:
 *   ✓ DOM-agnostic: Works across UI re-renders, theme changes, layout restructures
 *   ✓ Bilingual: Labels support multiple languages (English/Spanish variants)
 *   ✓ Semantic: Matches user-visible text, not brittle CSS selectors
 *   ✓ Accessibility: Based on ARIA/accessibility tree (screen reader compatible)
 *   ✓ Stable: ChatGPT UI redesigns won't break labels like "Send" or "Copy response"
 *   ✓ Readable: Code is self-documenting (snapshotHasLabel(snapshot, "button", "Send"))
 *
 * DISADVANTAGES OF DIRECT DOM SELECTORS:
 *   ✗ Brittle: ChatGPT frequently changes data-testid values, button classes
 *   ✗ Hidden overhead: CSS selectors don't work on unmounted DOM elements
 *   ✗ Monolingual: Hard to support Spanish/other languages with querySelector
 *   ✗ Implementation detail: Couples orchestration to ChatGPT's internal structure
 *
 * WHEN WE USE DOM QUERIES (data-testid):
 *   - Message extraction: getAssistantMessages() uses data-testid (content extraction)
 *   - Artifact navigation: Some ref-based clicks for specialized UI elements
 *   - Hybrid approach: Snapshot for discovery, DOM for precise content access
 */
import { existsSync } from "node:fs";
import { readFile, stat, chmod, rm, mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import * as browser from "../lib/browser";
import type { AIProviderPage } from "../pages/ai-provider.types";
import type { BrowserActions } from "../pages/browser-actions.types";
import { CHATGPT_LABELS as DEFAULT_LABELS, MODEL_FAMILY_PREFIX, EFFORT_LABELS } from "../pages/chatgpt/chatgpt.selectors";
import { parseSnapshotEntries, findEntry, findLastEntry, type ParsedSnapshotEntry } from "../shared/snapshot-utils";

// ---------------------------------------------------------------------------
// Labels – single source of truth, shared with ChatGPTPage
// ---------------------------------------------------------------------------
// Snapshot label definitions. Each label is a localization-aware array representing
// the same UI element across languages. For example:
//   send: ["Send prompt", "Send message", "Enviar prompt", "Enviar mensaje", "Enviar"]
// When we call snapshotHasLabel(snapshot, "button", LABELS.send), we check if the
// snapshot contains ANY of: button "Send prompt" OR button "Send message" OR ... etc.
//
// These are matched against text in the accessibility tree snapshot, NOT DOM.
// See parseSnapshotEntries() in snapshot-utils.ts for snapshot parsing.

const LABELS = {
	...DEFAULT_LABELS,
	// "Send" button for prompt submission – multilingual variants to handle ChatGPT's label changes
	send: ["Send prompt", "Send message", "Enviar prompt", "Enviar mensaje", "Enviar"],
	// Close button for dialogs/sidebars
	close: ["Close", "Cerrar"],
	// Model configuration/menu button
	configure: ["Configure...", "Configurar..."],
	// Thinking mode auto-switch toggle in advanced settings
	autoSwitchToThinking: ["Auto-switch to Thinking", "Cambio automático a Thinking", "Cambio automático a Pensando"],
};

const ARTIFACT_CANDIDATE_STABILITY_TIMEOUT_MS = 15_000;
const ARTIFACT_CANDIDATE_STABILITY_POLL_MS = 1_500;
const ARTIFACT_CANDIDATE_STABILITY_POLLS = 2;
const ARTIFACT_DOWNLOAD_HEARTBEAT_MS = 10_000;
const ARTIFACT_DOWNLOAD_TIMEOUT_MS = 90_000;
const ARTIFACT_DOWNLOAD_MAX_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JobConfig {
	browser: {
		executablePath?: string;
		userAgent?: string;
		args?: string[];
		runMode: "headed" | "headless";
		chatUrl: string;
		authSeedProfileDir: string;
		runtimeProfilesDir: string;
		cloneStrategy: string;
		maxConcurrentJobs: number;
		sessionPrefix: string;
	};
	worker: {
		pollMs: number;
		completionTimeoutMs: number;
	};
	artifacts: {
		capture: boolean;
	};
}

export interface JobState {
	id: string;
	status: string;
	chatUrl?: string;
	conversationId?: string;
	archivePath?: string;
	promptPath: string;
	responsePath: string;
	runtimeProfileDir: string;
	runtimeSessionName: string;
	runtimeId?: string;
	config: JobConfig;
	effort?: string;
	chatModelFamily?: string;
	phase?: string;
	phaseAt?: string;
	heartbeatAt?: string;
	artifactPaths?: string[];
}

export interface ArtifactEntry {
	displayName: string;
	fileName: string;
	copiedPath: string;
	size: number;
	sha256: string;
	detectedType: string;
}

export interface JobResult {
	responseText: string;
	responseIndex: number;
	artifacts: ArtifactEntry[];
	chatUrl: string;
	conversationId: string;
}

// ---------------------------------------------------------------------------
// Browser adapter – implements BrowserActions for AIProviderPage
// ---------------------------------------------------------------------------

const browserActions: BrowserActions = {
	snapshotText: (pageId?: string) => browser.snapshotText(pageId),
	pageText: (pageId?: string) => browser.pageText(pageId),
	evaluate: (pageId: string, script: string) => browser.evaluate(pageId, script),
	clickRef: (ref: string, pageIdHint?: string) => browser.clickRef(ref, pageIdHint),
	fill: (ref: string, text: string, pageIdHint?: string) => browser.fill(ref, text, pageIdHint),
	type: (text: string, pageId?: string) => browser.type(text, pageId),
	press: (key: string, pageId?: string) => browser.press(key, pageId),
	screenshot: (dest: string, pageId?: string) => browser.screenshot(dest, pageId),
	getMainPageId: () => browser.getMainPageId(),
	getCurrentUrl: () => browser.getUrl(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function labelMatches(label: unknown, candidates: string[]): boolean {
	return typeof label === "string" && candidates.includes(label);
}

function effortLabelsFor(effortLabel: string): string[] {
	if (!effortLabel) return [];
	const key = effortLabel.toLowerCase();
	return (EFFORT_LABELS[key] as string[]) || [effortLabel];
}

function allEffortLabels(): string[] {
	return [...new Set(Object.values(EFFORT_LABELS).flat())];
}

function stripQuery(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.hash = "";
		parsed.search = "";
		return parsed.toString();
	} catch {
		return url;
	}
}

function parseConversationId(chatUrl: string | undefined): string | undefined {
	if (!chatUrl) return undefined;
	try {
		const parsed = new URL(chatUrl);
		const match = parsed.pathname.match(/\/c\/([^/?#]+)/i);
		return match?.[1];
	} catch {
		return undefined;
	}
}

/**
 * Check if snapshot contains a UI element with given kind and label.
 *
 * Example:
 *   snapshotHasLabel(snapshot, "button", LABELS.send)
 *   // returns true if snapshot contains: button "Send prompt" OR button "Send message" etc.
 *
 * This is the CORE selector function. It checks the accessibility tree snapshot
 * (see snapshot-utils.parseSnapshotEntries) for exact text matches, making it
 * DOM-agnostic and language-aware. Much more stable than querySelector("[data-testid=...]").
 */
function snapshotHasLabel(snapshot: string, kind: string, labels: readonly string[]): boolean {
	return labels.some((label) => snapshot.includes(`${kind} "${label}"`));
}

function effortSelectionVisible(snapshot: string, effortLabel: string | undefined): boolean {
	if (!effortLabel) return true;
	const labels = effortLabelsFor(effortLabel);
	const entries = parseSnapshotEntries(snapshot);
	return entries.some((entry) => {
		if (entry.disabled) return false;
		if (entry.kind === "combobox" && labels.includes(entry.value || "")) return true;
		if (entry.kind !== "button") return false;
		const label = String(entry.label || "").toLowerCase();
		return labels.some((candidate) => {
			const normalizedEffort = candidate.toLowerCase();
			return (
				label === normalizedEffort ||
				label === `${normalizedEffort} thinking` ||
				label === `${normalizedEffort}, click to remove` ||
				label === `${normalizedEffort} thinking, click to remove`
			);
		});
	});
}

function thinkingChipVisible(snapshot: string): boolean {
	return /button "(?:Light|Standard|Extended|Heavy|Ligero|Estándar|Ampliado|Extendido|Alto|Razonamiento ampliado)(?: thinking)?(?:, click to remove)?"/i.test(snapshot);
}

function matchesModelFamilyButton(candidate: ParsedSnapshotEntry, family: string): boolean {
	return candidate.kind === "button" && typeof candidate.label === "string" && candidate.label.startsWith(MODEL_FAMILY_PREFIX[family]) && !candidate.disabled;
}

function snapshotStronglyMatchesRequestedModel(snapshot: string, job: JobState): boolean {
	const entries = parseSnapshotEntries(snapshot);
	const familyMatched = entries.some((entry) => matchesModelFamilyButton(entry, job.chatModelFamily || "instant"));
	if (job.chatModelFamily === "thinking") {
		return familyMatched || effortSelectionVisible(snapshot, job.effort);
	}
	if (job.chatModelFamily === "pro") return familyMatched;
	return familyMatched;
}

function snapshotWeaklyMatchesRequestedModel(snapshot: string, job: JobState): boolean {
	if (job.chatModelFamily === "thinking") return effortSelectionVisible(snapshot, job.effort);
	if (job.chatModelFamily === "pro") return !thinkingChipVisible(snapshot);
	if (job.chatModelFamily === "instant") return !thinkingChipVisible(snapshot);
	return false;
}

/**
 * Detect if ChatGPT has finished streaming the response.
 *
 * LOGIC: When ChatGPT is streaming, the "Stop generating" button is visible.
 * When complete, the "Copy response" button appears and "Stop" disappears.
 *
 * Uses snapshot labels instead of polling message.innerText for completion,
 * which is MORE RELIABLE because:
 *   - Detects actual UI state change (streaming button replaced with copy button)
 *   - Avoids timing issues with text stabilization
 *   - Works with both English and Spanish UIs (label variants in LABELS.stop/copyResponse)
 *
 * This is a SNAPSHOT-BASED completion detector, not a timeout-based one.
 */
function snapshotShowsCompletedResponse(snapshot: string): boolean {
	const hasStopStreaming = snapshotHasLabel(snapshot, "button", LABELS.stop as unknown as readonly string[]);
	const hasCopyResponse = snapshotHasLabel(snapshot, "button", LABELS.copyResponse as unknown as readonly string[]);
	return hasCopyResponse && !hasStopStreaming;
}

function isLikelyArtifactLabel(label: unknown): boolean {
	const normalized = String(label || "").trim();
	if (!normalized) return false;
	const upper = normalized.toUpperCase();
	if (upper === "ATTACHED" || upper === "DONE") return true;
	return /(?:^|[^\w])[^\n]*\.[A-Za-z0-9]{1,12}(?:$|[^\w])/.test(normalized);
}

function preferredArtifactName(label: unknown, index: number): string {
	const normalized = String(label || "").trim();
	const fileNameMatch = normalized.match(/([A-Za-z0-9._-]+\.[A-Za-z0-9]{1,12})(?!.*[A-Za-z0-9._-]+\.[A-Za-z0-9]{1,12})/);
	if (fileNameMatch) return basename(fileNameMatch[1]).replace(/[^a-zA-Z0-9._-]/g, "_");
	return `artifact-${String(index + 1).padStart(2, "0")}`;
}

function artifactCandidatesFromEntries(entries: ParsedSnapshotEntry[]): Array<{ label: string; ref: string }> {
	const excluded = new Set([
		"Copy response", "Good response", "Bad response", "Share", "Switch model", "More actions",
		...LABELS.addFiles, "Start dictation", "Start Voice",
		...LABELS.modelSelector, "Open conversation options", "Scroll to bottom",
		...LABELS.close,
	]);

	const seen = new Set<string>();
	const candidates: Array<{ label: string; ref: string }> = [];
	for (const entry of entries) {
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

async function ensurePrivateDir(path: string): Promise<void> {
	await mkdir(path, { recursive: true, mode: 0o700 });
	await chmod(path, 0o700).catch(() => undefined);
}

async function secureWriteText(path: string, content: string): Promise<void> {
	const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tmpPath, content, { encoding: "utf8", mode: 0o600 });
	await chmod(tmpPath, 0o600).catch(() => undefined);
	await renameSafe(tmpPath, path);
	await chmod(path, 0o600).catch(() => undefined);
}

async function renameSafe(oldPath: string, newPath: string): Promise<void> {
	const { rename } = await import("node:fs/promises");
	await rename(oldPath, newPath);
}

async function sha256(path: string): Promise<string> {
	const { readFile } = await import("node:fs/promises");
	const buffer = await readFile(path);
	return createHash("sha256").update(buffer).digest("hex");
}

async function detectType(path: string): Promise<string> {
	return new Promise((resolve) => {
		const child = spawn("file", ["-b", path], { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		child.stdout.on("data", (d) => { stdout += String(d); });
		child.on("close", () => resolve(stdout.trim() || "unknown"));
		child.on("error", () => resolve("unknown"));
	});
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// ChatGPTJobRunner
// ---------------------------------------------------------------------------

export class ChatGPTJobRunner {
	private job: JobState;
	private provider: AIProviderPage;
	private logFn: (message: string) => Promise<void>;
	private heartbeatFn: (patch?: unknown, options?: unknown) => Promise<void>;
	private browserStarted = false;

	constructor(
		job: JobState,
		logFn: (message: string) => Promise<void>,
		heartbeatFn: (patch?: unknown, options?: unknown) => Promise<void>,
		provider: AIProviderPage,
	) {
		this.job = job;
		this.provider = provider;
		this.logFn = logFn;
		this.heartbeatFn = heartbeatFn;
	}

	// -----------------------------------------------------------------------
	// Browser lifecycle
	// -----------------------------------------------------------------------

	async launchBrowser(url: string): Promise<void> {
		await this.closeBrowser();
		const headless = this.job.config.browser.runMode !== "headed";
		await browser.launch({
			userDataDir: this.job.runtimeProfileDir,
			executablePath: this.job.config.browser.executablePath,
			userAgent: this.job.config.browser.userAgent,
			args: Array.isArray(this.job.config.browser.args) ? this.job.config.browser.args : undefined,
			headless,
		});
		this.browserStarted = true;
		await browser.open(url);
	}

	async closeBrowser(): Promise<void> {
		await browser.close().catch(() => undefined);
		this.browserStarted = false;
	}

	// -----------------------------------------------------------------------
	// Auth verification (skipped for now – uses existing session)
	// -----------------------------------------------------------------------

	async verifyAuth(): Promise<void> {
		// Auth is pre-seeded via /oracle-auth. The runtime profile clone
		// already contains valid cookies. We just check the browser is connected.
		if (!browser.isConnected()) {
			throw new Error("Browser disconnected after launch");
		}
	}

	// -----------------------------------------------------------------------
	// Prompt sending
	// -----------------------------------------------------------------------

	async sendPrompt(prompt: string): Promise<{ baselineAssistantCount: number }> {
		const baselineAssistantCount = (await this.provider.getAssistantMessages(browserActions)).length;
		await this.logFn(`Assistant response count before send: ${baselineAssistantCount}`);

		// Click composer
		await this.provider.clickComposer(browserActions);

		// Type prompt via JS
		await this.provider.typePrompt(browserActions, prompt);

		// Click send
		await this.provider.clickSend(browserActions);

		return { baselineAssistantCount };
	}

	// -----------------------------------------------------------------------
	// Wait for stable chat URL
	// -----------------------------------------------------------------------

	async waitForStableChatUrl(previousChatUrl: string | undefined): Promise<string> {
		const timeoutAt = Date.now() + 60_000;
		let lastUrl = "";
		let stableCount = 0;

		while (Date.now() < timeoutAt) {
			await this.heartbeatFn();
			const url = stripQuery(await browser.getUrl());
			let isConversationUrl = false;
			try {
				isConversationUrl = /\/c\/[A-Za-z0-9-]+$/i.test(new URL(url).pathname);
			} catch {
				isConversationUrl = false;
			}
			const isKnownFollowUpUrl = previousChatUrl ? stripQuery(previousChatUrl) === url : false;

			if (isConversationUrl || isKnownFollowUpUrl) {
				if (url === lastUrl) stableCount += 1;
				else stableCount = 1;
				lastUrl = url;
				if (stableCount >= 2) return url;
			}
			await sleep(1000);
		}
		return previousChatUrl || stripQuery(await browser.getUrl());
	}

	// -----------------------------------------------------------------------
	// Wait for chat completion
	// -----------------------------------------------------------------------

	/**
	 * Wait for ChatGPT to finish generating the response.
	 *
	 * SNAPSHOT-BASED COMPLETION DETECTION:
	 * We poll TWO sources:
	 *   1. Message text content (via getAssistantMessages) – waits for text to appear
	 *   2. Snapshot buttons (via snapshotShowsCompletedResponse) – waits for "Copy" button
	 *
	 * Both must be true + text must stabilize (3 consecutive identical reads) to confirm done.
	 *
	 * WHY NOT JUST WAIT FOR TEXT TO STOP CHANGING?
	 * Because the snapshot button check is MORE RELIABLE:
	 *   - Snapshot reflects actual UI state ("Stop generating" → "Copy response" transition)
	 *   - No edge cases with text buffering or partial content
	 *   - Works even if text briefly repeats (happens with streaming sometimes)
	 *   - Language-aware: Works with Spanish UIs via label variants
	 *
	 * This is a HYBRID approach combining DOM content (message text) with
	 * SNAPSHOT UI state (button visibility) for maximum reliability.
	 */
	async waitForChatCompletion(baselineAssistantCount: number): Promise<{ responseIndex: number; responseText: string }> {
		const timeoutAt = Date.now() + this.job.config.worker.completionTimeoutMs;
		let lastText = "";
		let stableCount = 0;

		while (Date.now() < timeoutAt) {
			await this.heartbeatFn();
			const snapshot = await browser.snapshotText();
			const messages = await this.provider.getAssistantMessages(browserActions);
			const targetMessage = messages[baselineAssistantCount];
			const targetText = targetMessage?.text || "";
			// Use snapshot to check if "Stop generating" button is gone and "Copy response" appeared
			const hasCompletedResponse = snapshotShowsCompletedResponse(snapshot);

			if (targetText && hasCompletedResponse) {
				if (targetText === lastText) stableCount += 1;
				else stableCount = 1;
				lastText = targetText;
				// Wait for 3 consecutive stable reads to be confident
				if (stableCount >= 3) {
					return { responseIndex: baselineAssistantCount, responseText: targetText };
				}
			}
			await sleep(this.job.config.worker.pollMs);
		}
		throw new Error("Timed out waiting for ChatGPT response completion");
	}

	// -----------------------------------------------------------------------
	// Artifact download
	// -----------------------------------------------------------------------

	async downloadArtifacts(responseIndex: number): Promise<ArtifactEntry[]> {
		if (!this.job.config.artifacts.capture) {
			await secureWriteText(`${this.getJobDir()}/artifacts.json`, "[]\n");
			return [];
		}

		const { targetSlice, candidates } = await this.reopenConversationForArtifacts(responseIndex, "initial");
		if (!targetSlice) {
			await this.logFn(`No assistant response found in snapshot for response index ${responseIndex}`);
			await secureWriteText(`${this.getJobDir()}/artifacts.json`, "[]\n");
			return [];
		}

		await this.logFn(`Artifact candidates: ${candidates.map((c) => c.label).join(", ") || "(none)"}`);

		const artifactsDir = `${this.getJobDir()}/artifacts`;
		await ensurePrivateDir(artifactsDir);
		const artifacts: ArtifactEntry[] = [];
		await this.flushArtifactsState(artifacts);

		for (const [index, candidate] of candidates.entries()) {
			let downloaded = false;
			for (let attempt = 1; attempt <= ARTIFACT_DOWNLOAD_MAX_ATTEMPTS && !downloaded; attempt += 1) {
				const freshSnapshot = await browser.snapshotText();
				const freshSlice = this.assistantSnapshotSlice(freshSnapshot, responseIndex);
				if (!freshSlice) break;
				const freshEntries = parseSnapshotEntries(freshSlice);
				const entry = freshEntries.find(
					(e) => e.label === candidate.label && (e.kind === "button" || e.kind === "link") && !e.disabled,
				);
				if (!entry) {
					await this.logFn(`Artifact "${candidate.label}" not found in fresh snapshot, skipping`);
					break;
				}

				const destinationPath = join(artifactsDir, preferredArtifactName(candidate.label, index));
				await rm(destinationPath, { force: true }).catch(() => undefined);
				try {
					await this.logFn(`Artifact "${candidate.label}" download attempt ${attempt}/${ARTIFACT_DOWNLOAD_MAX_ATTEMPTS} using ref ${entry.ref}`);
					await this.withHeartbeatWhile(async () => {
						await browser.downloadByRef(entry.ref, destinationPath, undefined, ARTIFACT_DOWNLOAD_TIMEOUT_MS);
					});
					await this.heartbeatFn(undefined, { force: true });
					await chmod(destinationPath, 0o600).catch(() => undefined);
					const [size, checksum, detectedType] = await Promise.all([
						stat(destinationPath).then((s) => s.size),
						sha256(destinationPath),
						detectType(destinationPath),
					]);
					artifacts.push({
						displayName: candidate.label,
						fileName: basename(destinationPath),
						copiedPath: destinationPath,
						size,
						sha256: checksum,
						detectedType,
					});
					downloaded = true;
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					await rm(destinationPath, { force: true }).catch(() => undefined);
					await this.logFn(`Artifact "${candidate.label}" download failed on attempt ${attempt}/${ARTIFACT_DOWNLOAD_MAX_ATTEMPTS}: ${message}`);
					if (attempt >= ARTIFACT_DOWNLOAD_MAX_ATTEMPTS) {
						artifacts.push({ displayName: candidate.label, unconfirmed: true, error: message } as unknown as ArtifactEntry);
					} else {
						await this.reopenConversationForArtifacts(responseIndex, `retry ${attempt + 1} for ${candidate.label}`);
						await sleep(1_000);
					}
				} finally {
					await this.flushArtifactsState(artifacts);
				}
			}
		}
		return artifacts;
	}

	// -----------------------------------------------------------------------
	// Capture diagnostics
	// -----------------------------------------------------------------------

	async captureDiagnostics(reason: string): Promise<void> {
		if (!this.browserStarted) return;
		try {
			const [url, snapshot, body] = await Promise.all([
				browser.getUrl().catch(() => ""),
				browser.snapshotText().catch(() => ""),
				browser.pageText().catch(() => ""),
			]);
			const logsDir = `${this.getJobDir()}/logs`;
			await secureWriteText(join(logsDir, `${reason}.url.txt`), `${url || ""}\n`);
			await secureWriteText(join(logsDir, `${reason}.snapshot.txt`), `${snapshot || ""}\n`);
			await secureWriteText(join(logsDir, `${reason}.body.txt`), `${body || ""}\n`);
			await browser.screenshot(join(logsDir, `${reason}.png`)).catch(() => undefined);
		} catch {
			// ignore
		}
	}

	// -----------------------------------------------------------------------
	// Internal helpers
	// -----------------------------------------------------------------------

	private getJobDir(): string {
		return `/tmp/oracle-${this.job.id}`;
	}

	/**
	 * Extract the snapshot slice containing a specific assistant response.
	 *
	 * SNAPSHOT PARSING STRATEGY:
	 * The full page snapshot contains multiple sections (user messages, assistant messages, UI controls).
	 * We slice it by finding the "ChatGPT said:" heading at index responseIndex, then extract
	 * everything until the next "ChatGPT said:" or the composer box (message input).
	 *
	 * This is MUCH BETTER than using DOM .querySelectorAll("[data-testid=message]") because:
	 *   1. The snapshot is a static accessibility tree (no CSS selector brittleness)
	 *   2. Multilingual: Works with "ChatGPT said:" (English) and "ChatGPT dijo:" (Spanish)
	 *   3. Immune to UI reflows: The snapshot captures the layout at snapshot time
	 *   4. Artifact detection: We can search the slice for file-like button labels
	 *
	 * Example snapshot slice:
	 *   heading "ChatGPT said:" ref=e456
	 *   - button "Click to open artifact" ref=e457
	 *   - button "Download code.js" ref=e458 href="..."
	 *   - textbox "Message..." ref=e459
	 */
	private assistantSnapshotSlice(snapshot: string, responseIndex: number): string | undefined {
		const lines = snapshot.split("\n");
		// Find all "ChatGPT said:" heading lines (one per assistant response)
		const assistantHeadingIndices = lines.flatMap((line, index) =>
			line.includes('heading "ChatGPT said:"') || line.includes('heading "ChatGPT dijo:"') ? [index] : [],
		);
		const startIndex = assistantHeadingIndices[responseIndex];
		if (startIndex === undefined) return undefined;

		const endCandidates: number[] = [];
		// End at next assistant response
		const nextAssistantIndex = assistantHeadingIndices[responseIndex + 1];
		if (nextAssistantIndex !== undefined) endCandidates.push(nextAssistantIndex);

		// Or end at composer box (message input)
		const composerIndex = lines.findIndex(
			(line, index) => index > startIndex && snapshotHasLabel(line, "textbox", LABELS.composer),
		);
		if (composerIndex !== -1) endCandidates.push(composerIndex);

		const endIndex = endCandidates.length > 0 ? Math.min(...endCandidates) : undefined;
		return lines.slice(startIndex, endIndex).join("\n");
	}

	private async reopenConversationForArtifacts(responseIndex: number, reason: string) {
		const targetUrl = this.job.chatUrl || stripQuery(await browser.getUrl());
		await this.logFn(`Reopening conversation before artifact capture (${reason}): ${targetUrl}`);
		await browser.open(targetUrl);
		await sleep(1500);
		return this.waitForStableArtifactCandidates(responseIndex);
	}

	private async waitForStableArtifactCandidates(responseIndex: number) {
		const deadline = Date.now() + ARTIFACT_CANDIDATE_STABILITY_TIMEOUT_MS;
		let lastSignature: string | undefined;
		let stablePolls = 0;
		let latest: { snapshot: string; targetSlice: string | undefined; candidates: Array<{ label: string; ref: string }> } = {
			snapshot: "",
			targetSlice: undefined,
			candidates: [],
		};

		while (Date.now() < deadline) {
			latest = await this.collectArtifactCandidates(responseIndex);
			const signature = latest.candidates.map((c) => c.label).join("\n");
			if (signature === lastSignature) stablePolls += 1;
			else {
				lastSignature = signature;
				stablePolls = 1;
			}
			if (stablePolls >= ARTIFACT_CANDIDATE_STABILITY_POLLS) return latest;
			await this.heartbeatFn();
			await sleep(ARTIFACT_CANDIDATE_STABILITY_POLL_MS);
		}
		return latest;
	}

	/**
	 * Scan the assistant's response in the snapshot for downloadable artifact buttons.
	 *
	 * ARTIFACT DETECTION VIA SNAPSHOT:
	 * We parse the assistant message slice and look for button/link entries with
	 * file-like labels (e.g., "script.py", "report.pdf", "data.csv").
	 *
	 * This is SNAPSHOT-BASED, not DOM-based, so we:
	 *   - Get a stable list of candidates (snapshot is immutable at poll time)
	 *   - Don't have to worry about lazy-loading or React re-renders
	 *   - Can easily filter by button/link kind using parseSnapshotEntries()
	 *
	 * See artifactCandidatesFromEntries() for filtering logic.
	 */
	private async collectArtifactCandidates(responseIndex: number) {
		const snapshot = await browser.snapshotText();
		const targetSlice = this.assistantSnapshotSlice(snapshot, responseIndex);
		if (!targetSlice) return { snapshot, targetSlice, candidates: [] };
		return {
			snapshot,
			targetSlice,
			// Parse snapshot entries and find buttons/links that look like downloadable files
			candidates: artifactCandidatesFromEntries(parseSnapshotEntries(targetSlice)),
		};
	}

	private async withHeartbeatWhile<T>(task: () => Promise<T>, intervalMs = ARTIFACT_DOWNLOAD_HEARTBEAT_MS): Promise<T> {
		let inFlight = true;
		let heartbeatRunning = false;
		const timer = setInterval(() => {
			if (!inFlight || heartbeatRunning) return;
			heartbeatRunning = true;
			void this.heartbeatFn()
				.catch(() => undefined)
				.finally(() => { heartbeatRunning = false; });
		}, intervalMs);
		(timer as unknown as { unref?: () => void }).unref?.();
		try {
			return await task();
		} finally {
			inFlight = false;
			clearInterval(timer);
		}
	}

	private async flushArtifactsState(artifacts: unknown[]): Promise<void> {
		await secureWriteText(`${this.getJobDir()}/artifacts.json`, `${JSON.stringify(artifacts, null, 2)}\n`);
	}
}