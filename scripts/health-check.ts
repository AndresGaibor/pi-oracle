// scripts/health-check.ts

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const checks: { name: string; fn: () => Promise<boolean> }[] = [];

function check(name: string, fn: () => Promise<boolean>) {
	checks.push({ name, fn });
}

check("Brave Browser instalado", async () => {
	return existsSync(
		"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
	);
});

check("Perfil Brave existe", async () => {
	return existsSync(
		join(
			homedir(),
			"Library/Application Support/BraveSoftware/Brave-Browser/Default/Cookies",
		),
	);
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
		const { cookies } = await getCookies({
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
			chromeProfile: join(
				homedir(),
				"Library/Application Support/BraveSoftware/Brave-Browser/Default",
			),
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
