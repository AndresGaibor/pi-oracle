import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { parseSnapshotEntries, findEntry, findLastEntry, type ParsedSnapshotEntry } from "../shared/snapshot-utils";
import { isResponseComplete, findArtifactCandidates } from "../pages/chatgpt/chatgpt.assertions";
import { buildLoginProbeScript, classifyChatPage, type LoginProbeResult, type ClassifyResult, type PageState } from "../shared/login-utils";
import * as browser from "../lib/browser";
import { MODEL_FAMILY_PREFIX, EFFORT_LABELS } from "../pages/chatgpt/chatgpt.selectors";

const jobId = process.argv[2];
if (!jobId) {
  console.error("Usage: run-job.ts <job-id>");
  process.exit(1);
}

const jobDir = `/tmp/oracle-${jobId}`;
const jobPath = `${jobDir}/job.json`;

const CHATGPT_LABELS = {
  composer: ["Chat with ChatGPT", "Chatear con ChatGPT", "Pregunta lo que quieras"],
  addFiles: ["Add files and more", "Agregar archivos y más"],
  send: ["Send prompt", "Send message", "Enviar prompt", "Enviar mensaje", "Enviar"],
  close: ["Close", "Cerrar"],
  autoSwitchToThinking: ["Auto-switch to Thinking", "Cambio automático a Thinking", "Cambio automático a Pensando"],
  configure: ["Configure...", "Configurar..."],
  modelSelector: ["Model selector", "Selector de modelo"],
  stop: ["Stop streaming", "Stop generating", "Detener la transmisión", "Detener generacion", "Detener"],
  copyResponse: ["Copy response", "Copiar respuesta"],
};

// MODEL_FAMILY_PREFIX and EFFORT_LABELS imported from chatgpt.selectors as source of truth

const ORACLE_STATE_DIR = "/tmp/pi-oracle-state";
const LOCKS_DIR = join(ORACLE_STATE_DIR, "locks");
const LEASES_DIR = join(ORACLE_STATE_DIR, "leases");
const SEED_GENERATION_FILE = ".oracle-seed-generation";
const ARTIFACT_CANDIDATE_STABILITY_TIMEOUT_MS = 15_000;
const ARTIFACT_CANDIDATE_STABILITY_POLL_MS = 1_500;
const ARTIFACT_CANDIDATE_STABILITY_POLLS = 2;
const ARTIFACT_DOWNLOAD_HEARTBEAT_MS = 10_000;
const ARTIFACT_DOWNLOAD_TIMEOUT_MS = 90_000;
const ARTIFACT_DOWNLOAD_MAX_ATTEMPTS = 2;

let currentJob: any;
let browserStarted = false;
let cleaningUpBrowser = false;
let cleaningUpRuntime = false;
let shuttingDown = false;
let lastHeartbeatMs = 0;
let pageToken: string | null = null;

function labelMatches(label: any, candidates: string[]): boolean {
  return typeof label === "string" && candidates.includes(label);
}

function snapshotHasLabel(snapshot: string, kind: string, labels: string[]): boolean {
  return labels.some((label) => snapshot.includes(`${kind} "${label}"`));
}

function findLabeledEntry(snapshot: string, kind: string, labels: string[], predicate: (entry: ParsedSnapshotEntry) => boolean = () => true) {
  return findEntry(snapshot, (candidate) => candidate.kind === kind && labelMatches(candidate.label, labels) && predicate(candidate));
}

function effortLabelsFor(effortLabel: string): string[] {
  if (!effortLabel) return [];
  const key = effortLabel.toLowerCase();
  return (EFFORT_LABELS[key] as string[]) || [effortLabel];
}

function allEffortLabels(): string[] {
  return [...new Set(Object.values(EFFORT_LABELS).flat())];
}

async function ensurePrivateDir(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700).catch(() => undefined);
}

function leaseKey(kind: string, key: string) {
  return `${kind}-${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

async function readLockProcessPid(path: string): Promise<number | undefined> {
  const metadataPath = join(path, "metadata.json");
  if (!existsSync(metadataPath)) return undefined;
  try {
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    return typeof metadata?.processPid === "number" && Number.isInteger(metadata.processPid) && metadata.processPid > 0
      ? metadata.processPid
      : undefined;
  } catch {
    return undefined;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return false;
    return true;
  }
}

async function maybeReclaimStaleLock(path: string): Promise<boolean> {
  const processPid = await readLockProcessPid(path);
  if (!processPid || isProcessAlive(processPid)) return false;
  await rm(path, { recursive: true, force: true }).catch(() => undefined);
  return true;
}

async function acquireLock(kind: string, key: string, metadata: any, timeoutMs = 30_000) {
  const path = join(LOCKS_DIR, leaseKey(kind, key));
  const deadline = Date.now() + timeoutMs;
  await ensurePrivateDir(ORACLE_STATE_DIR);
  await ensurePrivateDir(LOCKS_DIR);

  while (Date.now() < deadline) {
    try {
      await mkdir(path, { recursive: false, mode: 0o700 });
      await secureWriteText(join(path, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
      return path;
    } catch (error: any) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
      if (await maybeReclaimStaleLock(path)) continue;
    }
    await sleep(200);
  }

  throw new Error(`Timed out waiting for oracle ${kind} lock: ${key}`);
}

async function releaseLock(path: string | undefined) {
  if (!path) return;
  await rm(path, { recursive: true, force: true }).catch(() => undefined);
}

async function withLock<T>(kind: string, key: string, metadata: any, fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
  const handle = await acquireLock(kind, key, metadata, timeoutMs);
  try {
    return await fn();
  } finally {
    await releaseLock(handle);
  }
}

async function releaseLease(kind: string, key: string | undefined) {
  if (!key) return;
  await rm(join(LEASES_DIR, leaseKey(kind, key)), { recursive: true, force: true }).catch(() => undefined);
}

async function secureWriteText(path: string, content: string) {
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, content, { encoding: "utf8", mode: 0o600 });
  await chmod(tmpPath, 0o600).catch(() => undefined);
  await rename(tmpPath, path);
  await chmod(path, 0o600).catch(() => undefined);
}

async function secureAppendText(path: string, content: string) {
  await appendFile(path, content, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
}

async function readJobUnlocked() {
  return JSON.parse(await readFile(jobPath, "utf8"));
}

async function readJob() {
  return readJobUnlocked();
}

async function writeJobUnlocked(job: any) {
  await secureWriteText(jobPath, `${JSON.stringify(job, null, 2)}\n`);
}

async function writeJob(job: any) {
  await withLock("job", jobId, { processPid: process.pid, action: "writeJob" }, async () => {
    await writeJobUnlocked(job);
  });
}

async function mutateJob(mutator: (job: any) => any) {
  return withLock("job", jobId, { processPid: process.pid, action: "mutateJob" }, async () => {
    const job = await readJobUnlocked();
    const next = mutator(job);
    await writeJobUnlocked(next);
    currentJob = next;
    return next;
  });
}

function phasePatch(phase: string, patch: any = undefined, at = new Date().toISOString()) {
  return {
    ...(patch || {}),
    phase,
    phaseAt: at,
  };
}

async function heartbeat(patch: any = undefined, options: any = {}) {
  const now = Date.now();
  const force = options.force === true;
  if (!force && !patch && now - lastHeartbeatMs < 10_000) return;
  lastHeartbeatMs = now;
  const heartbeatAt = new Date(now).toISOString();
  await mutateJob((job: any) => ({
    ...job,
    ...(patch || {}),
    heartbeatAt,
  }));
}

async function log(message: string) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await secureAppendText(`${jobDir}/logs/worker.log`, line);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SpawnOptions {
  timeoutMs?: number;
  allowFailure?: boolean;
  input?: string;
  cwd?: string;
}

function spawnCommand(command: string, args: string[], options: SpawnOptions = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const { timeoutMs, ...spawnOptions } = options;
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      ...spawnOptions,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    if (typeof timeoutMs === "number" && timeoutMs > 0) {
      killTimer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 2_000).unref?.();
      }, timeoutMs);
      killTimer.unref?.();
    }
    if (options.input) child.stdin.end(options.input);
    else child.stdin.end();
    child.stdout.on("data", (data) => {
      stdout += String(data);
    });
    child.stderr.on("data", (data) => {
      stderr += String(data);
    });
    child.on("close", (code) => {
      if (killTimer) clearTimeout(killTimer);
      if (timedOut) {
        const error = new Error(stderr || stdout || `${command} timed out after ${timeoutMs}ms`);
        if (options.allowFailure) resolve({ code: code || -1, stdout: stdout.trim(), stderr: error.message });
        else reject(error);
        return;
      }
      if (code === 0 || options.allowFailure) resolve({ code: code || 0, stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(stderr || stdout || `${command} exited with code ${code}`));
    });
    child.on("error", (error) => {
      if (killTimer) clearTimeout(killTimer);
      reject(error);
    });
  });
}

function parseConversationId(chatUrl: string | undefined): string | undefined {
  if (!chatUrl) return undefined;
  try {
    const parsed = new URL(chatUrl);
    const match = parsed.pathname.match(/\/c\/([^/?#]+)/i);
    return match?.[1];
  } catch {
    return undefined;
  }
}

async function cloneSeedProfileToRuntime(job: any) {
  const seedDir = job.config.browser.authSeedProfileDir;
  if (!existsSync(seedDir)) {
    throw new Error(`Oracle auth seed profile not found: ${seedDir}. Run /oracle-auth first.`);
  }

  const seedGenerationPath = join(seedDir, SEED_GENERATION_FILE);
  const seedGeneration = existsSync(seedGenerationPath) ? (await readFile(seedGenerationPath, "utf8")).trim() || undefined : undefined;

  await withLock("auth", "global", { jobId: job.id, processPid: process.pid, action: "cloneSeedProfile" }, async () => {
    await rm(job.runtimeProfileDir, { recursive: true, force: true }).catch(() => undefined);
    await ensurePrivateDir(dirname(job.runtimeProfileDir));
    const cloneArgs = job.config.browser.cloneStrategy === "apfs-clone" ? ["-cR", seedDir, job.runtimeProfileDir] : ["-R", seedDir, job.runtimeProfileDir];
    await spawnCommand("cp", cloneArgs);
  }, 10 * 60 * 1000);

  return seedGeneration;
}

async function cleanupRuntime(job: any) {
  if (!job || cleaningUpRuntime) return;
  cleaningUpRuntime = true;
  try {
    await browser.close().catch(() => undefined);
    await releaseLease("conversation", job.conversationId).catch(() => undefined);
    await releaseLease("runtime", job.runtimeId).catch(() => undefined);
    await rm(job.runtimeProfileDir, { recursive: true, force: true }).catch(() => undefined);
  } finally {
    cleaningUpRuntime = false;
  }
}

async function closeBrowser(_job: any) {
  if (cleaningUpBrowser) return;
  cleaningUpBrowser = true;
  try {
    await browser.close().catch(() => undefined);
  } finally {
    browserStarted = false;
    pageToken = null;
  }
}

async function launchBrowser(job: any, url: string) {
  await closeBrowser(job);
  const headless = job.config.browser.runMode !== "headed";
  await browser.launch({
    userDataDir: job.runtimeProfileDir,
    executablePath: job.config.browser.executablePath,
    userAgent: job.config.browser.userAgent,
    args: Array.isArray(job.config.browser.args) ? job.config.browser.args : undefined,
    headless,
  });
  browserStarted = true;
  // open the target URL in the main page
  await browser.open(url);
}

function streamStatus(_job: any) {
  return browser.getStatus();
}

async function ensureBrowserConnected(_job: any) {
  if (!browserStarted || cleaningUpBrowser) return;
  const status = streamStatus(null);
  if (status.connected === false) {
    throw new Error("The isolated oracle browser disconnected during the job.");
  }
}

function parseEvalResult(value: any): any {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    let trimmed = value.trim();
    try {
      let parsed = JSON.parse(trimmed);
      while (typeof parsed === "string") parsed = JSON.parse(parsed);
      return parsed;
    } catch {
      return trimmed;
    }
  }
  return value;
}

function toJsonScript(expression: string) {
  return `JSON.stringify((() => { ${expression} })(), null, 2)`;
}

async function evalPage(_job: any, script: string) {
  const raw = await browser.evaluate(browser.getMainPageId(), script);
  // Scripts wrapped in toJsonScript return a JSON string; parse it back.
  if (typeof raw === "string") return parseEvalResult(raw);
  return raw;
}

async function loginProbe(_job: any): Promise<LoginProbeResult> {
  const result = await evalPage(null, buildLoginProbeScript(5_000));
  if (!result || typeof result !== "object") {
    return { ok: false, status: 0, domLoginCta: false, onAuthPage: false, bodyKeys: [], bodyHasId: false, bodyHasEmail: false, error: "invalid-probe-result" };
  }
  return {
    ok: result.ok === true,
    status: typeof result.status === "number" ? result.status : 0,
    pageUrl: typeof result.pageUrl === "string" ? result.pageUrl : undefined,
    domLoginCta: result.domLoginCta === true,
    onAuthPage: result.onAuthPage === true,
    error: typeof result.error === "string" ? result.error : undefined,
    bodyKeys: Array.isArray(result.bodyKeys) ? result.bodyKeys : [],
    bodyHasId: result.bodyHasId === true,
    bodyHasEmail: result.bodyHasEmail === true,
  };
}

async function currentUrl(_job: any): Promise<string> {
  return browser.getUrl();
}

function stripQuery(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

async function snapshotText(_job: any): Promise<string> {
  return browser.snapshotText();
}

async function pageText(_job: any): Promise<string> {
  return browser.pageText();
}


function matchesModelFamilyButton(candidate: ParsedSnapshotEntry, family: string) {
  return candidate.kind === "button" && typeof candidate.label === "string" && candidate.label.startsWith(MODEL_FAMILY_PREFIX[family]) && !candidate.disabled;
}

function titleCase(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function requestedEffortLabel(job: any) {
  return job.effort ? titleCase(job.effort) : undefined;
}

function effortSelectionVisible(snapshot: string, effortLabel: string | undefined) {
  if (!effortLabel) return true;
  const labels = effortLabelsFor(effortLabel);
  const entries = parseSnapshotEntries(snapshot);
  return entries.some((entry) => {
    if (entry.disabled) return false;
    if (entry.kind === "combobox" && labels.includes(entry.value || "")) return true;
    if (entry.kind !== "button") return false;
    const label = String(entry.label || "").toLowerCase();
    return labels.some((candidate) => {
      const normalizedEffort = candidate.toLowerCase();
      return (
        label === normalizedEffort ||
        label === `${normalizedEffort} thinking` ||
        label === `${normalizedEffort}, click to remove` ||
        label === `${normalizedEffort} thinking, click to remove`
      );
    });
  });
}

function visibleEffortLabel(snapshot: string): string | undefined {
  const entries = parseSnapshotEntries(snapshot);
  const labels = allEffortLabels();
  const comboboxEntry = entries.find(
    (entry) => entry.kind === "combobox" && entry.value && labels.includes(entry.value) && !entry.disabled,
  );
  if (comboboxEntry?.value) return comboboxEntry.value;
  const buttonEntry = entries.find((entry) => {
    if (entry.kind !== "button" || entry.disabled || !entry.label) return false;
    const label = String(entry.label);
    return labels.some((candidate) => {
      const normalized = candidate.toLowerCase();
      const lowered = label.toLowerCase();
      return (
        lowered === normalized ||
        lowered === `${normalized} thinking` ||
        lowered === `${normalized}, click to remove` ||
        lowered === `${normalized} thinking, click to remove`
      );
    });
  });
  return buttonEntry?.label || undefined;
}

function thinkingChipVisible(snapshot: string) {
  return /button "(?:Light|Standard|Extended|Heavy|Ligero|Estándar|Ampliado|Extendido|Alto|Razonamiento ampliado)(?: thinking)?(?:, click to remove)?"/i.test(snapshot);
}

function snapshotHasModelConfigurationUi(snapshot: string) {
  const entries = parseSnapshotEntries(snapshot);
  const hasCloseButton = entries.some((entry) => entry.kind === "button" && labelMatches(entry.label, CHATGPT_LABELS.close) && !entry.disabled);
  const hasEffortCombobox = entries.some(
    (entry) => entry.kind === "combobox" && allEffortLabels().includes(entry.value || "") && !entry.disabled,
  );
  const hasConfigureAction = entries.some((entry) => entry.kind === "menuitem" && labelMatches(entry.label, CHATGPT_LABELS.configure) && !entry.disabled);
  return hasCloseButton || hasEffortCombobox || hasConfigureAction;
}

function snapshotStronglyMatchesRequestedModel(snapshot: string, job: any) {
  const entries = parseSnapshotEntries(snapshot);
  const familyMatched = entries.some((entry) => matchesModelFamilyButton(entry, job.chatModelFamily));
  if (job.chatModelFamily === "thinking") {
    return familyMatched || effortSelectionVisible(snapshot, requestedEffortLabel(job));
  }
  if (job.chatModelFamily === "pro") {
    return familyMatched;
  }
  return familyMatched;
}

function snapshotWeaklyMatchesRequestedModel(snapshot: string, job: any) {
  if (job.chatModelFamily === "thinking") {
    return effortSelectionVisible(snapshot, requestedEffortLabel(job));
  }
  if (job.chatModelFamily === "pro") {
    return !thinkingChipVisible(snapshot);
  }
  if (job.chatModelFamily === "instant") {
    return !thinkingChipVisible(snapshot);
  }
  return false;
}

async function clickRef(_job: any, ref: string) {
  await browser.clickRef(ref);
}

async function clickLabeledEntry(job: any, label: string | string[], options: any = {}) {
  const labels = Array.isArray(label) ? label : [label];
  const snapshot = await snapshotText(job);
  const entry = (options.last ? findLastEntry : findEntry)(
    snapshot,
    (candidate: ParsedSnapshotEntry) => labelMatches(candidate.label, labels) && (!options.kind || candidate.kind === options.kind) && !candidate.disabled,
  );
  if (!entry) throw new Error(`Could not find labeled entry: ${labels.join(" / ")}`);
  await clickRef(job, entry.ref);
  return entry;
}

async function maybeClickLabeledEntry(job: any, label: string | string[], options: any = {}) {
  const labels = Array.isArray(label) ? label : [label];
  const snapshot = await snapshotText(job);
  const entry = (options.last ? findLastEntry : findEntry)(
    snapshot,
    (candidate: ParsedSnapshotEntry) => labelMatches(candidate.label, labels) && (!options.kind || candidate.kind === options.kind) && !candidate.disabled,
  );
  if (!entry) return false;
  await clickRef(job, entry.ref);
  return true;
}

async function openEffortDropdown(job: any) {
  const snapshot = await snapshotText(job);
  const effortLabels = new Set(allEffortLabels());
  const entry = findEntry(
    snapshot,
    (candidate: ParsedSnapshotEntry) => !!(candidate.kind === "combobox" && candidate.value && effortLabels.has(candidate.value) && !candidate.disabled),
  );
  if (!entry) return false;
  await clickRef(job, entry.ref);
  return true;
}



async function captureDiagnostics(job: any, reason: string) {
  if (!browserStarted) return;
  try {
    const [url, snapshot, body] = await Promise.all([
      currentUrl(job).catch(() => ""),
      snapshotText(job).catch(() => ""),
      pageText(job).catch(() => ""),
    ]);
    await secureWriteText(join(job.logsDir, `${reason}.url.txt`), `${url || ""}\n`);
    await secureWriteText(join(job.logsDir, `${reason}.snapshot.txt`), `${snapshot || ""}\n`);
    await secureWriteText(join(job.logsDir, `${reason}.body.txt`), `${body || ""}\n`);
    await browser.screenshot(join(job.logsDir, `${reason}.png`)).catch(() => undefined);
  } catch {
  }
}


function detectUploadErrorText(text: string): string | undefined {
  const patterns = [
    "Failed upload",
    "upload failed",
    "files.oaiusercontent.com",
    "Please ensure your network settings allow access to this site",
    "could not upload",
  ];
  return patterns.find((pattern) => text.toLowerCase().includes(pattern.toLowerCase()));
}




async function assistantMessages(job: any) {
  const result = await evalPage(
    job,
    toJsonScript(`
      const turnStartAssistantMessages = Array.from(
        document.querySelectorAll('[data-message-author-role="assistant"][data-turn-start-message="true"]'),
      );
      const assistantMessages = turnStartAssistantMessages.length
        ? turnStartAssistantMessages
        : Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
      const renderText = (node) => {
        if (!node) return '';
        const clone = node.cloneNode(true);
        const host = document.createElement('div');
        host.style.position = 'fixed';
        host.style.left = '-99999px';
        host.style.top = '0';
        host.style.whiteSpace = 'pre-wrap';
        host.style.pointerEvents = 'none';
        host.appendChild(clone);
        document.body.appendChild(host);
        let text = (host.innerText || host.textContent || '').trim();
        host.remove();
        const endings = [
          '\\nChatGPT can make mistakes. Check important info.',
          '\\nChatGPT puede cometer errores. Comprueba la información importante.',
        ];
        for (const ending of endings) {
          if (text.includes(ending)) text = text.split(ending)[0].trim();
        }
        text = text
          .split('\\n')
          .map((line) => line.trimEnd())
          .filter((line) => line.trim() && !/^Thought for\\b/i.test(line.trim()))
          .join('\\n')
          .trim();
        return text;
      };
      return {
        messages: assistantMessages.map((message) => ({ text: renderText(message) })),
      };
    `),
  );

  if (!Array.isArray(result?.messages)) return [];
  return result.messages.map((message: any) => ({ text: typeof message?.text === "string" ? message.text : "" }));
}

function assistantSnapshotSlice(snapshot: string, responseIndex: number) {
  const lines = snapshot.split("\n");
  const assistantHeadingIndices = lines.flatMap((line, index) =>
    line.includes('heading "ChatGPT said:"') || line.includes('heading "ChatGPT dijo:"') ? [index] : [],
  );
  const startIndex = assistantHeadingIndices[responseIndex];
  if (startIndex === undefined) return undefined;

  const endCandidates = [];
  const nextAssistantIndex = assistantHeadingIndices[responseIndex + 1];
  if (nextAssistantIndex !== undefined) endCandidates.push(nextAssistantIndex);

  const composerIndex = lines.findIndex(
    (line, index) => index > startIndex && snapshotHasLabel(line, "textbox", CHATGPT_LABELS.composer),
  );
  if (composerIndex !== -1) endCandidates.push(composerIndex);

  const endIndex = endCandidates.length > 0 ? Math.min(...endCandidates) : undefined;
  return lines.slice(startIndex, endIndex).join("\n");
}

async function waitForStableChatUrl(job: any, previousChatUrl: string | undefined) {
  const timeoutAt = Date.now() + 60_000;
  let lastUrl = "";
  let stableCount = 0;

  while (Date.now() < timeoutAt) {
    await heartbeat();
    const url = stripQuery(await currentUrl(job));
    let isConversationUrl = false;
    try {
      isConversationUrl = /\/c\/[A-Za-z0-9-]+$/i.test(new URL(url).pathname);
    } catch {
      isConversationUrl = false;
    }
    const isKnownFollowUpUrl = previousChatUrl ? stripQuery(previousChatUrl) === url : false;

    if (isConversationUrl || isKnownFollowUpUrl) {
      if (url === lastUrl) stableCount += 1;
      else stableCount = 1;
      lastUrl = url;
      if (stableCount >= 2) return url;
    }

    await sleep(1000);
  }

  return previousChatUrl || stripQuery(await currentUrl(job));
}

// Snapshot-based completion detector delegates to chatgpt.assertions.isResponseComplete
function snapshotShowsCompletedResponse(snapshot: string) {
  return isResponseComplete(snapshot);
}

async function waitForChatCompletion(job: any, baselineAssistantCount: number) {
  const timeoutAt = Date.now() + job.config.worker.completionTimeoutMs;
  let lastText = "";
  let stableCount = 0;

  while (Date.now() < timeoutAt) {
    await heartbeat();
    const snapshot = await snapshotText(job);
    const messages = await assistantMessages(job);
    const targetMessage = messages[baselineAssistantCount];
    const targetText = targetMessage?.text || "";
    const hasCompletedResponse = snapshotShowsCompletedResponse(snapshot);

    if (targetText && hasCompletedResponse) {
      if (targetText === lastText) stableCount += 1;
      else stableCount = 1;
      lastText = targetText;
      if (stableCount >= 3) {
        return { responseIndex: baselineAssistantCount, responseText: targetText };
      }
    }

    await sleep(job.config.worker.pollMs);
  }

  throw new Error("Timed out waiting for ChatGPT response completion");
}

async function sha256(path: string) {
  const buffer = await readFile(path);
  return createHash("sha256").update(buffer).digest("hex");
}

async function detectType(path: string) {
  const result = await spawnCommand("file", ["-b", path], { allowFailure: true });
  return result.stdout || "unknown";
}


function preferredArtifactName(label: any, index: number) {
  const normalized = String(label || "").trim();
  const fileNameMatch = normalized.match(/([A-Za-z0-9._-]+\.[A-Za-z0-9]{1,12})(?!.*[A-Za-z0-9._-]+\.[A-Za-z0-9]{1,12})/);
  if (fileNameMatch) return basename(fileNameMatch[1]).replace(/[^a-zA-Z0-9._-]/g, "_");
  return `artifact-${String(index + 1).padStart(2, "0")}`;
}


async function collectArtifactCandidates(job: any, responseIndex: number) {
  const snapshot = await snapshotText(job);
  const targetSlice = assistantSnapshotSlice(snapshot, responseIndex);
  if (!targetSlice) return { snapshot, targetSlice, candidates: [] };
  return {
    snapshot,
    targetSlice,
    candidates: findArtifactCandidates(targetSlice),
  };
}

async function waitForStableArtifactCandidates(job: any, responseIndex: number) {
  const deadline = Date.now() + ARTIFACT_CANDIDATE_STABILITY_TIMEOUT_MS;
  let lastSignature: string | undefined;
  let stablePolls = 0;
  let latest: Awaited<ReturnType<typeof collectArtifactCandidates>> = { snapshot: "", targetSlice: undefined, candidates: [] };

  while (Date.now() < deadline) {
    latest = await collectArtifactCandidates(job, responseIndex);
    const signature = latest.candidates.map((candidate: any) => candidate.label).join("\n");
    if (signature === lastSignature) stablePolls += 1;
    else {
      lastSignature = signature;
      stablePolls = 1;
    }
    if (stablePolls >= ARTIFACT_CANDIDATE_STABILITY_POLLS) return latest;
    await heartbeat();
    await sleep(ARTIFACT_CANDIDATE_STABILITY_POLL_MS);
  }

  return latest;
}

async function reopenConversationForArtifacts(job: any, responseIndex: number, reason: string) {
  const targetUrl = job.chatUrl || stripQuery(await currentUrl(job));
  await log(`Reopening conversation before artifact capture (${reason}): ${targetUrl}`);
  await browser.open(targetUrl);
  await sleep(1500);
  return waitForStableArtifactCandidates(job, responseIndex);
}

async function withHeartbeatWhile<T>(task: () => Promise<T>, intervalMs = ARTIFACT_DOWNLOAD_HEARTBEAT_MS): Promise<T> {
  let inFlight = true;
  let heartbeatRunning = false;
  const timer = setInterval(() => {
    if (!inFlight || heartbeatRunning) return;
    heartbeatRunning = true;
    void heartbeat()
      .catch(() => undefined)
      .finally(() => {
        heartbeatRunning = false;
      });
  }, intervalMs);
  (timer as any).unref?.();
  try {
    return await task();
  } finally {
    inFlight = false;
    clearInterval(timer);
  }
}

async function flushArtifactsState(artifacts: any[]) {
  await secureWriteText(`${jobDir}/artifacts.json`, `${JSON.stringify(artifacts, null, 2)}\n`);
  await mutateJob((current: any) => ({
    ...current,
    artifactPaths: artifacts.flatMap((artifact) => (artifact.copiedPath && existsSync(artifact.copiedPath) ? [artifact.copiedPath] : [])),
  }));
}

async function downloadArtifacts(job: any, responseIndex: number) {
  if (!job.config.artifacts.capture) {
    await secureWriteText(`${jobDir}/artifacts.json`, "[]\n");
    await mutateJob((current: any) => ({ ...current, artifactPaths: [] }));
    return [];
  }

  const { targetSlice, candidates } = await reopenConversationForArtifacts(job, responseIndex, "initial");
  if (!targetSlice) {
    await log(`No assistant response found in snapshot for response index ${responseIndex}`);
    await secureWriteText(`${jobDir}/artifacts.json`, "[]\n");
    await mutateJob((current: any) => ({ ...current, artifactPaths: [] }));
    return [];
  }

  await log(`Artifact candidates: ${candidates.map((candidate: any) => candidate.label).join(", ") || "(none)"}`);

  const artifactsDir = `${jobDir}/artifacts`;
  await ensurePrivateDir(artifactsDir);
  const artifacts: any[] = [];
  await flushArtifactsState(artifacts);

  for (const [index, candidate] of candidates.entries()) {
    let downloaded = false;
    for (let attempt = 1; attempt <= ARTIFACT_DOWNLOAD_MAX_ATTEMPTS && !downloaded; attempt += 1) {
      const freshSnapshot = await snapshotText(job);
      const freshSlice = assistantSnapshotSlice(freshSnapshot, responseIndex);
      if (!freshSlice) break;
      const freshEntries = parseSnapshotEntries(freshSlice);
      const entry = freshEntries.find(
        (artifactEntry) => artifactEntry.label === candidate.label && (artifactEntry.kind === "button" || artifactEntry.kind === "link") && !artifactEntry.disabled,
      );
      if (!entry) {
        await log(`Artifact "${candidate.label}" not found in fresh snapshot, skipping`);
        break;
      }

      const destinationPath = join(artifactsDir, preferredArtifactName(candidate.label, index));
      await rm(destinationPath, { force: true }).catch(() => undefined);
      try {
        await log(`Artifact "${candidate.label}" download attempt ${attempt}/${ARTIFACT_DOWNLOAD_MAX_ATTEMPTS} using ref ${entry.ref}`);
        await withHeartbeatWhile(async () => {
          await browser.downloadByRef(entry.ref, destinationPath, undefined, ARTIFACT_DOWNLOAD_TIMEOUT_MS);
        });
        await heartbeat(undefined, { force: true });
        await chmod(destinationPath, 0o600).catch(() => undefined);
        const [size, checksum, detectedType] = await Promise.all([
          stat(destinationPath).then((stats) => stats.size),
          sha256(destinationPath),
          detectType(destinationPath),
        ]);
        artifacts.push({
          displayName: candidate.label,
          fileName: basename(destinationPath),
          copiedPath: destinationPath,
          size,
          sha256: checksum,
          detectedType,
        });
        downloaded = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await rm(destinationPath, { force: true }).catch(() => undefined);
        await log(`Artifact "${candidate.label}" download failed on attempt ${attempt}/${ARTIFACT_DOWNLOAD_MAX_ATTEMPTS}: ${message}`);
        if (attempt >= ARTIFACT_DOWNLOAD_MAX_ATTEMPTS) {
          artifacts.push({ displayName: candidate.label, unconfirmed: true, error: message });
        } else {
          await reopenConversationForArtifacts(job, responseIndex, `retry ${attempt + 1} for ${candidate.label}`);
          await sleep(1_000);
        }
      } finally {
        await flushArtifactsState(artifacts);
      }
    }
  }

  return artifacts;
}

function installSignalHandlers(job: any) {
  const handleSignal = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    void (async () => {
      await log(`Received ${signal}, cleaning up oracle runtime`);
      await cleanupRuntime(job);
      process.exit(0);
    })();
  };

  process.on("SIGTERM", () => handleSignal("SIGTERM"));
  process.on("SIGINT", () => handleSignal("SIGINT"));
}

async function run() {
  await ensurePrivateDir(jobDir);
  await ensurePrivateDir(`${jobDir}/logs`);
  currentJob = await readJob();
  installSignalHandlers(currentJob);

  try {
    await log(`Starting oracle worker for job ${currentJob.id}`);
    await heartbeat(phasePatch("cloning_runtime", { status: "waiting" }), { force: true });
    await closeBrowser(currentJob);

    const seedGeneration = await cloneSeedProfileToRuntime(currentJob);
    currentJob = await mutateJob((job: any) => ({ ...job, ...phasePatch("launching_browser", { seedGeneration, heartbeatAt: new Date().toISOString() }) }));

    const targetUrl = currentJob.chatUrl || currentJob.config.browser.chatUrl;
    await launchBrowser(currentJob, targetUrl);
    currentJob = await mutateJob((job: any) => ({ ...job, ...phasePatch("verifying_auth", { heartbeatAt: new Date().toISOString() }) }));
    await log("Skipping model configuration; using the model already active in ChatGPT UI");
    currentJob = await mutateJob((job: any) => ({ ...job, ...phasePatch("uploading_archive", { heartbeatAt: new Date().toISOString() }) }));
    
    // Upload archive file
    if (currentJob.archivePath) {
      try {
        await maybeClickLabeledEntry(currentJob, CHATGPT_LABELS.addFiles, { kind: "button" });
        // Browser file dialog handling would occur here via agent-browser
      } catch (error) {
        await log(`Warning: Could not click add files button: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    const prompt = await readFile(currentJob.promptPath, "utf8");
    const baselineAssistantCount = (await assistantMessages(currentJob)).length;
    await log(`Assistant response count before send: ${baselineAssistantCount}`);
    
    // Send prompt
    await clickLabeledEntry(currentJob, CHATGPT_LABELS.composer, { kind: "textbox" });
    
    // Input the prompt text via JavaScript to handle content-editable div
    await evalPage(currentJob, `
      const textbox = document.querySelector('[data-id*="composer"], [contenteditable="true"]');
      if (textbox) {
        textbox.focus();
        textbox.textContent = ${JSON.stringify(JSON.stringify(prompt))};
        textbox.dispatchEvent(new Event('input', { bubbles: true }));
        textbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return { success: !!textbox };
    `);
    
    // Click send button
    await maybeClickLabeledEntry(currentJob, CHATGPT_LABELS.send, { kind: "button" });

    const chatUrl = await waitForStableChatUrl(currentJob, currentJob.chatUrl);
    const conversationId = parseConversationId(chatUrl) || currentJob.conversationId;
    currentJob = await mutateJob((job: any) => ({
      ...job,
      ...phasePatch("awaiting_response", { chatUrl, conversationId, heartbeatAt: new Date().toISOString() }),
    }));

    const completion = await waitForChatCompletion(currentJob, baselineAssistantCount);
    currentJob = await mutateJob((job: any) => ({ ...job, ...phasePatch("extracting_response", { heartbeatAt: new Date().toISOString() }) }));
    await secureWriteText(currentJob.responsePath, `${completion.responseText.trim()}\n`);
    currentJob = await mutateJob((job: any) => ({ ...job, ...phasePatch("downloading_artifacts", { heartbeatAt: new Date().toISOString() }) }));
    const artifacts = await downloadArtifacts(currentJob, completion.responseIndex);
    const artifactFailureCount = artifacts.filter((artifact: any) => artifact.unconfirmed || artifact.error).length;

    await heartbeat(
      phasePatch(artifactFailureCount > 0 ? "complete_with_artifact_errors" : "complete", {
        status: "complete",
        completedAt: new Date().toISOString(),
        responsePath: currentJob.responsePath,
        responseFormat: "text/plain",
        artifactFailureCount,
      }),
      { force: true },
    );
    const persistedJob = await readJob().catch(() => undefined);
    await log(`Persisted final status after completion write: ${persistedJob?.status || "unknown"}`);
    await log(`Job ${currentJob.id} complete`);
  } catch (error) {
    if (!shuttingDown) {
      const message = error instanceof Error ? error.message : String(error);
      await captureDiagnostics(currentJob, "failure");
      await log(`Job failed: ${message}`);
      await heartbeat(
        phasePatch("failed", {
          status: "failed",
          completedAt: new Date().toISOString(),
          error: message,
        }),
        { force: true },
      );
      process.exitCode = 1;
    }
  } finally {
    await cleanupRuntime(currentJob).catch(() => undefined);
  }
}

await run();
