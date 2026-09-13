// The types for `replace.mjs`. That module is plain JavaScript on purpose — its callers are a build script and
// vitest's before-collection hook, neither of which compiles TypeScript — so its contract is declared here for
// the regression that exercises it (REQ-TRACE-061, REQ-TRACE-502).

/** REQ-TRACE-061: the four delays behind five attempts in total, in milliseconds. */
export declare const LADDER_MS: readonly number[];

/**
 * Replace the whole of `target` with `text`, atomically as a reader observes it. Returns the attempt it
 * succeeded on; throws on exhaustion, with `target` left exactly as it stood.
 */
export declare function replaceAtomically(target: string, text: string): number;
