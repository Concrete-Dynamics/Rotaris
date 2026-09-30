## The compressor reads only the head of what it compresses

A compression replaces the action history between the original request and the preserved recent turns with one
summary (REQ-MONITOR-084). The compressing model is given that history through `transcriptText`, which cuts it to
12,000 characters from its head. At the trigger that history is far longer. The default is 60 % of a 265,000-token
capacity at 4 characters per token, about 636,000 characters. So the model sees roughly its first 2 %. Everything
after the cut, up to the preserved turns, is removed from the conversation and is absent from the summary that
stands in for it. The ask even warns that "a fact you drop is lost to the agent for good". The report summariser had
the same head-only cut; OQ-111 repaired it there
([`a-long-childs-report-denies-the-edits-it-made`](a-long-childs-report-denies-the-edits-it-made.md)). The
compressor was left as it was, because that repair's scope was the report's pass.

Noticed 2026-09-29 while repairing the report summariser's cut; not reproduced live.

## Specs

- `REQ-MONITOR-082`: "Only the action history recorded after the original request is compressed, and the summary it
  produces must state the work performed, the findings reached, and the questions left open." The summary cannot state
  work its model was never shown.
- No requirement gives the compressor's input a 12,000-character cap. The figure is REQ-ORCH-110's, which is about the
  child-report pass, and it reaches the compressor only because the compressor reuses the report's function. Which part
  of the history the compressor should read, and how much of it, is unspecified. The repair is an open question
  before it is code.

## Relevant files

- `packages/engine/src/run/compression.ts` — `compress`, whose ask embeds `transcriptText(compressible)`.
- `packages/engine/src/children/report.ts` — `transcriptText`, the head-only cut to `TRANSCRIPT_CAP`, then read by the
  compressor alone (removed by the repair below); `reportTranscript` beside it is the report's head-and-tail reading.
- `docs/architecture/adr/0060-context-compression-over-a-replaceable-conversation.md` — the compression's decision record.

## Outcome

**Repaired 2026-09-30 under R-067** (acceptance finding A12, confirmed on the branch before the change: a history of
150 reads of 4,000 characters, over 600,000 characters, reached the compressing model as an ask of 12,301 characters,
its facts past the first reads and past each result's first 2,000 characters absent).

- The compressor has a reader of its own, `compressorTranscript` (`packages/engine/src/run/compression.ts`). It gives each
  event whole and the history whole up to the compressing model's own effective threshold (REQ-MONITOR-078) at
  `chars_per_token`. Past that bound it keeps the start and the most recent part, with OQ-111's marker between them
  saying how many characters were left out. Where the most recent part is shorter than the other half of the bound, it is
  given whole with no marker and the start has what it leaves (found by the branch's verification: the start held to
  half in every case wrote a negative count there).
- `CompressorDeps.inputTokens` carries that threshold: `Run.compressionFor` resolves it for the compressing model
  (`compressor.model` when configured, else the agent's own) through the same `triggerFor` the trigger uses.
- `transcriptText` is gone from `packages/engine/src/children/report.ts`; the report's pass reads `reportTranscript` as
  before, and `report.test.ts` states the old head-only cut itself where it reproduces the report's finding.
- The reading is OQ-155's, raised by this repair.
- Pinned by `compression.test.ts`: "at the default trigger … is given whole", "a history longer than the compressing
  model's own threshold keeps its start and its most recent part …", and, through `Sessions`, "the compressing pass reads
  the history up to its model's own threshold at chars_per_token …". All three fail on the previous code; the last also
  fails with `inputTokens` left unwired. "a first event longer than half the cap, followed by a short most recent part …"
  pins the negative count's repair, and "with compressor.model configured, the compressing pass reads the history up to
  THAT model's threshold …" fails when the bound is resolved for the agent's model instead.
