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
