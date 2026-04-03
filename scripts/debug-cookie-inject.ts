// scripts/debug-cookie-inject.ts

import { homedir } from "node:os";
import { join } from "node:path";
import { readChromeCookies } from "@steipete/sweet-cookie";
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

const BRAVE_PATH =
	process.env.BRAVE_PATH ||
	"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";

async function main() {
	console.log("=== Depuracion de inyeccion de cookies ===");

	// 1. Leer cookies de Brave
	console.log("1. Leyendo cookies de Brave...");
	const rawCookies = await readChromeCookies(
		join(
			homedir(),
			"Library/Application Support/BraveSoftware/Brave-Browser/Default/Cookies",
		),
	);
	console.log(`   Total raw cookies: ${rawCookies.length}`);

	// 2. Normalizar y filtrar
	console.log("2. Normalizando cookies...");
	const normalized = rawCookies.map(normalizeImportedCookie);
	const filtered = filterImportableAuthCookies(normalized);
	console.log(`   Cookies filtradas: ${filtered.length}`);
	filtered.forEach((c) => console.log(`   - ${c.name} (${c.domain})`));

	// 3. Lanzar contexto aislado
	console.log("3. Lanzando Playwright...");
	const tmpDir = join(process.env.TMPDIR || "/tmp", "oracle-cookie-test");
	await launchPersistent({
		userDataDir: tmpDir,
		executablePath: BRAVE_PATH,
		headless: false,
	});

	// 4. Navegar primero al dominio para establecer contexto
	console.log("4. Navegando a chatgpt.com...");
	await open("https://chatgpt.com/");
	await new Promise((r) => setTimeout(r, 2000));

	// 5. Inyectar cookies
	console.log("5. Inyectando cookies...");
	await cookiesSet(filtered);

	// 6. Recargar
	console.log("6. Recargando...");
	await open("https://chatgpt.com/");
	await new Promise((r) => setTimeout(r, 5000));

	// 7. Verificar
	const text = await snapshotText();
	const isAuthenticated =
		!text?.includes("Log in") &&
		!text?.includes("Sign up") &&
		!text?.includes("Inicia sesion");
	console.log("7. Autenticado:", isAuthenticated ? "SI" : "NO");
	console.log("   Texto visible:", text?.slice(0, 300));

	await screenshot("/tmp/oracle-cookie-test.png");
	console.log("Screenshot: /tmp/oracle-cookie-test.png");

	console.log("Presiona Enter para cerrar...");
	await new Promise((r) => process.stdin.once("data", r));
	await close();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
