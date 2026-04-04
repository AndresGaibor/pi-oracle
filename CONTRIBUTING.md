# Contributing a pi-oracle

Gracias por tu interés en contribuir a pi-oracle. Esta guía describe el flujo de trabajo y las convenciones del proyecto.

## Flujo de Trabajo

1. **Fork** el repositorio
2. **Crea una rama** descriptiva: `feat/claude-provider`, `fix/streaming-detection`, `docs/architecture`
3. **Haz tus cambios** siguiendo las convenciones descritas abajo
4. **Ejecuta los tests:** `npm test`
5. **Verifica tipos:** `tsc --noEmit`
6. **Commit** con formato convención: `tipo(alcance): descripción`
7. **Push** y abre un Pull Request

## Formato de Commits

Usa [Conventional Commits](https://www.conventionalcommits.org/):

| Tipo | Descripción | Ejemplo |
|------|-------------|---------|
| `feat` | Nueva funcionalidad | `feat(claude): add Claude provider support` |
| `fix` | Corrección de bug | `fix(chatgpt): fix streaming detection on thinking models` |
| `refactor` | Refactorización sin cambio de comportamiento | `refactor(pom): migrate to data-testid selectors` |
| `test` | Tests nuevos o corregidos | `test(snapshots): add unit tests for parseSnapshotEntries` |
| `docs` | Documentación | `docs(arch): update architecture diagram` |
| `chore` | Mantenimiento | `chore(deps): update playwright to 1.50` |

## Convenciones de Código

### Selectores

- **Usa `data-testid`** como estrategia primaria (estables entre deploys)
- **Nunca** dependas de clases CSS de Tailwind ni text labels traducibles
- Ver `pages/chatgpt/chatgpt.selectors.ts` como referencia
- Los selectores van en su propio archivo (`.selectors.ts`), separados de actions/assertions

### Imports

- Estáticos al inicio del archivo (nunca `await import()` dinámico ni `require()`)
- Tipos con `import type { ... }` cuando solo se necesitan como tipos
- Rutas relativas con extensión `.ts` (ESM)

### Nombres

- **Constantes:** `SCREAMING_SNAKE_CASE` con unidades (`_MS`, `_SECONDS`)
  - Ejemplos: `RESPONSE_POLL_INTERVAL_MS`, `AUTH_TRANSITION_TIMEOUT_MS`
- **Funciones puras:** anotadas con `@pure` en JSDoc
- **Funciones asíncronas:** nombre descriptivo con verbo de acción
- **Clases:** PascalCase, nombre describe responsabilidad (`AIJobRunner`, `ArtifactDownloader`)
- **Archivos:** `kebab-case`

### Funciones Puras

Las funciones puras (`@pure`) son esenciales para el testeo unitario:
- No tienen efectos secundarios
- El resultado depende únicamente de los argumentos
- Se pueden testear sin mocks ni navegador
- Van en archivos `.assertions.ts` o utils

### Page Object Model (POM)

Cada proveedor de IA sigue la estructura de 4 archivos:

```
pages/{provider}/
├── {provider}.selectors.ts    # Selectores (fuente única de verdad)
├── {provider}.actions.ts      # Funciones puras de acción
├── {provider}.assertions.ts   # Funciones puras de aserción
└── {provider}.page.ts         # Page Object principal
```

Ver `pages/chatgpt/` como referencia implementada.

## Testing

- Toda función pura debe tener tests unitarios
- Usar `createMockBrowserActions()` de `tests/fixtures/mock-browser-actions.ts`
- Tests E2E van en `tests/integration/` con sufijo `.chatgpt.spec.ts`
- Tests E2E que requieren auth deben usar `test.describe.skip()` para CI

Ver [docs/TESTING.md](docs/TESTING.md) para la guía completa.

## Agregar un Proveedor de IA

Ver [docs/ADDING-A-PROVIDER.md](docs/ADDING-A-PROVIDER.md) para la guía paso a paso incluyendo checklist completo.

## Arquitectura

Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para entender la arquitectura del proyecto.

## Reportar Bugs

Abre un issue con:

1. Descripción del problema
2. Pasos para reproducir
3. Output relevante (logs, snapshots, errores)
4. Plataforma (OS, navegador, versión de Node.js)
