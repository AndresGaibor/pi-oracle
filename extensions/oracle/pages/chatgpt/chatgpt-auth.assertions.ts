/**
 * ChatGPT Auth Assertions – state checks for authentication flow.
 */
import { AUTH_LABELS, AUTH_SELECTORS, CHALLENGE_PATTERNS, OUTAGE_PATTERNS, labelMatches } from "./chatgpt-auth.selectors";
import { buildLoginProbeScript, type LoginProbeResult } from "../../shared/login-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SnapshotEntry {
	ref: string;
	kind?: string;
	label?: string;
	disabled?: boolean;
	href?: string;
}

// ---------------------------------------------------------------------------
// Snapshot parsing
// ---------------------------------------------------------------------------

function parseSnapshotEntries(snapshot: string): SnapshotEntry[] {
	return snapshot
		.split("\n")
		.map((line) => {
			const refMatch = line.match(/\bref=(e\d+|@e\d+)\b/);
			if (!refMatch) return undefined;
			const kindMatch = line.match(/^\s*-\s*([^\s]+)/);
			const quotedMatch = line.match(/"([^"]*)"/);
			const hrefMatch = line.match(/href="([^"]+)"/);
			return {
				ref: refMatch[1].startsWith("@") ? refMatch[1] : `@${refMatch[1]}`,
				kind: kindMatch ? kindMatch[1] : undefined,
				label: quotedMatch ? quotedMatch[1] : undefined,
				href: hrefMatch ? hrefMatch[1] : undefined,
				disabled: /\bdisabled\b/.test(line),
			};
		})
		.filter(Boolean) as SnapshotEntry[];
}

// ---------------------------------------------------------------------------
// Auth state assertions
// ---------------------------------------------------------------------------

/** Check if on auth page by URL */
export function isOnAuthPage(url: string): boolean {
	return (
		/^auth\.openai\.com$/i.test(new URL(url).hostname) ||
		/^\/(auth|login|signin|log-in)/i.test(new URL(url).pathname)
	);
}

/** Check if login CTA is visible in snapshot */
export function hasLoginCta(snapshot: string): boolean {
	const entries = parseSnapshotEntries(snapshot);
	return entries.some(
		(e) =>
			(e.kind === "button" || e.kind === "link") &&
			!!e.label &&
			labelMatches(e.label, AUTH_LABELS.login),
	);
}

/** Check if auth page has composer (indicates ready state) */
export function hasComposer(snapshot: string): boolean {
	const composerLabels = [
		"Chat with ChatGPT",
		"Chatear con ChatGPT",
		"Pregunta lo que quieras",
	];
	return parseSnapshotEntries(snapshot).some(
		(e) => e.kind === "textbox" && labelMatches(e.label, composerLabels),
	);
}

// ---------------------------------------------------------------------------
// Challenge / outage detection
// ---------------------------------------------------------------------------

/** Detect challenge page (Cloudflare, CAPTCHA, etc) */
export function detectChallenge(text: string): { detected: boolean; type?: string } {
	for (const [pattern, type] of CHALLENGE_PATTERNS) {
		if (pattern.test(text)) return { detected: true, type };
	}
	return { detected: false };
}

/** Detect outage/error page */
export function detectOutage(text: string): { detected: boolean; type?: string } {
	for (const [pattern, type] of OUTAGE_PATTERNS) {
		if (pattern.test(text)) return { detected: true, type };
	}
	return { detected: false };
}

// ---------------------------------------------------------------------------
// Login probe
// ---------------------------------------------------------------------------

/** Build the login probe script */
export function getLoginProbeScript(timeoutMs: number = 5000): string {
	return buildLoginProbeScript(timeoutMs);
}

/** Parse login probe result */
export function parseLoginProbeResult(result: unknown): LoginProbeResult | null {
	if (!result || typeof result !== "object") return null;
	const r = result as Record<string, unknown>;
	return {
		ok: r.ok === true,
		status: typeof r.status === "number" ? r.status : 0,
		pageUrl: typeof r.pageUrl === "string" ? r.pageUrl : undefined,
		domLoginCta: r.domLoginCta === true,
		onAuthPage: r.onAuthPage === true,
		error: typeof r.error === "string" ? r.error : undefined,
		bodyKeys: Array.isArray(r.bodyKeys) ? r.bodyKeys : [],
		bodyHasId: r.bodyHasId === true,
		bodyHasEmail: r.bodyHasEmail === true,
	};
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { parseSnapshotEntries };
export type { SnapshotEntry };
