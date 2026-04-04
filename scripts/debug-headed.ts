/**
 * Debug script – reads ChatGPT session cookies from Brave using sweet-cookie
 *
 * Usage:
 *   bun run scripts/debug-headed.ts
 */
import { join } from "node:path";
import { rm } from "node:fs/promises";
import * as browser from "../extensions/oracle/lib/browser";
import { readChatGPTCookies, type Cookie } from "../extensions/oracle/lib/cookies";
import { resolveBrowserPath } from "../extensions/oracle/lib/browser-detection";
import { getCookiePath } from "../extensions/oracle/lib/cookie-paths";

const CHATGPT_URL = "https://chatgpt.com/";

const detectedBrowser = resolveBrowserPath();
const EXECUTABLE = detectedBrowser.source !== "fallback" ? detectedBrowser.executablePath : undefined;
const BRAVE_PROFILE = getCookiePath(detectedBrowser.name === "brave" ? "brave" : "chrome") ?? "";

const USER_DATA_DIR = join("/tmp", "pi-oracle-debug-profile");

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	console.log("🔍 Debug Headed Browser (ChatGPT via sweet-cookie - NO CDP!)");
	console.log(`   Executable: ${EXECUTABLE}`);
	console.log(`   Profile:    ${BRAVE_PROFILE}`);
	console.log("");

	// Step 1: Read cookies using sweet-cookie
	console.log("🍪 Reading ChatGPT cookies from Brave (real-time, no CDP)...");
	
	const cookieResult = await readChatGPTCookies({
		profilePath: BRAVE_PROFILE,
		chatUrl: CHATGPT_URL,
	});

	console.log(`   ✅ Found ${cookieResult.cookies.length} auth cookies`);
	
	if (cookieResult.warnings.length > 0) {
		console.log(`   ⚠️  Warnings: ${cookieResult.warnings.join(" | ")}`);
	}

	console.log(`   🔑 Session token: ${cookieResult.hasSessionToken ? "✅" : "❌"}`);
	console.log(`   👤 Account cookie: ${cookieResult.hasAccount ? "✅" : "❌"}`);

	if (!cookieResult.hasSessionToken) {
		console.log("\n⚠️  No session token found. Make sure you're logged into ChatGPT in Brave.");
		return;
	}

	// Step 2: Launch browser
	console.log("\n🚀 Launching browser with isolated profile...");
	await rm(USER_DATA_DIR, { recursive: true, force: true }).catch(() => undefined);

	await browser.launch({
		userDataDir: USER_DATA_DIR,
		executablePath: EXECUTABLE,
		headless: false,
		args: [
			"--disable-blink-features=AutomationControlled",
			"--no-first-run",
			"--no-default-browser-check",
		],
	});

	// Step 3: Inject cookies BEFORE navigation
	console.log("🔑 Injecting cookies BEFORE navigation...");
	
	const validCookies = cookieResult.cookies.filter((c: Cookie) => {
		if (!c.name || !c.value) return false;
		return true;
	});

	await browser.cookiesSet(validCookies as any);
	console.log(`   ✅ Injected ${validCookies.length} cookies`);

	// Step 4: Navigate to ChatGPT
	console.log(`\n📂 Opening ${CHATGPT_URL}...`);
	await browser.open(CHATGPT_URL);

	console.log("   ⏳ Waiting for page to load...");
	await new Promise((r) => setTimeout(r, 8000));

	const currentUrl = await browser.getUrl();
	console.log(`   Current URL: ${currentUrl}`);

	// Step 5: Analyze page state
	console.log("\n📸 Analyzing page state...");
	const snapshot = await browser.snapshotText();
	const lines = snapshot.split("\n");
	console.log(`   Found ${lines.length} interactive elements`);

	// DETECT LOGIN STATE - Key indicators
	const hasLoginElements = /Iniciar sesión|Log in|Sign in|Iniciar sesión con/i.test(snapshot);
	const hasNewChat = /Nuevo chat|New chat/i.test(snapshot);
	const hasLibrary = /Biblioteca|Library/i.test(snapshot);
	const hasImages = /Imágenes|Images/i.test(snapshot);
	const hasApps = /Aplicaciones|Apps/i.test(snapshot);
	const hasProfileButton = /menú de perfil|profile menu|Perfil|Profile/i.test(snapshot);
	
	// Logged in indicators (sidebar + no login elements)
	const isLoggedIn = hasNewChat && hasLibrary && !hasLoginElements;
	
	// Check for composer
	const hasComposerInput = lines.some(l => 
		l.includes('textbox') && (l.toLowerCase().includes('chat') || l.includes('Message'))
	);

	console.log("\n📊 LOGIN STATE DETECTION:");
	console.log(`   ├─ Login page: ${hasLoginElements ? "✅ YES" : "❌ NO"}`);
	console.log(`   ├─ New Chat button: ${hasNewChat ? "✅ YES" : "❌ NO"}`);
	console.log(`   ├─ Library: ${hasLibrary ? "✅ YES" : "❌ NO"}`);
	console.log(`   ├─ Images: ${hasImages ? "✅ YES" : "❌ NO"}`);
	console.log(`   ├─ Apps: ${hasApps ? "✅ YES" : "❌ NO"}`);
	console.log(`   ├─ Profile button: ${hasProfileButton ? "✅ YES" : "❌ NO"}`);
	console.log(`   └─ AUTHENTICATED: ${isLoggedIn ? "✅ YES" : "❌ NO"}`);

	if (isLoggedIn) {
		console.log("\n✅ ✅ ✅ YOU'RE LOGGED IN! ✅ ✅ ✅");
		console.log("   The cookies were successfully injected.");
		console.log("   ChatGPT is ready to use!");
	} else if (hasLoginElements) {
		console.log("\n⚠️  REDIRECTED TO LOGIN PAGE");
		console.log("   Cookies were rejected. Possible causes:");
		console.log("   - cf_clearance tied to Brave's IP");
		console.log("   - Session expired");
		console.log("   - ChatGPT detected new browser");
	} else {
		console.log("\n⚠️  UNKNOWN STATE");
		console.log("   Showing first 20 elements:");
		lines.slice(0, 20).forEach((line) => console.log(`   ${line}`));
	}

	// Interactive mode
	console.log("\n✅ Browser is open. Press ENTER to close.\n");
	await new Promise<void>((resolve) => {
		process.stdin.setEncoding("utf8");
		process.stdin.once("data", () => resolve());
	});

	console.log("\n🧹 Closing...");
	await browser.close();
	await rm(USER_DATA_DIR, { recursive: true, force: true }).catch(() => undefined);
	console.log("✅ Done");
}

main().catch((error) => {
	console.error("❌ Error:", error.message);
	process.exit(1);
});
