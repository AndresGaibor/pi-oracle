import { test, expect } from "@playwright/test";

/**
 * Test de integración: Clasificación de páginas de ChatGPT.
 *
 * REQUISITOS:
 * - Cookies válidas de ChatGPT (archivo .auth/chatgpt-cookies.json)
 *
 * Para ejecutar, remover .skip y:
 *   npx playwright test tests/integration/page-classification.chatgpt.spec.ts
 */

test.describe.skip("Page classification", () => {
    test("debe clasificar correctamente la página de login", async ({ browser }) => {
        const context = await browser.newContext({
            storageState: ".auth/chatgpt-cookies.json",
        });
        const page = await context.newPage();
        await page.goto("https://chatgpt.com/auth/login");

        // On auth page, should NOT see the composer
        const promptTextarea = page.locator("#prompt-textarea");
        await expect(promptTextarea).not.toBeVisible({ timeout: 10_000 }).catch(() => {});
    });
});
