import { describe, it, expect } from "vitest";
import {
    CHATGPT_TESTIDS,
    CHATGPT_SEMANTIC_SELECTORS,
    CHATGPT_LABELS,
} from "../../extensions/oracle/pages/chatgpt/chatgpt.selectors";

// ---------------------------------------------------------------------------
// CHATGPT_TESTIDS
// ---------------------------------------------------------------------------
describe("CHATGPT_TESTIDS", () => {
    it("has SEND_BUTTON", () => {
        expect(CHATGPT_TESTIDS.SEND_BUTTON).toBe("send-button");
    });

    it("has STOP_BUTTON", () => {
        expect(CHATGPT_TESTIDS.STOP_BUTTON).toBe("stop-button");
    });

    it("has NEW_CHAT_BUTTON", () => {
        expect(CHATGPT_TESTIDS.NEW_CHAT_BUTTON).toBe("create-new-chat-button");
    });

    it("has COPY_TURN_ACTION", () => {
        expect(CHATGPT_TESTIDS.COPY_TURN_ACTION).toBe("copy-turn-action-button");
    });

    it("has MODEL_SWITCHER", () => {
        expect(CHATGPT_TESTIDS.MODEL_SWITCHER).toBe("model-switcher-dropdown-button");
    });

    it("has COMPOSER_PLUS_BTN", () => {
        expect(CHATGPT_TESTIDS.COMPOSER_PLUS_BTN).toBe("composer-plus-btn");
    });

    it("has GOOD_RESPONSE", () => {
        expect(CHATGPT_TESTIDS.GOOD_RESPONSE).toBe("good-response-turn-action-button");
    });

    it("has BAD_RESPONSE", () => {
        expect(CHATGPT_TESTIDS.BAD_RESPONSE).toBe("bad-response-turn-action-button");
    });

    it("has CLOSE_SIDEBAR", () => {
        expect(CHATGPT_TESTIDS.CLOSE_SIDEBAR).toBe("close-sidebar-button");
    });

    it("has PROFILE_BUTTON", () => {
        expect(CHATGPT_TESTIDS.PROFILE_BUTTON).toBe("accounts-profile-button");
    });

    it("has CONVERSATION_OPTIONS", () => {
        expect(CHATGPT_TESTIDS.CONVERSATION_OPTIONS).toBe("conversation-options-button");
    });
});

// ---------------------------------------------------------------------------
// CHATGPT_SEMANTIC_SELECTORS
// ---------------------------------------------------------------------------
describe("CHATGPT_SEMANTIC_SELECTORS", () => {
    it("has PROMPT_TEXTAREA", () => {
        expect(CHATGPT_SEMANTIC_SELECTORS.PROMPT_TEXTAREA).toBe("#prompt-textarea");
    });

    it("has ASSISTANT_MESSAGE selector", () => {
        expect(CHATGPT_SEMANTIC_SELECTORS.ASSISTANT_MESSAGE).toContain("data-message-author-role");
    });

    it("has USER_MESSAGE selector", () => {
        expect(CHATGPT_SEMANTIC_SELECTORS.USER_MESSAGE).toContain("data-message-author-role");
        expect(CHATGPT_SEMANTIC_SELECTORS.USER_MESSAGE).toContain("user");
    });

    it("has STREAM_ACTIVE selector", () => {
        expect(CHATGPT_SEMANTIC_SELECTORS.STREAM_ACTIVE).toContain("data-stream-active");
    });

    it("has THREAD selector", () => {
        expect(CHATGPT_SEMANTIC_SELECTORS.THREAD).toBe("#thread");
    });
});

// ---------------------------------------------------------------------------
// CHATGPT_LABELS
// ---------------------------------------------------------------------------
describe("CHATGPT_LABELS", () => {
    it("has composer labels including English", () => {
        expect(CHATGPT_LABELS.composer).toContain("Message ChatGPT");
        expect(CHATGPT_LABELS.composer).toContain("Chat with ChatGPT");
    });

    it("has send labels", () => {
        expect(CHATGPT_LABELS.send).toContain("Send prompt");
        expect(CHATGPT_LABELS.send).toContain("Send");
    });

    it("has stop labels", () => {
        expect(CHATGPT_LABELS.stop).toContain("Stop streaming");
        expect(CHATGPT_LABELS.stop).toContain("Stop generating");
    });

    it("has copyResponse labels", () => {
        expect(CHATGPT_LABELS.copyResponse).toContain("Copy response");
    });

    it("has addFiles labels", () => {
        expect(CHATGPT_LABELS.addFiles).toContain("Add files and more");
        expect(CHATGPT_LABELS.addFiles).toContain("Add files");
    });

    it("has modelSelector labels", () => {
        expect(CHATGPT_LABELS.modelSelector).toContain("Model selector");
    });

    it("has login labels", () => {
        expect(CHATGPT_LABELS.login).toContain("Log in");
        expect(CHATGPT_LABELS.login).toContain("Sign up");
    });
});
