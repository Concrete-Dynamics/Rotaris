[Product directives](../directives.md) › PD-TOOLS-022

<a id="pd-tools-022"></a>

### PD-TOOLS-022 — an agent may consult an advisor, a stronger model that reads its conversation and answers

1. **A tool the agent calls.** The public tool surface gains `advisor`, the twenty-first name. An agent calls it on its own
   judgement; no part of the run calls it for the agent, and no person triggers it.
2. **What the advisor is given.** The call takes one argument, `question` (a non-empty string). The advisor is given the
   calling agent's conversation as it stands when the call is dispatched (the request, the agent's messages, its tool calls
   and their results, as text) and the question. Where the conversation is longer than the advisor's model takes, its start
   and its most recent part are kept and the omission is marked, as the compressing pass does (REQ-MONITOR-082).
3. **What the advisor does.** A consult is one request to the advisor's model with no tools. Its text is the call's result.
   The advisor changes nothing and the agent stays the one that acts. The request is a request of the run and is counted in
   its usage at the advisor's model's rates (REQ-EVENTS-053).
4. **Who may ask.** Every agent, the entry agent and each delegated one, is offered the tool wherever clause 5 allows,
   whether or not its persona's `tools:` names it. The narrowing controls of REQ-TOOLS-006 bind it like any tool; it is a
   member of the read-only class, so `read_only` keeps it; it declares none of the three facets, so the plan gate does not
   withhold it.
5. **The advisor's model.** A slot, `advisor_model`, with its `advisor_model_thinking` companion, names it. Unset, the
   advisor is the model `large_model` names. The tool is offered to an agent only where a model resolves and it is not the
   model that agent runs on: the persona's own, or the run's entry model for the entry agent and for a persona naming none.
   An agent not offered the tool has had nothing removed, and nothing is logged for it.
6. **The bound.** `advisor.max_uses` (integer 0 to 50, default 3) is the number of consults one agent may make in one run.
   A call past it is answered with a refusal saying the consults are spent, and no request is made. A consult that fails,
   is cut at its model's timeout, or is not made because its model is held out of quota (PD-MONITOR-007) returns the reason
   as an error result and spends nothing. A continued run counts afresh.
7. **The transcript.** The call's row reads `Asks the advisor: <question>`. Once answered it carries a line naming the
   advisor's model and which consult of how many it was, and opened it shows the question and the advice.
8. **Settings.** `advisor.enabled` (boolean, default true) and `advisor.max_uses` are edited on the Settings screen's
   Delegation page; the slot is edited with the other slots on Models. With the switch off, or a bound of 0, no agent is
   offered the tool. All three apply to runs started afterwards.
9. **When to ask.** The tool's description tells the agent to consult at three moments: before committing to an approach on
   a task that is not trivial, when it is stuck, and before it declares the task done; and not for a short or routine task.
   The text is fixed and no configuration key reaches it.
10. **The loop supervisor names it.** A corrective message of REQ-NOTIFY-103 placed in the context of an agent that holds
    the tool and has consults left gains one sentence telling it to consult the advisor before trying again.

**Why, and what it costs.** The owner asked that agents may use an advisor, a stronger model, as other harnesses offer.
A run on a small model goes wrong mostly at three points (choosing an approach, circling, and stopping early), and one
reading by a stronger model at those points is far cheaper than running the whole task on it. Delegation does not serve:
a child on a stronger persona is a second agent that acts, with its own context, and it does not read the first one's
work. The conversation is handed over whole, beside a question, because an agent that is confused writes a confused
brief, which is the case advice is for. What it costs: each consult is a full-context request on the strong model, so a
run of several agents at the default bound may add three such requests per agent; an unconfigured workspace gains the tool
for every agent not on the large tier with no one having chosen it; clause 10 puts a fixed sentence at the end of a message
REQ-NOTIFY-103 requires to be composed for its activation; and the advice is one model's reading of a transcript it cannot
check, which the description tells the agent to weigh against what it has seen.

> **Extends:** REQ-TOOLS-001, REQ-TOOLS-007, REQ-CONFIG-040, REQ-CONFIG-065, REQ-CONFIG-066, REQ-PROVIDER-088
> **Narrows:** REQ-TOOLS-002, REQ-NOTIFY-103

*The cases, stated against the other directives on these requirements. [`PD-CONFIG-014`](pd-config-014.md#pd-config-014)
added the twentieth name to REQ-TOOLS-001's list; this adds the next, on the same terms. REQ-TOOLS-002 is narrowed in one
case only: this one name reaches an agent without its persona declaring it. [`PD-ORCH-018`](pd-orch-018.md#pd-orch-018)
governs when a corrective message is placed; clause 10 changes only what such a message says to an agent that can still
consult. [`PD-MONITOR-007`](pd-monitor-007.md#pd-monitor-007) governs which model a helper call reaches, and the consult
follows it. Cites without changing: REQ-TOOLS-004, REQ-TOOLS-006, REQ-MONITOR-082, REQ-EVENTS-053, REQ-ORCH-153,
REQ-CHAT-060.*

*Raised by the owner, 2026-11-24; logged as [R-128](../requests.md#r-128). The ten clauses are the owner's answers to ten
questions asked one at a time; the tool's name, a failed consult spending nothing, and the count restarting on a continued
run were the builder's choices.*

> **First execution, 2026-11-24 (branch `feat/advisor-tool`).** All ten clauses were built as written. **What was measured.**
> `advisor.test.ts` in `agent-tools` (the count, the refusal past it, a failure spending nothing, a call in flight holding its
> place), in `engine` (one request with no tools on the advisor's model, a model held out of quota not called, the request
> counted once, a long conversation cut to its start and its most recent part) and in `contracts` (the result text read back);
> `advisor-turn.test.ts` (every port handed the run's advisor, the conversation on the dispatched call, the corrective message
> with and without the sentence); `advisor-port.test.ts` (who is offered the tool, the plan gate, `tool_restrictions`, what the
> configuration resolves). In the built application, driven with the scripted dialect on a private display: an orchestrator
> on `gpt-4o` with `advisor_model: gpt-4o-mini` called the tool, one request went to `gpt-4o-mini`, and the row, its opened
> card and the Delegation page's two rows were captured. **What it found.** The executor was registered after the port's
> prerequisites were read, so the tool was removed as `executor_absent` for every agent; registered before them now.
> **Not measured.** A consult against a real model: the registered endpoint serves one model, and clause 5 offers no tool to an
> agent on the advisor's own. A backend that owns its loop (the Claude CLI provider): what its conversation holds at the call.
> The proof suites `pnpm verify:plan` names. With the built-in roles and an unset slot, the orchestrator runs on the large
> tier and is therefore not offered the tool; its children on the medium tier are.
