/**
 * Barrel export for shared utilities.
 */
export {
  sleep,
  stripQuery,
  isProcessAlive,
  readLockProcessPid,
  maybeReclaimStaleLock,
  ensurePrivateDir,
  secureWriteText,
  secureAppendText,
  parseEvalResult,
  toJsonScript,
  sha256File,
  parseConversationId,
  detectType,
  snapshotHasLabel,
  existsSync,
} from "./helpers";

export {
  parseSnapshotEntries,
  findEntry,
  findLastEntry,
  labelMatches,
  findLabeledEntry,
  filterByKind,
  filterByLabel,
  enabledEntries,
  findButtons,
  findLinks,
  findTextboxes,
  type ParsedSnapshotEntry,
} from "./snapshot-utils";

export { Logger } from "./logger";
export { captureDiagnostics } from "./diagnostics";
export { installSignalHandlers } from "./signal-utils";
export { spawnCommand, type SpawnOptions } from "./spawn-utils";
