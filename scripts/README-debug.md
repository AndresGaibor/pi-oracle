// scripts/README-debug.md
# Scripts de Depuración de Pi-Oracle

Estos scripts te ayudan a depurar el flujo completo de pi-oracle paso a paso.

## Prerequisitos

1. **Cerrar Brave completamente** antes de ejecutar scripts que lean cookies
2. **Iniciar sesión en ChatGPT con Brave** una vez para generar cookies
3. **Bun instalado**: `brew install oven-sh/bun/bun`

## Scripts Disponibles

### 1. Health Check (Verificación General)

```bash
bun run scripts/health-check.ts
```

Verifica:
- ✅ Brave instalado
- ✅ Perfil Brave existe
- ✅ Playwright disponible
- ✅ sweet-cookie disponible
- ✅ Adapter funcional
- ✅ Cookies de ChatGPT presentes
- ✅ tsconfig.json existe

**Ejecuta esto primero** para confirmar que todo está configurado.

---

### 2. Debug Cookies (Leer Cookies de Brave)

```bash
# IMPORTANTE: Cierra Brave completamente primero (Cmd+Q)
bun run scripts/debug-cookies-simple.ts
```

Verifica:
- Lee cookies de Brave usando sweet-cookie
- Muestra cuántas cookies de ChatGPT hay
- Verifica si existe `__Secure-next-auth.session-token`
- Comprueba si el token ha expirado

**Si este falla:**
- Asegúrate de cerrar Brave completamente
- Verifica que hayas iniciado sesión en https://chatgpt.com con Brave
- Revisa que el perfil Brave sea el correcto

---

### 3. Debug Playwright Adapter (Navegación Básica)

```bash
bun run scripts/debug-brave-adapter-simple.ts
```

Verifica:
- Lanza Playwright en modo headed (visible)
- Navega a ChatGPT
- Captura texto de la página
- Toma screenshot

**Este script se queda abierto** - cierra con Ctrl+C cuando termines de revisar.

---

### 4. Debug Cookie Injection (Inyección de Cookies)

```bash
# IMPORTANTE: Cierra Brave completamente primero
bun run scripts/debug-cookie-inject-simple.ts
```

Verifica:
- Lee cookies de Brave
- Filtra cookies de autenticación
- Lanza Playwright con perfil temporal
- Inyecta cookies
- Verifica si ChatGPT reconoce la sesión

**Señales de éxito:**
- Estado: ✅ AUTENTICADO
- El texto NO incluye "Log in" o "Sign up"
- Puedes ver el chat interface

**Si falla:**
- Revisa que las cookies se lean correctamente (paso 2)
- Asegúrate de que el token no haya expirado
- Verifica el screenshot en `/tmp/oracle-cookie-inject-test.png`

---

### 5. Debug Oracle Prompt (End-to-End)

```bash
# IMPORTANTE: Cierra Brave completamente primero
bun run scripts/debug-oracle-prompt.ts
```

**El test más completo:**
- Lee cookies de Brave
- Inyecta en Playwright
- Verifica autenticación
- Busca el textarea de ChatGPT
- Envía un prompt: "Di hola en una sola palabra"
- Espera la respuesta
- Captura screenshot final

**Señales de éxito:**
- ✅ Autenticado
- ✅ Textarea encontrado
- ✅ Botón enviar: Click
- ✅ RESPUESTA RECIBIDA

**Si falla:**
- Revisa cada paso anterior primero
- Checa el screenshot en `/tmp/oracle-prompt-final.png`
- Revisa la consola para ver dónde falló

---

### 6. Debug Detection Baseline (Anti-Detección)

```bash
bun run scripts/debug-detection-baseline.ts
```

Verifica señales de automatización:
- `navigator.webdriver` - debe ser `undefined` o `false`
- User-Agent - debe ser Chrome normal
- Plugins - debe ser > 0
- Variables CDC - debe estar vacío

**Señales problemáticas:**
- ❌ `navigator.webdriver = true`
- ❌ Plugins = 0
- ❌ Variables `cdc_` presentes
- ❌ User-Agent contiene "HeadlessChrome"

---

## Flujo de Depuración Recomendado

Ejecuta los scripts en este orden:

```bash
# 1. Verificación general
bun run scripts/health-check.ts

# 2. Si health-check falla en cookies:
#    - Abre Brave
#    - Ve a https://chatgpt.com
#    - Inicia sesión
#    - Cierra Brave completamente (Cmd+Q)

# 3. Verifica que las cookies se lean
bun run scripts/debug-cookies-simple.ts

# 4. Prueba el adapter básico
bun run scripts/debug-brave-adapter-simple.ts  # Ctrl+C para cerrar

# 5. Prueba inyección de cookies
bun run scripts/debug-cookie-inject-simple.ts  # Ctrl+C para cerrar

# 6. Prueba el flujo completo
bun run scripts/debug-oracle-prompt.ts  # Ctrl+C para cerrar

# 7. Verifica anti-detección
bun run scripts/debug-detection-baseline.ts  # Ctrl+C para cerrar
```

---

## Screenshots Generados

Los scripts generan screenshots en `/tmp/`:

- `/tmp/oracle-debug-simple.png` - Adapter básico
- `/tmp/oracle-cookie-inject-test.png` - Después de inyectar cookies
- `/tmp/oracle-prompt-final.png` - Después de enviar prompt
- `/tmp/oracle-detection-baseline.png` - Tests de detección

Revisa estos screenshots si algo falla.

---

## Variables de Entorno

- `USE_PLAYWRIGHT=1` - Habilita Playwright (requerido)
- `PW_HEADLESS=0` - Modo headed/visible (default en scripts de debug)
- `PW_HEADLESS=1` - Modo headless/invisible

---

## Troubleshooting

### "No cookies de ChatGPT"
1. Asegúrate de iniciar sesión en Brave primero
2. Cierra Brave completamente (Cmd+Q)
3. Ejecuta `debug-cookies-simple.ts` de nuevo

### "No autenticado después de inyectar cookies"
1. Verifica que el token no haya expirado
2. Asegúrate de estar usando el perfil Brave correcto
3. Revisa el screenshot para ver qué ve Playwright

### "Textarea no encontrado"
1. ChatGPT puede haber cambiado su UI
2. Revisa el screenshot para ver la página
3. Ajusta los selectores en el script si es necesario

### "Variables CDC presentes" (anti-detección)
1. Playwright tiene limitaciones anti-detección
2. El adapter actual no aplica técnicas stealth
3. Para producción, considera usar perfiles reales de Brave

---

## Próximos Pasos

Una vez que **todos los scripts funcionen**:

1. Prueba la extensión completa en pi:
   ```bash
   pi
   /oracle-auth
   /oracle Hola, ¿cómo estás?
   ```

2. Monitorea logs:
   ```bash
   tail -f /tmp/oracle-auth.log
   ```

3. Verifica estado de jobs:
   ```bash
   pi
   /oracle-status
   ```
