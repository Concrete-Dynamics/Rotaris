## A closed workspace's resolution can still raise the resolution-failed banner

`InitializationCoordinator.close` marks a workspace's entry `closed` so that nothing of a workspace no window holds is
published or bannered (REQ-WORKSPACE-013, and the reading OQ-141 records). `publish` honours the flag, but
`resolution()`'s `catch` calls `this.deps.banner(RESOLUTION_FAILED_HEADLINE, RESOLUTION_FAILED_DETAIL)` without looking
at it. A resolution still under way when its workspace closes — for instance the silent `last_run` stamp for a workspace
with nothing applicable, whose marker write goes to the closed root — that then throws raises "the resolution failed"
banner on channel 12, which reaches every live window, none of which holds that workspace any more. Noticed by the
verification of the repair of the switch-time cancellation on 2026-09-30 (an optional finding) and recorded while
repairing it under R-067; not reproduced, and not repaired here. The stamp itself is left in place deliberately, as
OQ-141 states; only the banner is at issue.

## Specs

- REQ-WORKSPACE-013: the replacement window resolves initialization independently of the outgoing one; nothing of the
  cancelled run is recorded, and by the build's reading (OQ-141) nothing of it is shown.
- REQ-WORKSPACE-102: the resolution-failed banner is for the window whose resolution failed; here there is none.

## Relevant files

- `apps/desktop/src/main/initialization.ts` — `resolution()`'s `catch` (the unguarded `banner`), beside `publish`, which
  checks `e.closed`, and `close`.

## Outcome — repaired 2026-10-01 (R-067)

`resolution()`'s `catch` now reads `e.closed` before the banner, as `publish` does: a resolution that fails after its
workspace was closed raises no "Project setup could not be checked" banner and says so in the log at info level
("initialization: resolution failed for {root}, which was closed while it was under way, so nothing is shown ({cause})");
a workspace still open fails as before, with the warning and REQ-WORKSPACE-102's banner. The silent `last_run` stamp is
left as OQ-141 states.

Pinned by `apps/desktop/src/main/initialization.test.ts`: "raises no resolution-failed banner when a workspace closed while
its silent stamp was in flight then fails it, and says so in the log" (the stamp's write held, the workspace closed behind
a replacement, the write then rejected; red on the code before with the banner raised), and beside it "raises the
resolution-failed banner when an open workspace's silent stamp throws", which no case covered before. **Not shown in the
built app:** no proof can hold the stamp's write while a switch lands, and a write to a closed workspace's service that
gets no answer rejects only after its 30 s bound. `workspace-proof` (scenario 8b's switch included) passed on the repair,
41 passed, 0 failed, 2 skipped, with no resolution failure in any launch's log (as root under Xvfb, Node 24,
`--skip-build` after `pnpm build`).
