/**
 * Script para guardar cookies de ChatGPT para tests de integración.
 *
 * Uso:
 * npx tsx scripts/save-chatgpt-cookies.ts
 *
 * Esto abre un navegador, navega a ChatGPT, permite al usuario
 * iniciar sesión manualmente, y guarda las cookies en .auth/chatgpt-cookies.json
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

async function main() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("=== Guardando cookies de ChatGPT ===");
    console.log("1. Inicia sesión manualmente en ChatGPT");
    console.log("2. Espera a que se cargue completamente el chat");
    console.log("3. Presiona Enter en la terminal para guardar las cookies\n");

    await page.goto("https://chatgpt.com/");

    // Esperar a que el usuario presione Enter
    await new Promise<void>((resolve) => {
        process.stdin.once("data", () => resolve());
    });

    // Guardar cookies
    mkdirSync(".auth", { recursive: true });
    await context.storageState({ path: ".auth/chatgpt-cookies.json" });
    console.log("\n✅ Cookies guardadas en .auth/chatgpt-cookies.json");

    await browser.close();
}

main().catch(console.error);
