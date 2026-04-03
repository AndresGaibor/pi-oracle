// pages/chatgpt/chatgpt.page.ts - ChatGPT Page Object
import { BasePage, labelMatches, type SnapshotEntry } from "../base.page.js";
import { CHATGPT, findWorkingSelector } from "./chatgpt-selectors.js";

export class ChatGPTPage extends BasePage {
	// ---- State ----
	private language: "en" | "es" = "es";

	setLanguage(lang: "en" | "es") {
		this.language = lang;
	}

	private get labels() {
		return this.language === "es" ? CHATGPT.LABELS_ES : CHATGPT.LABELS;
	}

	// ---- Navigation ----
	async goToChat(): Promise<void> {
		await this.navigate(CHATGPT.URLS.CHAT);
	}

	async goToAuth(): Promise<void> {
		await this.navigate(CHATGPT.URLS.AUTH);
	}

	// ---- Authentication ----
	async isAuthenticated(): Promise<boolean> {
		await this.goToChat();
		await new Promise((r) => setTimeout(r, 3000));
		const text = await this.getPageText();

		// If we find login labels → not authenticated
		const hasLoginLabel = this.labels.LOGIN.some((l) =>
			text.toLowerCase().includes(l.toLowerCase()),
		);
		return !hasLoginLabel;
	}

	async waitForAuth(timeoutMs = 30000): Promise<boolean> {
		const start = Date.now();
		while (Date.now() - start < timeoutMs) {
			if (await this.isAuthenticated()) return true;
			await new Promise((r) => setTimeout(r, 2000));
		}
		return false;
	}

	// ---- Chat Interaction ----
	async startNewChat(): Promise<void> {
		const entry = await this.findEntry(
			(e) =>
				e.kind === "link" && labelMatches(e.label, CHATGPT.LABELS.NEW_CHAT),
		);
		if (entry) {
			await this.click(entry);
			await new Promise((r) => setTimeout(r, 1000));
		}
	}

	async findTextarea(): Promise<string | null> {
		return findWorkingSelector(CHATGPT.SELECTORS.TEXTAREA, (code) =>
			this.evaluateCode(code),
		);
	}

	async typePrompt(text: string, human = true): Promise<void> {
		const selector = await this.findTextarea();
		if (!selector) {
			throw new Error(
				"Textarea not found. Page may not be ready or showing login.",
			);
		}
		await this.type(selector, text, human);
	}

	async sendPrompt(text: string, human = true): Promise<void> {
		await this.typePrompt(text, human);
		await new Promise((r) => setTimeout(r, 300 + Math.random() * 700)); // "think" before sending

		// Find send button via snapshot
		const sendEntry = await this.findEntry(
			(e) =>
				e.kind === "button" &&
				labelMatches(e.label, this.labels.SEND) &&
				!e.disabled,
		);

		if (sendEntry) {
			await this.click(sendEntry);
		} else {
			// Fallback: try CSS selectors
			const selector = await findWorkingSelector(
				CHATGPT.SELECTORS.SEND_BUTTON,
				(code) => this.evaluateCode(code),
			);
			if (selector) {
				await this.evaluateCode(
					`document.querySelector('${selector}').click()`,
				);
			} else {
				throw new Error("Send button not found. Prompt sent without click?");
			}
		}
	}

	// ---- Wait for Response ----
	async isGenerating(): Promise<boolean> {
		const entry = await this.findEntry(
			(e) => e.kind === "button" && labelMatches(e.label, this.labels.STOP),
		);
		return !!entry;
	}

	async waitForResponse(timeoutMs = 120000): Promise<string> {
		const start = Date.now();
		let lastText = "";

		while (Date.now() - start < timeoutMs) {
			// If it stopped generating, wait a bit more for final tokens
			if (!(await this.isGenerating())) {
				await new Promise((r) => setTimeout(r, 2000));
				const currentText = await this.getPageText();
				if (currentText !== lastText && currentText.length > lastText.length) {
					return currentText;
				}
				// If after stopping generating there's no new content, it's done
				await new Promise((r) => setTimeout(r, 1000));
				return lastText;
			}

			await new Promise((r) => setTimeout(r, 3000));
			lastText = await this.getPageText();
			console.log(
				`  ... waiting for response (${Math.round((Date.now() - start) / 1000)}s)`,
			);
		}

		throw new Error(
			`Timeout waiting for response after ${Math.round(timeoutMs / 1000)}s`,
		);
	}

	// ---- Upload Files ----
	async uploadFile(filePath: string): Promise<void> {
		const selector = CHATGPT.SELECTORS.FILE_UPLOAD_INPUT[0];
		console.log(`Uploading file: ${filePath} via ${selector}`);
	}

	// ---- Classify Page State ----
	async classifyPage(): Promise<"chat" | "auth" | "loading" | "unknown"> {
		const text = await this.getPageText();

		// Auth indicators
		if (
			this.labels.LOGIN.some((l) =>
				text.toLowerCase().includes(l.toLowerCase()),
			)
		) {
			return "auth";
		}

		// Chat indicators
		if (
			CHATGPT.LABELS.NEW_CHAT.some((l) =>
				text.toLowerCase().includes(l.toLowerCase()),
			)
		) {
			return "chat";
		}

		// Loading
		if (text.length < 50) {
			return "loading";
		}

		return "unknown";
	}

	// ---- Diagnostic ----
	async diagnose(): Promise<string[]> {
		const issues: string[] = [];

		// Check if we're on ChatGPT
		const url = await this.getCurrentUrl();
		if (!url.includes("chatgpt.com")) {
			issues.push(`Incorrect URL: ${url} (expected chatgpt.com)`);
		}

		// Check textarea
		const textarea = await this.findTextarea();
		if (!textarea) {
			issues.push("Textarea not found - may be on login or UI changed");
		}

		// Check send button
		const sendEntry = await this.findEntry(
			(e) => e.kind === "button" && labelMatches(e.label, this.labels.SEND),
		);
		if (!sendEntry) {
			issues.push("Send button not found");
		}

		// Check webdriver flag
		const webdriver = await this.evaluateCode("navigator.webdriver");
		if (webdriver) {
			issues.push("navigator.webdriver = true — DETECTED as bot");
		}

		// Check plugins
		const plugins = await this.evaluateCode("navigator.plugins.length");
		if (plugins === 0) {
			issues.push("navigator.plugins = 0 — possible detection");
		}

		// Check authentication
		if (!(await this.isAuthenticated())) {
			issues.push("Not authenticated - need /oracle-auth");
		}

		return issues;
	}

	// Helper to evaluate code in browser context
	private async evaluateCode(code: string): Promise<unknown> {
		// This will be implemented by the Playwright adapter
		console.log(`Evaluating: ${code.slice(0, 50)}...`);
		return undefined;
	}
}
