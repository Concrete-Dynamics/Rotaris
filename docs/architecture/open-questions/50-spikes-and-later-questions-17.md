# Open questions — Spikes, and the questions raised since (17 of 35)

Part 50 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-231, OQ-230, OQ-233, OQ-234.

<a id="oq-231"></a>

**OQ-231 — Does a `haet_edit` miss that matches at REQ-TOOLS-136 level 2 or 3 say so?** *(REQ-TOOLS-189, `haet_edit`
matches at level 1 only "because the anchoring hash exists precisely to make the edit exact", and "a failure to match reports
the path and directs the caller to read the file again"; its stale-hash clause, whose message "SHALL NOT quote the file's
current content"; REQ-TOOLS-136, the four match levels — level 2 trailing whitespace, level 3 a uniform indentation shift;
REQ-TOOLS-134, the read's line format and its 30,000-character output cap; REQ-SESSION-136, the `tool_error` issue a failed
call files. Raised 2026-10-07 from finding D5 of the final duress live run at `a68f121` (pack `2026-10-07T07-09-30-708Z` of
the live worktree, session `e6747bd0`, the self-hosted endpoint), and ruled the same day.)*

wave3 (`wave3-verify-all`) failed 6 of its 14 `haet_edit` calls with "old_string was not found exactly" (#290, #292, #297,
#304, #315, #321), and after each near miss ran `sed -n … | cat -A` to see the file's whitespace (#293, #298, #305, #322);
its continuation wave3b did the same after #382 (#380, #385, #386, `awk … indent=`). The autopsy priced it at 7 failed edits,
about 14 extra steps and about 63 s, all inside the two children the 1200 s ceiling cut off, and seven `tool_error` issues
(7 to 12 and 18). The build already knew: `matchEdit` (`packages/agent-tools/src/tools/files.ts`) runs every level, and the
miss branch discards a level-2 or level-3 match (`if (!m || m.level !== 1)`). Recorded as
[`haet-edit-answers-a-whitespace-only-miss-with-not-found-exactly.md`](../../defects/fixed/haet-edit-answers-a-whitespace-only-miss-with-not-found-exactly.md).

**Replayed before the build (fin32, 2026-10-07).** `docs/verification.md` was rebuilt from the pack's store — wave3's
`write_file` #289, then every successful `haet_edit` and code-intelligence `replace_content` in ordinal order, each
`haet_edit`'s `content_hash` checked equal to the rebuilt bytes' SHA-256 — and each miss's `old_string` run through the
build's own `matchEdit`. #292, #297, #304, #315, #321 and #382 each match **one window at level 3** (the file's lines one
space deeper or shallower than `old_string`'s; #304's first line one space shallower); #290 matches at level 4 only
(similarity 0.908: its first line named citations the file did not hold). None matched at level 2. So 6 of the 7 "not found
exactly" misses of the two children were a single level-3 window.

**What the build proceeds under.** REQ-TOOLS-189 as written: any miss at level 1 answers "old_string was not found exactly in
<path>. Read it again with haet_read.", whatever a lower level found.

**What a ruling decides.** Whether the edit applies at level 2 or 3 (as `write_file`'s does), whether the miss names the near
match and quotes it while the edit stays exact, or whether the reply stands as built.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../product/requests.md#r-072)):** when `haet_edit` (or `haet`)
holds a current hash, `replace_all` is false, and `old_string` misses at level 1 but matches exactly one window at REQ-TOOLS-136
level 2 or 3, the edit is refused and nothing is written. The reply names the path, the match level and the window's lines,
and says in words what differs: trailing whitespace or carriage returns on the named lines, or the leading prefix the file
carries in addition to or instead of `old_string`'s, quoted as JSON. It then states that the held content_hash is still
current, asks that `new_string` carry the file's whitespace, and quotes the window's text as one JSON string, up to 30,000
characters. When several windows match at level 2 or 3, the reply names the level and their lines and quotes nothing. Level 4,
no match, `replace_all` and the stale-hash refusal keep today's replies, and `haet_edit` still applies a level-1 match only.
Recorded as [`PD-TOOLS-014`](../../product/directives/pd-tools-014.md#pd-tools-014), which narrows REQ-TOOLS-189's failure-to-match clause.

**The two recommendations weighed.** *Advocate A (the user's lens)*: keep the edit refused; name the matched lines and the
level, say what differs in words, quote the lines in REQ-TOOLS-134's `N: line` format and state that the hash is current, as a
directive narrowing REQ-TOOLS-189's miss clause. *Advocate B (the system's lens)*: the same refusal and facts, the quote as one
JSON string, `replace_all` left unchanged, as a directive extending REQ-TOOLS-189 — and, inferred rather than measured, a CRLF
file on Windows (the only platform shipped, PD-STARTUP-001) where a multi-line `old_string` written with LF matches only at
level 2 and a re-read cannot show the `\r`. **The ruling followed both**: the position they share; from B the JSON quote (an
`N: line` quote shows neither a trailing space nor a `\r`), the CRLF case and `replace_all` unchanged; from A the 30,000-character
cap and the disposition Narrows, since in this case the reply no longer sends the caller to read again.

**The readings rejected, with their reasons.** *Applying the edit at level 2 or 3*: `applyMatch` writes `new_string` over a
level-3 window unshifted, and a caller whose `old_string` had the wrong indentation almost always wrote `new_string` from the
same belief, so the block would land at the wrong depth (a Markdown paragraph turned code block, a Python or YAML meaning
changed) beside a success; at level 2 it would drop trailing spaces (a Markdown hard break) and `\r` (mixed line endings);
and it undoes the exactness REQ-TOOLS-189 gives as the hash's whole reason. *Confirming the miss as built*: the build computes
the fact, discards it, and points the caller at a re-read that shows nothing new; the measured cost stays inside ceiling-bound
children. **Costs kept on record:** each near miss is still one failed call and one `tool_error` issue; a second
implementation built from the specification alone returns the plain miss; replies grow by up to the window's size.
**Built 2026-10-07 (fin32):** `nearMissMessage` and the level-3 `shifts` of `matchEdit`'s `EditMatch`
(`packages/agent-tools/src/tools/files.ts`); pinned by five cases under "PD-TOOLS-014" in
`packages/agent-tools/src/tools/tools.test.ts`, red on the code before, and one guarding the unchanged replies; the pack's six
level-3 misses replayed through the built tool each name their lines and apply when their quote is sent back on the same hash.
Every one of the six carried the same extra space in its `new_string` too, so `write_file`'s unshifted level-3 apply is raised
as OQ-233. The next default and duress live runs are the measurement (`live-run.mjs`'s near-miss NOTE). Finding D5 closes
with it.

**Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`:** **NOT REACHED**: no
`haet_edit` missed at level 2 or 3 in any pack (the harness NOTE each time). Evidence: [`live-552d346-default-autopsy.md`](../live-runs/live-552d346-default-autopsy.md), [`live-552d346-duress-autopsy.md`](../live-runs/live-552d346-duress-autopsy.md), [`live-0bc3eee-default-autopsy.md`](../live-runs/live-0bc3eee-default-autopsy.md). The row is in
[`first-executions.md`](../first-executions.md).

<a id="oq-230"></a>

**OQ-230 — Are the agents told what the product's own directories in the workspace are?** *(PD-TOOLS-012, the marker
directory among REQ-TOOLS-140's hard-coded ignore components; OQ-161's ruling (R-071), "the agents are not told that the
product wrote the exclude line"; OQ-215's ruling, "the agents' instructions are unchanged", and its remainder clause, "if that
remainder still has a measurable cost, it is raised as its own question"; REQ-TOOLS-140; REQ-MCP-099 and REQ-MCP-102, memories
that persist across runs; REQ-WORKSPACE-060, the always-active context units and their order; REQ-CONFIG-100, a configured
persona's prompt; REQ-CONFIG-013, the `.rotaris/` line in `.gitignore`. Raised 2026-10-07 from finding D4 of the final duress
live run at `a68f121` (pack `2026-10-07T07-09-30-708Z` of the live worktree, session `e6747bd0`, the self-hosted endpoint), and
ruled the same day.)*

The file tools are clean since PD-TOOLS-012: the six whole-tree `glob **/*` calls (#1, #24, #29, #73, #126, #135) and `**/.*`
(#65) list neither directory, and 0 file-tool calls name one. The remainder OQ-215 foresaw came through the terminal: b's
`ls -a` (#47), wave3's `ls -la`, `find . -type f` and four `git check-ignore` probes (#249, #250, #281, #283, #285, #286),
wave3b's `ls -a` of both (#354) — 21 calls and 32 rows, against 28 / 96 at `c2a9444` and 41 / 112 at `c2fdd6a`. It reached all
three things the user keeps: line 224 of the delivered `docs/verification.md` discusses the marker directory's files; the
answer's "Remains" (row 766) relays that `docs/overview.md` claims everything gitignored is absent while both are present; and
wave3's `edit_memory` #311 wrote into the project memory `todo-app/docs-pair` that both are present and "absence must be
checked with `ls`". The false absence claim was written by docs-writer c, which holds no terminal: the file tools hid the
directories, so it inferred absence. Recorded as
[`the-product-directories-reach-the-users-report-answer-and-memory-through-the-terminal.md`](../../defects/fixed/the-product-directories-reach-the-users-report-answer-and-memory-through-the-terminal.md).

**What the build proceeds under.** OQ-161's and OQ-215's rulings as built: the directories hidden from the file tools, shown
by a terminal, and no agent told what they are.

**What a ruling decides.** Whether every agent is told (a context unit), only the agents that can see them (the terminal's
description), whether the runtime's data moves out of the tree or its memories are filtered, or whether the remainder is
accepted.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../product/requests.md#r-072)):** every agent built for a session
receives one fixed product statement as its last always-active context unit, after REQ-WORKSPACE-060's four, whatever prompt
its persona carries. The statement names the workspace scope directory and the code-intelligence marker directory from their
single sources. It says four things: where present, they hold the application's own state; the application keeps them out of
version control with lines it writes itself (the marker's line only at a repository's top level); the file tools hide them and
a terminal shows them; and unless the task concerns them, they stay out of documents, reports, answers and project memories
and are not counted as changes. This is recorded as [`PD-TOOLS-012`](../../product/directives/pd-tools-012.md#pd-tools-012) revision 2, which
extends REQ-WORKSPACE-060 and revises the instructions clauses of OQ-161 (R-071) and OQ-215. The directory, the exclude line,
the tool descriptions and existing memories stay as built.

**The two recommendations weighed.** *Advocate A (the user's lens)*: tell every agent — one fixed product statement as the
last injected context unit, so a configured persona keeps it too, carrying the four points, named from the constants;
PD-TOOLS-012 revision 2. *Advocate B (the system's lens)*: tell the agents that can see them — one fixed sentence in the
terminal tool's description, "where present", built from the same two constants; PD-TOOLS-012 revision 2 extending
REQ-TOOLS-095; and revision 1's first execution owes this pack's result. **The ruling followed A**: the false absence claim
came from a docs-writer, which holds no terminal, so B's sentence would reach only the checker, whose task concerned the
directories; A's unit reaches the writer and the checker alike. B's objection that REQ-CONFIG-100 drops a prompt line does not
hold for context units, which `run.ts` and `orchestration.ts` append after whatever prompt the persona carries. From B it took
the "where present" wording and the report-back of revision 1's first execution. **Rejected:** moving the runtime's data out
of the tree or filtering memories (each reaches one sink and contradicts REQ-MCP-034, REQ-MCP-099 and REQ-MCP-102); accepting
the remainder (a memory that compounds from run to run). **Costs kept on record:** about 80 tokens per request; a fifth unit
for black-box conformance; possible priming; an agent possibly holding back a relevant fact; a poorer fit for a user who tracks
the marker directory; no change to memories already written. **Reopening:** if a delivered document, the answer or a memory
still carries either directory when the task does not concern them, the question reopens for a write-side measure.
**Built 2026-10-07 (fin32):** `PRODUCT_DIRECTORIES_UNIT` (`packages/config/src/product-directories.ts`), pushed last by
`SkillHost.contextUnits` (`apps/desktop/src/run-host/skills.ts`) on every call; pinned by
`packages/config/src/product-directories.test.ts`, seven cases in `apps/desktop/src/run-host/skills.test.ts` red on the code
before, an engine guard in `packages/engine/src/run/record.test.ts`, and `pnpm mcp-proof`'s launch 1 reading the built app's
prompt. The statement is 599 characters, nearer 150 tokens than the ruling's estimate of about 80 (*corrected by the bundle's
review, 2026-10-07:* it left out point (b)'s last words, that elsewhere version control may list the marker's directory as
untracked; with them it is 662 characters, nearer 165 tokens). Finding D4 closes with it;
the next default and duress live runs are the measurement.

**Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`:** the statement reached 144 of
144 agent requests at `552d346`'s default pack, 188 of 188 in its duress pack and 188 of 188 at `0bc3eee`; no delivered file
named either directory in any pack. At `0bc3eee` two coordinator briefs named both as tooling not to write about, the one
sign of priming. Read in [`PD-TOOLS-012`](../../product/directives/pd-tools-012.md#pd-tools-012)'s report-back. Evidence: [`live-552d346-default-autopsy.md`](../live-runs/live-552d346-default-autopsy.md), [`live-552d346-duress-autopsy.md`](../live-runs/live-552d346-duress-autopsy.md),
[`live-0bc3eee-default-autopsy.md`](../live-runs/live-0bc3eee-default-autopsy.md). The row is in [`first-executions.md`](../first-executions.md).

<a id="oq-233"></a>

**OQ-233 — When `write_file`'s edit matches at REQ-TOOLS-136 level 3, is `new_string` shifted by the same prefix?**
*(REQ-TOOLS-136, the four match levels and "a window match replaces whole lines", silent on whether the replacement takes
the shift that let `old_string` match; REQ-TOOLS-135, the edit's report, which names the level. Raised 2026-10-07 by the
R-072 consortium while ruling OQ-231 (finding D5 of the final duress live run at `a68f121`), which does not decide it, and
recorded by fin32. The number lies in the range the round assigned fin33 (OQ-233 onward); whichever of the two lands second
takes the next free number. Ruled 2026-10-13 under R-072.)*

`applyMatch` (`packages/agent-tools/src/tools/files.ts`) writes `new_string` over a level-3 window exactly as given, unshifted,
and reports "Match level: 3." beside the success; the case "level 3" in `packages/agent-tools/src/tools/tools.test.ts` pins it
with a `new_string` that happens to sit at the file's depth. A caller whose `old_string` had the wrong indentation usually
wrote `new_string` from the same belief: in OQ-231's replay of the `a68f121` duress pack, all six level-3 misses of `haet_edit`
carried one space more than the file in both strings. Through `write_file` such an edit would have succeeded with the block one
space off — in Markdown a list item or code block changed, in Python or YAML a meaning changed — beside a success. Shifting
`new_string` by the same prefix breaks the opposite case, the one the test pins, where the caller wrote `new_string` at the
file's depth. The specification fixes neither reading.

**What the build proceeds under.** The unshifted write, as built.

**What a ruling decides.** Whether a level-3 `write_file` edit shifts `new_string` by the window's prefix, writes it as given
(the build), or is refused with OQ-231's near-miss facts, as `haet_edit`'s now is.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../product/requests.md#r-072)):** when `write_file`'s edit matches one
window only at REQ-TOOLS-136 level 3, the indentation of `new_string`'s first visible line decides the outcome. If it equals
`old_string`'s, `new_string` takes the window's shift. If it equals the file's, `new_string` is written as given. If `new_string`
holds no visible character, it is written as given (a deletion). Every other case is refused and nothing is written, with the
near-miss facts of `PD-TOOLS-014`. The success reply says which of the two applies. Recorded as
[`PD-TOOLS-015`](../../product/directives/pd-tools-015.md#pd-tools-015), which narrows REQ-TOOLS-136 and extends REQ-TOOLS-135 for `write_file`
only; `haet_edit` and `PD-TOOLS-014` are unchanged, and no earlier ruling is revised (`PD-TOOLS-014` left `write_file` to this
question).

**The two recommendations weighed.** *Advocate A (the user's lens)*: shift `new_string` when its first non-blank line carries
`old_string`'s first-line indentation, say so after "Match level: 3.", and refuse every other level-3 case with OQ-231's
near-miss facts — `PD-TOOLS-015` narrowing REQ-TOOLS-136. *Advocate B (the system's lens)*: shift `new_string` under the same
test, and otherwise write it as given with a reply saying "written as given; verify its indentation" — `PD-TOOLS-015` extending
REQ-TOOLS-136, which is silent on `new_string`. **The ruling followed both**: the shift both proposed, which repairs the measured
case (6 of 6 level-3 misses in the `a68f121` pack carried the same extra space in both strings); from B the as-given write for a
`new_string` at the file's depth or with no visible character, which reads unambiguously and as built writes correctly (A would
have refused the case the "level 3" test pins); from A the refusal, but only where the tool cannot tell what the caller meant (a
`new_string` at a depth equal to neither string's, a shallower shift a visible line cannot take), where B's "written as given"
would be the same silent wrong result this question exists to remove. The three conditions are disjoint because level 3 requires
the two first-line indentations to differ. **Rejected:** confirming the build (a known silent mis-indentation beside a success);
shifting unconditionally (breaks the as-given case); refusing every level-3 match as `haet_edit` does (wastes a call in the
common case, and PD-TOOLS-014's first execution found the retry with the quote and the model's own deeper `new_string` would
still land one space deep). **Costs kept on record:** one failed call and one REQ-SESSION-136 `tool_error` per ambiguous level-3
edit; `write_file` and `haet_edit` differ at level 3; an implementation built from the specification alone writes unshifted; a
rare double shift when a caller deliberately indents by exactly the prefix. **Set aside, raised as its own question:** both
advocates read from the code that a CRLF file meets `write_file`'s level-2 apply with mixed line endings; this ruling does not
decide it ([OQ-246](52-spikes-and-later-questions-19.md#oq-246)).
**Built 2026-10-13 (fin35):** `shiftNewString` and `writeFileTool`'s level-3 branch (`packages/agent-tools/src/tools/files.ts`),
the refusal through `nearMissMessage` in `write_file`'s wording; pinned by nine cases under "PD-TOOLS-015" in
`packages/agent-tools/src/tools/tools.test.ts`, seven red on the code before; the `a68f121` pack's six level-3 misses replayed
through the built `write_file` over the rebuilt `docs/verification.md` each shifted to the file's depth (6 of 6). The first
execution is in place under the directive.

**Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`:** **NOT REACHED**: no
`write_file` edit matched at level 3 or said "shifted". Evidence: [`live-552d346-default-autopsy.md`](../live-runs/live-552d346-default-autopsy.md), [`live-552d346-duress-autopsy.md`](../live-runs/live-552d346-duress-autopsy.md), [`live-0bc3eee-default-autopsy.md`](../live-runs/live-0bc3eee-default-autopsy.md). The row is in [`first-executions.md`](../first-executions.md).

<a id="oq-234"></a>

**OQ-234 — Does a child cut off at its per-agent timeout name, where the person sees the failure, the Settings control that
sets the limit?** *(REQ-ORCH-088, the expiry path and its fixed error "Child timed out after <N>s"; REQ-CONFIG-113,
`runtime.child_timeout`; [`PD-CONFIG-003`](../../product/directives/pd-config-003.md#pd-config-003), the Per-agent timeout control, and its
revision 2's notice detail for the other timeout a user can set; [`PD-ORCH-004`](../../product/directives/pd-orch-004.md#pd-orch-004)
revisions 1 to 5, the cut-off statement and offer; REQ-MONITOR-040, -044, -052 and -069, what a tree row, a presented agent, the
inspector and an instance tab carry; REQ-MONITOR-041, -285 and -286; REQ-NOTIFY-092, -100 and -261; OQ-217's Outcome line;
OQ-218 and OQ-214, the rulings that kept the 1200 s default because a user can raise it. Raised 2026-10-07 from the final live
runs, by the ruling of finding D2 of the duress live run at `a68f121` (session `e6747bd0`), and recorded as the R-072
consortium's question CN1; ruled the same day.)*

In that run the testers `wave3-verify-all` (`bg_dcecf655`) and its continuation `wave3b-finish-verification` (`bg_98fa54d7`)
were each cut off at 1200 s while making progress (issues 14 and 19; the parent's calls `#248` and `#336` carry their
reports). Each row read `failed` and nothing else. "Child timed out after 1200s" reaches the parent model, the issue record and
the timeline, and no screen shows any of them; `AgentRecord` carries no end cause; the report artifact copies only the status
and the summary, so the one cause a person could read was the summariser's text (finding D9). The control that moves the limit
lives in Settings › Runtime, in minutes. Recorded as
[`a-child-cut-off-at-its-per-agent-timeout-reads-only-failed.md`](../../defects/fixed/a-child-cut-off-at-its-per-agent-timeout-reads-only-failed.md).
What the specification does not settle is whether a surface that shows the agent ends with the limit and a pointer to its
control, and which surfaces those are.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../product/requests.md#r-072)):** a delegated agent whose stored
report carries REQ-ORCH-088's timeout error shows that error wherever its failure appears. Its delegation-tree row and its
Mission-table row carry a "timed out" tag after the state. The inspector (directly under its meta line) and the agent's
persona-window instance tab (directly under its state) carry one line, worded once: "Cut off at its per-agent timeout of
<limit>[ while making progress]. Settings › Runtime › Per-agent timeout sets this limit for runs started from now." The limit,
its default, the 30 s landing, the single continuation, REQ-ORCH-088's error, PD-ORCH-004's statement and offer, OQ-217's
Outcome line, the issues, the timeline, the Library document and the notices all stay as built. This is
[`PD-CONFIG-003`](../../product/directives/pd-config-003.md#pd-config-003) revision 3, which extends REQ-MONITOR-040, REQ-MONITOR-044,
REQ-MONITOR-052 and REQ-MONITOR-069.

**The two recommendations weighed.** *Advocate A (the user's lens)* recommended that every surface showing the agent — the
Mission table row, the tree row, the inspector and the persona window — carry one sentence giving the limit in minutes, whether
the agent was still working, and the path Settings › Runtime › Delegation limits › Per-agent timeout, with an inspector button
that opens Settings › Runtime, recorded as PD-CONFIG-003's next revision. *Advocate B (the system's lens)* recommended one
code-written line in two places only — under the inspector's meta line and in the persona window's instance tab — naming the
control and its current value, with the rows, the engine's records, the timeline and the notices left as built. Both kept the
runner's texts unchanged, since REQ-ORCH-088 fixes the error's form, PD-ORCH-004 is the owner's ruling and models cannot open
Settings. **The ruling followed both**: from A the row tag, where `failed` is first seen (a terminal agent never shows the
stalled tag, so the timeout tag takes its slot), and the making-progress distinction read from the cut-off statement, so a
looping child's line does not suggest a longer limit would have helped; from B the line's two placements and no new action, so
REQ-MONITOR-052's actions stay as listed. It departs from both in writing the path in the shape revision 2 built
("Settings › Runtime › <control>"), so the two timeouts follow one rule, and in stating no current value, which Settings shows
one step away.

**Built 2026-10-07 (fin33).** The settle writes REQ-ORCH-088's error through `childTimedOutMessage` and `timedOutOf` reads it
back with the cut-off statement (`packages/engine/src/children/cut-off.ts`); `toAgentRecord` fills `AgentRecord.timedOut` for an
agent presented `failed`; `timeoutLine` (`packages/ui/src/agents.ts`) words the line once, its path built from the labels
Settings renders. Found while drawing it: the tag beside the state squeezed the sidebar row's persona onto two lines and
scrolled the Mission card sideways, so it takes a line of its own under the state; recorded in PD-CONFIG-003's first execution
of revision 3. Pinned by `cut-off.test.ts`, `activity.test.ts`, `children.test.ts` and `agent-timeout.test.ts` (red on
`b90d27f`); shown by `pnpm mission-proof` item 1d. Repaired note:
[`a-child-cut-off-at-its-per-agent-timeout-reads-only-failed.md`](../../defects/fixed/a-child-cut-off-at-its-per-agent-timeout-reads-only-failed.md).
**For the live run:** at D2's 45-minute duress launch, a child cut off reads "Cut off at its per-agent timeout of 45 minutes
while making progress. …" in the inspector and its persona window, and its rows carry the tag; the record carries
`timedOut: { limitSeconds: 2700, makingProgress: true }`. Not reached until a live run cuts a child off.
