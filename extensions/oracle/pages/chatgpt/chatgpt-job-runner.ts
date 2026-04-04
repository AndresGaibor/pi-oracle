/**
 * ChatGPT Job Runner - Complete workflow for running jobs in ChatGPT
 * This is ChatGPT-specific logic, belongs in pages/chatgpt/
 */
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import * as browser from "../../lib/browser";
import { ChatGPTPage } from "./chatgpt.page";
import * as chatgptAssertions from "./chatgpt.assertions";
import { readChatGPTCookies, type Cookie } from "../../lib/cookies";

// ---------------------------------------------------------------------------
// Config - ChatGPT-specific
// ---------------------------------------------------------------------------

export interface ChatGPTJobRunnerConfig {
	executablePath?: string;
	profilePath: string;
	chatUrl?: string;
	testPrompt?: string;
	headless?: boolean;
}

const DEFAULT_CONFIG: ChatGPTJobRunnerConfig = {
	executablePath: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
	chatUrl: "https://chatgpt.com/",
	testPrompt: "Write a haiku about debugging",
	headless: false,
};

// ---------------------------------------------------------------------------
// BrowserActions adapter
// ---------------------------------------------------------------------------

function createBrowserActions() {
	return {
		snapshotText: (pageId?: string) => browser.snapshotText(pageId),
		pageText: (pageId?: string) => browser.pageText(pageId),
		evaluate: (pageId: string, script: string) => browser.evaluate(pageId, script),
		clickRef: (ref: string, pageIdHint?: string) => browser.clickRef(ref, pageIdHint),
		fill: (ref: string, text: string, pageIdHint?: string) => browser.fill(ref, text, pageIdHint),
		screenshot: (dest: string, pageId?: string) => browser.screenshot(dest, pageId),
		getMainPageId: () => browser.getMainPageId(),
		cookiesSet: (cookies: any[]) => browser.cookiesSet(cookies),
		open: (url: string) => browser.open(url),
		isConnected: () => browser.isConnected(),
		launch: (opts: any) => browser.launch(opts),
		close: () => browser.close(),
	};
}

type BrowserActions = ReturnType<typeof createBrowserActions>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Main Job Runner
// ---------------------------------------------------------------------------

export async function runChatGPTJob(
	config?: Partial<ChatGPTJobRunnerConfig>,
): Promise<{
	success: boolean;
	message: string;
	cookies?: Cookie[];
	messages?: Array<{ text: string }>;
}> {
	const cfg = { ...DEFAULT_CONFIG, ...config };

	// Determine executable
	const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
	const EXECUTABLE = existsSync(cfg.executablePath!) ? cfg.executablePath! : CHROME_PATH;

	const USER_DATA_DIR = "/tmp/pi-oracle-job-profile";

	console.log("🚀 ChatGPT Job Runner");
	console.log(`   Executable: ${EXECUTABLE}`);
	console.log(`   Profile: ${cfg.profilePath}`);
	console.log(`   Chat URL: ${cfg.chatUrl}`);

	// Step 1: Read cookies
	console.log("\n📝 Step 1: Reading cookies from Brave...");

	const cookieResult = await readChatGPTCookies({
		profilePath: cfg.profilePath!,
		chatUrl: cfg.chatUrl,
	});

	console.log(`   ✅ Found ${cookieResult.cookies.length} auth cookies`);
	console.log(`   🔑 Session token: ${cookieResult.hasSessionToken ? "✅" : "❌"}`);

	if (!cookieResult.hasSessionToken) {
		return {
			success: false,
			message: "No session token found. Please login to ChatGPT in Brave first.",
		};
	}

	// Step 2: Launch browser
	console.log("\n📝 Step 2: Launching browser...");
	await rm(USER_DATA_DIR, { recursive: true, force: true }).catch(() => undefined);

	await browser.launch({
		userDataDir: USER_DATA_DIR,
		executablePath: EXECUTABLE,
		headless: cfg.headless ?? false,
		args: [
			"--disable-blink-features=AutomationControlled",
			"--no-first-run",
			"--no-default-browser-check",
		],
	});

	console.log(`   ✅ Browser launched`);

	// Step 3: Inject cookies
	console.log("\n📝 Step 3: Injecting cookies...");

	const validCookies = cookieResult.cookies.filter((c: Cookie) => c.name && c.value);
	await browser.cookiesSet(validCookies as any);
	console.log(`   ✅ Injected ${validCookies.length} cookies`);

	// Step 4: Navigate to ChatGPT
	console.log("\n📝 Step 4: Navigating to ChatGPT...");
	await browser.open(cfg.chatUrl!);
	await sleep(3000);

	// Step 5: Detect login state
	console.log("\n📝 Step 5: Detecting login state...");
	
	const snapshot = await browser.snapshotText();
	const lines = snapshot.split("\n");

	const hasLogin = /Iniciar sesión|Log in|Sign in/i.test(snapshot);
	const hasSidebar = /Nuevo chat|New chat/i.test(snapshot);
	const isLoggedIn = hasSidebar && !hasLogin;

	console.log(`   🔐 Logged in: ${isLoggedIn ? "✅" : "❌"}`);

	if (!isLoggedIn) {
		await browser.close();
		await rm(USER_DATA_DIR, { recursive: true, force: true }).catch(() => undefined);
		return {
			success: false,
			message: "Not logged in. Cookies may have expired.",
			cookies: cookieResult.cookies,
		};
	}

	// Step 6: Activate composer by clicking "Nuevo chat"
	console.log("\n📝 Step 6: Activating composer...");

	const newChatMatch = lines.find(l => l.includes('"Nuevo chat"'));
	if (newChatMatch) {
		const refMatch = newChatMatch.match(/ref=(e\d+)/);
		if (refMatch) {
			console.log(`   🎯 Clicking 'Nuevo chat' (ref=${refMatch[1]})...`);
			await browser.clickRef(refMatch[1]);
			await sleep(2000);
		}
	}

	// Step 7: Wait for composer to be ready
	console.log("\n📝 Step 7: Waiting for composer to be ready...");

	let composerReady = false;
	for (let i = 0; i < 15; i++) {
		const snap = await browser.snapshotText();
		if (chatgptAssertions.hasComposer(snap)) {
			composerReady = true;
			console.log(`   ✅ Composer ready (attempt ${i + 1})`);
			break;
		}
		console.log(`   ⏳ Waiting... (${i + 1}/15)`);
		await sleep(1000);
	}

	if (!composerReady) {
		await browser.close();
		await rm(USER_DATA_DIR, { recursive: true, force: true }).catch(() => undefined);
		return {
			success: false,
			message: "Composer never became ready",
			cookies: cookieResult.cookies,
		};
	}

	// Step 8: Type the prompt
	console.log(`\n📝 Step 8: Typing prompt: "${cfg.testPrompt}"`);

	const browserActions = createBrowserActions();
	const chatGPT = new ChatGPTPage(cfg.chatUrl!);

	try {
		await chatGPT.typePrompt(browserActions, cfg.testPrompt!);
		console.log(`   ✅ Prompt typed`);
	} catch (err) {
		console.log(`   ❌ Error typing prompt: ${(err as Error).message}`);
	}

	await sleep(1000);

	// Step 9: Send the message
	console.log("\n📝 Step 9: Sending message...");

	try {
		await chatGPT.clickSend(browserActions);
		console.log(`   ✅ Message sent`);
	} catch (err) {
		console.log(`   ❌ Error sending: ${(err as Error).message}`);
	}

	await sleep(3000);

	// Step 10: Wait for response
	console.log("\n📝 Step 10: Waiting for response...");
	await sleep(5000);

	const responseSnapshot = await browser.snapshotText();
	const isComplete = chatgptAssertions.isResponseComplete(responseSnapshot);
	const hasStop = chatgptAssertions.hasStopButton(responseSnapshot);

	console.log(`   📝 Response complete: ${isComplete ? "✅" : "❌"}`);
	console.log(`   ⏹️  Stop button visible: ${hasStop ? "✅" : "❌"}`);

	// Step 11: Get messages
	console.log("\n📝 Step 11: Extracting messages...");

	const messages = await chatGPT.getAssistantMessages(browserActions);

	if (messages.length > 0) {
		const last = messages[messages.length - 1];
		const preview = last.text.slice(0, 100);
		console.log(`   💬 Got ${messages.length} message(s)`);
		console.log(`   Preview: ${preview}...`);
	} else {
		console.log(`   ⚠️ No messages found`);
	}

	// Cleanup
	console.log("\n📝 Step 12: Cleaning up...");
	await browser.close();
	await rm(USER_DATA_DIR, { recursive: true, force: true }).catch(() => undefined);
	console.log(`   ✅ Done`);

	return {
		success: true,
		message: `Job complete. ${messages.length} message(s) received.`,
		cookies: cookieResult.cookies,
		messages,
	};
}

export default { runChatGPTJob };
