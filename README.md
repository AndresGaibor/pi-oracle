# pi-oracle

`pi-oracle` es una extensión de `pi` que permite al agente usar ChatGPT.com como un oráculo web de larga duración en lugar de usar la API.

Existe para los casos difíciles donde quieres:
- la cuenta real de ChatGPT del usuario
- comportamiento del modelo web en lugar de uso de API
- cargas de contexto de proyecto grande
- ejecución asincrónica en segundo plano que despierta la sesión de `pi` original cuando termina

Los trabajos normales de oráculo se ejecutan en un perfil de navegador aislado, no en la ventana activa de Chrome del usuario.

Estado: beta pública experimental, validada principalmente en macOS.

## Qué hace

La extensión añade:
- `/oracle <solicitud>`
- `/oracle-auth`
- `/oracle-status [job-id]`
- `/oracle-cancel [job-id]`
- `/oracle-clean <job-id|all>`
- `oracle_submit`
- `oracle_read`
- `oracle_cancel`

Un trabajo de oráculo:
1. recopila un archivo de proyecto
2. abre ChatGPT en un perfil de runtime aislado
3. carga el archivo y envía el prompt
4. espera en segundo plano
5. persiste la respuesta y artefactos bajo `/tmp/oracle-<job-id>/`
6. despierta la sesión de `pi` original al completarse

## Ejemplo

```text
/oracle Invoca el Oráculo para que genere una revisión exhaustiva del código de los cambios pendientes. Incluye todos los archivos modificados y archivos adyacentes en el archivo. Usa el Modelo Pro con esfuerzo extendido.
```

## Por qué existe esto

El objetivo es obtener respuestas sólidas del modelo web de ChatGPT sin:
- pagar costos de API por cada revisión larga
- bloquear el agente durante 10–90 minutos
- robar el foco de la sesión del navegador activo del usuario

## Alcance actual

Actualmente validado para:
- macOS
- Google Chrome local
- inicio de sesión web local de ChatGPT en Chrome
- perfil de seed de auth aislado + clones de perfil de runtime por trabajo
- trabajos concurrentes en diferentes proyectos/sesiones
- exclusión de misma conversación para seguimientos
- respuestas en texto plano
- captura de artefactos, incluyendo ejecuciones con múltiples artefactos

Aún no prometido:
- soporte multiplataforma
- inmunidad a cambios futuros en la UI de ChatGPT
- semántica terminal de artefacto parcial totalmente pulida

## Requisitos

- macOS
- Google Chrome o Brave Browser instalado
- ChatGPT ya iniciado en un perfil local de Chrome
- `pi` instalado
- navegadores de `playwright` instalados (`bunx playwright install`)
- `tar` y `zstd` disponibles

## Instalación

npm:

```bash
pi install npm:pi-oracle
```

GitHub:

```bash
pi install https://github.com/AndresGaibor/pi-oracle
```

## Configuración inicial

1. Asegúrate de que ChatGPT ya funcione en tu perfil local de Chrome.
2. Configura el oráculo si es necesario via `~/.pi/agent/extensions/oracle.json`.
3. Ejecuta `/oracle-auth`.
4. Ejecuta una pequeña prueba de `/oracle`.

## Configuración

Archivos de configuración:
- global: `~/.pi/agent/extensions/oracle.json`
- proyecto: `.pi/extensions/oracle.json`

Configuraciones comunes:
- `browser.args`
- `browser.executablePath`
- `browser.authSeedProfileDir`
- `browser.runtimeProfilesDir`
- `auth.chromeProfile`
- `auth.chromeCookiePath`

La configuración del proyecto debe solo sobrescribir configuraciones seguras y sin privilegios.

Docs detallados de diseño y para mantenedores:
- `docs/ORACLE_DESIGN.md`
- `docs/ORACLE_RECOVERY_DRILL.md`

## Privacidad / datos locales

Esta extensión es local-first, pero lee y persiste datos locales:
- `/oracle-auth` lee cookies de ChatGPT de un perfil local de Chrome
- los archivos de trabajos se cargan en ChatGPT.com
- respuestas y artefactos se escriben bajo `/tmp/oracle-<job-id>/`

Revisa el código y docs de diseño antes de usarlo con material sensible.

## Helpers de validación

```bash
npm run check:oracle-extension
npm run sanity:oracle
npm run pack:check
```

## Advertencias de beta

Las áreas de mayor riesgo a monitorear son:
- cambios en la UI de ChatGPT
- cambios en auth/bootstrap
- comportamiento de descarga de artefactos
- suposiciones del entorno local

## Licencia

MIT. Ver `LICENSE`.
