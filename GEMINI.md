# Contexto del Proyecto pi-oracle

`pi-oracle` es una extensión de `pi` que permite al agente usar ChatGPT.com como un oráculo web de larga duración. Utiliza Playwright para automatización de navegador, manteniendo un perfil de seed autenticado aislado y clonándolo para perfiles de runtime por trabajo.

## Resumen del Proyecto

- **Propósito**: Usar el comportamiento del modelo web de ChatGPT en lugar de API, permitiendo cargas de contexto de proyecto grande y ejecución asincrónica en segundo plano.
- **Arquitectura**:
    - **Perfiles Aislados**: Los trabajos normales de oráculo se ejecutan en perfiles de navegador aislados, no en la ventana activa del usuario.
    - **Perfil Seed**: Un único perfil seed autenticado se mantiene a través de `/oracle-auth`.
    - **Perfiles de Runtime**: Para cada trabajo, el perfil seed se clona en un perfil de runtime por trabajo.
    - **Workers Desvinculados**: Los trabajos se ejecutan en procesos worker desvinculados en segundo plano.
    - **Contexto del Proyecto**: Los archivos del proyecto se recopilan en un archivo `.tar.zst` y se cargan en ChatGPT.
- **Tecnologías Principales**: TypeScript, Node.js, Playwright, Shell (tar, zstd).

## Estructura de Directorios

- `extensions/oracle/`: El código fuente de la extensión principal.
    - `index.ts`: Punto de entrada de la extensión.
    - `lib/`: Código de biblioteca para comandos, herramientas, configuración, gestión de trabajos e interacción del navegador.
    - `worker/`: Scripts y archivos TypeScript para el worker de segundo plano.
- `scripts/`: Scripts de mantenimiento, verificación de cordura y depuración.
- `docs/`: Diseño arquitectónico (`ORACLE_DESIGN.md`) y procedimientos de recuperación (`ORACLE_RECOVERY_DRILL.md`).
- `stubs/`: Definiciones de TypeScript para la API del agente `pi`.

## Compilación y Ejecución

- **Instalar Dependencias**: `npm install` y `bun install`.
- **Instalar Navegadores de Playwright**: `npm run playwright-install`.
- **Verificación de Tipo y Validación de Extensión**: `npm run check:oracle-extension`.
- **Ejecutar Pruebas de Cordura**: `npm run sanity:oracle`.
- **Verificar Configuración de Playwright**: `npm run playwright-check`.

## Interfaz de Extensión

### Comandos

- `/oracle <solicitud>`: Instruye al agente para recopilar contexto y despachar un trabajo de oráculo.
- `/oracle-auth`: Sincroniza cookies de ChatGPT desde Brave real al perfil seed aislado.
- `/oracle-status [job-id]`: Muestra el estado de los trabajos de oráculo.
- `/oracle-cancel [job-id]`: Cancela un trabajo de oráculo activo.
- `/oracle-clean <job-id|all>`: Elimina archivos temporales para trabajos no activos.

### Herramientas (para uso del Agente)

- `oracle_submit`: Despacha un trabajo de segundo plano con un prompt y una lista de archivos.
- `oracle_read`: Lee el estado y salidas (respuesta, artefactos) de un trabajo.
- `oracle_cancel`: Cancela un trabajo activo.

## Convenciones de Desarrollo

- **Gestión de Estado**: El estado del trabajo se persiste en `/tmp/oracle-<job-id>/`.
- **Configuración**: Fusionada desde global (`~/.pi/agent/extensions/oracle.json`) y archivos de nivel de proyecto (`.pi/extensions/oracle.json`).
- **Bloqueo**: Usa un bloqueo de mantenimiento global para operaciones como bootstrap de auth y reconciliación de trabajos para prevenir condiciones de carrera.
- **Estilo de Código**: TypeScript con tipado estricto. Los scripts de shell se usan para gestión de procesos y archivado.
- **Automatización del Navegador**: Prefiere API directa de Playwright sobre herramientas CLI externas.
- **Artefactos**: Los artefactos generados por ChatGPT se detectan en la respuesta y se descargan directamente a través de Playwright.
