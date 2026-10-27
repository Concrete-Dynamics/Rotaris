# Open questions — Specification questions (27 of 27)

Part 32 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-156.

**OQ-156 — How much of the history it replaces does the compressing model read?** *(REQ-MONITOR-082, "only the action
history recorded after the original request is compressed, and the summary it produces must state the work performed,
the findings reached, and the questions left open"; REQ-MONITOR-084; REQ-MONITOR-080, whose compressing model is "able
to hold the context being compressed"; REQ-MONITOR-078; REQ-ORCH-110's 12,000 and 2,000 characters; ADR-0060 decision 4.
Raised 2026-09-30 by the repair of acceptance finding A12,
[`the-compressor-reads-only-the-head-of-what-it-compresses.md`](../../defects/fixed/the-compressor-reads-only-the-head-of-what-it-compresses.md),
under [R-067](../../product/requests.md#r-067). ~~Open;~~ ruled 2026-10-06; numbered OQ-153 when it was raised, renumbered OQ-155 at
the merge once origin/main's OQ-152 and OQ-153 had landed, and OQ-156 at the next merge once origin/main's OQ-154 had.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: the compressing model reads the history it replaces, each event whole, up to its own effective threshold at `chars_per_token`; past that bound it reads the start, held to half the bound, and the most recent part, with OQ-111's marker between them. The consequence stated above is accepted with it: on REQ-ORCH-093's rejection path the compressing request can itself be rejected, and the original rejection is then surfaced. No requirement bounds what the compressing model reads, so this ruling settles it.

The compressing pass replaced the history between the original request and the preserved turns with a summary written
from `transcriptText`, the report pass's reader: each event cut to 2,000 characters and the whole to 12,000 from its
head. Those are REQ-ORCH-110's figures, which bound the child-report pass and nothing else; the compressor reached them
only by reusing the report's function (ADR-0060 decision 4 modelled the pass on `produceReport`). At the default trigger
(60 % of 265,000 tokens at 4 characters each) the history is some 636,000 characters, so the model read its first 2 %,
and the rest left the conversation absent from the summary that stood in for it. No requirement bounds what the
compressing model is given, and none says which part it reads when not all of it fits.

**What the build proceeds under.** The compressing model reads the history it replaces, each event whole, up to its own
effective threshold (REQ-MONITOR-078, `ResolvedTrigger.tokens` for the compressing model — `compressor.model`'s when
configured, else the agent's own) at `chars_per_token`. Whenever the compressing model is the agent's own, a history at
the agent's automatic trigger is, by the estimate REQ-MONITOR-081 falls back to, within that bound less the system
prompt, the tool definitions, the original request and the preserved turns, so it is read whole unless the provider's
own count ran well below the estimate; so is a manual compression's. Where it passes the bound — REQ-ORCH-093's recovery
from a context rejection, or a configured `compressor.model` whose threshold is smaller —
the reading keeps its **start** (a previous compression's summary where there was one, else the agent's first act), held
to half the bound, and its **most recent part**, the part the preserved turns carry on from, with OQ-111's marker between
them saying how many characters were left out. Where the most recent part is shorter than the other half it is given
whole, with no marker, and the start has what it leaves of the bound (`compressorTranscript`,
`packages/engine/src/run/compression.ts`; `compression.test.ts`, "REQ-MONITOR-082 (OQ-156, acceptance A12) …" and
"REQ-MONITOR-082 / REQ-MONITOR-080 (OQ-156) …"). A threshold that resolves to no tokens gives the history whole.
*Found by the branch's verification and kept beside its repair:* the reading first held the start to half the bound in
every case, so a first event longer than half before a short most recent part wrote a second marker with a negative
count where nothing was left out, and left the rest of the bound unused.

**A consequence the build accepts, and the ruling may weigh.** The compressing request can now approach the compressing
model's threshold (some 159,000 tokens at the defaults) where it was about 3,000, under the same 120-second compression
timeout (REQ-MONITOR-080). A slow endpoint will reach that timeout more often, and where it does REQ-ORCH-093 surfaces
the original rejection unchanged. And on REQ-ORCH-093's rejection path (REQ-MONITOR-077) the compressing request can be
nearly as large as the context the provider has just rejected: the bound is 60 % of the resolved capacity at 4 characters
a token — some 159,000 tokens where the model's own input limit is unknown and the 265,000 default applies — and the
compressible slice is sent whole under it. Where the real window is smaller than the capacity resolved, or the real
characters per token fewer than 4, the compressing request can itself be rejected; REQ-ORCH-093 then surfaces the original
rejection and the call fails, where the 12,000-character request it replaced would have been accepted (found by the
branch's verification, 2026-09-30).

**What a ruling decides.** Whether the compressing model's input has a bound at all, and if so which figure: its own
threshold (as built), its capacity, or a figure of the compressor's section; whether the rejection pass is bounded below
the size that was rejected; and, past the bound, whether the start and the most recent part are kept (as built), or the
history is condensed in more than one pass so nothing is left unread.
