# Archived open questions — Spikes, and the questions raised since (21 of 35)

The ruled, closed, resolved and withdrawn entries of [part 54](../../../architecture/open-questions/54-spikes-and-later-questions-21.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-250"></a>

**OQ-250 — Does the coordinator's routing table send the work a route implies to a persona whose tools allow it?**
*(REQ-ORCH-028, the routing table from need to role, with capability clauses for `codebase-analyst` and `librarian` only;
REQ-TOOLS-001, the three facets; REQ-CONFIG-100, a configured `system_prompt` replacing the built-in one; REQ-CONFIG-101;
`PD-TOOLS-006` revisions 3 (the write-scope refusal) and 4 (the catalogue); OQ-216, whose target of zero the duress run
at `a68f121` missed; OQ-228 and OQ-229, the delegation targets. Raised 2026-10-07 from the final live runs: finding D3 of the duress
autopsy at `a68f121` (pack `2026-10-07T07-09-30-708Z`, session `e6747bd0`, `#114`, `#115`, `#164`), recorded in
[`the-routing-table-leads-the-coordinator-past-delegates-catalogue.md`](../../../defects/fixed/the-routing-table-leads-the-coordinator-past-delegates-catalogue.md);
the consortium's question D3. The round assigned it OQ-233, which fin32 took on main for `write_file`'s level-3 shift; raised
as OQ-241 and renumbered OQ-250 before the landing, after OQ-249, for the reason OQ-249's entry gives. **Ruled 2026-10-07.**)*

Revision 4's catalogue reached every coordinator request, and the coordinator still gave the work a route implies to the route's
persona: `docs/decisions.md` to `architect` with a `write_scope` (`#115`, refused in 170 ms, re-briefed in 19.4 s), and a brief
offering `node --test` to a docs-writer (`#114`), which then called a tool that does not exist (`#164`). At `c2fdd6a` the same task
had gone to `codebase-analyst` (`#107`): the misroute follows whichever route matches the subject.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)), as
[`PD-TOOLS-006`](../../../product/directives/pd-tools-006.md#pd-tools-006) revision 8:** the built-in coordinator's routing table keeps every route
and REQ-ORCH-028's two clauses word for word. It closes with one fixed sentence that names no persona's tools and sends the work a
route implies to a persona whose entry in `delegate`'s list allows it: a file to write goes to a persona that writes workspace
files, and a test or other command goes to one that runs commands. Where the route's own persona lacks the tools, it is asked for
its answer, which is handed on. `delegate`'s catalogue also tells the caller never to offer a persona, in its brief, a command or
tool its entry does not show. Revision 3's write-scope refusal and revision 4's catalogue stay as built. OQ-216's target of zero
stands, and its falsified first reading is recorded beside the `a68f121` measurement in OQ-216's entry.

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended a per-route clause beside each target saying what that target's grant lacks
  ("writes no workspace files", "runs no commands"), rendered for the calling coordinator from the resolution that builds
  revision 4's catalogue, recorded as revision 8 and measured at the next duress run. The ruling took A's point that the
  coordinator decides at the routing table, so confirming the build leaves OQ-216's measure missed; it did not take the computed
  per-route clause, which would make the built-in prompt a per-configuration render (no longer the constant `entryInstructionsFor`
  recognises) for about 20 s a run.
- **Advocate B (the system's lens)** recommended keeping the advice as built, with revision 3's refusal, recording the duress
  measurement in place, and replacing OQ-216's target with enforced bounds and a reopening condition. The ruling took B's points
  that enforcement now bounds the structured miss, that revision 3 already names the writers, and that facts about a persona's
  tools belong in one computed place — so the new sentence names no persona's tools and points to the catalogue.

One fixed routing sentence and one brief clause stay true under every `tools:` override, every `tool_restrictions` entry,
OQ-228's targets and OQ-229's narrowing. **Reopening condition:** if a later duress run shows any `write_scope` refused for a
non-writer, or any brief offering a command or tool its target lacks, A's computed per-route clause is weighed as the next
`PD-TOOLS-006` revision; if any enforced bound breaks (a scoped misroute not refused before a record, an invented tool not stopped
at the gate, a stray workaround file, an impossible brief on a failed child's path, an answer claiming a command a persona could
not run), the question reopens at once.

**What a live run then shows.** Every coordinating request carries the routing table with its closing sentence (about 80 more
tokens) and `delegate`'s closing instruction with the brief clause; direct-work runs and runs with a configured `system_prompt` show
no routing sentence. In the duress run: 0 `write_scope` refusals for a non-writer and 0 briefs offering a command or tool the
target's entry lacks; a design or decision document such as `docs/decisions.md` goes to a docs-writer directly or with
`architect`'s answer handed on through `depends_on` or `inherited_context`. The harness's duress NOTE prints both counts;
missing-shell asides are counted only. The default run is unchanged apart from the tokens.

*Built 2026-10-13 (fin33, `fin33-delegation-targets-and-plan`); its first execution is reported in `PD-TOOLS-006` revision 8.*
`ROUTING_WORK_SENTENCE` closes `ROUTING` (`packages/engine/src/children/personas.ts`); `renderDelegateCatalogue`'s closing
instruction carries the brief clause (`packages/agent-tools/src/tools/delegation.ts`); the live run's NOTE counts both measures
(`apps/desktop/scripts/lib/routing-misses.mjs`). Pinned by `children/personas.test.ts` (the sentence verbatim after the last route,
naming no persona; the direct-work swap and a configured `system_prompt` carrying neither) and `tools/delegation.test.ts` (the brief
clause), both red on the code before. The note is repaired.

**Reopening condition met 2026-10-13, first limb, and ruled as [OQ-257](55-spikes-and-later-questions-22.md#oq-257):** the duress run at `552d346` refused one
`write_scope` for `architect` (`#92`); the second limb (an enforced bound broken) was not met. Advocate A's computed per-route
clause was weighed again and declined again, for the reason above; `delegate`'s own write-scope sentence was rewritten instead
(`PD-TOOLS-006` revision 9), and OQ-216's target became a bound. OQ-257's entry states the new reopening condition.

<a id="oq-252"></a>

**OQ-252 — When a near-miss reply's quoted text occurs more than once in the file, does the reply still promise it matches
exactly?** *(`PD-TOOLS-014` clause 5, the quote "sent back as `old_string` with the same hash it matches at level 1", and its
"Several windows" paragraph; `PD-TOOLS-015` clause 4, which reuses both for `write_file`'s level-3 refusal; REQ-TOOLS-136's level
1, a plain substring search, and its "Found <n> occurrences" refusal; REQ-TOOLS-189. Raised 2026-10-13 from `PD-TOOLS-014`'s
block and the near-miss code (`nearMissMessage`, `packages/agent-tools/src/tools/files.ts`), after fin32's review named the gap
and fin35 deferred it, and ruled the same day; the number is the round's assigned one.)*

The near-miss window is whole lines, but level 1 is a substring search, so the window's text can occur again inside a longer line
or across a line boundary. A file `x = 1\nmax = 1\n` with `old_string` `x = 1 ` matches one window at level 2 and is quoted as
`"x = 1"` with "Sent back as old_string with the same content_hash, the file's text over line 1 matches exactly"; the retry is
refused "Found 2 occurrences of old_str at lines 1, 2" and writes nothing. The several-windows reply ("send its exact text as
old_string") fails the same way whenever the windows' text is identical (two lines `x = 1`, `old_string` `x = 1 `). Clause 5's
promise of a level-1 match holds; it is silent on whether that match is unique. Recorded as
[`a-near-miss-quote-that-occurs-more-than-once-is-promised-to-match-exactly`](../../../defects/fixed/a-near-miss-quote-that-occurs-more-than-once-is-promised-to-match-exactly.md).

**What the build proceeds under.** The quote and its promise as built, whatever the text's occurrences.

**What a ruling decides.** Whether a reply whose quote is not unique says so, widens the quote until it is, or stands as built.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** `PD-TOOLS-014` goes to revision 2.
When a near-miss reply's quoted text occurs more than once in the file at REQ-TOOLS-136 level 1, the reply still gives the quote.
Before the quote it states the count and the lines where the occurrences start (at most 10, then "and N more"), drops the promise
that the quote "matches exactly" when sent back alone, and asks that one neighbouring line, unchanged, be added to both
`old_string` and `new_string`, naming the reader's offset and limit for the window and one line on each side, clamped to the
file. The over-30,000-character direction carries the same sentence, and the several-windows reply carries it when a window's
text is not unique. The quote is never widened. `PD-TOOLS-015` inherits all of this through its clause 4, in `write_file`'s
voice (`read_file`, no hash). Every reply whose quoted text is unique stays word for word; REQ-TOOLS-136's levels and its "Found
<n> occurrences" refusal are unchanged.

**The two recommendations weighed.** *Advocate A (the user's lens)*: flag the repeat before the quote, naming the count and the
lines, withdraw "matches exactly", ask for a neighbouring line in both strings with the reader's offset and limit, and flag the
over-30,000-character branch too; revision 2 of `PD-TOOLS-014`. *Advocate B (the system's lens)*: the same flag among the facts,
the listed lines capped at 10 then "and N more", revision 2 of `PD-TOOLS-014` reaching `PD-TOOLS-015` through its clause 4, and a
live-run count of retries answered "Found N occurrences". **The ruling followed both**: they agree on the remedy, flag and never
widen, on `PD-TOOLS-015`'s principle that "a refusal costs one call where a wrong success costs a corrupted file" — a widened quote
no longer lines up with the `new_string` the caller already wrote, so a resend would delete the added context lines beside a
success. From B the cap of 10 and B's example, which the code confirms (A's example, `  return x` against `    return x`, is a
plain substring and matches at level 1, never reaching the near miss; A's conclusion stands on B's mechanism); from A the
concrete read window and the over-30,000-character flag. Added by the ruling: the several-windows reply fails the same way when
the windows' text is identical, likely its common case, so the same count covers it. **Rejected:** widening the quote (a wrong
success that deletes context lines); confirming as built (a reply the next call contradicts); deferring (the model doing the
user's task receives the reply). **Costs kept on record:** in the non-unique case one read and one retry where widening would
have taken one retry; a caller that adds the neighbouring line to `old_string` only would delete it with a success, which the
wording's "to both" is the only guard against; a second implementation built from the specification alone keeps the unflagged
quote.
**Built 2026-10-13 (fin36):** `nearMissMessage` and `levelOneLines` (`packages/agent-tools/src/tools/files.ts`); pinned by four
cases under "PD-TOOLS-014" and one under "PD-TOOLS-015" in `packages/agent-tools/src/tools/tools.test.ts`, each red on the code
before; `lib/near-miss-edits.mjs` counts retries refused "Found N occurrences". The first execution is in place under the
directive.

<a id="oq-253"></a>

**OQ-253 — Does a one-second per-agent limit read "1 second" or "1 seconds"?** *(`PD-CONFIG-003` revision 3, "Where a cut-off
agent shows", the `<limit>` bullet: "written '1 minute' or '<m> minutes' when N is a whole number of minutes, and '<N> seconds'
otherwise", and revision 3's first execution, "except that one second reads '1 second'"; REQ-MONITOR-052, REQ-MONITOR-069;
REQ-CONFIG-113, `runtime.child_timeout` in whole seconds; REQ-ORCH-088's "Child timed out after <N>s". Raised 2026-10-13 from
that first execution's evidence and ruled the same day; the number is the round's assigned one.)*

The directive's template writes every limit that is not a whole number of minutes as "<N> seconds", so a one-second limit reads
"1 seconds"; the build writes "1 second" (`timeoutLimitText`, `packages/ui/src/agents.ts`, through `countNoun`), and revision 3's
first execution recorded that without the directive following. The case is reachable: the workspace file takes any integer of
at least 1 second (`child_timeout: z.number().int().min(1)`, `packages/contracts/src/config.ts`; no maximum in
`packages/config/src/sections/runtime.ts`), though the widget offers 60 to 14,400. Recorded as
[`pd-config-003-writes-a-one-second-limit-as-1-seconds`](../../../defects/fixed/pd-config-003-writes-a-one-second-limit-as-1-seconds.md).

**What the build proceeds under.** "1 second", as built at revision 3.

**What a ruling decides.** Whether the directive's template follows English number agreement ("1 second"), the code follows
the template's letter ("1 seconds"), or the case is ruled out of reach.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** the built "1 second" stands.
`PD-CONFIG-003` gains **revision 4**, which changes only revision 3's `<limit>` bullet so it reads: N, the limit the agent ran
under, written "1 minute" or "<m> minutes" when N is a whole number of minutes, and "1 second" or "<N> seconds" otherwise.
Revision 3's text is quoted beside it as no longer governing. REQ-ORCH-088's error form "Child timed out after <N>s", which the
parser reads, REQ-CONFIG-113's range, REQ-MONITOR-286 and every other clause of revisions 1 to 3 are unchanged. No code, test
or proof changes.

**The two recommendations weighed.** *Advocate A (the user's lens)*: keep the built "1 second" and correct revision 3's bullet
with a dated note in the style of OQ-237's correction, keeping the original wording quoted; the case is reachable through the
workspace file, so it is not to be ruled unreachable. *Advocate B (the system's lens)*: the same, with an explicit statement that
REQ-ORCH-088's machine-read error form is unchanged, and R-071's reading of REQ-GIT-122's form as a template of singular and
plural as the precedent. **The ruling followed both** on substance — the case is reachable (the file's integer of at least 1
second), the minutes clause already spells "1 minute", so the template was meant to agree in number, and showing "1 seconds"
would put a grammar defect on screen to match an omission; B's carve-out for REQ-ORCH-088 is taken — and **departed from both**
on the form: a dated "Corrected" note is the record's form for reasons and directive verbs, while `docs/product/README.md`
makes a change to a directive's own normative text a new revision, its replaced text quoted beside it. The `<limit>` bullet is
normative, so the change is revision 4. **Rejected:** changing the code to "1 seconds"; ruling the case unreachable (false).
**Costs kept on record:** none in code; one more revision on a directive already at three.
**Recorded 2026-10-13 (fin36):** revision 4 written in place in `PD-CONFIG-003` with its first execution (held as already
built; `agent-timeout.test.ts` green), the two back-pointers amended in place.

<a id="oq-254"></a>

**OQ-254 — Does an exact (level-1) edit of a CRLF file keep the file's line endings in `new_string`'s added lines?**
*(REQ-TOOLS-136, level 1 "exact" and replace-all "replaces every exact occurrence as plain text"; REQ-TOOLS-189, `haet_edit`'s
level-1 match; REQ-TOOLS-135, the success; `PD-TOOLS-016`, which keeps the file's line endings for a window match at levels 2
to 4 and says it does not decide level 1; `PD-STARTUP-001`, Windows the only platform shipped. Raised 2026-10-13 by fin36's
review from the probe OQ-246's ruling asked for, recorded by fin36's builder without a number; the number is the next free one
on `origin/main` when raised; if another plan lands it first, this one takes the next free number. **Ruled 2026-10-13.**)*

An edit whose `old_string` matches at level 1 replaces the exact span with `new_string` verbatim. When `new_string` has several
lines written with `\n` alone and the file is CRLF, the result has LF-only lines among CRLF ones: `write_file` on
`one\r\ntwo\r\n` with `old_string` `one` and `new_string` `ONE\nX` leaves `ONE\nX\r\ntwo\r\n`; `haet_edit` does the same, and so
does a `replace_all`. Recorded as
[`a-level-1-edit-writes-new-strings-lf-lines-into-a-crlf-file`](../../../defects/fixed/a-level-1-edit-writes-new-strings-lf-lines-into-a-crlf-file.md),
and pinned as built by "PD-TOOLS-016 … level 1, replace_all and haet_edit are unchanged on a CRLF file" in
`packages/agent-tools/src/tools/tools.test.ts`. No requirement's text is contradicted: "exact" writes `new_string` as given.

**What the build proceeds under.** `new_string` written as given at level 1 and by `replace_all`, through both tools.

**What a ruling decides.** Whether an exact match carries the file's line endings into `new_string`'s added lines (narrowing
REQ-TOOLS-136 and REQ-TOOLS-189 for both tools, `PD-TOOLS-016`'s rule extended to level 1 and `replace_all`), or stands as built
(the caller's bytes written exactly, `PD-TOOLS-016`'s cost "an exact level-1 `old_string` still does either" kept).

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** an exact edit keeps a CRLF file's
line endings. When `write_file`'s `edit` matches at level 1 or uses `replace_all`, and when `haet_edit` or `haet` matches at
level 1 or uses `replace_all`, each occurrence is tested by `PD-TOOLS-016` clause 2's test read on the lines its span touches;
on a CRLF occurrence every line break inside the replacement, or directly after it in the result, gains a `\r` when it lacks
one, and a `\r` is never doubled. An edit whose carried result leaves the file's bytes unchanged is refused with nothing
written. The success says when a `\r` was added. Recorded as [`PD-TOOLS-017`](../../../product/directives/pd-tools-017.md#pd-tools-017) (it
narrows REQ-TOOLS-136 and REQ-TOOLS-189 and extends REQ-TOOLS-135), with [`PD-TOOLS-016`](../../../product/directives/pd-tools-016.md#pd-tools-016)
**revision 2**, whose cost sentence "an exact level-1 `old_string` still does either" became false and is kept quoted beneath.

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended a new directive under which a level-1 edit and a `replace_all`, through both
  tools, give a `\r` to every line break inside the replacement or directly after it, tested on each occurrence, with
  `PD-TOOLS-016`'s sentence on the success. The ruling followed A on the break after the span: `PD-TOOLS-014`'s quote ends in
  the file's `\r` (`one\r\ntwo\r`), so a retry with `ONE\ntwo` takes the file's own `\r` with it, and only a rule that reads the
  result gives it back. It followed A on testing each occurrence by its own lines, as `PD-TOOLS-016` reads only its window.
- **Advocate B (the system's lens)** recommended the same directive with the `\n`s of `new_string` carried, one test over all
  of a `replace_all`'s occurrences, an explicit refusal when the carried edit changes nothing, a revision of `PD-TOOLS-016`'s
  cost sentence, and the sibling `insert` path recorded as its own note and question. The ruling followed B on the refusal (an
  edit `a\r\nb` → `a\nb` would otherwise rewrite identical bytes beside a success, the no-op already repaired for `haet_edit`),
  on revising `PD-TOOLS-016` rather than extending it (each identifier's case stays exhaustive), and on `insert`, which the code
  confirms writes LF lines into a CRLF file the same way.

**Rejected:** confirming the build (a silent format corruption on the only shipped platform, in the commonest edit shape, and
level-1 drift that later defeats `PD-TOOLS-016`'s own test); a tool-description sentence asking callers to send CRLF (a model
does not see an invisible `\r`, as `PD-TOOLS-014`'s first execution measured); deferring. **Costs kept on record:** an edit can
no longer write LF lines into a CRLF file (`overwrite` still can, and `haet_edit` has none); a mixed file keeps the old
behaviour; a model predicting its own bytes may meet one near miss; an implementation built from the specification alone writes
`new_string` as given; nothing measures it live, since the live-run fixtures are LF files on Linux.

**What a live run then shows.** Nothing new on Linux. On Windows, a CRLF file edited by an exact or replace-all edit keeps
uniform CRLF endings, and its success carries `new_string was written with the file's CRLF line endings.`

**Live run, 2026-10-20** (the Windows ARM64 session; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6, at `00957641`; `crlf` pack `2026-10-20T08-14-16-333Z`, [`live-00957641-windows-terminal-frictions-crlf-autopsy.md`](../../../architecture/live-runs/live-00957641-windows-terminal-frictions-crlf-autopsy.md)): on a Windows host the CRLF files kept every `\r` through a two-line `haet_edit` and a multi-line `replace_all`, each saying it wrote the file's CRLF endings.

<a id="oq-255"></a>

**OQ-255 — May a `replace` close a delegated item once its child has ended, and does its success say what it kept?**
*(REQ-TOOLS-146, `replace`'s protection of finished and active work, "a replace can neither silently retire the task the agent is
working on nor introduce a second IN_PROGRESS task"; REQ-TOOLS-145 as `PD-TOOLS-008` revision 2 bounds it, "REQ-TOOLS-146's
protection is otherwise unchanged"; `PD-TOOLS-006` revision 7, an admitted delegation marks its PENDING item IN_PROGRESS;
REQ-TOOLS-147; REQ-ORCH-029, REQ-ORCH-075 and PD-ORCH-015, the correction and re-queue an open plan meets; OQ-249 and OQ-163.
Raised 2026-10-13 from revision 7's first execution in [`directives.md`](../../../product/directives/pd-tools-006.md#pd-tools-006) ("`replace`
cannot complete an active item") and the `todo` tool's `replace` branch (`packages/agent-tools/src/tools/todo.ts`), recorded in
[`a-todo-replace-cannot-close-a-delegated-item-and-hides-the-restore.md`](../../../defects/fixed/a-todo-replace-cannot-close-a-delegated-item-and-hides-the-restore.md);
the consortium's question RC1. Raised as OQ-254 and renumbered OQ-255 before the landing, since origin/main took OQ-254 for the
level-1 CRLF edit meanwhile. **Ruled 2026-10-13.**)*

Since revision 7 the run sets a delegated item IN_PROGRESS at admission (`markDelegatedItem`,
`apps/desktop/src/run-host/tools.ts`) without the coordinator writing it. Once the child has ended, the item is held by no one,
and REQ-TOOLS-146 still restores it over whatever a `replace` sends: a coordinator that closes its plan with one `replace`
setting every item COMPLETED leaves the delegated items IN_PROGRESS, and the tool answers `Replaced the todo list: 1 phase, N
tasks.` with no word of the restore. The coordinator then answers with its plan open; PD-ORCH-015's correction asks only for
"each item's true state with the todo tool", so the same `replace` meets the same restore, and REQ-ORCH-075 re-queues a met
request to a fresh root under a `system` row saying the coordinator "answered with items of its plan not done". Revision 7's own
first execution met this on the scripted coordinator and changed the coordinator, which hides the case from the proofs while a
live model still meets it. No live run since revision 7 has measured how a model closes a delegated plan.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** a `replace` stores COMPLETED or
ABANDONED for an IN_PROGRESS task that a child of the list's owner records as its `todo_item` once no non-terminal child holds
it, and a task closed this way does not count as the active task against a mark in the same list. Every other protection stays:
finished work, held tasks and the agent's own active task are still restored. Every task a `replace` restores over a different
incoming state is named in its success observation, with the state kept, the reason, and `update` as the way to change it.
Recorded as [`PD-TOOLS-008`](../../../product/directives/pd-tools-008.md#pd-tools-008) **revision 3** (it narrows REQ-TOOLS-146 again and, for the
count, REQ-TOOLS-145 as revision 2 bounds it). Revision 7's first-execution reason "`replace` cannot complete an active item" is
kept beside this ruling as falsified for a served-and-ended item.

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended `PD-TOOLS-008` revision 3 letting a `replace` close any IN_PROGRESS task no
  non-terminal child holds, the agent's own included, with every task a `replace` keeps over a different state named in the
  success observation and why. The ruling took A's named-restore observation, since a success that hides an override is a false
  observation, and A's reading that the bound is checked on the resulting list, so a list that closes one task and starts
  another is a valid handoff. It did not take A's wider scope: releasing the agent's own unserved active task reopens ground
  OQ-163 and revision 1 settled, and no live evidence asks for it.
- **Advocate B (the system's lens)** recommended the same revision scoped to a task some child of the owner serves as its
  `todo_item` once no non-terminal child holds it (a second read through the run, the items served by terminal children
  included), with every restore named, its state, its reason and `update` as the remedy. The ruling followed B's scope: such a
  task fails every part of REQ-TOOLS-146's stated reason, and exists only because revision 7 added a state the agent never sets.
  It added what B left implicit: as built, an unheld served item is the protected active task, which would reject a list that
  closes it and marks another, so that same list is allowed to close it. Omitted tasks are named only when their state changed,
  which a kept omitted task never does.

**What a live run then shows.** When a coordinator closes its plan with one `replace` after its delegated children ended, the
delegated items are stored COMPLETED, the root reaches `succeeded` with no PD-ORCH-015 correction, and no "items not done"
`system` row appears. A `replace` that sends COMPLETED for an item a running child holds, or for the coordinator's own active
item, has its observation name that item, the state kept and the reason, and tell it to use `update`; the next `todo` call is
then an `update` for that item. The harness reads 0 served-and-ended items restored over a close.

*Built 2026-10-13 (fin37, `fin37-replace-closes-delegated`); its first execution is reported in `PD-TOOLS-008` revision 3.*
`TodoToolOptions.served`, `closes` and `keptReason` in `todoTool`'s `replace` (`packages/agent-tools/src/tools/todo.ts`);
`IterationChildren.servedTodoItems`, `Run.servedTodoItems` and `ToolPortContext.servedTodoItems` (`packages/engine`), passed by
`createToolPort` (`apps/desktop/src/run-host/tools.ts`); the scripted `donereplace` step
(`apps/desktop/src/run-host/scripted-client.ts`), shown in the built app by `pnpm mission-proof` item 1e; the live run's
`restoredOverClose` and `namedRestores` (`apps/desktop/scripts/lib/coordinator-todo.mjs`). Pinned by `tools/tools.test.ts`,
`run-host/tools.test.ts` and `children/children.test.ts`, each red on the code before. The note is repaired.

*Asked by the live run since 2026-10-13 (fin41, item N65):* no live prompt had asked a coordinator to close with a `replace`, and
at `0bc3eee` every close was an `update`, so the harness's "0 restored" read PASS with nothing measured
([`../../../defects/fixed/the-live-runs-closing-replace-check-passes-with-no-closing-replace.md`](../../../defects/fixed/the-live-runs-closing-replace-check-passes-with-no-closing-replace.md)).
The `edit` scenario's prompt now asks its coordinator to close the plan with ONE `replace` sending both tasks COMPLETED once both
children have reported; `heldItemReading` counts the closes it asked (`closes`), and a run with none prints a NOTE that the close
is unasked instead of the PASS. The next default run's `edit` session is the measure: the check names each close and the state
stored, which should be COMPLETED for both items, with no PD-ORCH-015 correction in its log.
