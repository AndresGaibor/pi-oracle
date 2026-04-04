#!/usr/bin/env bun
/**
 * Debug Job Flow Script
 * Uses AIJobRunner class from lib for orchestrated job execution
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { AIJobRunner, type JobState, type JobConfig } from "../extensions/oracle/lib/ai-job-runner";

const BRAVE_PROFILE = join(
	homedir(),
	"Library",
	"Application Support",
	"BraveSoftware",
	"Brave-Browser",
	"Default",
);

// Helper: simple logger
function createLogger() {
	return async (message: string) => {
		console.log(`[LOG] ${message}`);
	};
}

// Helper: heartbeat logger
function createHeartbeat() {
	return async (patch?: unknown, options?: unknown) => {
		console.log(`[HEARTBEAT] ${new Date().toISOString()}`);
	};
}

async function main() {
	try {
		// Create runtime directories
		const runtimeProfileDir = "/tmp/pi-oracle-debug-profile";
		const jobDir = `/tmp/oracle-debug-job-${Date.now()}`;
		await mkdir(runtimeProfileDir, { recursive: true });
		await mkdir(jobDir, { recursive: true });

		// Build minimal JobConfig
		const config: JobConfig = {
			browser: {
				executablePath: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
				chatUrl: "https://chatgpt.com/",
				authSeedProfileDir: BRAVE_PROFILE,
				runtimeProfilesDir: "/tmp",
				runMode: "headed",
				cloneStrategy: "copy",
				maxConcurrentJobs: 1,
				sessionPrefix: "debug",
			},
			worker: {
				pollMs: 500,
				completionTimeoutMs: 120_000,
			},
			artifacts: {
				capture: false,
			},
		};

		// Build JobState
		const job: JobState = {
			id: `debug-${Date.now()}`,
			status: "running",
			promptPath: `${jobDir}/prompt.txt`,
			responsePath: `${jobDir}/response.txt`,
			runtimeProfileDir,
			runtimeSessionName: "debug",
			config,
		};

		console.log("\n" + "=".repeat(60));
		console.log("🚀 AI Job Runner (Class-Based)");
		console.log("=".repeat(60));
		console.log(`Job ID: ${job.id}`);
		console.log(`Chat URL: ${config.browser.chatUrl}`);
		console.log(`Profile: ${runtimeProfileDir}`);
		console.log("=".repeat(60) + "\n");

		// Instantiate runner with dependency injection
		const runner = new AIJobRunner(
			job,
			createLogger(),
			createHeartbeat(),
		);

		// Execute workflow
		console.log("📝 Phase 1: Launching browser...");
		await runner.launchBrowser(config.browser.chatUrl);
		console.log("✅ Browser launched\n");

		console.log("📝 Phase 2: Verifying authentication...");
		await runner.verifyAuth();
		console.log("✅ Authentication verified\n");

		console.log("📝 Phase 3: Sending test prompt...");
		const testPrompt = "Write a haiku about debugging";
		const { baselineAssistantCount } = await runner.sendPrompt(testPrompt);
		console.log(`✅ Prompt sent (baseline: ${baselineAssistantCount} messages)\n`);

		console.log("📝 Phase 4: Waiting for chat completion...");
		const { responseText, responseIndex } = await runner.waitForChatCompletion(baselineAssistantCount);
		console.log(`✅ Response received (index: ${responseIndex})`);
		console.log(`   Preview: ${responseText.slice(0, 100)}...\n`);

		console.log("📝 Phase 5: Downloading artifacts...");
		const artifacts = await runner.downloadArtifacts(responseIndex);
		console.log(`✅ Downloaded ${artifacts.length} artifact(s)\n`);

		console.log("📝 Phase 6: Closing browser...");
		await runner.closeBrowser();
		console.log("✅ Browser closed\n");

		console.log("=".repeat(60));
		console.log("✅ SUCCESS - All phases completed");
		console.log("=".repeat(60) + "\n");
		process.exit(0);
	} catch (error) {
		console.error("\n" + "=".repeat(60));
		console.error("❌ ERROR");
		console.error(`Message: ${(error as Error).message}`);
		console.error(`Stack: ${(error as Error).stack}`);
		console.error("=".repeat(60) + "\n");
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("❌ Unexpected error:", error.message);
	process.exit(1);
});
