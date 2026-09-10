/**
 * ADR-0040 — the traceability engine (Part AJ): a stateless streaming library over files, with one I/O owner.
 *
 * The core is pure compute over bytes: the owner (the workspace service thread) reads the five repository
 * artifacts open-read-close and hands the strings in; a job returns its result plus an ordered list of whole-file
 * writes, which the owner performs through platform's atomic document with REQ-TRACE-061's ladder. No worker opens
 * those five paths (ADR-0040 #6). Requirement documents and source files are streamed by the core itself, one at a
 * time (specific 1, consequence 8).
 */
export * from './frontmatter.js';
export * from './identifiers.js';
export * from './hashes.js';
export * from './layout.js';
export * from './root.js';
export * from './cancel.js';
export * from './progress.js';
export * from './tombstones.js';
export * from './store.js';
export * from './probe.js';
export * from './conventions.js';
export * from './parser.js';
export * from './sweep.js';
export * from './artifact.js';
export * from './baselines.js';
export * from './verify.js';
export * from './coverage.js';
export * from './compare.js';
export * from './jobs.js';
export * from './executor.js';
export * from './worker.js';
export * from './engine.js';
