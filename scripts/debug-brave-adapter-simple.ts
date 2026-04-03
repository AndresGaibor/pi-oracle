// scripts/debug-brave-adapter-simple.ts

import { homedir } from "node:os";
import { join } from "node:path";
import {
	close,
	launchPersistent,
	open,
	screenshot,
	snapshotText,
} from "../adapter/playwright-adapter.ts";

// Usar el perfil de Brave como userDataDir
const BRAVE_PROFILE = join(
	homedir(),
	"Library/Application Support/BraveSoftware/Brave-Browser/Default",
);

async function main() {
	console.log("=== Debug Brave Adapter (Simple) ===");

	// Configurar variables de entorno
	process.env.USE_PLAYWRIGHT = "1";
	process.env.PW_HEADLESS = "0"; // Modo headed para ver qué pasa

	console.log("1. Lanzando Playwright con perfil temporal...");
	const tmpDir = join(
		process.env.TMPDIR || "/tmp",
		"oracle-debug-" + Date.now(),
	);
	await launchPersistent(tmpDir);
	console.log("   Lanzado con perfil:", tmpDir);

	console.log("2. Navegando a ChatGPT...");
	await open("https://chatgpt.com/");

	console.log("3. Esperando carga (5s)...");
	await new Promise((r) => setTimeout(r, 5000));

	console.log("4. Capturando texto de la página...");
	const text = await snapshotText();
	console.log("   Texto (primeros 500 chars):");
	console.log(text?.slice(0, 500));

	console.log("5. Tomando screenshot...");
	await screenshot("/tmp/oracle-debug-simple.png");
	console.log("   Screenshot guardado en /tmp/oracle-debug-simple.png");

	console.log("\n6. Presiona Ctrl+C para cerrar...");
	await new Promise(() => {}); // Wait indefinitely
}

main().catch((e) => {
	console.error("Error:", e);
	process.exit(1);
});
