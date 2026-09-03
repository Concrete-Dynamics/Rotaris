# ADR-0026 — The internal model boundary is two ports, not one

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** MODEL (ADR-MODEL-01), RUNTIME (Part 3, "what the LLM port must provide")
- **Depends on:** ADR-0002
- **Carries a likely escalation (OQ-17).**

## Context

The product decision fixes that feature code never calls a vendor SDK directly and that an internal
abstraction sits in between. It does not fix *where* that boundary is drawn.

`REQ-PROVIDER-005`: the `claude-code` entry declares **no discovery URL and no base URL at all** — they
are absent rather than holding a placeholder — and a code path that requires one **must fail before
opening any connection** rather than falling back to another entry's value. `REQ-PROVIDER-049`
describes it as a locally installed agent runtime invoked as a subprocess with the token injected in
the environment; `REQ-PROVIDER-048` requires a conflicting-credential precheck before every
subscription-runtime prompt; `REQ-PROVIDER-004` gives it an empty destination host; and
`REQ-PROVIDER-117` tells the user in as many words that the product invokes a locally installed agent
SDK and that traffic goes through that SDK.

`REQ-MCP-043` speaks of "**every agent backend the product supports**" and states that a backend that
cannot be given external tool servers is not a supported backend. The specification therefore already
assumes more than one backend exists.

The same run-level machinery must work across backends: a per-child hard timeout with one retry on the
role's fallback model (`REQ-ORCH-088`), an unresponsive-model fallback keyed on "before **any** model
event has been received" (`REQ-ORCH-090`), token usage and cost per agent (`REQ-MONITOR-102`), and the
provider's own last-prompt token count preferred over an estimate (`REQ-MONITOR-081`).

`REQ-PROVIDER-090` requires unavailable models to be **unconstructible** into a client, not merely
rejected at a call site. `REQ-PROVIDER-092` requires a configured model naming a sign-in provider to be
dispatched with a credential from the store, never a static key, with an expired credential renewed
**before the request leaves** — so credential acquisition is inside the request path.

`REQ-ORCH-146` is the single most shape-determining requirement: for a provider that ships its own
native agentic loop, children run under that loop **by default**, and disabling it degrades to
single-shot with tool use and streaming discarded. `REQ-ORCH-134` states explicitly that the threading
model, the shape of streamed model events, and any retry below the classification of `REQ-ORCH-092` are
**not constrained**, and no conformance claim depends on them.

## Alternatives considered

**A — One port: `LLM` is a streaming language-model call, and `claude-code` is adapted to it.** The
port is "given messages, tools and options, produce a stream of text, reasoning, tool-call and usage
parts"; the adapter spawns the external runtime, drives it, and translates its output back.

*For:* one interface for the whole product; the run loop, permission engine, transcript and event
stream are written once; the prompt/callable equality of `REQ-MCP-062` and the approval flow apply
uniformly because the product still owns the loop.

*Against:* the adaptation is a fiction. The external runtime runs its own turn loop, calls its own
tools and manages its own context; pretending it is a single stateless model call means either
re-entering it per turn — throwing away context the product cannot reconstruct — or buffering an entire
agent session behind one "call", which breaks `REQ-ORCH-090`'s "before any model event has been
received" trigger and makes per-call usage accounting a fiction.

**B — Two ports: `ModelClient` below, `AgentBackend` above.** `ModelClient` is the streaming
language-model call and is what a vendor SDK or direct HTTP sits behind. `AgentBackend` owns a turn:
given a persona, a prompt, a tool surface and a set of normalised MCP server descriptions, it emits the
run's event vocabulary and returns a result. The product ships one default `AgentBackend` implemented
over `ModelClient` — used by every HTTP provider — and a second for `claude-code` that supervises the
external runtime.

*For:* it names what is actually there. `REQ-MCP-043`'s "every agent backend" becomes a real interface
with a real conformance obligation. `claude-code` never has to pretend to have a base URL, so
`REQ-PROVIDER-005` falls out of the type rather than being enforced by a guard. The `ModelClient` port
stays small and honest, which is what makes ADR-0027's SDK choice reversible.

*Against:* two backends mean two implementations of the run-level obligations — event emission, usage
accounting, timeout and fallback behaviour — and a real risk that the external-runtime backend silently
produces a thinner event stream. That risk must be answered by a shared conformance suite both backends
run against, not by discipline.

**C — One port at the agent level only.** Everything is an `AgentBackend`; no `ModelClient` exists.

*For:* fewest layers; no temptation to leak SDK types upward.
*Against:* it discards the one place the product genuinely has many similar things. Six providers, plus
arbitrarily many user-supplied compatible instances, plus **two request dialects against one base URL
chosen per model** (`REQ-PROVIDER-089`, `REQ-PROVIDER-092`), share one call shape; giving each its own
backend duplicates streaming, usage extraction, retry and abort logic six times over and makes
`REQ-PROVIDER-090`'s unconstructibility something to be re-checked in each.

## Decision

**Alternative B.** The specification has already committed to more than one backend (`REQ-MCP-043`) and
to one provider that is an agent runtime rather than a model. Modelling that as a single
language-model port would be an abstraction chosen against the evidence.

`ModelClient` must expose, because a requirement demands each:

1. A **streaming** call producing text deltas, reasoning parts, incremental tool calls and a terminal
   usage record (`REQ-MONITOR-081`, `REQ-MONITOR-102`, `REQ-EVENTS-053`).
2. **Image content parts** on input (`REQ-CHAT-171`, `REQ-PROVIDER-149`).
3. A **dialect** selector of `chat | responses` resolved per model (`REQ-PROVIDER-089`).
4. A **thinking level** of `low | medium | high | max | unset` (`REQ-PROVIDER-088`); `auto` is
   explicitly not in the vocabulary.
5. A **per-call abort signal** and a per-model timeout (`REQ-CONFIG-115`, `REQ-CONFIG-086`), with
   cancellation propagating into an in-flight request and a graceful pause awaiting in-flight tool
   calls up to a 30 s deadline (`REQ-ORCH-132`, `REQ-ORCH-134`).
6. A **retry count** defaulting to 5 (`REQ-PROVIDER-089`).
7. An **error preserving the HTTP status and the provider's own message**, so `REQ-ORCH-091`'s
   Retry-After surfacing, `REQ-ORCH-092`'s transient/validation-class/neither classification,
   `REQ-ORCH-093`'s context-window class, `REQ-NOTIFY-088`'s quota classification and
   `REQ-PROVIDER-098`'s 401/403 hygiene can all read it without pattern-matching on prose.
8. A **structured-output degradation ladder of three rungs**, with a rung a given model has rejected
   remembered **per model for the session** (`REQ-ORCH-010`).
9. A **credential resolver invoked inside the request path** rather than a token captured earlier
   (`REQ-PROVIDER-092`).

`AgentBackend` must expose the ability **not to drive the loop** (`REQ-ORCH-146`). An abstraction that
only offers "one call, streamed deltas, tools I dispatch" cannot express a provider whose native
agentic loop owns the turn. That is what makes the second port necessary rather than tidy.

## Consequences accepted

1. Two backend implementations must be kept behaviourally equivalent. Mitigation: **one conformance
   suite, parameterised over backends**, asserting the event kinds and ordering of `REQ-EVENTS-041`,
   the MCP description key set of `REQ-MCP-043` and the usage fields of `REQ-EVENTS-053`.
2. The external-runtime backend is a supervised subprocess with all that implies — stream ownership,
   cancellation, exit-status handling — the same discipline `REQ-MCP-113` already demands for MCP
   `stdio`, so the process-launch primitive is shared with ADR-0033.
3. `REQ-ORCH-134`'s explicit freedom — threading model, streamed-event shape, sub-classification
   retries — is genuine and should be used rather than over-specified.

## Escalation carried

**OQ-17: do tool calls made by a `claude-code`-backed agent pass through the product's permission
engine and event stream?** No requirement states whether the approval flow of domain 05, the
`tool.start`/`tool.finish` events of `REQ-EVENTS-041` and the transcript rows of domain 03 are produced
for tool calls the external runtime performs itself. This decides whether `claude-code` is a model or a
whole agent. If the answer is "they do not", that is a **user-visible narrowing of the permission
guarantee** and must be escalated, not absorbed. This ADR does not decide it.

## Revisit if

OQ-17 resolves such that the `claude-code` provider is dropped, or is reduced to a plain API call
carrying a subscription token — in which case the second backend disappears and alternative A becomes
correct. Also revisit if a third backend is proposed: two is justifiable, three is a plugin surface
needing its own decision.

## First execution — 2026-09-03, the two ports

*Recorded under GD-10.*

**Built and run:** `packages/model/src/ports.ts` — `ModelClient` as the streaming call (text, reasoning,
tool-call, finish, usage; image parts in; dialect per model; thinking level with no `auto`; abort signal
and timeout; retry count; an error carrying status, provider message and a **transient** fact decided on
the status so `REQ-ORCH-092` never pattern-matches prose; a credential resolver invoked inside the request
path), and `AgentBackend` owning a turn with `ownsTheLoop`. The default backend runs one call over the
client with the engine driving the loop. Every engine test runs the loop against a scripted client with
the controlled clock; the application runs the AI SDK adapter (ADR-0027) or, for verification, a scripted
client selected by an environment variable.

**Found: nothing in this record.** The second backend (`claude-code`) is not built and OQ-17 is where it
was. The conformance suite of consequence 1 has one backend to run against and does not yet exist as a
parameterised suite.
