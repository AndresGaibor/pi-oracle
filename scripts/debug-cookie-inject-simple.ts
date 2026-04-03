// scripts/debug-cookie-inject-simple.ts
// Este script prueba inyectar cookies de Brave en un contexto limpio de Playwright
// Usa el PERFIL REAL de Brave que ya tiene la sesión iniciada

import { homedir } from "node:os";
import { join } from "node:path";
import { getCookies } from "@steipete/sweet-cookie";
import {
	close,
	cookiesSet,
	launchPersistent,
	open,
	screenshot,
	snapshotText,
} from "../adapter/playwright-adapter.ts";
import {
	filterImportableAuthCookies,
	normalizeImportedCookie,
} from "../extensions/oracle/worker/auth-cookie-policy.ts";

const BRAVE_PROFILE = join(
	homedir(),
	"Library/Application Support/BraveSoftware/Brave-Browser/Default",
);

const BRAVE_EXE =
	"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";

async function main() {
	console.log("=== Debug Cookie Injection (Con Perfil Real de Brave) ===\n");

	// 1. Leer cookies de Brave
	console.log("1. Leyendo cookies de Brave...");

	const { cookies: rawCookies } = await getCookies({
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

	console.log(`   Total raw cookies: ${rawCookies.length}`);

	// 2. Normalizar y filtrar
	console.log("\n2. Normalizando y filtrando cookies...");

	const normalized = rawCookies
		.map((c: any) => normalizeImportedCookie(c, "chatgpt.com"))
		.filter((c: any) => c !== undefined);

	const result = filterImportableAuthCookies(normalized, "https://chatgpt.com");
	const filtered = result.cookies;

	console.log(`   Cookies filtradas para auth: ${filtered.length}`);

	if (filtered.length === 0) {
		console.log("   ❌ No hay cookies de autenticación");
		return;
	}

	console.log("\n   Cookies a inyectar:");
	filtered.slice(0, 10).forEach((c: any) => console.log(`   - ${c.name}`));
	if (filtered.length > 10) {
		console.log(`   ... y ${filtered.length - 10} más`);
	}

	// 3. Lanzar Playwright con el PERFIL REAL de Brave (con sesión activa)
	console.log("\n3. Lanzando Playwright con perfil real de Brave...");
	process.env.USE_PLAYWRIGHT = "1";
	process.env.PW_HEADLESS = "0"; // headed para ver qué pasa

	// Usar el perfil real de Brave - esto evita tener que inyectar cookies
	// porque Brave ya tiene la sesión iniciada
	await launchPersistent(BRAVE_PROFILE, BRAVE_EXE);
	console.log("   Perfil:", BRAVE_PROFILE);

	// 4. Navegar a ChatGPT
	console.log("\n4. Navegando a chatgpt.com...");
	const pageToken = await open("https://chatgpt.com/");
	console.log("   Page token:", pageToken);
	await new Promise((r) => setTimeout(r, 3000));

	// 5. Verificar autenticación
	console.log("\n5. Verificando autenticación...");
	const text = await snapshotText(pageToken);

	const loginIndicators = ["Log in", "Sign up", "Inicia sesión", "Registrarse"];
	const isAuthenticated = !loginIndicators.some((indicator) =>
		text?.toLowerCase().includes(indicator.toLowerCase()),
	);

	console.log(
		`   Estado: ${isAuthenticated ? "✅ AUTENTICADO" : "❌ NO AUTENTICADO"}`,
	);
	console.log("\n   Texto visible (primeros 400 chars):");
	console.log("   " + text?.slice(0, 400).replace(/\n/g, "\n   "));

	// 6. Screenshot
	await screenshot("/tmp/oracle-cookie-inject-test.png");
	console.log("\n📸 Screenshot guardado: /tmp/oracle-cookie-inject-test.png");

	console.log("\n✅ Test completado. Presiona Ctrl+C para cerrar...");
	await new Promise(() => {}); // Wait indefinitely
}

main().catch((e) => {
	console.error("Error:", e);
	process.exit(1);
});
