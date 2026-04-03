// scripts/debug-pom.ts - Verify Page Objects work
import { ChatGPTPage } from "../extensions/oracle/pages/chatgpt/chatgpt.page.js";
import { ChatGPTAuthPage } from "../extensions/oracle/pages/chatgpt/chatgpt-auth.page.js";
import { CHATGPT } from "../extensions/oracle/pages/chatgpt/chatgpt-selectors.js";

const BRAVE =
	process.env.BRAVE_PATH ||
	"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PROFILE =
	process.env.HOME +
	"/Library/Application Support/BraveSoftware/Brave-Browser/Profile Oracle";

async function main() {
	console.log("=== Debug POM ===\n");

	const auth = new ChatGPTAuthPage();
	const chat = new ChatGPTPage();
	chat.setLanguage("es");

	// 1. Test authentication
	console.log("[1] Testing authentication with Brave cookies...");
	const loggedIn = await auth.loginWithCookies(PROFILE);
	console.log(`    Result: ${loggedIn ? "AUTHENTICATED" : "FAILED"}`);

	if (!loggedIn) {
		const authPage = await auth.detectAuthPage();
		console.log(`    Auth page: ${authPage}`);
		await auth.takeScreenshot("/tmp/pom-auth-debug.png");
		console.log("    Screenshot: /tmp/pom-auth-debug.png");
		return;
	}

	// 2. Test ChatGPTPage
	console.log("\n[2] Classifying page...");
	const pageType = await chat.classifyPage();
	console.log(`    Type: ${pageType}`);

	console.log("\n[3] Diagnosing...");
	const issues = await chat.diagnose();
	if (issues.length === 0) {
		console.log("    No issues detected");
	} else {
		issues.forEach((i) => console.log(`    ⚠ ${i}`));
	}

	// 3. Test prompt sending
	console.log("\n[4] Sending test prompt...");
	try {
		await chat.startNewChat();
		await chat.sendPrompt("Respond with a single word: hello", true);

		console.log("\n[5] Waiting for response...");
		const response = await chat.waitForResponse(60_000);
		console.log(`    Response received: ${response?.slice(-200)}`);

		await chat.takeScreenshot("/tmp/pom-response-debug.png");
		console.log("    Screenshot: /tmp/pom-response-debug.png");
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		console.error("    Error:", msg);
		await chat.takeScreenshot("/tmp/pom-error-debug.png");
		console.log("    Screenshot: /tmp/pom-error-debug.png");
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
