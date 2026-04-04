/**
 * Job worker commands — thin orchestrator for /oracle job execution.
 * Delegates all logic to shared helpers, lib modules, and worker sub-modules.
 */
import { existsSync } from "node:fs";
import { readFile, rm, stat, chmod } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import {
  sleep,
  parseConversationId,
  secureWriteText,
  ensurePrivateDir,
  parseSnapshotEntries,
  findEntry,
  findLastEntry,
  labelMatches,
  type ParsedSnapshotEntry,
} from "../../shared/helpers";
import { spawnCommand } from "../../shared/spawn-utils";
import { captureDiagnostics } from "../../shared/diagnostics";
import { acquireLock, releaseLock, releaseLease } from "../../lib/locks";
import { readJob, updateJob, withJobPhase, getJobDir, type OracleJob } from "../../lib/jobs";
import * as browser from "../../lib/browser";
import { isResponseComplete, findArtifactCandidates, preferredArtifactName } from "../../pages/chatgpt/chatgpt.assertions";
import { CHATGPT_LABELS } from "../../pages/chatgpt/chatgpt.selectors";
import {
  LOCK_ACQUIRE_TIMEOUT_MS,
  CHAT_URL_POLL_MS,
  ARTIFACT_CANDIDATE_STABILITY_TIMEOUT_MS,
  ARTIFACT_CANDIDATE_STABILITY_POLL_MS,
  ARTIFACT_CANDIDATE_STABILITY_POLLS,
  ARTIFACT_DOWNLOAD_HEARTBEAT_MS,
  ARTIFACT_DOWNLOAD_TIMEOUT_MS,
  ARTIFACT_DOWNLOAD_MAX_ATTEMPTS,
  CONVERSATION_REOPEN_SETTLE_MS,
  ARTIFACT_RETRY_SETTLE_MS,
} from "../../lib/constants";
