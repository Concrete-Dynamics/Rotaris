# ADR-0017 — The permission policy is an immutable ordered value with matchers compiled at build time

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** EXEC (ADR-EXEC-03)
- **Depends on:** ADR-0002, ADR-0016, ADR-0018

## Context

`REQ-TOOLS-011` and `REQ-TOOLS-163` require **exactly one gate** with no ungated dispatch path, for
built-in, plugin and MCP calls alike. `REQ-SANDBOX-125` forbids a provider-side tool-execution feature
that would step around it: provider built-in tools are off by default and any provider-routed call is
executed by the product's own path.

`REQ-TOOLS-012`: the decision vocabulary is exactly `allow`, `ask`, `deny`; resolution never raises to
the dispatcher; an `ask` is always resolved through the approval flow before the dispatcher sees
anything, so the dispatcher only ever handles `allow` or `deny`.

`REQ-TOOLS-020` makes fail-closed **unconditional**: any exception during resolution yields rule id
`failclosed:unresolvable-policy`, source `fail-closed`, decision `ask` on interactive hosts and `deny`
on headless hosts, never `allow`, with a fixed reason sentence. The gate must therefore know host
interactivity **at decision time**, before the approval flow is reached.

`REQ-TOOLS-028` closes the decision-source vocabulary at exactly twelve values, which are persisted and
streamed and must round-trip. `REQ-TOOLS-015` fixes a permission request as tool name, persona, the
arguments as a name-to-value mapping, and **at most one** command facet selected purely by argument
name — `command` if present and a string, else `url` if present and a string, else none. Selection by
name alone is normative: a plugin tool naming a string argument `command` does supply a facet, and
`write_file`'s selector is named `operation` precisely so that it cannot (`REQ-TOOLS-135`).

`REQ-TOOLS-017`: a rule constrains any combination of five facets — tool names as a case-insensitive
set, personas, path scope, a command matcher, an exact argument set — and fires only when every
populated facet matches. Exact-argument matching compares key sets and, per key, textual value;
**non-string values compare by compact JSON** with no insignificant whitespace, keys sorted ascending
by code point and numbers in shortest round-tripping form, so `1` and `1.0` compare equal.

`REQ-TOOLS-018` and `REQ-TOOLS-129`: path-scope evaluation reads only seven argument keys, resolves
relative paths against the workspace root, requires *every* path inside for `inside_workspace`, fires
on the *first* escape for `outside_workspace`, counts an unresolvable path as outside, and follows
symlinks and junctions to a real path — an I/O operation on the decision path.

`REQ-TOOLS-019`: a policy is an ordered rule list plus a default decision plus a preset name; first
match in list order wins; a policy is invalid when the preset name is empty, a rule id is empty, two
ids collide, or an outcome is outside the vocabulary; an invalid policy errors naming the defect at
the latest when the first call would be decided under it, and **never decides a call**.

`REQ-TOOLS-023` and `REQ-TOOLS-024`: session approvals are matched **before** any policy rule, most
recent grant first, and they outlive policy replacement and mode change unchanged; their ids are
`session:allow:<n>` numbered from 1 in grant order; a grant matches only the same tool name
(case-insensitive), same persona, and either a byte-identical pre-redaction command facet or the same
exact argument set.

> **Narrowed 2026-09-27 — [`PD-TOOLS-004`](../../product/directives.md#pd-tools-004).** "Either a byte-identical
> pre-redaction command facet or the same exact argument set" no longer holds for `write_file` and `haet_edit`
> (`haet` folded into it): a session grant of either now matches a later call of the same tool from the same persona
> whose `REQ-TOOLS-018` path arguments resolve to exactly the grant's set of paths, whatever its other arguments. The
> grant's set is resolved once, when it is made; the later call's set is resolved at evaluation, through the same
> injected resolver path scope already uses, and only when a path-scoped grant of that tool and persona exists. A call
> carrying no path key falls back to the exact match; every other tool is unchanged. The sentence is kept as it was
> written.

`REQ-TOOLS-025` and `REQ-TOOLS-191`: replacing the policy mid-run governs the agent's very next call
with no restart, no reconnection and no agent rebuild; decisions already returned keep their outcome.

`REQ-TOOLS-041` to `REQ-TOOLS-047` and `REQ-SANDBOX-045` fix three presets — `restricted`, `ask`,
`autonomous` — totally ordered by restrictiveness, default `ask`, an unrecognised name resolving to
`restricted` with a logged warning, and startup refusing to proceed if any preset lacks a rank. Rule
families compose in a fixed, behaviourally load-bearing order: fetch/egress, destructive commands,
network-command classification, read-only. Because first match wins, host-scoped fetch gating is
evaluated before any blanket read-only allowance. `autonomous` carries only the five destructive
denies — no fetch pair, no network-command rule, no ask rule of any kind, and no path-scoped ask ever.

`REQ-TOOLS-034` makes a non-tokenizable or empty **pattern** a policy-**build-time** error, "so typos
fail loudly rather than silently matching nothing". `REQ-SANDBOX-004` and `REQ-SANDBOX-016` are the
opposite for host patterns: wildcard grammar is *not* validated at load, and an invalid stored pattern
surfaces at classification time as a refused fetch with `egress_policy_error`. Two validation times,
both mandatory.

## Alternatives considered

**A — A compiled decision function per preset.** Three hand-written closures: fast, type-safe, no
interpretation. Against: `REQ-TOOLS-019`'s validity conditions are conditions on a *list of rules with
ids* — "two rules carry the same id", "any rule id is empty" — which a closure has no representation
of. Session approvals must be matched ahead of the closure with ids numbered in grant order. And the
audit's `rule_id`, the refusal text's `<rule_id>` and the settings surface all need the rule table to
be inspectable data. A closure would carry a parallel table anyway, at which point the table is the
real representation.

**B — Policy as data with matchers interpreted per call.** Simple, obviously correct, no build step.
Against: `REQ-TOOLS-034` requires a bad pattern to be a **build-time** error with a specific message;
interpreting per call defers that to the first matching request, which the requirement explicitly
rejects. It also re-tokenises the same starter patterns on every dispatch, on a path that gates every
tool call.

**C — An immutable value whose matchers are compiled once when the policy is built.** Chosen.

## Decision

`Policy` is a frozen `{ presetName, defaultDecision, rules }` where each rule holds its id,
description, outcome and up to five pre-compiled facet matchers.

**Building** a policy is a pure function of (preset name, egress configuration, workspace root). It
composes the four rule families in `REQ-TOOLS-041`'s fixed order, tokenises every command pattern
eagerly through ADR-0018's scanner and raises `REQ-TOOLS-034`'s error on failure, and runs
`REQ-TOOLS-019`'s four validity checks. **Building is the only step that can fail; evaluation
cannot.**

**Evaluating** is a pure function `(Policy, SessionApprovals, PermissionRequest) -> Decision`, wrapped
by a single `try` implementing `REQ-TOOLS-020` and nothing else. Session approvals are a separate
per-session list scanned most-recent-first **before** the policy, which is precisely what lets them
survive policy replacement with no migration step — they were never part of the policy.

Argument comparison uses one canonical-JSON encoder per `REQ-TOOLS-017`; strings compare as
themselves. Path-scope evaluation is the one impure step because it must resolve real paths; it takes
an **injected resolver** so the "unresolvable counts as outside" branch is directly testable, and a
resolver failure produces a **non-match, never an exception** that would divert the call into the
fail-closed path by accident.

Replacement is an **atomic pointer swap** on a per-run `PolicyContext`. Because `Policy` is frozen and
evaluation is pure, an in-flight decision reading the old value and the next decision reading the new
one is exactly `REQ-TOOLS-025`'s specified behaviour, with no lock and no agent rebuild.

Dispatch order is fixed by `REQ-TOOLS-175`, `REQ-TOOLS-031`, `REQ-HOOKS-004` and `REQ-HOOKS-068`:
permission resolution, then — on the allow branch only — pre-execution hooks, tool execution,
post-execution hooks, observation normalisation and diagnostics. **A denied call starts no hook
process.** The post-execution hook sees the result already truncated to `REQ-HOOKS-066`'s 4096-character
cap.

The never-gated loop-control names `finish`, `finishtool`, `think`, `thinktool` (`REQ-TOOLS-014`) are
matched case-insensitively before anything else and resolve `allow` with source `builtin` and rule id
`builtin:meta-tool`.

## Consequences accepted

1. The fixed rule ids of `REQ-TOOLS-039`, `REQ-TOOLS-042` to `REQ-TOOLS-045` and `REQ-TOOLS-085` become
   string constants under a snapshot test. A typo in any of them is a conformance failure, so they
   belong in one table rather than at construction sites.
2. Host-pattern validation stays **lazy**, so a policy can build successfully and a fetch can still
   fail with `egress_policy_error`. That asymmetry is specified and must be preserved, not tidied away.
3. The gate must know host interactivity **before** the approval flow, to satisfy the ask-versus-deny
   split. The evaluation environment carries an attendedness flag derived from the **same**
   presenter-registration fact ADR-0019 uses — one source of truth, read twice.
4. `REQ-TOOLS-013`'s deny does not abort the run: it returns a tool-result error carrying the original
   tool-call id with exactly the specified refusal text. A malformed tool payload takes the same shape
   after `REQ-TOOLS-032`'s three repairs fail, as does a `pre_tool` hook block.

## Revisit if

`REQ-TOOLS-049` resolves toward user-authored permission rules (OQ-16), which adds a
configuration-to-policy compilation step and per-rule settings validation; or a requirement makes
evaluation depend on mutable state such as a rate limit or a per-run counter, at which point
"evaluation is pure" stops being free.

## First execution — 2026-09-03, the first gate

*Recorded under GD-10.*

**Built and run:** `packages/agent-tools/src/policy.ts` (build, validate, evaluate, `PolicyContext` with the
atomic swap, session approvals scanned most-recent-first before the policy, canonical-JSON argument comparison,
path scope over the seven keys with an injected resolver whose failure is a non-match, the downgrade of
`REQ-TOOLS-067`) and `gate.ts` (`REQ-TOOLS-175`'s order with both hook slots empty and labelled so). The
fixed rule ids of `REQ-TOOLS-039/042/043/044/045` are under a snapshot test per preset. Verified in the built
app: allow by `ask:read-only-tool`, deny by `starter:deny-recursive-delete` with no dialog, approve once,
approve for the session (the second identical call decided by `session:allow:1` with no dialog), a
mid-run mode change deciding the very next call.

**One reading, recorded because the requirements leave the order open.** A payload still unreadable or
schema-invalid after `REQ-TOOLS-032`'s three repairs is returned as the recoverable tool-result error
BEFORE the permission resolution runs, and no decision is audited for it: a call that cannot be dispatched
as an ordinary call is not a dispatch, and asking a person to approve arguments the tool would reject is
a prompt with no purpose. `REQ-TOOLS-011`'s "no ungated dispatch path" is untouched — nothing executes on
that branch. The evidence record still opens and settles for such a call (status `failed`,
`failure_kind: invalid_request`), so `tool.start` and `tool.finish` exist for every call the model made.

**Found: nothing in the mechanism.** The one surprise was in the tests, not the code: `REQ-TOOLS-017`'s
canonical-JSON rule makes `1` and `1.0` compare equal by construction in this runtime, which the test now
states rather than assumes.
