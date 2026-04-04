/**
 * Find your Brave profiles and show which one has ChatGPT cookies.
 *
 * Usage:
 *   bun run scripts/find-chatgpt-cookies.ts
 */
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getCookies } from "@steipete/sweet-cookie";

const BRAVE_BASE = join(
	homedir(),
	"Library",
	"Application Support",
	"BraveSoftware",
	"Brave-Browser",
);

const CHATGPT_URL = "https://chatgpt.com/";
const CHATGPT_ORIGINS = [
	"https://chatgpt.com",
	"https://chat.openai.com",
	"https://auth.openai.com",
];

async function main() {
	console.log("🔍 Finding ChatGPT cookies in Brave profiles\n");

	// Find available profiles
	const profiles: string[] = [];

	// Check for Local State to find profile names
	const localStatePath = join(BRAVE_BASE, "Local State");
	if (existsSync(localStatePath)) {
		try {
			const localState = JSON.parse(readFileSync(localStatePath, "utf8"));
			const infoCache = localState?.profile?.info_cache || {};
			const profileNames = Object.keys(infoCache);
			console.log(`📂 Profiles found in Local State: ${profileNames.join(", ") || "(none)"}`);
			profiles.push(...profileNames);
		} catch {
			// fallback
		}
	}

	// Also scan the directory
	if (existsSync(BRAVE_BASE)) {
		const entries = readdirSync(BRAVE_BASE);
		const dirProfiles = entries.filter((e) =>
			e.startsWith("Profile") || e === "Default" || e === "Person 1" || e === "Personal",
		);
		for (const p of dirProfiles) {
			if (!profiles.includes(p)) profiles.push(p);
		}
		console.log(`📂 Profiles found by scanning: ${dirProfiles.join(", ") || "(none)"}`);
	}

	if (profiles.length === 0) {
		console.log("\n⚠️  No profiles found. Trying 'Default' anyway...");
		profiles.push("Default");
	}

	console.log("");

	// Try each profile
	for (const profileName of profiles) {
		console.log(`🔑 Trying profile: "${profileName}"`);
		try {
			const result = await getCookies({
				url: CHATGPT_URL,
				origins: CHATGPT_ORIGINS,
				browsers: ["chrome"],
				mode: "merge",
				chromeProfile: profileName,
				timeoutMs: 5000,
			});

			const sessionCookies = result.cookies.filter((c: any) =>
				c.name.includes("session") ||
				c.name === "_account" ||
				c.name.startsWith("__Secure") ||
				c.name.startsWith("oai-"),
			);

			console.log(`   Found ${result.cookies.length} cookies (${sessionCookies.length} session)`);

			if (sessionCookies.length > 0) {
				console.log("   ✅ THIS PROFILE HAS CHATGPT COOKIES!");
				console.log("   Session cookies:");
				sessionCookies.forEach((c: any) => {
					console.log(`     - ${c.name} @ ${c.domain}`);
				});
				console.log("");
				console.log(`👉 Use this profile name in your code: "${profileName}"`);
				console.log("");
			}

			if (result.warnings.length > 0) {
				console.log(`   ⚠️  Warnings: ${result.warnings.slice(0, 2).join("; ")}`);
			}
		} catch (err) {
			console.log(`   ❌ Error: ${(err as Error).message}`);
		}
		console.log("");
	}

	// Also try with full path
	console.log("🔑 Trying with full profile path...");
	try {
		const result = await getCookies({
			url: CHATGPT_URL,
			origins: CHATGPT_ORIGINS,
			browsers: ["chrome"],
			mode: "merge",
			chromeProfile: BRAVE_BASE,
			timeoutMs: 5000,
		});
		console.log(`   Found ${result.cookies.length} cookies with full path`);
	} catch (err) {
		console.log(`   ❌ Error: ${(err as Error).message}`);
	}
}

main().catch(console.error);
