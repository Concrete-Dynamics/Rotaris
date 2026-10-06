## PD-ORCH-014 records REQ-CONFIG-135 as extended where OQ-53's ruling narrows it

`PD-ORCH-014`'s disposition block lists `REQ-CONFIG-135` under **Extends**, and the back-pointer at the requirement
reads **Extended by**. "Extends" means the named requirement is untouched and still governs in full, with behaviour
added beside it (`docs/product/README.md`, "The shape of an entry"). That is not what the directive does to this one.
OQ-53's ruling (2026-10-06, R-071), which `PD-ORCH-014` carries, reads REQ-CONFIG-135's "the session's event stream"
as the session's timeline: the event that reports a compression is the `context_compressed` timeline entry, and no
event joins REQ-EVENTS-041's catalogue. The requirement still governs (the four inputs and the resulting token number
as separate fields, the transcript's reason line, the debug log), except in the case the directive names: where the
event is carried. That is the **Narrows** disposition, so the generated symbol artifact answers "Extended by
PD-ORCH-014 ... This still governs in full" for a requirement whose event-stream clause no longer reads as written.

Acceptance finding F15 (finacc3, round 1), known finding (2) of the last repair plans' verifiers. Cosmetic: no code
reads the disposition to decide behaviour. The repair is the disposition line and the back-pointer's label only; the
requirement's text is not touched.

## Specs

- **`PD-ORCH-014`** — its disposition block, `> **Extends:** REQ-ORCH-139, REQ-NOTIFY-268, REQ-CONFIG-135`.
- **`REQ-CONFIG-135`** — "It is emitted on the session's event stream as part of the event that reports the
  compression"; its back-pointer reads "Extended by [`PD-ORCH-014`]".
- **OQ-53** (`docs/architecture/open-questions.md`) — ruled as recommended: the event stream read as the timeline.
- `docs/product/README.md` — "Use `Superseded by`, `Narrowed by` or `Extended by` to match the disposition."

## Relevant files

- `docs/product/directives.md` — `PD-ORCH-014`'s disposition block.
- `docs/spec/15-settings-configuration.md` — the back-pointer under `REQ-CONFIG-135`.
- `packages/kernel/src/generated/requirements.ts` — generated from both: `EXTENDED_BY['REQ-CONFIG-135']`.
