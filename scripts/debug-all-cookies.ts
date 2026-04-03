// Muestra TODAS las cookies con sus dominios

import { homedir } from "node:os";
import { join } from "node:path";
import { getCookies } from "@steipete/sweet-cookie";

const profiles = ["Default", "Profile 1", "Profile 2"];

for (const profile of profiles) {
	const BRAVE_PROFILE = join(
		homedir(),
		"Library/Application Support/BraveSoftware/Brave-Browser",
		profile,
	);

	console.log(`\n${"=".repeat(60)}`);
	console.log(`Perfil: ${profile}`);
	console.log(`${"=".repeat(60)}`);

	try {
		const { cookies } = await getCookies({
			url: "https://chatgpt.com",
			origins: [
				"https://chatgpt.com",
				"https://chat.openai.com",
				"https://openai.com",
			],
			browsers: ["chrome"],
			mode: "merge",
			chromeProfile: BRAVE_PROFILE,
		});

		console.log(`Total cookies: ${cookies.length}\n`);

		// Agrupar por dominio
		const byDomain: Record<string, any[]> = {};
		cookies.forEach((c: any) => {
			const domain = c.host_key || c.domain || "unknown";
			if (!byDomain[domain]) byDomain[domain] = [];
			byDomain[domain].push(c);
		});

		// Mostrar dominios
		console.log("Dominios encontrados:");
		Object.entries(byDomain).forEach(([domain, domainCookies]) => {
			console.log(`  ${domain} (${domainCookies.length} cookies)`);

			// Si es relacionado con ChatGPT/OpenAI, mostrar nombres
			if (domain.includes("chatgpt") || domain.includes("openai")) {
				domainCookies.forEach((c: any) => {
					console.log(`    - ${c.name}`);
				});
			}
		});

		// Buscar específicamente session token
		const sessionToken = cookies.find(
			(c: any) => c.name === "__Secure-next-auth.session-token",
		);

		if (sessionToken) {
			console.log("\n✅ SESSION TOKEN ENCONTRADO!");
			console.log(
				`   Dominio: ${sessionToken.host_key || sessionToken.domain}`,
			);
			console.log(
				`   Expira: ${new Date((sessionToken.expires_utc || 0) * 1000).toISOString()}`,
			);
		}
	} catch (e: any) {
		console.log(`❌ Error: ${e.message}`);
	}
}

console.log(`\n${"=".repeat(60)}\n`);
