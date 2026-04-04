// shared/login-utils.ts - Login and session utilities (extracted from workers)

import { CHATGPT_LABELS } from "../pages/chatgpt/chatgpt.selectors";
import type { LoginProbeConfig } from "./login-probe-types";

// =============================================================================
// TIPOS DE CONFIGURACIÓN DE LOGIN PROBE
// =============================================================================

/**
 * Configuración para el probe de login de diferentes proveedores de IA.
 */
export interface LoginProbeConfig {
	/** URL base del proveedor (ej: "https://chatgpt.com", "https://claude.ai") */
	baseUrl: string;
	/** Endpoint de verificación de sesión (ej: "/backend-api/me", "/api/v1/session") */
	sessionEndpoint?: string;
	/** Headers adicionales para la request */
	headers?: Record<string, string>;
	/** Patrones para detectar página de autenticación (hostname y path patterns) */
	authHostnamePatterns?: string[];
	authPathPatterns?: string[];
	/** Patrones para detectar CTA de login en texto */
	loginCtaPatterns?: string[];
}

// Configuración por defecto para ChatGPT (mantiene compatibilidad)
export const DEFAULT_CHATGPT_LOGIN_PROBE_CONFIG: LoginProbeConfig = {
	baseUrl: "https://chatgpt.com",
	sessionEndpoint: "/backend-api/me",
	authHostnamePatterns: ["^auth\\.openai\\.com$"],
	authPathPatterns: [
		"^\\/(auth|login|signin|log-in)",
		"^\\/(accounts|session)/",
	],
	loginCtaPatterns: [
		"log in",
		"login",
		"sign in",
		"signin",
		"continue with",
		"log in with",
		"sign in with",
	],
};

// =============================================================================
// FUNCIÓN GENERALIZADA DE CONSTRUCCIÓN DE SCRIPT
// =============================================================================

/**
 * Construye el script de probe de login genérico para cualquier proveedor de IA.
 * @param config - Configuración específica del proveedor
 * @param timeoutMs - Timeout en milisegundos para la petición
 */
export function buildLoginProbeScript(config: LoginProbeConfig, timeoutMs: number): string {
	const sessionEndpoint = config.sessionEndpoint || "/api/auth/session";
	const sessionUrl = `${config.baseUrl}${sessionEndpoint}`;
	
	// Construir patrones de detección de página de auth
	const hostnamePatterns = config.authHostnamePatterns || DEFAULT_CHATGPT_LOGIN_PROBE_CONFIG.authHostnamePatterns;
	const pathPatterns = config.authPathPatterns || DEFAULT_CHATGPT_LOGIN_PROBE_CONFIG.authPathPatterns;
	
	// Construir regex combinado para hostname
	const hostnameRegex = hostnamePatterns.map(p => `(${p})`).join("|");
	
	// Construir regex combinado para path
	const pathRegex = pathPatterns.map(p => `(${p})`).join("|");
	
	return toAsyncJsonScript(`
		const pageUrl = typeof location === 'object' && location?.href ? location.href : null;
		const onAuthPage =
		  typeof location === 'object' &&
		  ((typeof location.hostname === 'string' && new RegExp("${hostnameRegex}").test(location.hostname)) ||
		   (typeof location.pathname === 'string' && new RegExp("${pathRegex}").test(location.pathname)));

		const hasLoginCta = () => {
		  const candidates = Array.from(
			document.querySelectorAll(
			  '${Array.from(new Set([
				'a[href*="/auth/login"]',
				'a[href*="/auth/signin"]',
				'button[type="submit"]',
				'button[data-testid*="login"]',
				'button[data-testid*="log-in"]',
				'button[data-testid*="sign-in"]',
				'button[data-testid*="signin"]',
				'button',
				'a'
			  ]).join(',')}'
			)
		  );
		  
		  const textMatches = (text) => {
			if (!text) return false;
			const normalized = text.toLowerCase().trim();
			return (config.loginCtaPatterns || DEFAULT_CHATGPT_LOGIN_PROBE_CONFIG.loginCtaPatterns).some((needle) => normalized.startsWith(needle));
		  };
		  
		  for (const node of candidates) {
			if (!(node instanceof HTMLElement)) continue;
			const label =
			  node.textContent?.trim() ||
			  node.getAttribute('aria-label') ||
			  node.getAttribute('title') ||
			  '';
			if (textMatches(label)) return true;
		  }
		  return false;
		};

		let status = 0;
		let error = null;
		let bodyKeys = [];
		let bodyHasId = false;
		let bodyHasEmail = false;
		try {
		  if (typeof fetch === 'function') {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), ${timeoutMs});
			try {
			  const response = await fetch(sessionUrl, {
				cache: 'no-store',
				credentials: 'include',
				headers: config.headers,
				signal: controller.signal,
			  });
			  status = response.status || 0;
			  const contentType = response.headers.get('content-type') || '';
			  if (contentType.includes('application/json')) {
				const data = await response.clone().json().catch(() => null);
				if (data && typeof data === 'object' && !Array.isArray(data)) {
				  bodyKeys = Object.keys(data).slice(0, 12);
				  bodyHasId = typeof data.id === 'string' && data.id.length > 0;
				  bodyHasEmail = typeof data.email === 'string' && data.email.includes('@');
				}
			  }
			} finally {
			  clearTimeout(timeout);
			}
		  }
		} catch (err) {
		  error = err ? String(err) : 'unknown';
		}

		const domLoginCta = hasLoginCta();
		const loginSignals = domLoginCta || onAuthPage;
		return {
		  ok: !loginSignals && (status === 0 || status === 200),
		  status,
		  pageUrl,
		  domLoginCta,
		  onAuthPage,
		  error,
		  bodyKeys,
		  bodyHasId,
		  bodyHasEmail,
		};
	  `);
}

// =============================================================================
// TIPOS DE RESULTADO
// =============================================================================

/**
 * Tipo de resultado para loginProbe
 */
export interface LoginProbeResult {
	ok: boolean;
	status: number;
	pageUrl?: string;
	domLoginCta: boolean;
	onAuthPage: boolean;
	error?: string;
	bodyKeys: string[];
	bodyHasId: boolean;
	bodyHasEmail: boolean;
}

/**
 * Ejecuta el probe de login y devuelve el resultado estructurado
 * @param config - Configuración del proveedor (opcional, usa ChatGPT por defecto)
 * @param evaluateFn - Función para evaluar scripts en el contexto de la página
 */
export async function loginProbe(
	evaluateFn: (script: string) => Promise<string>,
	config: LoginProbeConfig = DEFAULT_CHATGPT_LOGIN_PROBE_CONFIG,
): Promise<LoginProbeResult> {
	const script = buildLoginProbeScript(config, 5_000);
	const result = await evaluateFn(script);

	if (!result || typeof result !== "object") {
		return {
			ok: false,
			status: 0,
			domLoginCta: false,
			onAuthPage: false,
			bodyKeys: [],
			bodyHasId: false,
			bodyHasEmail: false,
			error: "invalid-probe-result",
		};
	}

	const r = result as Record<string, unknown>;
	return {
		ok: r.ok === true,
		status: typeof r.status === "number" ? r.status : 0,
		pageUrl: typeof r.pageUrl === "string" ? r.pageUrl : undefined,
		domLoginCta: r.domLoginCta === true,
		onAuthPage: r.onAuthPage === true,
		error: typeof r.error === "string" ? r.error : undefined,
		bodyKeys: Array.isArray(r.bodyKeys) ? r.bodyKeys : [],
		bodyHasId: r.bodyHasId === true,
		bodyHasEmail: r.bodyHasEmail === true,
	};
}

// =============================================================================
// WRAPPER ESPECÍFICO PARA CHATGPT (MANTIENE COMPATIBILIDAD)
// =============================================================================

/**
 * Wrapper para el probe de login específico de ChatGPT.
 * Mantiene la interfaz original para no romper código existente.
 */
export async function chatGPTLoginProbe(
	evaluateFn: (script: string) => Promise<string>,
): Promise<LoginProbeResult> {
	return loginProbe(evaluateFn, DEFAULT_CHATGPT_LOGIN_PROBE_CONFIG);
}

// =============================================================================
// FUNCIÓN ORIGINAL DE CLASIFICACIÓN (MANTENIDA POR COMPATIBILIDAD)
// =============================================================================

/**
 * Classify the ChatGPT page state
 */
export type PageState =
	| "authenticated_and_ready"
	| "login_required"
	| "auth_transitioning"
	| "challenge_blocking"
	| "transient_outage_error"
	| "unknown";

export interface ClassifyResult {
	state: PageState;
	message: string;
}

/**
 * Classify ChatGPT page state based on snapshot, body, and probe
 */
export function classifyChatPage(params: {
	url: string;
	snapshot: string;
	body: string;
	probe?: LoginProbeResult;
	chatUrl: string;
}): ClassifyResult {
	const { url, snapshot, body, probe, chatUrl } = params;
	const text = `${snapshot}\n${body}`;

	// Challenge/verification patterns
	const challengePatterns = [
		/just a moment/i,
		/verify you are human/i,
		/cloudflare/i,
		/captcha|turnstile|hcaptcha/i,
		/unusual activity detected/i,
		/we detect suspicious activity/i,
	];

	if (challengePatterns.some((pattern) => pattern.test(text))) {
		return {
			state: "challenge_blocking",
			message: "ChatGPT is showing a challenge/verification page",
		};
	}

	// Transient outage patterns
	const outagePatterns = [
		/something went wrong/i,
		/a network error occurred/i,
		/an error occurred while connecting to the websocket/i,
		/try again later/i,
		/rate limit/i,
		/mj:	];
	if (outagePatterns.some((pattern) => pattern.test(text))) {
		return {
			state: "transient_outage_error",
			message: "ChatGPT is showing a transient outage/error page",
		};
	}

	const allowedOrigins = [new URL(chatUrl).origin, "https://auth.openai.com"];
	const onAllowedOrigin =
		typeof url === "string" &&
		allowedOrigins.some((origin) => url.startsWith(origin));
	const onAuthPath = typeof url === "string" && url.includes("/auth/");
	const hasComposer = snapshotHasLabel(
		snapshot,
		"textbox",
		CHATGPT_LABELS.composer,
	);
	const hasAddFiles = snapshotHasLabel(
		snapshot,
		"button",
		CHATGPT_LABELS.addFiles,
	);
	const hasModelControl =
		snapshotHasLabel(snapshot, "button", CHATGPT_LABELS.modelSelector) ||
		/button "(Instant|Thinking|Pro)(?: [^"]*)?"/.test(snapshot);

	if (probe?.status === 401 || probe?.status === 403) {
		return {
			state: "login_required",
			message: "ChatGPT login is required. Run /oracle-auth.",
		};
	}

	if (onAuthPath || probe?.onAuthPage) {
		if (probe?.bodyHasId || probe?.bodyHasEmail) {
			return {
				state: "auth_transitioning",
				message:
					"ChatGPT is on an auth page even though the backend session is partially authenticated. Rerun /oracle-auth.",
			};
		}
		return {
			state: "login_required",
			message: "ChatGPT login is required. Run /oracle-auth.",
		};
	}

	if (
		onAllowedOrigin &&
		probe?.status === 200 &&
		hasComposer &&
		hasAddFiles &&
		hasModelControl
	) {
		if (probe?.domLoginCta && (probe?.bodyHasId || probe?.bodyHasEmail)) {
			return {
				state: "auth_transitioning",
				message:
					"ChatGPT backend session is authenticated, but the web shell still shows public login CTA chrome. Rerun /oracle-auth.",
			};
		}
		return {
			state: "authenticated_and_ready",
			message: "ChatGPT is authenticated and ready.",
		};
	}

	if (url && !onAllowedOrigin) {
		return { state: "unknown", message: `Unexpected URL: ${url}` };
	}

	return { state: "unknown", message: "Unable to determine page state" };
}

// Helper functions (moved from the end to keep them together)
function snapshotHasLabel(
	snapshot: string,
	kind: string,
	labels: readonly string[],
): boolean {
	const entries = snapshot.split("\n");
	for (const entry of entries) {
		const hasKind = entry.includes(`- ${kind} `) || entry.includes(`- ${kind}`);
		if (!hasKind) continue;
		const labelMatch = entry.match(/"([^"]+)"/);
		if (!labelMatch) continue;
		const label = labelMatch[1].toLowerCase();
		if (labels.some((l) => label.includes(l.toLowerCase()))) {
			return true;
		}
	}
	return false;
}