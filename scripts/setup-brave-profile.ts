// scripts/setup-brave-profile.ts - Create dedicated Brave profile for Oracle
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveBrowserPath } from "../extensions/oracle/lib/browser-detection";

const PROFILE_DIR = join(
	homedir(),
	".local", "share", "oracle-brave-profile",
);

async function main() {
	console.log("=== Setup Brave Profile for Oracle ===\n");

	// 1. Create profile directory
	console.log("[1] Creating profile directory...");
	await mkdir(PROFILE_DIR, { recursive: true });
	console.log(`    Created: ${PROFILE_DIR}`);

	// 2. Profile ready
	console.log("\n[2] Profile directory ready.");
	console.log("    Next steps:");
	console.log(`
  # 3. Launch Brave with the new profile
  brave --user-data-dir="${PROFILE_DIR}"

  # 4. Login to chatgpt.com manually ONCE

  # 5. Close Brave completely

  # 6. Verify cookies exist:
  bun run scripts/verify-brave-profile.ts
  `);

	// 3. Detect browser for config
	const detected = resolveBrowserPath();

	const config = {
		browser: {
			executablePath: detected.executablePath,
			authSeedProfileDir: PROFILE_DIR,
			runtimeProfilesDir: join(homedir(), ".local", "share", "oracle-runtime-profiles"),
		},
		auth: {
			chromeProfile: "Default",
		},
	};

	console.log("\n[3] Config ready at ~/.pi/agent/extensions/oracle.json:");
	console.log(JSON.stringify(config, null, 2));
}

main().catch(console.error);
