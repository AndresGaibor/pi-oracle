// pages/provider-factory.ts
//
// Factory para crear instancias de proveedores de IA basado en la configuración.
// Aplica el patrón Factory para desacoplar la creación de la implementación concreta.

import type { AIProviderPage, AIProviderConfig } from "./ai-provider.types";
import { ChatGPTPage } from "./chatgpt/chatgpt.page";
// import { ClaudePage } from "./claude/claude.page"; // Futuro

/**
 * Mapeo de URLs de proveedor a factories.
 * La clave es la URL normalizada (sin trailing slash).
 * El valor es una función que retorna la implementación del proveedor.
 */
const PROVIDER_REGISTRY: Map<string, (config: AIProviderConfig) => AIProviderPage> = new Map([
	// ChatGPT es el default — se usa para cualquier URL que no coincida
	// con otro proveedor registrado.
]);

/**
 * Registra un nuevo proveedor de IA.
 * Usar esta función para extender el sistema con nuevos proveedores
 * sin modificar la factory.
 *
 * @example
 * registerProvider("https://claude.ai", (config) => new ClaudePage(config));
 */
export function registerProvider(
	url: string,
	factory: (config: AIProviderConfig) => AIProviderPage
): void {
	const normalized = url.replace(/\/+$/, "");
	PROVIDER_REGISTRY.set(normalized, factory);
}

/**
 * Crea una instancia del proveedor de IA adecuado basado en la configuración.
 *
 * Estrategia de resolución:
 * 1. Normaliza la chatUrl (quita trailing slash)
 * 2. Busca en el registry un proveedor registrado para esa URL exacta
 * 3. Si no encuentra, busca por dominio (extrae el hostname y compara)
 * 4. Si no encuentra por dominio, usa ChatGPT como default
 *
 * @param config - Configuración del proveedor (debe incluir chatUrl)
 * @returns Instancia de AIProviderPage
 * @throws Error si la config no incluye chatUrl
 */
export function createProviderPage(config: AIProviderConfig): AIProviderPage {
	if (!config.chatUrl) {
		throw new Error("AIProviderConfig.chatUrl is required");
	}

	const normalizedUrl = config.chatUrl.replace(/\/+$/, "");

	// 1. Buscar por URL exacta
	const exactMatch = PROVIDER_REGISTRY.get(normalizedUrl);
	if (exactMatch) {
		return exactMatch(config);
	}

	// 2. Buscar por dominio
	try {
		const urlObj = new URL(normalizedUrl);
		const hostname = urlObj.hostname; // ej: "chatgpt.com", "claude.ai"

		for (const [registeredUrl, factory] of PROVIDER_REGISTRY.entries()) {
			try {
				const registeredHostname = new URL(registeredUrl).hostname;
				if (hostname === registeredHostname || hostname.endsWith(`.${registeredHostname}`)) {
					return factory(config);
				}
			} catch {
				// URL registrada inválida, ignorar
			}
		}
	} catch {
		// URL inválida, continuar al default
	}

	// 3. Default: ChatGPT
	// (Claude, Gemini, etc. se registrarán vía registerProvider() cuando se implementen)
	return new ChatGPTPage(config.chatUrl);
}

/**
 * Lista los proveedores registrados (para debugging).
 */
export function getRegisteredProviders(): string[] {
	return Array.from(PROVIDER_REGISTRY.keys());
}