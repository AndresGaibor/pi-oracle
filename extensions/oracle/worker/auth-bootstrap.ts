import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, chmod, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { getCookies } from "@steipete/sweet-cookie";
import { ensureAccountCookie, filterImportableAuthCookies } from "./auth-cookie-policy";
import { parseSnapshotEntries, findEntry, findLastEntry, labelMatches, type ParsedSnapshotEntry } from "../shared/snapshot-utils";
import { buildLoginProbeScript, classifyChatPage, type LoginProbeResult, type ClassifyResult, type PageState } from "../shared/login-utils";
import * as browser from "../lib/browser";

// Extended probe result for auth-bootstrap with extra diagnostic fields
interface AuthBootstrapProbeResult extends LoginProbeResult {
  name?: string;
  responsePreview?: string;
}

const rawConfig = process.argv[2];
if (!rawConfig) {
  console.error("Usage: auth-bootstrap.ts <oracle-config-json>");
  process.exit(1);
}

const config = JSON.parse(rawConfig);
const CHATGPT_LABELS = {
  composer: ["Chat with ChatGPT", "Chatear con ChatGPT", "Pregunta lo que quieras"],
  addFiles: ["Add files and more", "Agregar archivos y más"],
  modelSelector: ["Model selector", "Selector de modelo"],
};


function snapshotHasLabel(snapshot: string, kind: string, labels: string[]) {
  return labels.some((label) => snapshot.includes(`${kind} "${label}"`));
}

const LOGIN_PROBE_TIMEOUT_MS = 5_000;
const CHATGPT_COOKIE_ORIGINS = [
  "https://chatgpt.com",
  "https://chat.openai.com",
  "https://atlas.openai.com",
  "https://auth.openai.com",
  "https://sentinel.openai.com",
  "https://ws.chatgpt.com",
];
const LOG_PATH = "/tmp/oracle-auth.log";
const URL_PATH = "/tmp/oracle-auth.url.txt";
const SNAPSHOT_PATH = "/tmp/oracle-auth.snapshot.txt";
const BODY_PATH = "/tmp/oracle-auth.body.txt";
const SCREENSHOT_PATH = "/tmp/oracle-auth.png";
const REAL_CHROME_USER_DATA_DIR = resolve(homedir(), "Library", "Application Support", "Google", "Chrome");
const ORACLE_STATE_DIR = "/tmp/pi-oracle-state";
const LOCKS_DIR = join(ORACLE_STATE_DIR, "locks");

let runtimeProfileDir = config.browser.authSeedProfileDir;

function authSessionName() {
  return `${config.browser.sessionPrefix}-auth`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function leaseKey(kind: string, key: string) {
  return `${kind}-${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

async function readLockProcessPid(path: string) {
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

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return false;
    return true;
  }
}

async function maybeReclaimStaleLock(path: string) {
  const processPid = await readLockProcessPid(path);
  if (!processPid || isProcessAlive(processPid)) return false;
  await rm(path, { recursive: true, force: true }).catch(() => undefined);
  return true;
}

async function acquireLock(kind: string, key: string, metadata: any, timeoutMs = 30_000) {
  const path = join(LOCKS_DIR, leaseKey(kind, key));
  const deadline = Date.now() + timeoutMs;
  await mkdir(ORACLE_STATE_DIR, { recursive: true, mode: 0o700 });
  await mkdir(LOCKS_DIR, { recursive: true, mode: 0o700 });

  while (Date.now() < deadline) {
    try {
      await mkdir(path, { recursive: false, mode: 0o700 });
      await writeFile(join(path, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      return path;
    } catch (error: any) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
      if (await maybeReclaimStaleLock(path)) continue;
    }
    await sleep(200);
  }

  throw new Error(`Timed out waiting for oracle ${kind} lock: ${key}`);
}

async function releaseLock(path?: string) {
  if (!path) return;
  await rm(path, { recursive: true, force: true }).catch(() => undefined);
}

async function withLock(kind: string, key: string, metadata: any, fn: any, timeoutMs?: number) {
  const handle = await acquireLock(kind, key, metadata, timeoutMs);
  try {
    return await fn();
  } finally {
    await releaseLock(handle);
  }
}

async function initLog() {
  await writeFile(LOG_PATH, "", { mode: 0o600 });
  await chmod(LOG_PATH, 0o600).catch(() => undefined);
}

async function log(message: string) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await appendFile(LOG_PATH, line, { encoding: "utf8", mode: 0o600 });
  await chmod(LOG_PATH, 0o600).catch(() => undefined);
}

function spawnCommand(command: string, args: string[], options: any = {}) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    if (options.input) child.stdin.end(options.input);
    else child.stdin.end();
    child.stdout.on("data", (data) => {
      stdout += String(data);
    });
    child.stderr.on("data", (data) => {
      stderr += String(data);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || options.allowFailure) resolve({ code: code ?? 0, stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(stderr || stdout || `${command} exited with code ${code}`));
    });
  });
}

async function closeTargetBrowser() {
  await log(`Closing target browser session ${authSessionName()} if present`);
  await browser.close().catch((e) => {
    void e;
  });
  await log("close result: browser closed");
}

async function ensureNotSymlink(path: string, label: string) {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) {
      throw new Error(`${label} must not be a symlink: ${path}`);
    }
  } catch (error: any) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

async function createProfilePlan(profileDir: string) {
  const targetDir = resolve(profileDir);
  if (!targetDir.startsWith("/")) {
    throw new Error(`Oracle profileDir must be an absolute path: ${profileDir}`);
  }
  if (targetDir === "/" || targetDir === homedir()) {
    throw new Error(`Oracle profileDir is unsafe: ${targetDir}`);
  }
  if (targetDir === REAL_CHROME_USER_DATA_DIR || targetDir.startsWith(`${REAL_CHROME_USER_DATA_DIR}/`)) {
    throw new Error(`Oracle profileDir must not point into the real Chrome user-data directory: ${targetDir}`);
  }

  const stagingDir = `${targetDir}.staging-${Date.now()}`;
  const backupDir = `${targetDir}.prev`;
  await mkdir(dirname(targetDir), { recursive: true, mode: 0o700 });
  await ensureNotSymlink(dirname(targetDir), "Oracle profile parent directory");
  await ensureNotSymlink(targetDir, "Oracle profile directory");
  await ensureNotSymlink(backupDir, "Oracle backup profile directory");
  return { targetDir, stagingDir, backupDir };
}

async function prepareStagedProfile(plan: any) {
  runtimeProfileDir = plan.stagingDir;
  await log(`Preparing staged oracle profile ${plan.stagingDir}`);
  await rm(plan.stagingDir, { recursive: true, force: true }).catch(async (error) => {
    await log(`Staging profile cleanup warning: ${error instanceof Error ? error.message : String(error)}`);
  });
}

async function commitStagedProfile(plan: any) {
  await log(`Committing staged oracle profile ${plan.stagingDir} -> ${plan.targetDir}`);
  await rm(plan.backupDir, { recursive: true, force: true }).catch(() => undefined);

  const hadPreviousProfile = existsSync(plan.targetDir);
  if (hadPreviousProfile) {
    await rename(plan.targetDir, plan.backupDir);
  }

  try {
    await rename(plan.stagingDir, plan.targetDir);
    runtimeProfileDir = plan.targetDir;
    if (hadPreviousProfile) {
      await log(`Previous oracle profile moved to ${plan.backupDir}`);
    }
  } catch (error) {
    if (!existsSync(plan.targetDir) && existsSync(plan.backupDir)) {
      await rename(plan.backupDir, plan.targetDir).catch(() => undefined);
    }
    throw error;
  }
}

async function launchTargetBrowser() {
  await closeTargetBrowser();
  const headless = false; // auth always runs headed for user interaction
  await browser.launch({
    userDataDir: runtimeProfileDir,
    executablePath: config.browser.executablePath,
    userAgent: config.browser.userAgent,
    args: Array.isArray(config.browser.args) ? config.browser.args : undefined,
    headless,
  });
  await log("Launching isolated browser: Playwright persistent context launched");
}

function streamStatus() {
  return browser.getStatus();
}

async function ensureBrowserConnected() {
  const status = streamStatus();
  if (status.connected === false) {
    throw new Error("The isolated oracle browser was closed before auth verification completed.");
  }
}

function parseEvalResult(value: any) {
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

async function evalPage(script: string, _logLabel = "eval") {
  const raw = await browser.evaluate(browser.getMainPageId(), script);
  if (typeof raw === "string") return parseEvalResult(raw);
  return raw;
}

async function openUrl(url: string, _label = url) {
  await log(`Opening URL ${url}`);
  await browser.open(url);
}

async function getUrl() {
  return browser.getUrl();
}

async function snapshotText(): Promise<string> {
  return browser.snapshotText();
}

async function pageText(): Promise<string> {
  return browser.pageText();
}

async function clickRef(ref: string, _logLabel = `click ${ref}`) {
  await browser.clickRef(ref);
}

async function reload() {
  await browser.reload().catch(() => undefined);
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

function cookieOrigins() {
  return Array.from(new Set([stripQuery(config.browser.chatUrl), ...CHATGPT_COOKIE_ORIGINS]));
}

function cookieSource() {
  return config.auth.chromeCookiePath || config.auth.chromeProfile;
}

function cookieSourceLabel() {
  return config.auth.chromeCookiePath ? `Chrome cookie DB ${config.auth.chromeCookiePath}` : `Chrome profile ${config.auth.chromeProfile}`;
}

async function readSourceCookies() {
  await log(`Reading ChatGPT cookies from ${cookieSourceLabel()}`);
  const { cookies, warnings } = await getCookies({
    url: config.browser.chatUrl,
    origins: cookieOrigins(),
    browsers: ["chrome"],
    mode: "merge",
    chromeProfile: cookieSource(),
    timeoutMs: 5_000,
  });

  if (warnings.length) {
    await log(`sweet-cookie warnings: ${warnings.join(" | ")}`);
  }

  const filtered = filterImportableAuthCookies(cookies, config.browser.chatUrl);
  let normalizedCookies = filtered.cookies;
  await log(
    `Read ${normalizedCookies.length} filtered auth cookies: ${normalizedCookies.map((cookie: any) => `${cookie.name}@${cookie.domain}`).join(", ")}`,
  );
  if (filtered.dropped.length) {
    await log(
      `Dropped ${filtered.dropped.length} non-importable cookies: ` +
        filtered.dropped.map(({ cookie, reason }: any) => `${cookie.name}@${cookie.domain}(${reason})`).join(", "),
    );
  }

  const hasSessionToken = normalizedCookies.some((cookie: any) => cookie.name.startsWith("__Secure-next-auth.session-token"));
  const hasAccountCookie = normalizedCookies.some((cookie: any) => cookie.name === "_account");
  await log(`Cookie presence: sessionToken=${hasSessionToken} account=${hasAccountCookie}`);

  if (!hasSessionToken) {
    throw new Error(
      `No ChatGPT session-token cookies were found in ${cookieSourceLabel()}. Make sure ChatGPT is logged into that Chrome profile, or set auth.chromeProfile / auth.chromeCookiePath in ~/.pi/agent/extensions/oracle.json.`,
    );
  }

  if (!hasAccountCookie) {
    const ensured = ensureAccountCookie(normalizedCookies, config.browser.chatUrl);
    normalizedCookies = ensured.cookies;
    if (ensured.synthesized) {
      await log(`Synthesized missing _account cookie with value=${ensured.value}`);
    }
  }

  return normalizedCookies;
}

async function seedCookiesIntoTarget(cookies: any[]) {
  await log("Clearing isolated browser cookies before seeding fresh ChatGPT cookies");
  await browser.cookiesClear();

  await browser.cookiesSet(cookies);
  await log(`Applied ${cookies.length}/${cookies.length} cookies into isolated browser profile`);
  return cookies.length;
}


async function loginProbe(): Promise<AuthBootstrapProbeResult> {
  const result = await evalPage(buildLoginProbeScript(LOGIN_PROBE_TIMEOUT_MS), "login probe eval");
  if (!result || typeof result !== "object") {
    return { ok: false, status: 0, error: "invalid-probe-result", domLoginCta: false, onAuthPage: false, bodyKeys: [], bodyHasId: false, bodyHasEmail: false };
  }
  const r = result as Record<string, unknown>;
  return {
    ok: r.ok === true,
    status: typeof r.status === "number" ? r.status : 0,
    pageUrl: typeof r.pageUrl === "string" ? r.pageUrl : undefined,
    domLoginCta: r.domLoginCta === true,
    onAuthPage: r.onAuthPage === true,
    error: typeof r.error === "string" ? r.error : undefined,
    bodyKeys: Array.isArray(r.bodyKeys) ? r.bodyKeys : [],
    bodyHasId: r.bodyHasId === true,
    bodyHasEmail: r.bodyHasEmail === true,
    name: typeof r.name === "string" ? r.name : undefined,
    responsePreview: typeof r.responsePreview === "string" ? r.responsePreview : undefined,
  };
}

async function captureDiagnostics(reason: string) {
  try {
    const [url, snapshot, body] = await Promise.all([getUrl().catch(() => ""), snapshotText().catch(() => ""), pageText().catch(() => "")]);
    await writeFile(URL_PATH, `${url}\n`, { mode: 0o600 });
    await writeFile(SNAPSHOT_PATH, `${snapshot}\n`, { mode: 0o600 });
    await writeFile(BODY_PATH, `${body}\n`, { mode: 0o600 });
    await chmod(URL_PATH, 0o600).catch(() => undefined);
    await chmod(SNAPSHOT_PATH, 0o600).catch(() => undefined);
    await chmod(BODY_PATH, 0o600).catch(() => undefined);
    await browser.screenshot(SCREENSHOT_PATH).catch(() => undefined);
    await log(`Captured diagnostics for ${reason}: ${URL_PATH}, ${SNAPSHOT_PATH}, ${BODY_PATH}, ${SCREENSHOT_PATH}`);
  } catch (error: any) {
    await log(`Failed to capture diagnostics for ${reason}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function classifyChatPageWithAuth(params: { url: string; snapshot: string; body: string; probe?: AuthBootstrapProbeResult }): ClassifyResult {
  // Get the base classification from shared utils
  const baseClassification = classifyChatPage({
    url: params.url,
    snapshot: params.snapshot,
    body: params.body,
    probe: params.probe,
    chatUrl: config.browser.chatUrl,
  });

  // Enhance auth-specific messages
  if (baseClassification.state === "challenge_blocking") {
    return {
      ...baseClassification,
      message:
        `ChatGPT challenge detected after syncing cookies from ${cookieSourceLabel()}. ` +
        `The isolated oracle browser was left open on profile ${runtimeProfileDir}; complete the challenge there, then rerun /oracle-auth. Logs: ${LOG_PATH}`,
    };
  }

  if (baseClassification.state === "login_required") {
    return {
      ...baseClassification,
      message:
        `Synced cookies from ${cookieSourceLabel()}, but ChatGPT still rejected the session. ` +
        `Check auth.chromeProfile/auth.chromeCookiePath and inspect ${LOG_PATH}.`,
    };
  }

  if (baseClassification.state === "auth_transitioning") {
    return {
      ...baseClassification,
      message:
        `ChatGPT accepted the cookies but is still resolving the authentication flow. ` +
        `Logs: ${LOG_PATH}`,
    };
  }

  if (baseClassification.state === "authenticated_and_ready") {
    return {
      ...baseClassification,
      message: `Imported ChatGPT auth from ${cookieSourceLabel()} into the isolated oracle profile. Logs: ${LOG_PATH}`,
    };
  }

  return baseClassification;
}

async function maybeSelectAccountIdentity(snapshot: string, probe: AuthBootstrapProbeResult) {
  const candidates: string[] = [];
  if (typeof probe?.name === "string" && probe.name.trim()) {
    candidates.push(probe.name.trim());
    const firstToken = probe.name.trim().split(/\s+/)[0];
    if (firstToken && firstToken !== probe.name.trim()) candidates.push(firstToken);
  }

  for (const label of candidates) {
    const entry = findEntry(
      snapshot,
      (candidate) => candidate.kind === "button" && candidate.label === label && !candidate.disabled,
    );
    if (!entry) continue;
    await log(`Clicking account chooser button ${JSON.stringify(label)} via ${entry.ref}`);
    await clickRef(entry.ref, `click account chooser ${label}`);
    return true;
  }

  const loginEntry = findLastEntry(
    snapshot,
    (candidate) => candidate.kind === "button" && labelMatches(candidate.label, ["Log in", "Iniciar sesión", "Acceder", "Entrar"]) && !candidate.disabled,
  );
  if (loginEntry) {
    await log(`Clicking visible Log in CTA via ${loginEntry.ref} while backend session is already authenticated`);
    await clickRef(loginEntry.ref, "click login cta");
    return true;
  }

  return false;
}

function preserveBrowserError(message: string) {
  const error: any = new Error(message);
  error.preserveBrowser = true;
  return error;
}

async function waitForImportedAuthReady() {
  const startedAt = Date.now();
  const timeoutAt = startedAt + config.auth.bootstrapTimeoutMs;
  let retriedOutage = false;
  let retriedAuthTransition = false;
  let attemptedAccountChooser = false;
  let attemptedAuthUrl = false;
  let iteration = 0;
  while (Date.now() < timeoutAt) {
    iteration += 1;
    const [url, snapshot, body, probe] = await Promise.all([getUrl(), snapshotText(), pageText(), loginProbe()]);
    await writeFile(URL_PATH, `${url}\n`, { mode: 0o600 }).catch(() => undefined);
    await writeFile(SNAPSHOT_PATH, `${snapshot}\n`, { mode: 0o600 }).catch(() => undefined);
    await writeFile(BODY_PATH, `${body}\n`, { mode: 0o600 }).catch(() => undefined);
    const classification = classifyChatPageWithAuth({ url, snapshot, body, probe });
    await log(
      `poll ${iteration}: url=${JSON.stringify(url)} probe=${JSON.stringify(probe)} classification=${classification.state} hasComposer=${snapshotHasLabel(snapshot, "textbox", CHATGPT_LABELS.composer)} hasAddFiles=${snapshotHasLabel(snapshot, "button", CHATGPT_LABELS.addFiles)}`,
    );
    if (classification.state === "authenticated_and_ready") return classification;
    if (classification.state === "auth_transitioning") {
      const elapsedMs = Date.now() - startedAt;
      if (!attemptedAuthUrl && (probe?.bodyHasId || probe?.bodyHasEmail)) {
        attemptedAuthUrl = true;
        await log(`Backend session is authenticated but shell is public; opening auth URL ${config.browser.authUrl} to force session resolution`);
        await openUrl(config.browser.authUrl, config.browser.authUrl);
        await sleep(1500);
        continue;
      }
      if (!attemptedAccountChooser && (probe?.bodyHasId || probe?.bodyHasEmail)) {
        attemptedAccountChooser = await maybeSelectAccountIdentity(snapshot, probe);
        if (attemptedAccountChooser) {
          await log("Auth transition click dispatched; waiting for authenticated shell to settle");
          await sleep(1500);
          continue;
        }
        await log(`No account/login resolution click target found. Snapshot entries: ${parseSnapshotEntries(snapshot).map((entry: ParsedSnapshotEntry) => `${entry.kind}:${entry.label || entry.value || entry.ref}`).join(' | ')}`);
      }
      if (!retriedAuthTransition && elapsedMs >= 5_000) {
        retriedAuthTransition = true;
        await log("Auth looks accepted but page is still public-looking; reloading once after hydration grace period");
        await reload();
        await sleep(1500);
        continue;
      }
      if (elapsedMs >= 20_000) {
        await captureDiagnostics("auth-transition-timeout");
        throw new Error(`ChatGPT accepted the session cookies but never left the public-looking homepage. Inspect ${LOG_PATH}.`);
      }
      await sleep(config.auth.pollMs);
      continue;
    }
    if (classification.state === "transient_outage_error" && !retriedOutage) {
      retriedOutage = true;
      await log("Transient outage detected; reloading once");
      await reload();
      await sleep(1500);
      continue;
    }
    if (classification.state === "challenge_blocking") {
      await captureDiagnostics("challenge");
      throw preserveBrowserError(classification.message);
    }
    if (classification.state === "login_required") {
      await captureDiagnostics("login-required");
      throw new Error(classification.message);
    }
    await sleep(config.auth.pollMs);
  }
  await captureDiagnostics("timeout");
  throw new Error(`Timed out verifying synced ChatGPT cookies in the isolated oracle profile. Logs: ${LOG_PATH}`);
}

async function run() {
  await initLog();
  await withLock("auth", "global", { processPid: process.pid, action: "oracle-auth" }, async () => {
    let shouldPreserveBrowser = false;
    let committedProfile = false;
    let profilePlan: any;
    try {
      profilePlan = await createProfilePlan(config.browser.authSeedProfileDir);
      await log(`Starting oracle auth bootstrap`);
      await log(
        `Config summary: session=${authSessionName()} seedProfileDir=${profilePlan.targetDir} stagingProfileDir=${profilePlan.stagingDir} executable=${config.browser.executablePath || "(default)"} source=${cookieSourceLabel()}`,
      );
      const cookies = await readSourceCookies();
      await prepareStagedProfile(profilePlan);
      await launchTargetBrowser();
      const appliedCount = await seedCookiesIntoTarget(cookies);
      await log(`Cookie seeding complete: applied=${appliedCount}`);
      await openUrl(config.browser.chatUrl, config.browser.chatUrl);
      const classification = await waitForImportedAuthReady();
      await log(`Auth bootstrap success: ${classification.message}`);
      await closeTargetBrowser();
      await commitStagedProfile(profilePlan);
      const generation = new Date().toISOString();
      await writeFile(join(profilePlan.targetDir, ".oracle-seed-generation"), `${generation}\n`, { encoding: "utf8", mode: 0o600 });
      committedProfile = true;
      process.stdout.write(`${classification.message} Synced ${appliedCount} cookies into ${profilePlan.targetDir}`);
    } catch (error: any) {
      shouldPreserveBrowser = Boolean(error && typeof error === "object" && error.preserveBrowser === true);
      await log(`Auth bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
      if (!shouldPreserveBrowser) {
        await closeTargetBrowser().catch(() => undefined);
      }
      if (profilePlan && !committedProfile && !shouldPreserveBrowser) {
        await rm(profilePlan.stagingDir, { recursive: true, force: true }).catch(() => undefined);
      }
      throw error;
    }
  }, 10 * 60 * 1000);
}

run().catch((error: any) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\nSee ${LOG_PATH} and diagnostics in /tmp/oracle-auth.*\nIf needed, ensure the configured real Chrome profile is already logged into ChatGPT and grant macOS Keychain access when prompted.`,
  );
  process.exit(1);
});
