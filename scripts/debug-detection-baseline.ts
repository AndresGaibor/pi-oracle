// scripts/debug-detection-baseline.ts
// Verifica qué señales de automatización están expuestas

import { join } from "node:path";
import {
	close,
	evaluate,
	launchPersistent,
	open,
	screenshot,
} from "../adapter/playwright-adapter.ts";

async function main() {
	console.log("=== Detección de Automatización (Baseline) ===\n");

	process.env.USE_PLAYWRIGHT = "1";
	process.env.PW_HEADLESS = "0";

	const tmpDir = join(
		process.env.TMPDIR || "/tmp",
		"detection-test-" + Date.now(),
	);
	await launchPersistent(tmpDir);

	console.log("Navegando a about:blank...\n");
	await open("about:blank");
	await new Promise((r) => setTimeout(r, 1000));

	// Probar detecciones comunes
	console.log("🔍 Verificando señales de automatización:\n");

	const tests = [
		{
			name: "navigator.webdriver",
			script: "navigator.webdriver",
			expected: "undefined o false",
		},
		{
			name: "User-Agent",
			script: "navigator.userAgent",
			expected: "Chrome normal",
		},
		{
			name: "Plugins",
			script: "navigator.plugins.length",
			expected: "> 0",
		},
		{
			name: "Languages",
			script: "navigator.languages",
			expected: "array con idiomas",
		},
		{
			name: "Platform",
			script: "navigator.platform",
			expected: "MacIntel",
		},
		{
			name: "Window.chrome",
			script: "!!window.chrome",
			expected: "true",
		},
		{
			name: "Permissions",
			script: "typeof navigator.permissions",
			expected: "object",
		},
		{
			name: "WebGL Vendor",
			script: `(() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl');
        if (!gl) return 'N/A';
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (!ext) return 'N/A';
        return gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
      })()`,
			expected: "Apple/Google",
		},
	];

	for (const test of tests) {
		try {
			const result = await evaluate(test.script);
			const resultStr =
				typeof result === "object"
					? JSON.stringify(result).slice(0, 80)
					: String(result).slice(0, 80);

			console.log(`  ${test.name}:`);
			console.log(`    Valor: ${resultStr}`);
			console.log(`    Esperado: ${test.expected}\n`);
		} catch (e: any) {
			console.log(`  ${test.name}: ERROR - ${e.message}\n`);
		}
	}

	// Test de detección avanzada
	console.log("🔍 Tests avanzados:\n");

	const advancedTests = [
		{
			name: "Variables CDC (Chrome DevTools)",
			script:
				'Object.keys(window).filter(k => k.includes("cdc_") || k.includes("__webdriver"))',
		},
		{
			name: "Iframe present",
			script: 'document.querySelectorAll("iframe").length',
		},
	];

	for (const test of advancedTests) {
		try {
			const result = await evaluate(test.script);
			console.log(`  ${test.name}: ${JSON.stringify(result)}\n`);
		} catch (e: any) {
			console.log(`  ${test.name}: ERROR - ${e.message}\n`);
		}
	}

	await screenshot("/tmp/oracle-detection-baseline.png");
	console.log("📸 Screenshot: /tmp/oracle-detection-baseline.png\n");

	console.log("✅ Baseline completado. Presiona Ctrl+C para cerrar...");
	await new Promise(() => {});
}

main().catch((e) => {
	console.error("Error:", e);
	process.exit(1);
});
