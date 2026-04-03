# Inventario de invocaciones a `agent-browser`

Resumen: este documento enumera todas las invocaciones a la CLI `agent-browser` que realiza el código del worker y los scripts de autenticación en este repositorio. Para cada comando se da una plantilla (con variables) y un mapeo de las líneas/archivos donde el código construye o llama a ese comando.

## 1) Plantillas de comandos observadas

Nota: la mayoría de invocaciones usan un prefijo común `--session <session>` generado por las funciones helpers. Cuando corresponde, incluyo flags opcionales que el código puede añadir.

- Cerrar sesión / cerrar browser
  - agent-browser --session <SESSION> close

- Abrir / lanzar browser (con opciones de lanzamiento)
  - agent-browser --session <SESSION> --profile <PROFILE> [--executable-path <PATH>] [--user-agent <UA>] [--args <comma-joined-args>] [--headed] open <URL>

- Estado / stream status (JSON)
  - agent-browser --session <SESSION> --json stream status

- Evaluar script en la página (lee script por stdin)
  - agent-browser --session <SESSION> eval --stdin   (script enviado por stdin)

- Obtener URL actual
  - agent-browser --session <SESSION> get url

- Obtener texto de la página / cuerpo
  - agent-browser --session <SESSION> get text body

- Snapshot textual (UI snapshot)
  - agent-browser --session <SESSION> snapshot -i

- Click por referencia
  - agent-browser --session <SESSION> click <REF>

- Rellenar campo
  - agent-browser --session <SESSION> fill <REF|selector> <TEXT>

- Presionar tecla
  - agent-browser --session <SESSION> press <KEY>

- Esperar (sleep dentro del adapter)
  - agent-browser --session <SESSION> wait <ms>

- Subir fichero a selector input[type=file]
  - agent-browser --session <SESSION> upload <selector> <path>

- Descargar artefacto usando ref y destino
  - agent-browser --session <SESSION> download <ref> <dest>

- Hacer screenshot
  - agent-browser --session <SESSION> screenshot <path>

- Cookies: limpiar y setear
  - agent-browser --session <SESSION> cookies clear
  - agent-browser --session <SESSION> cookies set <name> <value> --domain <domain> --path <path> [--httpOnly] [--secure] [--sameSite <value>] [--expires <epoch>]

- Reload / recargar página
  - agent-browser --session <SESSION> reload

- Otros: commands genéricos compuestos por los adapters (ej. `--args` con coma)
  - agent-browser --session <SESSION> --args <comma-joined-args>


## 2) Mapeo línea → archivo (invocaciones directas o puntos donde se construye/usa el comando)

Se listan las ubicaciones encontradas en el repo (archivo:linea). Estas referencias provienen del código fuente actual en `extensions/oracle/worker/*` y `extensions/oracle/lib`.

- extensions/oracle/worker/auth-bootstrap.mjs
  - 176: spawnCommand("agent-browser", [...targetBrowserBaseArgs(), "close"], { allowFailure: true });
    - Corresponde a: agent-browser --session <AUTH_SESSION> close
  - 248: spawnCommand("agent-browser", args, { allowFailure: true });
    - Uso: lanzamiento con args construidos en targetBrowserBaseArgs({ withLaunchOptions: true, mode: "headed" }) + ["open", "about:blank"] → agent-browser --session <AUTH_SESSION> --profile <PROFILE> ... open about:blank
  - 256: spawnCommand("agent-browser", [...targetBrowserBaseArgs(), "--json", "stream", "status"], { allowFailure: true });
    - Corresponde a: agent-browser --session <AUTH_SESSION> --json stream status
  - 285: spawnCommand("agent-browser", [...targetBrowserBaseArgs(), ...args], options);
    - Punto central donde se delegan múltiples comandos (eval, open, get, snapshot, click, cookies, screenshot, reload, etc.) desde el helper targetCommand

- invocaciones a helper `targetCommand` (construye y ejecuta agent-browser) — `extensions/oracle/worker/auth-bootstrap.mjs`
  - 273: definición async function targetCommand(...args) { ... }
  - 304: targetCommand("eval", "--stdin", { input: script, logLabel });
    - agent-browser --session <AUTH_SESSION> eval --stdin  (stdin contiene script)
  - 314: targetCommand("open", url, { logLabel: `open ${label}` });
    - agent-browser --session <AUTH_SESSION> open <url>
  - 318: targetCommand("get", "url", { logLabel: "get url" });
    - agent-browser --session <AUTH_SESSION> get url
  - 323: targetCommand("snapshot", "-i", { logLabel: "snapshot -i" });
    - agent-browser --session <AUTH_SESSION> snapshot -i
  - 328: targetCommand("get", "text", "body", { allowFailure: true, logLabel: "get text body" });
    - agent-browser --session <AUTH_SESSION> get text body
  - 366: targetCommand("click", ref, { logLabel });
    - agent-browser --session <AUTH_SESSION> click <ref>
  - 453: targetCommand("cookies", "clear", { logLabel: "cookies clear" });
    - agent-browser --session <AUTH_SESSION> cookies clear
  - 459: targetCommand(...args, { logLabel: `cookies set ${cookie.name}@${cookie.domain}` });
    - agent-browser --session <AUTH_SESSION> cookies set <name> <value> --domain <domain> --path <path> [--httpOnly] [--secure] [--sameSite <v>] [--expires <n>]
  - 607: targetCommand("screenshot", SCREENSHOT_PATH, { allowFailure: true, logLabel: `screenshot ${reason}` })
    - agent-browser --session <AUTH_SESSION> screenshot <path>
  - 794 / 808: targetCommand("reload", { allowFailure: true, logLabel: "reload" })
    - agent-browser --session <AUTH_SESSION> reload

- extensions/oracle/worker/run-job.mjs
  - 331: spawnCommand("agent-browser", [...browserBaseArgs(job), "close"], { allowFailure: true });
    - agent-browser --session <RUNTIME_SESSION> close
  - 341: spawnCommand("agent-browser", [...browserBaseArgs(job, { withLaunchOptions: true, mode }), "open", url]);
    - agent-browser --session <RUNTIME_SESSION> --profile <PROFILE> ... open <url>
  - 346: spawnCommand("agent-browser", [...browserBaseArgs(job), "--json", "stream", "status"], { allowFailure: true });
    - agent-browser --session <RUNTIME_SESSION> --json stream status
  - 378: return spawnCommand("agent-browser", [...browserBaseArgs(job), ...args], options);
    - Punto central donde se ejecutan los comandos solicitados por la función wrapper `agentBrowser`

- invocaciones a helper `agentBrowser` (construye y ejecuta agent-browser) — `extensions/oracle/worker/run-job.mjs`
  - 363: definición async function agentBrowser(job, ...args) { ... }
  - 398: agentBrowser(job, "eval", "--stdin", { input: script });
    - agent-browser --session <RUNTIME_SESSION> eval --stdin
  - 421: agentBrowser(job, "get", "url");
    - agent-browser --session <RUNTIME_SESSION> get url
  - 437: agentBrowser(job, "snapshot", "-i");
    - agent-browser --session <RUNTIME_SESSION> snapshot -i
  - 442: agentBrowser(job, "get", "text", "body", { allowFailure: true });
    - agent-browser --session <RUNTIME_SESSION> get text body
  - 670: agentBrowser(job, "click", ref);
    - agent-browser --session <RUNTIME_SESSION> click <ref>
  - 713: agentBrowser(job, "fill", entry.ref, text);
    - agent-browser --session <RUNTIME_SESSION> fill <ref> <text>
  - 790: agentBrowser(job, "screenshot", join(job.logsDir, `${reason}.png`)).catch(() => undefined);
    - agent-browser --session <RUNTIME_SESSION> screenshot <path>
  - 815 / 828: agentBrowser(job, "reload").catch(() => undefined);
    - agent-browser --session <RUNTIME_SESSION> reload
  - 946 / 957 / 986 / 999 / 1008 / 1031 / 1030 etc: agentBrowser(job, "wait", "800") / "press" / "wait" used in many places
    - wait/press/wait: agent-browser --session <RUNTIME_SESSION> wait <ms> ; press <key>
  - 1057: agentBrowser(job, "upload", "input[type=file]", job.archivePath);
    - agent-browser --session <RUNTIME_SESSION> upload input[type=file] <path>
  - 1366: agentBrowser(job, "download", entry.ref, destinationPath, { timeoutMs: ARTIFACT_DOWNLOAD_TIMEOUT_MS })
    - agent-browser --session <RUNTIME_SESSION> download <ref> <dest>

- extensions/oracle/lib/runtime.ts
  - 183: spawn("agent-browser", ["--session", runtime.runtimeSessionName, "close"], { stdio: "ignore" });
    - agent-browser --session <RUNTIME_SESSION> close

## 3) Notas sobre opciones / flags especiales esperadas por el adaptador

- --session <NAME>
  - Todas las invocaciones pasan un `--session` y el adaptador debe mapear ese session name a una instancia/ctx de navegador aislada. El código espera que multiples sesiones puedan coexistir (session prefix + id).

- --profile <PATH>, --executable-path, --user-agent, --args (coma-separados), --headed
  - Estos flags son construidos por `*BrowserBaseArgs(..., { withLaunchOptions: true })`. El adaptador debe aceptar y aplicar: perfil (ruta de user-data), ruta ejecutable del navegador, user-agent, args adicionales (pasados como una única cadena con comas) y flag --headed para modo con UI.

- --json stream status
  - Se espera que `agent-browser --json stream status` imprima JSON en stdout con estructura que incluye `data.connected` boolean. El adaptador debe exponer un equivalente (estatus de conexión). El código parsea stdout y lee parsed.data.

- eval --stdin
  - El worker envía scripts por stdin y espera JSON o texto como resultado; el adapter debe ejecutar el script en la página (contexto de la pestaña activa) y retornar por stdout el resultado serializado (JSON string o texto), similar a como lo espera parseEvalResult/parseJson.

- snapshot -i / snapshot textual
  - `snapshot -i` produce la representación textual del DOM/UI que los parsers usan (ref=e123, kind="button", etc.). Este formato es propiedad del actual `agent-browser` CLI; un adaptador Playwright debe reproducir la salida (o una variante compatible) para que el parsing de snapshotText/parseSnapshotEntries siga funcionando.

- upload / download
  - upload selector + path: el adaptador debe encontrar el elemento input[type=file] y subir local file path.
  - download ref dest: el CLI actual descarga el recurso apuntado por `ref` (ref=eNNN) y guarda en destino. El adaptador debe resolver el ref (presumiblemente mapeado a un elemento/link en la página) y seguir la descarga, guardando en la ruta destino.
  - Debe soportar un timeoutMs opcional (el worker pasa ARTIFACT_DOWNLOAD_TIMEOUT_MS en opciones).

- cookies set/clear
  - El adaptador debe poder limpiar cookies y setear cookies con flags (httpOnly, secure, sameSite, expires) en el perfil/session indicado.

- argumentos pasados via --args (coma separada)
  - El código junta job.config.browser.args con `args.join(",")` y lo pasa en `--args`. Adaptador debe dividir por comas y aplicar cada arg como flag de navegación al lanzar el navegador.

## 4) Casos difíciles / comandos potencialmente no soportados nativamente por Playwright

- Snapshot textual exacto (formato `ref=eNNN`, `kind`, `label`, etc.)
  - El repositorio depende fuertemente de un formato textual específico para snapshots que contiene `ref=e123` y tipos de UI (button, textbox, combobox, menuitem, link) y valores/labels esperados por los parsers. Playwright no produce ese formato por defecto: habrá que implementar la serialización personalizada que emule la salida actual de `agent-browser snapshot -i`. Este es el trabajo más costoso para el adaptador.

- `download <ref> <dest>` usando `ref` (eNNN)
  - `ref` es un identificador interno en el snapshot/sistema de `agent-browser`. Si el adaptador no mantiene la misma ref-mapping (asignación entre elementos y refs), habrá que implementar compatibilidad: mapear refs a selectores/elements y realizar la descarga. Requiere mantener estado entre snapshot/acciones.

- `--args` coma-separados
  - Algunos args esperados por `agent-browser` pueden ser específicos de Chromium/Chrome flags. Playwright lanza el navegador con sus propias opciones; se debe mapear o filtrar los args para que Playwright/Chromium los acepte.

- Ejecución de script por stdin y serialización exacta de salida
  - parseEvalResult en el código espera JSON o texto, y en algunos casos el stdout viene doblemente-stringified. El adaptador debe reproducir exactamente las convenciones (p.ej. JSON.stringify del valor retornado) para mantener compatibilidad.

- `--profile` apuntando a Chrome profile real
  - Playwright soporta usar user-data-dir en Chromium, pero hay diferencias en las versiones y flags. Reusar perfiles de Chrome reales puede fallar o necesitar flags adicionales. Debe probarse en entorno real.


## 5) Archivos creados / próximos pasos

- Se añadió un adaptador base en `adapter/playwright-adapter.ts` (esqueleto) y scripts de soporte en `scripts/` junto con este `adapter/INVOCATIONS.md` y `adapter/README.md` (explican el flag USE_PLAYWRIGHT). Estos archivos están pensados como punto de partida para la implementación completa del adaptador Playwright.

---

Si quieres, puedo: (A) implementar el adaptador básico que ejecuta los comandos listados (stubs) y devuelve simulaciones, o (B) empezar a implementar las funciones clave reales (snapshot serialization, download by ref, cookie management) detrás del flag USE_PLAYWRIGHT. ¿Qué prefieres que haga a continuación?