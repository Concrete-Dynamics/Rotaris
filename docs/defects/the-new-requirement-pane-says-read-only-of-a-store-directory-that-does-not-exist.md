## The New requirement pane says "read-only" of a store directory that does not exist

Found on 2026-11-11 by the independent critique of the Requirements board's empty states (UIR-409,
[the requirements-board brief](../design/briefs/requirements-board.md)); not repaired, since what the board can say here
depends on what the projection reports, which is [OQ-549](../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-549).

In a workspace with no layout file and no `docs/requirements` directory, the board's header draws "New requirement"
enabled (measured on the built application, `pnpm app:drive`: `disabled === false`; the control is disabled only when
the projection reports no store, `RequirementsView.tsx`). The pane it opens finds no source that offers creation and
states "The requirement store is read-only for this account, so nothing can be created here."
(`packages/ui/src/requirements/panes/EditorPane.tsx`; read in the source, the pane was not driven). The directory is
not read-only: it does not exist. The service knows the difference (`probeSourceWritability` in
`packages/workspace/src/delivery/runs.ts` returns "… does not exist under …; nothing can be written there." for the
one and "… is read-only for this account …" for the other) and the projection carries only the two booleans, so the
renderer cannot tell them apart and words the one it guesses. On the same view the adoption strip reads "No candidate
requirements store was found." above an empty state that speaks of a requirement source.

## Specs

REQ-TRACE-444: "A workspace with no writable store SHALL get a board and no editor" is met: no editor opens.
REQ-TRACE-435 asks that where a source cannot be written the view "say the source is read-only, name that source", and
that "one sentence SHALL carry that statement"; the sentence drawn names no source and gives a reason that does not
hold for a missing directory.

## Relevant files

- `packages/ui/src/requirements/panes/EditorPane.tsx` — the pane's sentence.
- `packages/ui/src/requirements/RequirementsView.tsx` — the control's enablement.
- `packages/workspace/src/delivery/runs.ts` — `probeSourceWritability`, whose reason the projection drops.
- `packages/workspace/src/delivery/projection.ts` — `source`.
