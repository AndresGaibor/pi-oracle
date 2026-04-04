/**
 * ChatGPT Selectors – all locators and labels in one place.
 * When ChatGPT UI changes, update this file only.
 */

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

export const CHATGPT_URLS = {
	chat: "https://chatgpt.com/",
	auth: "https://chatgpt.com/auth/login",
	api: {
		me: "/backend-api/me",
		conversations: "/backend-api/conversations",
		moderation: "/backend-api/moderation",
	},
} as const;

// ---------------------------------------------------------------------------
// CSS Selectors – ordered by priority (most specific first)
// ---------------------------------------------------------------------------

export const CHATGPT_SELECTORS = {
	composer: [
		'textarea[data-id="root"]',
		"#prompt-textarea",
		'textarea[id*="prompt"]',
		'[data-id*="composer"]',
		'[contenteditable="true"]',
	] as const,

	sendButton: [
		'[data-testid="send-button"]',
		'button[aria-label*="Send"]',
		'button[aria-label*="Enviar"]',
		'button[type="submit"]',
	] as const,

	addFiles: [
		'[data-testid="attachments-button"]',
		'button[aria-label*="Add files"]',
		'button[aria-label*="Agregar archivos"]',
	] as const,

	modelSelector: [
		'[data-testid="model-selector"]',
		'button[id*="model"]',
	] as const,

	stopButton: [
		'[data-testid="stop-button"]',
		'button[aria-label*="Stop"]',
		'button[aria-label*="Detener"]',
	] as const,

	closeButton: [
		'button[aria-label*="Close"]',
		'button[aria-label*="Cerrar"]',
	] as const,

	responseMessage: [
		'[data-message-author-role="assistant"][data-turn-start-message="true"]',
		'[data-message-author-role="assistant"]',
	] as const,

	fileUploadInput: [
		'input[type="file"]',
	] as const,

	loginButton: [
		'button[data-testid*="login"]',
		'button[data-testid*="log-in"]',
		'button[type="submit"]',
	] as const,

	loginLink: [
		'a[href*="/auth/login"]',
		'a[href*="/auth/signin"]',
	] as const,
} as const;

// ---------------------------------------------------------------------------
// Text labels – for snapshot-based matching (multilingual)
// ---------------------------------------------------------------------------

export const CHATGPT_LABELS = {
	composer: [
		"Chat with ChatGPT",
		"Chatear con ChatGPT",
		"Pregunta lo que quieras",
		"Message ChatGPT",
		"Escribe un mensaje",
	] as const,

	send: [
		"Send prompt",
		"Send message",
		"Enviar prompt",
		"Enviar mensaje",
		"Enviar",
		"Send",
	] as const,

	addFiles: [
		"Add files and more",
		"Agregar archivos y más",
		"Add files",
		"Subir archivos",
		"Adjuntar archivos",
	] as const,

	modelSelector: [
		"Model selector",
		"Selector de modelo",
	] as const,

	close: [
		"Close",
		"Cerrar",
	] as const,

	stop: [
		"Stop streaming",
		"Stop generating",
		"Detener la transmisión",
		"Detener generacion",
		"Detener",
	] as const,

	copyResponse: [
		"Copy response",
		"Copiar respuesta",
	] as const,

	configure: [
		"Configure...",
		"Configurar...",
	] as const,

	autoSwitchToThinking: [
		"Auto-switch to Thinking",
		"Cambio automático a Thinking",
		"Cambio automático a Pensando",
	] as const,

	login: [
		"Log in",
		"Sign up",
		"Iniciar sesión",
		"Registrate",
	] as const,
} as const;

// ---------------------------------------------------------------------------
// Model families and effort labels
// ---------------------------------------------------------------------------

export const MODEL_FAMILY_PREFIX: Record<string, string> = {
	instant: "Instant ",
	thinking: "Thinking ",
	pro: "Pro ",
} as const;

export const EFFORT_LABELS: Record<string, readonly string[]> = {
	light: ["Light", "Ligero"],
	standard: ["Standard", "Estándar", "Ampliado", "Razonamiento ampliado"],
	extended: ["Extended", "Extendido"],
	heavy: ["Heavy", "Alto"],
} as const;

// ---------------------------------------------------------------------------
// Helper: check if a label matches any candidate
// ---------------------------------------------------------------------------

export function labelMatches(actual: string | undefined, candidates: readonly string[]): boolean {
	if (!actual) return false;
	const normalized = actual.toLowerCase().trim();
	return candidates.some((c) => normalized.includes(c.toLowerCase()));
}
