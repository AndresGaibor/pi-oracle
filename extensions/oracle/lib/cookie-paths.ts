/**
 * Cross-platform browser cookie path detection.
 *
 * Locates the browser user-data directories where cookies are stored
 * across macOS, Linux (including Flatpak/Snap), and Windows (including WSL).
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// =============================================================================
// BROWSER USER-DATA DIRECTORIES PER PLATFORM
// =============================================================================

interface BrowserDataDirs {
	darwin: string;
	linux: string[];
	win32: string;
}

const BROWSER_DATA_DIRS: Record<string, BrowserDataDirs> = {
	brave: {
		darwin: join(homedir(), "Library", "Application Support", "BraveSoftware", "Brave-Browser"),
		linux: [
			join(homedir(), ".config", "BraveSoftware", "Brave-Browser"),
			join(homedir(), ".var", "app", "com.brave.Browser", "config", "BraveSoftware", "Brave-Browser"), // Flatpak
		],
		win32: join(
			process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
			"BraveSoftware",
			"Brave-Browser",
			"User Data",
		),
	},
	chrome: {
		darwin: join(homedir(), "Library", "Application Support", "Google", "Chrome"),
		linux: [
			join(homedir(), ".config", "google-chrome"),
			join(homedir(), ".var", "app", "com.google.Chrome", "config", "google-chrome"), // Flatpak
		],
		win32: join(
			process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
			"Google",
			"Chrome",
			"User Data",
		),
	},
	edge: {
		darwin: join(homedir(), "Library", "Application Support", "Microsoft Edge"),
		linux: [
			join(homedir(), ".config", "microsoft-edge"),
		],
		win32: join(
			process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
			"Microsoft",
			"Edge",
			"User Data",
		),
	},
};

// WSL paths (Windows browsers mounted under /mnt/c)
const WSL_DATA_DIRS: Record<string, string> = {
	brave: "/mnt/c/Users/%USER%/AppData/Local/BraveSoftware/Brave-Browser/User Data",
	chrome: "/mnt/c/Users/%USER%/AppData/Local/Google/Chrome/User Data",
	edge: "/mnt/c/Program Files (x86)/Microsoft/Edge/User Data",
};

// =============================================================================
// DETECTION HELPERS
// =============================================================================

/**
 * Check if we're running inside WSL.
 */
function isWSL(): boolean {
	try {
		if (process.platform !== "linux") return false;
		const { readFileSync } = require("node:fs");
		const version = readFileSync("/proc/version", "utf-8");
		return /microsoft/i.test(version);
	} catch {
		return false;
	}
}

/**
 * Returns the Windows username for WSL path resolution.
 */
function getWindowsUsername(): string {
	return process.env.USER || process.env.USERNAME || "";
}

/**
 * Resolve WSL data dir for a browser, replacing %USER% placeholder.
 */
function resolveWSLDataDir(browser: string): string | null {
	const raw = WSL_DATA_DIRS[browser];
	if (!raw) return null;
	const resolved = raw.replace("%USER%", getWindowsUsername());
	return existsSync(resolved) ? resolved : null;
}

/**
 * Find first existing directory from a list of paths.
 */
function findExistingDir(dirs: string[]): string | null {
	for (const d of dirs) {
		if (existsSync(d)) return d;
	}
	return null;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Detect the browser user-data directory for a given browser on this platform.
 *
 * @param browser - "brave", "chrome", or "edge"
 * @returns The user-data directory path, or null if not found.
 */
export function detectBrowserDataDir(browser: "brave" | "chrome" | "edge"): string | null {
	const dirs = BROWSER_DATA_DIRS[browser];
	if (!dirs) return null;

	// WSL: check Windows-mounted paths first
	if (isWSL()) {
		const wslDir = resolveWSLDataDir(browser);
		if (wslDir) return wslDir;
	}

	const platform = process.platform as "darwin" | "linux" | "win32";
	const platformDirs = dirs[platform];

	if (!platformDirs) return null;

	// linux has multiple candidates; others are single strings
	const candidates = Array.isArray(platformDirs) ? platformDirs : [platformDirs];
	return findExistingDir(candidates);
}

/**
 * Return the full path to the Cookie file for a browser and profile.
 *
 * @param browser - "brave", "chrome", or "edge"
 * @param profile - Profile name (default: "Default")
 * @returns Path to the cookie file, or null if directory not found.
 */
export function getCookiePath(browser: "brave" | "chrome" | "edge", profile = "Default"): string | null {
	const dataDir = detectBrowserDataDir(browser);
	if (!dataDir) return null;
	return join(dataDir, profile, "Cookies");
}

/**
 * Return all known profile directories inside a browser's user-data dir.
 * Scans for "Default", "Profile 1", "Profile 2", etc.
 *
 * @param browser - "brave", "chrome", or "edge"
 * @returns Array of profile directory paths (empty if data dir not found).
 */
export function detectBrowserProfiles(browser: "brave" | "chrome" | "edge"): string[] {
	const dataDir = detectBrowserDataDir(browser);
	if (!dataDir) return [];

	const { readdirSync } = require("node:fs");
	const { join } = require("node:path");

	const profiles: string[] = [];
	try {
		const entries = readdirSync(dataDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory()) {
				const name = entry.name;
				// Chrome-like profiles: "Default", "Profile 1", "Profile 2", …
				if (name === "Default" || /^Profile \d+$/.test(name)) {
					profiles.push(join(dataDir, name));
				}
			}
		}
	} catch {
		// Directory not readable
	}

	return profiles;
}
