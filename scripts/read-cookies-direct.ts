/**
 * Read cookies directly from Brave's SQLite database.
 * Then decrypt using OS keychain (macOS Keychain / Linux libsecret / Windows DPAPI).
 *
 * Usage:
 *   bun run scripts/read-cookies-direct.ts
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { detectBrowserDataDir } from "../extensions/oracle/lib/cookie-paths";

const BRAVE_BASE = detectBrowserDataDir("brave");

async function main() {
	console.log("🔍 Reading cookies directly from Brave SQLite database\n");

	// Find profiles with cookies database
	const profiles: string[] = [];
	if (existsSync(BRAVE_BASE)) {
		const entries = readdirSync(BRAVE_BASE);
		for (const e of entries) {
			const cookiePath = join(BRAVE_BASE, e, "Cookies");
			const networkPath = join(BRAVE_BASE, e, "Network", "Cookies");
			if (existsSync(cookiePath) || existsSync(networkPath)) {
				profiles.push(e);
			}
		}
	}

	// Also check Local State for profile names
	const localStatePath = join(BRAVE_BASE, "Local State");
	if (existsSync(localStatePath)) {
		try {
			const localState = JSON.parse(require("fs").readFileSync(localStatePath, "utf8"));
			const infoCache = localState?.profile?.info_cache || {};
			for (const [key, value] of Object.entries(infoCache) as [string, any][]) {
				const name = value?.name || value?.short_name;
				if (name) {
					console.log(`   Profile "${key}" → display name: "${name}"`);
				}
			}
		} catch {}
	}

	console.log(`\n📂 Profiles with cookie DB: ${profiles.join(", ")}`);

	if (profiles.length === 0) {
		console.log("\n⚠️  No profiles with cookie databases found.");
		return;
	}

	// For each profile, try to read cookies with sqlite3
	for (const profile of profiles) {
		console.log(`\n🔑 Profile: "${profile}"`);

		// Try both locations
		const cookiePaths = [
			join(BRAVE_BASE, profile, "Network", "Cookies"),
			join(BRAVE_BASE, profile, "Cookies"),
		];

		const dbPath = cookiePaths.find((p) => existsSync(p));
		if (!dbPath) {
			console.log("   ❌ No cookies database found");
			continue;
		}

		console.log(`   DB: ${dbPath}`);

		// Copy to temp to avoid lock issues
		const tmpDb = `/tmp/brave-cookies-${profile}.db`;
		try {
			execFileSync("cp", [dbPath, tmpDb]);
		} catch {
			console.log("   ❌ Could not copy database");
			continue;
		}

		// Query with sqlite3
		try {
			const result = execFileSync("sqlite3", [
				tmpDb,
				"SELECT name, host_key, path, encrypted_value, expires_utc FROM cookies WHERE host_key LIKE '%chatgpt%' OR host_key LIKE '%openai%' OR host_key LIKE '%chat.openai%' LIMIT 20;",
			], { encoding: "utf8" });

			const lines = result.trim().split("\n").filter(Boolean);
			if (lines.length === 0) {
				console.log("   ⚠️  No ChatGPT/OpenAI cookies found in this profile");
			} else {
				console.log(`   ✅ Found ${lines.length} ChatGPT-related cookies:`);
				for (const line of lines) {
					const parts = line.split("|");
					const name = parts[0] || "";
					const host = parts[1] || "";
					console.log(`     - ${name} @ ${host}`);
				}
			}
		} catch (err) {
		 console.log(`   ❌ sqlite3 error: ${(err as Error).message}`);
			console.log("   💡 Install sqlite3: brew install sqlite");
		}

		// Cleanup
		try { require("fs").unlinkSync(tmpDb); } catch {}
	}
}

main().catch(console.error);
