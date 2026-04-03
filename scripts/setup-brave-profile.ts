// scripts/setup-brave-profile.ts - Create dedicated Brave profile for Oracle
import { mkdir, writeFile } from "node:fs/promises";
import { homedir, join } from "node:path";

const PROFILE_DIR = join(
	homedir(),
	"Library/Application Support/BraveSoftware/Brave-Browser/Profile Oracle",
);

async function main() {
	console.log("=== Setup Brave Profile for Oracle ===\n");

	// 1. Create profile directory
	console.log("[1] Creating profile directory...");
	await mkdir(PROFILE_DIR, { recursive: true });
	console.log(`    Created: ${PROFILE_DIR}`);

	// 2. Create default profile settings
	console.log("\n[2] Profile directory ready.");
	console.log("    Next steps:");

	console.log(`
  # 3. Launch Brave with the new profile
  open -a "Brave Browser" --args \\
    --user-data-dir="${PROFILE_DIR}"

  # 4. Login to chatgpt.com manually ONCE

  # 5. Close Brave completely (Cmd+Q)

  # 6. Verify cookies exist:
  bun run scripts/verify-brave-profile.ts
  `);

	// 7. Create config file
	const configPath = join(homedir(), ".pi/agent/extensions/oracle.json");
	const config = {
		browser: {
			executablePath:
				"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
			authSeedProfileDir: PROFILE_DIR,
			runtimeProfilesDir: join(homedir(), ".pi/oracle-runtime-profiles"),
		},
		auth: {
			chromeProfile: "Default",
		},
	};

	console.log("\n[3] Config ready at ~/.pi/agent/extensions/oracle.json:");
	console.log(JSON.stringify(config, null, 2));
}

main().catch(console.error);
