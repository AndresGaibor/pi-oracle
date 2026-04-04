/**
 * Constantes globales del sistema Oracle.
 *
 * Cada constante incluye su unidad en el sufijo (_MS, _ATTEMPTS).
 * Los valores son configurables vía OracleConfig en futuras versiones.
 */

// =============================================================================
// TIEMPOS DE ESPERA (en milisegundos)
// =============================================================================

/** Poll entre reintentos de adquisición de lock */
export const LOCK_RETRY_POLL_MS = 200;

/** Poll para estabilización de URL de chat */
export const CHAT_URL_POLL_MS = 1_000;

/** Espera después de reabrir una conversación para capturar artefactos */
export const CONVERSATION_REOPEN_SETTLE_MS = 1_500;

/** Espera entre reintentos de descarga de artefacto */
export const ARTIFACT_RETRY_SETTLE_MS = 1_000;

/** Espera corta en prune de jobs */
export const PRUNE_SETTLE_MS = 100;

/** Poll en reconcile de jobs */
export const RECONCILE_POLL_MS = 250;

/** Espera entre pasos de autenticación en AuthBootstrap */
export const AUTH_STEP_SETTLE_MS = 1_500;

/** Poll entre reintentos de autenticación */
export const AUTH_RETRY_POLL_MS = 200;

// =============================================================================
// TIMEOUTS (en milisegundos)
// =============================================================================

/** Timeout máximo para adquirir un lock (acquireLock, releaseLease, etc.) */
export const LOCK_ACQUIRE_TIMEOUT_MS = 30_000;

/** Timeout máximo para la detección de estabilidad de candidatos de artefacto */
export const ARTIFACT_CANDIDATE_STABILITY_TIMEOUT_MS = 15_000;

/** Timeout para descarga individual de artefacto */
export const ARTIFACT_DOWNLOAD_TIMEOUT_MS = 90_000;

// =============================================================================
// INTERVALOS DE POLLING (en milisegundos)
// =============================================================================

/** Intervalo entre polls al verificar estabilidad de candidatos de artefacto */
export const ARTIFACT_CANDIDATE_STABILITY_POLL_MS = 1_500;

/** Número de polls consecutivos estables para confirmar estabilidad de artefactos */
export const ARTIFACT_CANDIDATE_STABILITY_POLLS = 2;

/** Intervalo entre heartbeats durante descarga de artefactos (withHeartbeatWhile) */
export const ARTIFACT_DOWNLOAD_HEARTBEAT_MS = 10_000;

// =============================================================================
// LÍMITES Y UMBRALES
// =============================================================================

/** Número máximo de reintentos para descarga de artefactos */
export const ARTIFACT_DOWNLOAD_MAX_ATTEMPTS = 2;

/** Número de lecturas estables consecutivas para confirmar respuesta completa */
export const RESPONSE_STABLE_READS = 3;

/** Número de URLs estables consecutivas para confirmar chat URL */
export const CHAT_URL_STABLE_COUNT = 2;

/** Timeout para espera de chat completion (60 segundos) — hard cap independiente del config */
export const CHAT_URL_STABILIZE_TIMEOUT_MS = 60_000;
