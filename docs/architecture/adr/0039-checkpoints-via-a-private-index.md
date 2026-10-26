# ADR-0039 — Checkpoints are ordinary commits made through a private Git index; the checkpoint list is a table

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, under `owner-decisions.md` SR-2 and SR-4
- **Origin:** DATA (ADR-DATA-05)
- **Depends on:** ADR-0038

> **Two different things are called an index in this area and they go different ways.** The *private
> Git index* is a scratch file handed to `git` through `GIT_INDEX_FILE`; it stays a file, because a
> foreign tool reads it and because `REQ-GIT-031` names it as a path. The *checkpoint index* — the
> session's recorded list of checkpoints — becomes rows. The checkpoint **commits and refs** move
> nowhere: they are and remain ordinary objects in the user's own repository.

## Parts

Since 2026-10-26 the rest of this document is in [`0039-checkpoints-via-a-private-index/`](0039-checkpoints-via-a-private-index/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0039-checkpoints-via-a-private-index/01-context.md) | Context |
| [02](0039-checkpoints-via-a-private-index/02-alternatives-considered.md) | Alternatives considered |
| [03](0039-checkpoints-via-a-private-index/03-decision.md) | Decision; The Git side is unchanged; The checkpoint index is a table; Two orderings that the transaction does not decide, and how they are decided; Persist before publish; What SR-2 changes; What SR-4 dissolves here |
| [04](0039-checkpoints-via-a-private-index/04-consequences-accepted.md) | Consequences accepted |
| [05](0039-checkpoints-via-a-private-index/05-revisit-if.md) | Revisit if |
| [06](0039-checkpoints-via-a-private-index/06-status-note-2026-09-05-the-cards-shell-exists.md) | Status note — 2026-09-05, the card's shell exists; the mechanism is owed (Part O) |
| [07](0039-checkpoints-via-a-private-index/07-first-execution-2026-09-05-the-mechanism-end-to.md) | First execution — 2026-09-05, the mechanism end to end (Part P) |
| [08](0039-checkpoints-via-a-private-index/08-second-execution-2026-09-06-req-git-069s.md) | Second execution — 2026-09-06, REQ-GIT-069's cleanup at deletion (Part U) |
| [09](0039-checkpoints-via-a-private-index/09-the-first-executions-proof-on-linux-the-stale.md) | The first execution's proof on Linux: the stale-session repair and the lock its live launch left — 2026-09-28 (R-062) |
| [10](0039-checkpoints-via-a-private-index/10-the-listing-records-checkpoint_count-is-this.md) | The listing record's `checkpoint_count` is this record's derived count — 2026-10-03 (fin11) |
| [11](0039-checkpoints-via-a-private-index/11-the-capture-after-the-iterations-hooks-reported.md) | The capture after the iteration's hooks — reported back 2026-10-13 (fin41, N68) |
