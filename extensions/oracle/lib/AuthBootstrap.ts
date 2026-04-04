/**
 * AuthBootstrap – orchestrates the /oracle-auth flow.
 * Reads ChatGPT cookies from Chrome, seeds them into an isolated browser,
 * and verifies the auth state.
 *
 * Clean architecture: application/service layer coordinating
 * infrastructure (browser, sweet-cookie) and domain (ChatGPTAuthPage).
 */
import { existsSync } from "node:fs";
import { appendFile, chmod, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { getCookies } from "@steipete/sweet-cookie";
import { ensureAccountCookie, filterImportableAuthCookies } from "../worker/auth-cookie-policy";
import { ChatGPTAuthPage } from "../pages/chatgpt/chatgpt-auth.page";
import type { BrowserActions } from "../pages/browser-actions.types";
import * as browser from "../lib/browser";
import { classifyChatPage, type LoginProbeResult, type ClassifyResult } from "../shared/login-utils";
import { findEntry, findLastEntry } from "../shared/snapshot-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthConfig {
	browser: {
		executablePath?: string;
		userAgent?: string;
		args?: string[];
		chatUrl: string;
		authSeedProfileDir: string;
		authUrl: string;
		sessionPrefix: string;
	};
	auth: {
		chromeProfile?: string;
		chromeCookiePath?: string;
		bootstrapTimeoutMs: number;
		pollMs: number;
	};
}

interface AuthBootstrapProbeResult extends LoginProbeResult {
	name?: string;
	responsePreview?: string;
}

interface ProfilePlan {
	targetDir: string;
	stagingDir: string;
	backupDir: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHATGPT_LABELS = {
	composer: ["Chat with ChatGPT", "Chatear con ChatGPT", "Pregunta lo que quieras"],
	addFiles: ["Add files and more", "Agregar archivos y más"],
	modelSelector: ["Model selector", "Selector de modelo"],
};

const LOGIN_PROBE_TIMEOUT_MS = 5_000;
const CHATGPT_COOKIE_ORIGINS = [
	"https://chatgpt.com",
	"https://chat.openai.com",
	"https://atlas.openai.com",
	"https://auth.openai.com",
	"https://sentinel.openai.com",
	"https://ws.chatgpt.com",
];

const LOG_PATH = "/tmp/oracle-auth.log";
const URL_PATH = "/tmp/oracle-auth.url.txt";
const SNAPSHOT_PATH = "/tmp/oracle-auth.snapshot.txt";
const BODY_PATH = "/tmp/oracle-auth.body.txt";
const SCREENSHOT_PATH = "/tmp/oracle-auth.png";
const REAL_CHROME_USER_DATA_DIR = resolve(homedir(), "Library", "Application Support", "Google", "Chrome");
const ORACLE_STATE_DIR = "/tmp/pi-oracle-state";
const LOCKS_DIR = join(ORACLE_STATE_DIR, "locks");

// ---------------------------------------------------------------------------
// Browser actions adapter
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
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
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

function snapshotHasLabel(snapshot: string, kind: string, labels: string[]): boolean {
	return labels.some((label) => snapshot.includes(`${kind} "${label}"`));
}

async function log(message: string): Promise<void> {
	const line = `[${new Date().toISOString()}] ${message}\n`;
	await appendFile(LOG_PATH, line, { encoding: "utf8", mode: 0o600 });
	await chmod(LOG_PATH, 0o600).catch(() => undefined);
}

async function ensurePrivateDir(path: string): Promise<void> {
	await mkdir(path, { recursive: true, mode: 0o700 });
	await chmod(path, 0o700).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Lock management (inline – same as lib/locks but self-contained for auth)
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";

function leaseKey(kind: string, key: string): string {
	return `${kind}-${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

async function readLockProcessPid(path: string): Promise<number | undefined> {
	const metadataPath = join(path, "metadata.json");
	if (!existsSync(metadataPath)) return undefined;
	try {
		const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
		return typeof metadata?.processPid === "number" && Number.isInteger(metadata.processPid) && metadata.processPid > 0
			? metadata.processPid
			: undefined;
	} catch {
		return undefined;
	}
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error: any) {
		if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return false;
		return true;
	}
}

async function maybeReclaimStaleLock(path: string): Promise<boolean> {
	const processPid = await readLockProcessPid(path);
	if (!processPid || isProcessAlive(processPid)) return false;
	await rm(path, { recursive: true, force: true }).catch(() => undefined);
	return true;
}

async function acquireLock(kind: string, key: string, metadata: unknown, timeoutMs = 30_000): Promise<string> {
	const path = join(LOCKS_DIR, leaseKey(kind, key));
	const deadline = Date.now() + timeoutMs;
	await ensurePrivateDir(ORACLE_STATE_DIR);
	await ensurePrivateDir(LOCKS_DIR);

	while (Date.now() < deadline) {
		try {
			await mkdir(path, { recursive: false, mode: 0o700 });
			await writeFile(join(path, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
			return path;
		} catch (error: any) {
			if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
			if (await maybeReclaimStaleLock(path)) continue;
		}
		await sleep(200);
	}
	throw new Error(`Timed out waiting for oracle ${kind} lock: ${key}`);
}

async function releaseLock(path: string | undefined): Promise<void> {
	if (!path) return;
	await rm(path, { recursive: true, force: true }).catch(() => undefined);
}

async function withLock<T>(kind: string, key: string, metadata: unknown, fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
	const handle = await acquireLock(kind, key, metadata, timeoutMs);
	try {
		return await fn();
	} finally {
		await releaseLock(handle);
	}
}

// ---------------------------------------------------------------------------
// AuthBootstrap class
// ---------------------------------------------------------------------------

export class AuthBootstrap {
	private config: AuthConfig;
	private runtimeProfileDir: string;
	private authPage: ChatGPTAuthPage;

	constructor(config: AuthConfig) {
		this.config = config;
		this.runtimeProfileDir = config.browser.authSeedProfileDir;
		this.authPage = new ChatGPTAuthPage(config.browser.chatUrl);
	}

	// -----------------------------------------------------------------------
	// Profile management
	// -----------------------------------------------------------------------

	async createProfilePlan(profileDir: string): Promise<ProfilePlan> {
		const targetDir = resolve(profileDir);
		if (!targetDir.startsWith("/")) throw new Error(`Oracle profileDir must be an absolute path: ${profileDir}`);
		if (targetDir === "/" || targetDir === homedir()) throw new Error(`Oracle profileDir is unsafe: ${targetDir}`);
		if (targetDir === REAL_CHROME_USER_DATA_DIR || targetDir.startsWith(`${REAL_CHROME_USER_DATA_DIR}/`)) {
			throw new Error(`Oracle profileDir must not point into the real Chrome user-data directory: ${targetDir}`);
		}

		const stagingDir = `${targetDir}.staging-${Date.now()}`;
		const backupDir = `${targetDir}.prev`;
		await mkdir(dirname(targetDir), { recursive: true, mode: 0o700 });
		await this.ensureNotSymlink(dirname(targetDir), "Oracle profile parent directory");
		await this.ensureNotSymlink(targetDir, "Oracle profile directory");
		await this.ensureNotSymlink(backupDir, "Oracle backup profile directory");
		return { targetDir, stagingDir, backupDir };
	}

	async prepareStagedProfile(plan: ProfilePlan): Promise<void> {
		this.runtimeProfileDir = plan.stagingDir;
		await log(`Preparing staged oracle profile ${plan.stagingDir}`);
		await rm(plan.stagingDir, { recursive: true, force: true }).catch(async (error) => {
			await log(`Staging profile cleanup warning: ${error instanceof Error ? error.message : String(error)}`);
		});
	}

	async commitStagedProfile(plan: ProfilePlan): Promise<void> {
		await log(`Committing staged oracle profile ${plan.stagingDir} -> ${plan.targetDir}`);
		await rm(plan.backupDir, { recursive: true, force: true }).catch(() => undefined);

		const hadPreviousProfile = existsSync(plan.targetDir);
		if (hadPreviousProfile) await rename(plan.targetDir, plan.backupDir);

		try {
			await rename(plan.stagingDir, plan.targetDir);
			this.runtimeProfileDir = plan.targetDir;
			if (hadPreviousProfile) await log(`Previous oracle profile moved to ${plan.backupDir}`);
		} catch (error) {
			if (!existsSync(plan.targetDir) && existsSync(plan.backupDir)) {
				await rename(plan.backupDir, plan.targetDir).catch(() => undefined);
			}
			throw error;
		}
	}

	// -----------------------------------------------------------------------
	// Browser lifecycle
	// -----------------------------------------------------------------------

	async launchBrowser(): Promise<void> {
		await this.closeBrowser();
		await browser.launch({
			userDataDir: this.runtimeProfileDir,
			executablePath: this.config.browser.executablePath,
			userAgent: this.config.browser.userAgent,
			args: Array.isArray(this.config.browser.args) ? this.config.browser.args : undefined,
			headless: false, // auth always runs headed for user interaction
		});
		await log("Launching isolated browser: Playwright persistent context launched");
	}

	async closeBrowser(): Promise<void> {
		await browser.close().catch(() => undefined);
	}

	// -----------------------------------------------------------------------
	// Cookie extraction and seeding
	// -----------------------------------------------------------------------

	async readAndSeedCookies(): Promise<void> {
		const cookies = await this.readSourceCookies();
		await this.seedCookiesIntoTarget(cookies);
	}

	private cookieSource(): string {
		return this.config.auth.chromeCookiePath || this.config.auth.chromeProfile || "";
	}

	private cookieSourceLabel(): string {
		return this.config.auth.chromeCookiePath
			? `Chrome cookie DB ${this.config.auth.chromeCookiePath}`
			: `Chrome profile ${this.config.auth.chromeProfile}`;
	}

	private cookieOrigins(): string[] {
		return Array.from(new Set([stripQuery(this.config.browser.chatUrl), ...CHATGPT_COOKIE_ORIGINS]));
	}

	private async readSourceCookies(): Promise<any[]> {
		await log(`Reading ChatGPT cookies from ${this.cookieSourceLabel()}`);
		const { cookies, warnings } = await getCookies({
			url: this.config.browser.chatUrl,
			origins: this.cookieOrigins(),
			browsers: ["chrome"],
			mode: "merge",
			chromeProfile: this.cookieSource(),
			timeoutMs: 5_000,
		});

		if (warnings.length) await log(`sweet-cookie warnings: ${warnings.join(" | ")}`);

		const filtered = filterImportableAuthCookies(cookies, this.config.browser.chatUrl);
		let normalizedCookies = filtered.cookies;
		await log(`Read ${normalizedCookies.length} filtered auth cookies`);
		if (filtered.dropped.length) {
			await log(`Dropped ${filtered.dropped.length} non-importable cookies`);
		}

		const hasSessionToken = normalizedCookies.some((c: any) => c.name.startsWith("__Secure-next-auth.session-token"));
		const hasAccountCookie = normalizedCookies.some((c: any) => c.name === "_account");
		await log(`Cookie presence: sessionToken=${hasSessionToken} account=${hasAccountCookie}`);

		if (!hasSessionToken) {
			throw new Error(
				`No ChatGPT session-token cookies were found in ${this.cookieSourceLabel()}. ` +
				`Make sure ChatGPT is logged into that Chrome profile, or set auth.chromeProfile / auth.chromeCookiePath in ~/.pi/agent/extensions/oracle.json.`,
			);
		}

		if (!hasAccountCookie) {
			const ensured = ensureAccountCookie(normalizedCookies, this.config.browser.chatUrl);
			normalizedCookies = ensured.cookies;
			if (ensured.synthesized) await log(`Synthesized missing _account cookie with value=${ensured.value}`);
		}

		return normalizedCookies;
	}

	private async seedCookiesIntoTarget(cookies: any[]): Promise<void> {
		await log("Clearing isolated browser cookies before seeding fresh ChatGPT cookies");
		await browser.cookiesClear();
		await browser.cookiesSet(cookies);
		await log(`Applied ${cookies.length} cookies into isolated browser profile`);
	}

	// -----------------------------------------------------------------------
	// Auth verification
	// -----------------------------------------------------------------------

	async waitForImportedAuthReady(): Promise<ClassifyResult> {
		const startedAt = Date.now();
		const timeoutAt = startedAt + this.config.auth.bootstrapTimeoutMs;
		let retriedOutage = false;
		let retriedAuthTransition = false;
		let attemptedAccountChooser = false;
		let attemptedAuthUrl = false;
		let iteration = 0;

		while (Date.now() < timeoutAt) {
			iteration += 1;
			const [url, snapshot, body, probe] = await Promise.all([
				browser.getUrl(),
				browser.snapshotText(),
				browser.pageText(),
				this.loginProbe(),
			]);
			await writeFile(URL_PATH, `${url}\n`, { mode: 0o600 }).catch(() => undefined);
			await writeFile(SNAPSHOT_PATH, `${snapshot}\n`, { mode: 0o600 }).catch(() => undefined);
			await writeFile(BODY_PATH, `${body}\n`, { mode: 0o600 }).catch(() => undefined);

			const classification = this.classifyChatPageWithAuth({ url, snapshot, body, probe });
			await log(`poll ${iteration}: url=${JSON.stringify(url)} classification=${classification.state}`);

			if (classification.state === "authenticated_and_ready") return classification;

			if (classification.state === "auth_transitioning") {
				const elapsedMs = Date.now() - startedAt;
				if (!attemptedAuthUrl && (probe?.bodyHasId || probe?.bodyHasEmail)) {
					attemptedAuthUrl = true;
					await log(`Opening auth URL ${this.config.browser.authUrl} to force session resolution`);
					await browser.open(this.config.browser.authUrl);
					await sleep(1500);
					continue;
				}
				if (!attemptedAccountChooser && (probe?.bodyHasId || probe?.bodyHasEmail)) {
					attemptedAccountChooser = await this.maybeSelectAccountIdentity(snapshot, probe);
					if (attemptedAccountChooser) {
						await log("Auth transition click dispatched; waiting for authenticated shell to settle");
						await sleep(1500);
						continue;
					}
				}
				if (!retriedAuthTransition && elapsedMs >= 5_000) {
					retriedAuthTransition = true;
					await log("Auth looks accepted but page is still public-looking; reloading once");
					await browser.reload();
					await sleep(1500);
					continue;
				}
				if (elapsedMs >= 20_000) {
					await this.captureDiagnostics("auth-transition-timeout");
					throw new Error(`ChatGPT accepted the session cookies but never left the public-looking homepage. Inspect ${LOG_PATH}.`);
				}
				await sleep(this.config.auth.pollMs);
				continue;
			}

			if (classification.state === "transient_outage_error" && !retriedOutage) {
				retriedOutage = true;
				await log("Transient outage detected; reloading once");
				await browser.reload();
				await sleep(1500);
				continue;
			}

			if (classification.state === "challenge_blocking") {
				await this.captureDiagnostics("challenge");
				throw this.preserveBrowserError(classification.message);
			}

			if (classification.state === "login_required") {
				await this.captureDiagnostics("login-required");
				throw new Error(classification.message);
			}

			await sleep(this.config.auth.pollMs);
		}

		await this.captureDiagnostics("auth-bootstrap-timeout");
		throw new Error(`Timed out waiting for ChatGPT auth to be ready after ${this.config.auth.bootstrapTimeoutMs}ms. Inspect ${LOG_PATH}.`);
	}

	// -----------------------------------------------------------------------
	// Internal helpers
	// -----------------------------------------------------------------------

	private async ensureNotSymlink(path: string, label: string): Promise<void> {
		try {
			const stats = await lstat(path);
			if (stats.isSymbolicLink()) throw new Error(`${label} must not be a symlink: ${path}`);
		} catch (error: any) {
			if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
			throw error;
		}
	}

	private async loginProbe(): Promise<AuthBootstrapProbeResult> {
		const result = await browser.evaluate(browser.getMainPageId(), this.authPage.getLoginProbeScript(LOGIN_PROBE_TIMEOUT_MS));
		if (!result || typeof result !== "object") {
			return { ok: false, status: 0, error: "invalid-probe-result", domLoginCta: false, onAuthPage: false, bodyKeys: [], bodyHasId: false, bodyHasEmail: false };
		}
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
			name: typeof r.name === "string" ? r.name : undefined,
			responsePreview: typeof r.responsePreview === "string" ? r.responsePreview : undefined,
		};
	}

	private classifyChatPageWithAuth(params: { url: string; snapshot: string; body: string; probe?: AuthBootstrapProbeResult }): ClassifyResult {
		const baseClassification = classifyChatPage({
			url: params.url,
			snapshot: params.snapshot,
			body: params.body,
			probe: params.probe,
			chatUrl: this.config.browser.chatUrl,
		});

		if (baseClassification.state === "challenge_blocking") {
			return {
				...baseClassification,
				message: `ChatGPT challenge detected after syncing cookies from ${this.cookieSourceLabel()}. ` +
					`The isolated oracle browser was left open on profile ${this.runtimeProfileDir}; complete the challenge there, then rerun /oracle-auth. Logs: ${LOG_PATH}`,
			};
		}

		if (baseClassification.state === "login_required") {
			return {
				...baseClassification,
				message: `Synced cookies from ${this.cookieSourceLabel()}, but ChatGPT still rejected the session. ` +
					`Check auth.chromeProfile/auth.chromeCookiePath and inspect ${LOG_PATH}.`,
			};
		}

		if (baseClassification.state === "auth_transitioning") {
			return {
				...baseClassification,
				message: `ChatGPT accepted the cookies but is still resolving the authentication flow. Logs: ${LOG_PATH}`,
			};
		}

		if (baseClassification.state === "authenticated_and_ready") {
			return {
				...baseClassification,
				message: `Imported ChatGPT auth from ${this.cookieSourceLabel()} into the isolated oracle profile. Logs: ${LOG_PATH}`,
			};
		}

		return baseClassification;
	}

	private async maybeSelectAccountIdentity(snapshot: string, probe: AuthBootstrapProbeResult): Promise<boolean> {
		const candidates: string[] = [];
		if (typeof probe?.name === "string" && probe.name.trim()) {
			candidates.push(probe.name.trim());
			const firstToken = probe.name.trim().split(/\s+/)[0];
			if (firstToken && firstToken !== probe.name.trim()) candidates.push(firstToken);
		}

		for (const label of candidates) {
			const entry = findEntry(snapshot, (e) => e.kind === "button" && e.label === label && !e.disabled);
			if (!entry) continue;
			await log(`Clicking account chooser button ${JSON.stringify(label)} via ${entry.ref}`);
			await browser.clickRef(entry.ref);
			return true;
		}

		const loginEntry = findLastEntry(snapshot, (e) => {
			const loginLabels = ["Log in", "Iniciar sesión", "Acceder", "Entrar"];
			return e.kind === "button" && !!e.label && loginLabels.some((l) => e.label!.toLowerCase().includes(l.toLowerCase())) && !e.disabled;
		});
		if (loginEntry) {
			await log(`Clicking visible Log in CTA via ${loginEntry.ref}`);
			await browser.clickRef(loginEntry.ref);
			return true;
		}

		return false;
	}

	private preserveBrowserError(message: string): Error {
		const error: any = new Error(message);
		error.preserveBrowser = true;
		return error;
	}

	private async captureDiagnostics(reason: string): Promise<void> {
		try {
			const [url, snapshot, body] = await Promise.all([
				browser.getUrl().catch(() => ""),
				browser.snapshotText().catch(() => ""),
				browser.pageText().catch(() => ""),
			]);
			await writeFile(URL_PATH, `${url}\n`, { mode: 0o600 });
			await writeFile(SNAPSHOT_PATH, `${snapshot}\n`, { mode: 0o600 });
			await writeFile(BODY_PATH, `${body}\n`, { mode: 0o600 });
			await chmod(URL_PATH, 0o600).catch(() => undefined);
			await chmod(SNAPSHOT_PATH, 0o600).catch(() => undefined);
			await chmod(BODY_PATH, 0o600).catch(() => undefined);
			await browser.screenshot(SCREENSHOT_PATH).catch(() => undefined);
			await log(`Captured diagnostics for ${reason}`);
		} catch (error: any) {
			await log(`Failed to capture diagnostics for ${reason}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	// -----------------------------------------------------------------------
	// Public entry point
	// -----------------------------------------------------------------------

	async run(profilePlan: ProfilePlan): Promise<ClassifyResult> {
		await this.prepareStagedProfile(profilePlan);
		await this.launchBrowser();
		await this.readAndSeedCookies();
		const result = await this.waitForImportedAuthReady();
		await this.commitStagedProfile(profilePlan);
		return result;
	}
}
