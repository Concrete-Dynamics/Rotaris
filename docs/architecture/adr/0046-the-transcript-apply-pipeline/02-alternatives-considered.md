# ADR-0046 — The transcript apply pipeline, and where determinism is enforced — Alternatives considered

Part 2 of 8 of [ADR-0046](../0046-the-transcript-apply-pipeline.md), which indexes every part.

## Alternatives considered

**A — Let the rendering framework's reconciler be the apply stage.** Push the new row array into the
store and derive the counters from render callbacks.

*For:* no second diff to write.
*Against:* the counters must be classified against *the state currently displayed*, with a distinction
between `refused` (a valid-shaped application the view declined) and `noop` (an accepted application
that changed nothing) that a reconciler has no notion of. The totals must be a pure function of the
sequence of states applied, and a framework's scheduling is not something to hang a determinism claim
on. And the decline decision must be made **before** anything is applied, which is upstream of any
reconciler.

**B — An explicit, synchronous view-model stage in front of the renderer.** Incoming state — increment
or snapshot — enters a pure function together with the currently displayed view model; it returns either
a refusal, or a new view model plus a classified operation list. Chosen.

*For:* the counters are the natural output of that function. The decline is its first branch. Folding,
trailer-row appending, cap application and the search index all belong in the same stage — they are all
"what the displayed rows are", as distinct from "what the session record holds". Being pure and
synchronous makes it directly unit-testable and makes cross-process identity a property of the function
rather than of the environment. **The sequence check of `REQ-MONITOR-226` fits it without alteration**:
it is one more reason to take the refusal branch that already existed.
*Against:* a second model to keep in step with the session record, and a class of bug where the view
model and the record disagree — which is precisely what the decline-and-re-read path exists to correct.

**C — Handle the sequence gap outside this stage, in the subscription handler, and never tell the apply
stage about it.** Considered because it keeps the stage's input purely a sequence of transcript states,
which is exactly what `REQ-UIBENCH-064` says the counters must be a function of.

*Against, and decisively:* a gap is a publication the surface **declined to apply**, and
`REQ-UIBENCH-064` fixes the counter set at six with `refused` defined as an application that was not
valid. If the gap were handled outside the stage, either the refusal would go uncounted — leaving a
benchmark that reports six counters none of which move when the product's one loss-detection path
fires — or it would need a seventh counter, which the requirement forbids. Handling it inside costs
nothing: the check is a comparison of two integers.
