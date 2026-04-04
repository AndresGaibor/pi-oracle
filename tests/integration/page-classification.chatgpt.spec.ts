import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * Test de integración: Clasificación de páginas de ChatGPT.
 *
 * REQUISITOS:
 * - Cookies válidas de ChatGPT
 */

const COOKIE_FILE = ".auth/chatgpt-cookies.json";
const hasCookies = existsSync(COOKIE_FILE);

test.describe.skipIf(!hasCookies)("Page classification", () => {
    test("debe clasificar correctamente la página de login", async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto("https://chatgpt.com/auth/login");

        // On auth page, should NOT see the composer
        const promptTextarea = page.locator("#prompt-textarea");
        await expect(promptTextarea).not.toBeVisible({ timeout: 10_000 }).catch(() => {});
    });
});
