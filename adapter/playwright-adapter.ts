/* eslint-disable no-console */
import os from "os";
import path from "path";

let playwrightPkg: typeof import("playwright");
let context: import("playwright").BrowserContext | null = null;
const pages = new Map<string, import("playwright").Page>();
const elements = new Map<string, { pageToken: string; selector: string }>();
let pageCounter = 0;
let elementCounter = 0;
let mainPageToken: string | null = null;

function ensureFlag(): void {
	if (process.env.USE_PLAYWRIGHT !== "1") {
		throw new Error(
			"Playwright adapter disabled. Set USE_PLAYWRIGHT=1 to enable.",
		);
	}
}

async function lazyImport() {
	if (!playwrightPkg) {
		// dynamic import so projects that don't install playwright won't fail at load time
		playwrightPkg = await import("playwright");
	}
}

/**
 * Launch (or reuse) a persistent browser context.
 * @param userDataDir optional path for persistent profile; defaults to tmp dir
 */
export async function launchPersistent(
	userDataDir?: string,
	executablePath?: string,
) {
	ensureFlag();
	await lazyImport();
	if (context) return context;

	const dir = userDataDir || path.join(os.tmpdir(), "pi-playwright-profile");
	const headless = process.env.PW_HEADLESS !== "0"; // default headless, allow override
	const browserExe =
		executablePath ||
		process.env.BRAVE_PATH ||
		"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";

	// Use chromium persistent context to preserve profile
	context = await playwrightPkg.chromium.launchPersistentContext(dir, {
		headless,
		acceptDownloads: true,
		executablePath: browserExe,
	});

	// create a main page so callers can use simple open/getUrl APIs
	const pg = await context.newPage();
	pageCounter += 1;
	const token = `p${pageCounter}`;
	pages.set(token, pg);
	mainPageToken = token;
	return context;
}

/**
 * Create a new page in the persistent context and return a page token (p1, p2...)
 * @param url optional url to open (supports data: HTML)
 */
export async function newPage(url?: string) {
	ensureFlag();
	if (!context) await launchPersistent();
	const pg = await context!.newPage();
	if (url) await pg.goto(url);
	pageCounter += 1;
	const token = `p${pageCounter}`;
	pages.set(token, pg);
	return token;
}

/**
 * Close all pages and the persistent context.
 */
export async function close() {
	if (context) {
		try {
			await context.close();
		} catch (e) {
			// ignore
		}
	}
	context = null;
	pages.clear();
	elements.clear();
	mainPageToken = null;
}

/**
 * Register a selector on a page and return an element token (e1, e2...)
 */
export function registerElement(pageToken: string, selector: string) {
	elementCounter += 1;
	const token = `e${elementCounter}`;
	elements.set(token, { pageToken, selector });
	return token;
}

/**
 * Resolve a page token to a Playwright Page instance.
 */
function resolvePage(pageRef: string) {
	const pg = pages.get(pageRef);
	if (!pg) throw new Error(`Unknown page token: ${pageRef}`);
	return pg;
}

/**
 * Resolve a refOrToken to {page, selector}.
 * If refOrToken is an element token (eN) it will look up the selector and page.
 * Otherwise treats refOrToken as a selector and requires a `pageToken` to be passed.
 */
function resolveRef(refOrToken: string, pageTokenHint?: string) {
	if (refOrToken.startsWith("e") && elements.has(refOrToken)) {
		const info = elements.get(refOrToken)!;
		return { page: resolvePage(info.pageToken), selector: info.selector };
	}
	// treat as selector; pageTokenHint is required
	if (!pageTokenHint)
		throw new Error("Selector provided but no page token hint provided");
	return { page: resolvePage(pageTokenHint), selector: refOrToken };
}

/**
 * Evaluate a script in the page and return a JSON-serializable result.
 * The script param should be a JS expression or function body string that evaluates to a value.
 * If the evaluated result is an object {__registerSelector: "..."} the adapter will
 * register that selector and return an element token string.
 */
export async function evaluate(pageRef: string, script: string): Promise<any> {
	ensureFlag();
	const page = resolvePage(pageRef);
	try {
		// Execute arbitrary code string inside the page context using eval to allow statements
		const result = await page.evaluate((code: string) => {
			try {
				// eslint-disable-next-line no-eval
				return eval(code);
			} catch (e) {
				// Re-throw to be handled in Node context
				throw e instanceof Error ? e.message : String(e);
			}
		}, script);

		// If the page returned a special shape requesting to register a selector
		if (
			result &&
			typeof result === "object" &&
			(result.__registerSelector || result.__register)
		) {
			const sel = result.__registerSelector || result.__register;
			const token = registerElement(pageRef, String(sel));
			return token;
		}
		return result;
	} catch (err) {
		// Normalize error to include message
		const message =
			err && typeof err === "object" && "message" in err
				? (err as any).message
				: String(err);
		throw new Error(`evaluate failed: ${message}`);
	}
}

export async function fill(
	refOrToken: string,
	text: string,
	pageTokenHint?: string,
) {
	ensureFlag();
	if (!text || typeof text !== "string")
		throw new Error("fill: text must be a string");
	const { page, selector } = resolveRef(refOrToken, pageTokenHint);
	// Wait for element then fill
	await page
		.waitForSelector(selector, { state: "visible", timeout: 3000 })
		.catch(() => null);
	try {
		await page.fill(selector, text);
	} catch (err) {
		throw new Error(
			`fill failed for selector ${selector}: ${(err as Error).message}`,
		);
	}
}

export async function upload(
	refOrToken: string,
	filePath: string,
	pageTokenHint?: string,
) {
	ensureFlag();
	if (!filePath || typeof filePath !== "string")
		throw new Error("upload: filePath must be a string");
	const { page, selector } = resolveRef(refOrToken, pageTokenHint);
	await page
		.waitForSelector(selector, { state: "attached", timeout: 3000 })
		.catch(() => null);
	try {
		const handle = await page.$(selector);
		if (!handle) throw new Error(`element not found for selector ${selector}`);
		await handle.setInputFiles(filePath);
	} catch (err) {
		throw new Error(
			`upload failed for selector ${selector}: ${(err as Error).message}`,
		);
	}
}

/**
 * Produce a textual snapshot of a page, registering interactive element selectors as refs.
 * Format (per-line): - <kind> "<label>" ref=<refToken> : <value>
 * The adapter will register selectors internally as e1, e2... and maintain map ref->selector.
 * @param pageToken page token returned by newPage()
 */
export async function snapshotText(pageToken: string): Promise<string> {
	ensureFlag();
	const page = resolvePage(pageToken);
	// Collect simple descriptors from the page DOM
	const descriptors = await page.evaluate(() => {
		function uniqueSelector(el: Element | null) {
			if (!el || !(el instanceof Element)) return "";
			if (el.id) return `#${el.id}`;
			const parts: string[] = [];
			let curr: Element | null = el;
			while (curr && curr.nodeType === 1) {
				const tag = curr.tagName.toLowerCase();
				let nth = 1;
				const parent = curr.parentElement;
				if (parent) {
					const siblings = Array.from(parent.children).filter(
						(c) => c.tagName === curr!.tagName,
					);
					if (siblings.length > 1) {
						nth = siblings.indexOf(curr) + 1;
					}
				}
				parts.unshift(siblingsSafe(tag, nth));
				curr = parent;
			}
			return parts.join(">");
			function siblingsSafe(tag: string, nth: number) {
				return siblingsCount(tag, nth);
			}
			function siblingsCount(tag: string, nth: number) {
				return `${tag}${nth > 1 ? `:nth-of-type(${nth})` : ""}`;
			}
		}
		const out: Array<{
			kind: string;
			label: string;
			value: string;
			selector: string;
		}> = [];
		const els = Array.from(
			document.querySelectorAll("a,button,input,textarea,select"),
		) as Element[];
		for (const el of els) {
			const kindTag = el.tagName.toLowerCase();
			let kind = kindTag;
			if (el instanceof HTMLInputElement && el.type) kind += `[${el.type}]`;
			const label = (
				el.getAttribute("aria-label") ||
				(el.textContent || "").trim() ||
				(el as HTMLInputElement).value ||
				""
			).slice(0, 200);
			let value = "";
			if (el instanceof HTMLAnchorElement)
				value = el.getAttribute("href") || "";
			else if (
				el instanceof HTMLInputElement ||
				el instanceof HTMLTextAreaElement
			)
				value = (el as HTMLInputElement).value || "";
			else value = (el.textContent || "").trim();
			const selector = uniqueSelector(el);
			out.push({ kind, label, value, selector });
		}
		return out;
	});
	// Register selectors and build textual lines
	const lines: string[] = [];
	for (const d of descriptors) {
		try {
			const token = registerElement(pageToken, d.selector);
			const safeLabel = d.label.replace(/\n/g, " ").replace(/"/g, '"');
			const safeValue = String(d.value).replace(/\n/g, " ").replace(/"/g, '"');
			lines.push(`- ${d.kind} "${safeLabel}" ref=${token} : ${safeValue}`);
		} catch (err) {
			// ignore registration errors for PoC
		}
	}
	return lines.join("\n");
}

/**
 * Trigger a download for an element reference or selector and save it to destPath.
 * If refToken is an element token (eN) the adapter will resolve its selector and page.
 * If a selector string is provided, pageToken must be provided as a hint.
 * @param refToken element token (eN) or selector string
 * @param destPath local filesystem path to save the downloaded file
 * @param pageToken optional page token when providing a selector instead of a ref token
 */
export async function downloadByRef(
	refToken: string,
	destPath: string,
	pageToken?: string,
): Promise<void> {
	ensureFlag();
	const { page, selector } = resolveRef(refToken, pageToken);
	// Wait for the element to be present
	await page
		.waitForSelector(selector, { state: "attached", timeout: 3000 })
		.catch(() => null);
	const handle = await page.$(selector);
	if (!handle)
		throw new Error(
			`downloadByRef: element not found for selector ${selector}`,
		);
	// Trigger download and wait for event
	try {
		const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
		// Prefer clicking the element handle directly
		await handle.click().catch(async () => {
			// fallback: click via evaluate (use selector)
			await page.evaluate((s) => {
				const el = document.querySelector(s) as HTMLElement | null;
				if (el) (el as HTMLElement).click();
			}, selector);
		});
		const download = await downloadPromise;
		// Use Playwright's API to save the download
		await download.saveAs(destPath);
	} catch (err) {
		throw new Error(
			`downloadByRef failed for selector ${selector}: ${(err as Error).message}`,
		);
	}
}

/** Adapter convenience helpers for auth-bootstrap script */
export async function open(url?: string) {
	ensureFlag();
	if (!context) await launchPersistent();
	if (!mainPageToken) {
		const pg = await context!.newPage();
		pageCounter += 1;
		mainPageToken = `p${pageCounter}`;
		pages.set(mainPageToken, pg);
	}
	const page = resolvePage(mainPageToken);
	if (url)
		await page
			.goto(url, { waitUntil: "domcontentloaded" })
			.catch(() => undefined);
	return mainPageToken;
}

export async function getUrl() {
	ensureFlag();
	if (!mainPageToken) throw new Error("No page available");
	const page = resolvePage(mainPageToken);
	return page.url();
}

export async function pageText() {
	ensureFlag();
	if (!mainPageToken) throw new Error("No page available");
	const page = resolvePage(mainPageToken);
	try {
		return await page.evaluate(() =>
			document.body
				? document.body.innerText
				: document.documentElement?.innerText || "",
		);
	} catch (err) {
		return "";
	}
}

export async function cookiesClear() {
	ensureFlag();
	if (!context) await launchPersistent();
	try {
		await context!.clearCookies();
	} catch (err) {
		throw new Error(`cookiesClear failed: ${(err as Error).message}`);
	}
}

export async function cookiesSet(cookies: Array<any>) {
	ensureFlag();
	if (!context) await launchPersistent();
	try {
		// Playwright expects expires in seconds since epoch (optional)
		const converted = cookies.map((c) => {
			const out: any = {
				name: c.name,
				value: c.value,
				domain: c.domain,
				path: c.path || "/",
				httpOnly: Boolean(c.httpOnly),
				secure: Boolean(c.secure),
			};
			if (typeof c.expires === "number") out.expires = Math.round(c.expires);
			if (c.sameSite) out.sameSite = c.sameSite as any;
			return out;
		});
		await context!.addCookies(converted);
	} catch (err) {
		throw new Error(`cookiesSet failed: ${(err as Error).message}`);
	}
}

export async function screenshot(destPath: string) {
	ensureFlag();
	if (!mainPageToken) throw new Error("No page available for screenshot");
	const page = resolvePage(mainPageToken);
	try {
		await page.screenshot({ path: destPath, fullPage: true });
	} catch (err) {
		throw new Error(`screenshot failed: ${(err as Error).message}`);
	}
}

export default {
	launchPersistent,
	newPage,
	close,
	evaluate,
	fill,
	upload,
	registerElement,
	snapshotText,
	downloadByRef,
	open,
	getUrl,
	pageText,
	cookiesClear,
	cookiesSet,
	screenshot,
};
