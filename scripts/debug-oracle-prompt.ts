// scripts/debug-oracle-prompt.ts
// Script completo para probar el envío de un prompt a ChatGPT

import { homedir } from "node:os";
import { join } from "node:path";
import { getCookies } from "@steipete/sweet-cookie";
import {
	close,
	cookiesSet,
	evaluate,
	fill,
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
	console.log("=== Debug Oracle Prompt (End-to-End) ===\n");

	// 1. Leer cookies de Brave
	console.log("1. Leyendo cookies de Brave...");
	const { cookies: rawCookies } = await getCookies({
		url: "https://chatgpt.com",
		origins: CHATGPT_COOKIE_ORIGINS,
		browsers: ["chrome"],
		mode: "merge",
		chromeProfile: BRAVE_PROFILE,
	});

	const filtered = filterImportableAuthCookies(
		rawCookies.map(normalizeImportedCookie),
	);
	console.log(`   ${filtered.length} cookies de autenticación`);

	if (filtered.length === 0) {
		console.log(
			"   ❌ Sin cookies - inicia sesión en ChatGPT con Brave primero",
		);
		return;
	}

	// 2. Lanzar Playwright
	console.log("\n2. Lanzando Playwright (headed)...");
	process.env.USE_PLAYWRIGHT = "1";
	process.env.PW_HEADLESS = "0";

	const tmpDir = join(
		process.env.TMPDIR || "/tmp",
		"oracle-prompt-test-" + Date.now(),
	);
	await launchPersistent(tmpDir);

	// 3. Navegar e inyectar cookies
	console.log("\n3. Navegando a ChatGPT...");
	await open("https://chatgpt.com/");
	await new Promise((r) => setTimeout(r, 2000));

	console.log("   Inyectando cookies...");
	await cookiesSet(filtered);

	console.log("   Recargando...");
	await open("https://chatgpt.com/");
	await new Promise((r) => setTimeout(r, 5000));

	// 4. Verificar autenticación
	let text = await snapshotText();
	const isAuth = !["Log in", "Sign up"].some((s) => text?.includes(s));
	console.log(
		`\n4. Estado: ${isAuth ? "✅ Autenticado" : "❌ No autenticado"}`,
	);

	if (!isAuth) {
		console.log("   ⚠️  No autenticado - verifica cookies");
		await screenshot("/tmp/oracle-prompt-not-auth.png");
		console.log("   Screenshot: /tmp/oracle-prompt-not-auth.png");
		return;
	}

	// 5. Buscar textarea del prompt
	console.log("\n5. Buscando textarea para prompt...");
	const textareaSelectors = [
		'textarea[data-id="root"]',
		"#prompt-textarea",
		'textarea[placeholder*="Message"]',
		"textarea",
	];

	let textareaFound = false;
	for (const selector of textareaSelectors) {
		try {
			const exists = await evaluate(`!!document.querySelector('${selector}')`);
			if (exists) {
				console.log(`   ✅ Textarea encontrado: ${selector}`);
				textareaFound = true;

				// 6. Enviar prompt
				console.log("\n6. Enviando prompt de prueba...");
				await fill(selector, 'Di "hola" en una sola palabra');
				await new Promise((r) => setTimeout(r, 1000));

				// Buscar botón de enviar
				const sendScript = `
          const btn = document.querySelector('[data-testid="send-button"]') ||
                      document.querySelector('button[aria-label*="Send"]') ||
                      document.querySelector('button[type="submit"]');
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        `;

				const sent = await evaluate(sendScript);
				console.log(
					`   Botón enviar: ${sent ? "✅ Click" : "❌ No encontrado"}`,
				);

				if (sent) {
					// 7. Esperar respuesta
					console.log("\n7. Esperando respuesta (máx 30s)...");
					for (let i = 0; i < 15; i++) {
						await new Promise((r) => setTimeout(r, 2000));
						text = await snapshotText();

						// Buscar la respuesta "hola"
						if (
							text?.toLowerCase().includes("hola") &&
							!text?.includes('Di "hola"')
						) {
							console.log("   ✅ RESPUESTA RECIBIDA!");
							console.log("\n   Últimos 500 chars:");
							console.log("   " + text?.slice(-500).replace(/\n/g, "\n   "));
							break;
						}

						process.stdout.write(`   Esperando... ${(i + 1) * 2}s\r`);
					}
				}

				break;
			}
		} catch (e) {
			// Probar siguiente selector
		}
	}

	if (!textareaFound) {
		console.log("   ❌ Textarea no encontrado");
	}

	// 8. Screenshot final
	await screenshot("/tmp/oracle-prompt-final.png");
	console.log("\n📸 Screenshot final: /tmp/oracle-prompt-final.png");

	console.log("\n✅ Test completado. Presiona Ctrl+C para cerrar...");
	await new Promise(() => {});
}

main().catch((e) => {
	console.error("Error:", e);
	process.exit(1);
});
