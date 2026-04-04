# Guía de Testing

## Visión General

Pi-oracle usa **dos capas** de testing que se complementan:

| Capa | Runner | Requiere | Velocidad | Cobertura esperada |
|------|--------|----------|-----------|--------------------|
| **Unitarios** | Vitest v4 | Nada (sin navegador, sin cookies) | ~5-30 segundos | >80% statements |
| **Integración** | Playwright Test | Navegador + cookies de ChatGPT | ~2-5 minutos | Flujo completo |

**Regla de oro:** Cada función pura (`@pure`) DEBE tener tests unitarios. Las funciones que interactúan con el navegador se testean en integración.

## Tests Unitarios (Vitest)

### Comandos Rápidos

```bash
# Todos los tests
npm test

# Modo watch (re-ejecuta al guardar)
npm run test:watch

# Un archivo específico
npx vitest run tests/unit/snapshot-utils.test.ts

# Filtrar por nombre de test
npx vitest run -t "isResponseComplete"

# Con cobertura
npm run test:coverage

# Con reporter verbose (muestra cada test)
npx vitest run --reporter=verbose
```

### Estructura de Tests

```
tests/
├── unit/                              # Tests unitarios
│   ├── snapshot-utils.test.ts         # 33 tests — Parser de snapshots
│   ├── chatgpt-assertions.test.ts     # 34 tests — Detección de estados
│   ├── chatgpt-auth-assertions.test.ts# 27 tests — Auth page detection
│   ├── chatgpt-selectors.test.ts      # 23 tests — Validación de selectores
│   ├── chatgpt-page.test.ts           # 16 tests — Page Object unitario
│   ├── login-utils.test.ts            #  9 tests — Clasificación de páginas
│   ├── browser-detection.test.ts      # 17 tests — Detección multiplataforma
│   ├── cookie-paths.test.ts           #  9 tests — Rutas de cookies
│   ├── config.test.ts                 # 11 tests — Validación de config
│   └── jobs.test.ts                   # 13 tests — State machine de jobs
│
├── fixtures/
│   ├── snapshots/                     # Snapshots reales
│   │   ├── login-page.snapshot.txt
│   │   ├── chat-ready.snapshot.txt
│   │   ├── response-in-progress.snapshot.txt
│   │   ├── response-complete.snapshot.txt
│   │   ├── challenge-page.snapshot.txt
│   │   └── outage-page.snapshot.txt
│   └── mock-browser-actions.ts        # Mock factory
│
└── integration/                       # E2E con navegador real
    ├── chatgpt-flow.chatgpt.spec.ts
    └── page-classification.chatgpt.spec.ts
```

### Escribir Tests — Patrones

#### Patrón 1: Función Pura

La categoría más fácil. Solo input → output.

```typescript
import { describe, it, expect } from "vitest";
import { isResponseComplete } from "../../extensions/oracle/pages/chatgpt/chatgpt.assertions";

describe("isResponseComplete", () => {
    it("returns true when Copy response appears without Stop streaming", () => {
        const snapshot = 'button "Copy response"\nbutton "Good response"';
        expect(isResponseComplete(snapshot)).toBe(true);
    });

    it("returns false when Stop streaming is active", () => {
        const snapshot = 'button "Stop streaming"';
        expect(isResponseComplete(snapshot)).toBe(false);
    });

    it("returns false when snapshot is empty", () => {
        expect(isResponseComplete("")).toBe(false);
    });

    it("handles Spanish UI labels", () => {
        const snapshot = 'button "Detener la transmisión"';
        expect(isResponseComplete(snapshot)).toBe(false);
    });
});
```

#### Patrón 2: Función Pura con Snapshots de Fixture

Para lógica compleja, usa snapshots reales guardados.

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyChatPage } from "../../extensions/oracle/shared/login-utils";

const fixturePath = (name: string) =>
    join(__dirname, "../fixtures/snapshots", name);

describe("classifyChatPage", () => {
    it("detects chat-ready state", () => {
        const snapshot = readFileSync(fixturePath("chat-ready.snapshot.txt"), "utf8");
        const result = classifyChatPage({
            snapshot,
            url: "https://chatgpt.com/",
            body: "",
        });
        expect(result.state).toBe("authenticated_and_ready");
    });

    it("detects login page", () => {
        const snapshot = readFileSync(fixturePath("login-page.snapshot.txt"), "utf8");
        const result = classifyChatPage({
            snapshot,
            url: "https://chatgpt.com/auth/login",
            body: "",
        });
        expect(result.state).toBe("login_required");
    });

    it("detects challenge page", () => {
        const snapshot = readFileSync(fixturePath("challenge-page.snapshot.txt"), "utf8");
        const result = classifyChatPage({
            snapshot,
            url: "https://chatgpt.com/",
            body: "challenge.cloudflare.com",
        });
        expect(result.state).toBe("challenge_blocking");
    });

    it("detects outage page", () => {
        const snapshot = readFileSync(fixturePath("outage-page.snapshot.txt"), "utf8");
        const result = classifyChatPage({
            snapshot,
            url: "https://chatgpt.com/",
            body: "502 Bad Gateway",
        });
        expect(result.state).toBe("transient_outage_error");
    });
});
```

#### Patrón 3: Mock de BrowserActions

Para funciones que reciben `BrowserActions`.

```typescript
import { describe, it, expect, vi } from "vitest";
import { createMockBrowserActions } from "../fixtures/mock-browser-actions";

describe("ChatGPTPage", () => {
    it("clicks the correct composer element", async () => {
        const mock = createMockBrowserActions();
        const page = new ChatGPTPage("https://chatgpt.com");

        await page.clickComposer(mock);

        // Verifica que se llamó click con el selector correcto
        expect(mock.clickRef).toHaveBeenCalledWith("@e1");
    });

    it("returns assistant messages correctly", async () => {
        const mock = createMockBrowserActions();
        mock.evaluate.mockResolvedValue([
            { text: "Hello!" },
            { text: "Here is the code..." },
        ]);

        const page = new ChatGPTPage("https://chatgpt.com");
        const messages = await page.getAssistantMessages(mock);

        expect(messages).toHaveLength(2);
        expect(messages[0].text).toBe("Hello!");
    });

    it("throws when waitForResponse times out", async () => {
        const mock = createMockBrowserActions();
        mock.snapshotText.mockResolvedValue('button "Stop streaming"');
        
        const page = new ChatGPTPage("https://chatgpt.com");

        await expect(page.waitForResponse(mock, {
            baselineAssistantCount: 0,
            timeoutMs: 100,
            pollMs: 20,
        })).rejects.toThrow("Timed out");
    });
});
```

#### Patrón 4: Testing con `vi.mocked` y mocks de fs

Para módulos que leen del filesystem.

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "node:fs";

vi.mock("node:fs", () => ({
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
}));

describe("detectBrowserDataDir", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns macOS Brave path when dir exists", () => {
        vi.mocked(fs.existsSync).mockImplementation((p) =>
            String(p).includes("BraveSoftware")
        );

        // El test usa process.platform — mockear si es necesario
        const original = process.platform;
        Object.defineProperty(process, "platform", { value: "darwin" });

        const result = detectBrowserDataDir("brave");

        Object.defineProperty(process, "platform", { value: original });

        expect(result).toContain("BraveSoftware");
    });

    it("returns undefined when no browser dir exists", () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        expect(detectBrowserDataDir("brave")).toBeUndefined();
    });
});
```

### Snapshots de Fixture

**Cómo generar nuevos snapshots:**

1. Abre un navegador con `scripts/debug-headed.ts`:
```typescript
const snapshot = await page.accessibility.snapshot();
console.log(JSON.stringify(snapshot, null, 2));
```

2. Convierte el JSON a formato texto plano. La función `parseSnapshotEntries()` espera líneas como:
```
heading "ChatGPT said:" ref=e456
- button "Copy response" ref=e457
- textbox "Message ChatGPT" ref=e459
```

3. Guarda en `tests/fixtures/snapshots/{estado}.snapshot.txt`

**Convención de nombres:**
- `{proveedor}-{estado}.snapshot.txt` — ej: `chatgpt-ready.snapshot.txt`
- Estados comunes: `ready`, `login`, `streaming`, `complete`, `challenge`, `outage`

### Cobertura

```bash
npm run test:coverage
```

**Reporte:**
- HTML en `coverage/index.html`
- LCOV en `coverage/lcov.info`

**Umbral mínimo:** 60% statements (objetivo futuro: 80%).

**Configuración en `vitest.config.ts`:**
```typescript
coverage: {
    provider: "v8",
    reporter: ["text", "html", "lcov"],
    include: ["extensions/oracle/**/*.ts"],
    exclude: ["**/*.types.ts", "**/node_modules/**"],
}
```

## Tests de Integración (Playwright Test)

### Requisitos

- Navegador instalado
- Cookies válidas en `.auth/chatgpt-cookies.json`

### Configurar Cookies

```bash
# Generar cookies desde tu navegador
bun run scripts/save-chatgpt-cookies.ts
```

El script:
1. Lanza Chromium con tu perfil
2. Abre ChatGPT
3. Espera a que estés logueado
4. Guarda las cookies en `.auth/chatgpt-cookies.json`

### Ejecutar Tests E2E

```bash
# Todos los tests E2E
npm run test:e2e

# Un archivo específico
npx playwright test tests/integration/chatgpt-flow.chatgpt.spec.ts

# Solo un test específico
npx playwright test -g "sends a prompt"

# Modo UI interactivo (debug visual)
npm run test:e2e:ui

# Listar tests sin ejecutar
npx playwright test --list

# Generar reporte HTML
npx playwright test --reporter=html
```

### Patrón para Tests E2E

```typescript
import { test, expect } from "@playwright/test";

/**
 * Siempre usar .skip() — los tests E2E requieren cookies
 * reales y no deben fallar en CI.
 */
test.describe.skip("ChatGPT E2E", () => {

    test("classifies a logged-in page correctly", async ({ browser }) => {
        const context = await browser.newContext({
            storageState: ".auth/chatgpt-cookies.json",
        });
        const page = await context.newPage();

        await page.goto("https://chatgpt.com");
        await page.waitForLoadState("networkidle");

        const snapshot = await page.accessibility.snapshot();
        expect(snapshot).toBeTruthy();

        // Verificar que el composer está visible
        const hasComposer = String(snapshot).includes("Message");
        expect(hasComposer).toBe(true);
    });

    test("sends a prompt and receives a response", async ({ browser }) => {
        const context = await browser.newContext({
            storageState: ".auth/chatgpt-cookies.json",
        });
        const page = await context.newPage();

        await page.goto("https://chatgpt.com");
        await page.locator("#prompt-textarea").fill("Say hello in exactly 3 words");
        await page.keyboard.press("Enter");

        // Esperar respuesta
        await page.waitForSelector('[data-testid="copy-button"]', { timeout: 60000 });

        const response = await page.locator('[data-message-author-role="assistant"]').first().textContent();
        expect(response).toBeTruthy();
        expect(response!.split(/\s+/).length).toBeLessThanOrEqual(5);
    });
});
```

### Por qué `.skip()` por defecto?

Los tests E2E:
- Requieren cookies reales (no versionadas en git)
- Dependen de que ChatGPT esté operativo
- Son lentos (2-5 minutos)
- Pueden fallar por cambios en la UI de ChatGPT

En CI deberían ejecutarse solo con:
1. Un perfil de navegador configurado
2. Las cookies inyectadas
3. Un timeout mayor

## Config

### Vitest (`vitest.config.ts`)

```typescript
export default defineConfig({
    test: {
        include: ["tests/unit/**/*.test.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "html", "lcov"],
            include: ["extensions/oracle/**/*.ts"],
        },
    },
});
```

### Playwright (`playwright.config.ts`)

```typescript
export default defineConfig({
    testDir: "./tests/integration",
    timeout: 120_000,      // 2 minutos por test
    expect: { timeout: 10_000 },
    reporter: "list",
    use: {
        headless: true,
        trace: "on-first-retry",
        screenshot: "only-on-failure",
    },
});
```

## CI con GitHub Actions

### Workflow sugerido (`.github/workflows/test.yml`)

```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx tsc --noEmit

  unit-tests:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
        if: matrix.os == 'ubuntu-latest'

  e2e-tests:
    runs-on: ubuntu-latest
    # Solo en PRs con secret disponible
    if: github.event_name == 'pull_request' && secrets.CHATGPT_COOKIES != ''
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install chromium
      - name: Setup cookies
        run: |
          mkdir -p .auth
          echo "${{ secrets.CHATGPT_COOKIES }}" > .auth/chatgpt-cookies.json
      - run: npx playwright test --reporter=list
```

## Troubleshooting

### "Cannot find module"

```bash
# Verificar compilación de tipos
npx tsc --noEmit

# Verificar que las dependencias están instaladas
npm ls | head -20
```

### Tests unitarios fallan después de un refactor

```bash
# Buscar referencias al nombre viejo
rg "NombreViejo" tests/ -n

# Ejecutar un solo archivo para ver detalles
npx vitest run tests/unit/el-archivo.test.ts
```

### Tests de plataforma fallan en CI

Los tests de `browser-detection` y `cookie-paths` dependen de `process.platform` y `fs.existsSync`. Si mockean paths de macOS pero CI corre en Linux, fallarán.

**Solución:** Mockear `process.platform`:

```typescript
import { vi } from "vitest";

describe("macOS detection", () => {
    const original = process.platform;

    beforeEach(() => {
        Object.defineProperty(process, "platform", { value: "darwin" });
    });

    afterEach(() => {
        Object.defineProperty(process, "platform", { value: original });
    });

    it("finds Brave on macOS", () => {
        // ...
    });
});
```

### Tests E2E fallan con timeout

```typescript
// Aumentar timeout por test
test("slow operation", async ({ page }) => {
    test.setTimeout(300_000); // 5 minutos
    // ...
});
```

O en `playwright.config.ts`:
```typescript
timeout: 300_000,  // Global
```

### Cookies expiradas

Síntoma: Los tests E2E son redirigidos a login en vez de chat.

```bash
# Regenerar cookies
bun run scripts/save-chatgpt-cookies.ts

# Verificar que el archivo existe
ls -la .auth/chatgpt-cookies.json

# Verificar contenido (los valores están masked)
cat .auth/chatgpt-cookies.json | jq '.[].name' | head -5
```

### "Coverage threshold not met"

```bash
# Ver qué archivos tienen baja cobertura
npm run test:coverage

# Agregar tests para los archivos con <60%
# O excluir archivos triviales en vitest.config.ts:
coverage: {
    exclude: [
        "**/*.types.ts",       // Solo tipos, no tiene lógica
        "**/node_modules/**",
    ]
}
```

### Snapshot parse errors

Si `parseSnapshotEntries()` devuelve menos entradas de lo esperado:

```bash
# Verificar el formato del snapshot
# Debe tener líneas como: ref=e123
grep "ref=" tests/fixtures/snapshots/*.snapshot.txt | head
```

### Vitest no encuentra tests

```bash
# Verificar la configuración
cat vitest.config.ts

# Ejecutar manualmente
npx vitest run --config vitest.config.ts

# Ver qué archivos está incluyendo
npx vitest list
```

## Checklist para Agregar Tests

Cuando agregas una nueva función, asegúrate de:

- [ ] La función pura tiene al menos 2 tests (caso normal + edge case)
- [ ] Las funciones que usan `BrowserActions` tienen tests con mock
- [ ] Los selectores nuevos tienen tests contra snapshot
- [ ] Los nuevos estados de página tienen fixture de snapshot
- [ ] `npm test` pasa en verde
- [ ] La cobertura del archivo nuevo es >60%
