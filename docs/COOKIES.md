# Cookie Management con Sweet-Cookie

Este proyecto usa `@steipete/sweet-cookie` para leer cookies directamente desde el navegador Brave/Chrome **sin necesidad de CDP (Chrome DevTools Protocol)**.

## ✅ Ventajas vs implementación manual

### Antes (implementación manual)
- ❌ Código complejo con descifrado AES manual
- ❌ Patrones de "basura" para limpiar artefactos
- ❌ Solo funciona en macOS
- ❌ Requiere manejo manual de Safe Storage Key
- ❌ Lee solo una vez al inicio

### Ahora (sweet-cookie)
- ✅ Librería especializada y mantenida
- ✅ Lee cookies **en tiempo real** desde SQLite
- ✅ Funciona en macOS, Linux, Windows
- ✅ Maneja descifrado automáticamente
- ✅ Puede copiar cookies mientras el navegador está abierto
- ✅ Filtra cookies con patrones bien definidos

## 🚀 Uso básico

### Leer cookies de ChatGPT desde Brave

```typescript
import { readChatGPTCookies } from "./extensions/oracle/lib/cookies";

const result = await readChatGPTCookies({
  profilePath: "/Users/x/Library/Application Support/BraveSoftware/Brave-Browser/Default"
});

console.log(`Found ${result.cookies.length} auth cookies`);
console.log(`Session token: ${result.hasSessionToken ? "✅" : "❌"}`);
console.log(`Account cookie: ${result.hasAccount ? "✅" : "❌"}`);

// Inyectar en browser
await browser.cookiesSet(result.cookies);
```

### Leer cookies de cualquier sitio

```typescript
import { readCookiesFromBrowser } from "./extensions/oracle/lib/cookies";

const { cookies, warnings } = await readCookiesFromBrowser({
  url: "https://example.com/",
  profilePath: "/path/to/brave/profile",
  browsers: ["chrome"], // En macOS también busca Brave automáticamente
  timeoutMs: 5_000
});

console.log(`Read ${cookies.length} cookies`);
```

### Filtrar cookies manualmente

```typescript
import { filterImportableAuthCookies } from "./extensions/oracle/lib/cookies";

const filtered = filterImportableAuthCookies(allCookies);

console.log(`Kept: ${filtered.cookies.length}`);
console.log(`Dropped: ${filtered.dropped.length}`);

filtered.dropped.forEach(({ cookie, reason }) => {
  console.log(`Dropped ${cookie.name}: ${reason}`);
});
```

## 🔍 Cómo funciona

1. **sweet-cookie** lee directamente el archivo SQLite de cookies del navegador
2. Descifra los valores usando el Safe Storage Key del sistema
3. Devuelve cookies en formato estándar
4. Nuestro código filtra solo las cookies de autenticación relevantes

## 🍪 Patrones de cookies

### Cookies de autenticación (se mantienen)

```typescript
const AUTH_COOKIE_NAME_PATTERNS = [
  /^__Secure-next-auth\.session-token(?:\.|$)/,  // Token de sesión principal
  /^_account$/,                                    // Cookie de cuenta
  /^_puid$/,                                       // User ID persistente
  /^oai-(?:client-auth-info|sc|did)$/,            // Cookies de OpenAI
  /^cf_clearance$/,                                // Cloudflare
  // ... ver lib/cookies.ts para lista completa
];
```

### Cookies descartadas (tracking/analytics)

```typescript
const DROPPED_COOKIE_NAME_PATTERNS = [
  /^_ga(?:_|$)/,           // Google Analytics
  /^_uet/,                 // Bing tracking
  /^__cf_bm$/,             // Cloudflare bot management
  /^marketing_consent$/,   // Consent cookies
  // ... ver lib/cookies.ts para lista completa
];
```

## 🧪 Testing

Ejecuta el script de debug para probar:

```bash
bun run scripts/debug-headed.ts
```

Salida esperada:
```
🔍 Debug Headed Browser (ChatGPT via sweet-cookie - NO CDP!)
🍪 Reading ChatGPT cookies from Brave (real-time, no CDP)...
   ✅ Found 21 auth cookies
   🔑 Session token: ✅
   👤 Account cookie: ❌
   🗑️  Dropped 22 cookies (tracking/non-auth)

🚀 Launching browser...
🔑 Injecting cookies...
   ✅ Injected 21 cookies

📂 Opening https://chatgpt.com/...
📝 Composer visible: true
✅ Successfully logged in!
```

## 📁 Rutas de perfiles

### macOS

**Brave:**
```
~/Library/Application Support/BraveSoftware/Brave-Browser/Default
```

**Chrome:**
```
~/Library/Application Support/Google/Chrome/Default
```

### Linux

**Brave:**
```
~/.config/BraveSoftware/Brave-Browser/Default
```

**Chrome:**
```
~/.config/google-chrome/Default
```

### Windows

**Brave:**
```
%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default
```

**Chrome:**
```
%LOCALAPPDATA%\Google\Chrome\User Data\Default
```

## 🔒 Seguridad

- Las cookies se leen desde el sistema de archivos local
- Requiere acceso al perfil del navegador
- El descifrado usa el Safe Storage Key del sistema
- En macOS, puede requerir permisos de Keychain

## 📚 Referencias

- [sweet-cookie npm package](https://www.npmjs.com/package/@steipete/sweet-cookie)
- [pi-oracle Repository](https://github.com/AndresGaibor/pi-oracle)
- [Chrome cookie format](https://chromium.googlesource.com/chromium/src/+/master/docs/cookie_storage.md)

## 🐛 Troubleshooting

### "No session token found"
- Asegúrate de estar logueado en ChatGPT en Brave
- Verifica que la ruta del perfil sea correcta
- Intenta cerrar Brave y volver a intentar

### "sweet-cookie warnings"
- Normal en algunos casos
- Las advertencias no impiden que funcione
- Revisa el mensaje específico para más detalles

### "Error reading cookies"
- Verifica permisos de lectura en el directorio del perfil
- En macOS, puede requerir acceso al Keychain
- Asegúrate de que el navegador esté instalado
