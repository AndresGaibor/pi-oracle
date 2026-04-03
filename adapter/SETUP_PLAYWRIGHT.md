# SETUP_PLAYWRIGHT

Pasos para preparar y verificar Playwright en este repositorio (Node >= 20):

1. Instalar dependencias del proyecto:

   npm install

2. Instalar navegadores de Playwright (requerido para ejecutar checks):

   npx playwright install

   - Si necesita instalar solo navegadores específicos, use p. ej. `npx playwright install chromium`.

3. (Opcional) Controlar la bandera de feature USE_PLAYWRIGHT:

   - Por defecto el script de verificación está habilitado.
   - Para deshabilitar temporalmente, exporte USE_PLAYWRIGHT=0 (o false).

4. Ejecutar el script de verificación quick-start:

   npm run playwright-check

   - El script crea un directorio temporal para el perfil, lanza un contexto persistente headless, abre `about:blank` y cierra el contexto.
   - Salida esperada (ejemplo):

     Created temporary user data dir: /tmp/playwright-abc123
     Successfully opened about:blank with a persistent context.
     Closed Playwright context.
     Removed temporary dir.

Notas:
- Si obtiene un error al importar `playwright`, asegúrese de haber ejecutado `npm install` y `npx playwright install`.
- Mantuvimos `playwright` como devDependency en package.json y añadimos los scripts `playwright-install` y `playwright-check`.
