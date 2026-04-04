import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, normalize } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { resolveBrowserPath, detectBrowserVersion } from "./browser-detection";
import { detectBrowserDataDir } from "./cookie-paths";

export const MODEL_FAMILIES = ["instant", "thinking", "pro"] as const;
export type OracleModelFamily = (typeof MODEL_FAMILIES)[number];

export const EFFORTS = ["light", "standard", "extended", "heavy"] as const;
export type OracleEffort = (typeof EFFORTS)[number];

export const BROWSER_RUN_MODES = ["headless", "headed"] as const;
export type OracleBrowserRunMode = (typeof BROWSER_RUN_MODES)[number];

export const CLONE_STRATEGIES = ["apfs-clone", "copy"] as const;
export type OracleCloneStrategy = (typeof CLONE_STRATEGIES)[number];

const PRO_EFFORTS: readonly OracleEffort[] = [
	"standard",
	"extended",
];
const ALLOWED_CHATGPT_ORIGINS = new Set([
	"https://chatgpt.com",
	"https://chat.openai.com",
]);
const PROJECT_OVERRIDE_KEYS = new Set([
	"defaults",
	"worker",
	"poller",
	"artifacts",
	"cleanup",
]);

export interface OracleConfig {
	defaults: {
		modelFamily: OracleModelFamily;
		effort: OracleEffort;
		autoSwitchToThinking: boolean;
	};
	browser: {
		sessionPrefix: string;
		authSeedProfileDir: string;
		runtimeProfilesDir: string;
		maxConcurrentJobs: number;
		cloneStrategy: string;
		chatUrl: string;
		authUrl: string;
		/** Optional provider key (e.g. 'chatgpt', 'claude') */
		aiProvider?: string;
		runMode: OracleBrowserRunMode;
		executablePath?: string;
		userAgent?: string;
		args: string[];
	};
	auth: {
		pollMs: number;
		bootstrapTimeoutMs: number;
		chromeProfile: string;
		chromeCookiePath?: string;
	};
	worker: {
		pollMs: number;
		completionTimeoutMs: number;
	};
	poller: {
		intervalMs: number;
	};
	artifacts: {
		capture: boolean;
	};
	cleanup: {
		completeJobRetentionMs: number;
		failedJobRetentionMs: number;
		};
}

// =============================================================================
// MULTIPLATFORM BROWSER DETECTION (delegates to browser-detection.ts)
// =============================================================================

/**
 * Detect the default Chrome executable path on the current platform.
 * Delegates to browser-detection.ts for multiplatform support.
 */
function detectDefaultChromeExecutablePath(): string | undefined {
	const detected = resolveBrowserPath(undefined, "chrome");
	return detected.source !== "fallback"
		? detected.executablePath
		: undefined;
}

/**
 * Detect the default Brave executable path on the current platform.
 * Delegates to browser-detection.ts for multiplatform support.
 */
function detectDefaultBraveExecutablePath(): string | undefined {
	const detected = resolveBrowserPath(undefined, "brave");
	return detected.source !== "fallback"
		? detected.executablePath
		: undefined;
}

/**
 * Build a User-Agent string for the current platform based on a browser executable.
 * Uses the platform-appropriate template (macOS/Linux/Windows).
 */
function detectDefaultUserAgent(executablePath: string | undefined): string | undefined {
	if (!executablePath) return undefined;
	try {
		const version = detectBrowserVersion(executablePath);
		if (!version) return undefined;
		const osPart = process.platform === "darwin"
			? "Macintosh; Intel Mac OS X 10_15_7"
			: process.platform === "win32"
				? "Windows NT 10.0; Win64; x64"
				: "X11; Linux x86_64";
		return `Mozilla/5.0 (${osPart}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
	} catch {
		return undefined;
	}
}

/**
 * Detect the default browser profile name by reading Local State.
 * Uses cookie-paths to find the browser data directory on any platform.
 */
function detectDefaultBrowserProfileName(browser: "brave" | "chrome"): string {
	const dataDir = detectBrowserDataDir(browser);
	if (!dataDir) return "Default";
	const localStatePath = join(dataDir, "Local State");
	if (!existsSync(localStatePath)) return "Default";
	try {
		const localState = JSON.parse(readFileSync(localStatePath, "utf8")) as {
			profile?: { last_used?: string };
		};
		const lastUsed = localState?.profile?.last_used;
		return typeof lastUsed === "string" && lastUsed.trim()
			? lastUsed.trim()
			: "Default";
	} catch {
		return "Default";
	}
}

// =============================================================================
// DEFAULT CONFIG — computed at module load time
// =============================================================================

const browserResolution = resolveBrowserPath();
const detectedExecutablePath = browserResolution.source !== "fallback"
	? browserResolution.executablePath
	: undefined;
const detectedUserAgent = detectedExecutablePath
	? detectDefaultUserAgent(detectedExecutablePath)
	: undefined;
const agentExtensionsDir = join(getAgentDir(), "extensions");
const detectedProfileName = detectDefaultBrowserProfileName(
	browserResolution.name === "brave" ? "brave" : "chrome",
);

/** Default clone strategy: apfs-clone only on macOS, copy everywhere else */
const DEFAULT_CLONE_STRATEGY = process.platform === "darwin" ? "apfs-clone" : "copy";

export const DEFAULT_CONFIG: OracleConfig = {
	defaults: {
		modelFamily: "pro",
		effort: "extended",
		autoSwitchToThinking: false,
	},
	browser: {
		sessionPrefix: "oracle",
		authSeedProfileDir: join(agentExtensionsDir, "oracle-auth-seed-profile"),
		runtimeProfilesDir: join(agentExtensionsDir, "oracle-runtime-profiles"),
		maxConcurrentJobs: 2,
		cloneStrategy: DEFAULT_CLONE_STRATEGY,
		chatUrl: "https://chatgpt.com/",
		authUrl: "https://chatgpt.com/auth/login",
		runMode: "headless",
		executablePath: detectedExecutablePath,
		userAgent: detectedUserAgent,
		args: ["--disable-blink-features=AutomationControlled"],
	},
	auth: {
		pollMs: 1000,
		bootstrapTimeoutMs: 10 * 60 * 1000,
		chromeProfile: detectedProfileName,
		chromeCookiePath: undefined,
	},
	worker: {
		pollMs: 5000,
		completionTimeoutMs: 90 * 60 * 1000,
	},
	poller: {
		intervalMs: 5000,
	},
	artifacts: {
		capture: true,
	},
	cleanup: {
		completeJobRetentionMs: 14 * 24 * 60 * 60 * 1000,
		failedJobRetentionMs: 30 * 24 * 60 * 60 * 1000,
	},
};

// =============================================================================
// CONFIG VALIDATION
// =============================================================================

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: unknown): T {
	if (!isObject(base) || !isObject(override)) {
		return (override as T) ?? base;
	}

	const result: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(override)) {
		const existing = result[key];
		result[key] =
			isObject(existing) && isObject(value)
				? deepMerge(existing, value)
				: value;
	}
	return result as T;
}

function readJson(path: string): unknown {
	if (!existsSync(path)) return undefined;
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		throw new Error(
			`Failed to parse oracle config ${path}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
	if (!isObject(value)) {
		throw new Error(`Invalid oracle config: ${path} must be an object`);
	}
	return value;
}

function expectString(value: unknown, path: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(
			`Invalid oracle config: ${path} must be a non-empty string`,
		);
	}
	return value;
}

function expandHomePath(value: string): string {
	if (value === "~") return homedir();
	if (value.startsWith("~/")) return join(homedir(), value.slice(2));
	return value;
}

/** Known browser user-data directories used for profile safety checks */
function getRealBrowserUserDirs(): string[] {
	const dirs: string[] = [];
	for (const browser of ["brave", "chrome", "edge"] as const) {
		const dir = detectBrowserDataDir(browser);
		if (dir) dirs.push(dir);
	}
	return dirs;
}

function expectSafeProfilePath(pathValue: string, path: string): string {
	if (pathValue === "/" || pathValue === homedir()) {
		throw new Error(
			`Invalid oracle config: ${path} points to an unsafe directory`,
		);
	}
	const realDirs = getRealBrowserUserDirs();
	if (
		realDirs.some(
			(dir) => pathValue === dir || pathValue.startsWith(`${dir}/`)
		)
	) {
		throw new Error(
			`Invalid oracle config: ${path} must not point into the real browser user-data directory`,
		);
	}
	return pathValue;
}

function expectSafeProfileDir(value: unknown, path: string): string {
	return expectSafeProfilePath(expectAbsoluteNormalizedPath(value, path), path);
}

function expectBoolean(value: unknown, path: string): boolean {
	if (typeof value !== "boolean") {
		throw new Error(`Invalid oracle config: ${path} must be a boolean`);
	}
	return value;
}

function expectOptionalString(
	value: unknown,
	path: string,
): string | undefined {
	if (value === undefined) return undefined;
	return expectString(value, path);
}

function expectOptionalAbsoluteNormalizedPath(
	value: unknown,
	path: string,
): string | undefined {
	if (value === undefined) return undefined;
	return expectAbsoluteNormalizedPath(value, path);
}

function expectStringArray(value: unknown, path: string): string[] {
	if (
		!Array.isArray(value) ||
		value.some((item) => typeof item !== "string" || item.trim() === "")
	) {
		throw new Error(
			`Invalid oracle config: ${path} must be an array of non-empty strings`,
		);
	}
	return value;
}

function expectInteger(
	value: unknown,
	path: string,
	minimum: number,
	maximum?: number,
): number {
	if (
		typeof value !== "number" ||
		!Number.isInteger(value) ||
		value < minimum ||
		(maximum !== undefined && value > maximum)
	) {
		const range =
			maximum === undefined
				? `>= ${minimum}`
				: `between ${minimum} and ${maximum}`;
		throw new Error(
			`Invalid oracle config: ${path} must be an integer ${range}`,
		);
	}
	return value;
}

function expectEnum<T extends readonly string[]>(
	value: unknown,
	path: string,
	allowed: T,
): T[number] {
	if (typeof value !== "string" || !allowed.includes(value)) {
		throw new Error(
			`Invalid oracle config: ${path} must be one of ${allowed.join(", ")}`,
		);
	}
	return value as T[number];
}

function expectProviderUrl(value: unknown, path: string): string {
	const url = expectString(value, path);
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:") {
			throw new Error("unsupported protocol");
		}
		return parsed.toString();
	} catch {
		throw new Error(`Invalid oracle config: ${path} must be an https URL`);
	}
}

function expectAbsoluteNormalizedPath(value: unknown, path: string): string {
	const expanded = expandHomePath(expectString(value, path));
	if (!isAbsolute(expanded)) {
		throw new Error(`Invalid oracle config: ${path} must be an absolute path`);
	}
	return normalize(expanded);
}

function filterProjectConfig(value: unknown): unknown {
	if (value === undefined) return undefined;
	const root = expectObject(value, "project config root");
	for (const key of Object.keys(root)) {
		if (!PROJECT_OVERRIDE_KEYS.has(key)) {
			throw new Error(
				`Invalid oracle project config: ${key} cannot be overridden at the project level`,
			);
		}
	}
	return root;
}

function normalizeLegacyBrowserConfig(
	root: Record<string, unknown>,
): Record<string, unknown> {
	const browser = expectObject(root.browser, "browser");
	const legacySessionName = browser.sessionName;
	const legacyProfileDir = browser.profileDir;
	if (legacySessionName !== undefined && browser.sessionPrefix === undefined) {
		browser.sessionPrefix = legacySessionName;
	}
	if (
		legacyProfileDir !== undefined &&
		browser.authSeedProfileDir === undefined
	) {
		browser.authSeedProfileDir = legacyProfileDir;
	}
	if (browser.runtimeProfilesDir === undefined) {
		const baseProfileDir =
			typeof browser.authSeedProfileDir === "string"
				? expandHomePath(browser.authSeedProfileDir)
				: DEFAULT_CONFIG.browser.authSeedProfileDir;
		browser.runtimeProfilesDir = join(
			normalize(baseProfileDir),
			"..",
			"oracle-runtime-profiles",
		);
	}
	if (browser.maxConcurrentJobs === undefined) {
		browser.maxConcurrentJobs = DEFAULT_CONFIG.browser.maxConcurrentJobs;
	}
	if (browser.cloneStrategy === undefined) {
		browser.cloneStrategy = DEFAULT_CONFIG.browser.cloneStrategy;
	}
	root.browser = browser;
	return root;
}

function validateOracleConfig(value: unknown): OracleConfig {
	const root = normalizeLegacyBrowserConfig(expectObject(value, "root"));

	const defaults = expectObject(root.defaults, "defaults");
	const modelFamily = expectEnum(
		defaults.modelFamily,
		"defaults.modelFamily",
		MODEL_FAMILIES,
	);
	const effort = expectEnum(defaults.effort, "defaults.effort", EFFORTS);
	const autoSwitchToThinking = expectBoolean(
		defaults.autoSwitchToThinking,
		"defaults.autoSwitchToThinking",
	);
	if (
		modelFamily === "pro" &&
		!(PRO_EFFORTS as readonly string[]).includes(effort)
	) {
		throw new Error(
			`Invalid oracle config: defaults.effort must be one of ${PRO_EFFORTS.join(", ")} for pro`,
		);
	}
	if (modelFamily !== "instant" && autoSwitchToThinking) {
		throw new Error(
			"Invalid oracle config: defaults.autoSwitchToThinking is only valid for instant",
		);
	}

	const browser = expectObject(root.browser, "browser");
	const auth = expectObject(root.auth, "auth");
	const worker = expectObject(root.worker, "worker");
	const poller = expectObject(root.poller, "poller");
	const artifacts = expectObject(root.artifacts, "artifacts");
	const cleanup = expectObject(root.cleanup, "cleanup");

	const authSeedProfileDir = expectSafeProfileDir(
		browser.authSeedProfileDir,
		"browser.authSeedProfileDir",
	);
	const runtimeProfilesDir = expectSafeProfileDir(
		browser.runtimeProfilesDir,
		"browser.runtimeProfilesDir",
	);
	if (
		runtimeProfilesDir === authSeedProfileDir ||
		runtimeProfilesDir.startsWith(`${authSeedProfileDir}/`)
	) {
		throw new Error(
			"Invalid oracle config: browser.runtimeProfilesDir must be separate from browser.authSeedProfileDir",
		);
	}

	return {
		defaults: {
			modelFamily,
			effort,
			autoSwitchToThinking,
		},
		browser: {
			sessionPrefix: expectString(
				browser.sessionPrefix,
				"browser.sessionPrefix",
			),
			authSeedProfileDir,
			runtimeProfilesDir,
			maxConcurrentJobs: expectInteger(
				browser.maxConcurrentJobs,
				"browser.maxConcurrentJobs",
				1,
				32,
			),
			cloneStrategy: expectEnum(
				browser.cloneStrategy,
				"browser.cloneStrategy",
				CLONE_STRATEGIES,
			),
			chatUrl: expectProviderUrl(browser.chatUrl, "browser.chatUrl"),
			authUrl: expectProviderUrl(browser.authUrl, "browser.authUrl"),
			runMode: expectEnum(
				browser.runMode,
				"browser.runMode",
				BROWSER_RUN_MODES,
			),
			executablePath: expectOptionalAbsoluteNormalizedPath(
				browser.executablePath,
				"browser.executablePath",
			),
			userAgent: expectOptionalString(browser.userAgent, "browser.userAgent"),
			args: expectStringArray(browser.args, "browser.args"),
		},
		auth: {
			pollMs: expectInteger(auth.pollMs, "auth.pollMs", 100),
			bootstrapTimeoutMs: expectInteger(
				auth.bootstrapTimeoutMs,
				"auth.bootstrapTimeoutMs",
				1000,
			),
			chromeProfile: expectString(auth.chromeProfile, "auth.chromeProfile"),
			chromeCookiePath: expectOptionalAbsoluteNormalizedPath(
				auth.chromeCookiePath,
				"auth.chromeCookiePath",
			),
		},
		worker: {
			pollMs: expectInteger(worker.pollMs, "worker.pollMs", 100),
			completionTimeoutMs: expectInteger(
				worker.completionTimeoutMs,
				"worker.completionTimeoutMs",
				1000,
			),
		},
		poller: {
			intervalMs: expectInteger(poller.intervalMs, "poller.intervalMs", 100),
		},
		artifacts: {
			capture: expectBoolean(artifacts.capture, "artifacts.capture"),
		},
		cleanup: {
			completeJobRetentionMs: expectInteger(
				cleanup.completeJobRetentionMs,
				"cleanup.completeJobRetentionMs",
				0,
			),
			failedJobRetentionMs: expectInteger(
				cleanup.failedJobRetentionMs,
				"cleanup.failedJobRetentionMs",
				0,
			),
		},
	};
}

export function loadOracleConfig(cwd: string): OracleConfig {
	const globalConfig = readJson(
		join(getAgentDir(), "extensions", "oracle.json"),
	);
	const projectConfig = filterProjectConfig(
		readJson(join(cwd, ".pi", "extensions", "oracle.json")),
	);
	return validateOracleConfig(
		deepMerge(deepMerge(DEFAULT_CONFIG, globalConfig), projectConfig),
	);
}
