/**
 * Seed profile cloning and runtime cleanup for job workers.
 */
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { acquireLock, releaseLock, releaseLease } from "../locks";
import { ensurePrivateDir } from "../../shared/helpers";
import { spawnCommand } from "../../shared/spawn-utils";
import * as browser from "../browser";
import type { OracleJob } from "../jobs";

const SEED_GENERATION_FILE = ".oracle-seed-generation";

export async function cloneSeedProfileToRuntime(job: OracleJob): Promise<string | undefined> {
  const seedDir = job.config.browser.authSeedProfileDir;
  if (!existsSync(seedDir)) {
    throw new Error(`Oracle auth seed profile not found: ${seedDir}. Run /oracle-auth first.`);
  }

  const seedGenPath = join(seedDir, SEED_GENERATION_FILE);
  const seedGeneration = existsSync(seedGenPath)
    ? (await readFile(seedGenPath, "utf8")).trim() || undefined
    : undefined;

  const lockHandle = await acquireLock(
    "auth", "global",
    { jobId: job.id, processPid: process.pid, action: "cloneSeedProfile" },
    { timeoutMs: 10 * 60 * 1000 },
  );

  try {
    await rm(job.runtimeProfileDir, { recursive: true, force: true }).catch(() => undefined);
    await ensurePrivateDir(dirname(job.runtimeProfileDir));
    const cloneArgs = job.config.browser.cloneStrategy === "apfs-clone"
      ? ["-cR", seedDir, job.runtimeProfileDir]
      : ["-R", seedDir, job.runtimeProfileDir];
    await spawnCommand("cp", cloneArgs);
  } finally {
    await releaseLock(lockHandle);
  }

  return seedGeneration;
}

export async function cleanupRuntime(job: OracleJob | undefined): Promise<void> {
  if (!job) return;
  try {
    await browser.close().catch(() => undefined);
    if (job.conversationId) await releaseLease("conversation", job.conversationId).catch(() => undefined);
    await releaseLease("runtime", job.runtimeId).catch(() => undefined);
    await rm(job.runtimeProfileDir, { recursive: true, force: true }).catch(() => undefined);
  } catch {
    /* cleanup best-effort */
  }
}
