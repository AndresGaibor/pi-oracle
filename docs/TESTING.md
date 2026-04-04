# Guía de Testing

## Visión General

Pi-oracle usa dos capas de testing:

| Capa | Runner | Requiere | Velocidad |
|------|--------|----------|-----------|
| **Unitarios** | Vitest | Nada (sin navegador, sin cookies) | ~5-30 segundos |
| **Integración** | Playwright Test | Navegador + cookies de ChatGPT | ~2-5 minutos |

## Tests Unitarios (Vitest)

### Comandos

```bash
# Ejecutar todos los tests unitarios
npm test

# Modo watch (re-ejecuta al guardar cambios)
npm run test:watch

# Ejecutar un archivo específico
npx vitest run tests/unit/snapshot-utils.test.ts

# Con cobertura de código
npm run test:coverage
```

### Estructura

```
tests/
├── unit/                         # Tests unitarios (*.test.ts)
│   ├── snapshot-utils.test.ts    # Parser de snapshots de accesibilidad
│   ├── chatgpt-assertions.test.ts
│   ├── chatgpt-auth-assertions.test.ts
│   ├── chatgpt-selectors.test.ts # Validar selectores contra snapshot
│   ├── chatgpt-page.test.ts      # Mock del Page Object
│   ├── browser-detection.test.ts # Detección de navegador con mocked fs
│   ├── cookie-paths.test.ts      # Rutas de cookies por plataforma
│   ├── config.test.ts            # Validación de OracleConfig
│   ├── jobs.test.ts              # OracleJob state machine
│   └── login-utils.test.ts       # Clasificación de páginas de login
├── fixtures/
│   ├── snapshots/                # Snapshots de accesibilidad de ejemplo
│   │   ├── login-page.snapshot.txt
│   │   ├── chat-ready.snapshot.txt
│   │   ├── response-in-progress.snapshot.txt
│   │   ├── response-complete.snapshot.txt
│   │   ├── challenge-page.snapshot.txt
│   │   └── outage-page.snapshot.txt
│   └── mock-browser-actions.ts   # Mock de BrowserActions para tests
└── integration/                  # Tests E2E (*.chatgpt.spec.ts)
    ├── chatgpt-flow.chatgpt.spec.ts
    └── page-classification.chatgpt.spec.ts
```

### Escribir un nuevo test unitario

1. Crear el archivo en `tests/unit/` con sufijo `.test.ts`
2. Importar funciones desde `extensions/oracle/`
3. Usar `describe` / `it` / `expect` de Vitest
4. Para funciones puras, **no se necesita mocking**
5. Para funciones que usan `BrowserActions`, usar `createMockBrowserActions()` del fixture

**Ejemplo — función pura:**

```typescript
import { describe, it, expect } from "vitest";
import { isResponseComplete } from "../../extensions/oracle/pages/chatgpt/chatgpt.assertions";

describe("isResponseComplete", () => {
    it("returns true when Copy response is present and Stop streaming is not", () => {
        const snapshot = 'button "Copy response"\nbutton "Good response"';
        expect(isResponseComplete(snapshot)).toBe(true);
    });

    it("returns false when Stop streaming is present", () => {
        const snapshot = 'button "Stop streaming"';
        expect(isResponseComplete(snapshot)).toBe(false);
    });
});
```

**Ejemplo — con mock de BrowserActions:**

```typescript
import { describe, it, expect, vi } from "vitest";
import { createMockBrowserActions } from "../fixtures/mock-browser-actions";

describe("ChatGPTPage.clickComposer", () => {
    it("clicks the prompt textarea", async () => {
        const mock = createMockBrowserActions();
        const page = new ChatGPTPage();

        await page.clickComposer(mock);

        expect(mock.click).toHaveBeenCalledWith("#prompt-textarea");
    });
});
```

### Snapshots de fixture

Los archivos en `tests/fixtures/snapshots/` representan el output de `page.accessibility.snapshot()` de Playwright en formato texto plano.

**Para obtener un snapshot real:**

```typescript
const snapshot = await page.accessibility.snapshot();
console.log(JSON.stringify(snapshot, null, 2));
```

Convierte el JSON al formato texto que `parseSnapshotEntries()` espera (líneas con `role "label"`).

### Cobertura

```bash
npm run test:coverage
```

El reporte HTML se genera en `coverage/index.html`. Umbral mínimo: **60% de statements**.

## Tests de Integración (Playwright Test)

### Requisitos

- Navegador instalado (Chrome, Brave, o Chromium)
- Cookies válidas de ChatGPT en `.auth/chatgpt-cookies.json`

### Configurar cookies

```bash
# Abre un navegador para login manual y guarda las cookies
bun run scripts/save-chatgpt-cookies.ts
```

Esto guarda las cookies en `.auth/chatgpt-cookies.json` (directorio ignorado en `.gitignore`).

### Comandos

```bash
# Ejecutar todos los tests E2E
npm run test:e2e

# Equivalentemente:
npx playwright test

# Ejecutar un archivo específico
npx playwright test tests/integration/chatgpt-flow.chatgpt.spec.ts

# Modo UI (interactivo con GUI)
npm run test:e2e:ui
# o:
npx playwright test --ui

# Listar tests sin ejecutar
npx playwright test --list
```

### Escribir un nuevo test E2E

1. Crear el archivo en `tests/integration/` con sufijo `.chatgpt.spec.ts`
2. Marcar con `test.describe.skip()` si requiere auth (para no fallar en CI sin cookies)
3. Usar `test.beforeEach()` para setup de contexto con cookies

```typescript
import { test, expect } from "@playwright/test";

test.describe.skip("ChatGPT integration", () => {
    test("sends a prompt and receives a response", async ({ browser }) => {
        const context = await browser.newContext({
            storageState: ".auth/chatgpt-cookies.json",
        });
        const page = await context.newPage();

        await page.goto("https://chatgpt.com");

        // Verificar que el composer está visible
        await expect(page.locator("#prompt-textarea")).toBeVisible();
    });
});
```

## Config

- **Vitest:** `vitest.config.ts`
- **Playwright:** `playwright.config.ts`

## Troubleshooting

### "Cannot find module"

Ejecuta `tsc --noEmit` para verificar que todas las importaciones están resueltas.

### Tests unitarios fallan después de un refactor

Los renombres de clases/funciones pueden romper imports en tests. Busca el nombre viejo:

```bash
rg "NombreViejo" tests/ -n
```

### Tests E2E fallan con timeout

Aumenta el timeout en `playwright.config.ts` o en el test individual:

```typescript
test("slow test", async ({ page }) => {
    test.setTimeout(300_000); // 5 minutos
});
```

### Tests de detección de plataforma fallan

Los tests de `browser-detection` y `cookie-paths` mockean `fs.existsSync`. Si necesitas mockear también `process.platform`:

```typescript
import { vi } from "vitest";

vi.stubGlobal("process", { ...process, platform: "win32" });
```

### Cookies expiradas

Si los tests E2E fallan porque las cookies expiraron:

```bash
# Regenerar cookies
bun run scripts/save-chatgpt-cookies.ts
```
