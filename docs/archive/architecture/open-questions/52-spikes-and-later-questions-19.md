# Archived open questions — Spikes, and the questions raised since (19 of 35)

The ruled, closed, resolved and withdrawn entries of [part 52](../../../architecture/open-questions/52-spikes-and-later-questions-19.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-221"></a>

**OQ-221 — Which budget and which dropping rule govern a delegated child's attached artifacts, and what is the caller told?**
*(REQ-TOOLS-152, the attached-artifact section budgeted at 100,000 characters, "the first whose full body would carry the
section past the budget is dropped, and so is every attachment after it", "the observation warns how many were dropped for
size"; REQ-TOOLS-153, "any attachment warning"; REQ-TOOLS-154 item (4); REQ-LIBRARY-098, the `PRIOR AGENT CONTEXT (FULL)`
block "within a 48,000-character budget"; REQ-ORCH-032; domain 05's resolution 26 and limits inventory; `PD-SESSION-002`,
which counts the block's elisions. Raised 2026-10-07 from
[`the-attached-artifact-budget-is-48000-characters-where-req-tools-152-sets-100000-and-drops-every-later-one.md`](../../../defects/fixed/the-attached-artifact-budget-is-48000-characters-where-req-tools-152-sets-100000-and-drops-every-later-one.md),
recorded by fin28 while building `PD-SESSION-002`; the consortium's question AB1, numbered OQ-221 as the round assigned. Ruled
the same day.)*

Two requirements budget one block differently, and the build followed neither whole: it used REQ-LIBRARY-098's 48,000
(`FULL_CONTEXT_BUDGET`, `packages/engine/src/artifacts/context.ts`), skipped an overflowing body and kept trying the later ones,
where REQ-TOOLS-152 drops every attachment after the first that overflows, and its observation said "N artifacts were attached
to its context", counting the references that resolved at delegation before any budget applied
(`resolveAttachments`, `packages/engine/src/children/orchestration.ts`). A caller could be told of an artifact its child never
received, and no observation warned how many were dropped for size.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** the `PRIOR AGENT CONTEXT (FULL)`
block, the attached-artifact section of a delegated child's payload, is budgeted at REQ-TOOLS-152's 100,000 characters.
Attachments are taken in the caller's order and each body is carried whole or not at all. A body that would carry the section
past the budget is left out, and every later attachment is still tried. The delegate observation is computed at acceptance by
the same selection that assembles the block: it states how many attachments the child will be given, and names the ids left
out for size (citing the budget), the references that could not be resolved and the attachments whose document could not be
read. `PD-SESSION-002`'s count then reads the distinct agent-and-artifact pairs whose body did not fit the 100,000-character
section after the attachments carried before it; for every child whose payload was assembled, those are exactly the ids its
observation named as left out for size. Recorded as [`PD-TOOLS-006`](../../../product/directives/pd-tools-006.md#pd-tools-006) **revision 5**
(the ruling text names it revision 4; revision 4 is OQ-216's, landed in `e02a308`, and the round assigned this one revision 5),
which narrows REQ-TOOLS-152 and REQ-LIBRARY-098 to this rule: that directive holds REQ-TOOLS-152's one narrowing slot, and
revision 3 states that a narrowing of `delegate`'s fields lands there. REQ-TOOLS-153 keeps governing, since its "any attachment
warning" defers the warning's content to REQ-TOOLS-152, and REQ-TOOLS-154's order is unchanged. `PD-SESSION-002` gains a dated
cross-reference note and no revision.

**The two recommendations weighed.** *Advocate A (the user's lens)* recommended the 100,000 budget with the build's
skip-and-continue, carried by `PD-TOOLS-006` as a narrowing of REQ-TOOLS-152 and REQ-LIBRARY-098, and an observation counting
only what the child receives, naming each id left out for size, unresolved or unreadable. *Advocate B (the system's lens)*
recommended REQ-TOOLS-152 whole: 100,000 with the prefix rule (the first overflowing attachment and every one after it dropped),
an observation stating how many the child carries and how many were dropped for size, and a new `PD-LIBRARY-005` narrowing
REQ-LIBRARY-098's 48,000. The advocates agreed that the budget is 100,000, that the observation is a defect against faithful
requirements, and that the observation and the block must share one selection. **The ruling followed A** on the dropping rule:
resolution 26 gave its reasons as determinism, preserved order and never-partial bodies, and skip-and-continue keeps all three
while never displacing an earlier attachment, so the child always receives a superset of what the prefix rule gives; under the
prefix rule a short attachment withheld for its position costs the same characters plus a turn through `artifact_read`. B's
strongest point, that a bare count does not identify what is missing, is answered by naming the ids. B's point about the
narrowing slot was settled earlier: the generator admits one narrowing directive per requirement, and revision 3 places a
narrowing of `delegate`'s fields in `PD-TOOLS-006`. A's fallback of a `PD-LIBRARY-005` narrowing only REQ-LIBRARY-098 was
rejected, since it would leave REQ-TOOLS-152's prefix rule governing. From B the ruling adopted that the dropped-for-size count
is required content, and B's boundary and unreadable-in-the-middle tests.

*Built 2026-10-07 (fin29, `fin29-delegate-admission`); its first execution is reported in `PD-TOOLS-006` revision 5.*
`FULL_CONTEXT_BUDGET` is 100,000 and `fullContextBlock` counts the separator between sections (`packages/engine/src/artifacts/context.ts`);
`selectAttachments` is the one selection the observation at acceptance and the block at assembly read, and `AttachmentOutcome`
carries `given`, `elidedForSize`, `unresolved`, `unreadable` and `budget` (`packages/engine/src/children/orchestration.ts`,
`delegation.ts`); `attachmentWarnings` renders it (`packages/agent-tools/src/tools/delegation.ts`). Pinned by
`artifacts/artifacts.test.ts`, `children/children.test.ts` and `tools/delegation.test.ts`, red on the code before, and shown in the
built app by `pnpm artifacts-proof` launch 7. **What a live run then shows:** only when a `delegate` call uses `attach_artifacts`
(none of the four autopsied runs did): within 100,000 characters every attachment reaches the child whole and the observation says
how many; over it, the observation names the id left out for size with the budget, a later attachment that fits is still carried,
the child's block names the same id, the `context_selection` entry's `attached_elided` lists it and `summary.md`'s Mostly-elided
line counts it.

<a id="oq-245"></a>

**OQ-245 — Does a child's report list every file a cross-file code-intelligence EDIT call changed, or the path its arguments
name?** *(`PD-ORCH-004` revision 1's changed-paths clause, "the workspace paths the child's own file-writing calls changed", and
its report-back "The changed-paths reading falsified" (fin32), which took the argument path as a literal reading open for the
owner; REQ-ORCH-109, a report "cannot conceal files it failed to account for", and OQ-111's ruling; REQ-ORCH-108's edited files;
REQ-LIBRARY-088 and REQ-LIBRARY-090, the artifact's Edited Files; REQ-MCP-015, the EDIT tier of coding-agent, tester and
refactorer. Raised 2026-10-13 from PD-ORCH-004's report-back and ruled the same day; the number is the round's assigned one.)*

fin32 made the EDIT tier's calls file-writing calls and reads the path each changed from its arguments
(`codeIntelligenceEditPaths`). For the two cross-file tools the arguments name less than the call changes: a symbol rename is
listed by the declaring file alone, a whole-project cross-file replacement by nothing, and a directory-scoped one by the
directory. A child whose only writes are such calls is told to its parent as having changed no workspace paths, and the pass's
facts read "Edited files: (none)" — D1's falsehood for the two tools a refactorer exists to use. Recorded as
[`a-cross-file-code-intelligence-edit-is-reported-by-its-argument-path-alone.md`](../../../defects/fixed/a-cross-file-code-intelligence-edit-is-reported-by-its-argument-path-alone.md).

**What the build proceeds under.** fin32's literal reading: the argument path, none for a whole-project replacement.

**What a ruling decides.** Where the list of a cross-file call's files comes from — the arguments, the server's result text, or
the workspace observed around the call — and what the report says when that source cannot name them.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** a delegated child's report lists every
workspace file that a cross-file code-intelligence EDIT call (a symbol rename, a cross-file replacement) changed. The run host
learns these files by observing the files the call can reach, before and after the call, whatever the call returned. This
replaces fin32's literal reading (the argument path alone), which is falsified and kept beside its replacement in
`PD-ORCH-004`'s report-back. When the observation could not be completed, the report names what it does know, says that the call
may have changed files the record cannot name, and never says the child changed no workspace paths. No directive is minted:
`PD-ORCH-004` already asks for the paths the calls "changed", so this repairs a defect against that wording and REQ-ORCH-109.

**The two recommendations weighed.** *Advocate A (the user's lens)*: overturn the literal reading; observe the workspace the call
can reach (the project for a rename; the directory, or the project, for a cross-file replacement) before and after it, whether
it succeeds or errs, subtract other agents' recorded writes in the window, and carry the result as a product-owned field the
model never sees — a repair of PD-ORCH-004 and REQ-ORCH-109 with no new directive. *Advocate B (the system's lens)*: `PD-ORCH-004`
revision 6; read a cross-file replacement's files from its applied summary, list a rename by its declaring file with a counted
statement, and say plainly when the result names fewer files than the call may have changed; no worktree observation, since
siblings share the workspace and a terminal writes outside every count. **The ruling followed both**: from A the observation,
the only source that tells the truth in every case (the pinned runtime's rename returns a count and no file, and a cross-file
replacement writes file by file, so a failure part-way leaves files written under an error result, which parsing the result
would hide); from B the plain "may have changed files the record cannot name" statement when the observation was not completed,
and a proof that needs no language server. B's attribution concern is real and taken with A's mitigation; the bound that remains
is stated: a sibling's terminal write in the window can still be listed under this child, and REQ-ORCH-109 and `report.ts`'s own
policy prefer overstating to concealing. *(Written down 2026-10-13 by fin36, from fin35's review: the same bound covers a
sibling's own code-intelligence EDIT call landing in the window, since only the native tools are journaled.)* **Rejected:** confirming the literal reading (a known false "changed no workspace
paths" and a directory listed as a file); parsing the server's text (cannot name a rename's files, hides a partial failure,
couples the product to unpinned prose); deferral (a refactorer's rename is ordinary first-release use).
**Built 2026-10-13 (fin35):** the manifest's `scope`, `codeIntelligenceEdit`, `observeReach` and `WriteJournal`
(`packages/agent-tools/src/tools/observe.ts`) around the MCP executor, and `writeReadingOf` in the report and the cut-off;
pinned by cases in five test files, red on the code before, and `pnpm code-intel-proof`'s ninth launch (`child-across`, red on
the unrepaired build with `[]`, green with both files). The report-back is in `PD-ORCH-004`; the note is
[fixed](../../../defects/fixed/a-cross-file-code-intelligence-edit-is-reported-by-its-argument-path-alone.md).
*Measured for the rename 2026-10-13 (fin42, N59):* `pnpm code-intel-proof`'s tenth launch (`child-rename`) renames a TypeScript
function across two files through the language server after a reference search, and the child's report and artifact list exactly
both; its eleventh (`child-rename-cold`), the rename alone, lists exactly the one file it changed — the observation holds — and
finds the runtime's rename reaching the declaring file alone, recorded as
[`a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone`](../../../defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md)
and raised as [OQ-273](58-spikes-and-later-questions-25.md#oq-273). Not measured: a live run (the opt-in `rename` scenario, written). The report-back is in
`PD-ORCH-004`, in place.

**Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`:** **NOT REACHED**: 0
code-intelligence EDIT-tier calls in any pack; the duress tester held the tier and wrote through `write_file` and `haet_edit`.
Evidence: [`live-552d346-duress-autopsy.md`](../../../architecture/live-runs/live-552d346-duress-autopsy.md), [`live-552d346-default-autopsy.md`](../../../architecture/live-runs/live-552d346-default-autopsy.md), [`live-0bc3eee-default-autopsy.md`](../../../architecture/live-runs/live-0bc3eee-default-autopsy.md). The row is in [`first-executions.md`](../../../architecture/first-executions.md).

<a id="oq-246"></a>

**OQ-246 — When `write_file`'s edit matches at REQ-TOOLS-136 level 2, does the replacement keep the window's line endings
and trailing whitespace?** *(REQ-TOOLS-136, level 2 "exact after trailing whitespace is stripped from every line on both sides"
and "a window match replaces whole lines"; REQ-TOOLS-135, the success that reports the lines changed; `PD-STARTUP-001`, Windows
the only platform shipped; `PD-TOOLS-014`, `haet_edit`'s near miss, which quotes the `\r`. Raised 2026-10-13 by fin35 from the
case both advocates of OQ-233's ruling read from the code, which that ruling set aside. The number is the next after the round's
assigned OQ-245, taken by this plan; if another plan lands it first, this one takes the next free number. Ruled 2026-10-13
under R-072.)*

On a CRLF file a multi-line `old_string` written with `\n` alone matches only at level 2, and `applyMatch`
(`packages/agent-tools/src/tools/files.ts`) writes `new_string`'s `\n`-only lines over the window's `\r\n` lines: the file is
left with mixed line endings, and the success counts an unchanged line as changed because it lost its `\r`. The same apply drops
a replaced line's trailing spaces that `new_string` does not repeat (a Markdown hard break). Probed and recorded as
[`a-write-file-edit-at-match-level-2-on-a-crlf-file-writes-lf-lines-among-crlf-ones.md`](../../../defects/fixed/a-write-file-edit-at-match-level-2-on-a-crlf-file-writes-lf-lines-among-crlf-ones.md).
The specification fixes neither keeping the window's endings nor writing `new_string`'s.

**What the build proceeds under.** The apply as built: `new_string`'s lines written as given.

**What a ruling decides.** Whether a level-2 `write_file` edit carries each window line's line ending (and trailing whitespace)
into the replacement, writes `new_string` as given, or is refused with `PD-TOOLS-014`'s level-2 near-miss facts, as `haet_edit`'s
is.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** when a `write_file` edit
(`replace_all` false) matches one window at REQ-TOOLS-136 level 2, every line of `new_string` that pairs with an identical line of
`old_string` is written as the window's own line, byte for byte, its trailing whitespace and `\r` included. At levels 2, 3 and 4,
a window whose terminated lines all end in `\r` gives a `\r` to each other replacement line that a line break follows (a window
with no terminated line takes the reading from the file's other lines), and when such a `\r` is added the success says so in
one sentence, `new_string was written with the file's CRLF line endings.` Recorded as
[`PD-TOOLS-016`](../../../product/directives/pd-tools-016.md#pd-tools-016), which extends REQ-TOOLS-136 (its silence on what a window match's
replacement lines carry) and REQ-TOOLS-135 (the sentence); level 1, `replace_all`, several windows, `haet_edit` and `haet`
(`PD-TOOLS-014`) and `PD-TOOLS-015`'s level-3 decision and refusal are unchanged.

**The two recommendations weighed.** *Advocate A (the user's lens)*: `PD-TOOLS-016`; pair `new_string`'s lines with
`old_string`'s by an exact-text line LCS and write every paired line as the window's own; give a CRLF window's other lines `\r`
at levels 2 to 4; add the CRLF sentence to the success. *Advocate B (the system's lens)*: `PD-TOOLS-016`; the same line-ending
rule at levels 2 to 4, but pair only the leading and trailing runs of equal lines, because a second implementation could not
reproduce an LCS; leave the success unchanged. **The ruling followed both**: from both the line-ending rule at levels 2, 3 and 4
(they share `applyMatch`, so an LF `old_string` with a typo on a CRLF file writes the same mixed endings at level 4), and the
rejection of a level-2 refusal (the retry matches at level 1 and writes `new_string`'s LF lines anyway); from A the LCS pairing,
since B's runs leave an unchanged interior line (the Markdown hard break the defect note names) losing its trailing spaces and
counted as changed, and B's objection holds only while the tie-break goes unstated — `lcsChanges` in `diff.ts` already settles
it, and the directive writes the walk out; from A the success sentence, after `PD-TOOLS-015`'s precedent. Added by the ruling: a
window with no terminated line takes its reading from the file. **Rejected:** confirming as built (silent mixed line endings
and a success that counts an untouched line as changed, on the only platform shipped, `PD-STARTUP-001`); refusing level 2 as
`haet_edit` does; amending the record only; deferring. **Costs kept on record:** a window edit can no longer convert CRLF lines
to LF nor strip an unchanged line's trailing whitespace (`overwrite` or an exact level-1 `old_string` still can); where
`old_string` repeats a line, the walk fixes which copy's bytes a paired line takes; `write_file` and `haet_edit` still differ at
level 2; an implementation built from the specification alone writes `new_string` as given. Closes
[`a-write-file-edit-at-match-level-2-on-a-crlf-file-writes-lf-lines-among-crlf-ones`](../../../defects/fixed/a-write-file-edit-at-match-level-2-on-a-crlf-file-writes-lf-lines-among-crlf-ones.md)
once built.
**Built 2026-10-13 (fin36):** `carryWindow` in `writeFileTool`'s edit branch and `linePairs` in `diff.ts`; pinned by twelve
cases under "PD-TOOLS-016" in `packages/agent-tools/src/tools/tools.test.ts` (ten red on the code before) and `diff.test.ts`. The
level-1 sibling the ruling asked to probe writes `new_string`'s LF lines into a CRLF file through both tools; recorded as
[`a-level-1-edit-writes-new-strings-lf-lines-into-a-crlf-file`](../../../defects/fixed/a-level-1-edit-writes-new-strings-lf-lines-into-a-crlf-file.md),
not decided here (raised as [OQ-254](54-spikes-and-later-questions-21.md#oq-254)). The first execution is in place under the directive.

<a id="oq-247"></a>

**OQ-247 — Does REQ-STARTUP-147's list of the variables the domain reads name the platform-convention ones?** *(REQ-STARTUP-147,
"Environment variables read by this domain"; REQ-STARTUP-145, the platform-conventional per-user directories; REQ-STARTUP-161
and -164, the instance claim and its hand-over endpoint; `packages/platform/src/dirs.ts`, `packages/platform/src/instance.ts`.
Raised 2026-10-13 by fin34 from fin30's review of the platform paths, which left it as an optional finding. Numbered after
OQ-235 to OQ-239, which this plan's other bundles hold; raised as OQ-240 and renumbered OQ-247 at the landing, since
origin/main had skipped to OQ-245 and OQ-246 past a block another plan may still hold.)*

REQ-STARTUP-147 lists the environment variables this domain reads: `APPIMAGE`, `ROTARIS_BUNDLED`, `COMSPEC`, and the variable by
which an artifact form names the file a launch started from. The domain also reads `XDG_CONFIG_HOME` and `XDG_DATA_HOME` (Linux)
and `LOCALAPPDATA` (Windows) to find the per-user directories REQ-STARTUP-145 calls platform-conventional, and the instance claim
reads `XDG_RUNTIME_DIR` for where its hand-over socket goes (since 2026-09-19; `socketDirectoryCandidates`). None of the four is
in the list. fin30's builder justified them as platform convention under REQ-STARTUP-145; the list's own wording, "Environment
variables read by this domain", reads as exhaustive, and its next sentence bounds what any variable it covers may decide.

**What the build proceeds under.** The four are read, as REQ-STARTUP-145's platform convention: each only locates a directory,
none selects a workspace, enables diagnostics, touches the update check or permits a second instance, so REQ-STARTUP-147's
second sentence holds for them either way. **What a ruling decides.** Whether REQ-STARTUP-147's list is exhaustive — and then
whether it should name the platform-convention variables, or REQ-STARTUP-145 should say the convention's variables are read —
or whether it lists only the variables this product defines or depends on beyond the platform's own conventions.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** the four reads stay exactly as
built, and REQ-STARTUP-147 is amended in place, with no directive, so that its list names a class of **platform-convention
directory variables**: `XDG_CONFIG_HOME`, `XDG_DATA_HOME` and `XDG_RUNTIME_DIR` on Linux, and `LOCALAPPDATA` on Windows. Each
locates a directory and does nothing else; a value is used only when it names an absolute directory (fully qualified on
Windows), and otherwise the convention's default is taken; the list's second sentence binds every member. The home and
temporary directories the operating system reports are read through the platform's own interfaces, and the variables those
interfaces consult are outside the list. The amendment and its reason are recorded in
`docs/spec/resolutions/11-startup-distribution-updates.md`. Nothing a user meets changes.

**The two recommendations weighed.** *Advocate A (the user's lens)*: keep the reads and amend REQ-STARTUP-147 in place so its
list names the four as a class that locates a directory and decides nothing, which makes the list truly exhaustive for
REQ-STARTUP-111's acceptance. *Advocate B (the system's lens)*: keep the reads and record them in a new directive,
`PD-STARTUP-006`, extending REQ-STARTUP-145 and -147, which also accounts for the home and temporary-directory variables the
platform's own lookups consult. **The ruling followed both**: A's form, an amendment in place, because the corpus already depends
on these reads — REQ-CONFIG-001 spells the Windows path as `%LOCALAPPDATA%\rotaris\rotaris\` and REQ-UIBENCH-039 requires
`XDG_CONFIG_HOME` to be honoured — so an exhaustive REQ-STARTUP-147 disagreed with two live requirements, and a disagreement
within the corpus is an amendment (OQ-21's and OQ-227's precedent), not a directive, which records the owner wanting something
other than what the corpus states; and B's content, the stated class with the home and temporary lookups assigned explicitly,
since naming only the four would leave `HOME`/`USERPROFILE` and `TMPDIR`/`TEMP` unaccounted for (A's own first risk).
**Rejected:** B's directive (it would record behaviour nobody is changing as a departure); confirming without amending (a list
REQ-STARTUP-111's acceptance reads as closed that is not). Checked against the code: `dirs.ts`'s `xdgBaseDirectory` and
`localAppDataDirectory`, `preferences.ts`'s `resolvePreferenceRoot` and `instance.ts`'s `socketDirectoryFor` each take a value
only when it is absolute and otherwise the default, and none selects a workspace, touches the update check or permits a second
instance.
