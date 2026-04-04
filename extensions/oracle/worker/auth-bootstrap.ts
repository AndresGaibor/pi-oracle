/**
 * Auth bootstrap worker — thin entry point for /oracle-auth.
 * Delegates all logic to lib/AuthBootstrap and lib/locks.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withAuthLock } from "../lib/locks";
import type { AuthConfig } from "../lib/AuthBootstrap";
import { AuthBootstrap } from "../lib/AuthBootstrap";

const rawConfig = process.argv[2];
if (!rawConfig) {
  console.error("Usage: auth-bootstrap.ts <oracle-config-json>");
  process.exit(1);
}
const config: AuthConfig = JSON.parse(rawConfig);

async function main() {
  await withAuthLock(
    { processPid: process.pid, action: "oracle-auth" },
    async () => {
      const bootstrap = new AuthBootstrap(config);
      const profilePlan = await bootstrap.createProfilePlan(config.browser.authSeedProfileDir);
      const result = await bootstrap.run(profilePlan);

      // Write seed generation marker
      const generation = new Date().toISOString();
      await writeFile(
        join(profilePlan.targetDir, ".oracle-seed-generation"),
        `${generation}\n`,
        { encoding: "utf8", mode: 0o600 },
      );

      process.stdout.write(result.message);
    },
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\nSee /tmp/oracle-auth.* for diagnostics.\n`,
  );
  process.exit(1);
});
