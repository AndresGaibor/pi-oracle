// pages/chatgpt/chatgpt.page.ts - ChatGPT Page Object (composes selectors + actions + assertions)
import { BasePage } from "../base.page";
import type { BrowserActions } from "../browser-actions.types";
import { classifyChatPage, type LoginProbeResult, type PageState } from "../../shared/login-utils";

// Re-export sub-modules for consumers
export type { BrowserActions } from "../browser-actions.types";
export { CHATGPT_LABELS as DEFAULT_LABELS } from "./chatgpt.selectors";
export * from "./chatgpt.selectors";
export * from "./chatgpt.actions";
export * from "./chatgpt.assertions";

/**
 * ChatGPTPage – Page Object for ChatGPT UI.
 * Composes selectors, actions, and assertions.
 * Delegates browser operations to a BrowserActions implementation.
 */
export class ChatGPTPage extends BasePage {
	private chatUrl: string;

	constructor(chatUrl: string = "https://chatgpt.com") {
		super();
		this.chatUrl = chatUrl;
	}

	// -----------------------------------------------------------------------
	// Assertions (read-only state checks)
	// -----------------------------------------------------------------------

	/** Classify page state (authenticated, login_required, etc) */
	public classifyPage(params: {
		snapshot: string;
		body: string;
		url: string;
		probe?: LoginProbeResult;
	}): { state: PageState; message: string } {
		return classifyChatPage({
			snapshot: params.snapshot,
			body: params.body,
			url: params.url,
			probe: params.probe,
			chatUrl: this.chatUrl,
		});
	}

	// -----------------------------------------------------------------------
	// Actions (browser interactions)
	// -----------------------------------------------------------------------

	/** Click the composer textbox to focus it */
	public async clickComposer(browser: BrowserActions): Promise<void> {
		const { clickComposer } = await import("./chatgpt.actions");
		await clickComposer(browser);
	}

	/** Type a prompt into the composer via JS (handles contenteditable) */
	public async typePrompt(browser: BrowserActions, prompt: string): Promise<boolean> {
		const { typePrompt } = await import("./chatgpt.actions");
		return typePrompt(browser, prompt);
	}

	/** Click the send button */
	public async clickSend(browser: BrowserActions): Promise<void> {
		const { clickSend } = await import("./chatgpt.actions");
		await clickSend(browser);
	}

	/** Click the add files button */
	public async clickAddFiles(browser: BrowserActions): Promise<boolean> {
		const { clickAddFiles } = await import("./chatgpt.actions");
		return clickAddFiles(browser);
	}

	/** Get assistant messages from the page */
	public async getAssistantMessages(browser: BrowserActions): Promise<Array<{ text: string }>> {
		const { buildAssistantMessagesScript } = await import("./chatgpt.assertions");
		const result = await browser.evaluate(browser.getMainPageId(), buildAssistantMessagesScript());

		if (typeof result !== "string") return [];
		try {
			const parsed = JSON.parse(result);
			if (!Array.isArray(parsed?.messages)) return [];
			return parsed.messages.map((m: any) => ({ text: typeof m?.text === "string" ? m.text : "" }));
		} catch {
			return [];
		}
	}
}
