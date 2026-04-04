# Fase 4: Abstracción de Proveedor de IA

## Context

**Problema:** Todo el código está acoplado a ChatGPT. No existe una interfaz `AIProviderPage`, ni factory, ni mecanismo para intercambiar proveedores sin refactorización masiva.

**Objetivo:** Crear una capa de abstracción que permita intercambiar ChatGPT por Claude (u otro proveedor) sin modificar el código del worker, jobs ni extension.

**Principio de diseño:** Dependency Inversion - las capas superiores (worker, jobs, extension) no deben depender de implementaciones concretas (`ChatGPTPage`) sino de una abstracción (`AIProviderPage`).

**Estado actual:**
- `ChatGPTPage` es una clase concreta sin interfaz
- `ChatGPTJobRunner` instancia `ChatGPTPage` directamente
- `worker/run-job.ts` tiene lógica de ChatGPT hardcodeada
- `lib/config.ts` solo acepta URLs de ChatGPT
- `shared/login-utils.ts` usa endpoints de ChatGPT (`/backend-api/me`)
- `lib/cookies.ts` tiene dominios de ChatGPT/OpenAI hardcodeados

## Approach

1. **Crear interfaz `AIProviderPage`** en `pages/ai-provider.types.ts` con tipos genéricos para cualquier proveedor de IA
2. **Crear factory `createProviderPage()`** en `pages/provider-factory.ts` con registro dinámico de proveedores
3. **Hacer que `ChatGPTPage` implemente `AIProviderPage`** agregando `providerName` y asegurando que todos los métodos requeridos existan
4. **Refactorizar `ChatGPTJobRunner`** para usar `AIProviderPage` en vez de `ChatGPTPage` (inyección de dependencias)
5. **Generalizar `login-utils.ts`** para soportar múltiples proveedores
6. **Generalizar `lib/cookies.ts`** para múltiples dominios (ya parcialmente hecho)
7. **Actualizar `lib/config.ts`** para aceptar URLs de otros proveedores
8. **Verificar que no quedan imports directos de ChatGPT** en capas superiores

## Files to Modify

### Crear (nuevos)
- `extensions/oracle/pages/ai-provider.types.ts` - Interfaz `AIProviderPage` y tipos asociados
- `extensions/oracle/pages/provider-factory.ts` - Factory `createProviderPage()` y `registerProvider()`

### Modificar
- `extensions/oracle/pages/chatgpt/chatgpt.page.ts` - Implementar `AIProviderPage`, agregar `providerName`
- `extensions/oracle/lib/ChatGPTJobRunner.ts` - Cambiar tipo a `AIProviderPage`, inyección de dependencias
- `extensions/oracle/worker/run-job.ts` - Usar factory en vez de `new ChatGPTPage()`
- `extensions/oracle/shared/login-utils.ts` - Generalizar para múltiples proveedores
- `extensions/oracle/lib/cookies.ts` - Ya acepta `chatUrl`, verificar que es suficiente
- `extensions/oracle/lib/config.ts` - Relajar validación de URLs para aceptar otros proveedores

### No tocar (por ahora)
- `extensions/oracle/pages/chatgpt/chatgpt.selectors.ts`
- `extensions/oracle/pages/chatgpt/chatgpt.actions.ts`
- `extensions/oracle/pages/chatgpt/chatgpt.assertions.ts`
- `extensions/oracle/pages/chatgpt-auth/*`
- `extensions/oracle/lib/browser.ts`
- `extensions/oracle/index.ts`

## Reuse

**Funciones existentes que se pueden reutilizar:**
- `classifyChatPage()` de `shared/login-utils.ts` - se generalizará para aceptar configuración de proveedor
- `snapshotHasLabel()` de `shared/login-utils.ts` - ya es genérica
- `readChatGPTCookies()` de `lib/cookies.ts` - ya acepta `chatUrl` como parámetro
- `filterImportableAuthCookies()` de `lib/cookies.ts` - ya acepta `chatUrl` como parámetro

## Steps

### 6.1 - Diseñar y crear la interfaz `AIProviderPage`
- [x] Analizar la interfaz actual de `ChatGPTPage`
- [x] Identificar métodos específicos de ChatGPT vs genéricos
- [ ] Crear `pages/ai-provider.types.ts` con:
  - `AIProviderConfig` (chatUrl, authUrl, modelFamily, effort, timeouts)
  - `AIProviderResult` (responseText, artifacts, chatUrl, conversationId)
  - `ClassifyParams` y `ClassifyResult`
  - `LoginProbeResult`
  - `WaitOpts`
  - `AIProviderPage` (interfaz principal)
- [ ] Ejecutar `tsc --noEmit` y verificar que pasa
- [ ] Commit: `feat(fase4): create AIProviderPage interface and related types`

### 6.2 - Crear la factory `createProviderPage()`
- [ ] Crear `pages/provider-factory.ts` con:
  - `PROVIDER_REGISTRY` (Map de URLs a factories)
  - `registerProvider()` para agregar nuevos proveedores
  - `createProviderPage()` para crear instancias basado en config
  - Resolución por dominio (no solo URL exacta)
  - Default a ChatGPT para URLs no reconocidas
- [ ] Ejecutar `tsc --noEmit`
- [ ] Commit: `feat(fase4): create provider factory with registry pattern`

### 6.3 - Hacer que `ChatGPTPage` implemente `AIProviderPage`
- [ ] Agregar `import type { AIProviderPage } from "../ai-provider.types"`
- [ ] Cambiar declaración: `export class ChatGPTPage extends BasePage implements AIProviderPage`
- [ ] Agregar `readonly providerName = "chatgpt"`
- [ ] Verificar que todos los métodos de la interfaz existen:
  - `classifyPage()` - ✓ existe
  - `clickComposer()` - ✓ existe
  - `typePrompt()` - ✓ existe
  - `clickSend()` - ✓ existe
  - `getAssistantMessages()` - ✓ existe
  - `isResponseComplete()` - ✗ no existe, agregar
  - `waitForResponse()` - ✗ no existe, agregar
  - `selectModel()` - ✗ no existe (opcional)
  - `selectEffort()` - ✗ no existe (opcional)
- [ ] Ejecutar `tsc --noEmit`
- [ ] Commit: `refactor(fase4): make ChatGPTPage implement AIProviderPage`

### 6.4 - Refactorizar `ChatGPTJobRunner`
- [ ] Cambiar `private chatGPT: ChatGPTPage` a `private provider: AIProviderPage`
- [ ] Cambiar constructor para recibir provider por inyección de dependencias
- [ ] Eliminar instancia de `new ChatGPTPage()` del constructor
- [ ] Actualizar todas las referencias `this.chatGPT` a `this.provider`
- [ ] Mover lógica específica de ChatGPT (model selection, artifacts) al Page Object o delegar
- [ ] (Opcional) Renombrar a `ProviderJobRunner`
- [ ] Ejecutar `tsc --noEmit`
- [ ] Commit: `refactor(fase4): refactor ChatGPTJobRunner to use AIProviderPage`

### 6.5 - Actualizar `worker/run-job.ts`
- [ ] Importar `createProviderPage` de `provider-factory`
- [ ] Crear provider con factory antes de instanciar job runner
- [ ] Pasar provider al constructor del job runner
- [ ] Eliminar imports directos de `ChatGPTPage`
- [ ] Ejecutar `tsc --noEmit`
- [ ] Commit: `refactor(fase4): update worker to use provider factory`

### 6.6 - Generalizar `shared/login-utils.ts`
- [ ] Crear interfaz `LoginProbeConfig` con `baseUrl`, `sessionEndpoint`, `headers`
- [ ] Modificar `buildLoginProbeScript()` para aceptar endpoint configurable
- [ ] Crear wrapper `chatGPTLoginProbe()` que use la configuración de ChatGPT
- [ ] Generalizar `classifyChatPage()` para aceptar configuración de proveedor
- [ ] Ejecutar `tsc --noEmit`
- [ ] Commit: `refactor(fase4): generalize login probe for multiple providers`

### 6.7 - Verificar y actualizar `lib/config.ts`
- [ ] Agregar campo `aiProvider?: string` a `OracleConfig`
- [ ] Relajar validación de URLs para aceptar otros dominios además de ChatGPT
- [ ] Mantener defaults a ChatGPT para compatibilidad
- [ ] Ejecutar `tsc --noEmit`
- [ ] Commit: `refactor(fase4): add AI provider configuration to OracleConfig`

### 6.8 - Verificación final e integración
- [ ] Buscar imports directos de ChatGPT en capas superiores:
  - `rg "from.*chatgpt" lib/ --type ts`
  - `rg "from.*chatgpt" worker/ --type ts`
  - `rg "from.*chatgpt" index.ts`
- [ ] Verificar que la factory funciona con casos de prueba:
  - ChatGPT por URL default
  - ChatGPT por URL con path
  - URL desconocida → default a ChatGPT
- [ ] Ejecutar `tsc --noEmit` final
- [ ] Verificar que el flujo existente con ChatGPT sigue funcionando
- [ ] Commit: `refactor(fase4): final integration — verify abstraction works`

## Verification

### Compilación
```bash
cd extensions/oracle
tsc --noEmit
```

### Tests de factory
- Crear provider con URL de ChatGPT → debe retornar `ChatGPTPage` con `providerName = "chatgpt"`
- Crear provider con URL desconocida → debe retornar `ChatGPTPage` (default)
- Registrar nuevo proveedor y crear → debe retornar instancia del nuevo proveedor

### Flujo existente
- Ejecutar job con configuración actual → debe funcionar exactamente igual
- No romper compatibilidad con configs existentes

### Checklist final
- [ ] `tsc --noEmit` pasa sin errores
- [ ] No hay imports de `ChatGPTPage` en `lib/`, `worker/`, ni `index.ts`
- [ ] `ChatGPTPage` implementa `AIProviderPage` correctamente
- [ ] Factory crea providers basado en configuración
- [ ] Login probe generalizado funciona con ChatGPT
- [ ] Config acepta URLs de otros proveedores
- [ ] Flujo existente con ChatGPT sigue funcionando

## Notas importantes

**Lo que NO hacer en esta fase:**
- ❌ NO crear la implementación de Claude — solo la abstracción
- ❌ NO renombrar archivos de ChatGPT (eso es Fase 6)
- ❌ NO eliminar rutas hardcoded de macOS (eso es Fase 7)
- ❌ NO agregar tests (eso es Fase 5)
- ❌ NO cambiar la funcionalidad existente de ChatGPT — solo abstraerla
- ❌ NO romper el flujo existente — debe seguir funcionando exactamente igual

**Métodos específicos de ChatGPT que NO van en la interfaz:**
- `selectModel()` - solo algunos proveedores soportan selección de modelo desde UI
- `selectEffort()` - específico de modelos thinking de ChatGPT
- `handleThinkingBlocks()` - específico de ChatGPT
- `detectArtifacts()` - cada proveedor puede tener su propia lógica

**Métodos genéricos que SÍ van en la interfaz:**
- `classifyPage()` - verificar si está autenticado
- `clickComposer()` - enfocar el input de texto
- `typePrompt()` - escribir el prompt
- `clickSend()` - enviar el mensaje
- `getAssistantMessages()` - obtener respuestas
- `isResponseComplete()` - verificar si terminó de generar
- `waitForResponse()` - esperar respuesta completa
