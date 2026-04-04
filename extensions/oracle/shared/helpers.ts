/**
 * Shared utilities — single source of truth for the pi-oracle project.
 * Process, filesystem, URL, and crypto helpers used across workers and lib/.
 */

import { readFileSync, existsSync } from "node:fs";
import { appendFile, chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

export { existsSync };

// ---------------------------------------------------------------------------
// Re-exports from snapshot-utils for convenience
// ---------------------------------------------------------------------------
export {
  parseSnapshotEntries,
  findEntry,
  findLastEntry,
  labelMatches,
  findLabeledEntry,
  type ParsedSnapshotEntry,
} from "./snapshot-utils";

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Pausa la ejecución por ms milisegundos.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Elimina query string y hash de una URL.
 */
export function stripQuery(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Verifica si un proceso está vivo enviando señal 0.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return false;
    return true;
  }
}

/**
 * Lee el PID almacenado en metadata.json de un lock directory.
 */
export function readLockProcessPid(path: string): number | undefined {
  const metadataPath = join(path, "metadata.json");
  if (!existsSync(metadataPath)) return undefined;
  try {
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as { processPid?: unknown };
    return typeof metadata.processPid === "number" && Number.isInteger(metadata.processPid) && metadata.processPid > 0
      ? metadata.processPid
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reclama un lock stale si el proceso dueño ya no está vivo.
 */
export async function maybeReclaimStaleLock(path: string): Promise<boolean> {
  const { rm } = await import("node:fs/promises");
  const processPid = readLockProcessPid(path);
  if (!processPid || isProcessAlive(processPid)) return false;
  await rm(path, { recursive: true, force: true }).catch(() => undefined);
  return true;
}

/**
 * Crea un directorio privado (solo owner: rwx------).
 */
export async function ensurePrivateDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700).catch(() => undefined);
}

/**
 * Escribe texto de forma atómica (write-to-temp + rename).
 */
export async function secureWriteText(path: string, content: string): Promise<void> {
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, content, { encoding: "utf8", mode: 0o600 });
  await chmod(tmpPath, 0o600).catch(() => undefined);
  await rename(tmpPath, path);
  await chmod(path, 0o600).catch(() => undefined);
}

/**
 * Escribe texto al final de un archivo de forma segura.
 */
export async function secureAppendText(path: string, content: string): Promise<void> {
  await appendFile(path, content, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
}

/**
 * Parsea el resultado de browser.evaluate() que puede venir como string JSON.
 */
export function parseEvalResult(value: unknown): unknown {
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

/**
 * Envuelve una expresión JS en un script que retorna JSON.
 */
export function toJsonScript(expression: string): string {
  return `JSON.stringify((() => { ${expression} })(), null, 2)`;
}

/**
 * Calcula SHA-256 de un archivo.
 */
export async function sha256File(path: string): Promise<string> {
  const buffer = await readFile(path);
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Extrae el conversation ID de una URL de ChatGPT (/c/xxxxx).
 */
export function parseConversationId(chatUrl: string | undefined): string | undefined {
  if (!chatUrl) return undefined;
  try {
    const parsed = new URL(chatUrl);
    const match = parsed.pathname.match(/\/c\/([^/?#]+)/i);
    return match?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Detecta el tipo de un archivo usando el comando `file`.
 */
export async function detectType(path: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("file", ["-b", path], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += String(d); });
    child.on("close", () => resolve(stdout.trim() || "unknown"));
    child.on("error", () => resolve("unknown"));
  });
}

/**
 * Check if a snapshot line contains an element with the given kind and any of the labels.
 */
export function snapshotHasLabel(snapshot: string, kind: string, labels: readonly string[]): boolean {
  return labels.some((label) => snapshot.includes(`${kind} "${label}"`));
}
