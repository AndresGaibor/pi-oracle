// scripts/debug-cookies-simple.ts
// Este script verifica que podemos leer cookies de Brave usando sweet-cookie

import { homedir } from "node:os";
import { join } from "node:path";
import { getCookies } from "@steipete/sweet-cookie";

const BRAVE_PROFILE = join(
	homedir(),
	"Library/Application Support/BraveSoftware/Brave-Browser/Default",
);

console.log("=== Verificando Cookies de Brave ===\n");
console.log("Perfil Brave:", BRAVE_PROFILE);
console.log(
	"\n⚠️  IMPORTANTE: Cierra Brave completamente antes de continuar.\n",
);

try {
	const { cookies, warnings } = await getCookies({
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
		chromeProfile: BRAVE_PROFILE,
	});

	console.log(`Total cookies: ${cookies.length}\n`);

	// Filtrar cookies de ChatGPT/OpenAI (usar .domain no .host_key)
	const chatgptCookies = cookies.filter((c: any) => {
		const domain = c.domain || c.host_key || "";
		return domain.includes("chatgpt.com") || domain.includes("openai.com");
	});

	console.log(`Cookies de ChatGPT/OpenAI: ${chatgptCookies.length}`);

	// Buscar TODOS los session tokens (ahora son .0 y .1)
	const sessionCookies = chatgptCookies.filter((c: any) =>
		c.name.startsWith("__Secure-next-auth.session-token"),
	);

	console.log("\n🔑 Session tokens encontrados:");
	if (sessionCookies.length > 0) {
		sessionCookies.forEach((sc: any) => {
			console.log(`\n  Nombre: ${sc.name}`);
			console.log(`  Dominio: ${sc.domain}`);
			console.log(`  Value (primeros 50 chars): ${sc.value?.slice(0, 50)}...`);

			// El campo 'expires' es Unix timestamp (segundos), no microsegundos
			const expiresUnix = sc.expires;
			if (expiresUnix) {
				const expiresDate = new Date(expiresUnix * 1000);
				console.log(`  Expira (Unix): ${expiresUnix}`);
				console.log(`  Expira (fecha): ${expiresDate.toISOString()}`);

				const now = Date.now() / 1000;
				if (expiresUnix < now) {
					console.log(`  ⚠️  EXPIRADO!`);
				} else {
					const daysLeft = Math.floor((expiresUnix - now) / 86400);
					console.log(`  ✅ Válido (${daysLeft} días restantes)`);
				}
			} else {
				console.log(`  ⚠️  Sin fecha de expiración (sesión de navegador?)`);
			}
		});
	} else {
		console.log("   ❌ NO ENCONTRADO");
		console.log("   → Asegúrate de haber iniciado sesión en ChatGPT en Brave");
	}

	// Verificar otras cookies importantes
	console.log("\n📋 Otras cookies importantes:");
	const importantCookies = [
		"oai-did",
		"oai-sc",
		"cf_clearance",
		"oai-client-auth-info",
		"_puid",
	];
	importantCookies.forEach((name) => {
		const found = chatgptCookies.find((c: any) => c.name === name);
		if (found) {
			console.log(`  ✅ ${name}: ${found.domain}`);
		} else {
			console.log(`  ❌ ${name}: NO ENCONTRADA`);
		}
	});

	if (warnings.length > 0) {
		console.log("\n⚠️  Warnings de sweet-cookie:");
		warnings.forEach((w: string) => console.log(`   - ${w}`));
	}
} catch (e: any) {
	console.error("\n❌ Error leyendo cookies:", e.message);
	console.log("\n💡 Soluciones:");
	console.log("   1. Cierra Brave completamente (Cmd+Q)");
	console.log("   2. Verifica que el perfil existe");
	console.log("   3. Intenta de nuevo");
}
