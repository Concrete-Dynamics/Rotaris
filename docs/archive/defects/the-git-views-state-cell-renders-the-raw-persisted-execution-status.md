## The Git view's State cell renders the raw persisted execution status

A worktree row bound to a session draws the session's status in its State cell exactly as the session listing carries it,
and the listing carries the persisted `execution_status` unnormalised (`packages/engine/src/sessions.ts`,
`status: row.execution_status || 'idle'`). Every other surface that draws a session's state passes it through
`presentationStatus` first (`OverviewView.tsx`, `MissionView.tsx`); the Git view does not, so a bound row can read
`waiting · ready`, `background · ready`, `paused_message_limit · ready`, `awaiting_plan_decision · ready` or
`interrupted · ready` — persisted words REQ-NOTIFY-049 presents as `running`, `paused` or another member. Noticed
2026-10-04 by fin14 while sizing the State column (REQ-GIT-109): the column is now measured to whatever phrase is drawn,
so the raw words fit, which is no reason to show them. Not repaired: outside that task. `mergeEligible`'s test of
`completed` reads the persisted value, which is right for eligibility and is not this defect.

## Specs

- REQ-NOTIFY-048: one normalised lifecycle vocabulary reaches the screen; a raw backend or persisted status string is never
  rendered. REQ-NOTIFY-049 gives every persisted value its presentation arm.
- REQ-GIT-109 joins "that session's execution status" onto the row; it names the fact joined, not a licence to render it
  raw, and states no exception to REQ-NOTIFY-048.

## Relevant files

- `packages/ui/src/GitView.tsx`: `statePhrase` and the worktree row's `td.git__cell-state`, which draw `RowBinding.status` as given; `joinBindings` copies `s.status` from the listing.
- `packages/engine/src/sessions.ts`: the session listing's `status`, the persisted `execution_status`.
- `packages/contracts/src/status.ts`: `presentationStatus`, the normalisation the other surfaces use.

## Outcome (2026-10-04, fin16, repaired)

Confirmed first on the unrepaired code twice. A unit test over REQ-NOTIFY-049's fourteen persisted values failed at the
first that is not its own presentation (`background` drawn where `running` is presented), and a new `pnpm git-proof`
launch, `presented` (3c), which persists the bound session as `paused_message_limit` while the app is closed and opens the
Git view without reopening the session, read `paused_message_limit · ready` in the row's State cell on the unrepaired build.

`statePhrase` (`packages/ui/src/GitView.tsx`) now draws the member of REQ-NOTIFY-048 the persisted value presents as,
through the same `presentationStatus` (`packages/contracts/src/status.ts`) the Overview and the Mission view use; an
unbound row still reads `idle · ready`, and a value no arm names presents through the catch-all as `idle`. `joinBindings`
still copies the persisted value into `RowBinding.status` (its doc comment now says so): `mergeEligible` reads it, and
eligibility is a test of the persisted `completed` (REQ-GIT-083), which presents as itself, so nothing becomes eligible by
presenting as `completed`. The State column is measured to the phrases drawn (`stateColumnFit`), so it follows the
presented words with no change.

Pinned by `packages/ui/src/ui.test.ts` ("the State cell draws the presented status, never the persisted word, for every
persisted value": every value of `EXECUTION_STATUSES` beside its presentation, each a member of `PRESENTATION_STATUSES`,
plus the catch-all and eligibility on the persisted word), and by `pnpm git-proof` launch 3c, which reads
`paused · ready` on the repair (`presented.png`). Launch 3b also now requires the bound row, keyed by the session id, among
the rows its 1440×900 and 1000×680 measurements read: its first wait goes ahead on its timeout and the second read is
pinned to the clock, so on a slow host both could have measured the base rows alone and passed.
