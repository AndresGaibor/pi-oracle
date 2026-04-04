/**
 * Cookie utilities using sweet-cookie
 * Reads cookies directly from browser SQLite without CDP
 */
import { getCookies } from "@steipete/sweet-cookie";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CHATGPT_COOKIE_ORIGINS = [
	"https://chatgpt.com",
	"https://chat.openai.com",
	"https://atlas.openai.com",
	"https://auth.openai.com",
	"https://sentinel.openai.com",
	"https://ws.chatgpt.com",
];

export const AUTH_COOKIE_NAME_PATTERNS = [
	/^__Secure-next-auth\.session-token(?:\.|$)/,
	/^__Secure-next-auth\.callback-url$/,
	/^_account$/,
	/^_account_is_fedramp$/,
	/^_puid$/,
	/^unified_session_manifest$/,
	/^oai-(?:client-auth-info|client-auth-session|sc|did|hlib|asli|last-model-config|chat-web-route)$/,
	/^auth-session-minimized(?:-client-checksum)?$/,
	/^(?:login_session|auth_provider|hydra_redirect|iss_context|rg_context)$/,
	/^cf_clearance$/,
];

export const DROPPED_COOKIE_NAME_PATTERNS = [
	/^_ga(?:_|$)/,
	/^_uet/,
	/^_rdt_uuid$/,
	/^(?:marketing|analytics)_consent$/,
	/^__cf_bm$/,
	/^__cflb$/,
	/^_cfuvid$/,
	/^_dd_s$/,
	/^g_state$/,
	/^country$/,
	/^oai-nav-state$/,
	/^oai-login-csrf/,
	/^__Secure-next-auth\.state$/,
	/^__Host-next-auth\.csrf-token$/,
];

const BASE_ALLOWED_COOKIE_HOSTS = new Set([
	'chatgpt.com',
	'chat.openai.com',
	'openai.com',
	'auth.openai.com',
	'sentinel.openai.com',
	'atlas.openai.com',
	'ws.chatgpt.com',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Cookie {
	name: string;
	value: string;
	domain: string;
	path: string;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "Strict" | "Lax" | "None";
	expires?: number;
}

export interface CookieFilterResult {
	cookies: Cookie[];
	dropped: Array<{ cookie: Cookie; reason: string }>;
}

export interface ReadCookiesOptions {
	/** URL to filter cookies for (e.g., "https://chatgpt.com/") */
	url: string;
	/** Additional origins to include (defaults to CHATGPT_COOKIE_ORIGINS) */
	origins?: string[];
	/** Browser profile path (e.g., Brave Default profile) */
	profilePath: string;
	/** Browsers to read from (defaults to ["chrome"]) */
	browsers?: string[];
	/** Timeout in milliseconds (defaults to 5000) */
	timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Cookie normalization (from auth-cookie-policy.ts)
// ---------------------------------------------------------------------------

function normalizeSameSite(value: any): "Strict" | "Lax" | "None" | undefined {
	if (value === 'Lax' || value === 'Strict' || value === 'None') return value;
	return undefined;
}

function normalizeExpiration(expires: any): number | undefined {
	if (!expires || Number.isNaN(expires)) return undefined;
	const value = Number(expires);
	if (!Number.isFinite(value) || value <= 0) return undefined;
	// Chrome epoch timestamp (microseconds since Windows epoch)
	if (value > 10_000_000_000_000) return Math.round(value / 1_000_000 - 11644473600);
	// Milliseconds
	if (value > 10_000_000_000) return Math.round(value / 1000);
	// Already in seconds
	return Math.round(value);
}

function normalizeDomain(domain: any, fallbackHost: string | undefined): string | undefined {
	const raw = typeof domain === 'string' && domain.trim() ? domain.trim() : fallbackHost;
	if (!raw) return undefined;
	return raw.replace(/^\.+/, '').toLowerCase();
}

function allowedCookieHosts(chatUrl: string): Set<string> {
	const hosts = new Set(BASE_ALLOWED_COOKIE_HOSTS);
	try {
		hosts.add(new URL(chatUrl).hostname.toLowerCase());
	} catch {
		// ignore invalid URL here; caller validation happens elsewhere
	}
	return hosts;
}

function isAllowedCookieDomain(domain: string, chatUrl: string): boolean {
	const hosts = allowedCookieHosts(chatUrl);
	return hosts.has(domain);
}

function matchesAny(patterns: RegExp[], value: string): boolean {
	return patterns.some((pattern) => pattern.test(value));
}

/**
 * Normalize imported cookie to standard format
 */
export function normalizeImportedCookie(cookie: any, fallbackHost: string): Cookie | undefined {
	if (!cookie?.name) return undefined;
	const domain = normalizeDomain(cookie.domain, fallbackHost);
	if (!domain) return undefined;
	return {
		name: cookie.name,
		value: cookie.value ?? '',
		domain,
		path: cookie.path || '/',
		expires: normalizeExpiration(cookie.expires),
		httpOnly: cookie.httpOnly ?? false,
		secure: cookie.secure ?? true,
		sameSite: normalizeSameSite(cookie.sameSite),
	};
}

/**
 * Classify cookie for filtering
 */
export function classifyImportedCookie(cookie: Cookie, chatUrl: string): 'keep' | 'noise' | 'foreign-domain' | 'non-auth' {
	if (matchesAny(DROPPED_COOKIE_NAME_PATTERNS, cookie.name)) return 'noise';
	if (!isAllowedCookieDomain(cookie.domain, chatUrl)) return 'foreign-domain';
	if (!matchesAny(AUTH_COOKIE_NAME_PATTERNS, cookie.name)) return 'non-auth';
	return 'keep';
}

/**
 * Filter cookies to keep only authentication-related ones
 * Normalizes and deduplicates cookies by domain:name
 */
export function filterImportableAuthCookies(cookies: any[], chatUrl: string): CookieFilterResult {
	const fallbackHost = (() => {
		try {
			return new URL(chatUrl).hostname;
		} catch {
			return 'chatgpt.com';
		}
	})();

	const merged = new Map<string, Cookie>();
	const dropped: Array<{ cookie: Cookie; reason: string }> = [];

	for (const cookie of cookies) {
		const normalized = normalizeImportedCookie(cookie, fallbackHost);
		if (!normalized) continue;

		const disposition = classifyImportedCookie(normalized, chatUrl);
		if (disposition !== 'keep') {
			dropped.push({ cookie: normalized, reason: disposition });
			continue;
		}

		// Deduplicate by domain:name
		const key = `${normalized.domain}:${normalized.name}`;
		if (!merged.has(key)) {
			merged.set(key, normalized);
		}
	}

	return { cookies: Array.from(merged.values()), dropped };
}

/**
 * Synthesize _account cookie if missing (required by ChatGPT)
 * Checks for _account_is_fedramp to determine account type
 */
export function ensureAccountCookie(cookies: Cookie[], chatUrl: string): {
	cookies: Cookie[];
	synthesized: boolean;
	value?: string;
} {
	const next = [...cookies];
	const hasAccountCookie = next.some((cookie) => cookie.name === '_account');
	if (hasAccountCookie) {
		return { cookies: next, synthesized: false };
	}

	// Check if this is a fedramp account
	const fedrampCookie = next.find((cookie) => cookie.name === '_account_is_fedramp');
	const isFedramp = /^(1|true|yes)$/i.test(String(fedrampCookie?.value || ''));
	const fallbackAccountValue = isFedramp ? 'fedramp' : 'personal';

	const domain = (() => {
		try {
			return new URL(chatUrl).hostname;
		} catch {
			return 'chatgpt.com';
		}
	})();

	next.push({
		name: '_account',
		value: fallbackAccountValue,
		domain,
		path: '/',
		secure: true,
		httpOnly: false,
		sameSite: 'Lax',
	});

	return { cookies: next, synthesized: true, value: fallbackAccountValue };
}

// ---------------------------------------------------------------------------
// Cookie reading with sweet-cookie
// ---------------------------------------------------------------------------

/**
 * Read cookies from browser profile using sweet-cookie
 * 
 * @example
 * ```ts
 * const result = await readCookiesFromBrowser({
 *   url: "https://chatgpt.com/",
 *   profilePath: "<use cookie-paths or config to resolve>"

 * });
 * console.log(`Read ${result.cookies.length} cookies`);
 * ```
 */
export async function readCookiesFromBrowser(
	options: ReadCookiesOptions
): Promise<{ cookies: Cookie[]; warnings: string[] }> {
	const {
		url,
		origins = CHATGPT_COOKIE_ORIGINS,
		profilePath,
		browsers = ["chrome"],
		timeoutMs = 5_000,
	} = options;

	const { cookies, warnings } = await getCookies({
		url,
		origins,
		browsers,
		mode: "merge",
		chromeProfile: profilePath,
		timeoutMs,
	});

	return { cookies: cookies as Cookie[], warnings };
}

/**
 * Read and filter ChatGPT authentication cookies from browser
 * 
 * @example
 * ```ts
 * const result = await readChatGPTCookies({
 *   profilePath: "<use cookie-paths or config to resolve>"

 * });
 * 
 * if (result.hasSessionToken) {
 *   console.log("✅ Found session token!");
 * }
 * ```
 */
export async function readChatGPTCookies(options: {
	profilePath: string;
	chatUrl?: string;
}): Promise<{
	cookies: Cookie[];
	warnings: string[];
	hasSessionToken: boolean;
	hasAccount: boolean;
	dropped: Array<{ cookie: Cookie; reason: string }>;
}> {
	const chatUrl = options.chatUrl || "https://chatgpt.com/";

	// Read all cookies
	const { cookies: rawCookies, warnings } = await readCookiesFromBrowser({
		url: chatUrl,
		profilePath: options.profilePath,
	});

	// Filter to auth cookies only
	const filtered = filterImportableAuthCookies(rawCookies, chatUrl);

	// Check for required cookies
	const hasSessionToken = filtered.cookies.some((c) =>
		c.name.startsWith("__Secure-next-auth.session-token")
	);
	const hasAccount = filtered.cookies.some((c) => c.name === "_account");

	// Ensure _account cookie if missing
	let finalCookies = filtered.cookies;
	if (!hasAccount && hasSessionToken) {
		const ensured = ensureAccountCookie(filtered.cookies, chatUrl);
		finalCookies = ensured.cookies;
	}

	return {
		cookies: finalCookies,
		warnings,
		hasSessionToken,
		hasAccount,
		dropped: filtered.dropped,
	};
}
