/**
 * Cross-platform browser detection module.
 *
 * Strategy (layered):
 *   1. Explicit user config  (executablePath from OracleConfig)
 *   2. Environment variable  (BROWSER_PATH or ORACLE_BROWSER_PATH)
 *   3. Auto-detect by OS     (known paths per platform)
 *   4. Fallback              ("chromium" — Playwright bundled)
 */

import { existsSync, readFileSync } from "node:fs";

// =============================================================================
// TYPES
// =============================================================================

export type BrowserName = "chrome" | "brave" | "edge" | "chromium" | "firefox";

export interface DetectedBrowser {
	name: BrowserName;
	executablePath: string;
	source: "config" | "env" | "auto" | "fallback";
}

// =============================================================================
// KNOWN EXECUTABLE PATHS PER PLATFORM
// =============================================================================

const CHROME_PATHS: Record<string, string[]> = {
	darwin: [
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	],
	linux: [
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/usr/bin/chromium-browser",
		"/usr/bin/chromium",
		"/snap/bin/chromium",
		"/snap/bin/google-chrome",
		"/var/lib/flatpak/exports/bin/com.google.Chrome",
	],
	win32: [
		"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
	],
};

const BRAVE_PATHS: Record<string, string[]> = {
	darwin: [
		"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
	],
	linux: [
		"/usr/bin/brave-browser",
		"/usr/bin/brave-browser-stable",
		"/usr/bin/brave",
		"/snap/bin/brave",
		"/var/lib/flatpak/exports/bin/com.brave.Browser",
	],
	win32: [
		"C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
		"C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
	],
};

const EDGE_PATHS: Record<string, string[]> = {
	darwin: [
		"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
	],
	linux: [
		"/usr/bin/microsoft-edge",
		"/usr/bin/microsoft-edge-stable",
	],
	win32: [
		"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
		"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
	],
};

// WSL-specific paths (Windows browsers mounted under /mnt/c)
const WSL_BROWSER_PATHS: Record<string, string[]> = {
	chrome: [
		"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
		"/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
	],
	brave: [
		"/mnt/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
		"/mnt/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe",
	],
	edge: [
		"/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
		"/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe",
	],
};

// =============================================================================
// USER-AGENT STRINGS PER PLATFORM
// =============================================================================

const UA_TEMPLATES: Record<string, (version: string) => string> = {
	darwin: (v) =>
		`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`,
	linux: (v) =>
		`Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`,
	win32: (v) =>
		`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`,
};

// =============================================================================
// DETECTION HELPERS
// =============================================================================

/**
 * Check if we're running inside WSL (Windows Subsystem for Linux).
 */
function isWSL(): boolean {
	try {
		if (process.platform !== "linux") return false;
		const version = readFileSync("/proc/version", "utf-8");
		return /microsoft/i.test(version);
	} catch {
		return false;
	}
}

/**
 * Returns the first path that exists from a list.
 */
function findExisting(paths: string[]): string | null {
	for (const p of paths) {
		if (existsSync(p)) return p;
	}
	return null;
}

/**
 * Detect WSL-mounted Windows browser paths for a given browser.
 */
function detectWSLBrowserPath(browser: keyof typeof WSL_BROWSER_PATHS): string | null {
	return findExisting(WSL_BROWSER_PATHS[browser]);
}

/**
 * Detect Chrome/Chromium executable on the current platform.
 */
export function detectChromePath(): string | null {
	if (isWSL()) {
		const wslPath = detectWSLBrowserPath("chrome");
		if (wslPath) return wslPath;
	}
	const paths = (CHROME_PATHS as Record<string, string[]>)[process.platform] ?? [];
	return findExisting(paths);
}

/**
 * Detect Brave executable on the current platform.
 */
export function detectBravePath(): string | null {
	if (isWSL()) {
		const wslPath = detectWSLBrowserPath("brave");
		if (wslPath) return wslPath;
	}
	const paths = (BRAVE_PATHS as Record<string, string[]>)[process.platform] ?? [];
	return findExisting(paths);
}

/**
 * Detect Edge executable on the current platform.
 */
export function detectEdgePath(): string | null {
	if (isWSL()) {
		const wslPath = detectWSLBrowserPath("edge");
		if (wslPath) return wslPath;
	}
	const paths = (EDGE_PATHS as Record<string, string[]>)[process.platform] ?? [];
	return findExisting(paths);
}

/**
 * Attempt to read the browser version by executing the binary with --version.
 * Returns the version string or null on failure.
 */
export function detectBrowserVersion(executablePath: string): string | null {
	try {
		const { execFileSync } = require("node:child_process");
		const output = execFileSync(executablePath, ["--version"], {
			encoding: "utf8",
			timeout: 5_000,
		}).trim();
		const match = output.match(/(\d+\.\d+\.\d+\.\d+)/);
		return match ? match[1] : null;
	} catch {
		return null;
	}
}

/**
 * Build a User-Agent string appropriate for the current platform and browser version.
 */
export function buildUserAgent(executablePath: string): string | null {
	const version = detectBrowserVersion(executablePath);
	if (!version) return null;
	const template = UA_TEMPLATES[process.platform as string];
	return template ? template(version) : null;
}

// =============================================================================
// AUTO-DETECT (preferred browser order: Brave → Chrome → Edge)
// =============================================================================

/**
 * Auto-detect the best available browser on this platform.
 * Preference order: Brave → Chrome → Edge.
 *
 * @returns Detected browser info, or null if nothing found.
 */
export function autoDetectBrowser(): DetectedBrowser | null {
	const bravePath = detectBravePath();
	if (bravePath) return { name: "brave", executablePath: bravePath, source: "auto" };

	const chromePath = detectChromePath();
	if (chromePath) return { name: "chrome", executablePath: chromePath, source: "auto" };

	const edgePath = detectEdgePath();
	if (edgePath) return { name: "edge", executablePath: edgePath, source: "auto" };

	return null;
}

// =============================================================================
// LAYERED RESOLUTION (the public API)
// =============================================================================

/**
 * Resolve the browser executable path using layered strategy:
 *   1. Explicit config path
 *   2. Environment variable (BROWSER_PATH / ORACLE_BROWSER_PATH)
 *   3. Auto-detect by OS
 *   4. Fallback to "chromium" (Playwright bundled)
 *
 * @param configExecutablePath - Path from user configuration
 * @param preferredBrowser - Hint for browser name preference
 */
export function resolveBrowserPath(
	configExecutablePath?: string,
	preferredBrowser?: BrowserName,
): DetectedBrowser {
	// Layer 1: explicit config
	if (configExecutablePath) {
		return {
			name: preferredBrowser ?? "chromium",
			executablePath: configExecutablePath,
			source: "config",
		};
	}

	// Layer 2: environment variable
	const envPath = process.env.BROWSER_PATH ?? process.env.ORACLE_BROWSER_PATH;
	if (envPath) {
		return {
			name: preferredBrowser ?? "chromium",
			executablePath: envPath,
			source: "env",
		};
	}

	// Layer 3: auto-detect
	const detected = autoDetectBrowser();
	if (detected) return detected;

	// Layer 4: fallback to Playwright bundled chromium
	return {
		name: "chromium",
		executablePath: "chromium",
		source: "fallback",
	};
}
