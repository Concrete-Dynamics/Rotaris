---
reference: ROTARIS-CRW-001
domain: notifications-errors-recovery
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 19, Notifications, Error Handling, and Recovery

> ## Amendment, 2026-10-20 — disposition 27's signature, and the key ordering that stands (OQ-364)
>
> Disposition **27** below is recorded as **replaced**. On 2026-08-31 (`eb31f379`) `REQ-NOTIFY-108` was rewritten to
> defer to `REQ-ORCH-101`, which is the product's single definition of when two actions are the same action, and to state
> no comparison rule of its own. The disposition's signature collapsed whitespace runs, trimmed string values and cut every
> string at 200 characters; each of those disregards part of an action's content, and they are what `REQ-NOTIFY-108` now
> forbids ("no truncation and no normalisation of the compared text may make them the same").
>
> Its **key ordering** stands, as `REQ-ORCH-101`'s reading under OQ-364: the arguments are compared as one JSON value,
> and the order in which an object's members were written is no part of it, so the comparison is independent of
> serialisation order as the disposition said. That reading is recorded in a dated note beneath `REQ-ORCH-101`, whose
> text is unchanged, and `REQ-NOTIFY-108`'s "no normalisation of the compared text" is read the same way.
>
> **Why this is a note and not a directive.** The clauses written on 2026-08-31 forbid the cut, the collapse and the
> trim, and nothing in the round's text addresses key order; an encoding that keeps every member whole makes no two
> different actions the same. Ruled under the owner's delegation ([R-072](../../product/requests.md#r-072)) with no directive; the ruling is in
> [`open-questions.md`](../../architecture/open-questions/66-spikes-and-later-questions-33.md#oq-364).

This record disposes of every open question raised in the draft of
[`../19-notifications-errors-recovery.md`](../19-notifications-errors-recovery.md) (requirement
prefix `REQ-NOTIFY`). The body of that specification has been amended so that each decision below is
stated normatively in place; the original open-question numbering is preserved here so the draft and
the resolved specification can be read against each other.

The product-owner decisions in force while these were resolved:

1. **Compatibility ambition: behavioral inspiration only.** No obligation to match any other
   implementation's formats, surface, exit codes, or event vocabulary. Under-determined cases are
   decided here on their merits, and awkward behavior is never preserved for compatibility's sake.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   more coherent with the rest of the document; where no coherent reading exists, the behavior is
   omitted rather than reproduced.
3. **Unbuilt-but-intended behavior is in scope.** No requirement was dropped merely for describing
   intent.
4. **The product is one Electron desktop application.** It has no command-line interface and no
   full-screen text-mode interface, and domains 17 and 18 are retired. Requirements of this domain
   whose only observable surface was a shell invocation, a key-bound text-mode host, or a
   script-oriented output format are **withdrawn**, and every capability they carried has been
   rescued into a desktop-reachable requirement. See the "Graphical-only sweep" below.
5. **Message text states information content, not wording** — except where a string is part of a
   machine-readable contract (an event field value, an enum, a parseable output format). Open
   questions asking for the exact phrasing of a human-readable message are resolved by fixing what
   the message must convey and leaving the wording to the implementation.

Cross-domain coherence was checked against `08-requirements-traceability.md` (delivery-state and
health vocabularies), `09-lifecycle-hooks.md` (the workspace hook-set fingerprint and the trust
decision), `12-desktop-shell-windows.md` (the seven primary views),
`14-library-artifacts-improvements.md` (library tab names) and `15-settings-configuration.md`
(settings category identifiers). No other source was consulted.

New requirements added by these resolutions: **REQ-NOTIFY-263** through **REQ-NOTIFY-268**. No
requirement identifier was renumbered, reused, or deleted.

## Parts

Since 2026-10-26 the rest of this document is in [`19-notifications-errors-recovery/`](19-notifications-errors-recovery/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](19-notifications-errors-recovery/01-graphical-only-sweep.md) | Graphical-only sweep |
| [02](19-notifications-errors-recovery/02-dispositions.md) | Dispositions |
| [03](19-notifications-errors-recovery/03-escalations.md) | Escalations |
