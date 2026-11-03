/**
 * What `@xterm/addon-serialize`'s typings read of `@xterm/xterm`, taken from `@xterm/headless`, the emulator the run host
 * runs (ADR-0021), for the run host's typecheck alone (`tsconfig.run-host.json` maps `@xterm/xterm` here; R-091,
 * hardening.md §3.5 row 5). `@xterm/xterm`'s own typings open with `/// <reference lib="dom" />`, which would declare
 * every DOM global in the run host's program, so a `document` there would typecheck. The addon types its `Terminal`
 * parameter from these names; at run time it is handed a headless `Terminal`, as `emulator.ts` does.
 */
export type { IBufferRange, IMarker, ITerminalAddon, Terminal } from '@xterm/headless';
