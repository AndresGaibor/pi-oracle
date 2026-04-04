// pages/chatgpt/chatgpt.page.ts - ChatGPT Page Object (composes selectors + actions + assertions)

import { BasePage } from "../base.page";
import type { BrowserActions } from "../browser-actions.types";
import type { AIProviderPage, ClassifyParams, WaitOpts, AIProviderResult } from "../ai-provider.types";
import { classifyChatPage, type PageState } from "../../shared/login-utils";

// Static imports (no dynamic await import())
import {
	clickComposer,
	typePrompt,
	clickSend,
	sendPrompt,
	clickAddFiles,
} from "./chatgpt.actions";
import { buildAssistantMessagesScript, isResponseComplete as checkResponseComplete } from "./chatgpt.assertions";

// Re-export sub-modules for consumers
export type { BrowserActions } from "../browser-actions.types";
export { CHATGPT_LABELS as DEFAULT_LABELS } from "./chatgpt.selectors";
export * from "./chatgpt.selectors";
export * from "./chatgpt.actions";
export * from "./chatgpt.assertions";

/**
 * ChatGPTPage – Page Object for ChatGPT UI.
 * Composes selectors, actions, and assertions.
 * Implements AIProviderPage interface for abstraction.
 */
export class ChatGPTPage extends BasePage implements AIProviderPage {
	/** Provider name for identification */
	readonly providerName = "chatgpt" as const;

	private chatUrl: string;

	constructor(chatUrl: string = "https://chatgpt.com") {
		super();
		this.chatUrl = chatUrl;
	}

	// -----------------------------------------------------------------------
	// AIProviderPage Implementation
	// -----------------------------------------------------------------------

	/** Classify page state (authenticated, login_required, etc) */
	public classifyPage(params: ClassifyParams): { state: PageState; message: string } {
		return classifyChatPage({
			snapshot: params.snapshot,
			body: params.body,
			url: params.url,
			probe: params.probe,
			chatUrl: this.chatUrl,
		});
	}

	/** Click the composer textbox to focus it */
	public async clickComposer(browser: BrowserActions): Promise<void> {
		await clickComposer(browser);
	}

	/** Type a prompt into the composer via JS (handles contenteditable) */
	public async typePrompt(browser: BrowserActions, prompt: string): Promise<boolean> {
		return typePrompt(browser, prompt);
	}

	/** Click the send button */
	public async clickSend(browser: BrowserActions): Promise<void> {
		await clickSend(browser);
	}

	/** Get assistant messages from the page */
	public async getAssistantMessages(browser: BrowserActions): Promise<Array<{ text: string }>> {
		const result = await browser.evaluate(browser.getMainPageId(), buildAssistantMessagesScript());

		if (typeof result !== "string") return [];
		try {
			const parsed = JSON.parse(result);
			if (!Array.isArray(parsed?.messages)) return [];
			return parsed.messages.map((m: unknown) => ({ text: typeof (m as { text?: string })?.text === "string" ? (m as { text: string }).text : "" }));
		} catch {
			return [];
		}
	}

	/** Check if response is complete (not streaming) */
	public isResponseComplete(snapshot: string): boolean {
		return checkResponseComplete(snapshot);
	}

	/** Wait for response to complete */
	public async waitForResponse(browser: BrowserActions, opts: WaitOpts): Promise<AIProviderResult> {
		const timeoutAt = Date.now() + opts.timeoutMs;
		let lastText = "";
		let stableCount = 0;

		while (Date.now() < timeoutAt) {
			const snapshot = await browser.snapshotText();
			const messages = await this.getAssistantMessages(browser);
			const targetMessage = messages[opts.baselineAssistantCount];
			const targetText = targetMessage?.text || "";
			const hasCompletedResponse = this.isResponseComplete(snapshot);

			if (targetText && hasCompletedResponse) {
				if (targetText === lastText) stableCount += 1;
				else stableCount = 1;
				lastText = targetText;
				if (stableCount >= 3) {
					return {
						responseText: targetText,
						responseIndex: opts.baselineAssistantCount,
						artifacts: [],
						chatUrl: await browser.getCurrentUrl(),
					};
				}
			}
			await new Promise((resolve) => setTimeout(resolve, opts.pollMs));
		}
		throw new Error("Timed out waiting for ChatGPT response completion");
	}

	// -----------------------------------------------------------------------
	// ChatGPT-specific methods (not in interface)
	// -----------------------------------------------------------------------

	/** Submit prompt using Enter key (preferred over clickSend) */
	public async sendPrompt(browser: BrowserActions): Promise<void> {
		await sendPrompt(browser);
	}

	/** Click the add files button */
	public async clickAddFiles(browser: BrowserActions): Promise<boolean> {
		return clickAddFiles(browser);
	}
}