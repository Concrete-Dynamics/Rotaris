# Runtime view — a run from prompt to terminal result, and everything that reaches into it — 3. Inside a turn (`runTurn`, one agent conversation)

Part 4 of 16 of [the runtime view](../03-runtime-view.md), which indexes every part.

## 3. Inside a turn (`runTurn`, one agent conversation)

Before every model step, in this order: `shouldPause()` (a rest, a landing or REQ-MONITOR-123's pause stops here) →
pending **steering** injected as a marked user message (`steering_injected`, the supervisor's counter reset) →
the **loop supervisor**'s `check()` (`continue` | `inject` a corrective user message | `escalate` — the turn
fails with `circuit_breaker_escalation`; no supervisor is attached at all for the turn a plan-gate hold covers,
`PD-ORCH-001`; two tool calls are the same action — for the repetition and cycle triggers and `PD-ORCH-016`'s evidence
alike — when their tool names are equal and their whole argument values are one (OQ-364, since 2026-10-20: the arguments
read as JSON, the order an object's keys were written in no part of it, an argument text that does not parse compared whole
as text; each call's fingerprint computed once in `observe()`; until then the text the model client rendered was compared, so
one value with its keys reordered was another action); when the classification fails or is cut on a raw-count trigger, the
fallback's evidence is the last three messages with text normalised-equal or, since `PD-ORCH-016` (OQ-232, fin32), the last
four tool calls that are one action by that comparison — four calls of one tool with differing arguments are counts alone; the
fallback's deterministic "pause and reassess" message names the circled tool and a path anchor read from the call's argument
values — the first string under a path- or file-named argument, else the first path-shaped one, never the JSON text, since
2026-10-20 (an escaped `\t` ahead of `path` read as the anchor until then); the classification call is bounded
by `runtime.loop_classification_timeout` capped at what remains of REQ-NOTIFY-106's 2 s activation budget,
`LOOP_ACTIVATION_BUDGET_MS`, since fin35 — REQ-CONFIG-467's upper bound only; the budget runs from the `observe` that armed the
trigger, on the monotonic clock, so the triggering call and the rest of its step are spent from it, and with nothing left no
call is dispatched and the fallback decides) → the 100-step belt for roots only (children have no fixed model-step cap, `PD-ORCH-017`: every child turn is built in one place, `IterationChildren.execute`'s `turn` closure, with `maxStepsPerTurn: null` — a fresh child, a follow-up by `session_id`, a nested child and its parent's resumed turn, a child resumed after a rest, a continuation, REQ-ORCH-095's re-prompt, REQ-NOTIFY-111's corrective turn and REQ-ORCH-088's retry on the role's fallback alike, each pinned past 100 steps in `children.test.ts` (the retry in `ladder.test.ts`) since 2026-10-21; the root's own turn alone takes `RunConfig.maxStepsPerTurn`) → **context compression when the agent has reached
its threshold** (Part AH, below) → the model step (streamed into its own `agent`
row, and — from Part Z — into a **`thinking` row** for anything the provider marks as deliberation; the sink
discarded every reasoning delta before that, so no streamed-reasoning row had ever existed, REQ-CHAT-163).
Both rows are written through `upsertMessageRow` under one stable key per response **segment**, which is what
makes a replayed event persist once and a ladder retry update the row in place rather than append a second
(REQ-CHAT-054). A step also arms a **stall detector** on the clock port: ten seconds with no output of any kind
marks the live row `stalledSince`, the next output clears it, and neither publishes anything into the record
(REQ-CHAT-164's detection half; the drawing half is the renderer's). Output is a text, reasoning or usage part, and a tool
call under way or complete: the adapter forwards the SDK's `tool-input-start` and `tool-input-delta` parts as `tool-input`
stream parts, one per piece of a call's streamed arguments, beside the call itself, which still arrives once, whole, as
`tool-call` (since 2026-10-07; until then they re-armed only the adapter's own idle bound, so a step streaming a long
`write_file` was silent above the adapter —
[`a-child-streaming-a-long-tool-call-is-reported-stalled.md`](../../../defects/fixed/a-child-streaming-a-long-tool-call-is-reported-stalled.md)). After the step: the supervisor observes the
message; each tool call is observed, written as a running `tool` row, dispatched through the **gate** (policy →
approval when needed — resolved at once under the headless policy while the run treats the user as **away**,
`PD-TOOLS-005`, §5 → executor; hooks in its two slots), settled with its outcome (and a `diff` row for an
edit); the results go back as one tool message; hook feedback follows as a user message. A reply with no tool call ends the turn — unless a steer is pending, in which case
the agent takes another round; an empty reply with no call is the runtime's stuck report to the supervisor — except where the
run itself follows the turn up (`PD-ORCH-009` revisions 3 to 5): `LoopSupervisor.withdrawStuck()` clears a pending `stuck`
trigger (and nothing else — a repetition, cycle or raw-count trigger stays, and the counter is not moved) before the run sends
its own message, so that message is the request's last, with no classification, corrective or activation. Four callers:
`Run.turn`'s `correction()` before `ANSWER_REPROMPT` (revision 3, OQ-282) and before REQ-ORCH-078's plan correction (revision 4,
OQ-284), `IterationChildren.execute` before a child's REQ-ORCH-095 re-prompt "Carry out the task now, …" (revision 4,
OQ-283), and `IterationChildren.runWithChildren` as it takes a parent — a root, or a delegated child acting as one — into the
wait on a child of its that is pending or ended unobserved (revision 5, OQ-296, case (d)): the children's reports are then the
one message the run adds for that turn. The plan correction also calls `noteUserInstruction()` — REQ-ORCH-105's
todo-correction message restarts the consecutive series (since fin44; before it the series ran on across the correction); a
report does not (it is no user instruction), so the wait leaves the series where it stood. Until fin45 a parent's empty turn
while its background child ran was still a stuck report: the turn the child's report led took the trigger, the corrective
followed the report, and a root that waited silently over three batches escalated (`agent_session_aborted`).

**The conversation record (PD-ORCH-005 clause 1; `run/record.ts`).** Every agent's `Conversation` carries a
recorder, so every `push` — the task or the resume message, a steer, a supervisor correction, the assistant message
with its tool calls, the tool results, hook feedback — is one `agent_messages` entry under the agent's task id, written
the moment it joins the conversation, and every `replace` (a compression, ADR-0060) is one `replacement` entry holding
the whole conversation that took its place (clause 12). The root's recorder is keyed by the iteration's root task id,
a child's by its own; REQ-ORCH-088's fallback retry writes an empty replacement before the second attempt, since that
attempt starts the child's conversation again from its payload. A summarising pass, the compressor and the classifiers
are no agent's conversation and record nothing. What the record holds is the conversation: the system prompt and the tool
definitions are rebuilt from the persona whenever the agent is built, and streamed reasoning is drawn but never sent back,
so neither is recorded (OQ-95). Beside it the record keeps **each agent's fingerprint** (PD-ORCH-005 clause 14, revision
7 since 2026-10-06; `agent_fingerprints`, v24): the SHA-256 of its **persona's own definition** — the persona's system
prompt before the playbook, the context units and the MCP section are appended, and its tool declaration (declared tools
in name order, `tool_restrictions`, the `coordinatorOnly` and `readOnly` flags) — each marked `persona:`
(`personaDefinitionOf`, `fingerprintOf`; OQ-105 as ruled). Until then it was the system prompt and the tool listing the
agent's first request carried, so a playbook, a skill, the MCP section or the listing warned with no persona edited. The
check is made by `runTurn` at an execution's first model step (`TurnDeps.fingerprint`) and built once per execution —
`turn()` for the root, from the entry persona, `execute()` for a child, from its own (`ConversationRecord.fingerprint`) —
so REQ-ORCH-088's retry compares nothing. An agent with none recorded has it recorded; one that has one is being resumed,
and when either digest differs the run states it as a warning naming the agent: a `resumed_under_changed_instructions`
issue (warning severity, its timeline entry) and one `system` transcript row — and the row's digests are then replaced by
the definition it resumed under (`replaceAgentFingerprint`), so each change is stated once. An unmarked digest, recorded
before the ruling, is replaced the same way and nothing is stated. A turn **closes** its `Conversation` on every exit, so a manual compression (Part AO)
that finishes after its turn ended replaces and records nothing and reports that it failed. `runTurn` takes a `null` task
to continue a history as it stands, and `ConversationRecord.load` reads an agent's conversation back from its last
replacement forward (`conversationOf`); neither has a caller until the resume lands. Until the interruption lands, a
stop that aborts a step mid-dispatch still leaves that agent's record ending on calls with no results.

**What a step costs (PD-MONITOR-001 revision 2; `model/reported-cost.ts`, `kernel/money.ts`, `run/pricing.ts`,
`run/aggregates.ts`).** A completed provider request carries its tokens and, where the endpoint's protocol defines a
field for it, the cost that provider computed for that request. The ask is a body field the endpoint owns, sent only
to endpoints that define one (`COST_REPORTING_HOSTS`, today OpenRouter's `usage.include`), because a strict
OpenAI-shaped API answers an unrecognised body key with a 400. The reading is the SDK's `metadataExtractor`, which
sees the raw chunk before the SDK's usage mapping keeps the token fields and drops the rest; the figure leaves the
adapter on the port's own `usage` part. **The request is priced at the ladder cell** (`resilientStep`), the one
place the model it was sent to is known — after a fallback, the fallback's: `priceRequest` keeps a reported figure;
otherwise, where that model's catalogue entry carries both configured prices (`CatalogueEntry.pricing`, filled from
`effectivePricing` in `run-host/configuration.ts`), it multiplies input and output tokens by them exactly
(`multiplyAmount`); otherwise the request is unpriced. A request that counted no tokens and reported no figure is
none of the three. `Aggregates.addRequest` adds the figure to the run's total in exact decimal arithmetic on
`bigint` in `kernel/money.ts` — the one module where arithmetic on an amount lives, which
`rotaris/money-only-in-money-ts` enforces (ADR-0031) — and folds the request's pricing into the qualifier:
`unknown` (no figure), `incomplete` (some requests without one), `reported` (every figure the provider's) or
`configured` (every request priced, at least one at configured rates). The qualifier is persisted with the total
(`sessions.cost_qualifier`, v21) and rebuilt on a continuation from it and the token totals. The total reaches
`usage.update` and `session.end` in the payload's existing `cost.total`; the label is `costLabelOf(cost,
qualifier)`, rendered half-up to two places or four below one hundredth — and, for an amount greater than zero that
this rounding would bring to zero, as the floor `< 0.0001` (`formatAmount`'s `AMOUNT_FLOOR`; ESC-42, REQ-PROVIDER-121 as
amended), zero itself reading `0.00` — and with no currency symbol, because no figure names a currency and the product
picks none. The floor is rendering only; the persisted total stays exact. A configured price reaches the entry exact because the loader
reads it from the YAML scalar's source text (`config/prices.ts`, `exactPrices`) before the plain value's double is
used — the discovery snapshot's prices likewise. **Every agent's requests are counted**: the entry agent's turn
and every delegated child's turn, at any depth, hand each completed request to the one `Run.onRequestUsage`
(`ChildrenDeps.onRequestUsage`), so the run's tokens, its cost and each `usage.update` cover the whole tree
(REQ-EVENTS-053). Until 2026-09-23 a child's turn was built without it and the totals were the entry agent's
alone. **So are the run's requests that belong to no agent's turn** (`run/metered.ts`): compression, the
child-report summariser, the pre-flight's intent classifier and the loop supervisor's classifier each call a
backend `meteredBackend` wraps, which hands every completed request, a failed one included, to `Run.countUsage`
with the model it was sent to; `countUsage` prices it at that model's catalogue rates (`priceRequest`, as the ladder
does) and passes it to `onRequestUsage`. `Sessions` wraps the compressor's and the summariser's backends itself and
hands its `countUsage` to the run host's two classifiers, through `PreflightContext.countUsage` and the
`supervisor` factory's third argument, which wrap their own. The improvement analyst runs after the run has ended
and has no run totals to join. Until 2026-09-27 these four calls discarded their usage. **Which model they call
(PD-MONITOR-007, OQ-189, ruled 2026-10-06).** Every one of these helper calls, the analyst's included, resolves its
configured model through the session's memory at the call (`helperChoiceOf`, `run/resilience.ts`; `Run.helperModel`):
the overrides followed — the model at the level its configured key carries, which the call sends (the loop classifier's
`helper.thinking` since the plan's repair round 1) — and not `ok` where the pair it ends on is held out of quota. `Sessions` hands the reader to the run
host as `PreflightContext.helperModel`, the `supervisor` factory's fourth argument and `onRunResult`'s third; the intent
classifier (`classifyIntent`'s `helperModel`) and the loop classifier (`createLoopClassifier`'s, read at each
classification) then make no call and proceed as on a failed classification, the analyst is skipped with a log line
(`postRunAnalystOf`; a captured job keeps the model resolved at its capture), a configured compressor compresses on the
agent's own model (`compressing` in `Run.compressionFor`), and the summariser summarises a child on the model the child
ran on (`ReportInput.agentModel`), else writes the fallback report saying why. Until then only the summariser followed an
override, and none read the exclusion.

What the model is handed for each of them is `toolSpec` (`run-host/tools.ts`): an MCP tool's own input schema where
ADR-0034 supplies one, otherwise the zod schema converted **as an input** (`io: 'input'`) — the shape of a call about to
be made, in which a field carrying a `.default()` is optional as the parser treats it. Converted as an output, which was
the default until 2026-09-16, such a field is advertised as required and the product states a contract it does not
enforce. The gate checks a call against the schema the model was handed, so an MCP executor's `schema` is
`advertisedSchemaCheck(inputSchema)` (`agent-tools/advertised-schema.ts`): the object record refined by ajv 8's reading
of the server's schema, the engine the MCP SDK bundles, with the dialect taken from `$schema` as the SDK takes it (none or
2020-12, 2019-09, draft-07/06). `format` is an annotation; `$async`, ajv's own keyword rather than JSON Schema's, is
removed before compiling, so the check stays synchronous (until fin21 it compiled a Promise-returning validator that never
refused and left its rejection unhandled); a `pattern` that is no regular expression under the `u` flag is
removed where removing it can only widen what the schema accepts (no `not`, `oneOf`, `if` or `maxContains` in the schema),
and otherwise the schema is not compiled. A call that fails it is refused at the gate exactly as a built-in tool's schema
failure is (REQ-TOOLS-032; `invalid_request`, a `tool_error` issue) and never sent; a valid call is sent as written,
nothing filled in or stripped. A schema the reader cannot compile leaves the tool callable under the object check alone,
said once per process at info (REQ-MCP-052/055/059 drop no tool for its schema). Until 2026-10-06 the MCP `schema` was
`z.record(z.string(), z.unknown())` and every object passed (live-run finding G3); the first two repairs read the schema
with zod's `z.fromJSONSchema`, which reads patterns without the `u` flag, bounds `integer`, compares `enum`/`const` by
identity, and refused valid calls each time a rewrite around one of those dropped a constraint inside `oneOf`. REQ-TOOLS-032's array repair is the
schema's to decide for every tool (`repairArrayFields`, `agent-tools/gate.ts`): one of the five fields holding an object is
wrapped only where the schema refuses the object there and not the one-element array; until 2026-10-06 `repairPayload`
wrapped all five unconditionally. One repair beyond REQ-TOOLS-032's three is the tool's own (`ToolExecutor.inferArguments`,
`PD-TOOLS-007`): for a call its schema still refuses, `write_file` reads a missing `operation` as `create` when the call
carries only a path and content and its file does not exist; the gate validates the answer and dispatches it in the call's
place before the evidence record opens, so the record, the label, the approval and the hooks see the `create`, and the
result gains a sentence saying what was read.

The executors a port registers (`run-host/tools.ts`): `read_file`, `write_file`, `haet_read`, `haet_edit`/`haet`, `grep`,
`glob`, `todo`, `terminal` (by shell presence, REQ-TOOLS-104), the three delegation tools when delegation is available,
**`ask_questions`** (Part AC — its `userPromptChannel` prerequisite is now attendedness, REQ-TOOLS-053/069, and the
orchestrator is the one built-in persona declaring it, REQ-CHAT-094's one conversation), the three artifact tools when
the session has an artifact store, and **`fetch`** (ADR-0023, Part N). `grep` and `read_file`'s `grep` filter share one
pattern dialect (`compileSearchPattern`, `tools/search.ts`): the accelerator's, not the host engine's — leading
`(?flags)` groups are read off and translated, because REQ-STARTUP-058 pins ripgrep and REQ-TOOLS-141 holds results
identical whether or not it is present. The search tools filter by workspace-relative path, relative to the run's own root
(`scanExcludes`, `walkFiles`): an explicit `grep` path or `glob` base, or a named file, inside a hard-coded ignore component
(REQ-TOOLS-140, the code-intelligence marker's directory among them since `PD-TOOLS-012`) or under a directory the
`.gitignore` prunes yields nothing, exactly what the whole-workspace scan returns beneath it (REQ-TOOLS-139, OQ-219). The
reader answers in git's order (`ignoredBy`, `packages/config/src/init/gitignore.ts`): what lies beneath an ignored
directory is ignored, otherwise the last rule matching the path itself decides, so `gen/*` then `!gen/keep/` keeps
`gen/keep/` and what it holds; the pruning walks ask only an entry's own verdict (`ignoredHere`); `read_file`
remains the route to a named file. `fetch` is the one executor that **reads configuration per call**: each call reads
the workspace's **saved** files and the discovery snapshot (`egressReader`, no live state — REQ-SANDBOX-038/118,
REQ-TOOLS-089) through `readSavedConfiguration` (`packages/config/src/saved-read.ts`), which loads again only when a
file the last load read has changed and otherwise returns that load's answer after one `stat` of each (about 1 ms
against a load's 4 ms on a Windows x64 host with 87 PATH entries, 2026-10-21; a load was measured at 1.7–2.5 ms behind
the run host and 3–4 ms median in the unit test before that), maps
`runtime.network_*` to the egress policy and `runtime.tool_call_timeout` to the run-level deadline, classifies the
named host and every redirect target before a connection is opened, and reports one of REQ-TOOLS-092's eight
failure kinds; the `ask` disposition was resolved by the gate's `{mode}:fetch-remote-host` rule before execution.
The entry role's port is the one at **depth 0** (`isEntryPort`): the pre-flight's grant and the `single` override
reach that port and no other. The same grant reaches the entry turn's instructions (`entryInstructionsFor`, `PD-ORCH-006`), so a coordinator offered
the bundle's writing and command tools is told it does the work with them rather than that it must not.

**The file tools' shared state (`tools/files.ts`, `FileToolState`; REQ-TOOLS-132/133/137).** One per workspace root, shared by
every run and agent there: the read record, and an undo stack of the ten most recent writes per path that `write_file` and
`haet_edit`/`haet` both push and `write_file`'s `undo` pops. An entry is what the path held before the write (`UndoEntry`): its
content, or nothing for a create, which also keeps the first directory the create made for the file and the SHA-256 of what
it wrote. Undoing an entry with content writes it back; undoing a create removes the file, then each directory the create made
while it is empty, and says so ("Removed <p>: it did not exist before the create this undoes …"), its diff row the file's lines
removed (REQ-CHAT-050). It does so only while the file's bytes still have the create's digest: a file another writer rewrote
since is left in place, the undo refused ("Cannot undo the create of <p>: the file changed since it was created …") and its
entry kept (fin26). A file gone since is not written back, and an undone create leaves its path in the read record. Until 2026-10-06 an undone create wrote an empty file and a second undo had no history, which
left the final duress run's continuation child a stray file it had no tool to remove (finding N2).
A `haet_edit`/`haet` refusal writes nothing, pushes no undo entry and leaves the read record as it was. Its miss branch reads every level `matchEdit` found (`EditMatch`, with each level-3 window's `shifts`): REQ-TOOLS-189's plain "not found exactly" answers a level-4 match or none, while a level-2 or level-3 near miss of an `old_string` with a visible character answers through `nearMissMessage` (`PD-TOOLS-014`; an empty or whitespace-only one keeps the plain reply) — the lines, the level, what differs, the hash still current, and one window's text as a JSON string up to 30,000 characters (several windows: their lines, no quote). `write_file`'s edit still applies levels 2 to 4, and a single level-3 window passes through `shiftNewString` first (`PD-TOOLS-015`): `new_string` whose first visible line shares `old_string`'s indentation takes the window's `shifts` prefix, one already at the file's indentation (or with no visible character) is written as given, and any other is refused through `nearMissMessage` in `write_file`'s wording (no hash, `read_file`) with nothing written and no undo entry; the success names which of the two applied after "Match level: 3.". Every single-window match above level 1 then passes through `carryWindow` (`PD-TOOLS-016`): at level 2 each line of `new_string` that `linePairs` (`diff.ts`, the diff row's own walk) pairs with an identical line of `old_string` is written as the window's own line, byte for byte, and on a CRLF window every replacement line a line break follows gains `\r`, the success adding "new_string was written with the file's CRLF line endings.". A level-1 match and every `replace_all` occurrence, through `write_file` and `haet_edit`/`haet` alike, pass through `carryExact` (`PD-TOOLS-017`, OQ-254): each occurrence is tested on the lines its span touches by the same test (`crlfLines`, shared with `carryWindow`), and on a CRLF occurrence every line break inside the replacement or directly after it in the result gains `\r` when it lacks one, the success adding the same sentence (before ` content_hash:` in `haet_edit`) and `replaceAllMessage` counting the replacements as written; a carried result equal to the file is refused before anything is written ("…differ only in line endings…"), with no undo entry. A window edit whose carried result equals the file is refused the same way before anything is written (`PD-TOOLS-016` revision 3, OQ-260), naming the match level and the window's lines (`windowNoOpMessage`), with no undo entry and the read record unchanged. `insert` goes through `carryInsert` (`PD-TOOLS-018`, OQ-259): non-empty `content` is tested by `crlfLines` on the line before the insertion point and the line at it, and on a CRLF insertion every line break the insert writes gains `\r`, the success adding "content was written with the file's CRLF line endings.". Since `PD-TOOLS-014` revision 2 (OQ-252) `nearMissMessage` counts the quoted window's level-1 occurrences (`levelOneLines`) and, when the text recurs, names them before the quote, drops "matches exactly" and asks for a neighbouring line in both strings; the several-windows reply does the same for identical windows. Since `PD-TOOLS-019` (OQ-280, fin43) `matchEdit`'s level 3 compares each line of the window and of `old_string` with one trailing `\r` set aside and measures the prefix on those lines, so an LF `old_string` one indent off matches a CRLF file at level 3 (levels 1, 2 and 4 unchanged; `shiftNewString`, `carryWindow` and the two branches still read the window's raw lines), and `nearMissMessage`'s level-3 reply adds, by `PD-TOOLS-014` revision 3, that the line endings differ too and the quote carries the file's when a window line and its `old_string` line differ by a trailing `\r`. Since `PD-TOOLS-020` (OQ-295, fin44) level 3 reads a line with no visible character by having none: such a line of `old_string` matches a blank window line at any shift, whatever whitespace either holds, and never a visible one; the prefix is measured on `old_string`'s first visible line and the window's line at that index and added or removed on visible lines only; an `old_string` with no visible character never matches at level 3. `carryWindow` takes `new_string` as given beside the shifted replacement and, at level 3, writes each line `linePairs` pairs with a blank `old_string` line as the window's own, byte for byte (`PD-TOOLS-016` revision 4), and `nearMissMessage`'s level-3 sentence reads "Every line of the file (old_string) that holds a visible character …" when the window holds a blank line (`PD-TOOLS-014` revision 4).
