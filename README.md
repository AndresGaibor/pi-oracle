# pi-oracle

Extensión para el agente de codificación **pi** ([`@mariozechner/pi-coding-agent`](https://github.com/mariozechner/pi-coding-agent)) que usa ChatGPT como un oráculo web de larga duración — **sin costos de API, sin bloquear el agente, con ejecución asíncrona en segundo plano**.

Envía prompts de proyectos grandes, espera respuestas, extrae texto y descarga artefactos — todo en perfiles de navegador aislados que no interfieren con tu sesión activa.

---

## Quick Start

```bash
# 1. Instalar
pi install npm:pi-oracle

# 2. Asegúrate de que ChatGPT funcione en Brave (abre chatgpt.com en tu navegador)

# 3. Autenticar una vez
/oracle-auth

# 4. Ejecutar tu primer trabajo
/oracle Review the test coverage in tests/unit/ and suggest improvements
```

---

## ¿Qué es?

Pi-oracle conecta el agente pi con ChatGPT (y futuramente Claude, Gemini, etc.) para tareas de revisión de código, generación de código, análisis de arquitectura y más — usando la interfaz web real en lugar de la API.

### ¿Por qué no usar la API?

| Aspecto | API | pi-oracle |
|---------|-----|-----------|
| Costo por prompt grande | Alto (miles de tokens) | Gratis (cuenta existente) |
| Contexto largo | Limitado por plan | Generoso en web |
| Bloqueo del agente | Sí, espera respuesta | No, ejecución asíncrona |
| Artefactos (archivos) | No soportado | Descarga automática |
| Modelo Pro | $$$ | Incluido en Plus/Pro |

---

## Comandos Disponibles

### `/oracle <solicitud>`

Ejecuta un trabajo de oráculo completo:

1. Empaqueta el contexto del proyecto en un archivo
2. Abre ChatGPT en un perfil de navegador aislado
3. Envía el prompt
4. Espera la respuesta (minutos a horas)
5. Descarga artefactos generados
6. Devuelve el resultado al agente pi

### `/oracle-auth`

Configura la autenticación con ChatGPT:
- Lee las cookies de tu sesión activa de Brave
- Las inyecta en un perfil aislado
- Verifica que la sesión funciona

**Solo necesitas ejecutarlo una vez** (o cuando las cookies expiren).

### `/oracle-status [job-id]`

Muestra el estado actual de un trabajo:
```
Status: running
Phase: waiting
Progress: 75%
Started: 2 min ago
```

### `/oracle-cancel [job-id]`

Cancela un trabajo en ejecución y limpia sus recursos.

### `/oracle-clean <job-id|all>`

Limpia artefactos y archivos temporales de jobs completados o fallidos.

---

## Tools del Agente

El agente pi también puede usar estas herramientas programáticamente:

| Tool | Uso |
|------|-----|
| `oracle_submit` | Enviar un trabajo desde el agente |
| `oracle_read` | Leer el resultado de un trabajo |
| `oracle_cancel` | Cancelar un trabajo activo |

---

## Flujo de un Trabajo

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Agente    │───►│  Extension   │───►│    Worker    │───►│  ChatGPT     │
│   pi        │    │  (index.ts)  │    │  (spawn)     │    │  (browser)   │
│             │◄───│              │◄───│              │◄───│              │
│  Recibe     │    │  Poll state  │    │  Ejecuta     │    │  Procesa     │
│  resultado  │    │  Notifica    │    │  Job         │    │  Prompt      │
└─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

Durante la ejecución, el estado se escribe en `/tmp/oracle-{job-id}/job.json`:
- `status`: `"pending"` → `"running"` → `"completed"` | `"failed"`
- `phase`: `"auth"` → `"sending"` → `"waiting"` → `"downloading"`
- `heartbeat`: último timestamp de actividad

---

## Instalación

### Prerrequisitos

- **Node.js** >= 20
- **npm** >= 9
- **Navegador:** Brave (preferido), Chrome, o Chromium
- **ChatGPT:** sesión activa con Plus/Pro (para modelos avanzados)

### Pasos

```bash
# Via npm (recomendado)
pi install npm:pi-oracle

# O desde GitHub
pi install https://github.com/AndresGaibor/pi-oracle
```

---

## Configuración

### Configuración Mínima (Recomendada)

No necesitas configurar nada. Pi-oracle funciona con valores por defecto:

1. Verifica que ChatGPT funciona en tu navegador (abre chatgpt.com)
2. Ejecuta `/oracle-auth` para configurar la autenticación
3. Ejecuta `/oracle "revisa mi código"` para probar

### Configuración Personalizada

**Archivos de configuración:**

| Nivel | Ruta | Cuándo usar |
|-------|------|-------------|
| Global | `~/.pi/agent/extensions/oracle.json` | Para toda tu máquina |
| Proyecto | `.pi/extensions/oracle.json` | Solo para este proyecto |

**Configuraciones comunes:**

```jsonc
{
  // Config global: puede sobrescribir todo
  "browser": {
    "executablePath": "/usr/bin/brave-browser",  // Forzar navegador
    "runMode": "headed",                         // Ver el navegador (debug)
    "maxConcurrentJobs": 1                       // Jobs simultáneos
  },
  "defaults": {
    "modelFamily": "pro",        // "instant", "thinking", "pro"
    "effort": "extended",        // "light", "standard", "extended", "heavy"
    "autoSwitchToThinking": false
  },
  "worker": {
    "completionTimeoutMs": 5400000  // 90 minutos (default)
  },
  "artifacts": {
    "capture": true  // Descarga archivos generados
  }
}
```

**Config de proyecto (limitada por seguridad):**

```jsonc
{
  // SOLO estas secciones pueden ser sobrescritas:
  "defaults": { "modelFamily": "thinking", "effort": "extended" },
  "worker": { "completionTimeoutMs": 3600000 },
  "poller": { "intervalMs": 3000 },
  "artifacts": { "capture": true },
  "cleanup": { "completeJobRetentionMs": 86400000 }
}
```

⚠️ **Seguridad:** La config de proyecto NO puede sobrescribir paths de navegador ni directorios sensibles.

### Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `BROWSER_PATH` | Ruta al ejecutable del navegador | Auto-detectado |
| `ORACLE_BROWSER_PATH` | Alternativa a BROWSER_PATH | Auto-detectado |
| `NODE_ENV` | Entorno de ejecución | `"production"` |

---

## Uso

### Ejemplos Básicos

```text
# Revisión de código
/oracle Review the changes in src/ and identify potential bugs

# Generación de código
/oracle Create a TypeScript function that parses CSV files into typed objects

# Análisis de arquitectura
/oracle Analyze the project structure and suggest improvements for scalability

# Con modelo Pro y esfuerzo extendido
/oracle [Usa Modelo Pro] Write a comprehensive test suite for the auth module
```

### Ejemplos Avanzados

```text
# Referenciar archivos específicos
/oracle Review src/utils.ts and src/utils.test.ts for edge cases

# Pedir explicaciones
/oracle Explain the authentication flow in this codebase with a diagram

# Migración
/oracle Convert this JavaScript module to TypeScript with strict typing
```

---

## Arquitectura

```
Extension (index.ts)
    ↳ Worker (spawn process)
        ↳ AIJobRunner
            ↳ AIProviderPage (abstracción)
                ↳ ChatGPTPage (implementación actual)
                ↳ ClaudePage (futuro)
```

**Principios clave:**

- **Page Object Model:** Cada proveedor tiene 4 archivos (selectors, actions, assertions, page)
- **Dependency Inversion:** El worker depende de `AIProviderPage`, no de `ChatGPTPage`
- **Factory Pattern:** `createProviderPage()` selecciona el proveedor según la URL
- **Worker Isolation:** Cada job se ejecuta en un proceso hijo independiente
- **Multiplataforma:** macOS, Linux, Windows con detección automática

📖 **Documentación completa:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Troubleshooting

### Problemas Comunes

**"El job se queda en pending"**
```bash
# Verificar que el worker puede ejecutarse
node extensions/oracle/worker/run-oracle-job.ts --help

# Revisar logs del job
cat /tmp/oracle-{job-id}/job.json | jq .
```

**"Auth failed"**
```bash
# Re-autenticar
/oracle-auth

# Verificar cookies
ls -la /home/$(whoami)/.pi/agent/extensions/oracle-auth-seed-profile/
```

**"El navegador no se encuentra"**
```bash
# Forzar ruta del navegador en config global
echo '{"browser":{"executablePath":"/usr/bin/brave-browser"}}' >> \
    ~/.pi/agent/extensions/oracle.json
```

**"Job timeout"**
```bash
# Aumentar timeout en config
echo '{"worker":{"completionTimeoutMs":7200000}}' >> .pi/extensions/oracle.json
```

### Logs

```bash
# Estado de un job
cat /tmp/oracle-{job-id}/job.json | jq .

# Heartbeat
cat /tmp/oracle-{job-id}/heartbeat.json

# Diagnóstico (si el job falló)
ls /tmp/oracle-{job-id}/logs/
cat /tmp/oracle-{job-id}/logs/error.snapshot.txt
```

---

## Desarrollo

### Ejecutar Tests

```bash
# Tests unitarios (rápidos)
npm test

# Tests con cobertura
npm run test:coverage

# Tests E2E (requieren navegador + cookies)
npm run test:e2e
```

📖 **Guía completa de testing:** [docs/TESTING.md](docs/TESTING.md)

### Comandos Útiles

```bash
# Type check + bundle check
npm run check:oracle-extension

# Sanity check
npm run sanity:oracle

# Verificar npm pack
npm run pack:check
```

### Agregar un Proveedor

📖 **Guía paso a paso:** [docs/ADDING-A-PROVIDER.md](docs/ADDING-A-PROVIDER.md)

---

## Contribuir

1. Fork el repositorio
2. Crea una rama: `feat/claude-provider`
3. Ejecuta tests: `npm test`
4. Commit: `feat(claude): add Claude provider support`
5. Push y abre PR

📖 **Guía completa:** [CONTRIBUTING.md](CONTRIBUTING.md)

---

## Privacidad

Esta extensión es **local-first**, pero:

- `/oracle-auth` lee cookies de tu navegador
- Los prompts se envían a ChatGPT.com
- Las respuestas se escriben en `/tmp/oracle-<job-id>/`

Revisa el código y `docs/ORACLE_DESIGN.md` antes de usarlo con material sensible.

---

## Roadmap

- [ ] Soporte para Claude
- [ ] Soporte para Gemini
- [ ] Tests E2E en CI
- [ ] Dashboard web de estado de jobs
- [ ] Reutilización de conversaciones existentes

---

## Licencia

[MIT](LICENSE) — Ver archivo LICENSE para más detalles.
