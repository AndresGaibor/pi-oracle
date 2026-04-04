/**
 * ChatGPT Selectors – all locators and labels in one place.
 * When ChatGPT UI changes, update this file only.
 */

// =============================================================================
// SELECTORES data-testid (PRIORITARIOS, ESTABLES)
// Estos son los selectores principales. Usar siempre estos cuando sea posible.
// Los data-testid son mantenidos por los ingenieros de OpenAI para sus tests
// internos y son la superficie de selección más confiable.
// =============================================================================

export const CHATGPT_TESTIDS = {
	// --- Navegación ---
	NEW_CHAT_BUTTON: 'create-new-chat-button',
	MODEL_SWITCHER: 'model-switcher-dropdown-button',
	SHARE_CHAT: 'share-chat-button',
	CONVERSATION_OPTIONS: 'conversation-options-button',
	CLOSE_SIDEBAR: 'close-sidebar-button',
	PROFILE_BUTTON: 'accounts-profile-button',

	// --- Composer ---
	COMPOSER_PLUS_BTN: 'composer-plus-btn',
	SEND_BUTTON: 'send-button',
	STOP_BUTTON: 'stop-button',

	// --- Mensajes ---
	COPY_TURN_ACTION: 'copy-turn-action-button',
	GOOD_RESPONSE: 'good-response-turn-action-button',
	BAD_RESPONSE: 'bad-response-turn-action-button',
} as const;

// =============================================================================
// SELECTORES por atributos semánticos
// Atributos HTML que OpenAI mantiene por razones de accesibilidad (a11y).
// =============================================================================

export const CHATGPT_SEMANTIC_SELECTORS = {
	// --- Estructura ---
	PROMPT_TEXTAREA: '#prompt-textarea',
	THREAD: '#thread',
	HISTORY_CONTAINER: '#history',

	// --- Mensajes ---
	USER_MESSAGE: '[data-message-author-role="user"]',
	ASSISTANT_MESSAGE: '[data-message-author-role="assistant"]',
	UPLOAD_FILES_INPUT: 'input#upload-files[type="file"]',
	UPLOAD_PHOTOS_INPUT: 'input#upload-photos[type="file"]',

	// --- Streaming ---
	STREAM_ACTIVE: '.group\\/scroll-root[data-stream-active="true"]',
	SCROLL_TO_BOTTOM: 'button[aria-label="Ir al final"]',

	// --- Historial ---
	CHAT_HISTORY_ITEMS: '#history [data-sidebar-item="true"]',
} as const;

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

/** @deprecated Usar CHATGPT_TESTIDS y CHATGPT_SEMANTIC_SELECTORS en su lugar.
 *  Mantener como fallback pero NO usar como estrategia primaria.
 *  Las text labels pueden cambiar con i18n, rediseños, o actualizaciones de copy.
 */
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

export { labelMatches } from "../../shared/snapshot-utils";
