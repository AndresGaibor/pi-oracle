# Configuración de pi-oracle con Brave Browser

Este documento describe cómo configurar `pi-oracle` para usar Brave en lugar de Chrome.

## Requisitos

- Brave Browser instalado en macOS
- Sesión activa de ChatGPT en Brave
- `pi` instalado
- Node.js 20+

## Configuración completada

✅ Se ha creado el archivo de configuración global en:
```
~/.pi/agent/extensions/oracle.json
```

### Configuración actual

```json
{
  "browser": {
    "executablePath": "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "authSeedProfileDir": "~/Library/Application Support/BraveSoftware/Brave-Browser/Default",
    "runtimeProfilesDir": "~/.pi/oracle-runtime-profiles",
    "args": [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage"
    ]
  },
  "auth": {
    "chromeProfile": "Default",
    "chromeCookiePath": "~/Library/Application Support/BraveSoftware/Brave-Browser/Default/Cookies"
  },
  "archive": {
    "excludePatterns": [
      "node_modules/**",
      ".git/**",
      "dist/**",
      "build/**",
      "*.log"
    ]
  },
  "oracle": {
    "model": "auto",
    "effort": "medium",
    "timeout": 1800000
  }
}
```

## Rutas importantes para Brave en macOS

- **Ejecutable**: `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`
- **Perfiles**: `~/Library/Application Support/BraveSoftware/Brave-Browser/`
- **Perfil Default**: `~/Library/Application Support/BraveSoftware/Brave-Browser/Default`
- **Cookies**: `~/Library/Application Support/BraveSoftware/Brave-Browser/Default/Cookies`

## Verificación de cookies

El script `test-brave-cookies.mjs` verifica que las cookies de ChatGPT sean accesibles:

```bash
node test-brave-cookies.mjs
```

**Resultado esperado**: Debe mostrar cookies de autenticación de ChatGPT, incluyendo:
- `__Secure-next-auth.session-token.*`
- `oai-client-auth-info`
- `unified_session_manifest`

## Próximos pasos

### 1. Autenticación inicial

Ejecuta el comando de autenticación para configurar el perfil aislado de oracle:

```bash
/oracle-auth
```

Este comando:
- Lee las cookies de ChatGPT de tu perfil de Brave
- Crea un perfil aislado para oracle en `~/.pi/oracle-runtime-profiles/`
- Valida que la autenticación funcione correctamente
- Abre una ventana de Brave automatizada para verificar el login

### 2. Prueba básica

Una vez completada la autenticación, prueba con una consulta simple:

```bash
/oracle Revisa el README.md y sugiere mejoras en la documentación
```

### 3. Verificación de estado

Consulta el estado de trabajos oracle:

```bash
/oracle-status
```

## Diferencias con Chrome

### Ventajas de usar Brave

- ✅ **Mayor privacidad**: Brave bloquea rastreadores por defecto
- ✅ **Mismo motor**: Basado en Chromium, total compatibilidad
- ✅ **Rendimiento**: Generalmente más rápido que Chrome

### Consideraciones

- ⚠️ Los bloqueadores de Brave **no interfieren** porque oracle usa perfiles aislados
- ⚠️ Las cookies deben ser accesibles (normalmente no es problema)
- ⚠️ El Brave Shields no afecta las sesiones automatizadas

## Solución de problemas

### Error: "No cookies found"

1. Verifica que hayas iniciado sesión en ChatGPT en Brave
2. Ejecuta `node test-brave-cookies.mjs` para diagnosticar
3. Prueba cerrando Brave completamente y vuelve a intentar

### Error: "Keychain timeout"

Esto es normal y no impide el funcionamiento. Las cookies se leen correctamente incluso con este warning.

### Error: "Browser executable not found"

Verifica que Brave esté instalado en `/Applications/Brave Browser.app`

```bash
ls -la "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
```

### Perfiles alternativos

Si usas un perfil diferente al "Default", actualiza la configuración:

```json
{
  "browser": {
    "authSeedProfileDir": "~/Library/Application Support/BraveSoftware/Brave-Browser/Profile 1"
  },
  "auth": {
    "chromeProfile": "Profile 1",
    "chromeCookiePath": "~/Library/Application Support/BraveSoftware/Brave-Browser/Profile 1/Cookies"
  }
}
```

## Arquitectura de seguridad

Oracle usa una arquitectura de **perfiles aislados**:

1. **Perfil seed** (`authSeedProfileDir`): Tu perfil de Brave se usa solo para LEER cookies
2. **Perfil runtime**: Se crea un clon aislado para cada trabajo oracle
3. **Sin interferencia**: Oracle nunca modifica tu perfil activo de Brave
4. **Aislamiento**: Cada trabajo se ejecuta en su propia instancia de navegador

## Referencias

- [Documentación oficial de pi-oracle](README.md)
- [Diseño de arquitectura](docs/ORACLE_DESIGN.md)
- [Guía de recuperación](docs/ORACLE_RECOVERY_DRILL.md)
