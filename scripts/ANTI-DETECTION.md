# Guía de Anti-Detección para Pi-Oracle

## Problema

ChatGPT puede detectar que estás usando automatización cuando:
- `navigator.webdriver` es `true`
- No hay plugins en el navegador
- El User-Agent contiene "HeadlessChrome"
- Variables CDC (`cdc_`, `__webdriver`) están presentes
- El fingerprint del navegador es inconsistente

## Estado Actual del Adapter

El adapter de Playwright en `adapter/playwright-adapter.ts` es simple:

```typescript
export async function launchPersistent(userDataDir?: string) {
  const dir = userDataDir || path.join(os.tmpdir(), "pi-playwright-profile");
  const headless = process.env.PW_HEADLESS !== "0";
  
  context = await playwrightPkg.chromium.launchPersistentContext(dir, {
    headless,
    acceptDownloads: true,
  });
}
```

**No incluye técnicas anti-detección.**

## Mejoras Propuestas para el Adapter

### 1. Modificar `adapter/playwright-adapter.ts`

Agregar opciones anti-detección en `launchPersistent`:

```typescript
export async function launchPersistent(userDataDir?: string) {
  ensureFlag();
  await lazyImport();
  if (context) return context;

  const dir = userDataDir || path.join(os.tmpdir(), "pi-playwright-profile");
  const headless = process.env.PW_HEADLESS !== "0";

  // Stealth options
  const args = [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
  ];

  context = await playwrightPkg.chromium.launchPersistentContext(dir, {
    headless,
    acceptDownloads: true,
    args,
    // Evitar que se vea como bot
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: { width: 1920, height: 1080 },
    userAgent: undefined, // Usa el UA del perfil persistente
  });

  // Inyectar stealth script en cada página nueva
  context.on('page', (page) => {
    page.addInitScript(() => {
      // Ocultar navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Limpiar variables CDC
      const cleanKeys = ['cdc_', '__webdriver', '_phantom', '__nightmare'];
      for (const key of Object.keys(window)) {
        for (const pattern of cleanKeys) {
          if (key.includes(pattern)) {
            delete (window as any)[key];
          }
        }
      }

      // Agregar plugins si están vacíos
      if (navigator.plugins.length === 0) {
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5], // Mock básico
        });
      }

      // Configurar idiomas
      Object.defineProperty(navigator, 'languages', {
        get: () => ['es-ES', 'es', 'en-US', 'en'],
      });

      // Arreglar permisos
      const originalQuery = window.navigator.permissions?.query;
      if (originalQuery) {
        window.navigator.permissions.query = (params: any) =>
          params.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission } as any)
            : originalQuery(params);
      }
    });
  });

  // Crear página principal
  const pg = await context.newPage();
  pageCounter += 1;
  const token = \`p\${pageCounter}\`;
  pages.set(token, pg);
  mainPageToken = token;
  return context;
}
```

### 2. Mejor Estrategia: Usar Perfil Real de Brave

En lugar de técnicas anti-detección complejas, **usa el perfil real de Brave**:

```bash
# 1. Crear perfil dedicado para oracle
mkdir -p "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/Profile Oracle"

# 2. Lanzar Brave con ese perfil
open -a "Brave Browser" --args --user-data-dir="$HOME/Library/Application Support/BraveSoftware/Brave-Browser/Profile Oracle"

# 3. Iniciar sesión en ChatGPT manualmente

# 4. Cerrar Brave completamente

# 5. Configurar oracle para usar ese perfil
```

**Ventajas:**
- ChatGPT ve tu historial, cookies, extensiones reales
- Fingerprint completamente legítimo
- No necesitas técnicas anti-detección
- Indistinguible de una sesión humana real

### 3. Configurar Oracle para Usar Perfil Real

Editar `~/.pi/agent/extensions/oracle.json`:

```json
{
  "browser": {
    "authSeedProfileDir": "/Users/andresgaibor/Library/Application Support/BraveSoftware/Brave-Browser/Profile Oracle",
    "runtimeProfilesDir": "/tmp/pi-oracle-runtime",
    "sessionPrefix": "oracle",
    "cloneStrategy": "copy"
  }
}
```

## Tests de Verificación

### Antes (Sin Anti-Detección)

```bash
bun run scripts/debug-detection-baseline.ts
```

Resultados problemáticos:
- ❌ `navigator.webdriver = true`
- ❌ Plugins = 0
- ⚠️ Variables CDC pueden estar presentes

### Después (Con Mejoras)

Después de aplicar las mejoras, los resultados deberían ser:
- ✅ `navigator.webdriver = undefined`
- ✅ Plugins > 0
- ✅ No variables CDC
- ✅ Fingerprint consistente

## Implementación Recomendada

### Opción A: Modificar el Adapter (Técnico)

1. Hacer backup del adapter actual
2. Aplicar los cambios propuestos arriba
3. Probar con `debug-detection-baseline.ts`
4. Ajustar según resultados

**Pros:**
- Funciona con perfiles temporales
- Mayor control sobre opciones

**Contras:**
- Requiere mantenimiento
- Las técnicas anti-detección pueden quedar obsoletas
- Más complejo de debugear

### Opción B: Usar Perfil Real (Recomendado)

1. Crear perfil dedicado de Brave
2. Iniciar sesión manualmente en ChatGPT
3. Configurar oracle para usar ese perfil
4. Cerrar Brave antes de usar oracle

**Pros:**
- Más simple y robusto
- Fingerprint 100% legítimo
- Menos probabilidad de detección
- Más fácil de mantener

**Contras:**
- Requiere Brave cerrado
- No funciona con múltiples sesiones simultáneas de Brave
- Perfil puede crecer en tamaño

## Recomendación Final

**Para producción:** Usa **Opción B (Perfil Real)**

**Para desarrollo/testing:** Puedes usar técnicas stealth (Opción A) si necesitas ejecutar tests frecuentemente sin cerrar Brave.

## Verificar que Funciona

Después de implementar:

```bash
# 1. Verificar detección
bun run scripts/debug-detection-baseline.ts

# 2. Probar autenticación
bun run scripts/debug-cookie-inject-simple.ts

# 3. Probar flujo completo
bun run scripts/debug-oracle-prompt.ts

# 4. Usar la extensión real
pi
/oracle-auth
/oracle Hola, ¿cómo estás?
```

Si todo funciona sin errores de detección, estás listo para producción.
