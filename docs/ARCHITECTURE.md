# Arquitectura de Cookies - pi-oracle

## 📁 Estructura correcta

```
extensions/oracle/
├── lib/
│   └── cookies.ts              ← 🎯 MÓDULO PRINCIPAL
│                                  Todas las funciones de cookies
│                                  Usable en toda la extensión
├── worker/
│   ├── auth-bootstrap.ts       ← Usa lib/cookies.ts
│   └── auth-cookie-policy.ts   ← Re-exporta de lib/cookies.ts
│
scripts/                        ← Solo para debugging/testing
├── debug-headed.ts             ← Test manual con browser
├── test-cookies.ts             ← Tests automatizados
└── watch-cookies.ts            ← Monitor en tiempo real
```

## ✅ Arquitectura correcta

### Módulo principal: `extensions/oracle/lib/cookies.ts`

Este es el **único** archivo que contiene la lógica de cookies:

```typescript
// ✅ CORRECTO - Importar desde lib/cookies.ts
import { readChatGPTCookies, filterImportableAuthCookies } from "../lib/cookies";
```

**Funciones disponibles:**
- `readCookiesFromBrowser()` - Lee cookies con sweet-cookie
- `readChatGPTCookies()` - Lee y filtra cookies de ChatGPT
- `filterImportableAuthCookies()` - Filtra cookies de autenticación
- `ensureAccountCookie()` - Sintetiza `_account` si falta
- `normalizeImportedCookie()` - Normaliza formato
- `classifyImportedCookie()` - Clasifica cookie

**Constantes:**
- `CHATGPT_COOKIE_ORIGINS`
- `AUTH_COOKIE_NAME_PATTERNS`
- `DROPPED_COOKIE_NAME_PATTERNS`

### Worker compatibility: `extensions/oracle/worker/auth-cookie-policy.ts`

Re-exporta desde `lib/cookies.ts` para mantener compatibilidad:

```typescript
// Para compatibilidad con código existente
export {
  filterImportableAuthCookies,
  ensureAccountCookie,
  // ...
} from "../lib/cookies";
```

### Workers: `extensions/oracle/worker/auth-bootstrap.ts`

Usa sweet-cookie + lib/cookies:

```typescript
import { getCookies } from "@steipete/sweet-cookie";
import { ensureAccountCookie, filterImportableAuthCookies } from "./auth-cookie-policy";

// Lee cookies con sweet-cookie
const { cookies, warnings } = await getCookies({
  url: config.browser.chatUrl,
  origins: CHATGPT_COOKIE_ORIGINS,
  browsers: ["chrome"],
  chromeProfile: cookieSource(),
});

// Filtra usando lib/cookies
const filtered = filterImportableAuthCookies(cookies, config.browser.chatUrl);
```

### Scripts: Solo para debugging

```bash
# Test de cookies
bun run test:cookies

# Debug con browser
bun run debug:headed

# Monitor en tiempo real
bun run watch:cookies
```

## 🚫 Anti-patrones (evitar)

### ❌ NO duplicar código en scripts

```typescript
// ❌ INCORRECTO
// scripts/debug-headed.ts
function getSafeStorageKey() { ... }
function decryptCookieValue() { ... }
```

```typescript
// ✅ CORRECTO
// scripts/debug-headed.ts
import { readChatGPTCookies } from "../extensions/oracle/lib/cookies";
```

### ❌ NO poner lógica de negocio en scripts

```typescript
// ❌ INCORRECTO - Lógica en script
// scripts/something.ts
function filterAuthCookies(cookies) {
  return cookies.filter(c => isAuthCookie(c));
}
```

```typescript
// ✅ CORRECTO - Script solo usa lib
// scripts/something.ts
import { filterImportableAuthCookies } from "../extensions/oracle/lib/cookies";
const filtered = filterImportableAuthCookies(cookies, chatUrl);
```

## 🔄 Flujo de datos

```
Browser SQLite
     ↓
sweet-cookie (lee + descifra)
     ↓
lib/cookies.ts (normaliza + filtra)
     ↓
auth-bootstrap.ts (inyecta en Playwright)
     ↓
ChatGPT (autenticado)
```

## 📝 Uso en tu código

### Caso 1: Leer cookies de ChatGPT

```typescript
import { readChatGPTCookies } from "./extensions/oracle/lib/cookies";

const result = await readChatGPTCookies({
  profilePath: "/path/to/brave/profile"
});

if (result.hasSessionToken) {
  // Inyectar en browser
  await browser.cookiesSet(result.cookies);
}
```

### Caso 2: Leer cookies de cualquier sitio

```typescript
import { readCookiesFromBrowser } from "./extensions/oracle/lib/cookies";

const { cookies, warnings } = await readCookiesFromBrowser({
  url: "https://example.com/",
  profilePath: "/path/to/chrome/profile",
  browsers: ["chrome", "firefox"],
});
```

### Caso 3: Filtrar cookies manualmente

```typescript
import { filterImportableAuthCookies } from "./extensions/oracle/lib/cookies";

const filtered = filterImportableAuthCookies(rawCookies, "https://chatgpt.com/");
console.log(`Auth: ${filtered.cookies.length}, Dropped: ${filtered.dropped.length}`);
```

### Caso 4: Normalizar cookies

```typescript
import { normalizeImportedCookie } from "./extensions/oracle/lib/cookies";

const normalized = normalizeImportedCookie(rawCookie, "chatgpt.com");
if (normalized) {
  // Cookie válida
}
```

## 🧪 Testing

### Unit tests (scripts/test-cookies.ts)

```bash
bun run test:cookies
```

Valida:
- ✅ Lectura de cookies desde Brave
- ✅ Filtrado de cookies (auth vs tracking)
- ✅ Estructura de cookies normalizada

### Integration tests (scripts/debug-headed.ts)

```bash
bun run debug:headed
```

Valida:
- ✅ Lectura + filtrado + inyección
- ✅ Autenticación en ChatGPT
- ✅ Detección de composer

### Real-time monitoring (scripts/watch-cookies.ts)

```bash
bun run watch:cookies
```

Monitorea:
- 🔄 Cambios en cookies cada 5 segundos
- 📊 Count de cookies
- 🔑 Session token presente/ausente

## 🎯 Resumen

| Componente | Rol | Ubicación |
|------------|-----|-----------|
| `lib/cookies.ts` | 🎯 Módulo principal | `extensions/oracle/lib/` |
| `auth-cookie-policy.ts` | ♻️ Re-exporta | `extensions/oracle/worker/` |
| `auth-bootstrap.ts` | 🔧 Usa sweet-cookie + lib | `extensions/oracle/worker/` |
| `debug-headed.ts` | 🧪 Debug manual | `scripts/` |
| `test-cookies.ts` | ✅ Tests automatizados | `scripts/` |
| `watch-cookies.ts` | 👁️ Monitor real-time | `scripts/` |

**Regla de oro:**
- ✅ **Lógica de negocio** → `extensions/oracle/lib/`
- ✅ **Scripts** → Solo debugging/testing, importan de `lib/`
