// pages/chatgpt/chatgpt-auth.page.ts - ChatGPT Authentication Page Object
import { BasePage } from "../base.page.js";
import { CHATGPT, labelMatches } from "./chatgpt-selectors.js";

export class ChatGPTAuthPage extends BasePage {
	// ---- Session Probe ----
	async probeSession(): Promise<{
		authenticated: boolean;
		email?: string;
		plan?: string;
	}> {
		const result = await this.evaluateCode(`
      try {
        const response = await fetch('/backend-api/me', {
          cache: 'no-store',
          credentials: 'include',
        });
        if (!response.ok) return JSON.stringify({ authenticated: false, status: response.status });
        const data = await response.json();
        return JSON.stringify({
          authenticated: true,
          email: data.accounts?.[0]?.email || data.email || undefined,
          plan: data.accounts?.[0]?.entitlement?.subscription_plan || data.plan || 'free',
        });
      } catch (e) {
        return JSON.stringify({ authenticated: false, error: e.message });
      }
    `);

		try {
			return JSON.parse(String(result));
		} catch {
			return { authenticated: false };
		}
	}

	// ---- Login with Cookies ----
	async loginWithCookies(braveProfileDir?: string): Promise<boolean> {
		const profile =
			braveProfileDir ||
			`${process.env.HOME}/Library/Application Support/BraveSoftware/Brave-Browser/Default`;
		const cookieDb = `${profile}/Cookies`;

		// 1. Read cookies
		console.log("  Reading cookies from Brave...");

		try {
			// Dynamic import to avoid issues when not in browser context
			const { readChromeCookies } = await import("@steipete/sweet-cookie");
			const rawCookies = await readChromeCookies(cookieDb);
			console.log(`  ${rawCookies.length} total cookies`);

			// 2. Normalize and filter
			const { normalizeImportedCookie, filterImportableAuthCookies } =
				await import("../../worker/auth-cookie-policy.js");
			const normalized = rawCookies.map(normalizeImportedCookie);
			const filtered = filterImportableAuthCookies(normalized);
			console.log(`  ${filtered.length} auth cookies`);

			if (filtered.length === 0) {
				console.error("  No ChatGPT cookies found.");
				console.error(
					"  Make sure you logged into Brave and close it before running.",
				);
				return false;
			}

			// 3. Navigate to domain first (needed to establish context)
			await this.navigate("https://chatgpt.com/");
			await new Promise((r) => setTimeout(r, 2000));

			// 4. Inject cookies
			console.log("  Injecting cookies...");
			await this.setCookies(filtered);

			// 5. Reload
			await this.navigate("https://chatgpt.com/");
			await new Promise((r) => setTimeout(r, 3000));

			// 6. Verify
			const session = await this.probeSession();
			return session.authenticated;
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			console.error("  Error reading cookies:", msg);
			console.error("  Make sure Brave is completely closed (Cmd+Q)");
			return false;
		}
	}

	// ---- Detect Auth Page Type ----
	async detectAuthPage(): Promise<
		"login" | "signup" | "captcha" | "mfa" | "none"
	> {
		const text = await this.getPageText();
		const lower = text.toLowerCase();

		if (lower.includes("log in") || lower.includes("iniciar sesion"))
			return "login";
		if (lower.includes("sign up") || lower.includes("registrar"))
			return "signup";
		if (lower.includes("verify") || lower.includes("challenge"))
			return "captcha";
		if (lower.includes("enter code") || lower.includes("authentication code"))
			return "mfa";
		return "none";
	}

	// Helper to set cookies in browser context
	private async setCookies(
		cookies: Array<{
			name: string;
			value: string;
			domain: string;
			path: string;
		}>,
	): Promise<void> {
		console.log(`Setting ${cookies.length} cookies...`);
		// This will be implemented by the Playwright adapter
	}

	// Helper to evaluate code in browser context
	private async evaluateCode(code: string): Promise<unknown> {
		console.log(`Evaluating: ${code.slice(0, 50)}...`);
		return undefined;
	}
}
