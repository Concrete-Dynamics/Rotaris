# ADR-0060 — Context compression replaces a conversation; the conversation is the addressable thing — The compressor's reading, repaired — 2026-09-30 (acceptance finding A12)

Part 10 of 11 of [ADR-0060](../0060-context-compression-over-a-replaceable-conversation.md), which indexes every part.

## The compressor's reading, repaired — 2026-09-30 (acceptance finding A12)

Decision 4 gave the pass "only the compressible slice" and said nothing of how much of it; the build read it through
`children/report.ts`'s `transcriptText`, the report pass's reader, so the model saw 12,000 characters from the head of a
slice that is some 636,000 at the default trigger, and each event to 2,000. Everything else left the conversation absent
from the summary. The pass now reads `compressorTranscript` (`run/compression.ts`): each event whole, the slice whole up
to the compressing model's own effective threshold at `chars_per_token` (`CompressorDeps.inputTokens`, which
`Run.compressionFor` resolves through the same `triggerFor` the trigger reads), and past it the start and the most recent
part with the omission marked. The bound is OQ-156's reading; `transcriptText` is removed. The decision stands otherwise:
the three survivors are still never sent.

**What was measured.** `compression.test.ts`: the default trigger's shape (150 reads of 4,000 characters, over 600,000 in
all) reaches the model whole where it reached it as an ask of 12,301 characters; a slice past the bound keeps its start
and most recent part with the count of what was left out exact; and through `Sessions`, a run whose compressing model's
threshold is 4,000 tokens reads 16,000 characters of an 18,100-character slice, its most recent result whole past 2,000,
and a run with a configured `compressor.model` whose threshold is 2,000 tokens reads 8,000 — the agent's own threshold
there fails it. Each fails on the previous code. *Found by the branch's verification and repaired before merge:* the
reader first held the start to half the bound in every case, so a first event longer than half before a short most
recent part wrote a second marker with a negative count and left the rest of the bound unused; a case now pins that
the most recent part is then whole, unmarked, and the start has what it leaves. `pnpm compression-proof` on the built app, its four scenarios unchanged, is the
regression. **Not measured:** a live run — none of the live-run scenarios reaches the compression trigger (the largest
prompt of the duress runs was 64,038 and 77,043 tokens against a trigger of 157,286), so a real model's summary over a
whole slice has not been read. The row is in [`../first-executions.md`](../../first-executions.md).
