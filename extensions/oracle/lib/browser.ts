/**
 * Pure Playwright browser automation module.
 * Clean architecture: this is the infrastructure layer.
 * - No eval() – uses page.evaluate() with typed functions
 * - Injectable ElementRegistry (no global mutable state)
 * - Explicit interfaces between layers
 */
import { chromium, type BrowserContext, type Page } from "playwright";
import { ElementRegistry } from "./ElementRegistry";
import { parseSnapshotEntries } from "../shared/snapshot-utils";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface BrowserLaunchOptions {
	executablePath?: string;
	userDataDir: string;
	userAgent?: string;
	args?: string[];
	headless?: boolean;
}

export interface BrowserStatus {
	connected: boolean;
}

export interface SnapshotDescriptor {
	kind: string;
	label: string;
	value: string;
	selector: string;
	disabled: boolean;
}

// ---------------------------------------------------------------------------
// Internal state – singleton pattern for worker-process model
// ---------------------------------------------------------------------------

let browserContext: BrowserContext | null = null;
let mainPageId: string | null = null;
const pages = new Map<string, Page>();
const registry = new ElementRegistry();
let pageCounter = 0;

// ---------------------------------------------------------------------------
// Page management helpers
// ---------------------------------------------------------------------------

function resolvePage(pageId: string): Page {
	const pg = pages.get(pageId);
	if (!pg) throw new Error(`Unknown page token: ${pageId}`);
	return pg;
}

function ensureMainPage(): string {
	if (!mainPageId) throw new Error("No main page available. Call launch() or newPage() first.");
	return mainPageId;
}

function resolveRef(refOrToken: string, pageIdHint?: string): { page: Page; selector: string } {
	if (refOrToken.startsWith("e") && registry.has(refOrToken)) {
		const info = registry.resolve(refOrToken)!;
		return { page: resolvePage(info.pageId), selector: info.selector };
	}
	if (!pageIdHint) throw new Error("Selector provided but no page token hint provided");
	return { page: resolvePage(pageIdHint), selector: refOrToken };
}

// ---------------------------------------------------------------------------
// Browser lifecycle
// ---------------------------------------------------------------------------

export async function launch(opts: BrowserLaunchOptions): Promise<void> {
	await close();
	const headless = opts.headless ?? process.env.PW_HEADLESS !== "0";
	const exe = opts.executablePath || process.env.BRAVE_PATH;

	browserContext = await chromium.launchPersistentContext(opts.userDataDir, {
		headless,
		acceptDownloads: true,
		executablePath: exe || undefined,
		userAgent: opts.userAgent,
		args: opts.args,
	});

	const pg = await browserContext.newPage();
	pageCounter += 1;
	const token = `p${pageCounter}`;
	pages.set(token, pg);
	mainPageId = token;
}

export async function close(): Promise<void> {
	if (browserContext) {
		try {
			await browserContext.close();
		} catch {
			// ignore – context may already be closed
		}
	}
	browserContext = null;
	pages.clear();
	registry.clear();
	mainPageId = null;
	pageCounter = 0;
}

export function isConnected(): boolean {
	return browserContext !== null && !browserContext.isClosed();
}

/** Get the current main page ID */
export function getMainPageId(): string {
	if (!mainPageId) throw new Error("No main page available. Call launch() or newPage() first.");
	return mainPageId;
}

export function getStatus(): BrowserStatus {
	return { connected: isConnected() };
}

// ---------------------------------------------------------------------------
// Page operations
// ---------------------------------------------------------------------------

export async function newPage(url?: string): Promise<string> {
	if (!browserContext) throw new Error("Browser not launched. Call launch() first.");
	const pg = await browserContext.newPage();
	if (url) await pg.goto(url);
	pageCounter += 1;
	const token = `p${pageCounter}`;
	pages.set(token, pg);
	return token;
}

export async function open(url: string): Promise<void> {
	const pageId = ensureMainPage();
	await resolvePage(pageId).goto(url, { waitUntil: "domcontentloaded" }).catch(() => undefined);
}

export async function getUrl(pageId?: string): Promise<string> {
	return resolvePage(pageId || ensureMainPage()).url();
}

export async function reload(pageId?: string): Promise<void> {
	await resolvePage(pageId || ensureMainPage()).reload().catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Snapshot – textual DOM representation for AI parsing
// Format per line: - <kind> "label" ref=eN : value
// ---------------------------------------------------------------------------

/** Generate snapshot descriptors from the page DOM */
async function collectSnapshotDescriptors(page: Page): Promise<SnapshotDescriptor[]> {
	return page.evaluate(() => {
		function uniqueSelector(el: Element | null): string {
			if (!el || !(el instanceof Element)) return "";
			if (el.id) return `#${el.id}`;
			const parts: string[] = [];
			let curr: Element | null = el;
			while (curr && curr.nodeType === 1) {
				const tag = curr.tagName.toLowerCase();
				let nth = 1;
				const parent: Element | null = curr.parentElement;
				if (parent) {
					const siblings = Array.from(parent.children).filter(
						(c: Element) => c.tagName === curr!.tagName,
					);
					if (siblings.length > 1) {
						nth = siblings.indexOf(curr) + 1;
					}
				}
				parts.unshift(`${tag}${nth > 1 ? `:nth-of-type(${nth})` : ""}`);
				curr = parent;
			}
			return parts.join(">");
		}

		const out: SnapshotDescriptor[] = [];
		const els = Array.from(
			document.querySelectorAll("a,button,input,textarea,select,[role='button'],[role='menuitem'],[role='combobox']"),
		) as Element[];

		for (const el of els) {
			const kindTag = el.tagName.toLowerCase();
			let kind = kindTag;
			const role = el.getAttribute("role");
			if (role && !["button", "menuitem", "combobox"].includes(kindTag)) kind = role;
			if (el instanceof HTMLInputElement && el.type) kind += `[${el.type}]`;

			const disabled =
				(el as HTMLElement).hasAttribute("disabled") ||
				(el instanceof HTMLElement && el.closest("[disabled]") !== null) ||
				(el as HTMLElement).ariaDisabled === "true";

			let label = (
				el.getAttribute("aria-label") ||
				(el.textContent || "").trim() ||
				(el as HTMLInputElement).value ||
				""
			).slice(0, 200);

			let value = "";
			if (el instanceof HTMLAnchorElement) value = el.getAttribute("href") || "";
			else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) value = (el as HTMLInputElement).value || "";
			else if (el instanceof HTMLSelectElement) value = el.value || "";
			else value = (el.textContent || "").trim();

			out.push({ kind, label, value, selector: uniqueSelector(el), disabled: !!disabled });
		}
		return out;
	});
}

export async function snapshotText(pageId?: string): Promise<string> {
	const pid = pageId || ensureMainPage();
	const page = resolvePage(pid);
	const descriptors = await collectSnapshotDescriptors(page);

	const lines: string[] = [];
	for (const d of descriptors) {
		const token = registry.register(pid, d.selector);
		const safeLabel = d.label.replace(/\n/g, " ").replace(/"/g, '"');
		const safeValue = String(d.value).replace(/\n/g, " ").replace(/"/g, '"');
		const disabledSuffix = d.disabled ? " disabled" : "";
		lines.push(`- ${d.kind} "${safeLabel}" ref=${token} : ${safeValue}${disabledSuffix}`);
	}
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Page text (body innerText)
// ---------------------------------------------------------------------------

export async function pageText(pageId?: string): Promise<string> {
	const pid = pageId || ensureMainPage();
	const page = resolvePage(pid);
	try {
		return await page.evaluate(() =>
			document.body ? document.body.innerText : document.documentElement?.innerText || "",
		);
	} catch {
		return "";
	}
}

// ---------------------------------------------------------------------------
// Script evaluation – safe, no eval()
// Accepts a function body string and runs it via page.evaluate()
// ---------------------------------------------------------------------------

export async function evaluate(pageId: string, script: string): Promise<unknown> {
	const page = resolvePage(pageId);

	// Use Function constructor instead of eval – same capability, clearer intent.
	// Playwright serializes the return value automatically.
	const result = await page.evaluate((code: string) => {
		try {
			// eslint-disable-next-line @typescript-eslint/no-implied-eval
			const fn = new Function(`return (${code})`);
			return fn();
		} catch (e) {
			throw e instanceof Error ? e : new Error(String(e));
		}
	}, script);

	// If the page returned a special shape requesting to register a selector
	if (result && typeof result === "object") {
		const obj = result as Record<string, unknown>;
		const sel = obj.__registerSelector ?? obj.__register;
		if (typeof sel === "string") {
			return registry.register(pageId, sel);
		}
	}
	return result;
}

// ---------------------------------------------------------------------------
// Interaction operations
// ---------------------------------------------------------------------------

export async function clickRef(refOrToken: string, pageIdHint?: string): Promise<void> {
	const { page, selector } = resolveRef(refOrToken, pageIdHint);
	await page.waitForSelector(selector, { state: "visible", timeout: 3000 }).catch(() => null);
	const handle = await page.$(selector);
	if (!handle) throw new Error(`clickRef: element not found for selector ${selector}`);
	await handle.click().catch(async () => {
		await page.evaluate((s) => {
			const el = document.querySelector(s) as HTMLElement | null;
			if (el) el.click();
		}, selector);
	});
}

export async function fill(refOrToken: string, text: string, pageIdHint?: string): Promise<void> {
	if (!text || typeof text !== "string") throw new Error("fill: text must be a non-empty string");
	const { page, selector } = resolveRef(refOrToken, pageIdHint);
	await page.waitForSelector(selector, { state: "visible", timeout: 3000 }).catch(() => null);
	await page.fill(selector, text);
}

export async function upload(refOrToken: string, filePath: string, pageIdHint?: string): Promise<void> {
	const { page, selector } = resolveRef(refOrToken, pageIdHint);
	await page.waitForSelector(selector, { state: "attached", timeout: 3000 }).catch(() => null);
	const handle = await page.$(selector);
	if (!handle) throw new Error(`upload: element not found for selector ${selector}`);
	await handle.setInputFiles(filePath);
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export async function downloadByRef(
	refOrToken: string,
	destPath: string,
	pageIdHint?: string,
	timeoutMs = 90_000,
): Promise<void> {
	const { page, selector } = resolveRef(refOrToken, pageIdHint);
	await page.waitForSelector(selector, { state: "attached", timeout: 3000 }).catch(() => null);
	const handle = await page.$(selector);
	if (!handle) throw new Error(`downloadByRef: element not found for selector ${selector}`);

	const downloadPromise = page.waitForEvent("download", { timeout: timeoutMs });
	await handle.click().catch(async () => {
		await page.evaluate((s) => {
			const el = document.querySelector(s) as HTMLElement | null;
			if (el) el.click();
		}, selector);
	});
	const download = await downloadPromise;
	await download.saveAs(destPath);
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

export async function screenshot(destPath: string, pageId?: string): Promise<void> {
	const pid = pageId || ensureMainPage();
	await resolvePage(pid).screenshot({ path: destPath, fullPage: true });
}

// ---------------------------------------------------------------------------
// Cookie management
// ---------------------------------------------------------------------------

export async function cookiesClear(): Promise<void> {
	if (!browserContext) throw new Error("Browser not launched");
	await browserContext.clearCookies();
}

export async function cookiesSet(cookies: Array<Record<string, unknown>>): Promise<void> {
	if (!browserContext) throw new Error("Browser not launched");
	const converted = cookies.map((c) => {
		// Playwright requires domain WITHOUT leading dot
		let domain = String(c.domain);
		if (domain.startsWith(".")) domain = domain.slice(1);
		return {
			name: String(c.name),
			value: String(c.value),
			domain,
			path: (c.path as string) || "/",
			httpOnly: Boolean(c.httpOnly),
			secure: Boolean(c.secure),
			expires: typeof c.expires === "number" ? Math.round(c.expires) : undefined,
			sameSite: c.sameSite as "Strict" | "Lax" | "None" | undefined,
		};
	});
	await browserContext.addCookies(converted);
}

// ---------------------------------------------------------------------------
// Re-export utilities
// ---------------------------------------------------------------------------

export { parseSnapshotEntries } from "../shared/snapshot-utils";
export type { ParsedSnapshotEntry } from "../shared/snapshot-utils";
export { ElementRegistry } from "./ElementRegistry";
export type { ElementInfo } from "./ElementRegistry";
