# Resolution Record — Domain 20, Machine-Readable Event Stream, Replay, and Trajectory Export — Escalations

Part 4 of 8 of [domain 20's resolutions](../20-event-history-replay-export.md), which indexes every part.

## Escalations

None. All twenty-six open questions were decided here: twenty-two RESOLVED, none OMITTED, four MOOT
(OQ 5, OQ 8, OQ 11, OQ 13 — each about a console, a text-mode row, a headless entry point, or a
process exit code that no longer exists), none ESCALATED. The specification's "Open Questions"
section now records that nothing is outstanding.


> ## Corrective amendment, 2026-09-02 — `REQ-EVENTS-145` says its one-step obligation is the product's
>
> *Made by the sweep pass to remove a dangling reading it would otherwise have created, and recorded
> separately from the `REQ-EVENTS-098` and ESC-31 amendments above.*
>
> `REQ-TRACE-061`'s new retry ladder was attached to the export destinations of `REQ-TRACE-514`,
> `REQ-LIBRARY-176`, `REQ-SESSION-189` and `REQ-SESSION-199`. A ladder for a **replacement** hangs on
> there being a replacement: without an obligation that the document land in one step, a build could
> truncate the destination and write in place, never perform a replacement, satisfy every word of the
> ladder, and still destroy a user's previous export on a failure. `REQ-EVENTS-145` holds that obligation
> and was cited by nothing outside this document.
>
> The requirement now states that its one-step-visibility obligation is the product's single statement of
> what an export write owes the destination a user chose, that it is not confined to the exports this
> document names, and that a requirement in another domain whose export writes to such a destination
> cites this identifier rather than stating a second obligation — naming `REQ-SESSION-189` and
> `REQ-SESSION-199` as the citers. It also separates the two halves a citer needs to distinguish: the
> one-step obligation binds every export write whatever form the document takes, and the document-form
> clauses bind an export written as a JSON document, since not every exported record is one.
>
> **Nothing was added to the obligation and nothing was widened.** The requirement's subject was already
> "writing an export to a file"; its "this is the only place **this document** requires a file to be
> replaced in one step" is a remark about this document's other requirements and never a scope on the
> obligation. What the amendment prevents is a later tidying pass reading it as one and silently
> orphaning four citations.
>
> **What is still open.** The three export destinations this document itself governs have the one-step
> obligation and no ladder. `REQ-TRACE-061` was written to be citable across domains for exactly this
> case; whether this document should cite it or state its own is not settled here, and minting a
> competing ladder owner would be the wrong answer to it.
