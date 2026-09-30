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
