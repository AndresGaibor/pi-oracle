import { describe, it, expect, vi } from "vitest";
import {
    isActiveOracleJob,
    isWorkerProcessAlive,
    getStaleOracleJobReason,
    withJobPhase,
} from "../../extensions/oracle/lib/jobs";
import type { OracleJob } from "../../extensions/oracle/lib/jobs";

// ---------------------------------------------------------------------------
// isActiveOracleJob
// ---------------------------------------------------------------------------
describe("isActiveOracleJob", () => {
    it("returns true for 'preparing' status", () => {
        expect(isActiveOracleJob({ status: "preparing" })).toBe(true);
    });

    it("returns true for 'submitted' status", () => {
        expect(isActiveOracleJob({ status: "submitted" })).toBe(true);
    });

    it("returns true for 'waiting' status", () => {
        expect(isActiveOracleJob({ status: "waiting" })).toBe(true);
    });

    it("returns false for 'complete' status", () => {
        expect(isActiveOracleJob({ status: "complete" })).toBe(false);
    });

    it("returns false for 'failed' status", () => {
        expect(isActiveOracleJob({ status: "failed" })).toBe(false);
    });

    it("returns false for 'cancelled' status", () => {
        expect(isActiveOracleJob({ status: "cancelled" })).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// withJobPhase
// ---------------------------------------------------------------------------
describe("withJobPhase", () => {
    it("sets phase and phaseAt", () => {
        const patch = withJobPhase("submitted", undefined, "2024-01-01T00:00:00.000Z");
        expect(patch.phase).toBe("submitted");
        expect(patch.phaseAt).toBe("2024-01-01T00:00:00.000Z");
    });

    it("includes additional patch fields", () => {
        const patch = withJobPhase("failed", { status: "failed" as const });
        expect(patch.phase).toBe("failed");
        expect(patch.status).toBe("failed");
    });
});

// ---------------------------------------------------------------------------
// isWorkerProcessAlive (depends on process.kill which may not exist)
// ---------------------------------------------------------------------------
describe("isWorkerProcessAlive", () => {
    it("returns false for undefined pid", () => {
        expect(isWorkerProcessAlive(undefined)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// getStaleOracleJobReason
// ---------------------------------------------------------------------------
describe("getStaleOracleJobReason", () => {
    function makeJob(overrides: Partial<OracleJob> = {}): OracleJob {
        const now = new Date().toISOString();
        return {
            id: "test-job-1",
            status: "waiting",
            phase: "submitted",
            phaseAt: now,
            createdAt: now,
            submittedAt: now,
            heartbeatAt: now,
            cwd: "/tmp",
            projectId: "proj-1",
            sessionId: "sess-1",
            requestSource: "command" as const,
            chatModelFamily: "pro" as const,
            artifactPaths: [],
            archivePath: "/tmp/archive.tar.zst",
            archiveDeletedAfterUpload: false,
            promptPath: "/tmp/prompt.md",
            workerLogPath: "/tmp/worker.log",
            runtimeId: "rt-1",
            runtimeSessionName: "oracle-1",
            runtimeProfileDir: "/tmp/profile",
            config: {} as OracleJob["config"],
            logsDir: "/tmp/logs",
            ...overrides,
        };
    }

    it("returns undefined for non-active job", () => {
        const job = makeJob({ status: "complete" });
        expect(getStaleOracleJobReason(job)).toBeUndefined();
    });

    it("returns undefined for active job with no workerPid (within grace)", () => {
        const job = makeJob({
            status: "waiting",
            workerPid: undefined,
            heartbeatAt: new Date().toISOString(),
        });
        expect(getStaleOracleJobReason(job)).toBeUndefined();
    });

    it("detects missing worker PID after grace period", () => {
        const oldTime = new Date(Date.now() - 4 * 60 * 1000).toISOString(); // 4 min ago
        const job = makeJob({
            status: "waiting",
            workerPid: undefined,
            heartbeatAt: oldTime,
        });
        const reason = getStaleOracleJobReason(job);
        expect(reason).toBeDefined();
        expect(reason).toContain("no worker PID");
    });

    it("detects dead PID (no process)", () => {
        // Use PID -1 which should never be alive
        const job = makeJob({
            status: "waiting",
            workerPid: -1,
            heartbeatAt: new Date().toISOString(),
        });
        const reason = getStaleOracleJobReason(job);
        expect(reason).toBeDefined();
        expect(reason).toContain("no longer running");
    });
});
