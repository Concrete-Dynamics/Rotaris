## The run host's typecheck declares the DOM's globals through the terminal emulator's typings

Since R-091's per-process projects (hardening.md §3.5 row 5, 2026-11-03), main, the preload and the workspace service are
checked against Node's types and no DOM, and a `document` or a `window` written there fails `pnpm typecheck`
(measured with a scratch file in each). The run host and `agent-tools` cannot have that guarantee from their own
project: `packages/agent-tools/src/terminal/emulator.ts` imports `@xterm/addon-serialize`, whose typings import
`@xterm/xterm`'s, and those open with `/// <reference lib="dom" />`. Any program that holds the emulator therefore
declares every DOM global, so a scratch `document.title` in `apps/desktop/src/run-host/` typechecks clean (measured on
2026-11-03), and the run host's `Headers` was the DOM's without its iterable half (`ai-sdk-client.ts` now reads it through
`forEach`). `tsconfig.run-host.json` keeps the run host and `agent-tools` apart, so the leak reaches no other process's
project; inside it a DOM use is caught only by review and by the run host failing at run time.

A repair would keep the emulator's typings out of the run host's program — a declaration of the few members
`emulator.ts` reads, in place of the package's own, or the emulator moved behind a module whose types say nothing of the
DOM — and is not built here: either changes `agent-tools`' terminal, outside this bundle's scope.

## Specs

ADR-0002 draws the process boundary; ADR-0044 sandboxes the renderer. No requirement states the typecheck's libraries.
hardening.md §3.5 row 5 is the finding this narrows.

## Relevant files

- `tsconfig.run-host.json` — the run host's project, apart, and why.
- `packages/agent-tools/src/terminal/emulator.ts` — imports `@xterm/headless` and `@xterm/addon-serialize`.
- `node_modules/@xterm/xterm/typings/xterm.d.ts` — the `/// <reference lib="dom" />`.
- `packages/model/src/ai-sdk-client.ts` — `headerRecord`, the `Headers` read that works under either library.
