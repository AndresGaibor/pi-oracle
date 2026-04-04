/**
 * ChatGPT Auth Selectors – locators and labels for auth-related UI.
 */

export const AUTH_SELECTORS = {
	loginButton: [
		'button[data-testid*="login"]',
		'button[data-testid*="log-in"]',
		'button[type="submit"]',
	] as const,

	loginLink: [
		'a[href*="/auth/login"]',
		'a[href*="/auth/signin"]',
	] as const,

	accountChooser: [
		'[data-testid="account-switcher"]',
		'button[aria-label*="account"]',
	] as const,
} as const;

export const AUTH_LABELS = {
	login: [
		"Log in",
		"Sign up",
		"Iniciar sesión",
		"Registrate",
		"Acceder",
		"Entrar",
	] as const,

	authUrls: [
		"/auth/login",
		"/auth/signin",
		"/auth/log-in",
	] as const,
} as const;

// ---------------------------------------------------------------------------
// Challenge / outage detection patterns
// ---------------------------------------------------------------------------

export const CHALLENGE_PATTERNS: [RegExp, string][] = [
	[/just a moment/i, "cloudflare"],
	[/verify you are human/i, "human-verification"],
	[/captcha|turnstile|hcaptcha/i, "captcha"],
	[/unusual activity detected/i, "suspicious-activity"],
	[/we detect suspicious activity/i, "suspicious-activity"],
] as const;

export const OUTAGE_PATTERNS: [RegExp, string][] = [
	[/something went wrong/i, "generic-error"],
	[/a network error occurred/i, "network-error"],
	[/an error occurred while connecting to the websocket/i, "websocket-error"],
	[/try again later/i, "rate-limit"],
	[/rate limit/i, "rate-limit"],
] as const;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

export function labelMatches(actual: string | undefined, candidates: readonly string[]): boolean {
	if (!actual) return false;
	const normalized = actual.toLowerCase().trim();
	return candidates.some((c) => normalized.includes(c.toLowerCase()));
}
