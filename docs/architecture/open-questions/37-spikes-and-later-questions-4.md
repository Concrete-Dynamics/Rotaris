# Open questions — Spikes, and the questions raised since (4 of 35)

Part 37 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-161 – OQ-163.

**OQ-161 — May a configuration load append the code-intelligence runtime's marker directory to the user's `.gitignore`
beside `.rotaris/`?** *(REQ-CONFIG-013, "if `<workspace>/.gitignore` contains no line that, once trimmed and stripped of a
trailing `/`, equals `.rotaris`, the line `.rotaris/` is appended"; REQ-MCP-089, "the workspace `.gitignore` SHALL be
best-effort amended to exclude `.rotaris/`"; REQ-CONFIG-456; ground 3 of REQ-CONFIG-477, "Version control stays the user's
choice"; REQ-MCP-099 and REQ-MCP-116, which name the runtime's per-project marker file and read it from the binding
manifest; ADR-0035, "At the merge", which took the reading and flagged it for the owner. Raised 2026-10-01 from the
live-run autopsy at 71ad8e8 finding a71-1,
[`the-load-adds-serena-to-the-users-gitignore-and-the-agents-cannot-account-for-it.md`](../../defects/fixed/the-load-adds-serena-to-the-users-gitignore-and-the-agents-cannot-account-for-it.md).
~~Open.~~ Ruled 2026-10-06. Raised as OQ-160 on its branch and renumbered OQ-161 before it reached `main`, where OQ-160 had been taken
meanwhile.)*

**Instructions clause revised 2026-10-07 by OQ-230 (below) ([R-072](../../product/requests.md#r-072)):** "the agents are not
told that the product wrote the exclude line" no longer holds: every agent receives a product statement naming both of the
product's directories and the lines that keep them out of version control ([`PD-TOOLS-012`](../../product/directives/pd-tools-012.md#pd-tools-012)
revision 2). The 2026-10-06 text is kept as it was ruled.

**Listing clause revised 2026-10-07 by OQ-215 (below) ([R-072](../../product/requests.md#r-072)):** the marker's directory is now a
hard-coded ignore component ([`PD-TOOLS-012`](../../product/directives/pd-tools-012.md#pd-tools-012)), so the file tools no longer list it. The
rest of the ruling below stands as built. The 2026-10-06 text is kept as it was ruled.

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** the current behaviour is accepted: a configuration load appends `.rotaris/` alone to the workspace's `.gitignore` (REQ-CONFIG-013, REQ-MCP-089), and the code-intelligence runtime's marker directory `.serena/` goes to the untracked `info/exclude` file of the repository whose top level is the workspace, best-effort and idempotent, on the terms stated above; a workspace below a repository's top level, or in none, gets no line. The marker stays in the workspace root as the runtime creates it, so the file tools, which read the root `.gitignore` alone (REQ-TOOLS-139, REQ-TOOLS-140), still list it, as the duress run of 2026-10-06 showed, and the agents are not told that the product wrote the exclude line. D-21's one exception covers the exclude file as a second ignore file. The requirements name the `.rotaris/` line and are silent on the marker, so this ruling settles it; [`the-load-adds-serena-to-the-users-gitignore-and-the-agents-cannot-account-for-it.md`](../../defects/fixed/the-load-adds-serena-to-the-users-gitignore-and-the-agents-cannot-account-for-it.md) closes with it.

The bundled runtime creates `.serena/project.yml` in the workspace root whenever it starts with a project (ADR-0035,
finding 5). With the `code_intelligence` entry enabled by default, every first run therefore left an untracked directory
in the user's repository. On 2026-09-06 the build answered that by appending the marker's directory in the same
amendment as the product's own scope directory, and ADR-0035 and `codebase.md` record the reading as "flagged for the
owner". No question was raised for it. The two requirements name one line.

The live run of 2026-10-01 measured the cost of the second line. The load makes the change before any agent runs.
Nothing the agents are given says the product made it, and `git status` shows ` M .gitignore` to every agent that checks
its own work. In the default run, the answers of `edit`, `resume` and `frictions` each told the user of an unexplained
`.gitignore` change. In the duress run the orchestrator commissioned a ninth child, unrequested, to find out who had
changed the file: 319.4 s, 6.3 % of the run's wall time, and about 393 thousand tokens.

**What the build proceeds under, since 2026-10-01** (the `fin2` round's repair of the note above). A configuration load
appends only `.rotaris/` to the workspace's `.gitignore` (REQ-CONFIG-013, REQ-MCP-089). The marker's directory goes to
the repository-local exclude file instead: `info/exclude` in the common directory of the repository whose top level is
the workspace (the workspace's own `.git`, a directory or a `gitdir:` file, then its `commondir`), without spawning Git
(`repositoryExcludeFile`, `keepScopeDirIgnored`, `packages/config/src/load.ts`). It is written only into a git directory
Git itself would recognise — the git directory holds `HEAD`, the common directory `objects/` and `refs/` — and nothing is
created there but `info/` and its file: the verifier of the first execution found that a stale `gitdir:` pointer (a
linked worktree whose repository was moved or deleted) made the load create the whole missing chain, and that a pointer
to any other directory (a submodule copied out of its superproject) put the line into that directory. The line is written only when neither
`.gitignore` nor the exclude file already names the directory, best-effort and idempotent, every failure swallowed, and
nothing is removed from a `.gitignore` an earlier build amended. Git honours the exclude file and nobody tracks it, so
`git status` stays clean and no file the user tracks changes. This is strictly narrower than the reading below and
needs no ruling to be safe; it does not answer the question. Four consequences, stated for the ruling. A linked
worktree's exclude file is the main repository's (Git shares it), so the write lands outside the workspace there, and
D-21's one exception ("a best-effort ignore-file line") now covers a second ignore file. **A workspace below a
repository's top level gets no line**, so that repository lists the marker's directory as untracked
(`?? <path>/.serena/`) as it did before 2026-09-06: the first execution walked up as Git does, and `config-proof`'s
scratch workspace inside the developer's checkout wrote the line into the checkout's own exclude file — a write
outside the workspace opened, so the walk was dropped. A workspace in no repository keeps an untracked marker
directory, which no `git status` reports. And the search tools' scan and the contains-code walk read only the root
`.gitignore` (REQ-TOOLS-139, REQ-WORKSPACE-100), so `.serena/` is walked again as it was before 2026-09-06 (its
`cache/` stays skipped as a hard-coded component, and it holds no indexable source).

*Until 2026-10-01:* every configuration load appended `.rotaris/` and `.serena/` to the workspace's `.gitignore`, each
only when it was missing, unless the caller passed `keepIgnored: false`. The second name was taken from the generated
manifest (`keepScopeDirIgnored`, `packages/config/src/load.ts`). Nothing told an agent or the user that the product
wrote either line.

**What a ruling decides.** Whether the load may append the marker's directory to a tracked file the user owns, which
REQ-CONFIG-013 and REQ-MCP-089 do not provide for. If it may not, whether the marker is left untracked as the runtime
creates it, kept out of version control by a means that changes no tracked file, or avoided by starting the runtime so
that it creates no marker in the workspace root. If the line stays, whether the agents' instructions or the user are told
that the product wrote it.

**OQ-162 — Does continuing a paused iteration classify the intent again, and may the resumed root's grant change with
it?** *(`PD-ORCH-005` clause 4, "Continuing resumes the iteration where it stood … each carries on from its last
message"; clause 14, "A resumed agent runs with its persona's current instructions and tools", with OQ-105, which reads
the warning a continue's new classification raises; REQ-ORCH-005, "the classified intent MUST be in effect before the
first iteration"; REQ-ORCH-013, the prior intent inherited only "when (a) the fresh classification is unusable";
REQ-ORCH-016, the intent-to-tools mapping that "MUST gate the entry role's tool set"; REQ-ORCH-014, the status that
conveys the classified intent; REQ-ORCH-007 and REQ-ORCH-008, the 12 s bound and its fallback (OQ-114). Raised 2026-10-01
from the live-run autopsy at 71ad8e8 finding a71-3,
[`continue-classifies-the-intent-again-and-widens-the-resumed-roots-tools-mid-iteration.md`](../../defects/fixed/continue-classifies-the-intent-again-and-widens-the-resumed-roots-tools-mid-iteration.md).
~~Open.~~ **Ruled 2026-10-06.** Raised as OQ-161 on its branch and renumbered OQ-162 before it reached `main`, where OQ-160 had been taken
meanwhile.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** every continue resumes the paused iteration
with the intent and tools it started with. The Continue action, and a message-limit resolution, which brings no request
either, make no classification call and carry the intent in effect; a continue that brings a message classifies it, and
that classification takes effect from the run's next iteration, once the resumed one has closed. The intent in effect —
the newest continuation's, else the launch's — is what the status shows and what REQ-ORCH-013 carries over. By
[`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 7, clause 40.

The directive resumes an iteration "where it stood" and runs a resumed agent with its persona's current instructions and
tools. It does not say whether the run's classification is taken again. REQ-ORCH-005 places the classification before
the first iteration. REQ-ORCH-013 describes a resumed session's carry-over, which inherits the earlier intent only when
the fresh one is unusable.

Under the build every continue classifies again, and that includes the Continue action, which brings no message and so
classifies the session's last user prompt. The result governs the resumed iteration: its playbook, its budget clamp and
REQ-ORCH-016's grant to the entry role. A launch whose classification fell back and a continue whose classification
succeeds can therefore produce different intents. The coordinator's tools then change in the middle of the iteration it
is resuming. Clause 14's fingerprint warns of a change no one made to a persona.

In the default live run's `resume` scenario the launch's classification ran into the 12 s bound. It fell back to
`moderate_feature` with no grant, and the orchestrator had 24 tools. The user pressed Continue 2.7 s after the pause.
The Continue classified the same prompt in 6.6 s as `explicit_trivial` (0.92), and the resumed orchestrator was offered
29 tools: `fetch`, `haet`, `haet_edit`, `terminal` and `write_file` were added. A `resumed_under_changed_instructions`
warning followed, and the header went on showing the launch's intent. The classification added 6.6 s to the Continue.

**What the build proceeds under.** Every continue runs the pre-flight: on the last user prompt for the Continue action,
or on the message for a continue by message. The launch's category, fallback or not, is REQ-ORCH-013's prior intent. The
result is in effect for the resumed iteration and every iteration after it, grant included (`Sessions.launchContinuation`,
`Run.start`). The resumed root is offered the tools of the new grant, and clause 14's warning is raised when they differ
from its fingerprint (OQ-105). ~~The intent status the surfaces read is the launch audit's (`intentStatusOf`); a
continuation's intent is recorded as a `run_continuation_intent` timeline entry and a transcript row.~~ A continuation's
intent is recorded as a `run_continuation_intent` timeline entry and a transcript row, and since 2026-10-01 the intent
status the surfaces read is the intent in effect: the newest continuation's, else the launch audit's (`intentPayloadOf`,
`preflight.test.ts`, "REQ-ORCH-014 (OQ-162, live-run finding a71-3) …"). *Changed in place 2026-10-01 by the repair of
the header half of the note:* REQ-ORCH-014 asks the status to convey the classified intent, and whatever the ruling below
decides about classifying again, the intent the resumed run is using is the one in effect; the first form showed the
launch's after a continue that had replaced it. Should the ruling keep the launch's intent across a continue, the
continuation records that intent and the status still reads it. While a continuation's pre-flight classification is in
flight the status reads `classifying` (REQ-ORCH-014's transient status), not the previous run's intent, and the result
replaces it in place (`Run.intentClassifying`; `preflight.test.ts`, "REQ-ORCH-014 (OQ-162): while a continue classifies
…"; added 2026-10-01 at the verifier's finding). REQ-ORCH-013's prior intent is still the launch audit's alone
(`previousIntent`, `sessions.ts`), so a second continue whose classification is unusable carries the launch's category
over, not a first continue's, while the status before it showed the first continue's; which intent is "prior" after a
continue that classified is part of this ruling.

**What a ruling decides.** Whether the Continue action, which brings no message, classifies at all or carries the
launch's intent and grant. Whether a resumed iteration keeps the grant it started with, so that a new classification
takes effect only from the next iteration. Whether a successful fresh classification replaces a fallback launch intent,
as built. And which intent the status shows after a continue.

*Built 2026-10-06 (fin20, `fin20-continue-and-continuation`).* `Sessions.launchContinuation` takes `intentFrom`: the
Continue action and the message-limit resolution (`continueSessionHeld`) pass `carry`, and the pre-flight is handed the
intent in effect (`PreflightContext.intent`, `carriedIntent`), which the run host's `runPreflight` resolves the grant,
playbooks and clamp for with no classification call. A continue by message that resumes an open iteration classifies its
message for the run (`RunDeps.preflight`) and hands the resumed iteration the carried pre-flight
(`RunDeps.resumedPreflight`); `Run.preflightInEffect` is what the ports, the playbooks, the clamp and the entry turn's
grant-fitted instructions (`entryInstructionsFor`, `PD-ORCH-006`, merged from `main` before landing) read, and when the
resumed iteration closes, `nextIntentInEffect` records the message's classification as a `run_continuation_intent` entry
with its row. The resumed iteration's entry carries the message's classification beside its own as `next_run_intent`.
`previousIntent` (REQ-ORCH-013's prior) is the intent in effect. A plan decision resumes nothing (the iteration closed
before the hold) and classifies as before. Pinned by `packages/engine/src/run/preflight.test.ts`, "OQ-162 as ruled …" (four
cases, each red on the code before it; the fourth, a resumed coordinator that carried `none` keeping the coordinating
prompt under a message classified for the direct-work bundle, red with the run's own grant read) and
`apps/desktop/src/run-host/intent.test.ts`.

**OQ-163 — What does REQ-TOOLS-145's refusal name when a `replace`'s own list marks two tasks in progress and no task is
active?** *(REQ-TOOLS-145, "At most one task may be `IN_PROGRESS` at a time, enforced both when marking a task and on
wholesale state changes; the violation message is `Only one task can be IN_PROGRESS at a time. Active task: <id> (<name>).
Mark it COMPLETED or ABANDONED before moving another task to IN_PROGRESS.`"; REQ-TOOLS-146, whose rejection "with the
message of REQ-TOOLS-145" covers a `replace` that marks another task `IN_PROGRESS` "while a protected active task exists".
Raised 2026-10-01 from the live-run autopsy at 71ad8e8 finding a71-7,
[`a-rejected-todo-replace-names-an-active-task-it-never-stored.md`](../../defects/fixed/a-rejected-todo-replace-names-an-active-task-it-never-stored.md).
Open until 2026-10-06; ruled then, below. Raised as OQ-162 on its branch and renumbered OQ-163 before it reached `main`, where OQ-160 had been taken
meanwhile.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** as recommended, such a `replace` is still
refused whole, and its message says instead that the submitted list marks more than one task in progress, naming them by
the names sent, and that nothing was saved; it names no active task and no id. Minted as
[`PD-TOOLS-008`](../../product/directives/pd-tools-008.md#pd-tools-008), which narrows REQ-TOOLS-145, and built under it (fin21).

REQ-TOOLS-146 foresees one case: an active task exists, and the incoming list marks another. It does not foresee an
incoming list that itself marks two tasks `IN_PROGRESS` while nothing is active. REQ-TOOLS-145's single-active rule still
refuses such a list, and its message names an "Active task", which in that case does not exist. The list is rejected
whole, so the tasks it named, and the ids the build mints for them, are never stored. The message's remedy, "Mark it
COMPLETED or ABANDONED", then names a task the agent cannot reach.

In the default live run's `frictions` scenario the orchestrator's first call (#1) was a `replace` over an empty list with
two tasks `IN_PROGRESS`. It was refused with "Active task: 3c55ec35 (Create friction-probe.txt)". The orchestrator
followed the advice (#8, `update 3c55ec35 COMPLETED`), was told "Unknown task id '3c55ec35'. Available phases: (none)",
and then reasoned that the list was empty (row 18). The cost was one wasted call and one turn, and two `tool_error` issues.

**What the build proceeds under.** The refusal is REQ-TOOLS-145's sentence. It names the first `IN_PROGRESS` task of the
rejected list, under the id the rejected `replace` minted for it (`packages/agent-tools/src/tools/todo.ts:153-154`).
Nothing of the list is stored.

**What a ruling decides.** What the refusal says when no task is active. The options are REQ-TOOLS-145's sentence as
built, or a sentence of its own that names no active task and says the incoming list marks more than one task in
progress. A ruling also decides whether such a `replace` is refused at all, or accepted with all but one of those tasks
left pending.
