## The intent classifier's strict rung never names the object's keys

REQ-ORCH-010's first rung sends the classification schema as the request's `response_format`, and its user text ended with one
sentence, `Reply with the classification object only.`, naming none of the object's three keys (`intent`, `confidence`,
`reason`), "because the schema was meant to carry them" (ADR-0026's third execution). A reasoning model never sees
`response_format` while it reasons: the schema shapes only the decoded answer. So the model chose its category, then spent the
rest of REQ-ORCH-008's 12 s bound deciding which key to write it under, and was cut.

Measured at `552d346` against the registered self-hosted endpoint (`qwen3.8-flash-next`):
- **Duress (finding V3 of its autopsy):** req 0 aborted at 11,975 ms; the launch audit reads `fallback: true`, "the
  classification call timed out after 12 s", so the run took `moderate_feature`. Its 4,068 reasoning characters settled on
  `whole_project` early, began deliberating over the key at character 1,464 ("Which key? … I can't know …"), and the cut fell
  mid-way through `{"classification":"whole_project"}`. The endpoint was not slow (median 78.7 tokens/s; 94,743 bytes streamed).
  At `a68f121` the same prompt read `whole_project` 0.999 in 9.3 s.
- **Default (finding Q2):** cut at 12 s in 4 of 10 launches (2 of 10 at `a68f121`). Read from the copied traffic: resume chose
  `small_feature` and spent its last third on key names; faults-args turned to the schema at character 425 and never engaged the
  categories ("There is no categories given"), and lost the one-file create's direct-work route (169.1 s and 80 k tokens against
  43.3 s and 23 k); edit was cut while applying the tie-break; terminal received 0 bytes in 11,967 ms (the endpoint queueing).
  The launches that finished in time (frictions, faults-ladder, requirements) also guessed at `category` or `classification`.

Raised as [OQ-258](../../archive/architecture/open-questions/55-spikes-and-later-questions-22.md#oq-258).

**Repaired 2026-10-13 (fin38, `fin38-edits-handoff-classifier`)**, the R-072 consortium's ruling of OQ-258, as covered work under
REQ-ORCH-010 (no directive). `KEYS_INSTRUCTION` (`packages/engine/src/intent/classifier.ts`) names the three keys; rung 1's
`SCHEMA_INSTRUCTION` is that sentence alone and rung 2's `JSON_OBJECT_INSTRUCTION` that sentence and its example, word for word
as before. The text rung, the system prompt, the schema and the 12 s bound are unchanged. Pinned by the OQ-258 case in
`intent.test.ts` (both structured rungs name every key `CLASSIFICATION_SCHEMA` requires, the strict rung carries no example, the
text rung asks for the identifier), red on the code before, and the ADR-0026 case's updated assertion. Not measured live: the
next default and duress packs count classifier cuts and key deliberation.

## Specs

- REQ-ORCH-010 fixes rung 2's keys and example and leaves rung 1's wording open; REQ-ORCH-007 and REQ-ORCH-008 (the fallback and
  the 12 s bound, kept by OQ-114's ruling under R-071) and REQ-ORCH-011 (the result's fields) bind what a cut costs. No
  requirement's text is contradicted; the falsified reading is ADR-0026's ("the schema was meant to be the instruction").
- `PD-ORCH-011` revision 2's sentence reached every rung, and its first live measurement is confounded by these cuts.

## Relevant files

As they stood when the note was written.

- `packages/engine/src/intent/classifier.ts`: `SCHEMA_INSTRUCTION` (rung 1), `JSON_OBJECT_INSTRUCTION` (rung 2),
  `CLASSIFICATION_SCHEMA`, `CLASSIFICATION_TIMEOUT_MS`.
- `packages/engine/src/intent/intent.test.ts`: the ADR-0026 case that pins the rung-1 sentence.
- `docs/defects/fixed/the-json-schema-rung-never-left-the-process.md`: the earlier note whose "deliberately naming no keys" reason
  this falsifies.
