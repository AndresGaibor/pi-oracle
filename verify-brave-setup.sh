#!/bin/bash
# Script de verificación de configuración de pi-oracle con Brave

echo "🔍 Verificación de configuración de pi-oracle con Brave"
echo "=========================================================="
echo ""

# 1. Verificar Brave
echo "1️⃣ Verificando instalación de Brave..."
if [ -f "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" ]; then
    VERSION=$("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" --version)
    echo "   ✅ $VERSION"
else
    echo "   ❌ Brave no encontrado"
    exit 1
fi
echo ""

# 2. Verificar perfil de Brave
echo "2️⃣ Verificando perfil de Brave..."
if [ -d "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/Default" ]; then
    echo "   ✅ Perfil Default encontrado"
else
    echo "   ❌ Perfil Default no encontrado"
    exit 1
fi
echo ""

# 3. Verificar configuración de oracle
echo "3️⃣ Verificando configuración de oracle..."
if [ -f "$HOME/.pi/agent/extensions/oracle.json" ]; then
    echo "   ✅ Configuración encontrada"
    echo ""
    echo "   Rutas configuradas:"
    echo "   -------------------"
    jq -r '.browser.executablePath' "$HOME/.pi/agent/extensions/oracle.json" | sed 's/^/   Ejecutable: /'
    jq -r '.browser.authSeedProfileDir' "$HOME/.pi/agent/extensions/oracle.json" | sed 's/^/   Perfil seed: /'
    jq -r '.browser.runtimeProfilesDir' "$HOME/.pi/agent/extensions/oracle.json" | sed 's/^/   Runtime: /'
else
    echo "   ❌ Configuración no encontrada"
    exit 1
fi
echo ""

# 4. Verificar cookies de ChatGPT
echo "4️⃣ Verificando cookies de ChatGPT en Brave..."
if command -v node &> /dev/null; then
    if [ -f "test-brave-cookies.mjs" ]; then
        node test-brave-cookies.mjs 2>&1 | grep -E "^(✅|❌|🔑)" | head -3
    else
        echo "   ⚠️  Script de verificación no encontrado"
    fi
else
    echo "   ❌ Node.js no encontrado"
fi
echo ""

# 5. Verificar pi
echo "5️⃣ Verificando instalación de pi..."
if command -v pi &> /dev/null; then
    echo "   ✅ pi $(pi --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
else
    echo "   ❌ pi no encontrado"
    exit 1
fi
echo ""

# 6. Verificar extensión oracle
echo "6️⃣ Verificando extensión oracle..."
if [ -d "/Users/andresgaibor/code/javascript/pi-extensions/pi-oracle/extensions/oracle" ]; then
    echo "   ✅ Extensión oracle instalada desde: $(pwd)"
else
    echo "   ⚠️  Ejecuta este script desde el directorio pi-oracle"
fi
echo ""

echo "=========================================================="
echo "✅ Configuración lista para usar"
echo ""
echo "📝 Próximos pasos:"
echo ""
echo "1. Abre pi en tu proyecto:"
echo "   $ pi"
echo ""
echo "2. Ejecuta el comando de autenticación:"
echo "   /oracle-auth"
echo ""
echo "3. Prueba con una consulta simple:"
echo "   /oracle Revisa este código y sugiere mejoras"
echo ""
echo "4. Verifica el estado:"
echo "   /oracle-status"
echo ""
echo "📚 Documentación completa en: BRAVE_SETUP.md"
