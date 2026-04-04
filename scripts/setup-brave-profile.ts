// scripts/setup-brave-profile.ts - Create dedicated Brave profile for Oracle
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getCookiePath } from "../extensions/oracle/lib/cookie-paths";

const PROFILE_DIR = join(
    homedir(),
    ".local/share/oracle-brave-profile",
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
  brave --user-data-dir="${PROFILE_DIR}"

  # 4. Login to chatgpt.com manually ONCE

  # 5. Close Brave completely

  # 6. Verify cookies exist:
  bun run scripts/verify-brave-profile.ts
  `);

    // 7. Create config file
    const configPath = join(homedir(), ".pi/agent/extensions/oracle.json");

    // Use browser-detection to find the right executable
    const { resolveBrowserPath } = await import("../extensions/oracle/lib/browser-detection");
    const detected = resolveBrowserPath();

    const config = {
        browser: {
            executablePath: detected.executablePath,
            authSeedProfileDir: PROFILE_DIR,
            runtimeProfilesDir: join(homedir(), ".local/share/oracle-runtime-profiles"),
        },
        auth: {
            chromeProfile: "Default",
        },
    };

    console.log("\n[3] Config ready at ~/.pi/agent/extensions/oracle.json:");
    console.log(JSON.stringify(config, null, 2));
}

main().catch(console.error);
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
