/**
 * Timeout-aware child-process wrapper.
 */

import { spawn } from "node:child_process";

export interface SpawnOptions {
  timeoutMs?: number;
  allowFailure?: boolean;
  input?: string;
  cwd?: string;
}

export function spawnCommand(
  command: string,
  args: string[],
  options: SpawnOptions = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const { timeoutMs, ...spawnOpts } = options;
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      ...spawnOpts,
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
    child.stdout.on("data", (data) => { stdout += String(data); });
    child.stderr.on("data", (data) => { stderr += String(data); });
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
