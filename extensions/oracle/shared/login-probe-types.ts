// shared/login-probe-types.ts
//
// Tipos para la configuración del probe de login genérico

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