# Archived open questions — Specification questions (9 of 27)

The ruled, closed, resolved and withdrawn entries of [part 14](../../../architecture/open-questions/14-specification-questions-9.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-78"></a>

**OQ-78 — Does an approval already queued when the first wait expires still get its own full wait?**
*(`PD-TOOLS-005`, REQ-TOOLS-052, REQ-TOOLS-055. Raised 2026-09-28 by the verification of the `PD-TOOLS-005` build under
[R-062](../../../product/requests.md#r-062). Open until 2026-10-06; ruled that day by the owner, and built.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** marking the user away also ends the waits already
outstanding in that run — shown, or queued unshown behind another dialog — each resolved under
`runtime.headless_approval_policy` with the directive's reason and its dialog withdrawn, so one unanswered approval costs one
timeout; read so that the question tool's own approval wait (OQ-77) and a wait the quit holds (`PD-ORCH-005` clause 9) are
not ended. Minted as [`PD-TOOLS-005`](../../../product/directives/pd-tools-005.md#pd-tools-005) revision 2, and built the same day
(`UserPresence.onAway`, `PendingApprovals.endAway`, the `away` outcome; plan fin21). The reading below is kept as the build
proceeded under it until then.

The directive says every further approval that would prompt in the run resolves at once once one wait has ended by
timeout. The gate consults the away state when it brokers an ask, before a wait exists. An ask brokered *before* the
first wait expired already has its wait running: it was put to the user (published, and shown or queued behind the
first dialog in main), so the build does not cut it short, and its own expiry is not a second transition. With several
agents asking concurrently, each such ask can still cost a full `runtime.approval_timeout_seconds` after the first —
the cost the directive exists to remove, reduced from one per ask to one per ask *already outstanding* at the first
expiry.

**What the build proceeds under.** The reading stated in the directive's first-execution note: a wait already running
when the user was marked away runs to its own end; only asks brokered afterwards resolve at once.

**What a ruling decides.** Whether marking the user away also ends the waits already outstanding in that run (each
resolved under `runtime.headless_approval_policy` with the directive's reason, its dialog withdrawn), or whether a
request that has reached the user keeps its own full wait. Recommendation: end the outstanding waits too, with the
directive's reason — a request queued behind an unanswered dialog was never seen, and the directive's intent is that
one unanswered approval costs one timeout.

<a id="oq-79"></a>

**OQ-79 — Is a `SKILL.md` that cannot be decoded as UTF-8 an "unreadable file"?** *(REQ-WORKSPACE-053, with REQ-WORKSPACE-045 and REQ-WORKSPACE-044. Raised 2026-09-28 by repairing REQ-WORKSPACE-045's decoding half, R-062. Raised as OQ-76 on its branch; renumbered OQ-79 at the merge, because OQ-76 to OQ-78 were already on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** confirmed as built: a `SKILL.md` that cannot be decoded as UTF-8 is an unreadable file, skipped with `unreadable file: <the decoder's error>` and logged, and a hand-loaded one fails with REQ-WORKSPACE-057's message and the decoder's reason.

REQ-WORKSPACE-045 names two ways a context file can be unreadable — "I/O or decoding error" — and REQ-WORKSPACE-044
measures every limit "as UTF-8 bytes", so for an instruction file the encoding is settled: it is UTF-8, and a file that is
not is skipped with a warning. REQ-WORKSPACE-053 lists "unreadable file" among the reasons a `SKILL.md` is skipped, but
names no encoding for the file, and the format it does name — YAML frontmatter — is one whose own specification admits
UTF-16 and UTF-32 as well as UTF-8. Nothing in the corpus says whether a skill file saved in one of those, or holding a
byte sequence no UTF-8 decoder accepts, is "unreadable" (skipped with a logged reason) or is to be read leniently, each
undecodable sequence standing as U+FFFD, and parsed.

The question is live because one port serves both walks. `NODE_DISCOVERY_PORTS.readFile` reads instruction files for
REQ-WORKSPACE-045's merge, `SKILL.md` files for REQ-WORKSPACE-053's walk, a force-loaded body for REQ-WORKSPACE-062,
the disable manifest for REQ-WORKSPACE-052 and a `SKILL.md` loaded by hand for REQ-WORKSPACE-057/151, and until 2026-09-28 it decoded leniently, so the decoding half of
REQ-WORKSPACE-045 was unmet (`docs/defects/fixed/an-instruction-file-that-is-not-utf-8-is-injected-with-no-warning.md`).
Making it strict for the instruction files makes it strict for the skill files in the same line.

**What the build proceeds under.** A `SKILL.md` that cannot be decoded as UTF-8 is an unreadable file: it is skipped
with the reason `unreadable file: <the decoder's error>`, discovery continues, and the skip is listed and logged like
every other (REQ-WORKSPACE-053). The reasons: a file parsed with replacement characters standing in for what its author
wrote is not the file the author wrote, and a skill's `name` or `description` read that way would be silently wrong in a
catalog a model acts on; the sibling walk that shares the port says "decoding error" outright; and REQ-WORKSPACE-044
already fixes UTF-8 as the encoding these files are measured in. The cost is stated too: a `SKILL.md` saved in UTF-16 or
UTF-32 — encodings YAML admits — was previously parsed as mojibake and is now skipped with a reason that names the
path, which is the better of the two failures but is still a file the product declines. A force-loaded body and the
disable manifest take the same arm through the same port, and so does a `SKILL.md` loaded by hand: `loadManualSkill`
now fails with REQ-WORKSPACE-057's "SKILL.md not found: {raw}" and the decoder's reason in parentheses, the arm its I/O
half already used, where it used to load the skill with U+FFFD in its text. If the owner rules the other way, only the port changes:
the walk's skip arm stays for the I/O half, and the decode becomes lenient for `SKILL.md` alone. The cases are pinned in
`packages/config/src/skills/skills.test.ts` ("REQ-WORKSPACE-053 — a SKILL.md that is not UTF-8, through the real port
(OQ-79)"), the walk's and the hand-loaded one's.

<a id="oq-80"></a>

**OQ-80 — Does REQ-STARTUP-158's "every artifact … SHALL declare … that same version" reach the Windows installer's own version metadata?** *(REQ-STARTUP-158, REQ-STARTUP-018, REQ-STARTUP-027, REQ-STARTUP-031. Raised 2026-09-28 by repairing the prerelease naming defect, R-062; `docs/defects/fixed/a-prerelease-version-reaches-the-installer-hyphenated.md` Raised as OQ-76 on its branch; renumbered OQ-80 at the merge, because OQ-76 to OQ-79 were already on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the normalised spelling is accepted in the installer's Windows metadata and recorded: `DisplayVersion`, `ProductVersion` and `VIProductVersion` carry electron-builder's normalised value (`0.1.0-rc1`, `0.1.0.0`) and are not declarations of the release's version in REQ-STARTUP-158's sense; the artifact's name and its run-time report carry the declared text, which the guard compares. Windows shows a prerelease as `0.1.0-rc1` in "Installed apps".

A prerelease is written without a separator (`0.1.0rc1`, REQ-STARTUP-027), and after the repair every published filename
carries that text and the running application reports it. electron-builder still normalises the manifest's version through
loose SemVer when it reads it, and the NSIS installer's own metadata is written from that normalised value: the `VERSION`
define, which becomes the per-user uninstall entry's `DisplayVersion` that REQ-STARTUP-018 names and the uninstall display
name `Rotaris 0.1.0-rc1`; the `ProductVersion` version key; and `VIProductVersion`, which Windows fixes as four numbers
(`0.1.0.0`) and so can carry no suffix in any spelling. A stable version is identical in every place.

**What the build proceeds under.** The installer's Windows metadata carries electron-builder's normalised value, stated in
`electron-builder.yml`'s header and in ADR-0054; the artifact's name and its run-time report carry the declared text, which
is what REQ-STARTUP-158 points at (REQ-STARTUP-031 "is where the version appears in each artifact's name") and what the
guard of REQ-STARTUP-028 compares. `extraMetadata.version` was not used to force the text through: ADR-0054 decided that
either it or `buildVersion` would be a second place a version is declared.

**What a ruling decides.** Whether `DisplayVersion` and `ProductVersion` are "declaring" the release's version in
REQ-STARTUP-158's sense. If they are, the pipeline must write the declared text over them — a custom NSIS include with a
`WriteRegStr` of `DisplayVersion` and a `VIAddVersionKey ProductVersion`, which electron-builder allows — and the guard
gains a place to check in the produced installer; if they are not, the spelling Windows shows in "Installed apps" for a
prerelease is `0.1.0-rc1` and the record says so.

<a id="oq-81"></a>

**OQ-81 — What is another parent's completed task to a `delegate` call's `inherited_context`?** *(REQ-TOOLS-152 with
REQ-TOOLS-155, REQ-ORCH-032 and REQ-ORCH-072; REQ-ORCH-046. Raised 2026-09-28 by repairing
`the-inherited-context-reports-never-reach-the-child` under [R-062](../../../product/requests.md#r-062). Raised as OQ-76 on its branch; renumbered OQ-81 at the merge, because OQ-76 to OQ-80 were already on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** confirmed as built: a completed task that is not the caller's own child is refused for ownership, naming its owner; an id no task has is refused as referring to nothing; a task not completed is ignored; an earlier iteration's root, held in memory only, refuses as referring to nothing; and the ignored ids are not reported to the caller.

REQ-TOOLS-152 handles an `inherited_context` id by field: one "that names no task at all refuses the call", one "naming a
task that failed or has not finished is ignored without refusing", and the field carries "the reports of already-completed
**sibling** tasks". It does not say what an id is that names a *completed* task which exists but is not the caller's child —
another agent's child in the same run, or a child of an earlier iteration. (A task that exists and has not completed
is not in question, whoever owns it: the requirement ignores it. Nor is the root execution record: REQ-ORCH-072 puts
its id in the children's namespace, so a lookup naming it resolves to it, and an agent is never told it does not exist.) REQ-TOOLS-155 scopes `background_output` to the
caller's own children ("a task whose parent is not the caller reads as `not_found`"), REQ-TOOLS-156 lets an agent wait
only for its direct children, and REQ-ORCH-046 refuses a `depends_on` naming another parent's child with a reason that
names the owner; none of the three is written for `inherited_context`.

**What the build proceeds under.** Existence is asked of the session's child records and the root execution record:
an id no task has refuses with `inherited_context id '<id>' refers to nothing: no task has that id`, and an id naming a
task that has not completed is ignored. A completed task that is not the caller's own child refuses, for ownership, with
`inherited_context id '<id>' is not a sibling's: it is owned by parent '<owner>', not '<caller>'` — the shape of
REQ-ORCH-046's dependency refusal. That it refuses at all is REQ-TOOLS-155's scoping applied to the one delegation lookup
it does not name, and it keeps a child from reading a report its parent could not have read itself. (The first build of
this repair refused every id outside the caller's own children as referring to nothing, the root's and the caller's own
included; verification the same day showed that contradicts REQ-TOOLS-152 and REQ-ORCH-072, and it was corrected before
merge — ADR-0012 keeps that reading beside its replacement.) "Completed" is read as REQ-ORCH-047 reads it for a dependency — `succeeded` with the report stored —
since the report is what is carried; a cancelled sibling, and a succeeded one whose report is not yet stored, are
ignored with the failed. The ids that were ignored are not reported to the caller: REQ-TOOLS-153 fixes the message's
content to the alias resolution and the attachment warning, and adding a third item there is a change to that
requirement rather than a reading of this one.

**What a ruling decides.** Whether another parent's completed task should be refused at all, or ignored as the text
ignores an unfinished one, or carried — "no task at all" favours existence anywhere, and naming the owner tells the caller
that the id is real and not its own, a fact REQ-TOOLS-155 withholds from `background_output`; whether an id of an earlier
iteration's completed child should be carried rather than refused, which would need the carrying to leave the
per-iteration ledger; and whether the caller should be told which ids were ignored, which is REQ-TOOLS-153's to widen.
An earlier iteration's *root* is held in memory by the run and not in the store, so an id naming one finds no task and
refuses as referring to nothing; whether it must be found is part of the same ruling. Until then the field carries the
reports of the caller's own completed children, ignores every task that has not completed, and refuses a completed task
it may not carry for that reason.

<a id="oq-82"></a>

**OQ-82 — Does the reserved token's launch of the application's own executable carry the parent's Chromium switches?** *(REQ-MCP-033, REQ-STARTUP-002, REQ-STARTUP-015. Raised 2026-09-28 by repairing `the-code-intelligence-server-dies-when-the-app-runs-as-root.md` (R-062). Raised as OQ-76 on its branch; renumbered OQ-82 at the merge, because OQ-76 to OQ-81 were already on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** confirmed as built: the launch carries exactly the sandbox switch the parent was started with (`--no-sandbox`) between the token, which stays first, and the `--` separator, and nothing else of the parent's command line; the sentinel drops the switch before the runtime sees it.

REQ-MCP-033 fixes that a `stdio` entry carrying the token launches the application's own executable "with the same
token `builtin:code-intelligence` as its first argument", and that "a process started with that first argument SHALL
answer the MCP protocol"; REQ-STARTUP-002 that this child is the one exception to the single entry point; and
REQ-STARTUP-015 what the launch is observable as: started from what the user installed, "the reserved token is a
sentinel for a child process the product starts internally, not a user-facing invocation, and no argument vocabulary
beyond it is defined for the shipped executable", no user interface, no window. **Where the token stands is fixed —
first.** None says whether anything else of the parent's stands on the child's command line after it. The executable is a Chromium, and Chromium refuses to start as root with its
sandbox on, so an operator who runs the application as root starts it with `--no-sandbox`; the child launched bare is a
fresh Chromium, does not inherit that, and died with SIGTRAP before its sentinel ran (2026-09-27, a Linux container).
Running as root is not a supported configuration anyone has ruled on, and Linux artifacts are withheld under IC-3, so
the question is narrower than it looks: whether the launch is the parent's own line or a fresh one.

**The reading built.** The launch carries exactly the sandbox switch the parent was started with (`--no-sandbox`), and
nothing else of the parent's command line — the sandbox is a property of the host the parent has already measured,
and a child of the same executable cannot measure it differently; every other switch (`--enable-logging`, a device
scale factor, a capture seam) is the parent's business. **The token stays the first argument; the switch stands
between it and the branch's `--` separator** (`rotaris builtin:code-intelligence --no-sandbox -- …`; in development
`electron out/main/index.js builtin:code-intelligence --no-sandbox -- …`). Chromium reads switches anywhere before
`--`, so the child starts (measured as root 2026-09-28: that line reaches the sentinel, the bare
`builtin:code-intelligence --` dies with SIGTRAP), and the sentinel drops the switch before the separator so the runtime
never receives it (a stand-in runtime received `start-mcp-server --transport stdio` and nothing else). The switch is
Chromium's own and defines nothing of the product's: no argument vocabulary is added beyond the token. One consequence
stated plainly: a line typed by hand as `rotaris builtin:code-intelligence --no-sandbox -- …` is treated the same way —
Chromium honours the switch and the sentinel drops it — and nothing is skipped anywhere else; a switch after `--` is the
runtime's. `@rotaris/platform`'s `chromium-switches.ts` holds the definition, and the launch builder, the sentinel and
main's fork of the run host all read it.
*Superseded placement (first build, 2026-09-28, kept beside its replacement):* the switch stood immediately BEFORE the
token and "the token as its first argument" was read as "the first argument that is not that switch", the sentinel
skipping the switch to find the token. The verifier found that a reinterpretation of a clause REQ-MCP-033 states, not a
reading where it is silent, and measured the placement above; it replaced the first on the same branch. **A ruling the other way** — the launch carries nothing of the parent's — leaves the
product unable to host its own tool server on a host that needs the switch, and would want REQ-MCP-033 to say so.

*2026-10-21, Windows ARM64, development entry (the Windows ARM64 session's F2):* the ruled line `electron.exe out\main\index.js builtin:code-intelligence --no-sandbox -- start-mcp-server --transport stdio --context ide` answered `initialize` and exited 0; the runtime's command line carried neither `--no-sandbox` nor `--`; an unknown subcommand exited 2. The packaged `Rotaris.exe` line is still not run (ADR-0035).*

<a id="oq-84"></a>

**OQ-84 — Is a packaged Windows build outside `InstallDir` and without the launcher's variable portable, or not updatable?** *(REQ-STARTUP-106, REQ-STARTUP-125, REQ-STARTUP-147; ADR-0054 "How the artifact is identified for the update path" and "The updater". Raised 2026-09-28 by building the classification, first-release-plan.md §4.6, under R-062. Raised as OQ-77 on its branch; renumbered OQ-84 at the merge, because OQ-76 to OQ-82 were already on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** ADR-0054's reading is confirmed: a packaged Windows build outside `InstallDir` with no launcher variable naming its artifact is not updatable and issues no request. [`PD-STARTUP-004`](../../../product/directives/pd-startup-004.md#pd-startup-004) amends REQ-STARTUP-106 and REQ-STARTUP-147 to match.

REQ-STARTUP-106 says "every other Windows standalone build is classified portable", and its last sentence reads a copied installed tree as portable, "and the portable strategy of REQ-STARTUP-125 replaces it with a self-contained executable that runs from any location". ADR-0054, having moved the artifact's identity to the launcher's declared variable (measured: `process.execPath` points into the preparation in 149 of 149 launches), reads the absent variable the other way: "someone who runs the payload's executable directly out of a preparation is not running from a released artifact, so REQ-STARTUP-106 classifies the build not updatable and no request is issued at all". REQ-STARTUP-147 bears on the same case from the other side: "a variable naming the artifact a launch started from decides which file an update replaces and decides nothing about whether, when, or where the check happens" — and under ADR-0054's reading the absence of `ROTARIS_PORTABLE_ARTIFACT` is exactly what decides whether a packaged Windows build outside `InstallDir` checks at all. A ruling therefore settles both texts. The two cases — a copied tree and a payload run directly — are indistinguishable to the process, which sees a packaged executable, no registry match and no variable, and the two texts give them opposite outcomes. Following the requirement's sentence would also replace a `win-unpacked` tree's executable with a single-file portable in place, leaving the tree's support files beside a file that no longer needs them.

**What the build proceeds under.** ADR-0054's reading: **not updatable**, no request, one `info` line naming this question (`classify.ts`). **What a ruling decides.** Whether REQ-STARTUP-106's copied-tree sentence describes a consequence the product must produce (then the target is the running executable and the portable strategy replaces it, as the sentence says) or a consequence the discriminator would have had before the artifact's identity moved to the launcher's variable, in which case the sentence wants amending to ADR-0054's reading — and REQ-STARTUP-147's sentence with it, since under ADR-0054's reading the variable decides whether the check happens. *(REQ-STARTUP-147 added to this entry 2026-09-28 by the item's verification.)*

<a id="oq-85"></a>

**OQ-85 — Which requirement governs the update notice while the download runs: REQ-STARTUP-118 or REQ-SHELL-118?** *(REQ-STARTUP-118, REQ-STARTUP-119, REQ-STARTUP-120, REQ-STARTUP-122; REQ-SHELL-114, REQ-SHELL-118. Raised 2026-09-28 by building the updater's notices, first-release-plan.md §4.6, under R-062. Raised as OQ-78 on its branch; renumbered OQ-85 at the merge, because OQ-76 to OQ-82 were already on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** confirmed as built, and REQ-SHELL-118 is amended to match by [`PD-SHELL-005`](../../../product/directives/pd-shell-005.md#pd-shell-005): while the download runs the notice keeps its identity and is updated in place, carries REQ-STARTUP-118's title and message, is not persistent, and leads into the apply with no pause; a failure becomes REQ-STARTUP-120's `Update not installed` in place.

REQ-STARTUP-118: "a non-persistent notice titled `Downloading Rotaris {version}` SHALL show the message `{measured} — verifying against the published checksum when it finishes.`". REQ-SHELL-118: "While the download runs the notice keeps that title [`Rotaris {version} is available`] and its identity — it is updated in place, never replaced — and its message SHALL convey two things and no more: that the update is downloading, and how far it has got … When the download completes the message SHALL convey that the update is ready to install and the action SHALL be enabled again, performing the install action of REQ-SHELL-115". The two disagree on the title, on persistence (a non-persistent notice against the persistent offer's identity), on the message's content (a fixed three-part sentence against two things and no more) and on whether the apply waits for a second click, where REQ-STARTUP-122 runs download → verify → apply in one sequence.

**What the build proceeds under.** The identity is kept and the notice updated in place (REQ-SHELL-118 and ADR-0054's "the same notice by identity, never by replacement"); the title and message are REQ-STARTUP-118's, because Distribution owns the words and Shell the surface (`CONTEXT-MAP.md`); the notice is not persistent while the download runs, so no dismissal can wave off a version whose install is in flight; the action is disabled with an accessible description; and the apply follows the verified download without a pause, so the "ready to install" state stands only for the length of the apply. The failure becomes REQ-STARTUP-120's `Update not installed` in place. **What a ruling decides.** Which of the two texts is amended to the other on the title, the persistence, the message and the pause. Nothing in the mechanism moves with the answer beyond the words and one boolean.
