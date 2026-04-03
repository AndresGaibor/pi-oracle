// pages/chatgpt/chatgpt-selectors.ts - ChatGPT selectors and labels
// Centralized here to update in one place when ChatGPT changes its UI

export const CHATGPT = {
	// URLs
	URLS: {
		CHAT: "https://chatgpt.com/",
		AUTH: "https://chatgpt.com/auth/login",
		API: {
			ME: "/backend-api/me",
			CONVERSATIONS: "/backend-api/conversations",
			MODERATION: "/backend-api/moderation",
		},
	},

	// CSS Selectors (for Playwright adapter)
	SELECTORS: {
		TEXTAREA: [
			'textarea[data-id="root"]',
			"#prompt-textarea",
			'textarea[id*="prompt"]',
			"textarea",
		],
		SEND_BUTTON: [
			'[data-testid="send-button"]',
			'button[aria-label*="Send"]',
			'button[aria-label*="Enviar"]',
		],
		NEW_CHAT_BUTTON: [
			'a[href="/"]',
			'nav a[aria-label*="New chat"]',
			'nav a[aria-label*="Nuevo chat"]',
		],
		MODEL_SELECTOR: [
			'[data-testid="model-selector"]',
			'button[id*="model"]',
		],
		STOP_BUTTON: [
			'[data-testid="stop-button"]',
			'button[aria-label*="Stop"]',
			'button[aria-label*="Detener"]',
		],
		RESPONSE_CONTAINER: [
			'[data-message-author-role="assistant"]',
			".markdown",
		],
		FILE_UPLOAD_INPUT: ["input[type=\"file\"]"],
	},

	// Labels for snapshot matching (used by agent-browser and Playwright adapter)
	LABELS: {
		SEND: ["Send message", "Submit", "Enviar mensaje", "Enviar"],
		NEW_CHAT: ["New chat", "Nuevo chat", "Chatear con ChatGPT"],
		STOP: ["Stop generating", "Stop", "Detener generacion", "Detener"],
		CONTINUE: [
			"Continue generating",
			"Continue",
			"Continuar generacion",
			"Continuar",
		],
		MODEL: ["GPT-4o", "GPT-4", "GPT-3.5", "ChatGPT", "Model"],
		TEXTAREA: ["Message ChatGPT", "Escribe un mensaje", "Pregunta lo que quieras"],
		LOGIN: ["Log in", "Sign up", "Iniciar sesion", "Registrate"],
		UPGRADE: ["Upgrade", "Get Plus", "Mejorar"],
	},

	// Labels in Spanish (for ChatGPT in Spanish)
	LABELS_ES: {
		SEND: ["Enviar mensaje", "Enviar"],
		NEW_CHAT: ["Nuevo chat", "Chatear con ChatGPT"],
		STOP: ["Detener generacion", "Detener"],
		CONTINUE: ["Continuar generacion", "Continuar"],
		TEXTAREA: ["Escribe un mensaje", "Pregunta lo que quieras"],
		LOGIN: ["Iniciar sesion", "Registrate"],
	},
} as const;

// Helper: check if a label matches
export function labelMatches(actual: string, candidates: readonly string[]): boolean {
	const normalized = actual.toLowerCase().trim();
	return candidates.some((c) => normalized.includes(c.toLowerCase()));
}

// Helper: get the first selector that exists in the DOM
export async function findWorkingSelector(
	selectors: readonly string[],
	jsEval: (code: string) => Promise<unknown>,
): Promise<string | null> {
	return selectors.reduce(async (acc, sel) => {
		const prev = await acc;
		if (prev) return prev;
		const exists = await jsEval(`!!document.querySelector('${sel}')`);
		return exists ? sel : null;
	}, Promise.resolve<string | null>(null));
}
