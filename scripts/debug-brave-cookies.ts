// scripts/debug-brave-cookies.ts

import { homedir } from "node:os";
import { join } from "node:path";
import { readChromeCookies } from "@steipete/sweet-cookie";

const braveProfile = process.env.BRAVE_PROFILE || "Default";
const cookieDb = join(
	homedir(),
	"Library",
	"Application Support",
	"BraveSoftware",
	"Brave-Browser",
	braveProfile,
	"Cookies",
);

console.log("Perfil Brave:", braveProfile);
console.log("DB Cookies:", cookieDb);

try {
	const cookies = await readChromeCookies(cookieDb);
	console.log(`Total cookies: ${cookies.length}`);

	const chatgptCookies = cookies.filter(
		(c: any) =>
			c.host_key?.includes("chatgpt.com") || c.host_key?.includes("openai.com"),
	);
	console.log(`Cookies ChatGPT/OpenAI: ${chatgptCookies.length}`);
	console.log(
		"Nombres:",
		chatgptCookies.map((c: any) => c.name),
	);

	const sessionCookie = chatgptCookies.find(
		(c: any) => c.name === "__Secure-next-auth.session-token",
	);
	if (sessionCookie) {
		console.log("Session token ENCONTRADO");
		console.log(
			"Expira:",
			new Date(sessionCookie.expires_utc * 1000).toISOString(),
		);
	} else {
		console.log("WARNING: No se encontro session token.");
		console.log("Asegurate de haber iniciado sesion en ChatGPT en Brave.");
	}
} catch (e) {
	console.error("Error leyendo cookies:", e);
	console.log("Solucion: Cierra Brave completamente y reintenta.");
}
