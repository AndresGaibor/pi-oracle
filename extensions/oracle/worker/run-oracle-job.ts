/**
 * Oracle job worker — thin entry point.
 * Orchestrates job execution by delegating to shared helpers and worker modules.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { ensurePrivateDir, secureWriteText, parseConversationId } from "../shared/helpers";
import { Logger } from "../shared/logger";
import { captureDiagnostics } from "../shared/diagnostics";
import { installSignalHandlers } from "../shared/signal-utils";
import { readJob, updateJob, withJobPhase, getJobDir, type OracleJob } from "../lib/jobs";
import { cloneSeedProfileToRuntime, cleanupRuntime } from "../lib/workers/job-seed";
import { launchBrowser, waitForStableChatUrl } from "../lib/workers/job-browser";
import { maybeClickAddFiles, sendPrompt } from "../lib/workers/job-prompt";
import { getAssistantMessages, waitForChatCompletion } from "../lib/workers/job-completion";
import { downloadArtifacts } from "../lib/workers/job-artifacts";

const jobId = process.argv[2];
if (!jobId) { console.error("Usage: run-job.ts <job-id>"); process.exit(1); }

let shuttingDown = false;
let lastHeartbeatMs = 0;

function jobMut(patch: Partial<OracleJob>): (j: OracleJob) => OracleJob {
  return (j: OracleJob) => ({ ...j, ...patch }) as OracleJob;
}

function phasePatch(phase: OracleJob["phase"], patch?: Partial<OracleJob>): Partial<OracleJob> {
  return { ...(patch ?? {}), phase, phaseAt: new Date().toISOString() };
}

let _logger: Logger;
const log = (msg: string) => _logger.log(msg);

async function heartbeat(patch?: Partial<OracleJob>, opts?: { force?: boolean }) {
  const now = Date.now();
  if (!opts?.force && !patch && now - lastHeartbeatMs < 10_000) return;
  lastHeartbeatMs = now;
  await updateJob(jobId, jobMut({ heartbeatAt: new Date(now).toISOString(), ...patch }));
}

async function run() {
  const job = readJob(jobId);
  if (!job) throw new Error(`Oracle job not found: ${jobId}`);

  const jobDir = getJobDir(job.id);
  await ensurePrivateDir(jobDir);
  await ensurePrivateDir(`${jobDir}/logs`);

  _logger = new Logger(`${jobDir}/logs/worker.log`);
  await _logger.init();

  installSignalHandlers(async () => {
    shuttingDown = true;
    await log("Signal received, cleaning up");
    await cleanupRuntime(job);
  });

  try {
    await log(`Starting oracle worker for job ${job.id}`);
    let j = await updateJob(jobId, jobMut(withJobPhase("cloning_runtime", { status: "waiting" })));

    // 1. Clone seed profile
    const seedGen = await cloneSeedProfileToRuntime(j);
    j = await updateJob(jobId, jobMut(phasePatch("launching_browser", { seedGeneration: seedGen })));

    // 2. Launch browser
    const url = j.chatUrl || j.config.browser.chatUrl;
    await launchBrowser(j.runtimeProfileDir, url, j.config.browser.runMode, j.config.browser.executablePath, j.config.browser.userAgent, j.config.browser.args);
    j = await updateJob(jobId, jobMut(phasePatch("verifying_auth")));

    // 3. Upload archive (optional)
    j = await updateJob(jobId, jobMut(phasePatch("uploading_archive")));
    if (j.archivePath) {
      try { await maybeClickAddFiles(); } catch (e: unknown) { await log(`Warning: add files: ${e instanceof Error ? e.message : String(e)}`); }
    }

    // 4. Send prompt
    const prompt = await readFile(j.promptPath, "utf8");
    const baseline = (await getAssistantMessages()).length;
    await log(`Assistant messages before send: ${baseline}`);
    await sendPrompt(prompt);

    // 5. Wait for stable URL
    const chatUrl = await waitForStableChatUrl(j.chatUrl, () => heartbeat());
    const convId = parseConversationId(chatUrl) || j.conversationId || undefined;
    j = await updateJob(jobId, jobMut(phasePatch("awaiting_response", { chatUrl, conversationId: convId })));

    // 6. Wait for completion
    const done = await waitForChatCompletion(baseline, j.config.worker.completionTimeoutMs, j.config.worker.pollMs, () => heartbeat());
    j = await updateJob(jobId, jobMut(phasePatch("extracting_response")));
    if (j.responsePath) await secureWriteText(j.responsePath, `${done.responseText.trim()}\n`);

    // 7. Download artifacts
    j = await updateJob(jobId, jobMut(phasePatch("downloading_artifacts")));
    const arts = await downloadArtifacts(j, done.responseIndex, () => heartbeat(), log);
    const fails = arts.filter((a) => "unconfirmed" in a).length;

    // 8. Complete
    await heartbeat(phasePatch(fails > 0 ? "complete_with_artifact_errors" : "complete", {
      status: "complete", completedAt: new Date().toISOString(),
      responsePath: j.responsePath, responseFormat: "text/plain", artifactFailureCount: fails,
    }), { force: true });

    const persisted = readJob(jobId);
    await log(`Final: ${persisted?.status ?? "unknown"} — job ${j.id} complete`);
  } catch (error: unknown) {
    if (!shuttingDown) {
      const msg = error instanceof Error ? error.message : String(error);
      await captureDiagnostics(`${getJobDir(jobId)}/logs`, "failure", true);
      await log(`Job failed: ${msg}`);
      await heartbeat(phasePatch("failed", { status: "failed", completedAt: new Date().toISOString(), error: msg }), { force: true });
      process.exitCode = 1;
    }
  } finally {
    await cleanupRuntime(readJob(jobId)).catch(() => undefined);
  }
}

await run();
