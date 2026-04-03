#!/usr/bin/env node
import { getCookies } from "@steipete/sweet-cookie";
import { homedir } from "node:os";
import { resolve } from "node:path";

const BRAVE_PROFILE_PATH = resolve(
  homedir(),
  "Library/Application Support/BraveSoftware/Brave-Browser/Default"
);

const CHATGPT_COOKIE_ORIGINS = [
  "https://chatgpt.com",
  "https://chat.openai.com",
  "https://atlas.openai.com",
  "https://auth.openai.com",
  "https://sentinel.openai.com",
  "https://ws.chatgpt.com",
];

console.log("🔍 Verificando cookies de Brave...");
console.log(`📂 Perfil: ${BRAVE_PROFILE_PATH}`);
console.log(`\n⚠️  IMPORTANTE: Cierra Brave completamente antes de continuar.`);
console.log(`   (Brave debe estar cerrado para leer las cookies)\n`);

try {
  const { cookies, warnings } = await getCookies({
    url: "https://chatgpt.com",
    origins: CHATGPT_COOKIE_ORIGINS,
    browsers: ["chrome"],  // sweet-cookie trata a Brave como Chrome
    mode: "merge",
    chromeProfile: BRAVE_PROFILE_PATH,
    timeoutMs: 8_000,
  });
  
  if (warnings.length > 0) {
    console.log("⚠️  Advertencias:");
    for (const warning of warnings) {
      console.log(`   - ${warning}`);
    }
    console.log();
  }
  
  let allCookies = cookies || [];
  
  console.log(`\n📊 Total cookies encontradas: ${allCookies.length}\n`);
  
  if (allCookies.length === 0) {
    console.log("❌ No se encontraron cookies de ChatGPT");
    console.log("   Por favor, inicia sesión en ChatGPT usando Brave primero\n");
    process.exit(1);
  }

  const importantCookies = allCookies.filter(c => 
    c.name.includes("session") || 
    c.name.includes("auth") ||
    c.name === "__Secure-next-auth.session-token"
  );

  console.log(`🔑 Cookies de autenticación importantes: ${importantCookies.length}\n`);
  
  for (const cookie of importantCookies.slice(0, 10)) {
    console.log(`   - ${cookie.name}`);
    console.log(`     Dominio: ${cookie.domain}`);
    console.log(`     Expira: ${cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toLocaleString() : "sesión"}`);
    console.log();
  }

  console.log("✅ Brave está correctamente configurado para oracle\n");
  process.exit(0);
} catch (error) {
  console.error("❌ Error al leer cookies:", error.message);
  console.log("\n💡 Verifica que:");
  console.log("   1. Brave está cerrado (las cookies pueden estar bloqueadas)");
  console.log("   2. Has iniciado sesión en ChatGPT en Brave");
  console.log("   3. La ruta del perfil es correcta\n");
  process.exit(1);
}
