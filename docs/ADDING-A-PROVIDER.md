# Guía: Agregar un Nuevo Proveedor de IA

Esta guía explica cómo agregar soporte para un nuevo proveedor de IA (ej: Claude, Gemini, Perplexity) al sistema pi-oracle.

**Tiempo estimado:** 2-4 horas para un proveedor con UI de chat estándar.

## Requisitos Previos

- Familiaridad con Playwright y selectores CSS
- Acceso a una cuenta del proveedor para inspeccionar el DOM real
- Haber leído [docs/ARCHITECTURE.md](ARCHITECTURE.md) — especialmente la sección de POM

## Resumen Rápido

Agregar un proveedor requiere **5 archivos nuevos** y **2 registros** en archivos existentes:

```
pages/{provider}/
├── {provider}.selectors.ts     # Selectores CSS/data-testid
├── {provider}.actions.ts       # Funciones de acción puras (reciben BrowserActions)
├── {provider}.assertions.ts    # Funciones de aserción puras (reciben snapshot)
├── {provider}.page.ts          # Page Object (implementa AIProviderPage)
└── {provider}-auth.page.ts     # Auth page (si tiene login separado)

Además:
+ Registrar en pages/provider-factory.ts
+ Registrar en shared/login-utils.ts (función classify)
```

## Pasos Detallados

### 1. Crear la estructura de directorios

```bash
mkdir -p extensions/oracle/pages/claude
```

### 2. Implementar `{provider}.selectors.ts`

Este archivo es la **fuente única de verdad** para todos los selectores del proveedor.

```typescript
// pages/claude/claude.selectors.ts

// =============================================================================
// SELECTORES data-testid (prioritarios, estables entre deploys)
// =============================================================================

export const CLAUDE_TESTIDS = {
    // Obtener inspeccionando el DOM con DevTools del navegador
    // page.accessibility.snapshot() muestra los roles y labels disponibles
    COMPOSER_TEXTAREA: "claude-composer",  // Ejemplo — ajustar al DOM real
    SEND_BUTTON: "claude-send",
    // ...
} as const;

// =============================================================================
// SELECTORES por atributos semánticos
// =============================================================================

export const CLAUDE_SEMANTIC_SELECTORS = {
    PROMPT_TEXTAREA: "#prompt-textarea",
    ASSISTANT_MESSAGE: '[data-author="assistant"]',
    USER_MESSAGE: '[data-author="user"]',
} as const;

// =============================================================================
// LABELS textuales (fallback, último recurso)
// =============================================================================

/** @deprecated Usar CLAUDE_TESTIDS en su lugar. Los labels pueden cambiar con i18n */
export const CLAUDE_LABELS = {
    SEND: "Send",
    STOP: "Stop generating",
} as const;
```

**Cómo obtener los selectores reales:**
1. Abre el proveedor en el navegador
2. Ejecuta `page.accessibility.snapshot()` (puedes usar `scripts/debug-headed.ts`)
3. Busca atributos `data-testid`, `aria-label`, `data-*`
4. **Prioriza `data-testid`** sobre clases CSS o text labels

### 3. Implementar `{provider}.assertions.ts`

Funciones puras (`@pure`) que determinan el estado de la UI a partir de un snapshot de texto.

```typescript
// pages/claude/claude.assertions.ts
import { findLabeledEntry, hasEntry, parseSnapshotEntries } from "../../shared/snapshot-utils";
import type { ParsedSnapshotEntry } from "../../shared/snapshot-utils";

/**
 * Determina si la respuesta está completa.
 * @pure — depende solo del string de snapshot
 */
export function isResponseComplete(snapshot: string): boolean {
    const entries = parseSnapshotEntries(snapshot);
    // Claude puede usar indicadores diferentes a ChatGPT
    // Ejemplo: buscar botón "Share" o "Send again" que aparece al terminar
    if hasEntry(entries, "Share")) return true;
    if hasEntry(entries, "Send again")) return true;
    // No hay indicador de "Stop" → está completo
    if (hasEntry(entries, "Stop generating")) return false;
    return false;
}

/**
 * Detecta si el modelo está en modo streaming (generando activamente).
 * @pure
 */
export function isStreamingActive(snapshot: string): boolean {
    return hasEntry(snapshot, "Stop generating");
}

/**
 * Detecta si el composer está presente y activo (listo para input).
 * @pure
 */
export function hasComposer(snapshot: string): boolean {
    return hasEntry(snapshot, "Send") || hasEntry(snapshot, "claude-send");
}
```

**Principios:**
- Cada función recibe solo un `string` (snapshot) y retorna un valor primitivo
- Sin estado mutable, sin efectos secundarios
- Cada función se testea unitariamente con snapshots de fixture

### 4. Implementar `{provider}.actions.ts`

Funciones que interactúan con el navegador a través de `BrowserActions`.

```typescript
// pages/claude/claude.actions.ts
import type { BrowserActions } from "../../pages/browser-actions.types";
import { CLAUDE_SEMANTIC_SELECTORS, CLAUDE_TESTIDS } from "./claude.selectors";
import { RESPONSE_POLL_INTERVAL_MS } from "../../lib/constants";

/**
 * Envía un prompt al composer de Claude.
 * Usa la estrategia Enter (no buscar botón camaleónico).
 */
export async function sendPrompt(browser: BrowserActions, prompt: string): Promise<void> {
    const textarea = CLAUDE_SEMANTIC_SELECTORS.PROMPT_TEXTAREA;
    await browser.click(textarea);
    await browser.fill(textarea, "");
    await browser.type(textarea, prompt, { delay: 10 });
    await browser.press("Enter");
}

/**
 * Espera a que la respuesta se complete.
 * Polling con verificación de assertions.
 */
export async function waitForStreamingToFinish(
    browser: BrowserActions,
    timeoutMs = 120_000,
    pollMs = RESPONSE_POLL_INTERVAL_MS
): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const snapshot = await browser.snapshotText();
        if (isResponseComplete(snapshot)) return;
        await browser.waitFor(pollMs);
    }
    throw new Error(`Streaming timeout after ${timeoutMs}ms`);
}
```

### 5. Implementar `{provider}.page.ts`

El Page Object debe **implementar `AIProviderPage`**.

```typescript
// pages/claude/claude.page.ts
import { BasePage } from "../base.page";
import type { AIProviderPage, AIProviderConfig, ClassifyParams, ClassifyResult, WaitOpts, AIProviderResult } from "../ai-provider.types";
import type { BrowserActions } from "../browser-actions.types";
import {
    sendPrompt,
    waitForStreamingToFinish,
} from "./claude.actions";
import {
    isResponseComplete,
    hasComposer,
} from "./claude.assertions";
import { classifyClaudePage } from "../../shared/login-utils";

export class ClaudePage extends BasePage implements AIProviderPage {
    readonly providerName = "claude";

    classifyPage(params: ClassifyParams): ClassifyResult {
        return classifyClaudePage(params);
    }

    async clickComposer(browser: BrowserActions): Promise<void> {
        await browser.click("#prompt-textarea");
    }

    async typePrompt(browser: BrowserActions, prompt: string): Promise<boolean> {
        await sendPrompt(browser, prompt);
        return true;
    }

    async clickSend(browser: BrowserActions): Promise<void> {
        await browser.press("Enter");
    }

    async getAssistantMessages(browser: BrowserActions): Promise<Array<{ text: string }>> {
        // Implementar extracción de mensajes del DOM de Claude
        return [];
    }

    isResponseComplete(snapshot: string): boolean {
        return isResponseComplete(snapshot);
    }

    async waitForResponse(
        browser: BrowserActions,
        opts: WaitOpts
    ): Promise<AIProviderResult> {
        await waitForStreamingToFinish(browser, opts.timeoutMs, opts.pollMs);
        const messages = await this.getAssistantMessages(browser);
        return {
            responseText: messages.map(m => m.text).join("\n\n"),
            responseIndex: 0,
            artifacts: [],
            chatUrl: await browser.url(),
        };
    }
}
```

### 6. Crear auth page (si aplica)

Si el proveedor tiene una página de login separada (como ChatGPT):

```typescript
// pages/claude/claude-auth.page.ts
import { BasePage } from "../base.page";
import type { BrowserActions } from "../browser-actions.types";

export class ClaudeAuthPage extends BasePage {
    isOnAuthPage(url: string): boolean {
        return url.includes("claude.ai/login") || url.includes("claude.ai/auth");
    }

    async detectChallenge(browser: BrowserActions): Promise<boolean> {
        // Detectar CAPTCHA, 2FA, Cloudflare challenge, etc.
        return false;
    }

    async detectOutage(browser: BrowserActions): Promise<boolean> {
        return false;
    }

    getLoginProbeScript(): string {
        return "document.querySelector('[data-testid=\"chat-input\"]') !== null";
    }

    parseLoginProbeResult(result: string): { authenticated: boolean; email?: string } {
        return { authenticated: result === "true" };
    }
}
```

### 7. Registrar en la Factory

**Archivo:** `pages/provider-factory.ts`

```typescript
import { ClaudePage } from "./claude/claude.page";

// Agregar las URLs al mapa
const PROVIDER_URLS: Record<string, () => AIProviderPage> = {
    "https://claude.ai": () => new ClaudePage(),
    "https://claude.ai/": () => new ClaudePage(),
    // ... los que ya existan (chatgpt.com, etc.)
};
```

### 8. Extender `shared/login-utils.ts`

Agrega la función de clasificación de página:

```typescript
export function classifyClaudePage(params: ClassifyParams): ClassifyResult {
    // Implementar lógica de detección:
    // - ¿Está en la página de login?
    // - ¿Hay challenge (CAPTCHA/Cloudflare)?
    // - ¿Está autenticado y listo?
    return { state: "unknown", message: "classifyClaudePage not yet implemented" };
}
```

### 9. Agregar Tests Unitarios

```typescript
// tests/unit/claude-assertions.test.ts
import { describe, it, expect } from "vitest";
import { createMockBrowserActions } from "../fixtures/mock-browser-actions";
import { isResponseComplete, hasComposer } from "../../extensions/oracle/pages/claude/claude.assertions";

describe("Claude assertions", () => {
    it("isResponseComplete returns true when 'Share' is present", () => {
        const snapshot = 'button "Share"\nbutton "Send again"';
        expect(isResponseComplete(snapshot)).toBe(true);
    });

    it("isResponseComplete returns false when "Stop generating" is present", () => {
        const snapshot = 'button "Stop generating"';
        expect(isResponseComplete(snapshot)).toBe(false);
    });

    it("hasComposer returns true when Send button exists", () => {
        const snapshot = 'button "Send"';
        expect(hasComposer(snapshot)).toBe(true);
    });
});
```

### 10. Verificar

```bash
# Verificar tipos
tsc --noEmit

# Ejecutar tests
npm test

# Verificar que la factory funciona
# Agregar un log temporal: node -e "console.log(require('./pages/provider-factory.ts'))"
```

## Checklist

- [ ] `pages/{provider}/{provider}.selectors.ts` creado con selectores reales del DOM
- [ ] `pages/{provider}/{provider}.assertions.ts` creado con `isResponseComplete`, `isStreamingActive`, `hasComposer`
- [ ] `pages/{provider}/{provider}.actions.ts` creado con `sendPrompt`, `waitForStreamingToFinish`
- [ ] `pages/{provider}/{provider}.page.ts` implementando `AIProviderPage`
- [ ] `pages/{provider}/{provider}-auth.page.ts` creado (si el proveedor tiene login separado)
- [ ] Registrado en `pages/provider-factory.ts`
- [ ] `shared/login-utils.ts` extendido con `classify{Provider}Page`
- [ ] Tests unitarios creados y pasando (`npm test`)
- [ ] `tsc --noEmit` pasa sin errores

## Tips

1. **Usa `scripts/debug-headed.ts`** para abrir un navegador real y tomar snapshots de accesibilidad
2. **Empieza por los assertions** — son funciones puras y fáciles de testear
3. **No te preocupes por el auth page** si el proveedor usa cookies del navegador directamente
4. **El `providerName`** debe ser en minúsculas y coincidir con el directorio
