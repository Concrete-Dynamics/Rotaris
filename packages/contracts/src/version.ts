/**
 * The payload contract's schema version (ADR-0044). A renderer receiving a
 * version it does not understand declines every increment and re-reads,
 * which is the same path a sequence gap takes. The check exists for a stale
 * renderer surviving an in-place update.
 *
 * Bumping this is a contract change: `channels.test.ts` pins it.
 */
export const CONTRACT_SCHEMA_VERSION = 1 as const;
export type ContractSchemaVersion = typeof CONTRACT_SCHEMA_VERSION;
