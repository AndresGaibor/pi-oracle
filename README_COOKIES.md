# 🍪 Sweet-Cookie Integration - pi-oracle

Migración completa a `@steipete/sweet-cookie` para lectura de cookies **sin CDP**, directamente desde Brave/Chrome SQLite.

## 🎯 Arquitectura

```
extensions/oracle/lib/cookies.ts     ← 🎯 Módulo único (importa aquí)
extensions/oracle/worker/*.ts        ← Usan lib/cookies.ts
scripts/*.ts                         ← Solo debugging (también usan lib/cookies.ts)
```

## ⚡ Quick Start

```typescript
import { readChatGPTCookies } from "./extensions/oracle/lib/cookies";

const result = await readChatGPTCookies({
  profilePath: "/path/to/brave/profile"
});

if (result.hasSessionToken) {
  await browser.cookiesSet(result.cookies);
}
```

## 🧪 Tests

```bash
bun run test:cookies      # Tests automatizados (3/3 ✅)
bun run debug:headed      # Browser visible con cookies inyectadas
bun run watch:cookies     # Monitor en tiempo real
```

## 📚 Documentación

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - Arquitectura y patrones
- [`docs/COOKIES.md`](docs/COOKIES.md) - Guía completa de cookies
- [`extensions/oracle/lib/ejemplos-uso-cookies.ts`](extensions/oracle/lib/ejemplos-uso-cookies.ts) - 7 ejemplos de uso

## ✨ Características

- ✅ Sin CDP - lee directamente de SQLite
- ✅ Tiempo real - funciona con Brave abierto
- ✅ Multiplataforma - macOS, Linux, Windows
- ✅ Auto-descifrado - maneja Safe Storage automáticamente
- ✅ Filtrado inteligente - 21 patrones de tracking descartados

## 📦 API Principal

```typescript
// Leer cookies de ChatGPT (recomendado)
readChatGPTCookies(options: {
  profilePath: string;
  chatUrl?: string;
}): Promise<{
  cookies: Cookie[];
  hasSessionToken: boolean;
  hasAccount: boolean;
  warnings: string[];
  dropped: Array<{ cookie: Cookie; reason: string }>;
}>

// Leer cookies de cualquier sitio
readCookiesFromBrowser(options: {
  url: string;
  profilePath: string;
  browsers?: string[];
  origins?: string[];
  timeoutMs?: number;
}): Promise<{
  cookies: Cookie[];
  warnings: string[];
}>

// Filtrar cookies de autenticación
filterImportableAuthCookies(
  cookies: Cookie[],
  chatUrl: string
): {
  cookies: Cookie[];
  dropped: Array<{ cookie: Cookie; reason: string }>;
}
```

## 🚀 Resultados

```
📦 Read 43 total cookies from Brave
✅ Filtered 21 auth cookies
🔑 Session token: ✅
🗑️  Dropped 22 cookies (tracking/analytics)
✅ Successfully logged in!
```

## 🔗 Referencias

- [sweet-cookie npm](https://www.npmjs.com/package/@steipete/sweet-cookie)
- [Repo original](https://github.com/fitchmultz/pi-oracle)

---

**Regla de oro:** Importa siempre de `lib/cookies.ts`, nunca dupliques código en scripts.
