## `interrupted` presents as `paused` instead of `idle`

`presentationStatus` maps the persisted execution status `interrupted` onto the presentation
status `paused`. It should map onto `idle`. `isBusy` is unaffected — neither value is busy — so
what is wrong is the label a repaired session shows and the affordance it implies: `paused`
reads as resumable, `idle` reads as at rest, and a session stale repair marked `interrupted` is
at rest.

Noticed while reading the status vocabularies for item A4 of the accepted review; not in that
item's scope to fix.

## Specs

Contradicts **REQ-NOTIFY-049**, which states the arm in its own words: "`interrupted` presents as
`idle`, consistent with a repaired session presenting as not busy under REQ-NOTIFY-151 and
REQ-NOTIFY-160." The same requirement's arm for `paused_message_limit` and
`awaiting_plan_decision` — both of which do present as `paused` — is implemented correctly; the
defect is that `interrupted` was folded in with them.

**REQ-SESSION-073** is the owner of the persisted vocabulary and records that `interrupted` is
"written only by stale repair", which is the case REQ-NOTIFY-049's reasoning is about.

## Repaired — 2026-09-13

Fixed in `packages/contracts/src/status.ts`: `interrupted` now has its own arm returning
`'idle'`, with the REQ-NOTIFY-049/160 citation beside it. The regression the note asked for
is in `packages/contracts/src/contracts.test.ts`: one stated arm per member of
REQ-SESSION-073's fourteen, a check that every arm lands in REQ-NOTIFY-048, the catch-all to
`idle`, and the not-busy assertion for `interrupted` beside the busy one for `waiting`. The
two existing assertions of the old mapping — `packages/engine/src/run/run-pure.test.ts` and
`packages/ui/src/composer.test.ts` — were corrected to the requirement's arm rather than left
green against the wrong value.

Verification: focused suites `contracts.test.ts`, `run-pure.test.ts`, `composer.test.ts`,
`ui.test.ts` passed (75 tests); `tsc -p tsconfig.json --noEmit` and `git diff --check`
clean. No visual re-draw was involved — the change is one mapping arm — so the design-language
pair is not engaged. The composer's partition (`CHIPS_DISABLED_STATES`) is unchanged: `idle`
was already enabled there, which is exactly the affordance REQ-NOTIFY-160 describes — a
repaired session reads as at rest, its chips usable, its interrupted marker (REQ-NOTIFY-156)
carrying the distinction the label no longer tries to.

## Relevant files

- `packages/contracts/src/status.ts` — `presentationStatus`; the `case 'interrupted':` label sits
  in the arm that returns `'paused'` and belongs in the arm that returns the value itself, or in
  an arm of its own returning `'idle'`.
- `packages/contracts/src/contracts.test.ts` — where a regression for the mapping would sit; the
  fix wants one assertion per member of REQ-SESSION-073's fourteen so the next fold is caught.
- `packages/ui/src/composer.ts` — one reader of the presentation status, for the composer's
  partition of REQ-NOTIFY-048's nine; it inherits whatever `presentationStatus` returns.
