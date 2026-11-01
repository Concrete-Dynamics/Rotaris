# Archived open questions — Spikes, and the questions raised since (33 of 35)

The ruled, closed, resolved and withdrawn entries of [part 66](../../../architecture/open-questions/66-spikes-and-later-questions-33.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-364"></a>

**OQ-364 — Are two tool calls whose arguments are one JSON object, emitted with its keys in different orders, "the same action"
under REQ-ORCH-101?** *(REQ-ORCH-101, "the whole of their arguments are identical", and its clause that no rule may decide
sameness "from a prefix, an excerpt, a normalized rendering, or any bounded number of characters of an argument";
REQ-NOTIFY-108, "no truncation and no normalisation of the compared text may make them the same"; REQ-ORCH-100's repetition
threshold 4 and cycle threshold 3; REQ-ORCH-104 and [`PD-ORCH-016`](../../../product/directives/pd-orch-016.md#pd-orch-016), the classification
a trigger leads to; ADR-0059, the supervisor as an in-turn observer. Raised 2026-10-20 by the host-independent finish (local
session) from
[`the-loop-supervisor-misses-identical-calls-whose-argument-key-order-varies.md`](../../../defects/fixed/the-loop-supervisor-misses-identical-calls-whose-argument-key-order-varies.md),
which asks for a question before code if REQ-NOTIFY-108 reads against comparing sorted keys; the session's range OQ-364 to
OQ-399, its first number. **Ruled 2026-10-20.**)*

**What is open.** The loop supervisor compares `tool\0<name>\0<args>` (`packages/engine/src/run/supervisor.ts`, `fingerprint`),
where `<args>` is `JSON.stringify(part.input)` in the order the model emitted the keys (`packages/model/src/ai-sdk-client.ts`,
the `tool-call` part). The session record serialises the same arguments with sorted keys (`packages/engine/src/session-writer.ts`,
`sortKeys`). In the default live run at `cb6d1d5` (scenario `crlf`, session `4dad81df`) a child sent 18 failing `haet_edit`
calls on one step whose argument objects alternated between `{path, content_hash, old_string, new_string}` and
`{content_hash, new_string, old_string, path}`; as emitted the longest run of identical texts was 2, with sorted keys 5, twice.
The repetition trigger never fired, the loop held the child 179 s of a 420 s wait, and the scenario's two FAILs follow from it.
A JSON object's members are unordered (RFC 8259 §1: "An object is an unordered collection"), so the two texts are two
renderings of one value; but REQ-ORCH-101 forbids deciding sameness from "a normalized rendering", and REQ-NOTIFY-108 forbids
any normalisation of the compared text that makes two actions the same.

**What the build proceeds under.** Comparison of the emitted text, as built: key order distinguishes two calls.

**What a ruling decides.** Which of these, or none:

- **(a) Compare values, not texts.** Two calls are the same action when their tool names are equal and their parsed argument
  values are deeply equal (every member, at every depth, compared whole; arrays in order; no member disregarded, no string
  trimmed, cased or truncated). Implemented as a canonical serialisation with keys sorted at every depth — the record's own
  `sortKeys` — compared whole. Reading: a value has no key order, so ordering its keys disregards no part of its content and
  makes no two different actions equal; REQ-ORCH-101's "normalized rendering" names renderings that drop or fold content (its
  own example: two long edits differing near their end). Cost: arguments that are not valid JSON (a model's malformed call)
  keep their text comparison.
- **(b) Compare texts as emitted.** Key order is part of the compared text; REQ-NOTIFY-108's "no normalisation of the compared
  text" read literally. Cost: a model that reorders keys between identical calls escapes the repetition and cycle triggers
  entirely, leaving only the raw-count backstop (60 tool calls), as the live run measured.
- **(c) Canonicalise at the source.** The model client emits the arguments text with sorted keys, so every consumer (supervisor,
  record, traffic) sees one rendering; the supervisor's comparison is unchanged. Cost: the arguments the product forwards to
  a tool and records are re-serialised, not the model's own bytes.

**What a live run then shows.** The default live run's `crlf` scenario: under (a) or (c) a child repeating one failing edit
four times with alternating key orders draws a `loop_supervisor_activation` (`trigger` repetition) at the fourth call and the
run reaches its result inside the wait; under (b), nothing changes.

**Ruled 2026-10-20 under the owner's delegation ([R-072](../../../product/requests.md#r-072)).** Option (a), refined, with no directive.

Two tool calls are the same action under REQ-ORCH-101 when their tool names are equal and their arguments, read as JSON, are one value:
- every member of every object is compared whole, at every depth;
- arrays are compared in their order;
- strings and numbers are compared as parsed;
- nothing is trimmed, cased, cut or disregarded.

The order in which an object's members were written is no part of that value (RFC 8259 §1: an object is "an unordered collection"). So one argument object sent with its keys in another order is the same action. Two calls whose values differ anywhere stay two actions, the two long edits differing near their end among them. Argument text that does not parse as JSON is compared whole as text and never equals a parsed value.

The comparison is made once per observed tool call, in the supervisor's fingerprint of it (`packages/engine/src/run/supervisor.ts`). The repetition trigger, the cycle trigger and [`PD-ORCH-016`](../../../product/directives/pd-orch-016.md#pd-orch-016)'s raw-count evidence therefore take it together. Some things do not change:
- the text the product forwards to a tool, replays to the provider, writes to the transcript row and quotes in the excerpt and the path anchor;
- the comparison of assistant messages, including OQ-126's normalised-equal message limb;
- REQ-ORCH-100's thresholds, REQ-ORCH-104's fallbacks and PD-ORCH-016.

This builds REQ-ORCH-101 and REQ-NOTIFY-108 as written; it does not depart from them:
- **Both clauses state what their ban is for.** REQ-ORCH-101 forbids a prefix, an excerpt, a normalized rendering or a bounded number of characters "because each of those makes the two long edits above compare equal". REQ-NOTIFY-108 forbids a truncation or normalisation that "may make them the same", "them" being two long calls differing near their end. An encoding that keeps every member whole cannot make two different values equal.
- **The clause replaced an older signature.** The closing round of 2026-08-31 (`eb31f379`) replaced a REQ-NOTIFY-108 signature that ordered keys, collapsed whitespace, trimmed strings and cut every string at 200 characters. Its disposition ([domain 19's resolution record](../../../spec/resolutions/19-notifications-errors-recovery.md), OQ 27) gave the 200-character cut as the signature's point, and gave key ordering a separate purpose: "independent of serialisation order". The cut, the collapse and the trim disregard content, and they are what the two clauses now forbid. Nothing in the round's text addresses key order.
- **The build never compared the model's text.** The model client hands on `JSON.stringify(part.input)`, which is the SDK's parsed value written out again (`packages/model/src/ai-sdk-client.ts`; `ai-sdk-client.test.ts` pins `JSON.stringify(JSON.parse(…))`). Whitespace, escapes, number forms and duplicate keys were therefore already folded. The only thing left to decide sameness was the written order of non-integer keys. The gate parses the same text before any tool runs, so two texts with one parsed value give the tool one input. The tool-call record stores the arguments with sorted keys (`session-writer.ts`'s `sortKeys`), so a reader of the record saw one value where the supervisor saw two. REQ-MONITOR-289 requires that the trip can be checked from the run's own records.

The build's reading is the defect that [`the-loop-supervisor-misses-identical-calls-whose-argument-key-order-varies.md`](../../../defects/fixed/the-loop-supervisor-misses-identical-calls-whose-argument-key-order-varies.md) records, and repairing it mints nothing.

"A normalized rendering" can still be read past its stated reason. So a dated note beneath REQ-ORCH-101 ([`01-run-orchestration.md`](../../../spec/01-run-orchestration.md)) records this reading and keeps the requirement's text, in the form [OQ-263](56-spikes-and-later-questions-23.md#oq-263) used, and the resolution records of domains 01 and 19 log it. In [ADR-0059](../../../architecture/adr/0059-the-loop-supervisor-as-an-in-turn-observer.md), decision 3's "the whole argument string" is amended in place to the whole argument value, with the replaced words kept beside it.

**One correction to the entry's costs.** As built, a strict alternation of two key orders reads as a two-action cycle and fires "repeated cycle" at the sixth call. The irregular order of `4dad81df` (as emitted, no run longer than two) escaped both triggers and was left to the raw-count backstop of 60. Under (b), whether the same failing edit counts as a loop depends on the pattern of its key orders.

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended (a) in the supervisor's fingerprint alone, as a reading with no directive. A child was held 179 s of a 420 s wait over one failing edit that the record shows as five identical calls. Meanwhile the breaker, which Settings describes as watching "every agent for repeated work", stayed silent, and PD-ORCH-016's evidence limb missed the same calls. The ruling took from A:
  - the cost to the user;
  - the reading of REQ-MONITOR-289;
  - one fingerprint reaching all three checks;
  - the supervisor, not the model client, as the place to compare;
  - A's tests.
- **Advocate B (the system's lens)** recommended the same. B showed that (b) is not the literal reading it claims to be, because the build already compares a re-serialised value. B also asked for:
  - a tag in the fingerprint, so an unparseable text never equals a parsed value;
  - an encoding written out as a string, so a `__proto__` member is kept;
  - one parse per event;
  - the collapses JSON parsing already makes (integers past 2^53, `-0`) stated rather than implied.

  The ruling took all of these. It took B's REQ-TOOLS-017 and REQ-TOOLS-024 as evidence of how the specification treats an argument mapping, not as the comparison itself: REQ-TOOLS-017's exact argument set compares a string argument as itself, so `"1"` and `1` match one rule, while supervision keeps them two actions.
- **Both rejected (b) and (c).** (b) keeps an artefact of serialisation as the deciding fact. (c) would re-serialise what every consumer reads, in one of the three model clients that produce calls, to repair one comparison. Neither argued for deferring: a user of the first release meets the miss.

**Reopening condition:** either of these reopens the ruling:
- a live pack in which supervision is active, four consecutive tool calls of one agent carry one tool name and one parsed argument value, and no `loop_supervisor_activation` follows the fourth;
- an activation drawn by calls whose parsed arguments differ.

**Built 2026-10-20 by `loc1` (`loc1-supervisor`).** `packages/engine/src/run/supervisor.ts`: a tool event's fingerprint is
`tool\0<name>\0v\0<encoding>` of its parsed arguments — a string encoder that sorts every object's keys at every depth and
keeps every member (`__proto__` included), arrays in order, every string quoted, a non-finite number written as itself — or
`tool\0<name>\0t\0<args>` where the parse or the encoding throws; computed once in `observe()` and kept in step with the
window, read by `trigger()` and, through the window `check()` snapshots, by `rawFallbackHasEvidence`. `SupervisorEvent`, the
excerpt, the path anchor, the message limb and `SUPERVISOR_DEFAULTS` are unchanged. **Red first:** `supervisor.test.ts`'s
block "OQ-364: REQ-ORCH-101's same action compares the arguments as one JSON value" — five cases red on the build before (a
repetition across the key orders A, B, B, A; a width-2 cycle of reordered values; PD-ORCH-016's evidence limb on A, B, A, B;
reordering at depth; whitespace between tokens) and seven guards green before and after (array order, a 9,000-character value
differing at its end, string whitespace and case, `"1"` against `1`, `__proto__`, the tag on unparseable text, a 100,000-deep
nesting), each guard shown red under the encoder it guards against. **The proof launch:** `pnpm part-h-proof`'s
`loop-reordered` (`ROTARIS_SCRIPT=loop:readreorder:20`, one `read_file` value in the key orders A, A, B): on the build before,
20 calls, no activation, the session `completed`; after, three activations (the first `trigger: repetition`), one
`circuit_breaker_escalation` and stop reason `agent_session_aborted` after 12 calls. Recorded in
[ADR-0059](../../../architecture/adr/0059-the-loop-supervisor-as-an-in-turn-observer.md) (decision 3 in place, and its 2026-10-20 section) and in
[`first-executions.md`](../../../architecture/first-executions.md). **Measured live** in the default live run's `crlf` scenario on this branch (2026-10-20, pack `2026-10-20T15-45-32-700Z`, endpoint `katalyst`, unmetered, R-068; Windows 11 ARM64, Node 24.18.0 arm64, beside three other trees' 18 Electron processes): four `haet_edit` calls of one value,
written in two key orders (A, B, B, B), drew a `loop_supervisor_activation` with `trigger: repetition` after the fourth, and
the scenario passed — the reopening condition's first limb not met. Its second limb (an activation drawn by calls whose parsed
arguments differ) was not seen: the pack's one activation followed four calls of one value.
