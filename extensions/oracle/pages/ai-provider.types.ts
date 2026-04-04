// pages/ai-provider.types.ts
//
// Capa de abstracción para proveedores de IA.
// Cualquier proveedor de IA (ChatGPT, Claude, Gemini, etc.)
// debe implementar AIProviderPage para integrarse con el sistema.

import type { BrowserActions } from "./browser-actions.types";

// =============================================================================
// TIPOS DE CONFIGURACIÓN
// =============================================================================

/**
 * Configuración necesaria para instanciar un proveedor de IA.
 * Cada proveedor puede requerir campos adicionales, pero estos son comunes.
 */
export interface AIProviderConfig {
	/** URL principal del chat (ej: "https://chatgpt.com", "https://claude.ai") */
	chatUrl: string;
	/** URL de autenticación (ej: "https://auth.openai.com", "https://claude.ai/login") */
	authUrl: string;
	/** Familia del modelo a usar (ej: "gpt-4o", "claude-sonnet-4") */
	modelFamily: string;
	/** Nivel de esfuerzo para modelos thinking (ej: "light", "medium", "high") */
	effort?: string;
	/** Timeout en ms para esperar respuestas (default: 120000) */
	responseTimeoutMs?: number;
	/** Intervalo de polling en ms mientras se espera la respuesta (default: 2000) */
	pollIntervalMs?: number;
}

// =============================================================================
// TIPOS DE RESULTADO
// =============================================================================

/**
 * Representa un artefacto generado por la IA (archivo de código, imagen, etc.)
 */
export interface ArtifactEntry {
	/** Nombre del archivo o descriptor */
	name: string;
	/** Tipo MIME del artefacto */
	mimeType?: string;
	/** Contenido del artefacto (texto o URL de descarga) */
	content: string;
	/** Tamaño en bytes (si se conoce) */
	size?: number;
}

/**
 * Resultado completo de una interacción con el proveedor de IA.
 */
export interface AIProviderResult {
	/** Texto de la respuesta del asistente */
	responseText: string;
	/** Índice de la respuesta (para respuestas múltiples) */
	responseIndex: number;
	/** Artefactos generados (archivos de código, imágenes, etc.) */
	artifacts: ArtifactEntry[];
	/** URL del chat después de la interacción */
	chatUrl: string;
	/** ID de la conversación (si aplica) */
	conversationId?: string;
}

// =============================================================================
// TIPOS DE CLASIFICACIÓN DE PÁGINA
// =============================================================================

/**
 * Parámetros para clasificar el estado actual de la página del proveedor.
 */
export interface ClassifyParams {
	/** Snapshot de accesibilidad de la página */
	snapshot: string;
	/** Body HTML de la página (opcional, para detección avanzada) */
	body: string;
	/** URL actual de la página */
	url: string;
	/** Resultado del login probe (si está disponible) */
	probe?: import("../shared/login-utils").LoginProbeResult;
}

/**
 * Resultado de la clasificación del estado de la página.
 */
export type PageState =
	| "authenticated_and_ready"
	| "login_required"
	| "auth_transitioning"
	| "challenge_blocking"
	| "transient_outage_error"
	| "unknown";

export interface ClassifyResult {
	/** Estado clasificado de la página */
	state: PageState;
	/** Mensaje descriptivo del estado (para logs y debugging) */
	message: string;
}

// =============================================================================
// TIPOS DE ESPERA
// =============================================================================

/**
 * Opciones para esperar la respuesta del proveedor.
 */
export interface WaitOpts {
	/** Número de mensajes del asistente antes de enviar el prompt (baseline) */
	baselineAssistantCount: number;
	/** Timeout máximo en ms */
	timeoutMs: number;
	/** Intervalo de polling en ms */
	pollMs: number;
}

// =============================================================================
// INTERFAZ PRINCIPAL
// =============================================================================

/**
 * Interfaz que todo proveedor de IA debe implementar.
 *
 * Esta es la abstracción central del sistema. Las capas superiores (worker,
 * jobs, extension) dependen de esta interfaz, NO de implementaciones concretas.
 *
 * Para agregar un nuevo proveedor (ej: Claude):
 * 1. Crear `pages/claude/claude.page.ts` que implemente esta interfaz
 * 2. Registrar la factory en `pages/provider-factory.ts`
 * 3. Listo — no se modifica worker, jobs ni extension
 */
export interface AIProviderPage {
	// --- Identidad del proveedor ---

	/** Nombre del proveedor (ej: "chatgpt", "claude") */
	readonly providerName: string;

	// --- Clasificación de estado ---

	/**
	 * Clasifica el estado actual de la página del proveedor.
	 * Determina si el usuario está autenticado, necesita login, hay un challenge, etc.
	 */
	classifyPage(params: ClassifyParams): ClassifyResult;

	// --- Acciones del composer ---

	/** Hace clic en el composer para enfocarlo */
	clickComposer(browser: BrowserActions): Promise<void>;

	/** Escribe un prompt en el composer. Retorna true si se escribió correctamente. */
	typePrompt(browser: BrowserActions, prompt: string): Promise<boolean>;

	/** Envía el prompt (equivalente a presionar Enter o click en enviar) */
	clickSend(browser: BrowserActions): Promise<void>;

	// --- Obtención de respuestas ---

	/** Obtiene todos los mensajes del asistente en el chat actual */
	getAssistantMessages(browser: BrowserActions): Promise<Array<{ text: string }>>;

	/** Verifica si la respuesta actual está completa (no está streaming) */
	isResponseComplete(snapshot: string): boolean;

	/**
	 * Espera a que la respuesta se complete y retorna el resultado.
	 * Este método orquesta: enviar prompt → esperar streaming → extraer respuesta.
	 */
	waitForResponse(
		browser: BrowserActions,
		opts: WaitOpts
	): Promise<AIProviderResult>;

	// --- Configuración (opcional, con defaults) ---

	/**
	 * Selecciona el modelo a usar.
	 * Default: no-op (usa el modelo actual de la UI).
	 */
	selectModel?(browser: BrowserActions, modelFamily: string): Promise<void>;

	/**
	 * Configura el nivel de esfuerzo (para modelos thinking).
	 * Default: no-op.
	 */
	selectEffort?(browser: BrowserActions, effort: string): Promise<void>;
}