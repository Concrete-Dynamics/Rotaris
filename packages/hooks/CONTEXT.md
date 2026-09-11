# Lifecycle Hooks

Shell commands a user attaches to named points during a run. A hook is handed a masked JSON
description on standard input, is given a wall-clock budget, and answers with its exit status.

Terms are derived from `docs/spec/09-lifecycle-hooks.md`. Where a hook is *declared* belongs to
[Configuration](../config/CONTEXT.md); whether a repository's hooks may run at all belongs to
[Workspace](../workspace/CONTEXT.md).

## Language

**Hook**:
A user-declared shell command attached to a named lifecycle point. — `REQ-HOOKS-008`
_Avoid_: callback, plugin, trigger, listener

**Hook event**:
One of the seven named points a hook may attach to, around tool calls and at session, iteration,
child-agent and verifier boundaries. Only the point **before** a tool call is capable of stopping
anything. — `REQ-HOOKS-001`
_Avoid_: lifecycle stage, phase

**Entry**:
One declaration in the `hooks:` section — its event, its command, and optionally a display name, a
matcher, a timeout, whether it is required and whether it is enabled. — `REQ-HOOKS-008`

**Matcher**:
The pattern deciding whether an entry fires for a given occurrence. An empty matcher matches every
occurrence. — `REQ-HOOKS` matcher semantics
_Avoid_: filter, selector

**Scope stamp**:
Where an entry came from — `default`, `global`, or `workspace` — carried with the entry so
provenance survives layering. — `REQ-HOOKS-014`

**Payload**:
The single JSON object a hook receives on standard input, carrying the event, the session, the
workspace and the event's own fields. Every string at every level is masked. Event data can never
replace the three base keys. — `REQ-HOOKS-075`, `REQ-HOOKS-061`, `REQ-HOOKS-062`

**Blocking**:
What a pre-tool hook does by its exit status: stopping the call before it runs. No other event's
hook can stop anything. — `REQ-HOOKS` exit-code semantics
_Avoid_: veto, reject, abort

**Failure budget**:
The allowance a hook has for failing before it is automatically disabled, so a broken hook does not
degrade every run that follows. — `REQ-HOOKS` failure budget and auto-disable

**Hook digest**:
The canonical value taken over a repository's declared hooks, which the trust decision is recorded
against, so that changing a command re-opens the question and reformatting the file does not. —
`REQ-HOOKS-091`

**Trust decision**:
The recorded answer to whether a repository's own hook commands may run, kept in the workspace's
trust file. Until it is given, repository-declared commands stay inert. — `REQ-HOOKS-094`,
`REQ-HOOKS-096`
_Avoid_: approval (that is the Tooling context's word for a per-call prompt), allowlist

**Scope fallback**:
What happens when a user declines a repository's hooks: their own hooks stay in force rather than
everything being switched off. — `REQ-HOOKS` scope fallback on refusal

**External import**:
The opt-in adoption of hooks a user has configured for a different, third-party assistant, read
read-only. — `REQ-HOOKS` external-agent hook import
