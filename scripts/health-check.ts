// scripts/health-check.ts

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveBrowserPath } from "../extensions/oracle/lib/browser-detection";
import { getCookiePath } from "../extensions/oracle/lib/cookie-paths";

const checks: { name: string; fn: () => Promise<boolean> }[] = [];

function check(name: string, fn: () => Promise<boolean>) {
    checks.push({ name, fn });
}

check("Brave Browser instalado (o fallback disponible)", async () => {
    // Check if any browser is detected by our cross-platform detection
    const detected = resolveBrowserPath();
    if (detected.source === "fallback") {
        console.log("     -> No system browser found, will use Playwright bundled chromium");
    }
    // Always pass — fallback exists
    return true;
});

check("Perfil Brave/Chrome existe", async () => {
    const cookiePath = getCookiePath("brave") ?? getCookiePath("chrome");
    if (!cookiePath) return false;
    return existsSync(cookiePath);
});

check("Playwright disponible", async () => {
    try {
        await import("playwright");
        return true;
    } catch {
        return false;
    }
});

check("sweet-cookie disponible", async () => {
    try {
        await import("@steipete/sweet-cookie");
        return true;
    } catch {
        return false;
    }
});

check("Adapter Playwright exportable", async () => {
    try {
        const mod = await import("../adapter/playwright-adapter.ts");
        return (
            typeof mod.launchPersistent === "function" &&
            typeof mod.close === "function"
        );
    } catch {
        return false;
    }
});

check("Cookies ChatGPT legibles", async () => {
    try {
        const { getCookies } = await import("@steipete/sweet-cookie");
        const profilePath = getCookiePath("brave") ?? getCookiePath("chrome") ?? "";
        const { cookies } = await getCookies({
            url: "https://chatgpt.com/",
            origins: [
                "https://chatgpt.com",
                "https://chat.openai.com",
                "https://atlas.openai.com",
                "https://auth.openai.com",
                "https://sentinel.openai.com",
                "https://ws.chatgpt.com",
            ],
            browsers: ["chrome"],
            mode: "merge",
            chromeProfile: profilePath,
        });
        // Usar .domain en lugar de .host_key (estructura correcta de sweet-cookie)
        const chatgptCookies = cookies.filter(
            (c: any) =>
                c.domain?.includes("chatgpt.com") || c.domain?.includes("openai.com"),
        );
        const hasSession = chatgptCookies.some((c: any) =>
            c.name.includes("session-token"),
        );
        console.log(
            `     -> ${cookies.length} cookies total, ${chatgptCookies.length} ChatGPT, session: ${hasSession ? "SI" : "NO"}`,
        );
        return chatgptCookies.length > 0 && hasSession;
    } catch (e) {
        console.log(`     -> ERROR: ${e}`);
        return false;
    }
});

check("tsconfig.json existe", async () => {
    return existsSync(join(process.cwd(), "tsconfig.json"));
});

console.log("=== PI-ORACLE HEALTH CHECK ===\n");
let passed = 0,
    failed = 0;
for (const { name, fn } of checks) {
    const ok = await fn();
    console.log(`  [${ok ? "✓" : "✗"}] ${name}`);
    if (ok) passed++;
    else failed++;
}
console.log(`\nResultado: ${passed}/${passed + failed} pasaron`);
if (failed > 0) process.exit(1);

		// Usar .domain en lugar de .host_key (estructura correcta de sweet-cookie)
		const chatgptCookies = cookies.filter(
			(c: any) =>
				c.domain?.includes("chatgpt.com") || c.domain?.includes("openai.com"),
		);
		const hasSession = chatgptCookies.some((c: any) =>
			c.name.includes("session-token"),
		);
		console.log(
			`     -> ${cookies.length} cookies total, ${chatgptCookies.length} ChatGPT, session: ${hasSession ? "SI" : "NO"}`,
		);
		return chatgptCookies.length > 0 && hasSession;
	} catch (e) {
		console.log(`     -> ERROR: ${e}`);
		return false;
	}
});

check("tsconfig.json existe", async () => {
	return existsSync(join(process.cwd(), "tsconfig.json"));
});

console.log("=== PI-ORACLE HEALTH CHECK ===\n");
let passed = 0,
	failed = 0;
for (const { name, fn } of checks) {
	const ok = await fn();
	console.log(`  [${ok ? "✓" : "✗"}] ${name}`);
	if (ok) passed++;
	else failed++;
}
console.log(`\nResultado: ${passed}/${passed + failed} pasaron`);
if (failed > 0) process.exit(1);
