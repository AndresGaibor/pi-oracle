# Phase 6 Audit — Nombres, Constantes Mágicas, SRP

## Constantes mágicas encontradas

| Archivo | Línea | Literal | Contexto | Nombre Propuesto |
|---------|-------|---------|----------|-----------------|
| `worker/run-job.ts` | 116 | `200` | Poll entre reintentos de lock | `LOCK_RETRY_POLL_MS` |
| `worker/run-job.ts` | 668 | `1000` | Poll en waitForStableChatUrl | `CHAT_URL_POLL_MS` |
| `worker/run-job.ts` | 758 | `1500` | Espera post-reopen conversación | `CONVERSATION_REOPEN_SETTLE_MS` |
| `worker/run-job.ts` | 859 | `1000` | Espera entre reintentos de artifact | `ARTIFACT_RETRY_SETTLE_MS` |
| `worker/run-job.ts` | 101 | `30_000` | Timeout default acquireLock | `LOCK_ACQUIRE_TIMEOUT_MS` |
| `lib/AuthBootstrap.ts` | 189 | `200` | Poll entre reintentos | `AUTH_RETRY_POLL_MS` |
| `lib/AuthBootstrap.ts` | 397-427 | `1500` | Espera entre pasos de auth | `AUTH_STEP_SETTLE_MS` |
| `lib/ChatGPTJobRunner.ts` | 425 | `1000` | Poll en waitForStableChatUrl | `CHAT_URL_POLL_MS` |
| `lib/ChatGPTJobRunner.ts` | 552 | `1000` | Espera retry artifact | `ARTIFACT_RETRY_SETTLE_MS` |
| `lib/ChatGPTJobRunner.ts` | 640 | `1500` | Espera post-reopen | `CONVERSATION_REOPEN_SETTLE_MS` |
| `lib/jobs.ts` | 53 | `100` | Espera corta en prune | `PRUNE_SETTLE_MS` |
| `lib/jobs.ts` | 258,270 | `250` | Poll en reconcile | `RECONCILE_POLL_MS` |

## Constantes ya nominalizadas (OK)

| Archivo | Constante |
|---------|-----------|
| `ChatGPTJobRunner.ts` | `ARTIFACT_CANDIDATE_STABILITY_TIMEOUT_MS`, `ARTIFACT_CANDIDATE_STABILITY_POLL_MS`, `ARTIFACT_CANDIDATE_STABILITY_POLLS`, `ARTIFACT_DOWNLOAD_HEARTBEAT_MS`, `ARTIFACT_DOWNLOAD_TIMEOUT_MS`, `ARTIFACT_DOWNLOAD_MAX_ATTEMPTS` |
| `worker/run-job.ts` | Duplica las mismas 6 constantes arriba |

## Archivos grandes (>300 líneas)

| Archivo | Líneas | Problema |
|---------|--------|----------|
| `worker/run-job.ts` | 985 | Monolítico: tiene TODO (locks, auth, artifacts, browser, job run) |
| `lib/ChatGPTJobRunner.ts` | 716 | No importado por nadie — código documentado pero no usado |
| `lib/jobs.ts` | 603 | Grande pero cohesivo (job management) |
| `lib/AuthBootstrap.ts` | 592 | Grande pero cohesivo (bootstrap de auth) |
| `lib/config.ts` | 583 | Config loading con defaults |
| `lib/browser.ts` | 395 | Browser adapter, aceptable |

## Nombres a renombrar

| Nombre actual | Nombre propuesto | Razón |
|--------------|-----------------|-------|
| `ChatGPTJobRunner.ts` | `ai-job-runner.ts` | El worker no importa esta clase; pero el nombre debería ser genérico |
| `worker/run-job.ts` | `worker/run-oracle-job.ts` | Nombre genérico "run-job" |

## Funciones puras candidatas a @pure

| Función | Archivo | Razón |
|---------|---------|-------|
| `parseSnapshotEntries` | `shared/snapshot-utils.ts` | input → output sin efectos |
| `findEntry` | `shared/snapshot-utils.ts` | input → output sin efectos |
| `findLastEntry` | `shared/snapshot-utils.ts` | input → output sin efectos |
| `labelMatches` | `shared/snapshot-utils.ts` | input → output sin efectos |
| `isResponseComplete` | `pages/chatgpt/chatgpt.assertions.ts` | input → output sin efectos |
| `findArtifactCandidates` | `pages/chatgpt/chatgpt.assertions.ts` | input → output sin efectos |
| `preferredArtifactName` | `pages/chatgpt/chatgpt.assertions.ts` | input → output sin efectos |
| `stripQuery` | múltiples | input → output sin efectos |
| `parseConversationId` | múltiples | input → output sin efectos |
