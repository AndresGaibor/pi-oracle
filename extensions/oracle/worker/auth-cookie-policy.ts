/**
 * Cookie policy utilities for auth-bootstrap
 * Re-exports from lib/cookies.ts for compatibility
 */
export {
	normalizeImportedCookie,
	classifyImportedCookie,
	filterImportableAuthCookies,
	ensureAccountCookie,
	AUTH_COOKIE_NAME_PATTERNS,
	DROPPED_COOKIE_NAME_PATTERNS,
	CHATGPT_COOKIE_ORIGINS,
	type Cookie,
	type CookieFilterResult,
} from "../lib/cookies";
