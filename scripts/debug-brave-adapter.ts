// scripts/debug-brave-adapter.ts
import {
	close,
	launchPersistent,
	open,
	screenshot,
	snapshotText,
} from "../adapter/playwright-adapter.ts";

const BRAVE_PATH =
	process.env.BRAVE_PATH ||
	"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";

async function main() {
	console.log("=== Debug Brave Adapter ===");

	console.log("1. Lanzando Brave...");
	const result = await launchPersistent({
		userDataDir:
			process.env.HOME +
			"/Library/Application Support/BraveSoftware/Brave-Browser",
		executablePath: BRAVE_PATH,
		headless: false,
		args: ["--disable-blink-features=AutomationControlled"],
	});
	console.log("Lanzado:", result);

	console.log("2. Navegando a ChatGPT...");
	await open("https://chatgpt.com/");

	console.log("3. Esperando carga...");
	await new Promise((r) => setTimeout(r, 5000));

	console.log("4. Snapshot del texto:");
	const text = await snapshotText();
	console.log(text?.slice(0, 500));

	console.log("5. Tomando screenshot...");
	await screenshot("/tmp/oracle-debug.png");
	console.log("Screenshot guardado en /tmp/oracle-debug.png");

	console.log("6. Listo. Presiona Enter para cerrar...");
	await new Promise((r) => process.stdin.once("data", r));

	await close();
	console.log("Fin.");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
