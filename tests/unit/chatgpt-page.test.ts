import { describe, it, expect, vi } from "vitest";
import { ChatGPTPage } from "../../extensions/oracle/pages/chatgpt/chatgpt.page";
import { createMockBrowserActions } from "../fixtures/mock-browser-actions";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSnapshot(name: string): string {
    return readFileSync(join(__dirname, "../fixtures/snapshots", name), "utf-8");
}

describe("ChatGPTPage", () => {
    describe("providerName", () => {
        it("returns 'chatgpt'", () => {
            const page = new ChatGPTPage();
            expect(page.providerName).toBe("chatgpt");
        });
    });

    describe("classifyPage", () => {
        it("classifies challenge page correctly", () => {
            const page = new ChatGPTPage();
            const snapshot = loadSnapshot("challenge-page.snapshot.txt");
            const result = page.classifyPage({
                snapshot,
                url: "https://chatgpt.com/",
                body: "Just a moment... Verify you are human",
            });
            expect(result.state).toBe("challenge_blocking");
        });

        it("classifies outage page correctly", () => {
            const page = new ChatGPTPage();
            const snapshot = loadSnapshot("outage-page.snapshot.txt");
            const result = page.classifyPage({
                snapshot,
                url: "https://chatgpt.com/",
                body: "Something went wrong",
            });
            expect(result.state).toBe("transient_outage_error");
        });
    });

    describe("clickComposer", () => {
        it("delegates to browser.clickRef with the correct ref", async () => {
            const snapshot = loadSnapshot("chat-ready.snapshot.txt");
            const mockBrowser = createMockBrowserActions({
                snapshotText: async () => snapshot,
                clickRef: async () => {},
            });
            const page = new ChatGPTPage();
            await page.clickComposer(mockBrowser);
            expect(mockBrowser.snapshotText).toHaveBeenCalled();
            expect(mockBrowser.clickRef).toHaveBeenCalled();
        });
    });

    describe("typePrompt", () => {
        it("delegates to browser.evaluate with a script", async () => {
            const mockBrowser = createMockBrowserActions({
                evaluate: async () => ({ success: true }),
                getMainPageId: () => "mock-page",
            });
            const page = new ChatGPTPage();
            const result = await page.typePrompt(mockBrowser, "Hello world");
            expect(mockBrowser.evaluate).toHaveBeenCalled();
            expect(result).toBe(true);
        });

        it("returns false when evaluation fails", async () => {
            const mockBrowser = createMockBrowserActions({
                evaluate: async () => ({ success: false }),
                getMainPageId: () => "mock-page",
            });
            const page = new ChatGPTPage();
            const result = await page.typePrompt(mockBrowser, "Hello world");
            expect(result).toBe(false);
        });
    });

    describe("clickSend", () => {
        it("throws when send button is not found", async () => {
            const mockBrowser = createMockBrowserActions({
                snapshotText: async () => loadSnapshot("login-page.snapshot.txt"),
            });
            const page = new ChatGPTPage();
            await expect(page.clickSend(mockBrowser)).rejects.toThrow(
                "Send button not found",
            );
        });

        it("clicks the send button when found", async () => {
            const snapshot = [
                '- button "Send prompt" ref=e20',
                '- textbox "Ask anything" ref=e10',
            ].join("\n");
            const mockBrowser = createMockBrowserActions({
                snapshotText: async () => snapshot,
                clickRef: async () => {},
            });
            const page = new ChatGPTPage();
            await page.clickSend(mockBrowser);
            expect(mockBrowser.clickRef).toHaveBeenCalled();
        });
    });

    describe("getAssistantMessages", () => {
        it("calls browser.evaluate with the message extraction script", async () => {
            const messages = JSON.stringify({ messages: [{ text: "Hello" }] });
            const mockBrowser = createMockBrowserActions({
                evaluate: async () => messages,
                getMainPageId: () => "mock-page",
            });
            const page = new ChatGPTPage();
            const result = await page.getAssistantMessages(mockBrowser);
            expect(mockBrowser.evaluate).toHaveBeenCalled();
            expect(result).toEqual([{ text: "Hello" }]);
        });

        it("returns empty array when evaluate returns non-string", async () => {
            const mockBrowser = createMockBrowserActions({
                evaluate: async () => null,
                getMainPageId: () => "mock-page",
            });
            const page = new ChatGPTPage();
            const result = await page.getAssistantMessages(mockBrowser);
            expect(result).toEqual([]);
        });

        it("returns empty array when parse fails", async () => {
            const mockBrowser = createMockBrowserActions({
                evaluate: async () => "not json",
                getMainPageId: () => "mock-page",
            });
            const page = new ChatGPTPage();
            const result = await page.getAssistantMessages(mockBrowser);
            expect(result).toEqual([]);
        });
    });

    describe("isResponseComplete", () => {
        it("returns true for completed response snapshot", () => {
            const page = new ChatGPTPage();
            const snapshot = loadSnapshot("response-complete.snapshot.txt");
            expect(page.isResponseComplete(snapshot)).toBe(true);
        });

        it("returns false for streaming snapshot", () => {
            const page = new ChatGPTPage();
            const snapshot = loadSnapshot("response-in-progress.snapshot.txt");
            expect(page.isResponseComplete(snapshot)).toBe(false);
        });
    });

    describe("sendPrompt", () => {
        it("delegates to browser.press with 'Enter'", async () => {
            const mockBrowser = createMockBrowserActions({
                press: async () => {},
            });
            const page = new ChatGPTPage();
            await page.sendPrompt(mockBrowser);
            expect(mockBrowser.press).toHaveBeenCalledWith("Enter");
        });
    });

    describe("clickAddFiles", () => {
        it("returns false when button not found", async () => {
            const mockBrowser = createMockBrowserActions({
                snapshotText: async () => "nothing here ref=e1",
            });
            const page = new ChatGPTPage();
            const result = await page.clickAddFiles(mockBrowser);
            expect(result).toBe(false);
        });

        it("returns true and clicks when button found", async () => {
            const snapshot = '- button "Add files and more" ref=e25';
            const mockBrowser = createMockBrowserActions({
                snapshotText: async () => snapshot,
                clickRef: async () => {},
            });
            const page = new ChatGPTPage();
            const result = await page.clickAddFiles(mockBrowser);
            expect(result).toBe(true);
            expect(mockBrowser.clickRef).toHaveBeenCalled();
        });
    });
});
