[Product directives](../directives.md) › PD-LIBRARY-007

<a id="pd-library-007"></a>

### PD-LIBRARY-007 — a child report's artifact carries the answer the child ended on

An artifact record whose `kind` is `child_report` SHALL carry the answer the child ended on, as a text named `answer`:
the child's final response, and where it gave none its last response, whole and unchanged. The text SHALL be the
child's own and SHALL NOT be written, shortened or reworded by a summarising pass. Where the child ended without
saying anything the record SHALL carry an empty text, and a record of any other kind carries an empty text.

The Markdown document of REQ-LIBRARY-090 SHALL render the text as an **Answer** section placed after every other
section, dropping only the blank lines before its first line and after its last. The section SHALL be omitted when the
text is empty, on that requirement's own rule, and when the text is the record's `summary`, which already states it in
full. A re-materialisation (REQ-LIBRARY-092) SHALL replace the text with the answer of the report it materialises.
`artifact_read` without sections, the explicit hand-off of REQ-LIBRARY-098 and every other reader of the document
therefore return the answer with it. The section filters of REQ-LIBRARY-099 and REQ-TOOLS-148 are unchanged and offer
no name for it.

**As built.** `storeChildReport` in `packages/engine/src/children/ledger.ts` passes the report's `final_response`, else
its `last_response`; `ArtifactStore.materialiseChildReport` in `packages/engine/src/artifacts/store.ts` stores it in the
`answer` column store version 36 adds (`packages/store/src/schema.ts`); `renderSidecar` in
`packages/engine/src/artifacts/sidecar.ts` writes the section.

**Why, and what it costs.** The run tells its agents that it keeps an ended child's report as an artifact later agents
can list and be handed, and tells a child with no tool that publishes artifacts that its report meets a request to
publish its findings (`PD-TOOLS-006` revision 10). The artifact held the summarising pass's summary and key findings
alone. A child whose deliverable was its answer, a specification or a design, left a description of that answer where
the next agent looked for it, and `artifact_read` returned "the full Markdown body" of a document that never held the
text. The owner met it repeatedly (2026-11-20: "i get this a lot. apparently agents cant read full artifacts, only
summaries"); in session `a6bf1c43` each stage of a specification chain rebuilt its input from its brief and said so in
its own report. `PD-TOOLS-006` revision 9 repaired the same loss for `depends_on` and `inherited_context`; this is that
repair for the artifact.

The costs. **REQ-LIBRARY-088's field inventory is closed** and gains a key on a child report's record, as it did for
`commands`. **REQ-LIBRARY-090's section order is fixed** and gains a last member: the Answer follows Created Files
because an answer is Markdown that may open headings of its own, and a section written after it would read as part of
it. **The store keeps the answer twice**, in the child's stored report and on the artifact's record, because a
follow-up clears the first while the second is still being read and re-rendered. **A document grows by the answer's
length**: an attached report whose document passes REQ-TOOLS-152's 100,000-character section is left out whole, as any
attachment is, where its summary alone would have fitted; the observation names it and `artifact_read` still reaches
it. A record written before version 36 carries no answer, and its document is unchanged.

> **Narrows:** REQ-LIBRARY-088, REQ-LIBRARY-090

Both requirements are narrowed by `PD-LIBRARY-001` too, and the cases are disjoint: that directive's is the `commands`
key and the Commands section before Edited Files, this one's is the `answer` key and the Answer section after Created
Files. Neither moves what the other states.

*Raised by the owner, 2026-11-20; logged as [R-108](../requests.md#r-108).*

> **First execution, 2026-11-20:** `pnpm live-run --confirm --only=delegation` against the owner's self-hosted endpoint
> (model `ds41`, pack `2026-11-20T17-15-03-913Z`) passed, its new reading among the checks: both children of the
> `delegation` session that ended on an answer had it on their report's artifact unchanged and as the last section of
> the document, the follow-up included. The row is in
> [`../../architecture/first-executions.md`](../../architecture/first-executions.md).
