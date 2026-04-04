/**
 * File logger with secure permissions (mode 0600).
 */

import { appendFile, chmod, writeFile } from "node:fs/promises";

export class Logger {
  private logPath: string;

  constructor(logPath: string) {
    this.logPath = logPath;
  }

  async init(): Promise<void> {
    await writeFile(this.logPath, "", { mode: 0o600 });
    await chmod(this.logPath, 0o600).catch(() => undefined);
  }

  async log(message: string): Promise<void> {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    await appendFile(this.logPath, line, { encoding: "utf8", mode: 0o600 });
    await chmod(this.logPath, 0o600).catch(() => undefined);
  }
}
