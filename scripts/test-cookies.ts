/**
 * Quick test script to verify sweet-cookie integration
 * 
 * Usage:
 *   bun run scripts/test-cookies.ts
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readChatGPTCookies, filterImportableAuthCookies } from "../extensions/oracle/lib/cookies";

const BRAVE_PROFILE = join(
	homedir(),
	"Library",
	"Application Support",
	"BraveSoftware",
	"Brave-Browser",
	"Default",
);

async function testCookieReading() {
	console.log("🧪 Testing sweet-cookie integration\n");

	console.log("Test 1: Read cookies from Brave");
	console.log("─".repeat(50));
	
	try {
		const result = await readChatGPTCookies({
			profilePath: BRAVE_PROFILE,
		});

		console.log(`✅ Read successful`);
		console.log(`   Total auth cookies: ${result.cookies.length}`);
		console.log(`   Session token: ${result.hasSessionToken ? "✅" : "❌"}`);
		console.log(`   Account cookie: ${result.hasAccount ? "✅" : "❌"}`);
		console.log(`   Dropped: ${result.dropped.length}`);
		console.log(`   Warnings: ${result.warnings.length > 0 ? result.warnings.join(", ") : "none"}`);

		if (result.hasSessionToken) {
			const sessionToken = result.cookies.find(c => 
				c.name.startsWith("__Secure-next-auth.session-token")
			);
			console.log(`   Session token preview: ${sessionToken?.value.slice(0, 30)}...`);
		}

		console.log("\n✅ Test 1 passed\n");
		return true;
	} catch (error) {
		console.error(`❌ Test 1 failed: ${(error as Error).message}\n`);
		return false;
	}
}

async function testCookieFiltering() {
	console.log("Test 2: Cookie filtering");
	console.log("─".repeat(50));

	const mockCookies = [
		{ name: "__Secure-next-auth.session-token", value: "abc123", domain: "chatgpt.com", path: "/" },
		{ name: "_account", value: "user123", domain: "chatgpt.com", path: "/" },
		{ name: "_ga", value: "GA1.1.123", domain: "chatgpt.com", path: "/" },
		{ name: "marketing_consent", value: "true", domain: "chatgpt.com", path: "/" },
		{ name: "oai-did", value: "device123", domain: "openai.com", path: "/" },
		{ name: "__cf_bm", value: "bot-mgmt", domain: "chatgpt.com", path: "/" },
	];

	const filtered = filterImportableAuthCookies(mockCookies);

	console.log(`Input cookies: ${mockCookies.length}`);
	console.log(`Auth cookies: ${filtered.cookies.length}`);
	console.log(`Dropped: ${filtered.dropped.length}`);

	const expectedAuth = 3; // session-token, _account, oai-did
	const expectedDropped = 3; // _ga, marketing_consent, __cf_bm

	if (filtered.cookies.length === expectedAuth && filtered.dropped.length === expectedDropped) {
		console.log("✅ Filtering logic correct");
		
		console.log("\nKept cookies:");
		filtered.cookies.forEach(c => console.log(`   ✅ ${c.name}`));
		
		console.log("\nDropped cookies:");
		filtered.dropped.forEach(({ cookie, reason }) => 
			console.log(`   🗑️  ${cookie.name} (${reason})`)
		);
		
		console.log("\n✅ Test 2 passed\n");
		return true;
	} else {
		console.error(`❌ Expected ${expectedAuth} auth, ${expectedDropped} dropped`);
		console.error(`   Got ${filtered.cookies.length} auth, ${filtered.dropped.length} dropped\n`);
		return false;
	}
}

async function testCookieStructure() {
	console.log("Test 3: Cookie structure validation");
	console.log("─".repeat(50));

	try {
		const result = await readChatGPTCookies({
			profilePath: BRAVE_PROFILE,
		});

		if (result.cookies.length === 0) {
			console.log("⚠️  No cookies found (may not be logged in)");
			console.log("✅ Test 3 passed (skipped)\n");
			return true;
		}

		const firstCookie = result.cookies[0];
		const requiredFields = ["name", "value", "domain", "path"];
		const missingFields = requiredFields.filter(field => !(field in firstCookie));

		if (missingFields.length > 0) {
			console.error(`❌ Missing fields: ${missingFields.join(", ")}\n`);
			return false;
		}

		console.log("Cookie structure:");
		console.log(`   name: ${firstCookie.name}`);
		console.log(`   value: ${firstCookie.value.slice(0, 20)}... (${firstCookie.value.length} chars)`);
		console.log(`   domain: ${firstCookie.domain}`);
		console.log(`   path: ${firstCookie.path}`);
		console.log(`   secure: ${firstCookie.secure ?? "undefined"}`);
		console.log(`   httpOnly: ${firstCookie.httpOnly ?? "undefined"}`);

		console.log("\n✅ Test 3 passed\n");
		return true;
	} catch (error) {
		console.error(`❌ Test 3 failed: ${(error as Error).message}\n`);
		return false;
	}
}

async function main() {
	console.log("🔬 Sweet-Cookie Integration Tests");
	console.log("═".repeat(50));
	console.log(`Profile: ${BRAVE_PROFILE}`);
	console.log("═".repeat(50));
	console.log();

	const results = await Promise.all([
		testCookieReading(),
		testCookieFiltering(),
		testCookieStructure(),
	]);

	const passed = results.filter(r => r).length;
	const total = results.length;

	console.log("═".repeat(50));
	console.log(`Results: ${passed}/${total} tests passed`);
	console.log("═".repeat(50));

	if (passed === total) {
		console.log("\n🎉 All tests passed!");
		process.exit(0);
	} else {
		console.log("\n❌ Some tests failed");
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("❌ Unexpected error:", error);
	process.exit(1);
});
