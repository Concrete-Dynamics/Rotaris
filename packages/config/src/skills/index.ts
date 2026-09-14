/**
 * Portable skill discovery (ADR-0063; REQ-WORKSPACE-051..066). Pure but for `discover.ts` and
 * `manual.ts`, which reach a filesystem through injectable ports.
 *
 * It lives in `config` rather than in `workspace`, whose `CONTEXT.md` owns the vocabulary, because the
 * component view's matrix does not let the run host import `workspace` and injection happens at agent
 * construction — the run host's. Contexts follow spec domains, not packages (`CONTEXT-MAP.md`).
 */
export * from './names.js';
export * from './roots.js';
export * from './manifest.js';
export * from './parse.js';
export * from './discover.js';
export * from './policy.js';
export * from './blocks.js';
export * from './manual.js';
