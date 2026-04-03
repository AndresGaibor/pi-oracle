#!/usr/bin/env bash
# verify-playwright-pure.sh
# Verifies that the project uses only Playwright (pure) without agent-browser or other browser automation libraries

set -euo pipefail

echo "🔍 Verifying Playwright Pure Implementation..."
echo

ERRORS=0

# Check 1: No agent-browser references
echo "✓ Checking for agent-browser references..."
if grep -r "agent-browser\|from.*agent-browser" . --include="*.ts" --include="*.js" --include="*.json" ! -path "*/node_modules/*" 2>/dev/null; then
  echo "❌ Found agent-browser references!"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ No agent-browser dependencies"
fi
echo

# Check 2: No other browser automation libraries
echo "✓ Checking for alternative browser automation libraries..."
if grep -r "puppeteer\|selenium\|webdriver\|nightwatch\|cypress\|playwright-extra" . --include="*.ts" --include="*.js" --include="*.json" ! -path "*/node_modules/*" 2>/dev/null; then
  echo "❌ Found non-Playwright browser automation libraries!"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ No alternative browser automation libraries"
fi
echo

# Check 3: No orphaned .js or .mjs files in source
echo "✓ Checking for orphaned .js/.mjs files..."
JS_FILES=$(find scripts extensions adapter stubs -name "*.js" -o -name "*.mjs" 2>/dev/null || true)
if [ -n "$JS_FILES" ]; then
  echo "⚠️  Found .js/.mjs files (should be .ts):"
  echo "$JS_FILES" | sed 's/^/    /'
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ No orphaned .js/.mjs files"
fi
echo

# Check 4: Verify TypeScript configuration includes scripts
echo "✓ Checking TypeScript configuration..."
if grep -q "scripts/\*\*/\*.ts" tsconfig.json; then
  echo "  ✅ tsconfig.json includes scripts/**/*.ts"
else
  echo "❌ tsconfig.json does not include scripts/**/*.ts"
  ERRORS=$((ERRORS + 1))
fi
echo

# Check 5: Verify playwright is in dependencies
echo "✓ Checking dependencies..."
if grep -q '"playwright"' package.json; then
  echo "  ✅ Playwright in package.json"
else
  echo "❌ Playwright not found in package.json"
  ERRORS=$((ERRORS + 1))
fi
echo

# Check 6: Verify no eval() in TypeScript files (except eval adapters)
echo "✓ Checking for unsafe eval patterns..."
UNSAFE_EVALS=$(grep -r "eval(" . --include="*.ts" ! -path "*/node_modules/*" ! -path "*/adapter/playwright-adapter.ts" ! -path "*/worker/run-job.ts" 2>/dev/null || true)
if [ -n "$UNSAFE_EVALS" ]; then
  echo "⚠️  Found eval() calls (only adapter and worker should use eval):"
  echo "$UNSAFE_EVALS" | head -5 | sed 's/^/    /'
else
  echo "  ✅ No unsafe eval() patterns"
fi
echo

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ]; then
  echo "✅ PASS: Project verified as Playwright Pure"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
else
  echo "❌ FAIL: Found $ERRORS verification error(s)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
