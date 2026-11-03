/**
 * The web platform's globals that the code both process kinds share reads, declared for the shared project alone
 * (`tsconfig.shared.json`: the language, no DOM, no Node types; R-091, hardening.md §3.5 row 5). Node and Chromium both
 * implement them as the WHATWG specifications define them, so each side's program types them from its own library (the
 * DOM's, `@types/node`'s) and never reads this file: it is no module, and nothing imports it. Each interface names only
 * the members `contracts` reads, so a new use of a member, or of another host global — `Buffer`, `process`,
 * `document` — fails the shared project until it is declared here, deliberately, as both hosts' own.
 *
 * The uses: `config.ts`'s `dictationFieldProblem` parses a URL (`URL`, `protocol`); `requirements.ts`'s `PassOptions`
 * carries a cancellation (`AbortSignal`, a type only); `terminal-keys.ts`'s `bytesFor` encodes a key's text
 * (`TextEncoder`).
 */
interface URL {
  readonly protocol: string;
}
declare const URL: { prototype: URL; new (url: string | URL, base?: string | URL): URL };

interface AbortSignal {
  readonly aborted: boolean;
}

interface TextEncoder {
  encode(input?: string): Uint8Array;
}
declare const TextEncoder: { prototype: TextEncoder; new (): TextEncoder };
