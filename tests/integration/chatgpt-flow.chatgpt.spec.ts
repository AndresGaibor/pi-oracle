import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * Test de integración: Flujo completo de ChatGPT.
 *
 * REQUISITOS:
 * - Cookies válidas de ChatGPT inyectadas en el contexto del navegador
 * - Conexión a internet activa
 *
 * Para ejecutar:
 *   npx playwright test tests/integration/chatgpt-flow.chatgpt.spec.ts
 */

const COOKIE_FILE = ".auth/chatgpt-cookies.json";
const hasCookies = existsSync(COOKIE_FILE);

test.describe.skipIf(!hasCookies)("ChatGPT full flow", () => {
    let page: Page;

    test.beforeEach(async ({ browser }) => {
        const context = await browser.newContext({
            storageState: COOKIE_FILE,
        });
        page = await context.newPage();
    });

    test("debe navegar a chatgpt.com y detectar composer", async () => {
        await page.goto("https://chatgpt.com/");

        // Esperar al textarea del prompt
        const promptTextarea = page.locator("#prompt-textarea");
        await promptTextarea.waitFor({ state: "visible", timeout: 30_000 });

        // Verificar que el composer está presente
        await expect(promptTextarea).toBeVisible();
    });

    test("debe enviar un prompt y recibir respuesta", async () => {
        await page.goto("https://chatgpt.com/");

        const promptTextarea = page.locator("#prompt-textarea");
        await promptTextarea.waitFor({ state: "visible", timeout: 30_000 });

        // Enviar prompt simple
        await promptTextarea.click();
        await promptTextarea.pressSequentially("Say 'hello' and nothing else", { delay: 10 });
        await page.keyboard.press("Enter");

        // Esperar a que la respuesta termine
        // The send button reappears when streaming is done
        const sendButton = page.locator('[data-testid="send-button"]');
        await sendButton.waitFor({ state: "visible", timeout: 120_000 });

        // Verificar que existe un mensaje del asistente
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

        // Verify URL changed to a new conversation
        await page.waitForURL(/\/c\//, { timeout: 10_000 });
    });
});
