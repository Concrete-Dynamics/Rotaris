# Archived open questions — Specification questions (7 of 27)

The ruled, closed, resolved and withdrawn entries of [part 12](../../../architecture/open-questions/12-specification-questions-7.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-63"></a>

**OQ-63 — What level threshold, if any, governs the application log?** *(REQ-TOOLS-171, REQ-HOOKS-102/138, REQ-SANDBOX-071, REQ-LIBRARY-035/047/124, with REQ-CONFIG-121 and REQ-SESSION-142; raised 2026-09-16 from run `a26918e8`'s launch log.)*

Reading one launch log for R-026's sixth finding: about eighty lines of one MCP server's handshake
validation stood in it, and the repair that landed an hour after that run (`15414d7`) moved a child's
stderr from `info` to `debug` and stopped the run host flattening `debug` into `info`. The lines are now
*distinguishable*, which is what the repair claimed. They are not *absent*, and nothing in the corpus
says whether they should be.

**There is no threshold in the main process at all.** `apps/desktop/src/main/index.ts` logs through one
closure — `const log = (m: string) => console.log(...)` — and the two places that forward a child
process's diagnostics into it (`run host ${e.level}: ${e.message}`, `workspace service ${e.level}:
${e.message}`) print the level as **text inside the message**. Nothing reads it. A `debug` line and an
`error` line reach the application log identically, and the only way to lose a line is not to send it.

**Every level requirement in the corpus governs the per-session log.** `REQ-CONFIG-121`'s
`session_log_level` and `REQ-SESSION-142`'s application of it name `<session_dir>/evidence/debug.log`
and nothing else. The application log **is** a named surface elsewhere — `REQ-TOOLS-171`,
`REQ-HOOKS-102/138`, `REQ-SANDBOX-071` and `REQ-LIBRARY-035/047/124` all say that something is written
to it — but every one of them fixes *what* is written, never at what level or subject to what filter.

**Measured, 2026-09-16.** The built app, driven against a throwaway workspace with one scripted run
(`pnpm app:drive`): 195 lines of application log, **141** of them `run host debug: mcp code_intelligence
stderr:` and **0** at `info`. The MCP repair did exactly what it claimed and the volume is unchanged — the
lines are distinguishable now, and nothing distinguishes on them.

**What the build proceeds under.** The application log keeps every level, as today. Nothing is filtered
in this pass, because choosing a threshold is choosing what a packaged build's diagnostics are worth
after an incident, and that is the owner's call rather than a detail of the MCP repair that surfaced it.
What the build assumes, and what a ruling would confirm or replace: that the honest interim is a log
that keeps everything, since a line not written cannot be recovered, and that the filtering question is
about **packaged** builds specifically, where nobody is watching a terminal.

**What a ruling decides.** Whether the application log takes a threshold at all; if it does, whether the
key is `session_log_level`'s (which would make one key govern two logs of different audiences) or its
own; and whether a packaged build suppresses `debug` with an environment switch to restore it — which is
the shape every other desktop product settles on and which no requirement here states.

> **Disposition, 2026-09-23 (R-048). RULED.** The paragraphs above stay as written; they are what the record
> said before the owner answered. The application log takes a threshold, **`info`** by default, with the
> level carried as a field on every line rather than as text inside it. It has **its own switch and no key**:
> the environment variable `ROTARIS_APP_LOG_LEVEL`, read once at start, restores `debug`, and
> `session_log_level` does not reach this log. Every line another requirement obliges into the application
> log is written at `info` or above. The disposition is **`PD-MONITOR-002`** (`docs/product/directives.md`),
> a directive with a `New` disposition, because the corpus is silent here and nothing it states is displaced.
> "What the build proceeds under" no longer holds once the directive is built; until then the log keeps
> every level, as that paragraph says. See `owner-decisions.md`, "OQ-63 — the application log's threshold,
> ruled".
>
> **Built 2026-09-27 (R-055).** "What the build proceeds under" no longer holds: the log records `info` and above by
> default (`apps/desktop/src/main/app-log.ts`), and the first execution is under `PD-MONITOR-002` in
> `docs/product/directives.md` and in `first-executions.md`.

<a id="oq-64"></a>

**OQ-64 — Does an instruction override suppress its base when the override is switched off?** *(REQ-WORKSPACE-042, narrowed by `PD-WORKSPACE-002`; REQ-WORKSPACE-043/047/048. Raised 2026-09-21 by building the per-file switches and the injection that consumes them.)*

REQ-WORKSPACE-042 was written when a workspace root held two files and the only question was which of
them reached a model: "given both `AGENTS.override.md` and `AGENTS.md` exist at the workspace root, only
the override file's content SHALL appear". `PD-WORKSPACE-002` adds a third state the sentence has no
word for — a file that exists and is **switched off** — and the sentence can be read two ways against it.

**Read against presence**, the override suppresses its base whether or not it is itself enabled, so a
user who switches the override off is given *neither* file: the base stays suppressed by a file nothing
reads, while the Instructions inventory still shows that base switched on. The screen would say a file
is on and the agent would not have it.

**Read against the enabled set**, the override suppresses its base only while the override is enabled,
so switching the override off returns the base to the merge. Every row the inventory shows as on then
contributes, and the switch means exactly what it says — at the cost of one file's switch changing
which *other* file an agent is given, which is a second-order effect no requirement states.

**What the build proceeds under.** The second reading. `enabledInstructionFiles` computes suppression
over the enabled set, because a screen that reports a file as on while the agent is not given it is the
worse of the two failures and the harder one for a user to diagnose. The decision is one line and is
marked in place.

**What a ruling decides.** Which reading governs; and, if the first, whether the inventory gains a
third row state — *suppressed* — so that the screen stops disagreeing with the merge.

> **Disposition, 2026-09-27 (R-052). RULED as built.** The second reading governs: an override suppresses
> its base only while the override is itself switched on, and the inventory gains no third row state.
> `PD-WORKSPACE-002` states the ruling in its injection paragraph. See `owner-decisions.md`, "OQ-64 — an
> instruction override suppresses its base only while it is switched on, ruled".

<a id="oq-65"></a>

**OQ-65 — Do the instruction-file switches reach the retrospective, or only what agents are given?** *(`PD-LIBRARY-002` over REQ-WORKSPACE-041, since narrowed by `PD-WORKSPACE-002`; REQ-WORKSPACE-048. Raised 2026-09-22 by repairing [`the-retrospective-reads-instruction-files-the-user-switched-off.md`](../../../defects/fixed/the-retrospective-reads-instruction-files-the-user-switched-off.md).)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** confirmed as built: the instruction-file switches reach the retrospective as well as the agents, which reads exactly the set injection reads, master switch and per-file switches included. The retrospective does not state that a file was present and withheld.

*Added 2026-10-13 ([OQ-235](51-spikes-and-later-questions-18.md#oq-235), ruled under [R-072](../../../product/requests.md#r-072)):* this ruling governs the
switches; reach is the workspace root, per `PD-LIBRARY-002`'s reach clause and its revision 2. "Exactly the set injection
reads" now reads "the workspace-root part of the set injection reads": no file under the global, home-relative or
machine-wide bases reaches the retrospective.

`PD-LIBRARY-002` let the retrospective read the instruction files a workspace holds, and pointed it at one
rule for finding them: REQ-WORKSPACE-041's discovery, "the two names, the workspace root, nothing else —
governs that read unchanged". `PD-WORKSPACE-002` has since narrowed that requirement, so the rule the
retrospective was pointed at says something else now: four names at the workspace root, two at each of five
further bases, and a per-file on/off switch over all of them under REQ-WORKSPACE-048's master switch.

**The discovery half is not the question.** `PD-LIBRARY-002` named the rule rather than copying it, so when
the rule widened the read widened with it. The code had frozen the old sentence as a two-name constant, and
that is a plain defect against the directive that cites it.

**The switch half is the question.** `PD-WORKSPACE-002` states its switches as governing what agents are
*given*. A retrospective is not an agent being given context; it is an analysis of the workspace, and an
analysis that may not read a file the workspace contains is a different kind of restriction from one that
decides what an agent is told. Read narrowly, the switches govern injection alone and the retrospective
reads everything present. Read widely, a file the product has been told not to use is not evidence either.

**What the build proceeds under.** The wide reading: the retrospective consumes exactly the set injection
consumes, master switch and per-file switches included. Two reasons, and the second is the one that decides
it. A user switches a file off to take it out of the product's working material, and would not expect the
same product to quote it back at them as evidence. And the retrospective's own output can be an
`agents_md_update` proposal — a proposed EDIT to a file the product has been told not to use, which is a
worse outcome than a thinner analysis. The set is computed by the run host, which owns the policy, and
handed to the engine, which owns neither.

**What a ruling decides.** Whether an analysis reads what injection may not; and, if not, whether the
retrospective should say in its own output that a file was present and withheld, so a user reading a thin
retrospective can tell it apart from an empty workspace.

<a id="oq-66"></a>

**OQ-66 — How does `delegate` name the child a continuation continues?** *(`PD-ORCH-004` over REQ-ORCH-088; REQ-TOOLS-152, with REQ-TOOLS-153/154, none of which the directive names. Raised 2026-09-27 by building `PD-ORCH-004` under [R-057](../../../product/requests.md#r-057).)*

`PD-ORCH-004` lets a parent delegate a cut-off child's remaining work "to a new child as a continuation of this
one", and requires the continuation to carry that relationship in its record. It does not say how the parent names
the child it continues, and it narrows REQ-ORCH-088 alone. REQ-TOOLS-152 lists `delegate`'s fields and states that it,
REQ-TOOLS-153 and REQ-TOOLS-154 are "the whole of the `delegate` contract". Under `docs/product/README.md` a requirement
no directive names governs exactly as it did, so the build departs from a requirement nothing narrowed.

**None of the existing fields fits.** `session_id` means "reuse a previous delegation's session for a retry or a
follow-up": a resumed session, which the directive rules out ("never an automatic resume"; a *new* child). And
REQ-NOTIFY-112 holds that the timed-out child is not recovery-eligible. `inherited_context` carries a completed
sibling's report into the child without ordering, and ignores an id naming a failed task, which is exactly what a
timed-out child is. So reusing it would carry nothing and record no relationship. `depends_on` waits for the upstream
task to finish *successfully*, which a cut-off child never does.

**What the build proceeds under.** One new optional field, `continuation_of`, the task id of the child continued. The
name is the directive's own word. `delegate` refuses it with status `rejected` and no record, beside REQ-TOOLS-152's
other refusals, unless it names the caller's own direct child whose stored report made the offer and which no child
of the session already continues. The relationship is stored in `children.continuation_of` (store v22). REQ-TOOLS-152
is not edited.

**What a ruling decides.** Either amend `PD-ORCH-004` to name REQ-TOOLS-152 as well, with `continuation_of` as the
field it adds (the shape `PD-TOOLS-006` took for `write_scope`, whose requirement carries a back-pointer), or choose
another way for the parent to say what it continues. Two limits of the reading built belong to the same ruling. The
caller's "own child" is the same ownership test `background_output` uses (REQ-TOOLS-155), and each iteration mints a new
root task. So a later iteration's root, or the next run after a stop, is refused a continuation of an earlier
iteration's child, and the offer's text does not say so. And nothing but the task id carries over: the continuation's
payload is assembled as any child's is.

**Ruled 2026-09-27 — by [`PD-ORCH-004`](../../../product/directives/pd-orch-004.md#pd-orch-004) revision 2, [R-058](../../../product/requests.md#r-058).**
The owner took the recommendation: the directive now states `continuation_of` and its refusals, and extends REQ-TOOLS-152,
which carries the back-pointer. *Relabelled 2026-10-13 by [OQ-237](51-spikes-and-later-questions-18.md#oq-237) (GV1): `PD-ORCH-004` narrows REQ-TOOLS-152, whose "whole
of the `delegate` contract" its field widens, the verb `PD-TOOLS-006` took for `write_scope`; R-058 recorded Extends because
"the symbol artifact holds one narrowing directive per requirement", which no longer holds. The field and its refusals are
unchanged.* The two limits named above are not settled by this ruling. Which agent may take up an
offer after the iteration that raised it has ended belongs to the run-continuation policy the same request opened, and
until that is ruled the build keeps the same-iteration reading.

**Ruled 2026-09-29 — OQ-66's open part, `session_id`, by [`PD-ORCH-005`](../../../product/directives/pd-orch-005.md#pd-orch-005) revision 5
(clause 22) and [`PD-TOOLS-006`](../../../product/directives/pd-tools-006.md#pd-tools-006) revision 3, [R-067](../../../product/requests.md#r-067).** The owner
took the recommendation. `session_id` (REQ-TOOLS-152) names, by task id, a settled child of the caller: a direct child,
by REQ-TOOLS-155's ownership test, that has reached a terminal state. A child its `child_timeout` cut off is not one; it
keeps `continuation_of` (`PD-ORCH-004`), and a `session_id` naming it is refused with a reason naming that field. The
follow-up resumes the named child from its recorded conversation (`PD-ORCH-005`'s record) under its own task id, with
the call's `task` appended as its next user message, and the child ends and reports again as any child does. A
`session_id` that names no such child is refused like REQ-TOOLS-152's other refusals: status `rejected`, no record, no
task id. REQ-TOOLS-152 is narrowed by `PD-TOOLS-006`, the one directive that narrows it, and its back-pointer is amended
in place; REQ-MONITOR-300's back-pointer from `PD-ORCH-005` names the one exit from a terminal state a follow-up takes.
Nothing is built by this ruling: until
[`delegate-drops-session-id-and-suppress-auto-context.md`](../../../defects/fixed/delegate-drops-session-id-and-suppress-auto-context.md)
is repaired the field is accepted and dropped. The first limit named above, which agent may take up an offer after its
iteration ended, was ruled by `PD-ORCH-004` revision 3; `session_id` keeps the direct-child test, so a later
iteration's root cannot follow up an earlier iteration's child.

**Built 2026-09-29 under [R-067](../../../product/requests.md#r-067).** `delegate` forwards `session_id`, and a follow-up resumes
the named child as ruled. Its refusals are those ruled above. What the ruling left unstated, and the readings built, are
OQ-131. The defect note is repaired:
[`delegate-drops-session-id-and-suppress-auto-context.md`](../../../defects/fixed/delegate-drops-session-id-and-suppress-auto-context.md).

<a id="oq-67"></a>

**OQ-67 — Where does the `/skills` listing go when there is no transcript to write it into?** *(REQ-CHAT-162 with REQ-WORKSPACE-067 and REQ-WORKSPACE-151; OQ-58. Raised 2026-09-27 by building the listing, `first-release-plan.md` §2.2; raised as OQ-66 and renumbered OQ-67 when it reached `main`, where OQ-66 had been taken by the question `PD-ORCH-004` revision 2 rules.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** every reading built is confirmed: (a) the Skills tab's table is the listing's reach from Settings and the tab keeps its two header actions; (b) `/skills` with no followed session, or one not loaded in the run host, is refused with `SKILL_LISTING_NO_SESSION`'s words; (c) every discovered skill is listed, hidden and auto-only ones included and while skills are switched off; (d) `/skills` is always listed as available and states its refusal once invoked; (e) a description is cut at 120 code points after whitespace runs collapse; (f) both fixed commands carry the `skill` badge; and (g) the listing row is evidence the improvement analyst may read, hidden skills included.

REQ-CHAT-162 makes the listing "a single system row" in the transcript and requires that "a system row a skill
command writes MUST be saved with the session". Two routes to the capability have no session transcript to
write into, and the requirement does not say what either does.

**(a) The settings surface.** "Both capabilities MUST also be reachable from the settings surface that manages
skills, so neither depends on the user knowing a command name." For *loading* the surface has its own route —
REQ-WORKSPACE-151's "Load skill file…", which loads into the session exactly as `/skill <path>` does. For
*listing* it does not: the Settings Skills tab is not a transcript, and REQ-WORKSPACE-067 fixes that tab's
contents, including "two header actions, 'Rescan skills' … and 'Load skill file…'". A third action writing the
row into the followed session would contradict that count; no action leaves the listing reachable from Settings
only in the sense that the tab's table shows every fact the listing carries — Skill (the normalized name),
Source (the scope), Path, Trigger and Description, unclipped — without the count stated as a sentence and without
writing a row.

**(b) A window following no session.** OQ-58 already records that "the current session" can have no referent
when a gesture is made from a window showing none, and answers it for session *state* with a pending bucket the
next session adopts. A transcript row cannot wait in a bucket: it is a row of a session or it is not saved.

**What the build proceeds under.** (a) The tab's table is read as the listing capability's reach from the
settings surface, and nothing is added to the tab: the requirement that fixes the tab's actions is specific and
the one that asks for reachability is general, and the facts a user needs are all on the tab. (b) `/skills` from
a window following no session fails, and says why — "Open or start a session first: /skills writes its listing
into that session's transcript." (`SKILL_LISTING_NO_SESSION`) — rather than creating a session nobody asked for
or drawing a row nothing saves. A followed session that is not loaded in the run host is refused the same way
rather than written to under the store alone, which would skip its event record, its projection and its lock.

**What a ruling decides.** (a) Whether the Skills tab gains a third header action that lists the skills into the
followed session's transcript — amending REQ-WORKSPACE-067's two to three — or REQ-CHAT-162's reachability clause
is read as met by the table; and if the latter, whether the tab should state the count. (b) Whether `/skills`
with no session refuses (built), starts a session, or lists into the next session created in the window.

**Readings the listing was also built under, named here so a ruling can reach them** *(added 2026-09-27, gate
round 1 of the same change; each was stated only in a code comment or the plan's note before)*:

- **(c) Which skills are listed.** Every discovered skill — auto-only ones, ones whose load mode is `off`
  ("hidden"), and all of them while `skills.enabled` is off. REQ-CHAT-162 lists "the discovered skills" and the
  Settings table lists the same set; `/skill <path>` is not refused while skills are off either. The contrary
  reading: the requirement's last sentence calls these "skill commands", and REQ-CHAT-034 fails a skill command
  with "Skills are disabled. Enable them in Settings." while the switch is off. *(`writeSkillListing`,
  `apps/desktop/src/run-host/skills.ts`.)*
- **(d) When a refusal is stated.** `/skills` is always listed as available and states the no-session refusal of
  (b) only once invoked. REQ-CHAT-025 and REQ-CHAT-029/030 already allow "listed but unavailable, with the reason"
  before invocation; the composer's context carries no "a session is followed" fact today, so the build did not
  add one. *(`skillsListCommand`, `packages/ui/src/slash/skills.ts`.)*
- **(e) How the 120 is counted.** At most 120 characters, the last of them the ellipsis where the text was cut,
  after whitespace runs collapse to one space — REQ-CHAT-068's `compactTask` reading of the same kind of clause.
  Counted in code points, so a cut can separate a combining mark or a joined emoji from its base.
  *(`clipSkillDescription`, `packages/contracts/src/skills.ts`.)*
- **(f) Which badge the two fixed commands carry.** `skill`, as ADR-0063 chose for `/skill`; REQ-CHAT-025 names the
  set and does not say. `slash-proof` asserts the other reading, and has been red on it since ADR-0063
  (`../../../defects/fixed/slash-proof-expects-every-built-in-to-carry-the-action-badge.md`).
- **(g) Who else reads the row.** The row is a system row, and the improvement analyst takes every recent row's
  text as evidence (`packages/engine/src/improvements/capture.ts`), so a listing carries the names, descriptions
  and paths of skills set to "hidden" to that model. The agent path does not (it keeps user and agent rows only).
  Whether "hidden" (REQ-WORKSPACE-062) reaches that far is not stated; nothing withholds them today.

<a id="oq-68"></a>

**OQ-68 — What does REQ-WORKSPACE-049's "up to 20 context files" measure, when discovery can reach fourteen?** *(REQ-WORKSPACE-049 with REQ-WORKSPACE-041/042, both narrowed by `PD-WORKSPACE-002`; first-release-plan §3.2. Raised 2026-09-27 by building the fixture "at exactly that bound"; raised as OQ-66 and renumbered OQ-68 when it reached `main`, the `/skills` listing's OQ-67 having reached it first.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the count is restated as every instruction file discovery can reach — fourteen files where the platform has an `/etc` hierarchy, twelve on Windows — and the fixture at the bound fills them with 1 MiB, as `pnpm injection-proof` does. [`PD-WORKSPACE-004`](../../../product/directives/pd-workspace-004.md#pd-workspace-004) narrows REQ-WORKSPACE-049. No discovery rule that reaches twenty is added.

REQ-WORKSPACE-049 states its 200 ms figure over "a workspace holding up to 20 context files totalling 1 MiB". No
discovery rule the record has held can present twenty. REQ-WORKSPACE-041 as written read one file. `PD-WORKSPACE-002`
names four at the workspace root and two at each of five further bases: **fourteen** on a platform with an `/etc`
hierarchy and **twelve** on Windows, which has no machine-wide base. The merge reads fewer still. An override that
is on suppresses its base, and one that is off is not read, so each workspace pair gives the merge one file: **twelve**
read where there is an `/etc` hierarchy, **ten** on Windows. The byte half of the bound is reachable. The count half
is not, on any platform.

"Up to" makes twenty a ceiling, so a fourteen-file fixture is inside the reference conditions, and a reading taken
over one is a conforming reading. Two things are left undecided. The first is what the plan's "a fixture at exactly
that bound" means when the bound's count cannot be built. The second is whether twenty was meant to be reachable: a
scheme with ancestors or several levels would reach it, and `PD-WORKSPACE-002` expressly declines one.

**What the build proceeds under.** The count is read as the ceiling it says it is. The fixture fills every slot
discovery can reach (fourteen here), with exactly 1,048,576 bytes across them. The two workspace bases that the on
overrides suppress hold one line each, so the bytes the merge actually reads are as close to 1 MiB as the rule allows
(`pnpm injection-proof`'s latency section). A Windows reading on the same fixture has twelve files and reads ten.

**What a ruling decides.** Whether REQ-WORKSPACE-049's count is restated as the reachable maximum (an amendment
naming fourteen and twelve, or "every instruction file discovery can reach"), or left as a ceiling that nothing
reaches. And if the count is ever to be reached, what discovery rule reaches it.

<a id="oq-69"></a>

**OQ-69 — Does a default entry shipped switched off count as one the default configuration "launches"?** *(REQ-STARTUP-059 with REQ-MCP-095 and REQ-STARTUP-064; REQ-MCP-010, REQ-CONFIG-181. Raised 2026-09-27 by building the version guard, first-release plan §4.1; raised as OQ-66 and renumbered OQ-69 when it reached `main` after the `/skills` listing's OQ-67 and the injection proof's OQ-68.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** confirmed as built: a default entry shipped `enabled: false` counts as one the default configuration launches, so REQ-STARTUP-059's pin agreement covers `browser`, and `tools/release-guard/src/pins.ts` keeps checking it.

REQ-STARTUP-059 has the setup manifest pin "every package that the built-in default tool-server configuration of that
same build launches through `npx` or `uvx`". The one such default is `browser`, `npx -y @playwright/mcp@0.0.80
--headless`, and it ships `enabled: false`. Two requirements read the word "launches" in opposite ways against it.
REQ-STARTUP-064 gives an `enabled: false` entry no warm-up step "because nothing will ever launch it". On that reading
the switched-off default launches nothing, so the pin guard has nothing to check on this build and passes with no
manifest at all. REQ-MCP-095 instead requires the release-pinned setup manifest to carry the `browser` package's
version string character for character, with the build checking the two against each other, whatever the entry's
switch says.

**What the build proceeds under.** The entry counts. The shipped `enabled: false` is the entry's default state and not
its launch, a user who switches it on launches exactly that specification, and REQ-MCP-095 already requires this pin.
The stricter reading can only stop a release the looser one would let through, never the reverse.
`tools/release-guard/src/pins.ts` (`defaultLaunches`) says so in place.

**What a ruling decides.** Whether REQ-STARTUP-059's pin agreement covers every default entry whose launch goes through
a runner, or only those enabled by default. If the second, the guard stops checking `browser` under REQ-STARTUP-059,
and REQ-MCP-095's own cross-check still requires the pin.

<a id="oq-70"></a>

**OQ-70 — Are the numbers in a release tag canonical decimals?** *(REQ-STARTUP-027, REQ-STARTUP-029, REQ-STARTUP-031, REQ-STARTUP-109. Raised 2026-09-27 by building the version guard, first-release plan §4.1; raised as OQ-67 and renumbered OQ-70 when it reached `main` after the `/skills` listing's OQ-67 and the injection proof's OQ-68.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** confirmed as built: a release tag's numbers are canonical decimals with no leading zero, in the three places and in the suffix number, and `v01.2.3` and `v1.2.3rc01` are refused with REQ-STARTUP-027's message (`parseReleaseTag`).

REQ-STARTUP-027 fixes the shape `v<major>.<minor>.<patch>` with an optional PEP 440 suffix, and its counter-examples
say nothing about leading zeros. PEP 440 permits them and normalises them away, so `v01.2.3` would be the same release
as `v1.2.3`. This product never normalises the text: the guard compares the tag's version with the declared one as text,
and every artifact name renders it as text (REQ-STARTUP-031). A permitted `v01.2.3` would therefore be a second spelling
of one numeric tuple, carrying a second set of artifact names. REQ-STARTUP-109 would order the two as equal.

**What the build proceeds under.** The numbers are canonical decimals, with no leading zero, in all three places and
in the suffix number. `v01.2.3` and `v1.2.3rc01` are refused with REQ-STARTUP-027's message (`tools/release-naming`,
`parseReleaseTag`). `v0.1.0` and every tag the plan names parse unchanged.

**What a ruling decides.** Whether a leading zero is outside the grammar, which is the reading built, or inside it and
normalised. If it is normalised, the grammar must also say which spelling the artifact names and the declared version
carry.
