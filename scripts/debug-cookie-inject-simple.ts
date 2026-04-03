// scripts/debug-cookie-inject-simple.ts
// Este script prueba inyectar cookies de Brave en un contexto limpio de Playwright

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

const CHATGPT_COOKIE_ORIGINS = [
	"https://chatgpt.com",
	"https://chat.openai.com",
	"https://atlas.openai.com",
	"https://auth.openai.com",
	"https://sentinel.openai.com",
	"https://ws.chatgpt.com",
];

async function main() {
	console.log("=== Debug Cookie Injection ===\n");

	// 1. Leer cookies de Brave
	console.log("1. Leyendo cookies de Brave...");
	console.log("   (Asegúrate de haber cerrado Brave completamente)");

	const { cookies: rawCookies } = await getCookies({
		url: "https://chatgpt.com",
		origins: CHATGPT_COOKIE_ORIGINS,
		browsers: ["chrome"],
		mode: "merge",
		chromeProfile: BRAVE_PROFILE,
	});

	console.log(`   Total raw cookies: ${rawCookies.length}`);

	// 2. Normalizar y filtrar
	console.log("\n2. Normalizando y filtrando cookies...");
	const normalized = rawCookies.map(normalizeImportedCookie);
	const filtered = filterImportableAuthCookies(normalized);
	console.log(`   Cookies filtradas para auth: ${filtered.length}`);

	if (filtered.length === 0) {
		console.log("   ❌ No hay cookies de autenticación para inyectar");
		console.log("   → Inicia sesión en ChatGPT con Brave primero");
		return;
	}

	filtered.forEach((c) => console.log(`   - ${c.name} (${c.domain})`));

	// 3. Lanzar Playwright con perfil temporal
	console.log("\n3. Lanzando Playwright (headed mode)...");
	process.env.USE_PLAYWRIGHT = "1";
	process.env.PW_HEADLESS = "0";

	const tmpDir = join(
		process.env.TMPDIR || "/tmp",
		"oracle-cookie-test-" + Date.now(),
	);
	await launchPersistent(tmpDir);
	console.log("   Perfil temporal:", tmpDir);

	// 4. Navegar a ChatGPT (para establecer el dominio)
	console.log("\n4. Navegando a chatgpt.com...");
	await open("https://chatgpt.com/");
	await new Promise((r) => setTimeout(r, 2000));

	// 5. Inyectar cookies
	console.log("\n5. Inyectando cookies...");
	await cookiesSet(filtered);
	console.log("   ✅ Cookies inyectadas");

	// 6. Recargar la página
	console.log("\n6. Recargando página...");
	await open("https://chatgpt.com/");
	await new Promise((r) => setTimeout(r, 5000));

	// 7. Verificar autenticación
	console.log("\n7. Verificando autenticación...");
	const text = await snapshotText();

	const loginIndicators = ["Log in", "Sign up", "Inicia sesión", "Registrarse"];
	const isAuthenticated = !loginIndicators.some((indicator) =>
		text?.toLowerCase().includes(indicator.toLowerCase()),
	);

	console.log(
		`   Estado: ${isAuthenticated ? "✅ AUTENTICADO" : "❌ NO AUTENTICADO"}`,
	);
	console.log("\n   Texto visible (primeros 300 chars):");
	console.log("   " + text?.slice(0, 300).replace(/\n/g, "\n   "));

	// 8. Screenshot
	await screenshot("/tmp/oracle-cookie-inject-test.png");
	console.log("\n📸 Screenshot guardado: /tmp/oracle-cookie-inject-test.png");

	console.log("\n✅ Test completado. Presiona Ctrl+C para cerrar...");
	await new Promise(() => {}); // Wait indefinitely
}

main().catch((e) => {
	console.error("Error:", e);
	process.exit(1);
});
