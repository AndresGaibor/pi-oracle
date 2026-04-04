# Arquitectura de pi-oracle

## Visión General

Pi-oracle es una extensión para el agente de codificación **pi** que automatiza interacciones con proveedores de IA (ChatGPT, y futuramente Claude, Gemini, etc.) mediante Playwright. Su arquitectura sigue el principio de **Dependency Inversion**: las capas superiores (worker, jobs) dependen de abstracciones (`AIProviderPage`), no de implementaciones concretas (`ChatGPTPage`).

## Capas de Arquitectura

```
┌─────────────────────────────────────────────┐
│              Extension Entry                │
│              index.ts                       │
│  Registra comandos, tools, pollers en pi   │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│              Worker Layer                   │
│              worker/run-oracle-job.ts       │
│  Proceso aislado que ejecuta jobs          │
│  Usa createProviderPage() (factory)        │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│              Job Runner                     │
│              lib/ai-job-runner.ts           │
│  Orquestación: launch → auth → send → wait │
│  Delega a ArtifactDownloader, ModelConfig  │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         Provider Abstraction                │
│         pages/ai-provider.types.ts          │
│  Interfaz AIProviderPage (contrato)        │
│  Factory: createProviderPage()             │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌───────────────┐    ┌───────────────┐
│  ChatGPT      │    │  Claude       │
│  Provider     │    │  (futuro)     │
│               │    │               │
│  pages/       │    │  pages/       │
│  chatgpt/     │    │  claude/      │
│  .selectors   │    │  .selectors   │
│  .actions     │    │  .actions     │
│  .assertions  │    │  .assertions  │
│  .page        │    │  .page        │
└───────────────┘    └───────────────┘
```

## Estructura del Código

```
extensions/oracle/
├── index.ts                      # Entry point de la extensión
├── lib/
│   ├── ai-job-runner.ts          # Orquestador del ciclo de vida del job
│   ├── browser-detection.ts      # Detección auto de navegador (4 capas)
│   ├── browser.ts                # Lanzamiento y configuración del browser
│   ├── commands.ts               # Registro de comandos (/oracle, etc.)
│   ├── config.ts                 # OracleConfig y validación
│   ├── constants.ts              # Constantes nombradas (timeouts, etc.)
│   ├── cookie-paths.ts           # Rutas de cookies por plataforma
│   ├── cookies.ts                # Lectura y filtrado de cookies
│   ├── jobs.ts                   # Definición de OracleJob
│   ├── locks.ts                  # Exclusión mutua por conversación
│   ├── poller.ts                 # Polling de estado para jobs
│   ├── runtime.ts                # Configuración de runtime del agente
│   └── tools.ts                  # Tools del agente (oracle_submit, etc.)
├── pages/
│   ├── ai-provider.types.ts      # Interfaz AIProviderPage (contrato)
│   ├── base.page.ts              # Clase base abstracta para POM
│   ├── browser-actions.types.ts  # Interfaz BrowserActions
│   ├── provider-factory.ts       # Factory pattern para proveedores
│   └── chatgpt/
│       ├── chatgpt.selectors.ts  # Selectores CSS/data-testid
│       ├── chatgpt.actions.ts    # Funciones puras de acción
│       ├── chatgpt.assertions.ts # Funciones puras de aserción
│       ├── chatgpt.page.ts       # Page Object principal
│       ├── chatgpt-auth.selectors.ts
│       ├── chatgpt-auth.actions.ts
│       ├── chatgpt-auth.assertions.ts
│       └── chatgpt-auth.page.ts  # Auth page para ChatGPT
├── shared/
│   ├── login-utils.ts            # Clasificación de páginas de login
│   ├── login-probe-types.ts      # Tipado para login probe
│   ├── snapshot-utils.ts         # Parser de snapshots de accesibilidad
│   └── spawn-utils.ts            # Utilidades para spawn de procesos
└── worker/
    ├── run-oracle-job.ts         # Entry point del worker
    ├── auth-bootstrap.ts         # Bootstrap de autenticación
    └── auth-cookie-policy.ts     # Política de cookies (re-export)
```

## Módulos Clave

### `lib/ai-job-runner.ts`

Orquesta el ciclo de vida completo de un job: lanza el navegador, verifica autenticación, envía el prompt, espera la respuesta, extrae el texto y descarga artefactos. Delega tareas especializadas a:

- **`ArtifactDownloader`** — Detección y descarga de archivos generados
- **`ModelConfigurator`** — Selección de modelo y configuración de effort

### `lib/browser-detection.ts`

Detecta automáticamente el navegador instalado en la plataforma actual (macOS, Linux, Windows). Sigue una **estrategia de 4 capas** con fallback:

1. Configuration explícita (`config.browser.executablePath`)
2. Variable de entorno (`BROWSER_PATH`, `ORACLE_BROWSER_PATH`)
3. Auto-detección basada en preferencia de plataforma (Brave → Chrome → Edge → Chromium)
4. Chromium bundled de Playwright

### `lib/cookie-paths.ts`

Detecta las rutas de cookies del navegador según la plataforma y el browser. Soporta:

- **macOS:** `~/Library/Application Support/BraveBrowser/Default/Cookies`
- **Linux:** `~/.config/BraveSoftware/Brave-Browser/Default/Cookies` (incluyendo Flatpak)
- **Windows:** `%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\Network\Cookies`

### `lib/constants.ts`

Constantes nombradas para timeouts, intervals, umbrales y límites. Evita constantes mágicas en el código. Ejemplo:

```typescript
export const RESPONSE_POLL_INTERVAL_MS = 2_000;
export const RESPONSE_TIMEOUT_MS = 120_000;
export const AUTH_TRANSITION_TIMEOUT_MS = 30_000;
```

### `pages/ai-provider.types.ts`

Define la interfaz `AIProviderPage` que todos los proveedores de IA deben implementar. Esta es la **clave de la arquitectura de swap de proveedor**. Incluye:

- `AIProviderConfig` — Configuración necesaria
- `AIProviderResult` — Resultado de la interacción
- `ArtifactEntry` — Artefactos generados
- `ClassifyParams` / `ClassifyResult` — Clasificación de estado de página
- `WaitOpts` — Opciones de espera para polling

### `pages/provider-factory.ts`

Factory pattern que retorna la implementación correcta de `AIProviderPage` según la URL del chat configurada. Agregar un nuevo proveedor solo requiere registrarlo aquí.

### `pages/base.page.ts`

Clase base abstracta para todos los Page Objects. Proporciona métodos comunes de snapshot y delegación a browser actions.

### `shared/snapshot-utils.ts`

Funciones puras (`@pure`) para parsear snapshots de accesibilidad de Playwright. Es la base de todos los assertions y detecciones de estado. Incluye:

- `parseSnapshotEntries()` — Parsea snapshot de Playwright en array estructurado
- `findLabeledEntry()` — Busca una entrada por label exacto
- `hasEntry()` — Verifica existencia de una entrada
- `classifyPage()` — Clasificación genérica basada en snapshots

## Patrones de Diseño

### Page Object Model (POM)

Cada proveedor de IA tiene **4 archivos** separados por responsabilidad:

| Archivo | Responsabilidad | Ejemplo |
|---------|----------------|---------|
| `.selectors.ts` | Selectores CSS, `data-testid`, labels (fuente única) | `chatgpt.selectors.ts` |
| `.actions.ts` | Funciones puras de acción (reciben `BrowserActions`) | `chatgpt.actions.ts` |
| `.assertions.ts` | Funciones puras de aserción (reciben snapshot string) | `chatgpt.assertions.ts` |
| `.page.ts` | Page Object principal (extiende `BasePage`, delega) | `chatgpt.page.ts` |

La separación de archivos permite:
- Testear actions y assertions de forma unitaria (sin navegador)
- Reutilizar funciones puras fuera del contexto de page
- Mantener selectores como fuente única de verdad

### Factory Pattern

`createProviderPage()` encapsula la lógica de selección de proveedor:

```typescript
const page = createProviderPage(config.chatUrl);
// Retorna ChatGPTPage si chatUrl es "https://chatgpt.com"
// Retorna ClaudePage si se registra "https://claude.ai"
```

### Dependency Inversion

Las capas superiores (worker, job runner, extensión) dependen de `AIProviderPage` (abstracción), no de `ChatGPTPage` (implementación). Esto permite:

- Agregar Claude sin modificar el worker
- Agregar Gemini sin modificar el job runner
- Hacer mock del provider en tests

### Strategy Pattern

1. **Detección de browser:** 4 capas con fallback (config → env → auto → bundled)
2. **Clasificación de página:** varía por proveedor (`classifyChatGPTPage`, `classifyClaudePage`)
3. **Estrategia de envío:** Enter-first (evita buscar botones "camaleónicos")

## Convenciones

### Selectores

**Usar SIEMPRE:**
- `data-testid` (prioritario, estables entre deploys)
- Atributos semánticos (`aria-label`, `data-message-author-role`, etc.)
- IDs estructurales (`#prompt-textarea`)

**NUNCA depender de:**
- Clases CSS de Tailwind (cambian con cada deploy)
- Text labels traducibles ("Copy response", "Stop streaming")
- Estructura DOM específica

### Imports

- **Estáticos** al inicio del archivo (nunca `await import()` dinámico ni `require()`)
- Tipos con `import type { ... }` cuando solo se necesitan como tipos
- Rutas relativas con extensión `.ts` (ESM)

### Nombres

- Constantes: `SCREAMING_SNAKE_CASE` con unidades (`_MS`, `_SECONDS`)
- Funciones puras: marcadas con `@pure` en JSDoc
- Clases: PascalCase, nombre describe responsabilidad (`AIJobRunner`, `ArtifactDownloader`)
- Archivos: `kebab-case`

### Funciones Puras

Las funciones puras (`@pure`) son la base del testeo unitario:
- No tienen efectos secundarios
- El resultado depende únicamente de los argumentos
- Se testean sin mocks ni navegador
- Ejemplo: `isResponseComplete(snapshot: string): boolean`

## Comunicación entre Procesos

El worker se comunica con la extensión mediante el sistema de archivos:

```
/tmp/oracle-{job-id}/
├── job.json          # Estado del job (config, progreso, resultado)
├── heartbeat.json    # Heartbeat periódico para detectar jobs zombies
└── artifacts/        # Archivos descargados del proveedor de IA
```

## Flujo de un Job

```
1. Extension recibe comando "/oracle" del agente pi
2. Crea un OracleJob con la config del prompt
3. Spawnea worker/run-oracle-job.ts como proceso aislado
4. Worker:
   a. Detecta navegador (browser-detection.ts)
   b. Lanza navegador con perfil aislado
   c. Carga cookies (cookie-paths.ts + cookies.ts)
   d. Crea AIProviderPage via factory
   e. Clasifica estado de página (auth, ready, challenge)
   f. Si no autenticado → espera login manual
   g. Envía prompt (sendPrompt con estrategia Enter)
   h. Espera respuesta (polling con timeout)
   i. Extrae texto del asistente
   j. Descarga artefactos (ArtifactDownloader)
   k. Escribe resultado en job.json
5. Extension lee resultado y lo devuelve al agente pi
```
