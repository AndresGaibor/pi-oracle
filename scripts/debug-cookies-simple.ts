// scripts/debug-cookies-simple.ts
// Este script verifica que podemos leer cookies de Brave usando sweet-cookie

import { homedir } from "node:os";
import { join } from "node:path";
import { getCookies } from "@steipete/sweet-cookie";

const BRAVE_PROFILE = join(
	homedir(),
	"Library/Application Support/BraveSoftware/Brave-Browser/Default",
);

const CHATGPT_COOKIE_ORIGINS = [
	"https://chatgpt.com",
	"https://chat.openai.com",
	"https://atlas.openai.com",
	"https://auth.openai.com",
	"https://sentinel.openai.com",
	"https://ws.chatgpt.com",
];

console.log("=== Verificando Cookies de Brave ===\n");
console.log("Perfil Brave:", BRAVE_PROFILE);
console.log(
	"\n⚠️  IMPORTANTE: Cierra Brave completamente antes de continuar.\n",
);

try {
	const { cookies, warnings } = await getCookies({
		url: "https://chatgpt.com",
		origins: CHATGPT_COOKIE_ORIGINS,
		browsers: ["chrome"], // sweet-cookie trata a Brave como Chrome
		mode: "merge",
		chromeProfile: BRAVE_PROFILE,
	});

	console.log(`Total cookies: ${cookies.length}`);

	const chatgptCookies = cookies.filter(
		(c: any) =>
			c.host_key?.includes("chatgpt.com") || c.host_key?.includes("openai.com"),
	);

	console.log(`Cookies de ChatGPT/OpenAI: ${chatgptCookies.length}`);
	console.log("\nNombres de cookies ChatGPT:");
	chatgptCookies.forEach((c: any) => {
		console.log(`  - ${c.name} (dominio: ${c.host_key})`);
	});

	const sessionCookie = chatgptCookies.find(
		(c: any) => c.name === "__Secure-next-auth.session-token",
	);

	console.log("\n🔑 Session token:");
	if (sessionCookie) {
		console.log("   ✅ ENCONTRADO");
		const expires = new Date((sessionCookie.expires_utc || 0) * 1000);
		console.log("   Expira:", expires.toISOString());
		const now = new Date();
		if (expires < now) {
			console.log("   ⚠️  WARNING: Cookie expirado!");
		} else {
			console.log("   ✅ Cookie válido");
		}
	} else {
		console.log("   ❌ NO ENCONTRADO");
		console.log("   → Asegúrate de haber iniciado sesión en ChatGPT en Brave");
	}

	if (warnings.length > 0) {
		console.log("\n⚠️  Warnings de sweet-cookie:");
		warnings.forEach((w) => console.log(`   - ${w}`));
	}
} catch (e: any) {
	console.error("\n❌ Error leyendo cookies:", e.message);
	console.log("\n💡 Soluciones:");
	console.log("   1. Cierra Brave completamente (Cmd+Q)");
	console.log("   2. Verifica que el perfil existe");
	console.log("   3. Intenta de nuevo");
}
