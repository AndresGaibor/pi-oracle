# Guía: Agregar un Nuevo Proveedor de IA

Esta guía explica cómo agregar soporte para un nuevo proveedor de IA (Claude, Gemini, Perplexity, etc.) a pi-oracle.

**Tiempo estimado:** 2-4 horas para un proveedor con UI de chat estándar.

---

## Prerrequisitos

- Familiaridad con Playwright y selectores CSS
- Acceso a una cuenta del proveedor para inspeccionar el DOM real
- Haber leído [ARCHITECTURE.md](ARCHITECTURE.md) — especialmente las secciones de POM y provider abstraction

---

## Resumen Rápido

```
5 archivos nuevos + 2 registros = proveedor completo

pages/{provider}/
├── {provider}.selectors.ts      # Selectores (fuente única de verdad)
├── {provider}.actions.ts        # Funciones de acción puras
├── {provider}.assertions.ts     # Funciones de aserción puras
├── {provider}.page.ts           # Page Object (implementa AIProviderPage)
└── {provider}-auth.page.ts      # Auth page (si tiene login separado)

+ Registrar en: pages/provider-factory.ts
+ Registrar en: shared/login-utils.ts (función classify)
```

---

## Arquitectura del Proveedor

### Contexto: ¿Qué es `AIProviderPage`?

```typescript
// Esta es la interfaz que debes implementar:
interface AIProviderPage {
    readonly providerName: string;

    classifyPage(params: ClassifyParams): ClassifyResult;
    clickComposer(browser: BrowserActions): Promise<void>;
    typePrompt(browser: BrowserActions, prompt: string): Promise<boolean>;
    clickSend(browser: BrowserActions): Promise<void>;
    getAssistantMessages(browser: BrowserActions): Promise<Array<{ text: string }>>;
    isResponseComplete(snapshot: string): boolean;
    waitForResponse(
        browser: BrowserActions,
        opts: WaitOpts
    ): Promise<AIProviderResult>;

    // Opcionales:
    selectModel?(browser: BrowserActions, modelFamily: string): Promise<void>;
    selectEffort?(browser: BrowserActions, effort: string): Promise<void>;
}
```

Cada método tiene un propósito claro en el flujo del job:

```
classifyPage → clickComposer → typePrompt → clickSend → waitForResponse
     ↑                                                       │
     └──── if not authenticated ─────────────────────────────┘
```

---

## Paso 1: Obtener Snapshots Reales

**ANTES** de escribir código, necesitas snapshots reales del proveedor.

### Método A: Usar `scripts/debug-headed.ts`

```typescript
// Agregar temporalmente a scripts/debug-headed.ts
const snapshot = await page.accessibility.snapshot();
console.log("=== ACCESSIBILITY SNAPSHOT ===");
console.log(JSON.stringify(snapshot, null, 2));
```

Ejecutar:
```bash
bun run scripts/debug-headed.ts
```

### Método B: Playwright CLI

```bash
# Abrir el proveedor en modo interactivo
npx playwright codegen https://claude.ai

# En la consola del browser
const snapshot = await page.accessibility.snapshot();
console.log(snapshot);
```

### Qué buscar en el snapshot

```
heading "Claude says:"
- button "Copy" ref=e12
- button "Share" ref=e13
- button "Send again" ref=e14
- textbox "Write a prompt..." ref=e15
```

Anota:
- El heading del asistente (ej: "ChatGPT Sayd:", "Claude says:", "Gemini responds:")
- El botón de "Stop/Stop generating" (streaming)
- El botón de "Copy/Share" (completado)
- El textarea del composer
- Los botones de modelo/effort si existen

---

## Paso 2: Crear `pages/{provider}/{provider}.selectors.ts`

```typescript
// pages/claude/claude.selectors.ts

// =============================================================================
// SELECTORES data-testid (PRIORITARIOS — estables entre deploys)
// =============================================================================
// Obtener inspeccionando el DOM real:
// 1. Abre DevTools en el navegador
// 2. Busca atributos data-testid
// 3. Son mantenidos por OpenAI/Anthropic para tests internos

export const CLAUDE_TESTIDS = {
    // Navegación
    NEW_CHAT_BUTTON: "", // Completar con valor real
    MODEL_SELECTOR: "",

    // Composer
    COMPOSER_TEXTAREA: "",  // El textarea de input
    SEND_BUTTON: "",
    STOP_BUTTON: "",

    // Mensajes
    COPY_RESPONSE: "",
    SHARE_CHAT: "",

    // Acciones de turno
    GOOD_RESPONSE: "",
    BAD_RESPONSE: "",
} as const;

// =============================================================================
// SELECTORES por atributos semánticos
// =============================================================================
// Atributos mantendos por accesibilidad (a11y). Más estables que clases CSS.

export const CLAUDE_SEMANTIC_SELECTORS = {
    PROMPT_TEXTAREA: "#prompt-textarea", // Verificar si es el mismo ID
    THREAD: "#thread",
    ASSISTANT_MESSAGE: '[data-message-author-role="assistant"]',
    USER_MESSAGE: '[data-message-author-role="user"]',
} as const;

// =============================================================================
// URLs
// =============================================================================

export const CLAUDE_URLS = {
    chat: "https://claude.ai/",
    auth: "https://claude.ai/login",
} as const;

// =============================================================================
// CSS Selectors — con fallback multilingüe
// =============================================================================

export const CLAUDE_SELECTORS = {
    composer: [
        'textarea[data-id="root"]',
        "#prompt-textarea",
        '[contenteditable="true"]',
    ] as const,

    sendButton: [
        'button[aria-label*="Send"]',
        'button[aria-label*="Enviar"]',
        'button[type="submit"]',
    ] as const,

    message: [
        '[data-role="assistant"]',
        '[data-role="user"]',
    ] as const,
} as const;

// =============================================================================
// LABELS textuales (MULTILINGÜE — fallback)
// =============================================================================
// @deprecated — Usar data-testid como estrategia principal.
// Mantener como fallback pero NO usar como primera opción.

/** @deprecated Usar CLAUDE_TESTIDS en su lugar */
export const CLAUDE_LABELS = {
    composer: [
        "Message Claude",
        "Ask Claude anything",
        "Escribe un mensaje",
    ] as const,

    send: [
        "Send",
        "Send message",
        "Enviar",
    ] as const,

    stop: [
        "Stop generating",
        "Stop",
        "Detener",
    ] as const,

    copy: [
        "Copy",
        "Copiar",
    ] as const,
} as const;

// =============================================================================
// Model families y effort labels (si aplica)
// =============================================================================

export const CLAUDE_MODEL_FAMILY_PREFIX: Record<string, string> = {
    sonnet: "Claude Sonnet ",
    opus: "Claude Opus ",
    haiku: "Claude Haiku ",
} as const;

export const CLAUDE_EFFORT_LABELS: Record<string, readonly string[]> = {
    // Mapear a los labels reales de Claude si tiene "Extended Thinking"
    standard: ["Standard", "Estándar"],
    extended: ["Extended", "Extendido"],
} as const;
```

### Reglas para selectores

| Prioridad | Ejemplo | Por qué |
|-----------|---------|---------|
| 1. `data-testid` | `[data-testid="send-button"]` | Mantenido por equipo para tests |
| 2. Atributos semánticos | `[data-message-author-role="assistant"]` | Accesibilidad, no cambia |
| 3. IDs estructurales | `#prompt-textarea` | IDs son estables |
| 4. `aria-label` | `[aria-label*="Send"]` | Semántico pero puede cambiar |
| 5. CSS classes | ❌ NUNCA | Tailwind cambia con cada deploy |
| 6. Text labels | ❌ NUNCA como primary | i18n, rebranding |

---

## Paso 3: Crear `pages/{provider}/{provider}.assertions.ts`

```typescript
// pages/claude/claude.assertions.ts

import { parseSnapshotEntries, findLabeledEntry, labelMatches, type ParsedSnapshotEntry } from "../../shared/snapshot-utils";
import { CLAUDE_LABELS } from "./claude.selectors";

/**
 * Determina si la respuesta está completa (no está generando).
 *
 * Lógica: Busca indicadores de "completado" (Share, Send again, Copy)
 * sin indicadores de "streaming" (Stop generating).
 *
 * @pure — Sin efectos secundarios, resultado depende solo del snapshot.
 */
export function isResponseComplete(snapshot: string): boolean {
    const entries = parseSnapshotEntries(snapshot);
    const buttons = entries.filter(e => e.kind === "button" && !e.disabled);
    const labels = buttons.map(e => String(e.label).toLowerCase());

    // Indicadores de completado
    const hasShare = labels.some(l => l.includes("share"));
    const hasSendAgain = labels.some(l => l.includes("send again"));
    const hasCopy = labels.some(l => l.includes("copy"));

    // Indicadores de streaming activo
    const hasStop = labels.some(l => l.includes("stop"));

    return (hasShare || hasSendAgain || hasCopy) && !hasStop;
}

/**
 * Detecta si el modelo está en modo streaming.
 * @pure
 */
export function isStreamingActive(snapshot: string): boolean {
    const entries = parseSnapshotEntries(snapshot);
    return entries.some(
        e => e.kind === "button"
          && !e.disabled
          && labelMatches(e.label, CLAUDE_LABELS.stop)
    );
}

/**
 * Detecta si el composer está presente y listo para input.
 * @pure
 */
export function hasComposer(snapshot: string): boolean {
    const entries = parseSnapshotEntries(snapshot);
    return entries.some(
        e => e.kind === "textbox" && !e.disabled
    );
}

/**
 * Encuentra candidatos a artefactos descargables en el snapshot.
 * Busca botones/links con apariencia de archivo (extensión, nombre corto).
 * @pure
 */
export function findArtifactCandidates(slice: string): Array<{ label: string; ref: string }> {
    const entries = parseSnapshotEntries(slice);
    return entries
        .filter(e => (e.kind === "button" || e.kind === "link") && !e.disabled)
        .filter(e => {
            const label = String(e.label || "");
            // Heurística: nombre de archivo con extensión o "Download"
            return label.includes(".")
                || label.toLowerCase().includes("download")
                || label.match(/\.(py|js|ts|md|json|yaml|yml|txt|pdf|png|jpg)(\s|$)/i);
        })
        .map(e => ({ label: String(e.label), ref: e.ref }));
}

/**
 * Genera el nombre preferido para un artefacto basado en su label.
 * @pure
 */
export function preferredArtifactName(label: string, index: number): string {
    // "download.py" → "download.py"
    // "Click to open download.py" → "download.py"
    // "Run 1 output" → "artifact-1"
    const match = label.match(/([\w-]+\.\w+)/);
    if (match) return match[1];

    // Extraer del href si es un link
    // Fall back a index
    return index >= 0
        ? `artifact-${index}`
        : "artifact";
}
```

**Principios de funciones de aserción:**

1. **Siempre `@pure`** — Sin estado mutable, sin I/O
2. **Reciben solo `string`** (snapshot) — No dependen de navegador
3. **Retornan primitivos** (`boolean`, `number`, `string`) o objetos simples
4. **Testeables unitariamente** — `expect(fn("input")).toBe(expected)`

---

## Paso 4: Crear `pages/{provider}/{provider}.actions.ts`

```typescript
// pages/claude/claude.actions.ts

import type { BrowserActions } from "../../pages/browser-actions.types";
import { RESPONSE_POLL_INTERVAL_MS } from "../../lib/constants";
import { isResponseComplete, isStreamingActive } from "./claude.assertions";

/**
 * Envía un prompt al composer.
 *
 * ESTRATEGIA: Enter-first. No buscamos el botón "enviar" porque
 * puede ser camaleónico. En su lugar:
 * 1. Click en el textarea
 * 2. Limpiar contenido
 * 3. Tipear el prompt
 * 4. Presionar Enter
 *
 * @param browser - BrowserActions abstraction
 * @param prompt - Texto a enviar
 */
export async function sendPrompt(
    browser: BrowserActions,
    prompt: string
): Promise<void> {
    const textarea = "#prompt-textarea"; // Verificar selector real

    await browser.clickRef("@e1"); // Click en textarea (ref del snapshot)
    await browser.fill(textarea, ""); // Limpiar
    await browser.type(prompt); // Tipear (simula keypresses)
    await browser.press("Enter"); // Enviar
}

/**
 * Espera a que la generación se complete.
 *
 * Polling: cada `pollMs` revisa si la respuesta está completa.
 * Timeout: rechaza si no completa en `timeoutMs`.
 *
 * @param browser - BrowserActions abstraction
 * @param timeoutMs - Timeout en ms (default: 120_000)
 * @param pollMs - Intervalo de poll en ms (default: RESPONSE_POLL_INTERVAL_MS)
 */
export async function waitForStreamingToFinish(
    browser: BrowserActions,
    timeoutMs = 120_000,
    pollMs = RESPONSE_POLL_INTERVAL_MS
): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        const snapshot = await browser.snapshotText();

        if (isResponseComplete(snapshot)) {
            return; // Completado
        }

        await new Promise(r => setTimeout(r, pollMs));
    }

    throw new Error(
        `Streaming timeout after ${timeoutMs}ms. `
        + `Snapshot: ${await browser.snapshotText().then(s => s.slice(0, 500))}`
    );
}
```

---

## Paso 5: Crear `pages/{provider}/{provider}.page.ts`

```typescript
// pages/claude/claude.page.ts
import { BasePage } from "../base.page";
import type {
    AIProviderPage,
    AIProviderConfig,
    ClassifyParams,
    ClassifyResult,
    PageState,
    WaitOpts,
    AIProviderResult,
} from "../ai-provider.types";
import type { BrowserActions } from "../browser-actions.types";
import { sendPrompt, waitForStreamingToFinish } from "./claude.actions";
import {
    isResponseComplete,
    findArtifactCandidates,
    preferredArtifactName,
} from "./claude.assertions";
import { classifyClaudePage } from "../../shared/login-utils";

export class ClaudePage extends BasePage implements AIProviderPage {
    readonly providerName = "claude";

    // --- Clasificación ---

    /**
     * Clasifica el estado de la página de Claude.
     *
     * Estados posibles:
     * - "authenticated_and_ready": Composer visible, listo para input
     * - "login_required": Redirigido a login
     * - "challenge_blocking": Cloudflare challenge
     * - "transient_outage_error": 502/503/error de red
     * - "unknown": No se pudo clasificar
     */
    classifyPage(params: ClassifyParams): ClassifyResult {
        return classifyClaudePage(params);
    }

    // --- Acciones del composer ---

    async clickComposer(browser: BrowserActions): Promise<void> {
        // Click en el textarea del composer
        await browser.clickRef("@e1"); // Ajustar ref real
    }

    async typePrompt(browser: BrowserActions, prompt: string): Promise<boolean> {
        await sendPrompt(browser, prompt);
        return true;
    }

    async clickSend(browser: BrowserActions): Promise<void> {
        // Enter para enviar
        await browser.press("Enter");
    }

    // --- Obtención de respuestas ---

    async getAssistantMessages(
        browser: BrowserActions
    ): Promise<Array<{ text: string }>> {
        const script = `
            // Extraer textos de mensajes del asistente
            const messages = document.querySelectorAll(
                '[data-message-author-role="assistant"]'
            );
            JSON.stringify(Array.from(messages).map(m => ({
                text: m.innerText || m.textContent || ""
            })));
        `;
        const result = await browser.evaluate(browser.getMainPageId(), script);
        if (typeof result === "string") {
            try {
                return JSON.parse(result);
            } catch {
                return [];
            }
        }
        return [];
    }

    isResponseComplete(snapshot: string): boolean {
        return isResponseComplete(snapshot);
    }

    async waitForResponse(
        browser: BrowserActions,
        opts: WaitOpts
    ): Promise<AIProviderResult> {
        // Esperar a que termine el streaming
        await waitForStreamingToFinish(browser, opts.timeoutMs, opts.pollMs);

        // Extraer mensajes
        const messages = await this.getAssistantMessages(browser);
        const responseText = messages
            .slice(opts.baselineAssistantCount)
            .map(m => m.text)
            .join("\n\n");

        // Extraer artefactos del snapshot
        const snapshot = await browser.snapshotText();
        const candidates = findArtifactCandidates(snapshot);
        const artifacts = candidates.map((c, i) => ({
            name: preferredArtifactName(c.label, i),
            content: c.label,
            ref: c.ref,
        }));

        return {
            responseText,
            responseIndex: opts.baselineAssistantCount,
            artifacts,
            chatUrl: await browser.getCurrentUrl(),
        };
    }
}
```

---

## Paso 6: Auth Page (si aplica)

Algunos proveedores tienen una página de login separada con su propio DOM.

```typescript
// pages/claude/claude-auth.page.ts
import { BasePage } from "../base.page";
import type { BrowserActions } from "../browser-actions.types";

export class ClaudeAuthPage extends BasePage {
    /**
     * Verifica si estamos en la página de login/logout.
     */
    isOnAuthPage(url: string): boolean {
        return url.includes("claude.ai/login")
            || url.includes("claude.ai/auth")
            || url.includes("anthropic.com/auth");
    }

    /**
     * Detecta CAPTCHA, 2FA, Cloudflare challenge, etc.
     */
    async detectChallenge(browser: BrowserActions): Promise<boolean> {
        const snapshot = await browser.snapshotText();
        return (
            snapshot.includes("challenge")
            || snapshot.includes("captcha")
            || snapshot.includes("verify you are human")
        );
    }

    /**
     * Detecta si el servicio está caído (500/502/503).
     */
    async detectOutage(browser: BrowserActions): Promise<boolean> {
        const body = await browser.pageText();
        return (
            body.includes("502")
            || body.includes("503")
            || body.includes("Service Unavailable")
        );
    }

    /**
     * Script que detecta si estamos logueados.
     * Se ejecuta en la página antes de verificar auth.
     */
    getLoginProbeScript(): string {
        return `document.querySelector('[data-testid="chat-input"]') !== null`;
    }

    /**
     * Parsea el resultado del probe.
     */
    parseLoginProbeResult(result: string): { authenticated: boolean; email?: string } {
        return { authenticated: result === "true" };
    }
}
```

**Cuándo necesitas Auth Page:**
- ✅ Proveedor tiene login/logout dedicado
- ✅ Proveedor tiene CAPTCHA en login
- ❌ Proveedor usa cookies del navegador directamente (como ChatGPT actualmente)

---

## Paso 7: Registrar en la Factory

**Archivo:** `pages/provider-factory.ts`

```typescript
import { ClaudePage } from "./claude/claude.page";
import type { AIProviderPage, AIProviderConfig } from "./ai-provider.types";

// Registrar Claude en el registry
registerProvider("https://claude.ai", (config: AIProviderConfig) => new ClaudePage());

// También registrar con trailing slash
registerProvider("https://claude.ai/", (config: AIProviderConfig) => new ClaudePage());
```

**Cómo funciona `registerProvider`:**

```typescript
// provider-factory.ts
const PROVIDER_REGISTRY = new Map<string, (config: AIProviderConfig) => AIProviderPage>();

export function registerProvider(
    url: string,
    factory: (config: AIProviderConfig) => AIProviderPage
): void {
    PROVIDER_REGISTRY.set(url.replace(/\/+$/, ""), factory);
}

export function createProviderPage(config: AIProviderConfig): AIProviderPage {
    // 1. Match URL exacto
    // 2. Match por dominio
    // 3. Fallback a ChatGPT
}
```

---

## Paso 8: Extender Login Utils

**Archivo:** `shared/login-utils.ts`

```typescript
import type { ClassifyParams, ClassifyResult } from "../pages/ai-provider.types";

/**
 * Clasifica el estado de una página de Claude.
 *
 * Estados:
 * - authenticated_and_ready: composer visible
 * - login_required: necesita login
 * - challenge_blocking: Cloudflare CAPTCHA
 * - transient_outage_error: 50x
 * - unknown
 */
export function classifyClaudePage(params: ClassifyParams): ClassifyResult {
    const { snapshot, url, body } = params;

    // 1. Detectar outage
    if (body.includes("502") || body.includes("503")) {
        return {
            state: "transient_outage_error",
            message: "Claude appears to be experiencing an outage.",
        };
    }

    // 2. Detectar challenge (Cloudflare)
    if (body.includes("challenge") || url.includes("challenge")) {
        return {
            state: "challenge_blocking",
            message: "Cloudflare challenge detected.",
        };
    }

    // 3. Detectar login
    if (url.includes("login") || url.includes("auth")) {
        return {
            state: "login_required",
            message: "Claude login page detected.",
        };
    }

    // 4. Detectar ready (composer visible)
    if (/textbox.*[Mm]essage/.test(snapshot)) {
        return {
            state: "authenticated_and_ready",
            message: "Claude appears authenticated and ready.",
        };
    }

    // 5. Fallback
    return {
        state: "unknown",
        message: `Unexpected page state: URL=${url}`,
    };
}
```

---

## Paso 9: Agregar Tests

```typescript
// tests/unit/claude-assertions.test.ts
import { describe, it, expect } from "vitest";
import {
    isResponseComplete,
    isStreamingActive,
    hasComposer,
} from "../../extensions/oracle/pages/claude/claude.assertions";

describe("Claude assertions", () => {
    describe("isResponseComplete", () => {
        it("returns true when Share is visible and Stop is not", () => {
            const snapshot = `
- button "Share" ref=e10
- button "Send again" ref=e11
- textbox "Message Claude" ref=e12
            `.trim();
            expect(isResponseComplete(snapshot)).toBe(true);
        });

        it("returns false when Stop generating is visible", () => {
            const snapshot = `
- button "Stop generating" ref=e10
            `.trim();
            expect(isResponseComplete(snapshot)).toBe(false);
        });

        it("returns false on empty snapshot", () => {
            expect(isResponseComplete("")).toBe(false);
        });
    });

    describe("isStreamingActive", () => {
        it("returns true when Stop generating is present", () => {
            const snapshot = '- button "Stop generating" ref=e10';
            expect(isStreamingActive(snapshot)).toBe(true);
        });

        it("returns false when only Share is present", () => {
            const snapshot = '- button "Share" ref=e10';
            expect(isStreamingActive(snapshot)).toBe(false);
        });
    });

    describe("hasComposer", () => {
        it("returns true when textarea is present", () => {
            const snapshot = '- textbox "Message Claude" ref=e12';
            expect(hasComposer(snapshot)).toBe(true);
        });

        it("returns false when only buttons present", () => {
            const snapshot = '- button "Share" ref=e10';
            expect(hasComposer(snapshot)).toBe(false);
        });
    });
});
```

---

## Paso 10: Verificar

```bash
# 1. Verificar tipos
npx tsc --noEmit

# 2. Ejecutar tests unitarios
npm test

# 3. Verificar que la factory reconoce el proveedor
node -e "
const { createProviderPage } = require('./extensions/oracle/pages/provider-factory.ts');
const page = createProviderPage({ chatUrl: 'https://claude.ai' });
console.log(page.providerName); // Debe ser 'claude'
"
```

---

## Checklist Final

- [ ] `pages/{provider}/{provider}.selectors.ts` creado con selectores **reales del DOM**
- [ ] `pages/{provider}/{provider}.assertions.ts` implementado con:
  - [ ] `isResponseComplete(snapshot: string): boolean`
  - [ ] `isStreamingActive(snapshot: string): boolean`
  - [ ] `hasComposer(snapshot: string): boolean`
- [ ] `pages/{provider}/{provider}.actions.ts` implementado con:
  - [ ] `sendPrompt(browser, prompt)`
  - [ ] `waitForStreamingToFinish(browser, timeoutMs, pollMs)`
- [ ] `pages/{provider}/{provider}.page.ts` implementando `AIProviderPage`
- [ ] `pages/{provider}/{provider}-auth.page.ts` creado (si tiene login separado)
- [ ] Registrado en `pages/provider-factory.ts`
- [ ] `shared/login-utils.ts` extendido con classify function
- [ ] Tests unitarios creados y pasando (`npm test`)
- [ ] Snapshots de ejemplo en `tests/fixtures/snapshots/`
- [ ] `npx tsc --noEmit` pasa sin errores

---

## Tips y Mejores Prácticas

### 1. Siempre empieza con snapshots reales

> ❌ Adivinar selectores sin ver el DOM real
>
> ✅ Obtener `page.accessibility.snapshot()` del proveedor

### 2. data-testid es tu mejor amigo

| Prioridad | Estabilidad | Mantenimiento |
|-----------|------------|---------------|
| `data-testid="..."` | Alta | Mantenido por el equipo del proveedor |
| `aria-label="..."` | Media | Accesibilidad, cambia ocasionalmente |
| `#prompt-textarea` | Media-Low | ID estructural, puede cambiar |
| Clases CSS | ❌ Muy baja | Tailwind/UI framework cambia cada deploy |

### 3. Usa el patrón Enter-first para enviar prompts

No busques el botón "Send" porque:
- Puede desaparecer en ciertos contextos
- Puede tener labels diferentes
- Enter siempre funciona si el textarea está enfocado

### 4. No asumas que todos los providers son iguales

| Característica | ChatGPT | Claude | Gemini |
|---------------|---------|--------|--------|
| Modelo selector | ✅ Dropdown | ✅ Toggle | ✅ |
| Effort/Thinking | ✅ | ✅ Extended | ❌ |
| Stream indicator | "Stop streaming" | "Stop generating" | ? |
| Complete indicator | "Copy response" | "Share" | ? |
| Artifact download | ✅ | ✅ | ? |

### 5. Mantén los archivos pequeños

| Archivo | Tamaño máximo ideal |
|---------|-------------------|
| `.selectors.ts` | ~50-100 líneas (solo datos) |
| `.actions.ts` | ~40-80 líneas (solo funciones) |
| `.assertions.ts` | ~40-80 líneas (solo funciones puras) |
| `.page.ts` | ~50-120 líneas (delegación) |

Si un archivo crece más, es señal de que está haciendo más de lo que debería.
