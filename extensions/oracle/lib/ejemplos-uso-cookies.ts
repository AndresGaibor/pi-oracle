/**
 * Ejemplo: Cómo usar lib/cookies.ts en tus workers
 * 
 * Este archivo demuestra las mejores prácticas para integrar
 * sweet-cookie en cualquier worker de la extensión oracle.
 */

// ---------------------------------------------------------------------------
// Ejemplo 1: Worker que necesita autenticación de ChatGPT
// ---------------------------------------------------------------------------

import { readChatGPTCookies } from "../lib/cookies";
import * as browser from "../lib/browser";
import { homedir } from "node:os";
import { join } from "node:path";

const BRAVE_PROFILE = join(
	homedir(),
	"Library/Application Support/BraveSoftware/Brave-Browser/Default"
);

async function miWorkerConAuth() {
	console.log("🍪 Reading ChatGPT cookies from Brave...");

	// Leer cookies usando sweet-cookie (sin CDP)
	const cookieResult = await readChatGPTCookies({
		profilePath: BRAVE_PROFILE,
		chatUrl: "https://chatgpt.com/",
	});

	// Validar que tenemos session token
	if (!cookieResult.hasSessionToken) {
		throw new Error(
			"No session token found. Please login to ChatGPT in Brave first."
		);
	}

	console.log(`✅ Found ${cookieResult.cookies.length} auth cookies`);

	// Si hay advertencias, logearlas
	if (cookieResult.warnings.length > 0) {
		console.warn("⚠️  Warnings:", cookieResult.warnings);
	}

	// Lanzar browser e inyectar cookies
	await browser.launch({
		headless: true,
		args: ["--disable-blink-features=AutomationControlled"],
	});

	// Inyectar ANTES de navegar
	await browser.cookiesSet(cookieResult.cookies);

	// Ahora navegar
	await browser.open("https://chatgpt.com/");

	console.log("✅ Browser autenticado y listo!");
}

// ---------------------------------------------------------------------------
// Ejemplo 2: Worker que lee cookies de múltiples sitios
// ---------------------------------------------------------------------------

import { readCookiesFromBrowser, filterImportableAuthCookies } from "../lib/cookies";

async function miWorkerMultiSitio() {
	// Leer cookies de ejemplo.com
	const { cookies, warnings } = await readCookiesFromBrowser({
		url: "https://ejemplo.com/",
		profilePath: BRAVE_PROFILE,
		browsers: ["chrome"], // En macOS también lee de Brave
		timeoutMs: 5000,
	});

	console.log(`Read ${cookies.length} total cookies`);

	// Filtrar solo cookies de autenticación
	const filtered = filterImportableAuthCookies(
		cookies,
		"https://ejemplo.com/"
	);

	console.log(`Auth cookies: ${filtered.cookies.length}`);
	console.log(`Dropped: ${filtered.dropped.length}`);

	// Ver qué se descartó
	filtered.dropped.forEach(({ cookie, reason }) => {
		console.log(`  🗑️  ${cookie.name} (${reason})`);
	});

	return filtered.cookies;
}

// ---------------------------------------------------------------------------
// Ejemplo 3: Worker con manejo de errores robusto
// ---------------------------------------------------------------------------

import type { Cookie } from "../lib/cookies";

async function miWorkerConErrorHandling() {
	let cookies: Cookie[] = [];

	try {
		const result = await readChatGPTCookies({
			profilePath: BRAVE_PROFILE,
		});

		if (!result.hasSessionToken) {
			console.error("❌ No session token found");
			console.error("Please login to ChatGPT in Brave first");
			process.exit(1);
		}

		cookies = result.cookies;
		console.log(`✅ Loaded ${cookies.length} cookies`);
	} catch (error) {
		if (error instanceof Error) {
			if (error.message.includes("ENOENT")) {
				console.error("❌ Brave profile not found");
				console.error(`   Path: ${BRAVE_PROFILE}`);
			} else if (error.message.includes("EACCES")) {
				console.error("❌ Permission denied reading cookies");
				console.error("   May need macOS Keychain access");
			} else {
				console.error(`❌ Error: ${error.message}`);
			}
		}
		process.exit(1);
	}

	return cookies;
}

// ---------------------------------------------------------------------------
// Ejemplo 4: Worker que monitorea cambios en cookies
// ---------------------------------------------------------------------------

async function miWorkerMonitor() {
	console.log("👁️  Monitoring cookies...");

	let previousCount = 0;

	setInterval(async () => {
		try {
			const result = await readChatGPTCookies({
				profilePath: BRAVE_PROFILE,
			});

			if (result.cookies.length !== previousCount) {
				console.log(
					`🔄 Cookie count changed: ${previousCount} → ${result.cookies.length}`
				);
				previousCount = result.cookies.length;
			}

			if (!result.hasSessionToken) {
				console.warn("⚠️  Session token lost!");
			}
		} catch (error) {
			console.error("Error reading cookies:", error);
		}
	}, 5000);
}

// ---------------------------------------------------------------------------
// Ejemplo 5: Worker con configuración desde archivo
// ---------------------------------------------------------------------------

interface WorkerConfig {
	profilePath?: string;
	chatUrl?: string;
	browsers?: string[];
}

async function miWorkerConConfig(config: WorkerConfig) {
	const profilePath =
		config.profilePath ||
		join(
			homedir(),
			"Library/Application Support/BraveSoftware/Brave-Browser/Default"
		);

	const chatUrl = config.chatUrl || "https://chatgpt.com/";

	console.log(`Using profile: ${profilePath}`);

	const result = await readChatGPTCookies({
		profilePath,
		chatUrl,
	});

	if (!result.hasSessionToken) {
		throw new Error(
			`No session token in ${profilePath}. Please login to ${chatUrl} first.`
		);
	}

	return result.cookies;
}

// ---------------------------------------------------------------------------
// Ejemplo 6: Worker que sintetiza cookies faltantes
// ---------------------------------------------------------------------------

import { ensureAccountCookie } from "../lib/cookies";

async function miWorkerConSintesis() {
	const result = await readChatGPTCookies({
		profilePath: BRAVE_PROFILE,
	});

	let cookies = result.cookies;

	// Verificar si falta _account
	if (!result.hasAccount) {
		console.log("⚠️  _account cookie missing, synthesizing...");

		const ensured = ensureAccountCookie(
			cookies,
			"https://chatgpt.com/"
		);

		cookies = ensured.cookies;

		if (ensured.synthesized) {
			console.log(`✅ Synthesized _account=${ensured.value}`);
		}
	}

	return cookies;
}

// ---------------------------------------------------------------------------
// Ejemplo 7: Worker con logging detallado
// ---------------------------------------------------------------------------

async function miWorkerConLogging() {
	console.log("📊 Cookie Analysis\n");

	const result = await readChatGPTCookies({
		profilePath: BRAVE_PROFILE,
	});

	console.log("Summary:");
	console.log(`  Total cookies: ${result.cookies.length}`);
	console.log(`  Session token: ${result.hasSessionToken ? "✅" : "❌"}`);
	console.log(`  Account cookie: ${result.hasAccount ? "✅" : "❌"}`);
	console.log(`  Dropped: ${result.dropped.length}\n`);

	console.log("Cookies by domain:");
	const byDomain = new Map<string, number>();
	result.cookies.forEach((c) => {
		byDomain.set(c.domain, (byDomain.get(c.domain) || 0) + 1);
	});
	byDomain.forEach((count, domain) => {
		console.log(`  ${domain}: ${count} cookies`);
	});

	console.log("\nDropped cookies:");
	const dropReasons = new Map<string, number>();
	result.dropped.forEach(({ reason }) => {
		dropReasons.set(reason, (dropReasons.get(reason) || 0) + 1);
	});
	dropReasons.forEach((count, reason) => {
		console.log(`  ${reason}: ${count} cookies`);
	});

	return result;
}

// ---------------------------------------------------------------------------
// Exportar ejemplos
// ---------------------------------------------------------------------------

export {
	miWorkerConAuth,
	miWorkerMultiSitio,
	miWorkerConErrorHandling,
	miWorkerMonitor,
	miWorkerConConfig,
	miWorkerConSintesis,
	miWorkerConLogging,
};

/**
 * Para usar estos ejemplos en tu worker:
 * 
 * 1. Importa la función que necesites:
 *    import { miWorkerConAuth } from "./ejemplos-uso-cookies";
 * 
 * 2. O copia el patrón que necesites y adapta a tu caso
 * 
 * 3. Recuerda: SIEMPRE importa desde lib/cookies.ts, NO dupliques código
 * 
 * 4. Los scripts en scripts/ son SOLO para debugging, no para lógica de negocio
 */
