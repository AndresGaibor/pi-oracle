/**
 * Artifact download for job workers.
 * Detects and downloads artifacts from ChatGPT responses using snapshot-based discovery.
 */
import { existsSync } from "node:fs";
import { rm, stat, chmod, readFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { CHATGPT_LABELS } from "../../pages/chatgpt/chatgpt.selectors";
import { findArtifactCandidates, preferredArtifactName } from "../../pages/chatgpt/chatgpt.assertions";
import { parseSnapshotEntries, secureWriteText, ensurePrivateDir, sleep, detectType } from "../../shared/helpers";
import * as browser from "../browser";
import { getJobDir, updateJob } from "../jobs";
import type { OracleJob } from "../jobs";
import {
  ARTIFACT_CANDIDATE_STABILITY_TIMEOUT_MS,
  ARTIFACT_CANDIDATE_STABILITY_POLL_MS,
  ARTIFACT_CANDIDATE_STABILITY_POLLS,
  ARTIFACT_DOWNLOAD_HEARTBEAT_MS,
  ARTIFACT_DOWNLOAD_TIMEOUT_MS,
  ARTIFACT_DOWNLOAD_MAX_ATTEMPTS,
  CONVERSATION_REOPEN_SETTLE_MS,
  ARTIFACT_RETRY_SETTLE_MS,
} from "../constants";

export interface DownloadedArtifact {
  displayName: string;
  fileName: string;
  copiedPath: string;
  size: number;
  sha256: string;
  detectedType: string;
}

export interface FailedArtifact {
  displayName: string;
  unconfirmed: true;
  error: string;
}

export type ArtifactEntry = DownloadedArtifact | FailedArtifact;

/** Slice snapshot to a single assistant response region */
export function assistantSnapshotSlice(snapshot: string, responseIndex: number): string | undefined {
  const lines = snapshot.split("\n");
  const headingIdxs = lines.flatMap((l, i) =>
    l.includes('heading "ChatGPT said:"') || l.includes('heading "ChatGPT dijo:"') ? [i] : [],
  );
  const start = headingIdxs[responseIndex];
  if (start === undefined) return undefined;
  const ends: number[] = [];
  const next = headingIdxs[responseIndex + 1];
  if (next !== undefined) ends.push(next);
  const composerIdx = lines.findIndex((l, i) => i > start && l.includes(`textbox "${CHATGPT_LABELS.composer[0]}"`));
  if (composerIdx !== -1) ends.push(composerIdx);
  const end = ends.length > 0 ? Math.min(...ends) : undefined;
  return lines.slice(start, end).join("\n");
}

async function collectArtifactCandidates(responseIndex: number) {
  const snapshot = await browser.snapshotText();
  const slice = assistantSnapshotSlice(snapshot, responseIndex);
  if (!slice) return { snapshot, targetSlice: undefined, candidates: [] };
  return { snapshot, targetSlice: slice, candidates: findArtifactCandidates(slice) };
}

async function reopenAndCollect(responseIndex: number, reason: string, logFn: (m: string) => Promise<void>) {
  const url = await browser.getUrl();
  await logFn(`Reopening conversation for artifacts (${reason}): ${url}`);
  await browser.open(url);
  await sleep(CONVERSATION_REOPEN_SETTLE_MS);
  return collectArtifactCandidates(responseIndex);
}

async function withHeartbeat<T>(task: () => Promise<T>, heartbeatFn: () => Promise<void>): Promise<T> {
  let inFlight = true;
  let running = false;
  const timer = setInterval(() => {
    if (!inFlight || running) return;
    running = true;
    void heartbeatFn().catch(() => undefined).finally(() => { running = false; });
  }, ARTIFACT_DOWNLOAD_HEARTBEAT_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  try { return await task(); } finally { inFlight = false; clearInterval(timer); }
}

async function flush(artifacts: ArtifactEntry[], jobId: string): Promise<void> {
  const jobDir = getJobDir(jobId);
  await secureWriteText(`${jobDir}/artifacts.json`, `${JSON.stringify(artifacts, null, 2)}\n`);
  await updateJob(jobId, (c) => ({
    ...c,
    artifactPaths: artifacts.flatMap((a) =>
      "copiedPath" in a && a.copiedPath && existsSync(a.copiedPath) ? [a.copiedPath] : [],
    ),
  }));
}

export async function downloadArtifacts(
  job: OracleJob,
  responseIndex: number,
  heartbeatFn: () => Promise<void>,
  logFn: (m: string) => Promise<void>,
): Promise<ArtifactEntry[]> {
  if (!job.config.artifacts.capture) {
    const jDir = getJobDir(job.id);
    await secureWriteText(`${jDir}/artifacts.json`, "[]\n");
    await updateJob(job.id, (c) => ({ ...c, artifactPaths: [] }));
    return [];
  }

  const artifactsDir = `${getJobDir(job.id)}/artifacts`;
  await ensurePrivateDir(artifactsDir);

  const { targetSlice, candidates } = await reopenAndCollect(responseIndex, "initial", logFn);
  if (!targetSlice) {
    await logFn(`No assistant response found for artifact capture (${responseIndex})`);
    await flush([], job.id);
    return [];
  }

  await logFn(`Artifacts: ${candidates.map((c: any) => c.label).join(", ") || "(none)"}`);
  const artifacts: ArtifactEntry[] = [];
  await flush(artifacts, job.id);

  for (const [index, candidate] of candidates.entries()) {
    let downloaded = false;
    for (let attempt = 1; attempt <= ARTIFACT_DOWNLOAD_MAX_ATTEMPTS && !downloaded; attempt++) {
      const snapshot = await browser.snapshotText();
      const slice = assistantSnapshotSlice(snapshot, responseIndex);
      if (!slice) break;
      const entries = parseSnapshotEntries(slice);
      const entry = entries.find(
        (e) => e.label === candidate.label && (e.kind === "button" || e.kind === "link") && !e.disabled,
      );
      if (!entry) break;

      const dest = join(artifactsDir, preferredArtifactName(candidate.label, index));
      await rm(dest, { force: true }).catch(() => undefined);

      try {
        await logFn(`Downloading "${candidate.label}" attempt ${attempt}`);
        await withHeartbeat(
          async () => browser.downloadByRef(entry.ref, dest, undefined, ARTIFACT_DOWNLOAD_TIMEOUT_MS),
          heartbeatFn,
        );
        await heartbeatFn();
        await chmod(dest, 0o600).catch(() => undefined);

        const [size, buf, typeResult] = await Promise.all([
          stat(dest).then((s) => s.size),
          readFile(dest),
          detectType(dest),
        ]);

        artifacts.push({
          displayName: candidate.label,
          fileName: basename(dest),
          copiedPath: dest,
          size,
          sha256: createHash("sha256").update(buf).digest("hex"),
          detectedType: typeResult,
        });
        downloaded = true;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        await rm(dest, { force: true }).catch(() => undefined);
        await logFn(`Artifact "${candidate.label}" failed (attempt ${attempt}): ${msg}`);
        if (attempt >= ARTIFACT_DOWNLOAD_MAX_ATTEMPTS) {
          artifacts.push({ displayName: candidate.label, unconfirmed: true, error: msg });
        } else {
          await reopenAndCollect(responseIndex, `retry ${attempt + 1}`, logFn);
          await sleep(ARTIFACT_RETRY_SETTLE_MS);
        }
      } finally {
        await flush(artifacts, job.id);
      }
    }
  }

  return artifacts;
}
