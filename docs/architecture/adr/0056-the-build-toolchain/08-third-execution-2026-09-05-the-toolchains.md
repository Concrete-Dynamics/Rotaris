# ADR-0056 — The build toolchain — Third execution — 2026-09-05, the toolchain's fourth defect: the collector's `EMFILE`

Part 8 of 10 of [ADR-0056](../0056-the-build-toolchain.md), which indexes every part.

## Third execution — 2026-09-05, the toolchain's fourth defect: the collector's `EMFILE`

*Recorded under GD-10; found by Part S's console spike (`../spikes/mcp-console-suppression.md`), which needed a packaged
build and was refused one.*

electron-builder 26.15's node-module collector runs `pnpm list --prod --json --depth Infinity` in `apps/desktop`, and
pnpm 11.9 opens every `package.json` of the tree at once — the walk is not narrowed by `--prod` (the file it died on
was `@eslint/config-array`'s) — so on this tree, grown past what one Windows process may hold open, the command dies
with `EMFILE: too many open files`; the collector parses the error JSON as a failure rather than an empty result, so
its traversal fallback never runs, and `pnpm package` refused before it built. Reproducible alone on an idle host, in
the main checkout. pnpm has no concurrency setting for the walk; electron-builder has no switch past the collector.

**The remedy is a file-descriptor gate, `apps/desktop/scripts/fd-gate.cjs`,** loaded through `NODE_OPTIONS=--require` for
the electron-builder step of `package.mjs` only — every node process of that step inherits it (electron-builder,
corepack's `pnpm.js`, the rebuild) and the packaged application's launch never does. It bounds `fs.open`/`fs.readFile`
and their promise forms to 200 in flight (`ROTARIS_FD_GATE`), changing order and never results. Its first form
replaced the functions bare and electron-builder failed at once with "realpath.native is not a function" — fs-extra
reads the originals' own properties — so the wrapper keeps them and only the two descriptor-holding calls are gated.
With the gate `pnpm package` passed end to end in 300.9 s: the cold rebuild, rules 1a and 4, the packaged
application's scripted session with a terminal call, store v9. IC-6 stands.

The decision's second-execution list counted the toolchain's defects at three; this is the fourth, and CLAUDE.md's
count says so.
