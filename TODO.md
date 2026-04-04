# TODO — Items Pendientes

> Esta sección documenta mejoras identificadas durante las 8 fases que **no** son bloqueantes pero deberían abordarse en futuras iteraciones.

## Futuros Proveedores

- [ ] **Claude** — Implementar `pages/claude/` completo (selectors, actions, assertions, page). Ver [docs/ADDING-A-PROVIDER.md](docs/ADDING-A-PROVIDER.md) para la guía paso a paso.
- [ ] **Gemini** — Idem, pendiente de investigación DOM.

## Mejoras de Código

- [ ] **`ai-job-runner.ts` referencia `CHATGPT_LABELS` directamente** — El job runner importa `CHATGPT_LABELS` de `chatgpt.selectors.ts`. Idealmente debería recibir labels desde el provider en vez de hardcodear ChatGPT. Esto es parte natural de la abstracción multi-provider.
- [ ] **Artifacts.json tiene un cast `as unknown as ArtifactEntry`** para entries con error — ver línea ~546 de `ai-job-runner.ts`. Sería mejor definir un `ArtifactErrorEntry` tipo separado.
- [ ] **`ai-job-runner.ts` tiene métodos `private` que podrían moverse a helpers** — `assistantSnapshotSlice`, `reopenConversationForArtifacts`, etc. manejan lógica de artefactos que podría extraerse a `lib/artifact-downloader.ts`.

## Testing

- [ ] **Tests de `provider-factory.ts`** — No hay tests unitarios específicos para la factory. Deberían cubrir: exact URL match, domain match, fallback a ChatGPT.
- [ ] **Tests de `ai-job-runner.ts`** — La clase no tiene tests unitarios por su complejidad. Idealmente mockear browser + provider y testear el flujo de envío/respuesta.
- [ ] **Cobertura target 80%** — Actualmente >60%, subir a 80% como objetivo.

## Documentación

- [ ] **Diagrama visual de arquitectura** — El ASCII art en `ARCHITECTURE.md` funciona pero un diagrama con Mermaid sería más legible en GitHub.
- [ ] **Changelog generado automáticamente** — Configurar `auto-changelog` o `semantic-release` para generar CHANGELOG.md a partir de conventional commits.

## Infraestructura

- [ ] **CI con GitHub Actions** — Ejecutar `npm test` y `tsc --noEmit` en PRs.
- [ ] **Linting** — Agregar ESLint con reglas TypeScript estrictas.
- [ ] **Pre-commit hooks** — Husky o similar para ejecutar `npm test` antes de commitear.
