// pages/chatgpt/chatgpt-auth.page.ts - ChatGPT Auth Page Object (composes selectors + actions + assertions)
import { BasePage } from "../base.page";
import type { BrowserActions } from "../browser-actions.types";

// Re-export sub-modules for consumers
export type { BrowserActions } from "../browser-actions.types";
export * from "./chatgpt-auth.selectors";
// Avoid duplicate exports of SnapshotEntry and parseSnapshotEntries
export { clickLogin, clickAccountChooser, clickLoginCta } from "./chatgpt-auth.actions";
export { isOnAuthPage, hasLoginCta, detectChallenge, detectOutage, getLoginProbeScript, parseLoginProbeResult } from "./chatgpt-auth.assertions";

/**
 * ChatGPTAuthPage – Page Object for ChatGPT authentication.
 * Composes selectors, actions, and assertions.
 */
export class ChatGPTAuthPage extends BasePage {
	private chatUrl: string;

	constructor(chatUrl: string = "https://chatgpt.com") {
		super();
		this.chatUrl = chatUrl;
	}

	// -----------------------------------------------------------------------
	// Actions
	// -----------------------------------------------------------------------

	/** Click login button/link if visible */
	public async clickLogin(browser: BrowserActions): Promise<boolean> {
		const { clickLogin } = await import("./chatgpt-auth.actions");
		return clickLogin(browser);
	}

	/** Click account chooser button by name */
	public async clickAccountChooser(browser: BrowserActions, accountName: string): Promise<boolean> {
		const { clickAccountChooser } = await import("./chatgpt-auth.actions");
		return clickAccountChooser(browser, accountName);
	}

	/** Click first visible login CTA */
	public async clickLoginCta(browser: BrowserActions): Promise<boolean> {
		const { clickLoginCta } = await import("./chatgpt-auth.actions");
		return clickLoginCta(browser);
	}

	// -----------------------------------------------------------------------
	// Assertions
	// -----------------------------------------------------------------------

	/** Check if on auth page by URL */
	public isOnAuthPage(url: string): boolean {
		const { isOnAuthPage } = require("./chatgpt-auth.assertions");
		return isOnAuthPage(url);
	}

	/** Check if login CTA is visible */
	public async hasLoginCta(browser: BrowserActions): Promise<boolean> {
		const { hasLoginCta } = await import("./chatgpt-auth.assertions");
		const snapshot = await browser.snapshotText();
		return hasLoginCta(snapshot);
	}

	/** Detect challenge page */
	public detectChallenge(text: string): { detected: boolean; type?: string } {
		const { detectChallenge } = require("./chatgpt-auth.assertions");
		return detectChallenge(text);
	}

	/** Detect outage page */
	public detectOutage(text: string): { detected: boolean; type?: string } {
		const { detectOutage } = require("./chatgpt-auth.assertions");
		return detectOutage(text);
	}

	/** Get login probe script */
	public getLoginProbeScript(timeoutMs: number = 5000): string {
		const { getLoginProbeScript } = require("./chatgpt-auth.assertions");
		return getLoginProbeScript(timeoutMs);
	}

	/** Parse login probe result */
	public parseLoginProbe(result: unknown) {
		const { parseLoginProbeResult } = require("./chatgpt-auth.assertions");
		return parseLoginProbeResult(result);
	}
}
