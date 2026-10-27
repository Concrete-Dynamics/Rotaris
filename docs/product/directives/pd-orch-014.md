[Product directives](../directives.md) › PD-ORCH-014

<a id="pd-orch-014"></a>

### PD-ORCH-014 — the timeline and issue vocabularies name every fact the run records

The timeline-event vocabulary of domain 01's Data & Formats SHALL also hold the words below, each naming the fact
beside it and no other:

- `model_exhausted` — REQ-ORCH-091 (a)'s session-wide memory that a provider and model pair is exhausted, read back
  when the session resumes;
- `model_override` — REQ-ORCH-091 (d)'s session-wide override, read back when the session resumes;
- `context_compressed` — a completed compression. It is **the event that reports the compression** REQ-CONFIG-135
  names, "the session's event stream" read as the session's timeline (OQ-53): it carries `threshold_percentage`,
  `capacity`, `advertised_input_limit`, `default_threshold` and `trigger_tokens` as separate fields, and
  REQ-MONITOR-086's count is seeded from these entries;
- `iteration_paused` and `iteration_resumed` — an iteration left open by a pause, a stop, a quit or a crash, and that
  iteration resumed (PD-ORCH-005);
- `child_paused` and `child_resumed` — an agent left unfinished by such a rest, and that agent resumed or a settled
  child followed up (PD-ORCH-005);
- `approval_withdrawn` and `question_withdrawn` — an approval or a question withdrawn by such a rest (PD-ORCH-005);
- `run_pause_requested` and `run_pause_refused` — the user asking the run to pause, and a pause refused at the plan
  gate (PD-ORCH-005 clause 11);
- `run_continuation_intent` — a continuation's intent and its audit payload;
- `loop_supervisor_activation` — a loop-supervisor activation short of escalation;
- `context_selection` — the sibling and attached artifacts a child was given;
- `notice` — the entry REQ-NOTIFY-268 writes for a persistent notice of severity `warning` or `error`, with the
  notice's own severity;
- `waiting_on_tools`, `stall_recovered` and `corrective_message` — REQ-MONITOR-118's silence with tool calls in flight,
  REQ-MONITOR-120's recovery after a stall, and REQ-NOTIFY-111's one corrective message (OQ-127).

The issue-kind vocabulary SHALL also hold `model_wait` (REQ-NOTIFY-090's wait on a provider limit),
`validation_llm_error` (REQ-ORCH-092's validation retry) and `compression_failed` (a compression that did not complete).

REQ-ORCH-139's closure is unchanged and reads over the vocabularies as extended here. Like the words other domains'
Data & Formats fix, the timeline words of the chat domain ([`PD-CHAT-009`](pd-chat-009.md#pd-chat-009)) and of domain 05
([`PD-TOOLS-011`](pd-tools-011.md#pd-tools-011)) are among those vocabularies, and a run uses no name outside them.

**Why, and what it costs.** The product wrote twenty-eight names under no vocabulary's word — fifteen of the words above
and the chat domain's thirteen — a recorded departure from REQ-ORCH-139's "MUST NOT" that a lint gate held on a closed
waiting list (OQ-157), and the three issue kinds under none either. The rulings of OQ-127 and OQ-76 add five facts the
product now records — the three watchdog words above and `PD-TOOLS-011`'s two — so thirty-three timeline words join the
vocabularies in all. The alternative was to move the facts to another record, and the only candidate, the session log,
is worse on every count: autopsies and exports read the timeline (REQ-SESSION-199) and the log is in neither; the
product reads several of these entries back
(`model_exhausted` and `model_override` on resume, ADR-0027; `context_compressed` for REQ-MONITOR-086's count,
ADR-0060; PD-ORCH-005's rest and resume, whose checks read the metadata); and moving them would need store changes
and lose what earlier sessions recorded. What is given up: domain 01's list alone is no longer the whole of its
vocabulary, so a reader of the specification must follow the back-pointer to this entry to know every name a run may
write.

> **Extends:** REQ-ORCH-139, REQ-NOTIFY-268
> **Narrows:** REQ-CONFIG-135

*REQ-CONFIG-135 stood under **Extends** until 2026-10-06, and its back-pointer read "Extended by": acceptance finding F15
found the label wrong, since OQ-53's ruling reads its "session's event stream" as the timeline, so the requirement
governs except in the case named here. The disposition and the back-pointer were relabelled; no text changed
([`pd-orch-014-records-req-config-135-as-extended-where-oq-53-narrows-it`](../../defects/fixed/pd-orch-014-records-req-config-135-as-extended-where-oq-53-narrows-it.md)).*

*Raised by the owner, 2026-10-06, ruling OQ-157, OQ-53 and OQ-127 as recommended; logged as [R-071](../requests.md#r-071). Built as
`PD-ORCH-006` and renumbered `PD-ORCH-014` before it landed, `main`'s `PD-ORCH-006` to `PD-ORCH-013` having landed
meanwhile.*

> **First execution, 2026-10-06, built under [R-071](../requests.md#r-071):** the twenty-eight names were already
> written, and the five raised beside them are written by the builds of OQ-127's and OQ-76's rulings (`stallRecords`,
> `UserPresence`); the directive's execution is the gate. `tools/check-timeline-vocabulary.mjs` (in `pnpm lint`) moved
> every name `AWAITING` held to `VOCABULARY` — the twenty-eight names it held for OQ-157, and OQ-127's three, which it
> held from the stall watch's build until this ruling — and added OQ-76's two: thirty-three words in all, each cited to
> this directive, `PD-CHAT-009` or `PD-TOOLS-011`. `AWAITING` is empty, so a new name fails the gate again. Its test
> checks that each cited directive's entry states its word in backticks, as it already checked a requirement's, and that
> this entry and the gate state the split of twenty-eight held and five raised beside them. Nothing in the rule was
> wrong. The issue kinds are not gated: no gate reads an issue's kind. Every other kind the product writes is named by a
> requirement of its own domain but one, `resumed_under_changed_instructions`, which [`PD-ORCH-005`](pd-orch-005.md#pd-orch-005)
> clause 14 coined and OQ-105's ruling kept as built (revision 7): that directive's word, as this entry's three are its
> own (read by hand on this day, over the source of `f94ab75`, and again of `395b73e` once `fin21` had landed). The row
> is in [`../architecture/first-executions.md`](../../architecture/first-executions.md). *Corrected in place 2026-10-06,
> before it landed (the verifier's review): this entry first gave the sum, thirty-three, as the count the product wrote
> under no word and the gate moved, where twenty-eight were held and five raised beside them; and it said every other
> issue kind was named by a requirement, which a second reading of the kinds found untrue of PD-ORCH-005's one.*
