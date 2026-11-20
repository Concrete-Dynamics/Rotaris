## A child-report artifact holds a summary of the child's answer and never the answer

## Outcome: repaired 2026-11-20 (R-108, `PD-LIBRARY-007`)

The decision this note left open was taken as a directive: a child report's artifact carries the answer the child ended
on, in a column store version 36 adds, rendered as the last section of its document, so `artifact_read` and
`attach_artifacts` return it. `PD-TOOLS-006` revision 10's two sentences are unchanged and now hold. The live run's
`delegation` scenario reads it on every run (`reportAnswerReading`); its first run, against the owner's self-hosted
endpoint, passed. The section filter offers no `answer` name, and an artifact written before version 36 keeps the
document it had.

Every ended child's report is kept as an artifact of kind `child_report` (REQ-LIBRARY-092), and the agents are told so:
`delegate`'s description says the run keeps the report as an artifact that `artifact_list` shows and `attach_artifacts`
hands on, and every child's payload says that "where its task asks it to publish its findings and it holds no tool that
publishes artifacts, its report meets that request" (PD-TOOLS-006 revision 10, OQ-334). What the artifact holds is not
the report a reader would mean by that. `storeChildReport` passes `materialiseChildReport` the report's `summary`,
`key_findings`, files, commands and tags, and drops `last_response` and `final_response`
(`packages/engine/src/children/ledger.ts:61-67`; `ChildReportInput` has no field for either). The document is
`renderSidecar` over those columns, so `artifact_read` with no `sections` returns "the full Markdown body" as the
requirement says, and that body is a summary and a list of findings about the answer.

A child whose deliverable *is* its answer — a specification, a design, an architecture digest written by a persona that
holds no `artifact_write` — therefore leaves nothing a sibling or a later agent can read. Only the parent reaches the
text, through `background_output(detail_level='verbatim')`, or by naming the task in `depends_on` / `inherited_context`,
which carry the whole answer since PD-TOOLS-006 revision 9. `attach_artifacts` of the same child's artifact hands on the
summary.

Seen in the owner's own runs (reported 2026-11-20: "i get this a lot. apparently agents cant read full artifacts, only
summaries", with an agent's reasoning line "The prior artifacts' full bodies are not retrievable — only summaries" after
two successful `artifact_read` calls). Session `a6bf1c43-eeb5-4346-a511-5af9475cf842` on the Linux host holds six
artifacts, all `child_report`, 2.2 to 6.9 KiB each, every one a Summary section (0.8 to 1.5 KiB) and a Key Findings list
and nothing else of the answer. `artifact-art_a4aZiSFe.md`, the report of a child asked for "the definitive M1 data-model
and invariant specification", says of itself that "artifact_read returned only summary wrappers for sibling artifacts,
not the architecture digest or requirements specification bodies", and that it reconstructed two invariants it could not
read; its own specification is in turn absent from its artifact, which records only that "the report delivered an M1
data-model and invariant specification". Each stage of the chain rebuilt its input from the brief.

Which repair is wanted is a decision, not taken here: the artifact's document carrying the child's final response (a new
section of REQ-LIBRARY-090's rendering, or the body itself), `artifact_read` reaching the stored report's
`final_response` for a `child_report`, or the two fixed sentences of revision 10 saying that the kept artifact is a
summary and naming the route to the whole answer.

## Specs

No requirement is broken as written: REQ-LIBRARY-092 says the report is materialised and fixes no content,
REQ-LIBRARY-090 fixes the sections rendered, and REQ-TOOLS-148 / REQ-LIBRARY-099 return the document. What does not hold
is PD-TOOLS-006 revision 10's sentence to the child, "its report meets that request": the report the run keeps as an
artifact does not carry the findings the task asked to have published. PD-TOOLS-006 revision 9 (OQ-256) repaired the
same loss for `depends_on` and `inherited_context` and did not reach the artifact.

## Relevant files

- `packages/engine/src/children/ledger.ts:54-69`: `storeChildReport`, which materialises the artifact without the answer.
- `packages/engine/src/artifacts/store.ts:60-75`, `:350-405`: `ChildReportInput` and `materialiseChildReport`.
- `packages/engine/src/artifacts/sidecar.ts:96-111`: `renderSidecar`, the document `artifact_read` returns.
- `packages/engine/src/artifacts/port.ts:52-66`: `read`, which returns that document.
- `packages/engine/src/children/report.ts`: where a report's `summary`, `key_findings`, `last_response` and
  `final_response` are formed.
- `packages/agent-tools/src/tools/delegation.ts`: the description sentence and the child's payload sentence of revision 10.
- `docs/product/directives/pd-tools-006.md`: "What a child is told of its report (revision 10)".
