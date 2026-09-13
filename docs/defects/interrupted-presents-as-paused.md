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

## Relevant files

- `packages/contracts/src/status.ts` — `presentationStatus`; the `case 'interrupted':` label sits
  in the arm that returns `'paused'` and belongs in the arm that returns the value itself, or in
  an arm of its own returning `'idle'`.
- `packages/contracts/src/contracts.test.ts` — where a regression for the mapping would sit; the
  fix wants one assertion per member of REQ-SESSION-073's fourteen so the next fold is caught.
- `packages/ui/src/composer.ts` — one reader of the presentation status, for the composer's
  partition of REQ-NOTIFY-048's nine; it inherits whatever `presentationStatus` returns.
