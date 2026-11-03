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

## Outcome — repaired 2026-11-03, at the bundle's review

The emulator's typings no longer reach the run host's program, and its code is unchanged: `tsconfig.run-host.json` maps
`@xterm/xterm` to `packages/agent-tools/src/terminal/xterm-api.d.ts`, which re-exports from `@xterm/headless` the four
names `@xterm/addon-serialize`'s typings read (`Terminal`, `ITerminalAddon`, `IMarker`, `IBufferRange`), so `@xterm/xterm`'s
`/// <reference lib="dom" />` is never read. The project repeats the base's `paths`, since `paths` replaces rather than
merges. A scratch `document.title` in `apps/desktop/src/run-host/` now fails with TS2584 (measured), the program lists no
`lib.dom.d.ts`, and `ai-sdk-client.ts` reads `headers.entries()` again, as before (the run host's `Headers` is Node's).
`tools/typecheck-projects.test.ts` pins it: a program built with the run host's options over the emulator's two imports and
a `document` refuses the `document` and reads neither the DOM library nor `@xterm/xterm`, and the run host's `paths` equal
the base's plus that one entry. Both cases fail on the project as the builder left it. The repair needs no change to
`agent-tools`' terminal, so the reason above for leaving it was wrong.
