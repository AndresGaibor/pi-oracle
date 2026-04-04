/**
 * Process signal handlers for graceful shutdown.
 */

export function installSignalHandlers(
  cleanupFn: () => Promise<void>,
): { isShuttingDown: () => boolean } {
  let shuttingDown = false;
  const handleSignal = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    void (async () => {
      await cleanupFn();
      process.exit(0);
    })();
  };
  process.on("SIGTERM", () => handleSignal("SIGTERM"));
  process.on("SIGINT", () => handleSignal("SIGINT"));
  return { isShuttingDown: () => shuttingDown };
}
