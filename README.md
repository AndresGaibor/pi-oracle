# pi-oracle

Extensión para el agente de codificación **pi** ([`@mariozechner/pi-coding-agent`](https://github.com/mariozechner/pi-coding-agent)) que usa ChatGPT como un oráculo web de larga duración — sin costos de API, sin bloquear el agente, y con ejecución asíncrona en segundo plano.

Envía prompts de proyectos grandes, espera respuestas, extrae texto y descarga artefactos — todo en perfiles de navegador aislados.

## Qué hace

La extensión añade comandos al agente pi:

- `/oracle <solicitud>` — Ejecuta un trabajo de oráculo
- `/oracle-auth` — Autenticación con ChatGPT
- `/oracle-status [job-id]` — Estado de un trabajo
- `/oracle-cancel [job-id]` — Cancelar un trabajo
- `/oracle-clean <job-id|all>` — Limpiar artefactos

Un trabajo de oráculo:

1. Recopila un archivo del proyecto
2. Abre ChatGPT en un perfil de navegador aislado
3. Carga el archivo y envía el prompt
4. Espera en segundo plano
5. Persiste la respuesta y artefactos bajo `/tmp/oracle-<job-id>/`
6. Despierta la sesión de pi original al completarse

## Instalación

### Prerrequisitos

- Node.js >= 20
- npm >= 9
- Brave Browser instalado (o Chrome/Chromium como alternativa)
- ChatGPT con sesión activa en el navegador

### Pasos

```bash
# Instalar via npm
pi install npm:pi-oracle

# O desde GitHub
pi install https://github.com/AndresGaibor/pi-oracle
```

## Configuración

### Configuración mínima

No se necesita configuración explícita. Pi-oracle usa valores por defecto:

1. Asegúrate de que ChatGPT funcione en tu perfil local de Brave
2. Ejecuta `/oracle-auth`
3. Ejecuta una prueba pequeña con `/oracle`

### Configuración personalizada

Archivos de configuración:

- **Global:** `~/.pi/agent/extensions/oracle.json`
- **Proyecto:** `.pi/extensions/oracle.json`

Configuraciones comunes:

| Campo | Descripción |
|-------|-------------|
| `browser.executablePath` | Ruta al ejecutable del navegador |
| `browser.args` | Argumentos adicionales para el navegador |
| `browser.authSeedProfileDir` | Directorio del perfil de autenticación |
| `browser.runtimeProfilesDir` | Directorio de perfiles de runtime |
| `auth.braveProfile` | Nombre del perfil de Brave |
| `chatModelFamily` | Modelo a usar (ej: `gpt-4o`) |
| `effort` | Nivel de reasoning (ej: `light`, `medium`, `high`) |

La configuración del proyecto solo debe sobrescribir valores seguros y sin privilegios.

### Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `BROWSER_PATH` | Ruta al ejecutable del navegador | Auto-detectado |
| `ORACLE_BROWSER_PATH` | Alternativa a BROWSER_PATH | Auto-detectado |
| `NODE_ENV` | Entorno de ejecución | `"production"` |

## Uso

Ejemplo de uso:

```text
/oracle Invoca el Oráculo para que genere una revisión exhaustiva del código de los cambios pendientes. Incluye todos los archivos modificados y archivos adyacentes en el archivo. Usa el Modelo Pro con esfuerzo extendido.
```

## Arquitectura

Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para una descripción detallada de la arquitectura, patrones de diseño y convenciones.

Resumen rápido:

- **Page Object Model (POM):** Cada proveedor tiene 4 archivos (selectors, actions, assertions, page)
- **Abstracción de proveedor:** `AIProviderPage` permite swap ChatGPT ↔ Claude sin refactor
- **Factory pattern:** `createProviderPage()` selecciona el proveedor según la URL
- **Worker isolation:** Cada job se ejecuta en un proceso aislado
- **Multiplataforma:** macOS, Linux, Windows (detección automática de navegador y cookies)

## Desarrollo

### Ejecutar tests

```bash
# Tests unitarios (rápidos, sin navegador)
npm test

# Modo watch
npm run test:watch

# Tests con cobertura
npm run test:coverage

# Tests de integración (requieren navegador + cookies)
npm run test:e2e

# Tests E2E en modo UI interactivo
npm run test:e2e:ui
```

Ver [docs/TESTING.md](docs/TESTING.md) para más detalles.

### Agregar un nuevo proveedor de IA

Ver [docs/ADDING-A-PROVIDER.md](docs/ADDING-A-PROVIDER.md) para la guía paso a paso.

### Helpers de validación

```bash
npm run check:oracle-extension    # Bundle check + type check
npm run sanity:oracle             # Sanity check de la extensión
npm run pack:check                # Verificar npm pack
```

## Contribuir

Ver [CONTRIBUTING.md](CONTRIBUTING.md) para el flujo de trabajo, convenciones y formato de commits.

## Privacidad

Esta extensión es local-first, pero lee y persiste datos locales:

- `/oracle-auth` lee cookies de ChatGPT del navegador
- Los archivos de trabajos se cargan en ChatGPT.com
- Respuestas y artefactos se escriben bajo `/tmp/oracle-<job-id>/`

Revisa el código y `docs/ORACLE_DESIGN.md` antes de usarlo con material sensible.

## Licencia

[MIT](LICENSE)
