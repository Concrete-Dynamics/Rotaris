## A timed-out improvement analysis reads as one that found nothing

When a post-run improvement analysis reaches `runtime.improvement_collector_timeout`, its result is REQ-LIBRARY-023's empty
artifact with `notes` = `collector timed out after <t> seconds`. Main raises REQ-LIBRARY-124's zero-proposal notice for it
exactly as for a review that looked and proposed nothing: "Improvement analysis complete — no proposals" with the detail
"Nothing was proposed in <id>." (`apps/desktop/src/main/index.ts`, the coordinator's `stored`). A person cannot tell an
analysis cut off by its bound from an empty one, nor that the bound is what to raise. OQ-114's F4 measured six analyst calls
on the owner's endpoint at 22 to 134 s, three past the 60 s default R-071 kept. Noticed on 2026-10-07 by advocate A of the
R-072 consortium's question IT1 (OQ-223), whose ruling builds the repair; recorded before its code, as the ruling asks.

## Specs

REQ-NOTIFY-100 (an operation's bound reached is reported as that operation's timeout), REQ-LIBRARY-023 (the timeout
artifact's notes), REQ-LIBRARY-124 (the zero-proposal notice: its title and its absence of an action, unchanged by the
repair); `PD-CONFIG-003` revision 2.

## Relevant files

- `apps/desktop/src/main/index.ts` — the improvement coordinator's `stored` handler, which raises the zero-proposal notice.
- `packages/engine/src/improvements/analyst.ts` — where the timeout's notes are written.
