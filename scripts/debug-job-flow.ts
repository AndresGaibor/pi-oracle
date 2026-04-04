#!/usr/bin/env bun
/**
 * Debug Job Flow Script
 * Simple entry point - all logic is in extensions/oracle/pages/chatgpt/chatgpt-job-runner.ts
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { runChatGPTJob } from "../extensions/oracle/pages/chatgpt/chatgpt-job-runner";

const BRAVE_PROFILE = join(
	homedir(),
	"Library",
	"Application Support",
	"BraveSoftware",
	"Brave-Browser",
	"Default",
);

async function main() {
	const result = await runChatGPTJob({
		profilePath: BRAVE_PROFILE,
		headless: false,
	});

	console.log("\n" + "=".repeat(60));
	console.log(`RESULT: ${result.success ? "✅ SUCCESS" : "❌ FAILED"}`);
	console.log(`MESSAGE: ${result.message}`);
	console.log("=".repeat(60) + "\n");

	process.exit(result.success ? 0 : 1);
}

main().catch((error) => {
	console.error("❌ Error:", error.message);
	process.exit(1);
});
