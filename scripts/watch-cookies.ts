/**
 * Real-time cookie watcher
 * Monitors Brave cookies and syncs them to an isolated browser
 * 
 * This demonstrates sweet-cookie's ability to read cookies while the browser is running
 * 
 * Usage:
 *   bun run scripts/watch-cookies.ts
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readChatGPTCookies } from "../extensions/oracle/lib/cookies";

const BRAVE_PROFILE = join(
	homedir(),
	"Library",
	"Application Support",
	"BraveSoftware",
	"Brave-Browser",
	"Default",
);

const CHATGPT_URL = "https://chatgpt.com/";
const WATCH_INTERVAL_MS = 5000; // Check every 5 seconds

interface CookieSnapshot {
	timestamp: Date;
	count: number;
	hasSessionToken: boolean;
	hasAccount: boolean;
	sessionTokenValue?: string;
}

let previousSnapshot: CookieSnapshot | null = null;
let watchCount = 0;

async function takeCookieSnapshot(): Promise<CookieSnapshot> {
	const result = await readChatGPTCookies({
		profilePath: BRAVE_PROFILE,
		chatUrl: CHATGPT_URL,
	});

	// Find session token for comparison
	const sessionToken = result.cookies.find((c) =>
		c.name.startsWith("__Secure-next-auth.session-token")
	);

	return {
		timestamp: new Date(),
		count: result.cookies.length,
		hasSessionToken: result.hasSessionToken,
		hasAccount: result.hasAccount,
		sessionTokenValue: sessionToken?.value.slice(0, 20),
	};
}

function hasChanged(prev: CookieSnapshot | null, current: CookieSnapshot): boolean {
	if (!prev) return true;
	
	return (
		prev.count !== current.count ||
		prev.hasSessionToken !== current.hasSessionToken ||
		prev.hasAccount !== current.hasAccount ||
		prev.sessionTokenValue !== current.sessionTokenValue
	);
}

function formatSnapshot(snapshot: CookieSnapshot): string {
	const time = snapshot.timestamp.toLocaleTimeString();
	const status = snapshot.hasSessionToken ? "🟢 Logged in" : "🔴 Not logged in";
	return `[${time}] ${status} | ${snapshot.count} cookies | Session: ${snapshot.sessionTokenValue}...`;
}

async function watchCookies() {
	console.log("👁️  Real-time Cookie Watcher");
	console.log(`   Watching: ${BRAVE_PROFILE}`);
	console.log(`   Interval: ${WATCH_INTERVAL_MS}ms`);
	console.log(`   Press Ctrl+C to stop\n`);

	while (true) {
		try {
			watchCount++;
			const snapshot = await takeCookieSnapshot();

			if (hasChanged(previousSnapshot, snapshot)) {
				console.log(`\n🔄 Change detected (#${watchCount})`);
				console.log(`   ${formatSnapshot(snapshot)}`);
				
				if (previousSnapshot) {
					if (snapshot.count !== previousSnapshot.count) {
						const diff = snapshot.count - previousSnapshot.count;
						console.log(`   📊 Cookie count: ${previousSnapshot.count} → ${snapshot.count} (${diff > 0 ? '+' : ''}${diff})`);
					}
					
					if (snapshot.hasSessionToken !== previousSnapshot.hasSessionToken) {
						console.log(`   ${snapshot.hasSessionToken ? '✅ Session token appeared!' : '❌ Session token disappeared!'}`);
					}
				}
			} else {
				// No changes, just show a dot
				process.stdout.write(".");
			}

			previousSnapshot = snapshot;
		} catch (error) {
			console.error(`\n❌ Error reading cookies: ${(error as Error).message}`);
		}

		await new Promise((resolve) => setTimeout(resolve, WATCH_INTERVAL_MS));
	}
}

async function main() {
	// Take initial snapshot
	console.log("📸 Taking initial snapshot...");
	const initial = await takeCookieSnapshot();
	console.log(`   ${formatSnapshot(initial)}\n`);
	previousSnapshot = initial;

	console.log("💡 Tips:");
	console.log("   - Keep this running while using Brave");
	console.log("   - Log in/out of ChatGPT to see changes");
	console.log("   - Open new tabs to see cookie updates");
	console.log("   - All happens WITHOUT CDP!\n");

	// Start watching
	await watchCookies();
}

main().catch((error) => {
	console.error("❌ Error:", error.message);
	process.exit(1);
});
