/**
 * AIJobRunner – orchestrates a single oracle job.
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
import { stat, chmod, rm, rename } from "node:fs/promises";
import { basename, join } from "node:path";
import * as browser from "../lib/browser";
import type { AIProviderPage } from "../pages/ai-provider.types";
import type { BrowserActions } from "../pages/browser-actions.types";
import { CHATGPT_LABELS as DEFAULT_LABELS, MODEL_FAMILY_PREFIX, EFFORT_LABELS } from "../pages/chatgpt/chatgpt.selectors";
import { parseSnapshotEntries, findEntry, findLastEntry, labelMatches, type ParsedSnapshotEntry } from "../shared/snapshot-utils";
import { isResponseComplete, findArtifactCandidates, preferredArtifactName } from "../pages/chatgpt/chatgpt.assertions";
import { CHAT_URL_POLL_MS, CHAT_URL_STABLE_COUNT, CONVERSATION_REOPEN_SETTLE_MS, ARTIFACT_RETRY_SETTLE_MS, ARTIFACT_CANDIDATE_STABILITY_TIMEOUT_MS, ARTIFACT_CANDIDATE_STABILITY_POLL_MS, ARTIFACT_CANDIDATE_STABILITY_POLLS, ARTIFACT_DOWNLOAD_HEARTBEAT_MS, ARTIFACT_DOWNLOAD_TIMEOUT_MS, ARTIFACT_DOWNLOAD_MAX_ATTEMPTS } from "./constants";
import { ensurePrivateDir, secureWriteText, sha256File as sha256, detectType, stripQuery, parseConversationId, snapshotHasLabel, sleep } from "../shared/helpers";
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


function effortLabelsFor(effortLabel: string): string[] {
	if (!effortLabel) return [];
	const key = effortLabel.toLowerCase();
	return (EFFORT_LABELS[key] as string[]) || [effortLabel];
}

function allEffortLabels(): string[] {
	return [...new Set(Object.values(EFFORT_LABELS).flat())];
}

// stripQuery, parseConversationId, ensurePrivateDir, secureWriteText, sha256, detectType, sleep — imported from ../shared/helpers

const snapshotShowsCompletedResponse = isResponseComplete;

// ---------------------------------------------------------------------------
// AIJobRunner
// ---------------------------------------------------------------------------

/**
 * AIJobRunner — orchestrates a complete oracle job lifecycle.
 *
 * Coordinates the infrastructure (browser layer) and domain (AIProviderPage)
 * to execute a single job: launch browser → verify auth → send prompt →
 * wait for response → download artifacts.
 *
 * This class is the application/service layer. It does NOT know about
 * specific providers — it delegates to AIProviderPage for all provider-specific logic.
 */
export class AIJobRunner {
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
				if (stableCount >= CHAT_URL_STABLE_COUNT) return url;
			}
			await sleep(CHAT_URL_POLL_MS);
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
						await sleep(ARTIFACT_RETRY_SETTLE_MS);
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
		await sleep(CONVERSATION_REOPEN_SETTLE_MS);
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
 * See findArtifactCandidates() for filtering logic.
	 */
	private async collectArtifactCandidates(responseIndex: number) {
		const snapshot = await browser.snapshotText();
		const targetSlice = this.assistantSnapshotSlice(snapshot, responseIndex);
		if (!targetSlice) return { snapshot, targetSlice, candidates: [] };
		return {
			snapshot,
			targetSlice,
			// Parse snapshot entries and find buttons/links that look like downloadable files
candidates: findArtifactCandidates(targetSlice),
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