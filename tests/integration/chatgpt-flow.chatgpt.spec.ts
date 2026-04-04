import { test, expect, type Page } from "@playwright/test";

/**
 * Test de integración: Flujo completo de ChatGPT.
 *
 * REQUISITOS:
 * - Cookies válidas de ChatGPT inyectadas en el contexto del navegador
 * - Conexión a internet activa
 *
 * Para ejecutar:
 *   1. npx tsx scripts/save-chatgpt-cookies.ts
 *   2. Remove the .skip() below
 *   3. npx playwright test tests/integration/chatgpt-flow.chatgpt.spec.ts
 */

test.describe.skip("ChatGPT full flow", () => {
    let page: Page;

    test.beforeEach(async ({ browser }) => {
        const context = await browser.newContext({
            storageState: ".auth/chatgpt-cookies.json",
        });
        page = await context.newPage();
    });

    test("debe navegar a chatgpt.com y detectar composer", async () => {
        await page.goto("https://chatgpt.com/");

        const promptTextarea = page.locator("#prompt-textarea");
        await promptTextarea.waitFor({ state: "visible", timeout: 30_000 });
        await expect(promptTextarea).toBeVisible();
    });

    test("debe enviar un prompt y recibir respuesta", async () => {
        await page.goto("https://chatgpt.com/");

        const promptTextarea = page.locator("#prompt-textarea");
        await promptTextarea.waitFor({ state: "visible", timeout: 30_000 });

        await promptTextarea.fill("Say 'hello' and nothing else");
        await page.keyboard.press("Enter");

        const sendButton = page.locator('[data-testid="send-button"]');
        await sendButton.waitFor({ state: "visible", timeout: 120_000 });

        const assistantMessage = page.locator('[data-message-author-role="assistant"]').last();
        await expect(assistantMessage).toBeVisible();

        const text = await assistantMessage.textContent();
        expect(text?.toLowerCase()).toContain("hello");
    });

    test("debe crear un nuevo chat", async () => {
        await page.goto("https://chatgpt.com/");

        const newChatButton = page.locator('[data-testid="create-new-chat-button"]');
        await expect(newChatButton).toBeVisible();
        await newChatButton.click();

        await page.waitForURL(/\/c\//, { timeout: 10_000 });
    });
});
