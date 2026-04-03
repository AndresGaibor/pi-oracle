// scripts/verify-bun.ts
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("Root dir:", root);
console.log("Platform:", process.platform);
console.log("Arch:", process.arch);
console.log("Bun version:", process.versions.bun || "N/A");

try {
	const { chromium } = await import("playwright");
	console.log("Playwright OK: chromium disponible");
} catch (e) {
	console.error("Playwright FAIL:", e);
}

try {
	const { readChromeCookies } = await import("@steipete/sweet-cookie");
	console.log("sweet-cookie OK");
} catch (e) {
	console.error("sweet-cookie FAIL:", e);
}

console.log("Verificacion completa.");
