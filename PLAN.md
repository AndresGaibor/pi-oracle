# PLAN — Fase 3: Refactorización POM (estado actualizado)

## Lo ya completado
- [x] `chatgpt-auth.page.ts` — Todos los `require()` y `await import()` reemplazados con imports estáticos
- [x] `snapshot-utils.ts` — `findLabeledEntry()` consolidada, import circular roto
- [x] `base.page.ts` — `SnapshotEntry` es ahora `type alias = Pick<ParsedSnapshotEntry, ...>`

## Lo que FALTA por hacer

### 1. `chatgpt.selectors.ts` — Agregar CHATGPT_TESTIDS y CHATGPT_SEMANTIC_SELECTORS
- Agregar `CHATGPT_TESTIDS` object con data-testid values
- Agregar `CHATGPT_SEMANTIC_SELECTORS` object con selectores por atributo
- Marcar `CHATGPT_LABELS` con `/** @deprecated */`

### 2. `chatgpt.actions.ts` — Usar findLabeledEntry de snapshot-utils
- Eliminar la función local `findLabeledEntry()` (líneas 79-87)
- Importar `findLabeledEntry` desde `../../shared/snapshot-utils`

### 3. `chatgpt.page.ts` — Reemplazar await import() con imports estáticos
- Línea 52, 58, 64, 70: `await import("./chatgpt.actions")` → import estático
- Línea 76: `await import("./chatgpt.assertions")` → import estático

### 4. `base.page.ts` — Eliminar import no usado de findLabeledEntry
- Verificar que no quede import de `findLabeledEntry` si no se usa

### 5. Sub-tarea 5.5 — Documentar patrón POM en base.page.ts
- Agregar JSDoc al inicio del archivo explicando la estructura POM

### 6. Verificación final
- `cd extensions/oracle && npx tsc --noEmit` debe pasar sin errores
- Commits separados por sub-tarea

## Commits planeados
1. `refactor(fase3): add CHATGPT_TESTIDS and CHATGPT_SEMANTIC_SELECTORS, deprecate CHATGPT_LABELS`
2. `refactor(fase3): consolidate findLabeledEntry usage in chatgpt.actions.ts`
3. `refactor(fase3): replace await import() with static imports in chatgpt.page.ts`
4. `refactor(fase3): remove unused findLabeledEntry import from base.page.ts`
5. `docs(fase3): add POM architecture documentation to base.page.ts`
