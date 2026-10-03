## Code comments and proof scripts cite defect notes at paths they no longer have

Comments in product code, tests and proof scripts cite defect notes by their path, and several of those notes have since
been repaired and moved to `docs/defects/fixed/` (or were never at the cited path), so the pointers are dead.
`tools/check-record-links.mjs` reads the record's Markdown links only, so nothing catches a path in a `.ts`, `.tsx` or `.mjs`
file. Found on 2026-10-03 by plan fin12 while repairing the same shape in `live-run.mjs`
([live-runs-notes-cite-defect-notes-at-paths-they-no-longer-have.md](fixed/live-runs-notes-cite-defect-notes-at-paths-they-no-longer-have.md)),
by searching every `docs/defects/….md` path under `apps/`, `packages/` and `tools/` for one that does not exist; not repaired
here (outside that task).

Cited at a path that does not exist (file:line on fin12's branch, cut from origin/main c69f351); every note but two now lives
in `docs/defects/fixed/`, and `settled-reasoning-row-counts-forever.md` and `group-header-claims-the-role-gutter.md` are in
neither directory:

- `apps/desktop/scripts/lib/model-traffic.mjs:205`, `apps/desktop/scripts/lib/model-traffic.test.ts:199`:
  `single-retry-stream-stall-aborted-a-76-minute-run.md`.
- `apps/desktop/scripts/lib/proof-isolation.test.ts:5`: `proof-isolation-is-windows-only-so-a-driven-run-writes-the-users-real-data-directory.md`.
- `apps/desktop/scripts/sandbox-proof.mjs:181`, `packages/contracts/src/config.ts:72`: `settings-surface-refuses-the-six-security-keys.md`.
- `apps/desktop/scripts/transcript-proof.mjs:232, 489`, `packages/ui/src/transcript/TranscriptPane.tsx:143`,
  `packages/ui/src/transcript/cache.ts:176`, `packages/ui/src/transcript/transcript.test.ts:292`: `live-rows-are-never-measured.md`.
- `apps/desktop/src/main/initialization.test.ts:1243`: `a-setup-that-finishes-before-its-start-is-answered-is-never-seen-to-finish.md`.
- `apps/desktop/src/run-host/mcp.ts:115`, `packages/config/src/init/classify.ts:18`: `classification-decided-by-the-runtimes-extension-list.md`.
- `packages/contracts/src/initialization.ts:134`, `packages/ui/src/composer.ts:338`: `two-requirements-fix-the-composer-setup-refusal-differently.md`.
- `packages/ui/src/transcript/Row.tsx:253`: `settled-reasoning-row-counts-forever.md`; `Row.tsx:357`: `group-header-claims-the-role-gutter.md`.
- `packages/ui/src/transcript/pool.ts:166`: `role-gutter-truncation-rule-is-inert.md`.

## Specs

None: pointers into the record. `docs/defects/README.md` has every link to a moved note's old path move with it; these
are not Markdown links, so the moves left them behind.

## Relevant files

- The files listed above, each at its line.
- `tools/check-record-links.mjs`: the record's link check, which reads no code. A check over code comments (as
  `apps/desktop/scripts/lib/live-run-defect-citations.test.ts` does for `live-run.mjs` alone) would hold the rest.
