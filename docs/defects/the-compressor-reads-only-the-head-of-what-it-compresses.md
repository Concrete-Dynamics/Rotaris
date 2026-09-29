## The compressor reads only the head of what it compresses

A compression replaces the action history between the original request and the preserved recent turns with one
summary (REQ-MONITOR-084). The compressing model is given that history through `transcriptText`, which cuts it to
12,000 characters from its head. At the trigger that history is far longer. The default is 60 % of a 265,000-token
capacity at 4 characters per token, about 636,000 characters. So the model sees roughly its first 2 %. Everything
after the cut, up to the preserved turns, is removed from the conversation and is absent from the summary that
stands in for it. The ask even warns that "a fact you drop is lost to the agent for good". The report summariser had
the same head-only cut; OQ-111 repaired it there
([`a-long-childs-report-denies-the-edits-it-made`](fixed/a-long-childs-report-denies-the-edits-it-made.md)). The
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
- `packages/engine/src/children/report.ts` — `transcriptText`, the head-only cut to `TRANSCRIPT_CAP`, now read by the
  compressor alone; `reportTranscript` beside it is the report's head-and-tail reading.
- `docs/architecture/adr/0060-context-compression-over-a-replaceable-conversation.md` — the compression's decision record.
