# Open questions and escalations

Everything the architecture record leaves unresolved, in three groups:

- **Escalations** — decisions that change what the product *is* for a user. These belong to the product
  owner, not to the architect. Each states the options and what each costs.
- **Specification questions** — places where the specification is silent, under-determined, or where two
  live requirements disagree. Each is raised rather than invented around.
- **Design-reference dependencies** — decisions that cannot be made without the approved visual design
  reference, which was not available to the architects who produced the slice proposals.

Nothing here blocks the Architecture Gate from being *held*. Several items block specific ADRs from
being *ratified*, and those are marked **blocking**.

**Counts, as of the restore-measurement round of 2026-09-02.** **Thirty-one escalations. TWENTY-NINE are
ruled** (`owner-decisions.md`, ESC-1 to ESC-22, ESC-24 and ESC-26 to ESC-31), **two are closed by the
specification itself with no ruling needed** (ESC-23, ESC-25), and ***NONE IS OPEN***. **Forty-seven
specification questions**, **eight resolved** and closed with their reasons below — OQ-3, OQ-11, OQ-14,
OQ-26, OQ-27, OQ-28, OQ-44 and OQ-49 — leaving **thirty-nine open**, **none of which blocks a named ADR**.
Two design-reference dependencies. **Twenty-two numbered spikes**, one withdrawn, **eight discharged** and
one discharged for Windows only, leaving **twelve outstanding** — and see the spike section, which
separates them into the three groups the gate actually turns on.

**The specification-question count has moved since, and implementation is what moves it.** Four questions
were raised by building the thing that met the requirement: **OQ-50** (Part K, the public model catalogue),
**OQ-51** (Part AB, the unscoped queued prompt), **OQ-52** (Part AC, whether a delegated child may ask) and
**OQ-53** (Part AH, which event reports a compression), **OQ-54** (Part AL, the user-terminal audit entry outside the closed permission vocabularies) and **OQ-55** (Part AL, `shell_max_background_sessions` without a maximum). That is **fifty-three specification questions**. **Twelve are now resolved, leaving forty-one open**, and none
blocks a named ADR.

**Two more were raised on 2026-09-14 by planning portable-skill discovery (ADR-0063), before any code:
OQ-58** (whose session a skill's session-scoped state belongs to, once `PD-WORKSPACE-001` made a second
session on one workspace ordinary) **and OQ-59** (a chooser restricted to a file *or* a directory, which
no platform dialog offers). **Three escalations were raised in the same pass** — **ESC-37** (per-prompt
attachment against a session-long force-loaded block), **ESC-38** (the Skills table's five columns
against its seven) and **ESC-39** (a taken command name skipped against suffixed) — each stating the
reading the build proceeds under, all three in `owner-decisions.md`. **Two more were raised on 2026-09-16
by repairing what one plan-mode run hit: OQ-60** (what summary a session carries when the run that owned
it died without a teardown, which REQ-ORCH-082's five stop-reason arms cannot select) **and OQ-61**
(whether an isolated run may read the repository metadata of the worktree it works in, which neither of
the fence's two designators covers), **and OQ-62** (whether a price may come from a provider's discovery
payload, and whether a provider-reported cost has a qualifier — the reason every run's cost reads zero), of
which **one branch was ruled on 2026-09-16** by `PD-MONITOR-001` and two stay open. **One more was raised on
2026-09-16 by reading a launch log: OQ-63** (what level threshold, if any, governs the **application** log —
every level requirement in the corpus governs the per-session log instead), **ruled on 2026-09-23 by
`PD-MONITOR-002`** and built on 2026-09-27. **OQ-21**, open since the gate, was **ruled on 2026-09-23** as it recommended and applied by
amendment (R-049), and OQ-62's configured-rate branch with it; OQ-62's discovery branch stays open. **One more was raised on
2026-09-21 by building `PD-WORKSPACE-002`'s per-file switches: OQ-64** (whether an instruction override
suppresses its base when the override is itself switched off — a third state REQ-WORKSPACE-042's "given
both exist" has no word for). **OQ-64 was ruled on 2026-09-27** as built (R-052), together with ESC-37,
ESC-38 and ESC-39. **One more was raised on 2026-09-22 by repairing the retrospective's reads: OQ-65** (whether the
instruction-file switches reach the retrospective as well as the agents). **One more was raised on 2026-09-27 by building `PD-ORCH-004`: OQ-66** (how `delegate` names the
child a continuation continues, which REQ-TOOLS-152's fields do not provide and the directive does not name), **ruled
on 2026-09-27** as recommended by `PD-ORCH-004` revision 2 ([R-058](../product/requests.md#r-058)). **One more was raised on 2026-09-27 by building the `/skills` listing: OQ-67**
(where the listing goes when there is no transcript to write it into — from the Settings Skills tab, whose
header actions REQ-WORKSPACE-067 fixes at two, and from a window following no session; raised as OQ-66, and
every question from OQ-67 to OQ-75 moved up by one when the first-release work reached `main`, where OQ-66 was already taken), **and one the same day by building
REQ-WORKSPACE-049's fixture: OQ-68** (what "up to 20 context files" measures when discovery can reach fourteen; raised as
OQ-66 on its own branch and renumbered when it reached `main` after the `/skills` listing's). **Two more were raised on 2026-09-27 by building the version guard** (first-release plan §4.1):
**OQ-69** (whether a default entry shipped switched off counts as one the default configuration launches, which
REQ-STARTUP-059 and REQ-MCP-095 read one way and REQ-STARTUP-064 the other) **and OQ-70** (whether a release tag's
numbers are canonical decimals), each with the reading the guard is built under, **and OQ-71** (whether the running
desktop with no version metadata reports `dev` or `0+unknown`, which REQ-STARTUP-007 and REQ-STARTUP-004 fix
differently), raised by the gate round that reviewed it; the three were raised as OQ-66 to OQ-68 on their own branch and renumbered when they reached `main` after the
`/skills` listing's and the injection proof's. **Three more were raised on 2026-09-27 by building the notices generator
(`first-release-plan.md` §4.3): OQ-72** (whether an entry of `THIRD-PARTY-LICENSES.txt` is a package or everything
compiled into one — Electron's 779 credited components carry no version and no identifier), **OQ-73** (REQ-STARTUP-142
names Manrope and a machine-tool manifest, neither of which the first release carries) **and OQ-74** (whether the
reviewed-exceptions table may supply an identifier a dependency does not declare — `dotenv` 0.9.9 in the bundled
runtime). **One more was raised the same day by that generator's gate review: OQ-75** (when a component carries "its
full license text": a licence file that only pointed elsewhere, or only carried a licence's per-file notice, had
counted as the text, and 4 components without text became 12); the four were raised as OQ-66 to OQ-69 on their own branch and renumbered when they reached `main`
after the `/skills` listing, the injection proof and the version guard had taken OQ-67 to OQ-71. **Two more were raised on 2026-09-28 by building `PD-TOOLS-005` (R-062): OQ-76** (which timeline word records a run's user going away and returning — REQ-ORCH-139 closes the vocabulary and it has none, so the build writes both transitions to the session log) **and OQ-77** (whether the away state resolves the approval an `ask_questions` call itself needs under the `ask` preset, which keeps every question from an away user under the default preset), **and one by its verification: OQ-78** (whether an approval already outstanding when the first wait expires keeps its own full wait, as built, or is ended with the directive's reason). **And one more the same day by repairing REQ-WORKSPACE-045's decoding half: OQ-79** (whether a `SKILL.md` that cannot be decoded as UTF-8 is an "unreadable file"
under REQ-WORKSPACE-053, which names the reason without saying what encoding a skill file has; built as one, skipped with the
decoder's error — raised as OQ-76 on its branch and renumbered at the merge, OQ-76 to OQ-78 having been taken on `main`). **And one more the same day by repairing the prerelease naming defect (R-062): OQ-80** (whether REQ-STARTUP-158 reaches the Windows
installer's own version metadata — `DisplayVersion`, `ProductVersion` and the uninstall display name, which electron-builder
writes from its normalised `0.1.0-rc1` while the artifact's name carries the declared `0.1.0rc1` — raised as OQ-76 on its branch
and renumbered at the merge, OQ-76 to OQ-79 having been taken on `main`). **And one more the same day by repairing `inherited_context`'s path to the child (R-062): OQ-81** (what an `inherited_context` id naming another parent's, or an earlier
iteration's, completed task is — refused for ownership, as built, on REQ-TOOLS-155's scoping — and whether the caller is told
which ids were ignored — raised as OQ-76 on its branch and renumbered at the merge, OQ-76 to OQ-80 having been taken on `main`). **Three more were raised on 2026-09-28 by building
the updater (`first-release-plan.md` §4.6, R-062): OQ-83** (whether the record fixes the manifest signature's algorithm and the forms of the key and
the signature — built as Ed25519, raw, over the manifest's exact bytes, SPKI PEM keys), **OQ-84** (a packaged Windows build with neither a
registry match nor the launcher's variable: ADR-0054 says not updatable, REQ-STARTUP-106's copied-tree sentence says portable) **and OQ-85**
(REQ-STARTUP-118 against REQ-SHELL-118 on the download notice's title, persistence and the pause before the apply); **one more by that
item's verification the same day: OQ-86** (whether the installer's auto-close and the restart's close ask REQ-STARTUP-046's active-run
confirmation) — the four raised as OQ-76 to OQ-79 on their branch and renumbered at the merge, OQ-76 to OQ-82 having been taken on `main`. **One more was raised on 2026-09-28 by building the setup manifest (`first-release-plan.md` §4.1): OQ-87** (what a machine tool's "archive layout" comprises, and what path its expected executables are relative to — MinGit's entries sit at the archive root and ripgrep's under one directory). **And OQ-88**, raised by the same item's independent verification (whether a manifest may key an archive under REQ-STARTUP-060's raw `<os>-<machine>` fallback); the two were raised as OQ-76 and OQ-77 on their branch and renumbered at the merge, OQ-76 to OQ-86 having been taken on `main`. **And one more the same day by REQ-CHAT-055's measurement round (R-048's order under R-062): OQ-89** (how the append comparison is read when updates arrive faster than frames — each one's shown-update time then holds the
queue in front of it — and what "an empty transcript" is compared against once the appended rows are on it — raised as OQ-76 on its branch and renumbered at the merge, OQ-76 to OQ-88 having been taken on `main`). **And one more the same day by repairing the artifact variables' reach into the product's children (R-062): OQ-90** (whether the variables naming a launch's artifact are removed from what its children inherit — built so — and which of REQ-STARTUP-147 and REQ-HOOKS-032 says so). **And OQ-91**, raised the same day by repairing REQ-CHAT-048's duplicate-reasoning hygiene under R-062 (whether "per agent" scopes the comparison — each agent's own previous thinking row, the reading built — or only the row dropped), raised as OQ-90 on its branch and renumbered at the merge, OQ-90 having been taken on `main`. **And OQ-92**, raised the same day by repairing the notices file's tools section under R-062 (where the file reports the tool-server package versions REQ-STARTUP-152 asks of it, which REQ-STARTUP-142's section names no place for — built as a third sub-heading after the language servers), raised as OQ-90 on its branch and renumbered at the merge, OQ-90 and OQ-91 having been taken on `main`. **And OQ-93** (whether a text field is spell-checked — the runtime's spellchecker fetched a dictionary no requirement names; built as none), raised 2026-09-28 by the repair of the updater proof's runtime connection, raised as OQ-91 on its branch and renumbered at the merge, OQ-90 to OQ-92 having been taken on `main`. **More were raised on
2026-09-27 by building `PD-ORCH-005` revisions 2 and 3: OQ-94** (how a `paused` agent presents, and whether it is settled
for display with a session at rest, which four requirements the directive does not name would do), **OQ-95** (whether
the transcript is drawn from the conversation record, and what of a model exchange the record holds), **OQ-96** (which
control is a stop and which the final cancel, and what a rest does at the edges the directive does not reach), **OQ-97**
(how a resumed iteration carries on where the directive gives the what and not the how), **OQ-98** (what the
Continue action counts, where it says so, and which continues offer the decline) **and OQ-99** (which artifact
REQ-SESSION-115's handoff carries, and who takes up an earlier offer), each stating the
reading the build proceeds under. **All six were ruled on 2026-09-28** as recommended ([R-064](../product/requests.md#r-064)):
by `PD-ORCH-005` revision 4, with `PD-ORCH-004` revision 4, `PD-ORCH-003` revision 2, `PD-CHAT-001` revision 4 and
`PD-CHAT-002` revision 2, and those revisions were built on 2026-09-28 ([R-065](../product/requests.md#r-065)). **Building them raised nine
more: OQ-100** (how clause 13's `paused` reads on the counters and on the run-level agent, and how the agents a crash left
present before it is recorded), **OQ-101** (what cancelling one paused child at rest reaches, says and leaves, and what it
does with a child a crash left), **OQ-102** (how a continue's message closes with the resumed iteration, and which
continues append a task), **OQ-103** (which sessions a crash left, and what the Continue action offers on one with nothing
to resume), **OQ-104** (where the plan gate holds a run that resumed an iteration, and what that plan cycle plans),
**OQ-105** (what an agent's fingerprint is taken of, when it is compared and where the warning is stated), **OQ-106** (whose
root the handoff's artifact is taken from), **OQ-107** (which offers a later iteration's root is told, and where) **and
OQ-108** (what the audit of clause 15, clause 19, `PD-CHAT-001` revision 4 and `PD-CHAT-002` revision 2 leaves
undecided), each stating the reading the build proceeds under. The fifteen were raised as OQ-67 to OQ-81 on their branch and renumbered at the merge, OQ-67 to OQ-93 having been taken on `main`. **And OQ-109** (whether a `code_intelligence` entry configured `enabled: false` still makes `code-intelligence-setup` applicable. It is built as applicable, availability alone), raised 2026-09-28 by the repair of `plan-gate-proof`'s fixture under R-062 — raised as OQ-94 on its branch and renumbered at the merge, OQ-94 to OQ-108 having been taken on `main`. **On 2026-09-29 the owner ruled eight decisions as recommended ([R-067](../product/requests.md#r-067))**: OQ-96's
stop status, OQ-103's last question and OQ-66's open part among the questions already here, and ESC-42 in
`owner-decisions.md`; and four were **raised and ruled in the same entry — OQ-110** (the dispatch layer's retries come
before the ladder's), **OQ-111** (what the report summariser reads), **OQ-112** (a `write_scope` for a persona that cannot
write is refused) **and OQ-113** (REQ-LIBRARY-092's fallback, answered by amendment). **Three more were raised the same day
from the live runs and left open: OQ-114** (the specification's fixed figures on a reasoning model's critical path, and a
continuation that starts from nothing), **OQ-115** (the code-intelligence server's imperative tool description, rendered
verbatim) **and OQ-116** (the displayed tool-call total during a long execution pass). The seven were raised as OQ-109 to OQ-115 on their branch and renumbered at the merge, OQ-109 having been taken on `main`. **OQ-117** (what an iteration is told of a task it takes up that is not the run's own) was raised the same day by the repair of `every-iteration-is-sent-the-prompt-the-run-was-launched-with.md` and left open. Four closed together on **2026-09-11** on the owner's ruling — **OQ-5** and **OQ-38** (the two
terminal readings, ratified into `REQ-TOOLS-127` and `REQ-CONFIG-117`, the second narrowed in the ratifying),
**OQ-55** (the background-session key gains a maximum) and **OQ-45** (ADR-0061 takes the improvement store's write
path) — which is the first time a ruling closed more than one at once, and it happened because three of the four
had been priced by measurement before they were put. Each of the four is stated where it
was found, with what the build shipped meanwhile, so a ruling replaces an interim rather than filling a gap.

***Three of those counts changed on 2026-09-02 and the direction is not the usual one, so a reader should
not skim them.*** The seven escalations this register carried as open were **all ruled on that date** and
all seven have landed in requirements; OQ-14 and OQ-44 were **closed by amendment** and their entries below
say by which clause; and **spike 22 has been run**. Two entries were corrected rather than deleted because
they asserted a fact that is now false: OQ-44 said `REQ-TRACE-061` "states no ladder" and it now states
one, and OQ-14 said `REQ-CONFIG-216` "says nothing about mode" and it now fixes `0600` explicitly on every
write.

**Five spikes have now landed on 2026-09-02.** The first four closed nothing here, which was the point:
every owner ruling survived and what the measurements changed was the *reasons* — three platform facts this
record asserted were disproved, one ADR's own stated gate trigger fired, and one question a spike raised
was answered in the specification rather than filed here. **The fifth is different in kind.** Spike 22 ran
`REQ-SESSION-201`'s restore and **the mechanism did not work — 0 of 30** — so it closed a spike, found
three defects the record had decided on paper, produced a new requirement (`REQ-SESSION-202`), amended
another (`REQ-SESSION-201`), added two shapes to OQ-48, and left **eight further defects it found
uncorrected**. Those eight are in the gate verdict in [`README.md`](README.md) §6 and are not filed here as
questions, because they are defects with owners rather than silences with none.

**Sub-cases that went unmeasured inside spikes that otherwise passed are listed rather than absorbed**,
because a sub-case folded into a discharged spike is a gap nobody can see afterwards:
`REQ-STARTUP-165`(c)'s "no usable preparation at all" branch (spike 20), ESC-21's second premise
(spike 19), and — new — **the kill-in-the-gap case and the re-run of the corrected restore** (spike 22).

**Nothing here is closed because a ruling said it would be, and nothing is closed because a measurement
was taken nearby.** Two closures in the previous pass were **rewritten rather than deleted**, because
they were right about the outcome and wrong about the reason: OQ-11 is closed, but not by dissolution,
and OQ-44's statement of fact was false. Two questions the ADRs decided against the specification's
silence were filed as **new** questions (OQ-47, OQ-48) rather than being presented as settled, and both
are still open.

**What the second pass changed, stated so a reader can audit it.** Five escalations are closed
individually and each says which requirement closed it and what it left behind; **none of them is closed
because a ruling exists, and two are closed against the entry's own conclusion** (ESC-25 argued a
detached signature was unavailable and the specification amended the two requirements that forbade it;
ESC-23 argued the antecedent was lost and the specification restored it). One question is closed because
the specification moved under it (**OQ-28**). One is new because ADR-0002 had to decide a silence
(**OQ-49**). Three escalations remain open and one of them is new. **Nothing is closed that an agent did
not actually settle**: where a pass reported a conclusion this register could not verify against the
requirement text, the conclusion is recorded and the entry stays open.

**Where a measurement overturned something, the claim is preserved beside what replaced it.** **NINE
spike reports now exist** — four dated 2026-09-01 and five dated 2026-09-02, covering eight live spikes
and one withdrawn one — and each of them changed at least one entry below. They are in
[`spikes/`](spikes/) and are cited by filename. **In the 2026-09-02 group, what was overturned was more
often a *reason* than a *conclusion*, and the entries below say which:** where a measurement disproved a
reason but not a conclusion, the entry states the conclusion, states that the original reason was tested and
found false, and states the reason that actually holds. **The ninth is the exception and should not be read
in that pattern**: spike 22 disproved a *mechanism*, not a reason — the restore as ADR-0058 wrote it could
not complete at all.

---

## Escalations — product-owner decisions

**ESC-1 to ESC-18 have all been ruled on.** The rulings are in
[`owner-decisions.md`](owner-decisions.md), together with nine structural rulings (SR-1 to SR-9) taken
under the owner's standing direction that inherited structure is not a reason. The entries below are kept
as the statement of what was decided **between**, because a ruling is only legible beside the options it
chose from; each remains the canonical description of the choice and `owner-decisions.md` is canonical
for the answer.

**ESC-19, ESC-20 and ESC-21 were ruled on 2026-09-01** against comparative evidence from seven coding
harnesses, and **ESC-23 and ESC-25 have since been answered by the specification itself** rather than by
a ruling. ***"ESC-22 and ESC-24 remain open and neither is architecture's to settle" is WITHDRAWN and must
not be cited.*** **ESC-22, ESC-24 and ESC-27 to ESC-31 were ruled together on 2026-09-02** — the ruling is
in `owner-decisions.md` under that heading — and all seven have landed in requirements: `REQ-MONITOR-306`
bounds the aggregate terminal-frame rate, `REQ-SHELL-169` refuses a launch inside the force-exit allowance,
`REQ-CONFIG-216` fixes `secrets.yaml` at `0600`, `REQ-CONFIG-183` reports and carries on for a withdrawn key
in either scope, `REQ-LIBRARY-047` and `REQ-LIBRARY-176` make a never-recorded version distinguishable from
a pruned one, and `REQ-TOOLS-079` puts the permission-audit identifier in the entry.
[`../clean-room/specification-gate.md`](../clean-room/specification-gate.md) carries what each amendment
says. **Every one of the seven was a cost of a ruling or a consequence of a measurement rather than a
decision anyone deferred, and no escalation in this register is now open.**

Four of the ruled entries are marked below where a later ruling or a later amendment reached back into
them: **ESC-3**, whose accepted defect a transaction makes unreachable (ESC-18); **ESC-9** and **ESC-10**,
whose mechanisms SR-1 and SR-4 dissolved without disturbing either ruling; **ESC-15**, whose ruling
created ESC-19 and ESC-21; and **ESC-1**, whose consequence ESC-23 named and whose antecedent
`REQ-CONFIG-423` has since been restored by amendment.

### ESC-1 — The shared save path between Settings and the composer's permission-mode control

**Where:** ADR-0037. **Source:** `REQ-CONFIG-288`, which states the behaviour and then explicitly hands
the decision over: "A rewrite must decide about this cross-surface coupling explicitly."

Choosing a permission mode in the composer currently **also commits every other pending Settings edit**.

1. **Preserve the coupling.** Matches the stated behaviour exactly. The only option with no conformance
   risk, and the only one where a user can be surprised — in a security-relevant control.
2. **The composer control writes only its own key**, through the scoped per-field writer that already
   exists for exactly this shape of write. Pending Settings edits stay pending. Smallest change; the
   machinery is already specified.
3. **The composer control becomes an in-memory change only** — the next run reads it, no file is
   written. `REQ-CONFIG-328` already notes that the composer's control writes and applies immediately,
   so this changes that.

The decision must not break `REQ-CONFIG-423` or `REQ-CONFIG-418`.

### ESC-2 — Whether configuration write-back preserves comments

**Where:** ADR-0036. **Source:** `REQ-CONFIG-252`, which states that "comments and formatting are lost
while content is preserved — the observable cost of editing models from a UI".

A spike run for the DATA proposal showed that **preserving comments is nearly free**: the document API
recommended for the tri-state model keeps comments, layout and key order through a targeted edit, and
only parse-then-re-emit loses them. **Preserving them is less work than deliberately discarding them.**

1. **Match the specification** — parse and re-emit, losing comments. Conformant. Costs the user the
   comment header the bootstrap itself writes (`REQ-CONFIG-025`) the first time they touch a model slot.
2. **Preserve comments** — a strictly better user outcome and cheaper to build, but it changes an
   observable the specification fixes, so a black-box conformance comparison would flag it.

Key order preserved and never alphabetised (`REQ-CONFIG-248`) holds under both. Nothing else depends on
comments being lost.

### ESC-3 — Silent loss of a review decision under last-writer-wins

**Where:** ADR-0003, ADR-0041. **Source:** `REQ-LIBRARY-042`, which fixes the semantics and accepts the
consequence: "only two writers whose read and write genuinely interleave can lose one of the two
changes, and in that case the later replacement wins whole… The agreement guarantee is an agreement
about what the store holds, not a promise that no decision can be overwritten."

So a user can approve a proposal, another window can reject it, and one decision disappears with no
report. This would not be raised except that **the product already reports a concurrent change in one
place and silently loses it in another**: `REQ-LIBRARY-173` posts a warning where an action's target is
no longer present, and `REQ-LIBRARY-116` requires the undo path to write nothing and report that the
proposal has since changed, naming the status it now holds.

1. **Match the specification.** Silent loss on the ordinary write path, a stated report on the undo
   path. Conformant, and the recommendation absent a decision.
2. **Extend the reporting to every write** — compare the freshly read state against what the surface was
   showing and, where they differ, write nothing and report it. This adds a refusal where the
   specification has none.

**Ruled option 1, and the ruling has since been overtaken by SR-4.** Under a transaction the
read-modify-write is atomic, so the loss the owner deliberately accepted becomes unreachable rather than
merely rare. Every guarantee `REQ-LIBRARY-042` states still holds; only the accepted defect goes. See
**ESC-18**, which asks the owner to confirm rather than assuming that divergence in the safe direction
needs no ruling.

### ESC-4 — A workspace with no version-control repository has no undo

**Where:** ADR-0039. **Source:** `REQ-GIT-044` ("a tree the tool cannot manage resolves to disabled — a
workspace without undo") and `REQ-LIBRARY-163` ("a workspace with no repository must lose only the
rollback capability").

A content-addressed snapshot store of our own would close that gap, and it was assessed and rejected in
ADR-0039 because `REQ-GIT-029` requires checkpoints to be **ordinary commit objects** and `REQ-GIT-060`
requires overwritten content to be retrievable from the safety checkpoint's **commit**. Closing the gap
would change what the product does for a user whose workspace is not a repository, so it is not an
architectural decision. Options: accept the gap as specified, or amend `REQ-GIT-029` and accept a second
snapshot mechanism with its own restore semantics.

### ESC-5 — Does the pooled terminal backend ship?

**Where:** ADR-0020. **Source:** `REQ-TOOLS-099`, `REQ-TOOLS-100`, `REQ-TOOLS-103`, `REQ-TOOLS-187`.

The backend vocabulary is closed at two values; two `kill_status` values only a pane-based pool can
produce are specified; pooled-recovery behaviour is specified in detail; **and nothing states when a
pooled backend is used, whether it must exist, or what selects it.** It would also be POSIX-only, while
Windows mandates a different shell, and the two backends must be observationally identical apart from
the name.

1. **Ship one backend** and withdraw the pooled name and its two status values, keeping the field for
   forward compatibility.
2. **Ship both**, accepting the engineering cost, the external dependency and the platform asymmetry.
3. **Keep both names and define the pooled one as a future backend**, leaving a specified behaviour with
   no implementation.

This changes what a conformance claim can say rather than what a user sees.

### ESC-6 — Windows users get no confinement at all

**Where:** ADR-0022. **Source:** `REQ-SANDBOX-065` closes the platform set at two identifiers and forbids
adding one; `REQ-SANDBOX-048` forbids an opportunistic mode.

A Windows user therefore runs every agent command unconfined, and an unattended permissive run on
Windows is always downgraded unless they set the opt-out key — at which point the agent runs unattended
and unconfined on their machine. Technical options exist and each would change what the product **does
for a Windows user**; adopting any contradicts the two requirements as written.

1. **Accept the specification** and document plainly, on the settings surface and in the launch
   advisory, that Windows has no confinement.
2. **Amend `REQ-SANDBOX-065`** to admit a third platform with a genuinely enforcing mechanism, accepting
   that `REQ-SANDBOX-127`'s real-host conformance obligation then extends to a third continuous-
   integration platform.
3. **Treat a Linux subsystem as the supported Windows path** and say so in the product's system
   requirements rather than only in a remediation string.

### ESC-7 — Custom tool plugins are specified as in-process Python; the runtime is not

**Where:** ADR-0025 (blocking that ADR). **Source:** `REQ-TOOLS-163` requires plugins to execute "inside
the host process with exactly that process's OS privileges"; `REQ-TOOLS-165` and the workspace layout fix
the extension as `*.py`; ADR-0001 chose TypeScript on Node.

1. **Change the plugin language** to modules the host can genuinely import in-process, amending
   `REQ-TOOLS-165` and the layout. **The only option that satisfies `REQ-TOOLS-163` as written**, and it
   costs nothing in bundle size or supply chain. Recommended if the requirement may be amended.
2. **Bundle an interpreter and host plugins in a sidecar**, preserving the file format and the folder
   but re-reading "inside the host process" as "with the host's privileges", and accepting tens of
   megabytes, a second signing and update surface, and a fifth process kind.
3. **Drop custom plugins**, removing a capability the specification carries.

Choosing the plugin language changes what a user can write and therefore what the product is.

### ESC-8 — What the update path establishes

**Where:** ADR-0054. **Source:** `REQ-STARTUP-021`, `REQ-STARTUP-023`, `REQ-STARTUP-123` — binaries are
deliberately unsigned, and the update path establishes **what** was downloaded and nothing about **who**
published it, over the same connection the download came from.

1. **Keep it as specified**, disclosed in the release notes.
2. **Add code signing and notarization**, changing cost, release process and two requirements, and
   making signature verification possible in the updater.
3. **Sign the checksums manifest with a key shipped in the application** — cheaper than (2), gives
   publisher authenticity for updates, and does not change first-launch platform warnings.

The architecture is materially different under (2) or (3), and it is far cheaper to decide now than
after the updater exists.

### ESC-9 — Session retention

**Where:** raised by the RUNTIME slice; touches ADR-0003 and ADR-0008. **Source:** nothing in domains 01,
02, 07, 09 or 20 prunes *sessions*. There is retention **within** a session — the journal cap, the
5,000-row transcript window, the ring-capped evidence files — but a workspace accumulates session
directories without bound, and deletion is only ever an explicit user action (`REQ-SESSION-166`,
`REQ-SESSION-182`). Every session listing is a read per session (`REQ-SESSION-042`) and every history
listing decodes two lines per session (`REQ-EVENTS-126`), both against `REQ-SHELL-150`'s 100 ms gesture
budget.

1. **Leave it unbounded** and accept that the session browser degrades in long-lived workspaces.
2. **Add a user-visible retention preference** — keep N sessions, or N days — with explicit deletion
   semantics.
3. **Leave it unbounded but add the derived read index** ADR-0003 keeps as a named escape hatch, so the
   surfaces stay fast while nothing is deleted.

Option 3 is purely an architecture decision and can be taken later without foreclosing 1 or 2. Options 1
and 2 change what the product *is* for a user with a year-old workspace.

**Ruled option 3, and the ruling stands unchanged: retention is unbounded and nothing is ever deleted.**
Its second half — the derived read index outside the sessions tree, with its validate-against-`updated_at`
machinery and its never-consulted-by-resume-repair-locking-or-following carve-outs — is **withdrawn as
unnecessary, not as wrong**. It existed because `REQ-SESSION-001` closed the session-directory root
against any other name, so a fast listing had to live somewhere else and be defended against staleness.
Under SR-4 a session listing is an indexed query over the same rows the listing describes, so there is no
second copy and no staleness question to answer. What replaced the escape hatch is simply an index.
**The obligation it carried did not go with it:** a listing that used to be a directory scan is now a
query plan, and spike 8 measures it rather than assuming it.

### ESC-10 — Controlling a run owned by a second application instance

**Where:** ADR-0011, ADR-0013; related to OQ-3. **Source:** `REQ-MONITOR-013` requires every control
operation to be issuable against a run in a different process; `REQ-SESSION-161` says the only channel to
a foreign session is the filesystem; **and no filesystem control channel is specified anywhere.**

If the user opens a second instance on the same workspace and presses Stop on a session the first
instance owns, one of three things must happen:

1. **The control is refused with a reason naming the owning process** — consistent with
   `REQ-MONITOR-005`'s "a `false` outcome states the operation did not happen" and with
   `REQ-SESSION-183`'s existing vocabulary, and requiring no new mechanism. **Recommended**, and it
   appears to be what the specification already implies.
2. **A filesystem control mailbox** under the session directory — which `REQ-SESSION-001` forbids at the
   session-directory root, so it would need a new specified location and a new set of ordering rules.
3. **An operating-system channel between instances**, which `REQ-EVENTS-178`'s refusal of any
   programmatic driving surface makes awkward to justify.

The difference is visible to a user with two windows open from two launches.

**Ruled option 1, and SR-1 has since dissolved the premise.** `REQ-STARTUP-161` makes a second launch
surface the running instance, so there is no second instance whose control must be refused and a user
cannot have two windows open from two launches. The refusal survives as a **defence against a state that
should not arise**, not as routine behaviour, and ADR-0011 consequence 4 records it that way.
`REQ-STARTUP-164`'s reclaim path is the one interval in which two processes of this application
genuinely coexist, and what makes that interval safe is the session lock (C-14, W-09), not the refusal.

### ESC-11 — The Linux artifact's runtime, and the sandbox that comes with it

**Where:** ADR-0054, which records it as its second escalation. **Source:** `REQ-STARTUP-024` requires
the application image to run **unextracted on an unmodified Ubuntu 24.04 installation**;
`REQ-STARTUP-159` requires first paint on that baseline with nothing else installed; `REQ-STARTUP-031`
closes the artifact set at four.

The packaging tool's legacy image runtime dynamically loads `libfuse.so.2`, which that distribution does
not ship, so the user's first launch fails at the dynamic loader — or silently, from a file manager. The
same legacy path also **disables the shell's own process sandbox unconditionally**, because the
distribution restricts unprivileged user namespaces; the static runtime detects the condition instead and
disables it only where the namespaces are genuinely unavailable. ADR-0002 makes the sandboxed renderer
load-bearing — the transcript renders Markdown a model wrote and the terminal grid renders bytes an
arbitrary process wrote — so "Linux users get that surface unsandboxed" is a different product, not a
build flag. The static runtime is the default only of the tool's pre-release line.

1. **Ship on the pre-release line.** Changes the release process, nothing the specification fixes.
2. **Ship on the stable line and pin the runtime explicitly**, if that line permits it — to be
   established, not assumed.
3. **Ship on the stable line and disclose the library prerequisite.** Contradicts `REQ-STARTUP-024` as
   written.
4. **Change the Linux artifact form.** Forbidden by `REQ-STARTUP-031`'s closed four-artifact set without
   a requirement change.

`REQ-STARTUP-156`'s release gate names a machine the release owner controls, **not** an unmodified
installation of the baseline distribution, so the gate can pass while the requirement fails. Spike 12
below is what decides this.

### ESC-12 — Which protocol era floor the tool-server client ships with

**Where:** ADR-0033, which records it as an escalation. **Source:** `REQ-MCP-067` requires exactly one
stdio server process per server per session; `REQ-MCP-048` degrades a server that reports no tools to an
empty list rather than an error.

The choice of SDK line decides **which of a user's existing tool servers connect**. The 1.x line tops out
at the `2025-11-25` protocol era and exposes no negotiation control at all; the 2.x line adds the current
era and the negotiation control `REQ-MCP-067`'s countable one-process guarantee depends on, and is one
month old.

1. **2.x with the pre-2026 offered-version entries retained** — widest server compatibility, at the cost
   of resting the product's whole tool story on a young major. **ADR-0033 recommends this.**
2. **1.x** — a settled dependency, but servers speaking only the current era are unreachable and, under
   `REQ-MCP-048`, present to the user as servers offering **no tools** rather than as an error.
3. **2.x with the pre-2026 entries dropped** — simplest, and breaks every 2025-era server the user
   already has.

What a user observes — which of their servers work — differs under all three, and the choice is not
cheaply reversible once user configurations exist.

> **Measured 2026-09-05 (Part S; `spikes/mcp-negotiation.md`) — option (a) taken, and the balance changed in
> one respect.** Over ADR-0033's own transport the SDK spawns **no** sibling probe under any mode (eleven of
> twelve cells: one launch per connection), so `REQ-MCP-067`'s process count is held by the transport's
> shape and **no pin is needed**. The shipped mode is `'auto'` (probe, fall back to `initialize`): it is the
> only mode that reaches all four fixture eras. The two costs the escalation named were measured: a 2026 pin
> refuses every 2025-era server (option (c)); `'legacy'` cannot reach a server that speaks only the new
> negotiation (option (b)). The one case the SDK's sibling exists for — a 2025 server that **exits** on the
> unknown pre-`initialize` probe — is handled by a single sequential retry under `'legacy'` (two launches,
> never two processes at once). Option (a) stands: the 2.x line (`@modelcontextprotocol/client` 2.0.0,
> pinned exactly) with the pre-2026 offered list retained. A real third-party server was not tested; the
> fixture only. — A benchmark invariant against screen-reader access *(conditional on OQ-28)*

**Where:** ADR-0045, through OQ-28. **Live only if OQ-28 resolves to the framework-neutral reading**;
ADR-0045 names the conflict and raises OQ-28 as blocking, but does not itself carry an escalation
section, so this entry is the record of what the answer costs.

**Source:** `REQ-UIBENCH-054` against `REQ-CHAT-075`, `REQ-CHAT-077`, `REQ-CHAT-065`, `REQ-SHELL-144`.

If the framework-neutral counting rule is the operative one, a rendered Markdown body's elements enter
`widgets`, content changes move the count, and **no document-model transcript can hold
`REQ-UIBENCH-054`'s invariant.** Only a canvas can, and a canvas forfeits native text selection, keyboard
navigation and per-row accessible names, all of which are hard requirements.

1. **Confirm the framework-relative reading** — the product defines the counting rule, content nodes are
   accounted to `ui_objects`, ADR-0045 stands. Costs nothing; risks a reviewer concluding the counter was
   defined to pass.
2. **Confirm the framework-neutral reading and relax `REQ-UIBENCH-054`** — the invariant becomes a bound
   on the count's variation, or applies only to application-owned structure. Costs a specification
   amendment in a domain whose whole point is determinism.
3. **Confirm the framework-neutral reading and build the canvas**, with a hand-built accessibility tree
   and text-selection model. The failure mode is that a screen-reader user cannot read the conversation.
   Recommended only if (2) is refused.

The invariants are informational either way (`REQ-UIBENCH-088`), so nothing fails a gate on this — which
is exactly why it must be decided deliberately rather than discovered when the numbers move.

### ESC-14 — Two corrections to SR-4's own reasoning, before it is cited further

**Where:** ADR-0003, ADR-0004, ADR-0036, ADR-0040, ADR-0041. **Source:** `owner-decisions.md` SR-4, the
paragraph headed "Why, in one paragraph", and SR-4's own table.

This is not a request to revisit the ruling. Three of that paragraph's four arguments hold, the table is
right, and the decision stands on them. **Two of the reasons given do not support the conclusions they
are attached to, and both will be cited by someone reading `owner-decisions.md` alone.**

1. **SR-4 lists OQ-41 among the things a database dissolves, and it does not.** The argument is that
   `REQ-TRACE-502` "is not satisfied by the file design either" and that "that defect is unreachable in a
   store whose readers do not block its writers". But `REQ-TRACE-502` governs the generated symbol
   artifact, the three baselines and the retired-identifier log, and **SR-4's own table keeps all four as
   plain files in the user's own repository** — correctly, by SR-4's own principle, since version control
   must track them and the compiler reads the generated artifact. They never reach the store. What
   actually narrows OQ-41 is **SR-1**: no command line (`REQ-TRACE-142`, `REQ-TRACE-144` to
   `REQ-TRACE-151`, `REQ-TRACE-153`, `REQ-TRACE-184` to `REQ-TRACE-186` withdrawn), no programmatic entry
   point (`REQ-EVENTS-178`), no second instance (`REQ-STARTUP-161`), no engine process
   (`REQ-TRACE-206`) — so unbounded cross-process concurrency becomes bounded in-process contention. The
   outcome is a sharp narrowing with a residue, not a dissolution. See OQ-41 as rewritten.
2. **SR-4 says "`REQ-CONFIG-192`'s unmigrated-record rule is an argument about *configuration*, which
   stays in files."** `REQ-CONFIG-192` is a configuration *key* whose *subject* is the delivery store,
   and its unsupported-record rule is about **delivery records**, which move to the database. The
   conclusion — configuration stays in files — is right, and ADR-0036 now argues it on grounds that
   actually reach it (`REQ-CONFIG-183`'s top-level carry-and-ignore policy, `REQ-CONFIG-471` and
   `REQ-CONFIG-464`'s raw-file rendering, version control, and three of `REQ-CONFIG-031`'s five layers
   not being per workspace). The delivery-record rule is preserved in rows by W-11 and Y-17.

**What is asked:** amend the ruling's reasoning so neither imprecision propagates. Nothing about the
decision changes. Options are (1) correct the paragraph, (2) leave it and rely on this entry, or (3)
restate SR-4 as resting only on the three arguments that hold. **Option 2 is the risk**, because OQ-41 is
the kind of thing a later reader closes on the strength of a ruling that says it is closed.

### ESC-15 — A workspace on a network share or in a cloud-sync folder becomes unrunnable

**Where:** ADR-0058 consequence 3; constraint W-04. **Source:** SR-4, against no requirement at all —
nothing in the corpus says where a workspace may live.

Write-ahead logging is unsupported on network filesystems. The store therefore opens read-only, and since
acquiring a session lock is now a **write** (W-09), **no session in that workspace can start.** Under the
file design such a workspace worked, slowly. This is the single most likely way a real user meets SR-4 as
a regression: people keep projects on mapped drives, in OneDrive and in Dropbox constantly, and a
corporate user may have it by default without knowing.

1. **Accept and disclose** — detect at workspace open, refuse with a stated reason naming the
   filesystem, and document the limitation in the system requirements rather than only in an error
   string. Cheapest, and it makes the failure legible rather than mysterious.
2. **Open the store somewhere else for such a workspace** — a per-user store keyed by workspace path.
   This breaks `REQ-SESSION-001`'s workspace-path-plus-session-id anchor, makes a workspace
   non-portable with its own directory, and is a second store layout to test.
3. **Fall back to a file-backed session store for such a workspace**, keeping both designs alive. The
   cost is the whole of what SR-4 removed, permanently, in a second code path exercised only by the
   users least able to report on it.

Spike 19 establishes what actually happens — a clean refusal, a silent degradation, or a corruption
risk — and a cloud-sync folder is a local filesystem with a daemon on top, so it may behave differently
from a true network share and must be measured separately.

### ESC-16 — A store that will not open now means no run at all, rather than a run without history

**Where:** ADR-0058 consequence 4; ADR-0010. **Source:** `REQ-SESSION-089` and `REQ-EVENTS-084`, both of
which require a run to **proceed with a logged warning** when the durable event store cannot be attached.

Under the file design the event store, the session state and the lock were three different things, so
losing one was a partial failure and degrading was meaningful. Under SR-4 they are **one object**. There
is no partial failure left to degrade through: if the store will not open there is no session to run, no
lock to hold and nothing to write a warning into. The requirement's stated path is unreachable, not
merely awkward.

1. **Refuse to start, with a stated reason naming the store and the engine's own error.** What the
   requirement protects — that a store failure never silently discards a run — is served by refusing
   rather than by degrading, and it is what ADR-0058 and ADR-0010 are written against. Amends
   `REQ-SESSION-089` and `REQ-EVENTS-084`.
2. **Run with no durable record at all**, in memory, publishing to views. This is the literal reading of
   "the run MUST proceed", and it produces exactly the state `REQ-MONITOR-292` forbids: a view showing
   what no resume can restore, for the whole run.
3. **Split the store back apart** so a history failure is again partial. This gives back the transaction
   that discharges D-16, D-17 and `REQ-EVENTS-098`, for one failure path.

`REQ-EVENTS-088`'s sticky mid-run failure is a **different** case and stays reachable; what to do about
it is OQ-42. This entry is only about the store that will not open at all.

### ESC-17 — What a user can still read about their own runs without this application

**Where:** ADR-0058, ADR-0024, ADR-0009. **Source:** `REQ-SESSION-191`, which makes "the log, **the
timeline**, **the issues file**, **the metrics document** and **the evidence files**" reachable through
the platform's own file manager, without a shell.

**SR-4's table and SR-4's principle point in opposite directions here, and the table won by default
rather than by decision.** The principle says a file when a human is meant to read it. The table sends
the session wholesale to the database. Four of `REQ-SESSION-191`'s five items are rows under it.
`summary.md`, `evidence/debug.log` and the artifact bodies remain. The event history has an export
(`REQ-EVENTS-172`, `REQ-SESSION-189`); **the timeline, the issues and the permission audit have
nothing.**

The permission audit is where this matters most. It is a security record whose value partly consists in
being independently readable — it is what a user consults precisely when they do not trust this
application's own rendering of events. Moving it into an application-owned binary store makes it strictly
less independently auditable, however much stronger the immutability enforcement becomes (W-16 makes it
genuinely stronger, and that does not answer this).

1. **Extend the export** to the timeline, the issues and the audit, in the same line-delimited form
   `REQ-EVENTS-166` gets. Preserves the substance; the user must run a command to get it, where before
   they opened a folder.
2. **An in-application inspector** for these records. Convenient, and it is the option that does *not*
   answer the objection, because the record is then readable only through the thing being audited.
3. **Keep the permission audit and the verification-gate log as files**, accepting two write paths for
   evidence and the loss of the transaction that makes `REQ-TOOLS-081`'s three side effects atomic.

**One of the four has no ADR at all yet.** ADR-0008 computes the metric aggregates by query and
deliberately takes no position on the metrics *document*, because `REQ-SESSION-193` calls it one of three
machine-readable documents with a fixed key inventory and `REQ-SESSION-191` makes it file-manager-
reachable — which points at a file under SR-4's own **principle** — while SR-4's **table** does not name
it and sends the session wholesale to the store. That is the same disagreement this entry is about, in
miniature, and answering it answers where the document goes.

This is a real reduction in what a user owns about their own runs, it follows from the ruling rather than
from any implementation choice, and it does not look like it was foreseen.

### ESC-18 — ESC-3's ruling has been overtaken

**Where:** ADR-0058 consequence 5; ADR-0041. **Source:** ESC-3 as ruled, against `REQ-LIBRARY-042` read
under a transaction.

ESC-3 was ruled deliberately: match the specification, accept silent loss on the ordinary write path.
Under SR-4 the improvement store's read-modify-write is one transaction, so two genuinely interleaved
review decisions **can no longer lose one another**. Every guarantee `REQ-LIBRARY-042` states still holds
— no reader sees a partly applied change, the later replacement wins whole where the two do not
interleave, `REQ-LIBRARY-164`'s agreement is unaffected — and the accepted defect becomes unreachable.

That is divergence in the **safe** direction and needs no remedy. It is raised because the owner ruled on
it explicitly, on the reasoning that "adding a refusal to every write where the specification has none is
a larger change than the defect warrants" — and the defect is now gone without any refusal being added,
which is a different world from the one the ruling was taken in. Confirm, or state that the
specification's stated consequence must be reproduced.

### ESC-19 — SR-9(b)'s backup disclosure is not in the specification *(raised 2026-09-01; **RULED 2026-09-01; the specification has since landed both halves**)*

> **Status, 2026-09-02: CLOSED, and closed by requirement rather than by the ruling alone.** ESC-19 was
> ruled **option 1 *and* half of option 2**: mint the disclosure, add a whole-store backup and restore,
> and **refuse** the configurable store location. All three have landed. `REQ-SESSION-200` is the
> disclosure and is substantial — it names what sits outside a workspace backup, names what *is* carried
> so the statement is informative rather than alarming, names both remedies, requires reachability from
> `REQ-SESSION-182`'s session-management surface, and forbids delivery only inside a failure message.
> `REQ-SESSION-201` is the backup and restore, and it fixes far more than the ruling asked for: one
> artifact covering the whole store plus `REQ-SESSION-002`'s per-session files and nothing outside it, a
> user-chosen destination, validity **while runs are live**, a result that is "a state of the store that
> a reader could have observed at one moment", an explicit restore that never merges silently and is
> refused rather than half-done, and an artifact carrying the workspace identifier. `REQ-SESSION-182`
> places both actions. The store's location is unchanged and ESC-19 states in terms that ADR-0058's
> location decision does not reopen. **Constraint W-22 is relabelled MET; W-24 carries what the backup
> now forces.**
>
> **What is left is not this escalation and must not be filed under it.** One thing the pair *creates*
> is escalated separately below as **ESC-26**: `REQ-SESSION-201`'s restore and `REQ-SESSION-197`'s
> absolute identifier rule together make the intended disaster-recovery use end in a manual file edit.
> And the mechanism ADR-0058 built for it was entirely unmeasured — spike 22. ***That is no longer true.
> Spike 22 ran on 2026-09-02 and the restore as ADR-0058 wrote it failed in 30 of 30 attempts*** (
> `spikes/backup-restore-mechanism.md`). Three defects were found, all three are corrected in ADR-0058,
> `REQ-SESSION-201` and the new `REQ-SESSION-202`, and eight further defects the spike found are recorded
> uncorrected in the gate verdict. **None of it reopens this escalation**: the ruling asked for a
> whole-store backup and restore and the requirement states one; what the measurement corrected was the
> mechanism, which is the architecture's and not the owner's.

**Where:** ADR-0058; constraint W-22, and now W-24. **Source:** `owner-decisions.md` SR-9(b), against
`REQ-SESSION-198` and the absence of any requirement discharging it. **The options as they stood when
this was raised are kept below, because a ruling is only legible beside them.**

SR-9(b) ruled that a machine-local store changes what a backup protects and that **a requirement is
minted** so the product states the property rather than letting a user infer it from an absence.
**No such requirement exists.** Twenty-one domains contain no backup, restore or synchronised-folder
disclosure; `resolutions/07` records "the backup profile of a machine-local store" only as a *concern
raised*; and the ruling table in `docs/clean-room/specification-gate.md` lists SR-4 to SR-8 and does not
mention SR-9 at all.

The consequence is user-visible and is not small. A user's session history, permission audit, improvement
library and artifact bodies now live outside anything they back up when they back up their project. The
failure mode is a user who backs up their workspace, restores it, and finds their history was never in
it. Every mitigation this record has is an **export**, and `REQ-SESSION-199` forbids building anything
that repeats one. **ADR-0058 cannot close this from the architecture side** — it can place the store, and
it cannot make the product tell anyone.

1. **Mint the disclosure requirement**, which SR-9(b) calls the minimum honest fix.
2. **Take the structural option** SR-9(b) explicitly does not foreclose — a configurable store location,
   or an explicit backup action covering the whole store rather than per-record exports. This returns
   ADR-0058's alternative N and makes the store's location a user setting, with a second set of failure
   modes (a location on a share re-creates ESC-15; a location that moves orphans a history).

### ESC-20 — SR-9(a)'s two exports are not minted, and the argument reaches a third record the specification excludes *(raised 2026-09-01; **RULED 2026-09-01; the specification has since landed it in full**)*

> **Status, 2026-09-02: CLOSED.** ESC-20 was ruled: mint SR-9(a)'s two exports, and **draw the boundary
> on redaction safety rather than on readership**. `REQ-LIBRARY-176` and `REQ-TRACE-514` mint the two,
> each applying `REQ-EVENTS-166`'s guarantee "on the same terms `REQ-SESSION-199` applies it to the
> timeline, the issues record, the metrics document and the permission audit". The third case went the
> way this entry could not predict: `REQ-TOOLS-190` **gains** an export, in its continuation paragraph,
> and the readership sentence quoted below as the possible stopping point **has been deleted from the
> requirement** and replaced by the test itself, which `REQ-TOOLS-190` now calls "the product's single
> statement of that test" — *a record gains an export when it carries no unredacted user or tool content,
> and does not gain one when it does.* The one case this entry said must never be swept in is protected
> by the same requirement, in stronger terms than were asked for: `REQ-SESSION-136`'s tool-call evidence
> "MUST NEVER gain an export — not under this rule, and not under any later widening of it", and a
> future requirement proposing one "MUST be refused rather than reconciled". **Constraint W-23 is
> relabelled MET.**
>
> **One residue, and it is disclosure rather than boundary.** `REQ-SESSION-201`'s backup carries the
> tool-call evidence because it carries the store whole. The requirement states that itself and obliges
> the product to convey it where the action is offered, so it is not a widening — but a reader who meets
> it without that sentence will conclude the prohibition is porous, which is exactly the argument for
> widening it. ADR-0024 and ADR-0058 both state the distinction rather than omitting it.

**Where:** ADR-0024, ADR-0041, ADR-0058; constraint W-23. **Source:** SR-9(a) and SR-6, against
`REQ-SESSION-199`, domain 14, and `REQ-TOOLS-190`. **The question as it stood is kept below.**

SR-9(a) ruled improvement artifacts and delivery records into the export list "on the same terms as the
four in SR-6". `REQ-SESSION-199` carries the four. **Neither of the two exists**: domain 14 contains no
occurrence of the word *export* at all, and no export requirement for delivery records exists in domain
08 or 15.

The second half is sharper, because it is not an omission. `REQ-TOOLS-190`'s verification-gate record is
reached by the **identical** argument — it was a file under the withdrawn evidence set, a user could read
it, and unlike the tool-call evidence it carries no argument values that would make an export unsafe —
and `REQ-TOOLS-190` excludes it by a positive sentence: *"that only this application reads it is why it
is a record rather than a file the user is offered."* Either that sentence is SR-6's stated stopping
point, in which case SR-6's reasoning has a boundary nobody has drawn, or the list is short again.

**One case must never be swept in whichever way this goes.** `REQ-SESSION-136`'s tool-call evidence
deliberately holds **unredacted** arguments; the permission audit exports safely only because
`REQ-TOOLS-079` gives an entry no argument values at all. That is the principled line between the two
cases and it is stated in ADR-0024.

### ESC-21 — the one lock with a cross-machine obligation is the one the product cannot enforce *(raised 2026-09-01; **RULED IN DIRECTION 2026-09-01; strength pending spike 19**)*

> **Status, 2026-09-02: direction settled and carried by requirement; strength still owed to a
> measurement that is running.** ESC-21 was ruled: **the product must not promise cross-machine mutual
> exclusion it cannot enforce**, and the integration operation must detect the condition and refuse
> rather than proceed under a lock that does not lock. There was no field precedent to borrow — every
> harness surveyed is single-machine and the one with multi-device continuity uses a server this product
> does not have and does not want — so this was reasoned rather than copied. The specification now
> carries it: `REQ-GIT-128`'s second paragraph refuses the integration where the workspace is classified
> as replicated and requires the lock **not be created at all**; `REQ-GIT-124` places that refusal in its
> ordered list **ahead of** the lock check "because it is exactly the condition under which the lock the
> next check reads does not mean what it says"; and `REQ-GIT-128` forbids domain 06 making the storage
> determination again or raising a second notice — the classification is `REQ-STARTUP-166`'s and the
> notice is `REQ-STARTUP-166`'s.
>
> **Two things are genuinely still open and one of them is not a measurement.** *(a)* **Strength.**
> Spike 19 decides whether refusal or a proceed-past warning is right. ADR-0005 states that if the answer
> is a warning, one refusal becomes a confirmation and its four mechanism rules are unaffected either
> way. *(b)* **The residual the mechanism cannot reach, which no spike closes.** An unrecognised
> synchronisation client classifies as *unknown*; `REQ-STARTUP-166` makes an inconclusive determination a
> silent negative, "and a silent negative is the only safe answer to an unknown"; `REQ-GIT-128` carries
> that forward in terms — a workspace the product could not classify does not refuse either. So the
> refusal removes the **recognised** cases and no more, and the worst outcome in this record — two
> machines merging into one base branch at once, silently — remains reachable through an unrecognised
> client. ADR-0005 records this as an unclosed residual rather than hiding it, and the owner should see
> it in the same breath as the ruling that produced it.

**Where:** ADR-0005, ADR-0058; constraints C-01, W-20. **Source:** `REQ-GIT-128` against
`REQ-STARTUP-166`. **The question as it stood is kept below.**

`REQ-GIT-128` keeps the integration lock a **file** deliberately: what it protects is the base
repository, which is the user's own material and travels with the workspace, so "a second machine
reaching the same checkout must meet the same lock". Under ESC-15 the session lock became machine-local
and got **safer**; the integration lock got **lonelier**, and it is now the only lock in the product with
a cross-machine obligation.

**Exclusive create is a real primitive on a true network filesystem. Inside a file-synchronisation
client's tree it is not.** Such clients replicate after the fact, so two machines can each successfully
create the file and the conflict is reconciled afterwards — by which time both integrations have started
and both are merging into one base branch. A silent double promotion into one base branch is the worst
outcome anywhere in this record.

`REQ-STARTUP-166` is the **only** mechanism in the product that distinguishes storage another machine
reaches directly from storage an agent replicates, and it drives only a warning about the user's own
files (constraint B-24). This is the one place where that distinction changes a **safety** property, and
nothing connects the two. Options are: extend `REQ-STARTUP-166`'s determination to gate integration on
replicated storage; state the limitation in the requirement and accept it; or give the integration lock a
second, non-filesystem interlock, which is a new mechanism.

### ESC-22 — the aggregate terminal-frame rate is unbounded, and a conformance budget now depends on it *(new 2026-09-01; **RULED AND APPLIED 2026-09-02**)*

> ***RULED: bound it. APPLIED the same day.*** `REQ-MONITOR-306` is minted: live terminal output reaching
> surfaces is bounded **in aggregate** — across every live stream, of every session, delivered to every
> window — at **1,000 frames per second**, counted **per delivery**, so a stream shown in two windows counts
> twice. It cites `REQ-TOOLS-126` for the per-stream period and `REQ-TOOLS-127` for what a frame is and
> copies neither; what it adds is that **the number of live streams is not a multiplier on the per-stream
> period**, which is the whole of what this escalation said was missing. It is bounded **on frames and
> deliberately not on volume**, because a byte bound could be honoured only by discarding output, which
> `REQ-SHELL-103` and `REQ-MONITOR-294` both forbid. And it is stated as a **condition of
> `REQ-MONITOR-222`** rather than as a smoothness concern: it may not be widened, made configurable or
> raised by any per-stream setting unless `REQ-MONITOR-222` is re-measured at the new rate, and conformance
> is the **delivered aggregate rate**, never the appearance of a terminal grid. `REQ-MONITOR-287` and
> `REQ-SHELL-103` cite it and hold no copy of the figure. **The ground the owner gave is the IPC
> measurement**: transcript p95 rose sixfold at 65.5 MB/s and ninety-eightfold at 12,000 frames per second
> while staying at 1.51 ms at 999, so an unbounded rate left a load-bearing property resting on a default.
> **The entry below is kept as the statement of what was decided between.**
>
> **Re-checked against the amended corpus and unchanged.** `REQ-TOOLS-108` still reads "default 20,
> minimum 1" with **no maximum**, and `REQ-CONFIG-116` registers the key as `int ≥ 1, default 20`. The
> amendment pass did not touch either. One of the two factors in a conformance budget is still
> user-writable without a ceiling, and the three remedies below are unchanged. **Nothing about this is
> architecture's alone.**

**Where:** ADR-0021, ADR-0044; constraints T-42, X-19. **Source:**
`spikes/ipc-hop-latency.md` §6 question 2 and §7.1, against `REQ-TOOLS-108` and `REQ-MONITOR-222`.

Measurement shows a distinct Electron IPC **channel name is not a distinct transport**, so ADR-0044's
stated isolation for terminal frames does not exist as described and the architecture's whole protection
for `REQ-MONITOR-222` is ADR-0021's coalescing cap. That cap licenses an aggregate of
*(stream count × 50 frames/s)* at its 20 ms floor, and the stream count is bounded only by
`runtime.shell_max_background_sessions` — default 20, **minimum 1, no maximum** (`REQ-TOOLS-108`), each
publishing its own stream (`REQ-TOOLS-127`) — plus `REQ-MONITOR-285`'s 20 agents. **One of the two
factors in a conformance budget is user-writable without a ceiling.**

At the licensed rate nothing showed a problem (transcript p95 1.514 ms at 999 frames/s). At 12,000
frames/s it rose 97.8× to 126.207 ms. Three remedies and none is architecture's alone:

1. **State a maximum on the key** — a specification change.
2. **Impose an aggregate rate budget across streams**, which is an architecture decision but changes what
   a user who configures many background sessions observes.
3. **Adopt the direct message port**, measured holding transcript p95 at 1.119 ms under 12,000 frames/s —
   ADR-0044's and ADR-0002's, and cost without a requirement behind it.

**The failure this protects against is invisible to every detector the record has.** In the measured
collapse nothing was dropped and nothing was reordered — every one of 586,960 frames arrived, in order,
`refused = 0` — so `REQ-MONITOR-226`'s gap counter never fires and the only symptom is a stale interface.

### ESC-23 — `REQ-CONFIG-423` loses its antecedent under ESC-1 *(raised 2026-09-01; **ANSWERED BY AMENDMENT 2026-09-02, no ruling needed**)*

> **Status: CLOSED, and closed in favour of the first of the two candidate rules named below.** Both
> requirements have been amended. `REQ-CONFIG-288` no longer states the coupling in the present tense —
> it now *takes* the decision ESC-1 ruled, in its own voice: "**The composer's permission-mode control
> writes only its own key, and commits nothing else.** The decision this requirement previously handed
> over is taken here rather than left open, and it is taken against the coupling", through
> `REQ-CONFIG-441`'s scoped per-field writer, refusing outright where the target file cannot be read
> (`REQ-CONFIG-442`), with every pending Settings edit staying pending and still undone by Discard. And
> `REQ-CONFIG-423`'s antecedent is restored rather than deleted: a change to that field made while
> Settings is open "**by any other surface — the composer's control, which writes that key alone
> (`REQ-CONFIG-288`), or any other writer of it** — lands in that pending state". The dependence on the
> shared save path is gone; the pending state tracks the field however it was written. `REQ-CONFIG-423`
> additionally states why, which the entry below could not: "where a permission mode has been changed
> elsewhere and applied to a live run, a settings screen that went on showing the user's unsaved choice
> would be showing a mode no run is operating under."
>
> **ADR-0037 has not been swept against this and is stale in two places** — it says "The requirement has
> not been amended, and this record must not pretend otherwise" and treats `REQ-CONFIG-423`'s second
> sentence as having lost its antecedent. Reported under the ADR sweep rather than fixed here.

**Where:** ADR-0037; constraint G-19. **Source:** ESC-1 as ruled, against `REQ-CONFIG-423` and
`REQ-CONFIG-288`. **The question as it stood is kept below.**

ESC-1 rules that the composer's permission-mode control writes only its own key, through
`REQ-CONFIG-441`'s scoped per-field writer, and states that the decision "must not break
`REQ-CONFIG-423`". `REQ-CONFIG-423` fixes that a permission-mode change made while Settings is open **by
another surface that writes through the shared save path (`REQ-CONFIG-288`)** lands in the pending
settings state. Under the ruling the composer no longer writes through that path — so, read literally, a
composer change now lands in the file and **not** in the pending state, leaving an open Settings screen
showing a value the file no longer holds.

Two candidate rules exist and neither is stated: the composer's per-field write **also** updates the
pending settings state, or `REQ-CONFIG-423` is amended so the pending state tracks only the shared save
path. The difference is user-visible, in the same security-relevant control the ruling was made to
protect. *Related and separate:* `REQ-CONFIG-288` still states the coupling ESC-1 ruled against, in the
present tense, so an implementer reading it alone would build the coupling the owner refused.

### ESC-24 — a launch handed to an instance inside its force-exit allowance *(new 2026-09-01; **RULED AND APPLIED 2026-09-02**)*

> ***RULED: refuse the launch until exit completes. APPLIED the same day.*** `REQ-SHELL-169` is minted: such
> a launch is **refused rather than admitted**, and honoured once the shutdown has finished. Through that
> interval the instance builds no window, opens no workspace and writes nothing on the launch's behalf —
> **including the window `REQ-STARTUP-162` would otherwise have a window-less instance build**, which is the
> clause this entry identified as the trap. The refusal is **answered, never silent**, because an unanswered
> launch is the path `REQ-STARTUP-164` keeps for a process that *cannot* answer, and taking it for one that
> can would produce exactly the two simultaneous processes the refusal exists to avoid. **Domain 11 was
> amended in step so the two documents agree**: `REQ-STARTUP-164`(3) now states that an answered refusal
> stops the 5-second reclaim running at all — without which the launch would reclaim the record four seconds
> into a thirty-second allowance and become the second instance ESC-24 forbids — `REQ-STARTUP-162` gains the
> shutting-down exception to its build-a-window clause and states what a waiting launch shows, and
> `REQ-STARTUP-161` states that waiting is not a third outcome. **The owner's ground**: the force-exit
> allowance exists because a quit is already going wrong, so admitting a launch into it means two instances
> briefly exist at the one moment the product is least able to reason about its own state — and refusing is
> consistent with SR-1's own shape, in which a second launch never starts a rival process.
> **The entry below is kept as the statement of what was decided between.**
>
> **Re-checked against the amended corpus and unchanged in substance; one adjacent requirement now
> bounds it partly, which is worth stating precisely rather than letting a reader think it closed it.**
> `REQ-STARTUP-161` still releases the record "when that instance's process ends" and `REQ-STARTUP-162`
> still requires the hand-over to surface a window — and to **build** one where none is open — while
> writing nothing and reporting nothing. `REQ-STARTUP-164`(3) covers the case where the exiting instance
> **does not answer**: the launch reclaims after 5 seconds and retries once. It does **not** cover the
> case this escalation is about, which is the exiting instance **answering** the hand-over and being
> obliged to build a window in a process about to force-exit. *A second, adjacent case did close by
> amendment and should not be confused with this one:* `REQ-STARTUP-121`'s update restart now fixes the
> hand-over in terms — the record "passes from the current instance to the successor rather than being
> released for anyone to claim", and a launch arriving during it "SHALL be handed to whichever of the two
> holds the record at that moment and SHALL never start a third process". ADR-0055 meets that by argument
> rather than by construction and says so; see the gate verdict.

**Where:** ADR-0014, ADR-0055; constraints P-16, R-17. **Source:** `REQ-STARTUP-161` to
`REQ-STARTUP-164` against `REQ-MONITOR-131`.

`REQ-STARTUP-161` says the single-instance record is "released when the instance's process ends", and
during `REQ-MONITOR-131`'s 30 s force-exit allowance the exiting instance still holds it.
`REQ-STARTUP-162` then requires the hand-over to surface a window — and where no window is open, to
**build** one — while writing nothing and reporting nothing, not even an error.

Building a window in a process about to force-exit is wrong. Silently doing nothing is also forbidden.
Neither `REQ-MONITOR-131` nor `REQ-STARTUP-161` to `REQ-STARTUP-164` says which wins. Every available
answer is user-visible, and **SR-1 is what created the case**, so it belongs with the ruling rather than
with the ADR.

### ESC-25 — ESC-8's signature has no available placement, and rotation is a release commitment *(raised 2026-09-01; **ANSWERED BY AMENDMENT 2026-09-02, and answered against this entry's own conclusion**)*

> **Status: CLOSED. Both halves are settled, and the first is settled the opposite way to the one this
> entry and ADR-0054 both argued for.** This entry concluded that a detached `SHA256SUMS.txt.sig` "is not
> a thing this release may publish" and that the signature must therefore live *inside* the manifest.
> **That is withdrawn.** The specification took the third option — amend the two requirements that
> forbade it, individually. `REQ-STARTUP-032` now requires a release to publish, beside the manifest, "a
> detached signature over the manifest's exact published bytes, named `SHA256SUMS.txt.sig`", and states
> the reason the entry below missed: the manifest cannot carry a digest over a file derived from itself,
> and a detached signature leaves the manifest's bytes identical for the update path and for
> `sha256sum -c` alike. `REQ-STARTUP-152` excepts it from the naming-scheme agreement; `REQ-STARTUP-035`
> excepts it from the one-row-per-asset rule. `REQ-STARTUP-122` fixes the order — fetch manifest **and**
> signature, verify the signature, **then** parse the manifest, then stream, verify, apply — so untrusted
> bytes reach no parser of ours.
>
> **Rotation is settled too, and settled as this entry said it must be — in the build, at the release
> gate.** `REQ-STARTUP-167` fixes that every artifact carries the verification counterpart within itself,
> that the accepted set is fixed when the build is produced, and that nothing at run time may add to,
> replace or disable it. `REQ-STARTUP-168`(a) makes what a build carries **a set rather than a single
> value**; (b) requires a release to be signed with a key carried by every artifact it may be offered to,
> "decidable before publishing … and it SHALL be decided then rather than discovered afterwards", at
> `REQ-STARTUP-156`'s release gate. That is the operational commitment this entry asked the owner to see
> stated, and it is now stated. **ADR-0054 has been swept and carries the reversal**, with its superseded
> argument preserved and the reason it failed named: its premise was a requirement, and the requirement
> was amended.

**Where:** ADR-0054. **Source:** ESC-8 as ruled, against `REQ-STARTUP-152` and `REQ-STARTUP-035`.
**The question as it stood is kept below.**

ESC-8 rules that the checksums manifest is signed with a key shipped in the application. Two consequences
were not visible when it was ruled and neither is architecture's to settle.

**There is no detached signature file available.** `REQ-STARTUP-152` requires every published filename to
be a value of the one naming scheme and `REQ-STARTUP-035` allows exactly one release-body row per asset
except the manifest, so a `SHA256SUMS.txt.sig` is not a thing this release may publish. The signature
must therefore live **inside** the manifest, in a form the standard checking tool `REQ-STARTUP-032` names
still tolerates, or in the release body's manifest row. If neither placement is acceptable, **ESC-8 as
ruled is not implementable without amending `REQ-STARTUP-152` or `REQ-STARTUP-035`.**

**Rotation is a release problem, not a runtime one.** A client can only verify with the key it was built
with, so rotating strands every older client on "unverifiable" — invisible at check time under
`REQ-STARTUP-110` and visible and alarming at install time under `REQ-STARTUP-120`. The mitigation is
dual signatures across a window long enough to cover the versions in the field, which is an **operational
commitment** the owner should see stated rather than an architecture detail.

### ESC-26 — the identifier cannot be re-established by any product action, and that blocks the recovery path ESC-19 just minted *(raised 2026-09-02; **RULED 2026-09-01 and APPLIED 2026-09-02**)*

> ***Ruled: option 2, drawn as narrowly as it can be drawn. `REQ-SESSION-197` gains one exception — a
> restore MAY establish the workspace identifier on explicit user confirmation, and no other action ever
> may.*** The ruling is in `owner-decisions.md`; the amendment has landed in `REQ-SESSION-197` (which
> carries the whole exception) and `REQ-SESSION-201` (which carries a pointer, because a contract has
> exactly one home). **Five conditions bind it and it is unavailable unless every one holds:** only inside
> the restore action, with the requirement naming the paths that do *not* gain it — opening or preparing a
> workspace, `REQ-SESSION-060`'s explicit repair, a migration, an update, a later convenience; explicit
> confirmation naming **both** identifiers and stating that this workspace's own sessions become
> unreachable from it, never automatic, never the default or pre-selected, with report-and-do-nothing kept
> as a correct outcome; the **absent**-identifier case unchanged and explicitly *not* this exception; a
> present-but-**unreadable** identifier still reported and never overwritten; and the displaced store
> **moved aside and kept**, never deleted, with the confirmation saying where it went. ADR-0058 adds that
> the operation is reversible by hand and says so in the confirmation, which is what makes a
> one-way-looking action safe to confirm.
>
> **What it does NOT settle, stated because the shapes are similar enough to be confused.** A user who
> **copies** a workspace folder and wants the copy to have an identity of its own still has no product
> action — **OQ-47 stays open on that side**, and ADR-0058 says so explicitly rather than letting the
> ruling read as covering it. **OQ-48 is more owed, not less**: the exception adds a third producer of
> orphaned stores, and the reclamation surface is now the only route *back* to a store a user may well
> want rather than only the route to clearing one they do not.
>
> *The reading question this entry flagged is answered by the amendment rather than by an ADR: the restore
> may write the identifier, on the conditions above and on no others.*

**The entry below is the statement of what was decided between, kept because a ruling is only legible
beside the options it chose from.**

**Where:** ADR-0058, ADR-0002; constraints W-19, W-24; OQ-47. **Source:** `REQ-SESSION-201` against
`REQ-SESSION-197`. **This is the one thing the backup pass could not settle inside the architecture,
because settling it means amending a requirement.**

ESC-19 was ruled so that a user can carry their history to another machine. `REQ-SESSION-201` builds
that: one artifact, the whole store, carrying "the workspace identifier it was taken from … so a backup
cannot be poured into the wrong workspace by accident". But `REQ-SESSION-197` forbids the identifier
changing "afterwards for any reason", forbids minting a replacement over one the product can read, and
states no user-confirmed exception — for a good reason, which the same requirement gives: overwriting one
"would silently orphan every session recorded under it".

**Follow the intended journey and it ends in a text editor.** A user's machine dies. On the new machine
they clone their repository — `.rotaris/` is kept out of version control by `REQ-CONFIG-013`, so no
identifier arrives. They open the workspace once, which is the natural first thing to do, and the product
mints a new identifier. *Then* they restore their backup. The artifact names identifier A; the open
workspace reads identifier B; `REQ-SESSION-197` says the product may not touch B. The sessions restore
into a store the open workspace will never resolve to, and the only remedy the product may offer is to
close the workspace, replace the identifier file by hand, and reopen. **This is the same dead end OQ-47
already records for a copied folder, reached from a second and much more likely direction** — and
reaching one dead end twice, from two independent routes, is evidence rather than coincidence.

Three options, and the architecture has taken the only part of the third that is unambiguously legal:

1. **Leave it.** `REQ-SESSION-200`'s disclosure at least means nobody is surprised. The cost is a
   recovery path people will get wrong, at the worst moment to get something wrong.
2. **Grant `REQ-SESSION-197` one narrow exception**, available only during a restore, only behind an
   explicit user confirmation that names what is being detached, and never automatic. This weakens the
   protection ESC-19's own comparative evidence identifies as this record's single best decision — the
   filed, painful, path-keyed history-loss bug three surveyed products have and this one does not — so it
   should not be granted casually.
3. **Allow a restore to establish an identifier only where the workspace has never been prepared.** This
   fixes the *clone-then-restore-before-first-open* order and leaves the common order broken.

ADR-0058 implements the part of (3) that no requirement forbids: where `.rotaris/` carries **no**
identifier file at all, the restore establishes it from the artifact by exclusive create, arguing that
nothing is replaced and the value established is the one the restored sessions were recorded under.
It is guarded twice — a file that is present but unreadable is **not** this case, because
`REQ-SESSION-197` requires that reported rather than overwritten, and the write is an exclusive create so
a racing file wins. It refuses to invent the rest, and records the residue undressed.

*One reading question rides on this and ADR-0058 flags it rather than burying it:* `REQ-SESSION-201`'s
"It MUST NOT reach outside that store" sits in the backup paragraph, and the restore's obligations are
stated separately in the same requirement with none of them forbidding an identifier write. ADR-0058
takes the narrow reading. **If the owner reads it the other way, the legal case above collapses into the
manual remedy and this escalation gets worse rather than better.**

### ESC-27 to ESC-31 — five product decisions the defect-correction round raised rather than took *(raised 2026-09-02; **ALL FIVE RULED AND APPLIED 2026-09-02**)*

> ***"All five OPEN and none ruled" is WITHDRAWN and must not be cited.*** All five were ruled on the day
> they were raised, together with ESC-22 and ESC-24, and all five have landed in requirements. **ESC-27:**
> `0600`, applied **explicitly on every write** by `REQ-CONFIG-216`, with `REQ-CONFIG-444`'s platform-default
> fallback denied to this one file by name and no write at all where the protection cannot be applied —
> **OQ-14 closes with it**. **ESC-28 and ESC-29:** *report and carry on*, owned by `REQ-CONFIG-183`, which
> reports and ignores a key this specification defined and withdrew and a key it names as not a
> configuration key of this domain, loads every other key as though they were absent, opens the workspace,
> and restates the hard load failure for a genuinely unknown key as **unweakened** with the carve-out
> bounded to exactly those two kinds. The second half of ESC-28 — a confirmed one-click removal — was **not**
> taken, because it would need the no-repair rule narrowed and nobody ruled that. **ESC-30:** *make them
> distinguishable* — `REQ-LIBRARY-047` records, inside its own all-or-nothing operation, that a version was
> **due**, so one the best-effort write then failed to record is afterwards known to be absent and countable;
> `REQ-LIBRARY-176` carries **two separate figures** per artifact, each identified as which it is and each
> stated as zero rather than omitted; and both exports are forbidden from carrying an absence figure in a
> shape shared with the other. **ESC-31:** *in the entry* — `REQ-TOOLS-079` makes the identifier a field of
> the entry and names it in the field set, because `REQ-EVENTS-056` requires the locator to resolve **through
> the export**, on a machine carrying none of this product's code. ***That discharges the one architecture
> consequence this group had***: ADR-0024's choice is no longer permitted-and-unblessed. What the ruling did
> **not** settle is the field's *token*, which would have been a decision the ruling did not make;
> `REQ-TOOLS-079` fixes the property instead. **The entries below are kept as the statement of what was
> decided between.**

**These are not architecture's and were not architecture's to raise.** The defect-correction round of
2026-09-02 corrected ten specification defects this record reported and, in five places, found that
closing the defect required deciding something a user would see. It recorded the decision rather than
taking it. **They are stated in full in
[`../clean-room/specification-gate.md`](../clean-room/specification-gate.md), which is canonical for
them; they were listed here so this register's count of open escalations stayed honest.**

- **ESC-27 — `secrets.yaml` has no file mode.** `REQ-CONFIG-216` fixes the write as atomic and
  directory-creating and states no mode, so the one configuration file that holds credentials by design
  inherits the process mask. `0600` plus the explicit access-control list treats it by what it holds;
  `0644` treats it by what it is, matching every other configuration file. Constraint **D-26** and
  **OQ-14** are the same fact from two directions and neither closes without this ruling.
- **ESC-28 — should the product do more than tell a user about a withdrawn configuration key?**
  `REQ-CONFIG-478` fixes the honest minimum. Opening the offending file for editing from the failure
  report, or a confirmed one-click removal, are further options; the second sits against the rule that the
  product does not repair a user's configuration and would need that rule narrowed explicitly.
- **ESC-29 — a withdrawn key in the *global* scope stops every workspace opening**, and no in-product
  surface is reachable from that state, including the settings screen that would edit the global file.
  Worth ruling with ESC-28.
- **ESC-30 — a version missing because it was never recorded is not distinguishable from one retention
  pruned.** This is **OQ-45**'s product half, escalated. `REQ-LIBRARY-047` makes recording a version
  best-effort and outside the write's all-or-nothing boundary; `REQ-LIBRARY-052` now obliges the store to
  say how many pruning dropped and `REQ-LIBRARY-176` forbids the export implying that figure accounts for
  every absence. Whether the export must tell the two causes apart is the owner's, and a conformant export
  can be built today under either ruling and widened later without rework.
- **ESC-31 — where the permission-audit entry's identifier lives.** `REQ-EVENTS-056` fixes the locator's
  form and its record-kind token; `REQ-TOOLS-079` is obliged to give an audit entry an identifier.
  Whether that identifier is a further **field** of the entry or travels **beside** it is deliberately
  left open, and the two are observably different in the exported audit file. **ADR-0024's choice that
  the identifier is the export ordinal is permitted and unblessed until this is ruled**, and whichever is
  chosen, `REQ-TOOLS-079`'s no-argument-values property must survive untouched: it is what makes the audit
  exportable at all.

---

## Specification questions

### Resolved, and closed with the reason

Four entries are answered here, and a fifth — **OQ-28** — was resolved on 2026-09-02 and is closed in
place among the ADR-specific entries below, because the argument that closed it is long and belongs
beside the measurement it rests on. They keep their numbers and stay in the register because ADRs cite
them, and each says what closed it, so a reader who finds the citation is not left guessing. **Nothing is
listed as closed that the record did not actually settle** — three further questions the rulings expected
to close did not, and they are still open below with their residues stated (OQ-12, OQ-19, OQ-41).

***A sixth entry closed on 2026-09-02: OQ-49, closed by amendment rather than by argument.***
`REQ-STARTUP-163` now owns what makes two directory strings the same directory — what is resolved, what is
deliberately not reconciled, and the bounded cost of not reconciling it — with two additions ADR-0002 did
not state: a trailing separator carries no meaning, and abbreviated alternate spellings the filesystem
itself resolves are resolved. It states explicitly that it is **not** the definition of workspace identity,
which is `REQ-SESSION-197`'s and is never derived from a path. **Constraint W-25 moves from a ruling to a
requirement citation and ADR-0002 should now cite rather than decide.** The store side of the same hazard
is *not* closed by that requirement and is now a rule of its own — see constraint **W-27** and the entry
immediately below.

***One question a spike raised is answered rather than filed, and it is recorded here in the closed form
so the spike's own request for an entry is not silently ignored.*** `spikes/remote-and-synchronised-storage.md`
section 11 item 14 asked: **where does a first-statement store failure after a successful open belong?**
`REQ-EVENTS-084` governs "opening the store only"; `REQ-EVENTS-088` governs a write that fails *during* a
run; the measured case — a store that opens cleanly, reports and reads back its journal mode, owns its
shared-memory companion at the expected size, and throws on the very next statement — belonged to neither,
**30 times out of 30 on a mapped network drive**. It is **minted and closed in the specification rather
than left open here**: `REQ-EVENTS-179` requires the store to be *exercised* rather than merely opened,
by a write made and then undone, before the run starts; it resolves its own failure into `REQ-EVENTS-084`
and refuses on exactly that requirement's terms; `REQ-EVENTS-084` and `REQ-EVENTS-088` each gained the
boundary sentence that routes to it; and `REQ-SESSION-089` gained the matching clause on the run-lifecycle
side. **What is NOT closed and is listed under the spikes below is the cost of the probe itself**, which
has not been measured on the startup path. Constraints **W-04**, **W-08** and **E-05** carry it.

**OQ-3 — Is a second application instance on one workspace a supported configuration? *Resolved: no.***
*(ADR-0011, ADR-0030.)* `REQ-STARTUP-161` fixes at most one instance per user account and makes every
window a window of that one instance; SR-1 is the ruling behind it. The three pieces of evidence that
pointed to *yes* have each been re-read and none survives: `REQ-MONITOR-013` now says in terms that the
boundary it means "is never the boundary between two instances of the application"; `REQ-GIT-124`'s
"whether or not this application started it" now covers this instance's own runs and a lock an instance
that crashed left behind (constraint P-14); and `REQ-PROVIDER-152`'s cross-process credential lock
survives on a **narrower rationale** — every window of the one instance reaches the same per-user files,
several read-modify-write sequences can be in flight at once, and `REQ-STARTUP-164`'s reclaim path is one
interval in which two processes of this application genuinely coexist (constraint C-14). The finding
"the evidence points to yes" is struck. ESC-10, which rested on this, is dissolved.

**OQ-11 — Two incompatible Windows retry schedules. *Resolved — and the reason previously recorded here
was wrong. Rewritten rather than deleted, because ADRs cite it.*** *(ADR-0004.)* `REQ-LIBRARY-043`'s
five attempts within 1 second governed the improvement artifact store and `REQ-SESSION-033`'s five-step
ladder summing to 1.55 s governed every state file.

**It is not closed because "neither ladder has a file left to govern".** That was the closure this record
wrote and it is false. `REQ-SESSION-033` was **narrowed, not withdrawn**: it still governs the
human-readable summary — which `REQ-SESSION-028` rebuilds on every save, `REQ-SESSION-006` keeps a file
and `REQ-SESSION-140` names — it still states its constants (0.05, 0.1, 0.2, 0.4, 0.8 s), and it declares
itself "the only replacement ladder this domain states". ADR-0004's per-store policy table therefore
**keeps** its retry-schedule field with exactly one value in it, which is literally what that record's own
*Revisit if* predicted would happen.

**It is closed because the resolution turned out to be one-sided.** `REQ-LIBRARY-043`'s ladder went with
its document layout, and the requirement gives the reason: **no writer outside this application can reach
a record in that store** (`REQ-LIBRARY-158`), so there is no foreign handle for a ladder to defend
against. `REQ-SESSION-033`'s survived precisely because its file **is** reachable by one — an antivirus
scanner, an indexer, a cloud-sync client, or the user's own editor opened through `REQ-SESSION-191`.
There is now exactly one ladder in the corpus and nothing to reconcile: **the conflict is gone, the
ladder is not.** Constraint D-25 records the re-derivation.

**The caveat travelled with the closure and is now discharged.** It read: the one ladder the corpus states
is in the sessions domain, and `REQ-TRACE-061` — which faces exactly the case it was written for — still
requires a failed replace re-raised with none. That was **OQ-44**, whose own statement of fact was also
wrong and has been corrected. *Since the OQ-41 amendment of 2026-09-06, `REQ-TRACE-061` states its own
ladder — five attempts at 0.05 / 0.1 / 0.2 / 0.4 s, exhaustion producing a recoverable error with the
previous file retained — so the corpus now holds **two** ladders with two owners and no overlap: this one
for the toolchain's four repository artifacts, `REQ-SESSION-033`'s six attempts for the local summary file.
`REQ-EVENTS-145`'s export destinations cite this one rather than minting a third.*

**OQ-26 — Ordering between the delivery state write and the audit append. *Resolved.*** *(ADR-0041.)*
The delivery state, the requirement's history, `REQ-CONFIG-192`'s 200-entry prune and the audit record
are written in **one transaction**, so there is no "between them" for a crash to fall into and neither
the state-first argument nor `REQ-TRACE-133`'s opposite precedent has to be chosen between.
`REQ-TRACE-133` itself is untouched: it orders one file write against another in ADR-0040's store, which
stays files. What made the transaction available was a citation correction rather than the ruling —
neither `REQ-LIBRARY-042` nor `REQ-TRACE-502` reaches the delivery store, and no requirement subjects it
to atomic-replacement-alone (constraint C-10). **The audit trail now shares a durability domain with the
state it audits**, where under files the two could survive each other; no requirement asks otherwise, so
it is accepted rather than escalated, and it is recorded because it was not chosen deliberately.

**OQ-27 — Delivery record file granularity. *Resolved by dissolution.*** *(ADR-0041.)* The question's
stated stakes were that the choice "is observable to anyone who opens the workspace directory". Under
SR-4 nothing is. The store is rows; there is no file granularity to choose. Constraint Y-20 records that
the specification is still silent and that the silence no longer needs an answer.

### Named against a specific ADR

***No question in this group blocks an ADR from ratification any more.*** OQ-28 was the last one, and
ESC-13 unblocked it by ruling the trade instead of leaving the record to pay it. The heading is kept
because ADRs cite it, and each entry still names the record it decides something for; what it no longer
means is that the named record cannot be ratified until the question is answered. **Ratification is now
blocked by the gate items in `docs/clean-room/specification-gate.md` and by the escalations above, not by
anything in this list.**

**OQ-1 — Decision closed, 2026-09-07.** REQ-CHAT-041 now scopes the queue to
the application instance and session ID. The run host remains its authoritative
owner, with atomic queued-to-triggered transitions and session-filtered windows.
Cross-process conformance evidence is tracked in the resolution ledger.

**Historical question.** `REQ-CHAT-041` scopes queue
visibility and consumption to windows and runs "sharing the same process", and `REQ-CHAT-038` requires an
atomic queued-to-triggered transition **exactly one caller wins**, while `REQ-MONITOR-139` and
`REQ-ORCH-071` make the queue session-owned and let a run consume only its own session's prompts. Under
ADR-0002 the windows and the run engine are in different processes, so "the same process" is satisfied on
one side or the other but not both. The record places the service in the run host; **confirm, because it
decides whether the phrase is satisfied or merely not violated.** *Unchanged by SR-4, and SR-1 adds one
argument against the alternative: several main windows may display one session (`REQ-MONITOR-243`), so
"the window side" is not a single place to put it.*

**OQ-5 — Decision closed, 2026-09-11.** `REQ-TOOLS-127` now states that the closing frame is a literal
replacement of the displayed text carrying an explicit marker that it is one, that its text is plain on the terms
the requirement already fixed, and that it is **the only frame of a stream of which any of that is true**. The
record's reading is ratified rather than replaced, and the amendment states the reason the conflict was never
real: `REQ-SHELL-095` and `REQ-SHELL-098` govern the stream **while the process is running**, and this frame is
emitted after it has exited — no cursor to paint, no alternate screen to be in, no further output to attribute to
a cell. The two bind different instants. **One thing nobody had noticed is fixed with it:** the closing sentence
bound a *foreground* stream only, while all three executions emitted a closing frame for `bg:` streams as well and
a proof asserted it — the code was ahead of the requirement rather than outside it, and the amendment covers both.
No code changed. Recorded in ADR-0021's ruling section of the same date.

**Historical question.** *(ADR-0021.)* `REQ-TOOLS-127` requires the
closing frame's text to **equal the observation's final output text**, which is plain, capped and
truncated from the oldest end — not terminal control bytes. `REQ-SHELL-095`, `REQ-SHELL-098` and
`REQ-SHELL-166` require a full character grid with alternate-screen fidelity, per-cell attributes and
sixteen colours, which plain text cannot carry. The record's reading is that the closing frame is a
literal plain-text replacement carrying an explicit marker, while every earlier frame is byte-faithful.
**That is a reading, not a fact**, and the alternative reading — plain text throughout — would contradict
three shell requirements.

*Executed three times (Parts AL, AL′, T″; 2026-09-09, 2026-09-11).* The reading is unchanged and now
exercised three ways: the closing frame is a `screen` carrying `closing: true` and the observation's final plain
text; the proof asserts that text equals the observation byte for byte against a real 10,000-line command
(`closingEqualsObservation`); and with the stream sampled in motion the window's grid, the transcript preview and
the persona card reset and write that text together, agreeing at the instant they do it. What the executions add is
only this: the alternative reading — plain text throughout — is no longer merely argued against, because the
same proof renders cursor addressing and an alternate screen from the VT deltas that precede the closing frame,
which plain text cannot carry (`REQ-SHELL-095`, `REQ-SHELL-098`). Nothing measured contradicts the record's reading
and nothing measured establishes it as the specification's intent. **Still the owner's.**

**OQ-38 — Decision closed, 2026-09-11, and the ruling narrowed the reading it ratified.** `REQ-CONFIG-117` now
states that `terminal_stream_interval_ms` is a **ceiling on batching and not a fixed cadence**, and `REQ-TOOLS-126`
cites it rather than restating it. The strict fixed-period reading was not rulable: it makes `REQ-SHELL-166`, a
SHALL with a demonstration obligation against a real pseudo-terminal, unmeetable at `REQ-TOOLS-126`'s own default
and at every larger value in its range. **What the ruling changed is who holds the licence.** The first execution
armed the flush on the agent's own `is_input` call as well, on the reading that an agent's keystroke is "the same
as the user's"; the amendment states that it is not, because the licence exists for `REQ-SHELL-166`'s gesture
budget and an agent waits on the observation rather than on a painted frame. Output alone never arms. That closes
the transport pressure this register priced: the licence is 50 frames/s per stream, and spending it only where a
person is watching leaves a background session framing at the configured period — **ten frames a second at the
default rather than fifty** — so twenty background sessions offer 200 deliveries a second against
`REQ-MONITOR-306`'s 1,000 rather than consuming the whole aggregate. `REQ-TOOLS-126`'s new citation of
`REQ-MONITOR-306` also discharges the half of **ESC-22** domain 05 was recorded as owing. The falsified reading is
kept beside its replacement in ADR-0021 and in the code that held it.

**Historical question.** *(ADR-0021; changes what a configured key
does for a user who sets it.)* `REQ-TOOLS-126` names `runtime.terminal_stream_interval_ms` the **output
sampling period**, default 100 ms, range 20–2000. `REQ-SHELL-166` requires the character a keystroke
produces to be visible within `REQ-SHELL-150`'s **100 ms** gesture budget, measured key press to painted
frame, and the path crosses two process hops and a paint. Read as a fixed period, the default alone spends
the whole budget in the worst case and half of it on average before either hop is counted, so the echo
criterion is unmeetable at `REQ-TOOLS-126`'s own default **and at every larger value its range permits**.
Neither requirement notices the other. **The record's reading:** the period is a **ceiling on batching**,
and writing a keystroke to the pseudo-terminal arms an immediate flush of that stream's next output.
**That is a reading, not a fact**, and it is user-observable — under a strict fixed-period reading a
configured 2000 withholds the user's own echo for two seconds, and under this one it does not. If the
fixed-period reading is intended, one of the two published 100 ms figures has to move, which is a
product-owner decision rather than an architectural one. Spike 15 measures it. *(Numbering note: ADR-0004
and ADR-0040 cite "OQ-38" for a different question, drafted against a provisional number before this one
was filed; they mean **OQ-41**.)*

*Executed three times (Parts AL, AL′, T″; 2026-09-09, 2026-09-11), and the reading now has a price on
both sides.* Echo under the ceiling-plus-flush reading, with the interval configured to 2,000 ms: framed in
**16.2 ms** (first execution), **15.0 / 15.2 ms** (its addendum) and **12.8 ms** (2026-09-11); key press to painted
frame through the real window, **12.4–25.0 ms** (second execution) and **6.8–21.2 ms** (2026-09-11). A strict
fixed-period reading makes the same keystroke wait up to the configured 2,000 ms. **The new figure is the cost of
the reading**, which ADR-0021's "One coupling to OQ-38" asked for and could not state: the ceiling-plus-flush
reading licenses 50 frames/s per stream, so at `REQ-TOOLS-108`'s shipped default of twenty background sessions
those streams **alone offer 1,000 deliveries a second — `REQ-MONITOR-306`'s entire aggregate** — where the
strict fixed-period reading at `REQ-TOOLS-126`'s own 100 ms default would offer 200. The two readings therefore
differ by a factor of five in transport pressure as well as by 2,000 ms in echo. **Still the owner's**; if the
fixed-period reading is intended, one of the two published 100 ms figures has to move, which is a product decision.

**OQ-21 — Per-token prices: floating point in the format, exact decimal in the arithmetic.**
*(ADR-0031, ADR-0032; changes a persisted format.)* `REQ-PROVIDER-072` maps decimal-string prices "to
floating-point input/output cost per token" and the snapshot format types them as floats, while
`REQ-PROVIDER-121` states that no monetary amount — "**including the per-token pricing carried through
discovery**" — is computed in binary floating point anywhere. The same format block already types image
cost as a decimal string. **Recommended reading:** the price is carried and persisted as a decimal string
and the float typing is the defect, because a value that has been through a binary float cannot
afterwards be made exact.

> **Disposition, 2026-09-23 (R-049). RULED as recommended.** The price is carried and persisted as a decimal
> string and the float typing was the defect. Applied by amendment the same day: `REQ-CONFIG-088` types the
> fields as decimal ≥ 0 and takes a YAML number as the decimal its text states; `REQ-PROVIDER-072` and both
> snapshot formats carry decimal strings. ADR-0031 is accepted on the back of it, narrowed, and `PD-MONITOR-001`
> revision 2 makes configured rates produce a figure. See `owner-decisions.md`, "OQ-21 — per-token prices are
> decimal strings, ruled".

**OQ-22 — Does a spawned stdio child inherit the parent process environment?** *(ADR-0034; the
environment-resolution stage's signature differs by the answer.)* `REQ-MCP-087` and `REQ-MCP-090` fix the
precedence among sources of the environment map but never say whether the result **replaces or overlays**
the parent environment. Servers launched through package runners plainly need a search path, and
`REQ-MCP-037` judges availability by a path lookup, so some inheritance is implied — but "some" is not a
contract, and the official client library's own default is a curated safe subset, which would be a third
behaviour.

> **Reading taken on first execution, 2026-09-05 (Part S) — flagged for the owner, not resolved.** The child
> inherits the run host's environment **with the resolved map of `REQ-MCP-090` overlaid** (overlay, not
> replace): `REQ-MCP-087`'s "when the variable is unset, the key is omitted entirely" only makes sense as an
> overlay (an omitted key falls back to whatever the parent holds, or nothing), package runners need `PATH`,
> `HOME`/`APPDATA` and the `.cmd` wrap needs `ComSpec`, and the SDK's curated subset is a third behaviour the
> requirement never names. What is inherited is the run host's environment as it starts — no scrubbing is
> applied today (the ADR-0007/`REQ-GIT-031`-style name list is git's, not a general one; a general list would
> need the owner to say which names). Code: `resolveServerEnvironment` produces the overlay
> (`packages/config/src/mcp/environment.ts`), the run host hands the child `{ ...process.env, ...overlay }`
> through `OwnedStdioTransport`. The owner decides whether the parent environment should be scrubbed of
> named variables before the overlay and which; until then a secret in the run host's own environment reaches
> every stdio server.

**OQ-23 — What the reserved-token branch must do.** ***RESOLVED 2026-09-06 — the recommended reading, taken by
the first execution (Part T, ADR-0035's note; `spikes/code-intelligence-branch.md`).*** *(ADR-0035.)* `REQ-MCP-033`
describes the branch only as answering the protocol on standard streams, while `REQ-MCP-036` derives a command line
from the same entry and `REQ-MCP-099` runs it with three setup subcommands. **Recommended reading:** the branch is a
general pass-through and `REQ-MCP-033` describes what happens when the remaining arguments select the
server. If answered the other way, one of the two requirements must change.

> **Taken as the pass-through.** `apps/desktop/src/main/sentinel.ts` hands every remaining argument to the bundled
> runtime unchanged and propagates its exit status; `start-mcp-server …` makes it the server of `REQ-MCP-033`, and the
> three setup subcommands of `REQ-MCP-099` (`project create`, `project index`, `memories initialize`, each with the
> workspace root last) reach the runtime through the same branch — measured in the proof's setup launches (three
> `succeeded`, the marker written). Neither requirement changes. **One thing the entry did not anticipate:** Electron's
> binary on Windows exits before any JavaScript when a scheme-looking positional (the token's colon) is followed by
> another positional, so the launch is `Rotaris.exe builtin:code-intelligence -- …` — the token still first, `--` the
> branch's separator, dropped by it. Recorded in the spike and on ADR-0035.

**OQ-28 — What the two structural counts mean for a document-model interface.** ***RESOLVED 2026-09-02 —
the specification chose, and it chose reading 2 and then relaxed the requirement that reading breaks.***
*(ADR-0045, ADR-0051 consequence 3.)*

> **The live item this entry named — "the specification has not moved" — is discharged, and the sentence
> that carried it must not be cited.** It read: "`REQ-UIBENCH-050` still supports both readings in one
> paragraph and `REQ-UIBENCH-054` still states the invariant … while `resolutions/21` holds the drafted
> relaxation back." Both halves are now false. `REQ-UIBENCH-050` states in bold that **"The counting rule
> stated here is framework-neutral and is the operative one"**, spells reading 2 out — "a rendered
> paragraph, code block or list item inside a transcript row is a `widget`, and an element whose box is
> degenerate at the moment of counting is not" — and closes the escape route this entry identified as
> reading 1: the framework clause "explains only why absolute numbers do not travel between revisions or
> implementations; it does **not** license a product to count only the elements its own layout declares
> and to leave out what it drew." And `REQ-UIBENCH-054` carries the relaxation, in ESC-13's own terms:
> the element-count invariant is **withdrawn as unsatisfiable by any admissible implementation**, not
> merely as unmet, because the only structure that could hold it is a canvas and a canvas forfeits
> `REQ-CHAT-075`, `REQ-CHAT-077`, `REQ-CHAT-065` and `REQ-SHELL-144`.
>
> **The measurement is what makes this a resolution rather than a preference, and it is preserved below
> rather than replaced by the conclusion.** Spike 1 established that the two readings diverge in a
> running window in every run, at the `construct_window` → `apply_fixture` boundary, by +147 or +85, and
> that under reading 2 the count is a property of where the reader is scrolled rather than of the
> transcript. That is the fact the requirement was amended against.
>
> **The cost ESC-13 accepted is unchanged and is not softened by the closure**: under the operative
> reading the product ships a benchmark whose headline structural invariant is gone, in a domain whose
> whole point is determinism. `REQ-UIBENCH-088` makes it informational either way. ADR-0045 stands.

*The question as it stood, and the two readings between which it could not choose, are kept below.*

**Two things changed and neither is an answer.** *A ruling:* ESC-13 is decided — accessibility wins, the
canvas is refused outright, and if the framework-neutral reading is the operative one then
`REQ-UIBENCH-054` is **relaxed**. ADR-0045 therefore survives **either** reading, and this question stops
being existential for it: it decides which counting rule gets written down, and it changes a benchmark
field and nothing a user can see. *A measurement:*
`spikes/renderer-invariance-and-benchmark-cadence.md` settles whether the conflict is real in a running
window, which is what spike 1 was filed to establish, and **it is**. Under reading 1 `widgets` was
**629 at all 384 observations** — 84 phase records across twelve runs, 130 intra-phase probes, 110
tail-loop samples, 60 resize steps, two scroll variants, onscreen and offscreen — invariant by
construction rather than by where the phases happen to end. Under reading 2 it moves **630 → 777**
(reader at the top) or **630 → 715** (reader at the bottom) at the `construct_window` → `apply_fixture`
boundary, **in every run**, before any of the phases this entry discusses, by +147 or +85, and padding
cannot repair it because a zero-size element is excluded by the definition itself. Under reading 2 the
count also stops being a property of the transcript and becomes a property of **where the reader is
scrolled** — 777 at the top, 668 at the bottom, 747 at minimum window size, same product, same fixture,
same iteration. The spike declines to choose between the readings and so does this entry; what it
establishes is that the choice is real.

**The specification has not moved, and that is the live item.** `REQ-UIBENCH-050` still supports both
readings in one paragraph and `REQ-UIBENCH-054` still states the invariant, so the corpus currently
states a requirement its own definition breaks on one live reading — while `resolutions/21` holds the
drafted relaxation back. That is a specification-side action.

Two readings are
live and they do not differ by a number — they differ by whether the chosen architecture is admissible,
and **`REQ-UIBENCH-050` supports both in one paragraph.** **Reading 1:** it says both counts are "defined
against the interface framework the product is built on" and that their absolute values are "deliberately
not comparable between product revisions or between implementations", so the product says which of its own
elements are structural — application-owned layout elements in `widgets`, content nodes inside a row in
the informational `ui_objects` (`REQ-UIBENCH-109`). **Reading 2:** the same requirement defines `widgets`
by an observable test — "the number of live visual elements of the constructed window — those that occupy
space in the window's layout and can be painted" — and `docs/spec/resolutions/21-ui-performance-benchmark.md`
row 29 records the counting rules as "fixed in framework-neutral terms", while row 13 renames the second
field to `ui_objects` precisely because the old name "leaks one GUI toolkit's vocabulary into a schema". On
that reading the framework clause explains only why absolute numbers are not portable, and a rendered
Markdown paragraph, code block or list item **is** a `widget`. **Why it blocks:** under reading 2 the count
inside a row varies with content; `apply_fixture`, `ordered_appends`, `streaming_updates` and
`tail_replacements_1000` all change content; so ADR-0045's recycler fails `REQ-UIBENCH-054` for the same
reason a conventional virtualiser does, and the only structure that passes is a canvas, which
`REQ-CHAT-075`, `REQ-CHAT-077`, `REQ-CHAT-065` and `REQ-SHELL-144` rule out. **Under reading 2,
`REQ-UIBENCH-054` and the selection-and-accessibility requirements cannot both be satisfied** — *and
that is now a measured fact rather than a prediction.* **What has changed since this paragraph was
written:** the sentence that used to close it — "ADR-0045 proceeds on reading 1 and is **withdrawn rather
than amended** if reading 2 is confirmed" — is **withdrawn**, together with ADR-0045's own Revisit-if
clause and consequence 3 that carried it. ESC-13 ruled the exchange instead of leaving the record to pay
it: the requirement is relaxed and the architecture stands. The cost of that ruling is real and is stated
in ESC-13's own words rather than softened — under reading 2 the product ships a benchmark whose headline
structural invariant reports false, informational or not, in a domain whose whole point is determinism.

**OQ-36 — CLOSED by accepted review, applied 2026-09-07.** REQ-TOOLS-086
cites REQ-SANDBOX-006's unbracketed IPv6 canonical form. Brackets belong to URL
authority serialization. The classifier handles bare IPv6 and DNS host/port
inputs; regression coverage verifies repeated normalization and matching.

### Silence and under-determination

**OQ-2 — The workspace service.** *(ADR-0002.)* No slice other than DATA proposes it. Keeping it isolates
two genuinely unbounded workloads — project-supplied regular expressions and the deliberately unbounded
engine read — from both the windows and the runs, at the cost of a fourth process kind and one more
boundary in front of the board projection. `REQ-TRACE-239`'s 100 ms budget is measured *after* the engine
answers, so that crossing is real cost no requirement covers. **Measure the projection crossing at
`REQ-TRACE-300`'s scale before implementation begins** (spike 7). *SR-4 adds a second cost to each
answer.* The workspace service is now one of the **two** processes that open the workspace store, so
keeping it means two writer processes contending for one write lock on the path U-03 forbids delaying
(constraints W-01, W-02, W-05; spike 18) — and folding it into the run host removes that contention
entirely, which is what ADR-0058's alternative G exists to do by another route. Against that, the two
unbounded workloads are unchanged and are exactly what must not share a loop with a run. ADR-0002 records
the verdict that the topology stands, with one of its original reasons — the cost of the durable flush —
**explicitly withdrawn**, because a synchronous transaction commit is cheap where a whole-document
rewrite plus rename was not. The other six reasons are untouched by the store and each is independently
sufficient. **Neither of the two new costs has been measured.**

*Two further costs land on the same bill under ESC-15 and neither changes the balance on its own.* The
workspace service becomes the **only** process that resolves a workspace identifier and the only one that
opens the store, handing the run host a resolved store path (constraint W-18) — which is an argument
*for* keeping it, because folding it into the run host would leave nowhere for the resolution to happen
before a run exists. Against that, at quit **two of the three processes hold connections to one
machine-local store**, so the quit sequence must close two connections in a defined order rather than
leaving it to process exit (ADR-0014). And the record's own keying is now in tension with the
specification's notion of identity — see OQ-47.

**OQ-3 — Resolved.** See *Resolved, and closed with the reason* above.

**OQ-4 — Presenter registration: per window or per session?** *(ADR-0019.)* `REQ-TOOLS-053` defines
"unattended" as "the session has no registered approval presenter", while `REQ-MONITOR-253` requires an
approval request to reach the run that asked for it **even when that run is not focused**. If registration
tracked focus, an unfocused session's next `ask` would be classed unattended and denied by the headless
policy — silently, with the run still executing. The record reads registration as **per application
window**, with "unattended" a property of the application. **Confirm**, because it changes what
`REQ-TOOLS-069`'s "the presenter was torn down" means in a multi-window application.

**OQ-6 — The provider catalogue's declared attributes.** *(ADR-0012, ADR-0028.)* `REQ-PROVIDER-002`
declares the attribute set closed and `REQ-PROVIDER-003` rejects a build that violates it, yet
`REQ-CONFIG-370` names three further catalogue fields and spells the hosted connection mode differently;
`REQ-CONFIG-371` requires a quick-start URL on the entry and **branches on the connection-mode spelling**;
and `REQ-MONITOR-021` makes concurrency-quota sharing a declared property. Two questions: **which spelling
of the hosted mode is canonical**, and **does the quota property carry a number or a boolean** —
`REQ-CONFIG-095` gives one provider a cap of 3 by name while `REQ-MONITOR-021` gives a uniform cap of 2
and explicitly refuses to hold a list of names, and `REQ-PROVIDER-049` disclaims one too. A number
resolves the second cleanly.

**OQ-7 — Decision closed, 2026-09-07.** REQ-TOOLS-123 now cites
REQ-SANDBOX-077's host-path preservation rule. A backend unable to preserve
the host path refuses the command. Native confinement proof remains governed
by REQ-SANDBOX-127 and tracked as platform evidence.

**Historical question.** `REQ-SANDBOX-077`
requires every carve-out to exist only inside the confined view with the host filesystem holding exactly
what it held before, and forbids a backend that cannot do so from creating anything. `REQ-TOOLS-123`
records as a "documented, deliberate artifact" that an empty directory may appear inside a writable root
on one platform. **These cannot both hold.** The record implements `REQ-SANDBOX-077` — refuse rather than
create — because it is the fail-closed reading and is stated as an obligation on the backend.

**OQ-8 — CLOSED as a policy decision, 2026-09-06; implemented and measured 2026-09-13.** *(ADR-0009.)*

The accepted review names the **completed provider request** as the trigger: one `usage.update` per
request that contributes new usage, counting the usage a failed or partial request reported, skipping a
request whose figures leave the cumulative totals unchanged. `REQ-MONITOR-166`'s sampling keeps its own
cadence and neither raises nor suppresses one, and `REQ-SESSION-094`'s terminal `session.end` carries the
final cumulative totals regardless. Journal volume against `REQ-EVENTS-091`'s cap is therefore bounded by
the number of provider requests a run makes. `REQ-EVENTS-053` carries the amendment; ADR-0009 consequence
8 is reconciled with it.

***What building it found.*** The event was raised once per *iteration*, from the turn's returned report,
and that report carries only the attempts that survived: `resilientStep` discards the report of every
attempt it retries past, and `runWithChildren` returns the last parent turn of a resume loop. A run that
retried a transient failure or resumed its parent therefore spent tokens the session's totals, its terminal
event and its cost never counted. The decision's own wording — *including reported failed/partial-request
usage* — is what exposed it.

**Historical question — at what granularity is the usage event emitted?** `REQ-EVENTS-053` fixed only that
it must not be emitted with no figures and that it carries run-to-date cumulative totals.
`REQ-MONITOR-166` fixes a **sampling** cadence for the token-history sparkline, which is a different
thing. Whether a usage event accompanies every model turn, or follows the sample, or both, is unstated
and affects journal volume against `REQ-EVENTS-091`'s cap.

**OQ-9 — Decision closed, 2026-09-07.** REQ-TOOLS-111 now scopes cleanup
to terminal-tool process trees. REQ-HOOKS-033 retains its hook-descendant survival
exception. Hooks Settings discloses the distinction. Crash-path evidence remains
part of platform validation.

**Historical question.** `REQ-HOOKS-033` states
that descendants **may outlive the hook and the run**, that the run must neither track nor report them,
and that termination must not widen to the process group. `REQ-TOOLS-111` requires that once the
application has exited, no background command it started is still running, **whatever ended it** — which
on Windows needs a kill-on-close job covering the run host's subtree. If that job covers hook
descendants, `REQ-HOOKS-033`'s allowance becomes false at exit. **Recommended reading:** the job covers
only terminal-session children, because `REQ-TOOLS-111` sits in the terminal-execution section of domain
05 and `REQ-HOOKS-033` states its allowance in terms. *Unchanged in substance, more urgent in fact:*
ADR-0002 now records the run-host crash as an **accepted** consequence rather than a disputed one, so the
kill group must survive a **crash** of the run host and not only an orderly exit, or `REQ-TOOLS-111` is
unmet in exactly the case the record has just agreed to live with.

**OQ-10 — Signals on Windows.** *(ADR-0020.)* `REQ-TOOLS-096` and `REQ-TOOLS-110` fix a signal vocabulary
and `REQ-TOOLS-109` fixes a terminate-grace-kill sequence for background termination. Windows has no
signals; a send-signal call there has no faithful mapping, and the specification neither maps them nor
refuses them. The chosen pseudo-terminal library documents that its signal argument is **ignored** on
Windows.

**Ruled 2026-09-21 for background pipe sessions, on the owner's fix instruction ([R-044](../product/requests.md#r-044)); the foreground/PTY scope stays open.** A pipe has no graceful interrupt on Windows, so SIGINT and SIGHUP terminate the session's own tree there — the mapping SIGTERM and SIGKILL already used (`packages/agent-tools/src/terminal/background.ts`). `send_signal` therefore delivers every signal in its vocabulary on every platform, as `REQ-TOOLS-110` states, and the stream-control `interrupt` (`REQ-TOOLS-128`) stops a win32 background session instead of answering false.

**OQ-11 — Resolved by dissolution.** See *Resolved, and closed with the reason* above, and **OQ-44**,
which the closure opened.

**OQ-12 — The WORDING is CLOSED as a policy decision, 2026-09-06 and applied 2026-09-13; the MEASUREMENT
stays open as evidence debt.** *(ADR-0004, ADR-0058.)*

The accepted review answers the question this entry actually asked — what "atomic", "durable" and "flushed"
each promise — and `REQ-SESSION-034` is now the product's single definition, in **three levels** that may not
be collapsed: **(1) process-crash atomicity for every successful write**, owed unconditionally and never
traded; **(2) operating-system and power-loss survival for an acknowledged terminal commit and a completed
backup artifact**, subject to the storage device honouring the flushes the product issues — a condition
stated rather than assumed, because a device that acknowledges a flush it did not perform cannot be detected
from software; and **(3) a permitted loss of intermediate updates** between those boundaries, stated as
permitted rather than left to be discovered. The stronger terminal commit setting is preserved and may only
ever be reconsidered on power-loss and operating-system-crash grounds, never on readability, which
`spikes/commit-on-the-publish-path.md` §11.4 already disproved as a reason. `REQ-LIBRARY-138`'s "flushed to
disk" — the one durability verb the corpus carried, promising a level it never named — and
`REQ-LIBRARY-043`'s "readable after a crash or loss of power" now cite which level they mean instead of
implying one.

***The evidence is NOT discharged and the wording says so itself.*** No power-loss test has been run on any
supported platform. Both figures this entry owes — whether an acknowledged commit survives a power cut, and
how far behind the ordinary setting can be in commits and milliseconds — come from the same run, and the
fault half is a physical act on this machine that only the owner can perform: a forced power-off, or a
kernel crash that loses the operating-system cache while the disk stays powered, which is what separates the
software claim from the device's honesty. `spikes/power-loss.md` carries the steps and an empty table. The
proof is tracked **per supported platform**; on this one it is owed and unmeasured, and on the other two it
cannot even be attempted while **IC-3** stands. **Accepting the wording did not measure anything**, and no
surface may make a claim stronger than the three levels above until the table is filled.

**Historical question — durability semantics are unstated. *Materially moved by measurement — and the fact
it partly rested on is false. A SECOND measurement on 2026-09-02 pulls the same way and RAISES the
stakes.***

***Added 2026-09-02, and this entry is now larger than it was.*** Two things changed. **(a)** The
directory-flush picture gained a second, apparently contradictory result:
`spikes/remote-and-synchronised-storage.md` §8 found the call returning `EPERM` on **every** path spelling
**including local NTFS**, where the writer-handle spike found it succeeding 200 of 200. The two are
consistent and **the reconciliation is INFERRED rather than measured** — the second harness opened the
directory the ordinary way, which is read-only, so the available call needs a handle deliberately opened
for write. Both figures are kept rather than one being picked. What the pair adds is operational: **the
naive call an implementer would reach for fails everywhere**, so "add the missing flush" produces an error
rather than a guarantee, and no durability step may assume the containing directory is flushed. **(b) The
power-loss half of this question is no longer only about a file replace — it is now the SOLE STATED GROUND
for a durability decision in the store.** `spikes/commit-on-the-publish-path.md` §11.4 disproved the
reason ADR-0058 gave for forcing the stronger synchronous setting on a terminal save (readability, which
the weaker setting delivers across processes and bindings), and the decision was re-grounded on power-loss
and operating-system-crash survival — the one property the weaker setting in write-ahead-log mode
explicitly lacks. **Nothing measured anywhere says whether a committed log frame survives a power cut.**
So the unnumbered power-loss measurement this register already owed now decides two things rather than
one, and it is the only evidence that would keep an optimiser from dropping the forcing.

*(ADR-0004.)* No requirement asks for a file-system sync.
`REQ-LIBRARY-138` asks for one file to be "flushed to disk", the only durability verb in the corpus;
every other crash-safety requirement is phrased as an **ordering** or as **the replace is atomic**.

***The measurement corrects this entry rather than answering it.***
`spikes/windows-writer-handle-compaction.md` §3.3 shows a directory `fsync` fails **only on a read-only
handle**; on a write-opened directory handle it returns success, **200 of 200, at a mean of 0.115 ms**.
So the sentence this entry carried — that a directory sync is unavailable on Windows through the runtime,
and therefore the POSIX rename-durability idiom cannot be applied uniformly — **is withdrawn and must not
be cited.** The call is available. **What is not established is the guarantee**: a success return does not
prove the semantics, and the harness explicitly declined to claim it, because that needs a power-loss
test and no power-loss test has been run on any supported platform. The question is therefore now *"does
a directory `fsync` mean anything here"* rather than *"is it available"*, and the answer changes one line
of ADR-0004's replace path. The record's decision not to perform one is unchanged; **its ground is
replaced**, from a platform limitation to a decision with a price. **A power-loss test is the measurement
that would close this and it is deliberately not a numbered spike**, because no requirement asks for the
guarantee and it does not block the gate — but nothing establishes that a replace survives a power cut
anywhere, and this cannot be closed without it.

The question is whether "atomic" means
only "no torn read" — which rename gives — or also "survives a power loss", which it does not without
syncing the file before the rename. `REQ-LIBRARY-043` says "a write interrupted by a crash or power loss
must leave the artifact readable", which is satisfied by either reading. The record proposes syncing the
staged file and no directory sync. **What SR-4 changes and what it does not:** the question now applies
only to the five stores that remain files — configuration, credentials, the discovery snapshot and the
per-user documents, the user's repository artifacts, and `summary.md` (constraint D-07). Its sharpest
citation, `REQ-LIBRARY-138`, has moved to a row, so **every durability obligation still resting on a file
is phrased as an ordering or as "the replace is atomic" and none of them uses a durability verb at all.**
The store's own durability is decided separately and explicitly in W-06 and is **not** part of this
question; it is neither better nor worse than the file design's userspace flush against the failures
`REQ-EVENTS-029` names, and W-06 says which failures those are.

***Taken 2026-09-04 in its harness half — `spikes/power-loss.md`.*** The measurement now has an instrument:
a writer committing at `NORMAL` with periodic `FULL` commits and both replace shapes (ADR-0004's, and the
same plus a write-handle directory `fsync`), a process-death baseline (ten of ten lost nothing, gap-free,
whole), and a verifier whose dry run — a WAL tail truncated at a recorded `FULL` commit — reports exactly the
rows after the cut lost and everything before it present, ten of ten. **None of that is evidence about a
power cut**, and the report says so in its own section 3. The fault itself is a physical act on this machine
that only the owner can perform — a forced power-off, or a kernel crash that loses the operating-system
cache while the disk stays powered, which separates the software claim from the device's honesty — and the
report carries the steps and an empty table. This entry closes or narrows when that table is filled; both of
the figures it decides (whether a returned `FULL` commit survives; how far behind a `NORMAL` record can be,
in commits and milliseconds) come from the same run, and the directory-`fsync` half gets its answer from the
two documents' lag against each other.

**OQ-13 — Stderr in foreground capture. Decision closed 2026-09-07.** The accepted amendment to
`REQ-TOOLS-098` requires capture-aware advice: merged foreground PTYs capture stdout and stderr;
empty soft pauses report that fact and offer polling or interruption. Redirection advice applies
only to a backend that excludes stderr. ADR-0020, tool help and observations now agree; a real
PowerShell PTY regression verifies stderr capture and the soft-pause advisory.

Historical question: *(ADR-0020.)* `REQ-TOOLS-098` requires the soft-pause detail to
tell the agent the process "may be writing to stderr" and to suggest re-running with a redirection, which
only makes sense if stderr is **not** captured — while a pseudo-terminal-backed persistent shell, required
by `REQ-SHELL-166`, necessarily merges it. The advisory text is required content either way, but the
underlying capture semantics should be stated.

**OQ-14 — `secrets.yaml` is given no file mode. *RESOLVED 2026-09-02 by amendment, under ESC-27.***
*(ADR-0004; ESC-27.)* `REQ-CONFIG-216` **now requires every write to leave the file at mode `0600`**, with
no group or other bit, applied **explicitly on every write** rather than inherited from the process mask or
the parent directory; on a platform with no POSIX mode the protection is `REQ-PROVIDER-016`'s explicit
owner-only access control, cited rather than restated; and `REQ-CONFIG-444`'s "leave the platform's own
default in place" fallback is **explicitly denied to this file**, because inheriting the platform default is
the outcome this question was raised about. Where the protection cannot be applied, the write does not
happen. `REQ-MCP-082` and domain 16's secrets appendix now cite `REQ-CONFIG-216` instead of restating the
write without a mode. ***One consequence for a reader arriving from elsewhere: ADR-0004's table entry
reading "no mode at all (OQ-14)" is now false and is not this register's to edit.*** The entry as it stood
is kept below, because a question is only legible beside what it was asking.

*As it stood:* `REQ-CONFIG-444` requires a mode for every
writer of the main configuration file and `REQ-CONFIG-212` for the discovery snapshot; `REQ-CONFIG-216`
requires the secrets file's write to be atomic and to create its directory and **says nothing about
mode**, so on the plain reading it inherits the process mask. It is the one file in the workspace that
holds credentials by design. This looks like an omission rather than a decision, and `0600` would be the
obvious value — **raised rather than chosen**, because tightening a mode the specification left unstated
is still a change to an observable. *Wholly unaffected by SR-4: `secrets.yaml` is configuration a user
edits and version control tracks, so it stays a file under the ruling's own principle, and the question
survives intact. It is the only survivor of the OQ-11/OQ-14 pair the atomic primitive carried.*

**OQ-15 — Decision closed 2026-09-07.** REQ-TOOLS-101 retains the fixed compatibility
label `ValueError`; REQ-SANDBOX-083 fixes wrap refusals to `SandboxUnavailableError`.
Stable `failure_kind`/outcome codes govern machine classification. Implementation exception names
are optional redacted diagnostic detail. ADR-0001 records the amendment. Validation and gate
coverage are implemented; confinement-wrapper integration remains tracked in the progress ledger.

Historical question: *(ADR-0001.)* `REQ-TOOLS-101` fixes `ValueError` as a
literal observable value and `REQ-SANDBOX-083` defines the sandbox case as "the type name of the failure"
— an implementation-language-dependent string on an otherwise machine-readable field. Under ADR-0001's
language choice neither is a language artifact. Either `error_class` is a **closed product vocabulary**,
in which case the sandbox and terminal values need enumerating, or it is free text, in which case
`ValueError` is not a contract.

**OQ-16 — Decision closed, 2026-09-07.** REQ-TOOLS-049 now defines this
release's rule lists as shipped presets. Existing mode, grant and declared
permission controls remain authorable. A custom rule format requires a future
schema and validation contract.

**Historical question.** `REQ-TOOLS-049`'s "rule
lists replace rather than deep-merge across layers" reads as though a user may author permission rules,
but **no configuration key anywhere in domains 05, 10 or 15 defines one**, and the presets are fixed.
Either user rule authoring is in scope and needs a key and a settings surface, or the sentence covers only
the shipped lists and should say so.

**OQ-17 — Do a locally-hosted agent runtime's tool calls pass through the product's permission engine and
event stream?** *(ADR-0026; likely to become an escalation.)* `REQ-PROVIDER-117` tells the user the
product invokes a locally installed agent SDK and that traffic goes through it; `REQ-PROVIDER-049`
describes an external local-runtime subprocess; `REQ-MCP-043` requires the normalised server description
for "every agent backend the product supports". **No requirement states whether the approval flow of
domain 05, the tool events of `REQ-EVENTS-041` and the transcript rows of domain 03 are produced for tool
calls the external runtime performs itself.** This decides whether that provider is a model or a whole
agent. If the answer is "they do not", it is a **user-visible narrowing of the permission guarantee** and
must be escalated rather than absorbed.

**OQ-18 — What "shipped model-capability metadata" is.** *(ADR-0028.)* *Part K (2026-09-05) ships the module EMPTY with a shape test: every discovered model exposes no reasoning levels until the owner decides the table's source and update policy; the slots grid keeps offering the five levels for a configured model.* `REQ-PROVIDER-137` and
`REQ-PROVIDER-149` both draw on metadata the product ships that knows, per model, whether a
reasoning-effort parameter is supported, which levels are disclaimed, and whether images are accepted.
Nothing states where it comes from, how it is keyed, or how it is updated. Treating it as build data
alongside the known-limits table is the obvious reading, but it is a **third table of third-party model
facts** and its update policy should be decided deliberately.

**OQ-19 — CLOSED by accepted review, applied 2026-09-07.** REQ-PROVIDER-018/063
and ADR-0029 now permit adjacent coordination locks. Completed operations remove
their own staging files and preserve overlapping operations' files. Enumeration
filters credential JSON. Regression coverage verifies a completed write beside
another operation's retained lock. The following paragraphs preserve the historical question.
`REQ-PROVIDER-018` says that once any credential operation has finished the directory holds nothing but
the per-provider files; `REQ-PROVIDER-152` requires an **adjacent** lock file for every read-modify-write.
The record reads the first as being about the operation's temp files. If it is meant literally and
exhaustively, the lock file must live elsewhere, which "adjacent" would then have to permit. *Still open,
with a cheaper resolution than it had: `REQ-PROVIDER-152`'s stated premise — "may be reached by more than
one application instance at once" — is withdrawn by SR-1, so the requirement is a candidate for amendment
under the standing direction, and **withdrawing the lock file makes the contradiction disappear rather
than needing adjudication**. If it is kept, the reclaim-a-dead-holder clause must be kept with it: that
clause is the part SR-2 makes* more *important, because it is the only thing that settles a lock an
instance that crashed left behind, and `REQ-STARTUP-164`'s reclaim path is one interval in which two
processes of this application genuinely coexist (constraint C-14). **Deleting a lock file and deleting a
settle-a-dead-owner obligation are different acts.***

**OQ-20 — CLOSED by accepted review, applied 2026-09-07.** REQ-PROVIDER-012/057
now explicitly preserve credentials and last-error state for REQ-PROVIDER-013's
pre-contact failure result. The unsupported-method implementation and regression
coverage follow that exception. The following text preserves the historical question.

**Historical OQ-20.** The 30-second
non-interactive attempt that fails before contacting a provider must produce the failure result and
nothing else — no traceback, warning or other diagnostic in the log or the interface (`REQ-PROVIDER-013`).
Every other failure path records a per-provider last error (`REQ-PROVIDER-057`). Does the last-error
record count as "shown anywhere in the interface"? Read literally it does, so **this one path must skip
it**.

**OQ-24 — No cost budget for the parse-requiring checks.** *(ADR-0040.)* `REQ-TRACE-088`'s one-second
budget covers "the sweep alone — enumeration, reading and matching". `REQ-TRACE-104`'s re-export-only test
and `REQ-TRACE-109`'s test-function collection both require a **full syntax tree**, and `REQ-TRACE-091`
requires them in the same verification run. No budget is stated for them, and at the stated scale a
full-fidelity parse is materially more expensive than a pattern pass.

*Part AJ (2026-09-09), the first execution: unmeasured still, by design — wave 1 reports REQ-TRACE-104 rule 1 and 109/110 as `requires-parse` findings for the built-in convention and runs both checks fully for pattern-declared conventions. Spike 7's 1,000-file tree (`spikes/traceability-scale.md`) is the corpus for the measurement; the sweep itself is 244–391 ms, so the parse-requiring checks have about 600 ms of REQ-TRACE-088's budget if they are to share it, though no requirement says they must. AJ′ measures the TypeScript compiler API against it.*

*Part AJ′ (2026-09-10), the second execution: MEASURED, and the premise is falsified. The TypeScript compiler API (5.9.3) parses the spike's thousand-file tree in 202 ms warm and 255 ms cold, 0.202 ms a file, after a load of about half a second once per process. Inside a real sweep it never sees a thousand files: only those a pattern cannot decide are parsed, which was 200 files in 34 ms on the same tree. So a full syntax tree is NOT materially more expensive than a pattern pass at the stated scale, and `REQ-TRACE-104` rule 1 with `REQ-TRACE-109`/`110` fit inside `REQ-TRACE-088`'s one second beside the sweep rather than competing with it. What the entry asked for was a budget and what exists now is the cost; stating the budget is the owner's, and the open count is left untouched here for that reason. One residue is recorded rather than hidden: `typescript` is not a runtime dependency of the packaged desktop application, so in a packaged build both checks degrade to the `requires-parse` finding naming that cause (Part AJ′'s handoff, ruling request 2).*

*Part R″ (2026-09-11): closed, and the way it was measured is now honest.* Part AJ′ answered the
substance — the TypeScript compiler API decides `REQ-TRACE-104` rule 1 and `109`/`110` over spike 7's 1,000-file
tree in about 200 ms warm, after a one-time load of 0.3–0.6 s per service process. What wave 3 changed is the
assertion that guards it: the linear-growth ratio was a quotient of two single wall-clock readings, which is
load-sensitive by construction and had already gone red once at 3.06 against a 3.0 threshold. It is now the
quotient of the **minimum of three readings** on each side, with a **work-count ratio asserted unconditionally**
beside it and the timing ratio recorded rather than asserted below a 25 ms floor. **The threshold was not moved.**

**OQ-25 — Project-supplied regular expressions run unbounded.** *(ADR-0040.)* `REQ-TRACE-073` compiles
four patterns per project-declared convention and evaluates them against every claimed file;
`REQ-TRACE-154` states that the absence of any time or resource limit on the scan is "a deliberate
decision and not a gap", and `REQ-TRACE-225` places no wall-clock bound on the engine read. A pattern with
catastrophic backtracking therefore hangs the pass indefinitely, and the specification's own mitigations —
the board stays usable, the last good board stays on screen — cover the **symptom** but leave the pass
wedged. ADR-0002's worker-thread placement makes it terminable; **whether it should be terminated, and
what the user is told, is not specified.** The pattern arrives with a checked-out repository, not from the
user.

*Part AJ (2026-09-09), the first execution's decision: no bound on the pattern (REQ-TRACE-154/225 forbid one). The pass runs on a worker thread; a cancel raises a shared flag the pass observes at its next checkpoint, and a worker that has not answered 2 s after the cancel is terminated and respawned for the next job. Termination happens only on the user's cancel, never on the engine's initiative, and the user is told only "cancelled". Whether the engine should ever terminate on its own, and what it says when it does, stays open.*

*Part R″ (2026-09-11): the regex bound stands as Part AJ decided it. Recommended: close, with the
pattern-COST question — a catastrophic-backtracking guard — raised as its own item rather than carried here.*

**OQ-26 — Resolved.** See *Resolved, and closed with the reason* above.

**OQ-27 — Resolved by dissolution.** See *Resolved, and closed with the reason* above.

**OQ-29 — Native surfaces under a dark theme.** *(ADR-0048.)* `REQ-SHELL-160(b)` makes it an acceptance
criterion that no native surface presents a light background while a dark theme is active, on each
platform, and names native dialogs as things to inspect on screen; `REQ-SHELL-164` says the product is
answerable only for what it supplies to a native dialog. On most platforms the operating-system folder
chooser follows the **system** setting and no application-side call changes that, while four requirements
require the product to use native choosers. The record's reading is that `REQ-SHELL-160(b)` covers
surfaces the application itself tints and `REQ-SHELL-164` carves out the host's own dialogs. **Needs
confirming rather than assuming.**

**OQ-32 — Which process the benchmark's per-process figures describe.** *(ADR-0053.)* `REQ-UIBENCH-050`
reports memory, thread and handle counts "for the process that produced the record". In a multi-process
engine there are several. The record proposes the renderer process of the measured window; the sum over
the iteration's process tree is also defensible and gives different numbers. Since comparability is only
claimed between runs of one revision, either is conformant, **but the choice must be recorded**.

**OQ-33 — The configuration-home variable on non-Linux hosts.** *(ADR-0053, ADR-0042.)*
`REQ-UIBENCH-039` names it contractually and it is meaningful on one platform only. The record reads it
as named because it is the one *standard* variable available, with the benchmark-private variable
carrying the same job elsewhere. If instead the preference store must honour it on all three platforms,
ADR-0042's resolution order should say so. Either reading is implementable; they are different.

**OQ-34 — Demo mode and process-wide network silence.** *(ADR-0055.)* `REQ-SHELL-005` says that in demo
mode "the process opens no outbound network connection for its whole lifetime", while `REQ-SHELL-162`
lets a demo window be opened from a non-demo window and `REQ-STARTUP-057` says a non-demo window of the
same process is unaffected and checks for updates normally. **Those cannot both hold once a mixed process
exists.** Either the claim is per-window rather than per-process, or a demo window must be its own
process. *SR-1 sharpens this rather than resolving it, and forces the direction:* with one instance a
mixed process is not an unusual configuration to be avoided but the **only one available**, and "a demo
window must be its own process" is no longer an option the architecture can take, because a second
process of this application is exactly what `REQ-STARTUP-161` forbids. The per-window reading is
therefore the only one that can hold, and it should be **stated in the requirement rather than inferred**
by every reader who meets the pair. Still needs a product-owner statement.

**OQ-35 — Decision closed, 2026-09-07.** REQ-SANDBOX-079 now defines each
confined command as a fresh inner shell initialized from configured session
working directory/environment. Changes inside that invocation end with it.
Unconfined commands retain their persistent shell. REQ-TOOLS-123 cites that
lifetime, and tool help/observations must disclose the active mode.

**Historical question.** Foreground calls accumulate working directory,
exported variables and aliases in a persistent shell (`REQ-TOOLS-097`), but a confined command is rendered
as a nested shell invocation submitted into that shell (`REQ-SANDBOX-079`), so a directory change or an
export inside a confined command lives in the inner shell and dies with it. **Does shell state persist
across confined foreground calls?** The two requirements describe different behaviour for the unconfined
and confined modes and neither says so. This must be resolved before the terminal tool's description is
written, since the description is what tells the agent whether a directory change persists.

**OQ-37 — CLOSED by accepted review, applied 2026-09-07.** The fetch tool
uses explicit direct transport for every hop. Proxy environment variables,
system settings and global dispatchers have no effect. Tool help and failures
disclose this requirement. A local target/proxy regression verifies zero proxy
contacts for direct fetch and confirms the proxy receives the control request.
The following text preserves the historical question.

**Historical OQ-37.** Nothing says whether `fetch` honours system or
environment proxy settings. It matters: a proxy changes which host a connection is actually opened to, and
`REQ-SANDBOX-022` promises that a denied host observes zero connection attempts. The chosen client does
not honour proxy environment variables by default, which makes "no proxy" the de facto answer — the
fail-closed direction, but one that will surprise corporate users and **should be an explicit decision
rather than a library default**.

**OQ-39 — A presenter that is registered and never answers. *Premise stale on one side; the record's
answer is strengthened; the window is still unanchored. MEASURED 2026-09-02 AND EXPLICITLY NOT CLOSED.***
*(ADR-0019; not blocking. Constraints T-41, T-31.)*

***What spike 14 settled, and what it deliberately did not.*** `spikes/presenter-liveness-and-instance-claim.md`
**settled the mechanism**: a gap-based poll detected all nine blocked runs at **+386 to +468 ms** on a
500 ms threshold, with **zero false lapses in 258 s** of unblocked running and a maximum idle channel gap
of 303 ms. It also settled three things this entry did not ask. **(1) The check must be gap-based, not
reply-based** — while main was blocked the channel never closed, the process probed alive, every message
was accepted, and when the block ended **all 84 outstanding replies arrived**, the last at 7,885 ms round
trip, so a "did the reply arrive" check reports success eight seconds late and never fires. **(2) The
exposure is not the approval dialog**, which cost the poll nothing at a 266–267 ms maximum gap; it is
**every synchronous native dialog anywhere in the product**, during which no main-process JavaScript runs
at all — 0 timers, 0 handled renderer messages, 0 replies to the run host, over 6,489 ms and 7,339 ms.
That is now constraint **T-31**'s stated dependency and an application-wide prohibition in ADR-0019.
**(3) No platform signal for an unresponsive main is usable from the run host** — the operating-system
signals detect a busy loop and **never** a native modal, and reaching them from a Node utility process
needs a native addon and was not measured.

***What it did not settle is exactly the thing this question asks.*** **The window is still not sized.**
The spike's main process paints one heading: no renderer framework, no transcript pipeline, no session
writer, no workspace service, no version-control invocation. It does **not** reproduce the 22,777 ms of
event-loop lag `spikes/ipc-hop-latency.md` measured under frame load, which is the state the window has to
survive. **So the floor is narrower and it is still a floor.** ADR-0019's existing Revisit-if — that a
window which cannot be set wide enough turns this into an escalation — **stays live**, and the measurement
this entry needs is a liveness poll answered by a main process carrying product-shaped load.

***This entry's opening sentence is superseded and is kept only because ADR-0019 and constraint T-41 both
quote the wording it describes.*** It states that `REQ-TOOLS-053` and `REQ-TOOLS-069` define attendedness
as **presence** of an approval presenter. **They no longer do.** `REQ-TOOLS-053` now reads: a session
counts as interactive "exactly when an approval prompt for that session can be put in front of a person",
and `REQ-TOOLS-064` glosses the unattended case as one "for which the modal dialog of `REQ-TOOLS-063`
cannot be shown". Registration absence is a *sufficient* condition in `REQ-TOOLS-069`'s next sentence,
not the definition.

**That strengthens the record's answer rather than changing it.** Presenter registration is revoked on a
lapsed channel-level liveness signal as well as on a closed channel, which settles in-flight waits
through `REQ-TOOLS-177`'s teardown cancel (mapped by `REQ-TOOLS-052` to deny with source `cancelled`) and
routes later asks to the headless policy, without putting a timer on the user's wait. Under the amended
text that poll is **the implementation of the specification's own capability test** — a wedged presenter
is not one an approval can be put in front of — rather than an architecture-invented answer to a gap. One
narrowing comes with it: `REQ-SANDBOX-101` fixes attendedness "at the moment its mode is resolved", so
the revocation governs where a **later** ask is routed and never revisits a mode resolution already made.

**Two halves remain open and they are now different from each other.** The *TOOLS* half is answered by the
amended `REQ-TOOLS-053`. The *SANDBOX* half is not: `REQ-SANDBOX-101` still says "Only the presence of
that channel is tested, not whether it later answers" **and** asserts that its condition is exactly
`REQ-TOOLS-053`'s and `REQ-TOOLS-069`'s, which are no longer the same condition — reported as a
specification defect, with the reconciling reading (the clause is about the **person** not answering)
recorded as a reading and not as the text. And the **lapse window** is still a free parameter no
requirement anchors, with `runtime.approval_timeout_seconds: 0` still removing the only backstop
`REQ-SANDBOX-101` names.

**The measurement gives the window a floor and does not size it.**
`spikes/ipc-hop-latency.md` measured a single `webContents.send` of a 69 KB payload taking **88.263 ms**
while main's event loop was otherwise **idle**, and observed the wedged-main state directly at
**22,777 ms** of event-loop lag — so the window must clear the first comfortably and catch the second.
**The spike never showed a modal dialog**, which is exactly the case the window has to survive, so spike
14 is **not** discharged. If no workable window exists this still becomes an escalation between a hang at
`0` and a specification change.

**OQ-40 — The maximum supported transcript viewport height. *Premise now measured rather than argued;
still open, and the choice has a scale.*** *(ADR-0045; not blocking.)* The transcript's slot pool must be
a fixed capacity or `REQ-UIBENCH-054`'s element-count invariant has no meaning, but nothing in the
specification bounds the viewport: `REQ-SHELL-022` fixes the opening (1440×900) and minimum (1000×680)
window sizes and **no maximum**. ADR-0045 declares a product constant `H_max` and sizes the pool at
`ceil(H_max ÷ 30 px)` plus overscan, 30 px being `REQ-CHAT-057`'s minimum row height.

***The earlier formulation — size the pool for "the largest viewport the window can reach" — is now known
to have no referent, which was argued and is now measured.*** On Windows a content height of **20,000 CSS
pixels was requested, granted, and reported by the renderer as a real laid-out viewport**, on a machine
whose tallest display is 1,080 px and where the display enumeration offers nothing that bounds it. The
window manager did not clamp; the reachable height was at least 20,000 px and was not probed further. A
declared constant is therefore the **only** thing available to write down, not merely the tidier option.

**The measurement also gives the choice a scale.** At 20,000 px the viewport calls for **671 slots
against a pool of 80** — so the growth branch, if the constant is set low, means the transcript pane is
blank below the pool's coverage until it grows. And it confirms the not-blocking claim empirically rather
than by argument: across every phase record and all sixty resize steps of twelve runs the largest slot
count the viewport ever called for was **34**, with a pool-growth watermark of **0**, because
`REQ-UIBENCH-060`'s sweep never exceeds the construction size and `REQ-UIBENCH-098` pins the display
environment.

**Somebody must still choose the number**, because choosing it fixes the behaviour on a display taller
than it. It is a product statement about supported hardware rather than an implementation constant, which
is why it is filed rather than chosen. *Not measured and therefore not claimed:* behaviour when a display
is attached or removed while the window exists, behaviour at a scale factor other than 1, and whether
either other platform's window manager clamps where Windows does not.

**OQ-41 — CLOSED as a policy decision, 2026-09-06; implemented and the contended case STAGED 2026-09-13.**
*(ADR-0004, ADR-0040 — both of which cite this as "OQ-38", a provisional number that collided with the
entry above; ADR-0040 proceeds and does not treat it as blocking its own ratification.)*

The accepted review takes the closure this entry itself named — **`REQ-TRACE-061` gains a bounded ladder** —
and settles the residue on both halves. The write keeps its complete-file guarantee unnarrowed: a reader
never observes a partial file and two writers never leave a blend, whatever the contention. The **independence
promise is scoped to whole invocations and view freshness**, which is the reading `REQ-TRACE-502`'s own middle
sentence supports; ordering individual whole-file operations against one another is permitted, and is how the
single I/O owner of ADR-0040 meets the guarantee. **Exhaustion produces a recoverable error with the old file
retained** — the clause "an invocation SHALL NEVER fail … because another was running" is narrowed rather than
kept whole, because it could not be met as written, and the honest outcome of a held file is a failed operation
the user can repeat rather than a corrupted artifact. `REQ-TRACE-182`'s adapter keeps its catch-and-report
behaviour explicitly, because the test session is the one concurrent invocation the product still has.

***What building it found — two defects, both in the case this entry kept open.*** The ladder was cited by
name all over the implementation and **`REQ-TRACE-061` did not state one**; it said "the failure re-raised".
Worse, the generator that writes the artifact — `tools/symbol-artifact/generate.mjs`, the one the test session
runs — replaced it with a single `writeFileSync` **over the target**, with no staging, no rename and no ladder,
so a concurrent reader could observe a partial artifact (`REQ-TRACE-502` forbids that in terms) and a transient
failure escaped uncharacterised. And the adapter did not catch: `execFileSync` throws on a non-zero exit and a
throw out of vitest's `globalSetup` **fails the whole run before one test is collected**, which is exactly what
`REQ-TRACE-182` says SHALL NEVER happen. Both are repaired, and the write now goes through a shared
`tools/symbol-artifact/replace.mjs` carrying the requirement's own contract and constants.

***The contended case is STAGED, and it passes.*** The 2026-09-09 note below records that it was not — "the
contended case, a test session in the same checkout on Windows, was not staged and the residue stands".
`tools/symbol-artifact/replace.test.ts` now holds the artifact open with a real descriptor, drives the ladder
to exhaustion, and asserts the previous file byte-identical with no staged leftover. Residue **(a)** is
therefore measured rather than argued. Residue **(b)** — a foreign process, an editor, an indexer, antivirus, a
cloud-sync client — is *characterised* rather than removed: it produces the same recoverable failure, which is
what the amendment fixes as the correct outcome, and no product change can stop a foreign holder.

**Historical question — `REQ-TRACE-502` on Windows.**

**The ruling said this was dissolved. It is not, and the record must not record a closure it did not
earn.** SR-4 argued that "that defect is unreachable in a store whose readers do not block its writers" —
but `REQ-TRACE-502` governs the generated symbol artifact, the three baselines and the retired-identifier
log, and **SR-4's own table keeps all four as plain files in the user's own repository**. They never
reach the store. ESC-14 is ruled and SR-4 now carries the correction in place.

***What has changed since: the correction is now backed by a requirement rather than by an argument.***
`REQ-TRACE-513` was minted in the amendment pass and states positively that those four artifacts **SHALL
be plain files in the user's own repository and SHALL NOT be moved into any store the application keeps
for itself**, recorded as a boundary "so that relocating them is a change someone has to argue for rather
than an optimisation that can be made while every other requirement still appears satisfied". So no
store's concurrency properties reach them, and no future reader can close this entry by pointing at the
store. Constraint D-30.

*The mechanism, unchanged:* `REQ-TRACE-502` requires concurrent invocations to be safe with no lock,
lease or coordination file, that **no invocation wait for another**, and that an invocation "SHALL NEVER
fail, hang or leave a lock behind because another was running." ADR-0004's own spike shows why the last
clause was unreachable: Node requests no share-delete, so an ordinary **reader** holding a descriptor
makes a concurrent replace fail with `EPERM`.

*What is now reached, and by what.* The premise was an unbounded population of concurrent toolchain
invocations in independent processes. **SR-1 removes it**, and two of its three supports are gone
outright: the toolchain has no command line (`REQ-TRACE-142`, `REQ-TRACE-144` to `REQ-TRACE-151`,
`REQ-TRACE-153`, `REQ-TRACE-184` to `REQ-TRACE-186` withdrawn), `REQ-TRACE-206` forbids launching the
engine as a process, `REQ-EVENTS-178` gives no programmatic entry point, and `REQ-STARTUP-161` removes
the second instance — so every invocation is in-process on ADR-0002's bounded worker pool; and
`REQ-GIT-140` gives each isolated run its own worktree, so `REQ-GIT-145`'s N concurrent runs read N
copies rather than being N readers of one file. C-13's use as an amplifier here is withdrawn. ADR-0040
discharges the rest with a **single I/O owner** over the four artifacts (constraint W-12): no descriptor
is open when the rename runs, so no coordination file, and what is ordered is individual whole-file
operations rather than invocations. `REQ-TRACE-502`'s own middle sentence supports reading the
no-waiting clause as a rule about **views** — "a check running beside a regeneration MAY legitimately
report the artifact stale even though the other invocation is in the act of refreshing it" — rather than
about I/O scheduling. A reader who rejects that reading should treat ADR-0040 as reaching "never fails"
and not "never waits", and the residue below grows accordingly.

*The residue, which is real and which two closures nearly hid.* On Windows a `REQ-TRACE-509`
regeneration can still fail because something else holds the file open. Two cases:
**(a)** a `REQ-TRACE-182` test session running in the same checkout — this one is squarely inside the
requirement's subject, "because another invocation was running"; **(b)** a foreign process — the user's
editor, an indexer, antivirus, a cloud-sync client — which `REQ-TRACE-502` does not speak to, so it is
not a conformance gap, but which a user will meet first and read as a defect. `REQ-TRACE-061` requires
either failure **re-raised** and states no retry ladder. **Bounded contention is exactly the condition
under which a bounded ladder becomes sufficient — the condition this question said did not hold — and the
corpus now states no ladder anywhere (OQ-44).** ADR-0004 deliberately declines to invent the constants.

***"What would close it" was wrong and is corrected, 2026-09-02.*** This entry named "a runtime API
exposing share-delete on open" as one of two closures. **That remedy does not exist because the problem
is not there.** `spikes/windows-writer-handle-compaction.md` §3.2 establishes the discriminator cleanly:
`fs.unlinkSync` and .NET `File.Delete` both **succeed** against a Node-held handle and both **fail**
against a .NET holder requesting only `FileShare.ReadWrite`, so the runtime's open **does** request
share-delete. What fails is `fs.renameSync`, which returned `EPERM` on every distinct open flag the
runtime exposes, and 20/20 even against a holder that explicitly permits delete. So the closer is a
**replace primitive**, not a share flag: `ReplaceFileW` succeeded 6/6 against a Node-held handle with no
torn or empty read, out of process at p50 767 ms and unmeasured in process. **The question is therefore
"who owns a native replace primitive", not "is a share flag available"** — and it is available at a
measured price rather than unavailable. ADR-0040 additionally declines to inherit the spike's own
verdict across domains: the spike prices the 767 ms spawn out of a *compaction* path, correctly, but
`REQ-TRACE-509` is a deliberate user action already spending about a second parsing the store under
`REQ-TRACE-501` and replacing at most five small files, and a second on the failure path of a user-asked
action is a different trade from a second on a per-event path. A reader may disagree; the reasoning is
on the page rather than folded into the conclusion.

*The other closure is unchanged:* `REQ-TRACE-061` gaining a bounded ladder. `REQ-TRACE-502` should also
be amended to say what "concurrent invocations" now means, since the only concurrency left is in-process
work plus `REQ-TRACE-182`'s test session — and `REQ-TRACE-182` itself presupposes an invocable toolchain
the product no longer has, which is its own amendment. C-11 records the narrowing and the residual
conflict, now **split into its two halves with their two owners**, and does **not** report the property
satisfied.

*Part AJ (2026-09-09) measured one replace: every regeneration and baseline update in the proof replaced its files at attempt 1 through REQ-TRACE-061's ladder (5 attempts, 0.05/0.1/0.2/0.4 s), with the writer the workspace service's owner thread and no reader in the product holding a descriptor. The contended case — a test session in the same checkout on Windows — was not staged and the residue stands as ADR-0040 specific 6 records it.*

*Part R″ (2026-09-11): still unstaged, and now one concurrent launch away rather than hypothetical.* The
board's `end-to-end` path writes into the requirement source THROUGH the workspace service while the engine holds
the same store open. Recommended: keep open, and name `requirements-proof`'s `end-to-end` profile as the place to
stage it. It is also why `REQ-TRACE-513`'s replacement ladder is listed as met in part in lane R's closing
statement.

**OQ-42 — CLOSED as a policy decision, 2026-09-06; implementation evidence updated 2026-09-07.**

Accepted review OQ-42 chooses controlled cancellation of affected runs, store-wide
admission closure, and a frozen durable transcript. Separate in-memory notices
identify the failure, last durable event ordinal and recovery instructions.
Terminal persistence failure produces an explicitly unconfirmed caller outcome.
Explicit reopening waits for cancellation and performs a rolled-back write probe
before admitting execution. Failed probes preserve quarantine. The engine's
shared-store and projection-failure regressions cover these paths.

***Delivery completed 2026-09-13, and it found two defects.*** The **dependent-spec
consistency scan** turned up two continue-on-recording-failure clauses outside the pair the first pass
amended: `REQ-CLI-067` ("the run carries on with a logged warning … persistence trouble is never allowed to
fail a run") and `REQ-SESSION-145` ("an event that cannot be recorded is discarded with a warning"). Both
contradicted `REQ-EVENTS-088` in terms and are amended in place with their falsified reading kept beside
them; `REQ-MONITOR-221` needed no exception and gained none. The **cross-process propagation audit**
establishes the surface: the run host is the only process that opens a workspace store for writing
(ADR-0058, ADR-0005), main holds no handle and the workspace service opens one read-only for a restore
check, so propagation is exactly `notice.publish` and `run.result` — and `run.result` was **lossy**, because
the engine's `persistence: {confirmed: false, …}` had no field in `RunResultSchema` and stopped at the
boundary. Main therefore raised its own terminal notice beside the run host's, which is two notifications
for one failure where `REQ-EVENTS-088` allows exactly one. The field now crosses and main suppresses its
own. The **desktop notice** gained the recovery ACTION it was missing: reopening the session, mapped onto
`REQ-NOTIFY-044`'s existing `focus-session` member, with no member added to that closed vocabulary.

The following text preserves the historical question and its former interim policy.

**Historical OQ-42 — After a sticky mid-run store failure, may publication continue unanchored? *Narrowed on one
side by the amendment; the remaining half is harder, not easier.*** *(ADR-0010 consequence 7, which cites
this; not blocking, because the record states an interim behaviour.)*

***One half of this question is settled and the other is not.*** The **store-will-not-open** half is
closed by the amendment ESC-16 authorised: `REQ-SESSION-089` now requires the run **refused** as a
pre-run failure conveying the session id, that nothing was started, which store could not be opened and
the reason the store itself gave, and `REQ-EVENTS-084` gives the attach failure a definite user-visible
outcome — no `session.start`, exactly one `result` with status `error`, carrying the store's own reported
reason unaltered. Both requirements state their own reason: there is no longer a coherent state in which
a run has somewhere to record itself but nowhere to be recorded. *This was named as a known disagreement
in the Specification Gate and it is now agreement.*

**What remains is `REQ-EVENTS-088`'s sticky mid-run failure, and it is materially harder than when this
entry was filed.** Under a file a failed append left the earlier history intact and only that event
missing; under one transaction a transcript row and its event share a commit, so a commit that will not
commit means **the session record stops advancing altogether**, and the failure is workspace-wide rather
than per session. Continuing to publish therefore means showing rows a reattach genuinely cannot restore,
not rows whose event is merely absent. The record states the interim behaviour rather than re-deciding
it; the question is the owner's.

`REQ-EVENTS-088` marks the store failed for the remainder of the run and leaves the run going. D-16
(`REQ-MONITOR-221`) says every change is persisted before it is published and **states no exception**,
and `REQ-MONITOR-292` makes the persisted record authoritative wherever the two could disagree. So when
the record stops being writable, either the surface keeps showing a run whose state no resume can restore,
or it stops showing a run that is still happening. **Nothing settles which.** *SR-4 shifts the balance
against the previous answer, which is why it is returned as a question rather than re-affirmed:* under a
file a failed append left the earlier history intact and only that event missing; under one transaction
the transcript row and its event share a commit, so a commit that will not commit means **the session
record stops advancing altogether**, and the failure is workspace-wide rather than per session. The
interim behaviour, which both readings share and which is not in question, is that the run surfaces the
failure as a **session issue** and not only as `REQ-EVENTS-088`'s one warning — otherwise the user sees a
healthy transcript over a history that stopped being written. Until this is answered the record continues
to publish and marks the surface **unanchored**, so the condition is visible rather than inferred.

**OQ-43 — Does the single-instance gate admit a benchmark iteration? *Unchanged in substance; the gate it
asks about is now OURS rather than the platform's (2026-09-02).*** *(ADR-0042, ADR-0053, ADR-0055;
constraints P-16, P-17, W-14.)*

***What changed and what did not.*** ADR-0055's claim moved from the platform's single-instance primitive
to our own record file, **on measurement** — the primitive blocked 20.0 s against `REQ-STARTUP-164`'s 5 s
interval, performed no reclaim, and dropped the hand-over (constraint P-16). **That makes the sentinel
branch entirely ours to define and the composition easier to state**, because the admission rule is now a
line in our own claim rather than a behaviour of a component we do not control. **It does not touch the
requirement-level ambiguity this question records**, which is the whole of the question: nothing in
`REQ-UIBENCH-037` to `REQ-UIBENCH-039` or in `REQ-STARTUP-161` says how the two compose, and W-14's marker
remains architecture-invented on a specification silence. ADR-0055 still cites this question for three
cases — the bundled code-intelligence server, the benchmark iteration child, and the update-restart
successor. `REQ-UIBENCH-037` to `REQ-UIBENCH-039` make a benchmark iteration a fresh
child process **of the product's own program that the product itself starts**, with `XDG_CONFIG_HOME` and
one benchmark-private variable redirected; `REQ-UIBENCH-046` makes it an acceptance criterion that the
user's real stored settings hold the same bytes afterwards. `REQ-STARTUP-161` says a second launch is
handed to the running instance. **An iteration is a second launch by any naive test.** If the gate catches
it, the iteration never receives its redirected configuration home, the measurement runs against the
user's real preferences, and `REQ-UIBENCH-046` fails **silently — the run still completes and still
reports numbers.** The specification does not say how the two compose. The architecture's answer is W-14,
a marker the parent sets that no user can set, but "which processes the gate admits" has a security
flavour and deserves stating in the requirement rather than being inferred. **If the answer is that the
gate admits no exception, `REQ-UIBENCH-046` is unimplementable and this becomes an escalation** between
the benchmark's isolation and the one-instance rule.

**OQ-44 — `REQ-TRACE-061` faces the one case a ladder is for, in the one domain that has none. *RESOLVED
2026-09-02 by amendment, at BOTH sites, in the platform-defect round.*** *(ADR-0004, ADR-0040; constraints
D-25, C-11, D-06. Successor to OQ-11 and to OQ-41's residue.)*

***The amendment this entry records was ruled and NOT applied, and that was found on 2026-09-13.*** OQ-41's
delivery read `REQ-TRACE-061` and found it still saying "the failure re-raised", with no ladder in it, while
this entry, the surrounding register text and the implementation all cited the constants by name. The ruling
stands and is unchanged; what was missing was its application to the requirement, which the OQ-41 amendment
now carries in full, including the "only ladder this domain states" declaration and the `REQ-TRACE-514`
scope below. **A closure recorded in this register is not evidence that the requirement carries it**, and
this is the second time that gap has been found by going to the requirement rather than to the record.

***The answer, and it is the one this entry asked for rather than a borrowing.*** `REQ-TRACE-061` **now
states a ladder of its own**: at most five attempts in total, delays of **0.05 / 0.1 / 0.2 / 0.4 s** before
the four retries, the last attempt beginning no more than **0.75 s** after the first, an attempt that
succeeds reporting nothing, and no attempt leaving a temporary artifact behind. It declares itself **the
only replacement ladder its domain states** and covers every whole-file replacement the domain performs —
the generated artifact, the three baselines of `REQ-TRACE-126`, the retired-identifier log of
`REQ-TRACE-137`, and the destination an export of `REQ-TRACE-514` writes to. Its constants are **this
domain's own and were deliberately not borrowed** from `REQ-SESSION-033`, which the entry below insisted
on; both requirements now say so in terms and neither may be cited in place of the other.

***The clause that makes it close the measured case rather than half of it.*** The retry **MUST NOT be
conditioned on this application being able to attribute the failure to another process holding the
target.** The measured 6.2 % first-attempt failure occurred **with no other opener present at all**, and a
build that retries only where it can identify a foreign handle absorbs none of it and does not satisfy the
requirement. That sentence is the difference between a ladder and a ladder that works, and it is the one an
implementer would otherwise have supplied from the wrong intuition.

***The second site is closed too, and by two requirements rather than one.*** `REQ-LIBRARY-176` **cites**
`REQ-TRACE-061`'s ladder rather than stating a third. And a hole this entry did not see was closed with it:
a ladder for a *replacement* hangs on there being a replacement, so `REQ-EVENTS-145`'s one-step-visibility
obligation was made the product's single statement of what an export write owes a user-chosen destination —
without it a build could truncate and write in place, never perform a replacement, satisfy every word of
the ladder, and still destroy a user's previous export. `REQ-SESSION-189` and `REQ-SESSION-199` cite it.

***What is NOT closed, stated so it is not absorbed:*** the three export destinations domain 20 itself
governs now carry the one-step obligation and **no ladder**, and whether that document should cite
`REQ-TRACE-061` or state its own is recorded as unsettled in
[`../spec/resolutions/20-event-history-replay-export.md`](../spec/resolutions/20-event-history-replay-export.md).
It is a narrower residue than this question, on the same shape, and minting a competing ladder owner would
be the wrong answer to it. **OQ-41's half (a) is also untouched** — a test session in the same checkout is a
`REQ-TRACE-502` conformance gap, not a ladder problem.

**The entry as it stood is kept below**, because it was right about what was owed and its measurement is
what the amendment was made against.

***The measurement, and why it changes what kind of question this is.*** This entry, and ADR-0004, and the
writer-handle report all derive the ladder from **local reader contention** — a foreign handle held for a
moment, rare, absorbed by belt and braces. `spikes/remote-and-synchronised-storage.md` §8 measured the same
call on ordinary shared storage and found it failing at **6.2 % — 37 of 600 first attempts — WITH NO OTHER
OPENER PRESENT AT ALL**, against **0 of 300** locally. So the ladder is not a defence against a rare case;
on the storage this requirement's artifacts actually live on, **it is the normal path for roughly one
document write in sixteen**, and its cause is not the one `REQ-SESSION-033` names. **The requirement's
failure policy is *re-raised*, so today that is a user-initiated regeneration failing for a reason the
user cannot act on, at that rate, on the platform the product mandates.**

***The measurement fixes the shape of the answer without supplying its numbers*** — the existing ladder
absorbed every failure, 29 of 30 on the second attempt and all 30 within two extra attempts, 0 of 600 gave
up — so what is owed is a requirement, not a research question. **Two qualifications this entry must
carry.** Every remote figure came from one client talking to a server on the same machine over loopback:
no latency, no packet loss, no reconnection, and an unknown protocol dialect, so **6.2 % is a floor**. And
the inversion is worth stating: the one target that **has** a ladder (`summary.md`) moved to machine-local
storage under ESC-15 and no longer needs it for this reason, while the targets that have **none** are
exactly the ones `REQ-SESSION-198` deliberately leaves on whatever storage the user chose.

***The premise this entry was filed on is false and is corrected here rather than deleted, because the
question survives it.*** This entry asserted that "the corpus now states no Windows retry ladder
anywhere" and that both ladders "governed stores that are rows under SR-4, so both are withdrawable".
Neither is true. `REQ-SESSION-033` was **narrowed, not withdrawn**; it states a five-attempt ladder with
exponential backoff at 0.05, 0.1, 0.2, 0.4 and 0.8 s for the human-readable summary, and it declares
itself "the only replacement ladder this domain states" (D-06, and OQ-11 as rewritten).

**The real gap is narrower and sharper than this entry recorded.** One domain has a ladder for exactly
the case `REQ-TRACE-061` faces — a transient access-denied failure of a replacement caused by antivirus,
an indexer or a cloud-sync client holding a handle — and `REQ-TRACE-061` still **declares no ladder and
requires a failed replace to be re-raised**. OQ-41's residue is exactly that case, and its contention is
now *bounded*, which is precisely the condition under which a bounded ladder is sufficient rather than a
concession.

**ADR-0004 still declines to borrow the constants, and now has a second reason.** They are a sessions-
domain figure, and attaching one to a replace of the user's **version-controlled material** is a worse
kind of borrowing than attaching an invented one. Either the specification supplies a bounded ladder for
the traceability artifacts, or it states that re-raising on a foreign handle is intended and accepts that
a user's editor or an antivirus scanner momentarily holding `docs/requirements/retired-identifiers.tsv`
can fail a regeneration the user asked for. **No neighbouring store's constants may be borrowed to
pretend a ladder exists.**

***Widened 2026-09-02: the same gap now has a second site, and it is the one where a foreign handle is
likeliest of anywhere in the product.*** `REQ-SESSION-189`'s trajectory export, `REQ-SESSION-199`'s four
record exports, `REQ-LIBRARY-176`'s and `REQ-TRACE-514`'s new ones, and `REQ-EVENTS-145`'s trajectory
document all write to **a destination the user chooses through the platform's save dialog** — which over
an existing file is a whole-file replace in place, at a path the product does not own and may be on
removable media, a network share or a synchronised folder. `REQ-SESSION-033` scopes its ladder to "where
this domain replaces a whole file in place", names `summary.md` as "the one written **repeatedly**"
rather than as the only one, and then closes by declaring itself "the only replacement ladder this domain
states". **The text supports both readings and they differ in what a user observes** — a failed export
against a held file, or a successful one a second later. `REQ-EVENTS-145` states no ladder for the
trajectory document either. ADR-0004 consequence 9 records this as a specification question and does not
choose. *Same gap, two sites, and the second one is on a user-initiated action rather than a background
one.*

***A third closure now exists that this entry did not carry.*** OQ-41's correction applies here too: a
native replace primitive (`ReplaceFileW`, measured succeeding against a held reader) removes the need for
a ladder on the traceability path entirely, at a cost that is measured out of process and unmeasured in
process. That is a decision about who owns a native addon, not about constants.

**OQ-45 — Decision closed, 2026-09-11: ADR-0061 owns the store.** This entry had stopped being a question for the
owner when ESC-30 was ruled and applied on 2026-09-02; what remained was a record nobody had written, and
**ADR-0061 — The improvement artifact store's write path** is now it. It takes the second of the two horns this
entry names: the version write stays **outside** the artifact write's all-or-nothing boundary, as `REQ-LIBRARY-047`
requires, and the store carries a count of versions *allocated* as against retained so the export can tell a
version that was never recorded from one retention pruned. The first horn — bringing the version write inside the
transaction — is refused for the reason this entry gives: it would let a failed version write undo the review
decision it was recording, which is worse for a user than an imprecise export. Constraint **W-26** is satisfied by
the same counter shape ADR-0041 already obliges for transitions, and **ESC-3's ruling has an architectural home**
again. ADR-0041's scope note is amended to point at it.

**Historical question.** *Its product half was ESC-30, which is now RULED AND
APPLIED (2026-09-02); the storage half stays here and is what remains open.*** *(ADR-0003, ADR-0004, ADR-0041; ESC-3, ESC-18,
ESC-30; constraint C-10.)*

***What moved.*** `REQ-LIBRARY-052` now obliges the store to state how many versions pruning dropped and
`REQ-LIBRARY-176` forbids the export implying that figure accounts for every absence — so the *falsehood*
this entry produced is fixed. **What is not fixed and is not this register's to fix** is whether the
export must distinguish a version absent because `REQ-LIBRARY-047`'s best-effort write never recorded it
from one retention pruned: that was **ESC-30**, raised rather than taken, because bringing version
recording inside the write's all-or-nothing boundary makes the audit trail complete at the cost of review
actions failing in a workspace whose version store is unwritable. ***ESC-30 has since been RULED — make them
distinguishable — and applied on 2026-09-02***, and the ruling took neither horn whole: `REQ-LIBRARY-047`
records **inside** its all-or-nothing operation that a version was *due*, so a version the best-effort write
then failed to record is afterwards known to be absent and countable, while version recording itself stays
best-effort and a version that cannot be recorded still does not undo the artifact write; `REQ-LIBRARY-176`
then carries **two separate figures** per artifact. **The part that stays open here is the one nobody owns
either way, and it is now narrower rather than gone**: the write path that would maintain a count of versions *allocated* as
against retained (constraint W-26). ADR-0041 takes the export and names the fix; no record owns the write.
`REQ-LIBRARY-042`'s read-modify-write semantics, `REQ-LIBRARY-043`'s atomic-replace-with-retry contract,
`REQ-LIBRARY-047`'s all-or-nothing artifact write with a best-effort history write, `REQ-LIBRARY-049`'s
full-copy version files and `REQ-LIBRARY-052`'s intermediate-version pruning are described **only** inside
ADR-0003 and ADR-0004 — and both of those are about the file/row line and the atomic primitive, not about
this store. SR-4 moves it to rows, which changes `REQ-LIBRARY-047`'s "best effort" into a deliberate
decision about whether the history write stays outside the transaction, and makes ESC-3's ruled defect
unreachable (ESC-18). **ESC-3's ruling therefore currently has no architectural home**, and the two ADRs
that mention it are exactly the two whose file-based framing has just been removed. This is a gap in the
decision record rather than in the specification, and it needs either an ADR or an explicit statement
that ADR-0041 adopts the store; ADR-0041 declines, correctly, because the rule is not the delivery
store's.

***Narrowed by the amendment rather than by any pass of this record.*** `REQ-LIBRARY-042` now requires
the read-modify-write to **take effect as one indivisible step** and records ESC-3's accepted defect as
withdrawn "as unreachable, not as unimportant"; `REQ-LIBRARY-043` states the atomicity observable and
withdraws the mechanism, and `REQ-LIBRARY-158` gives the reason no ladder is needed (constraints C-10,
D-25, and OQ-11 as rewritten). **What remains unowned is one write**: `REQ-LIBRARY-047`'s best-effort
artifact-history write, which is now a decision about whether that write stays outside the transaction —
and if it does, what a user is told when the artifact lands and its history entry does not.

***Narrowed again, and sharpened, 2026-09-02.*** *Narrowed:* ADR-0041 now takes the improvement store's
**export** and only the export, because `REQ-LIBRARY-176` and `REQ-TRACE-514` were minted by one ruling
over one guarantee and splitting them across two records would produce a second, divergent
implementation of it by accident. That is stated as a scope note in ADR-0041's header rather than as an
adoption of the store, and the **write path is still the orphan**. *Sharpened, and this is the part that
makes the entry more owed rather than less:* ESC-18 removed ESC-3's ruling, so this entry can read as
having decayed into nothing. It has not. `REQ-LIBRARY-047`'s best-effort version write was **untouched by
that amendment**, and it now interacts with a requirement that did not exist when this question was
filed. `REQ-LIBRARY-176` requires the export to state where retention "has dropped intermediate versions
… and how many". Under `REQ-LIBRARY-047` a version can be absent because it was **never recorded** —
"when the artifact is stored but its version cannot be, the save MUST still report success … and the
failure MUST appear only in the application log" — and nothing in the corpus requires the store to retain
enough to tell that apart from a `REQ-LIBRARY-052` prune. The two mean different things to a user: one is
the product working as specified, the other is data they were told about only in a log.

**The resolution is a choice between two things and both belong to whoever takes this store**: bring the
version write inside the transaction, which `REQ-LIBRARY-047` currently forbids and which would make a
failed version undo the review decision it recorded; or keep it outside and give the store a count of
versions **allocated** as well as retained, so the export can distinguish the two causes. The second
costs nothing if it is taken alongside ADR-0041's transitions-ever-recorded counter, which is the same
shape of obligation for the same reason (constraints C-10, W-26). **Someone should own this store before
it is discovered from a user's export.**

**OQ-46 — CLOSED as a policy decision, 2026-09-06; implemented 2026-09-13.** *(ADR-0002, ADR-0055;
constraint R-17.)*

The accepted review answers **one aggregate notice for the batch**: `REQ-SHELL-155` keeps its singular title
word for word for a single repaired session, and a batch raises exactly one warning naming how many were
repaired, naming them, and carrying a route to the surface the affected-session list is reached from.
`REQ-SESSION-062` keeps one timeline entry per repaired session — the record is unchanged by what is shown —
and continuation is offered only once the relevant batch has settled. **No escalation is needed**: this entry
said the answer becomes one *only if* it changes the notice vocabulary `REQ-NOTIFY-044` and `REQ-NOTIFY-048`
to `REQ-NOTIFY-050` close, and it does not — the route is `open-view` to Overview, an existing member of
`REQ-SHELL-115`'s closed list, whose own "List sessions" control opens the browser. A reader who thinks the
list deserves a member of its own should raise that as the escalation; nothing here presumes the answer.

***What building it found.*** `REQ-SESSION-062` fixes the repair's timeline entry exactly — type, severity,
actor, message and metadata keys — and the implementation had invented every one of them but the actor:
`session_marked_interrupted` for a type the requirement calls `session.interrupted_recovered`, the default
`info` for a severity it fixes as `warning`, a two-sentence message for one it fixes word for word, and
`previous_status` for `previous_execution_status`, with `execution_status` missing beside it. A reader of the
exported timeline (`REQ-SESSION-199`) could not have found the entry the specification promises. It was
reachable only by auditing the requirement this entry names, which is what this closure required and what a
sweep of the surrounding code would not have done.

**Historical question — the repair notice is specified in the singular and the failure it reports is plural.**
`REQ-SESSION-062` and `REQ-SHELL-155` specify a repair notice
written for **one** stale session. ADR-0002 now accepts as a consequence rather than disputing that a
run-host crash produces **one stale session per in-flight run**, possibly across several workspaces — and
`REQ-MONITOR-249` to `REQ-MONITOR-258` make concurrent runs a supported and encouraged shape, so the
realistic failure is three or five sessions needing repair at once. Whether that is one notice naming
several sessions or several notices is a user-visible behaviour no requirement states. The reap must
settle **all** of them before any is offered for continuation, which is an architecture obligation and is
recorded in ADR-0002; what the user is shown is not. **This was hypothetical while a run-host crash was
disputed and is reachable now that it is accepted.** It becomes an escalation only if the answer changes
the notice vocabulary `REQ-NOTIFY-044` and `REQ-NOTIFY-048` to `REQ-NOTIFY-050` close.

**OQ-47 — Two concurrently open workspaces presenting one identifier. *NOT closed by ESC-26, and ADR-0058
now says so explicitly (2026-09-02).*** *(ADR-0058, ADR-0002; constraints W-19, W-01, W-27.)*

***Read this before assuming ESC-26 covered it.*** ESC-26 granted `REQ-SESSION-197` one exception and the
amendment has landed — but it is **confined to `REQ-SESSION-201`'s restore action** and the requirement
names, one by one, the paths that do *not* gain it. **A user who copies a workspace folder and wants the
copy to have an identity of its own still has no product action**, so this entry's first two paragraphs —
the concurrent two-copies-one-identifier behaviour, and the absence of any remedy for a copied folder or a
corrupt identifier file — **stay open exactly as they were**. What ESC-26 removed is only the *other*
route to the same dead end, the clone-then-restore recovery, which this entry's own text cited as evidence
that reaching one dead end twice by two independent routes was significant. **One of the two routes is now
closed and the other is not, which is a narrowing rather than a resolution.** *Related but distinct:* the
**store**-side hazard of one identifier reached two ways is now constraint **W-27** and is a correctness
rule with a measured, silent failure mode; this entry remains about the *workspace* side, where the hazard
is a resume in one window starting an agent that writes into the folder the user does not have open. `REQ-SESSION-197` fixes that a **copied** folder carries the
identifier unchanged, and that the product **MUST NOT** mint a replacement over an identifier it can read
— so two folders on one machine necessarily resolve to one store. **No requirement says what happens when
both are open at once.**

**The unstated-and-unsafe reading is that both windows share the store**, which lists in each window
sessions whose resume starts an agent writing files into the folder the user does not have open
(`REQ-SESSION-014`'s `workspace_root`). The hazard is not corruption.

**ADR-0058 decides it rather than leaving it, and the decision is filed here rather than presented as
settled**, because leaving it open means the implementation picks and the appealing pick is the unsafe
one. Concurrently: the identifier is claimed once per instance, beside the instance claim main already
holds, and the second workspace opens **without a store**, reporting the condition in `REQ-SESSION-089`'s
own vocabulary — the workspace opens, there is no store, there are no sessions and no runs — naming both
paths. Sequentially — open one, close it, open the other — **nothing** may happen, because that case is
indistinguishable from a move and any detection there would break `REQ-SESSION-197`. The whole decision
is expressible in vocabulary the specification already has, which is why it is offered for ratification
rather than as an amendment.

**A second, smaller silence sits underneath it and the above does not resolve it.** `REQ-SESSION-197`
forbids re-minting over a readable identifier **absolutely**, with no user-confirmed exception. That is
right for the failure it prevents — silently orphaning a history — and it means the **only** remedy for a
copied folder, and for a corrupt identifier file, is the user editing or deleting a file by hand. There
is no product action for either. None was invented, because the requirement is absolute; a reader should
notice that the product's answer to a common user action is "go and edit this file".

***That dead end is now reached by a second, independent route, and the coincidence is evidence
(2026-09-02).*** `REQ-SESSION-201`'s restore hits it from the opposite direction: a user who clones their
repository on a new machine, opens it once — which mints an identifier — and *then* restores their
backup has an artifact naming one identifier and a workspace carrying another, and the product may not
touch either. That is the common shape of disaster recovery, and its only remedy is the same hand edit.
Two independent routes to one hand edit is a stronger case for a narrow, explicit, user-confirmed
exception than either route alone. **It is escalated as ESC-26 and is not decided here.**

***The third paragraph of this entry is DISCHARGED, 2026-09-02, and is preserved as the mistake it was.***
It read: "**And two records disagree about what identifies a workspace.** ADR-0002 keys the workspace
service by **resolved path**; ADR-0058 keys the store claim by **identifier**. That is the minimum
consistent arrangement and not a settled one." **The framing was wrong and must not be cited.** The two
records key two *different objects*, and the specification fixes both keys separately and in terms —
`REQ-STARTUP-041`(a), `REQ-STARTUP-163`, `REQ-STARTUP-047`/`048` and `REQ-STARTUP-166` all key the open
workspace by its **resolved directory**, while `REQ-SESSION-001`, `REQ-SESSION-197`, `REQ-SESSION-198`
and `REQ-LIBRARY-042` all key the durable store by the **identifier**, and `REQ-SESSION-001` composes
both in one sentence. Neither collapse is available: keying the service by identifier gives one service
two roots, and every job it does — configuration against one `.rotaris/`, Git in one checkout, worktrees
under one root, `REQ-TRACE-073`'s scan over one repository, the delivery store against one set of
requirement documents — is directory-scoped; keying the store by path is the field's filed, painful,
most-complained-of defect (ESC-19's survey: one report of 63 sessions lost across 10 projects after a
reorganisation, and even a change of a folder name's *case* orphaning everything). ADR-0002 holds the
argument and constraint W-19 carries it. **The first two paragraphs of this entry are untouched and stay
open.**

**OQ-48 — Reclaiming a machine-local store whose workspace no longer exists. *MORE owed after ESC-26, and
the surface changes purpose (2026-09-02).*** *(ADR-0058; constraints W-17, W-22, W-24.)*

***ESC-26 adds a third producer and a third shape of leftover.*** A confirmed identifier establishment
leaves the **old** identifier's store intact and merely unreferenced — that is one of the five conditions
the exception is bound by, and it is what makes a one-way-looking operation safe to confirm. So there are
now three sources of a store nothing points at: the corruption ladder displaces a damaged store and keeps
it (W-17), a restore displaces the store it replaces and keeps it (W-24), and a confirmed establishment
orphans the workspace's previous one. **The surface's purpose changes with it.** It was the route to
*clearing* a store a user does not want; it is now also **the only route back to a store a user may well
want**, because after a confirmed establishment the previous history is reachable by nothing else in the
product. That makes "offer the exports first" a stronger obligation rather than a courtesy, and it makes
the absence of the surface a larger gap than it was. `REQ-SESSION-166` deletes one session. ESC-15 moved every session's
record out of the workspace. **Nothing addresses a whole store that nothing points at** after the user
deletes the project, re-identifies it, or clones it fresh — a hole the ruling opened and the amendment
pass did not close.

**ADR-0058 decides it in three parts and refuses the appealing one.** The pre-migration copy is reclaimed
by the product at the next clean open. A store nothing references is reclaimed **only** by an explicit,
user-confirmed action from a surface listing this machine's stores with last-seen paths, size, session
count and last-open time, **offering the exports first**. **Automatic reclamation is refused**, and the
reason is the whole of it: the only signal available is that a last-seen path no longer resolves, and a
path fails to resolve when a drive is unmounted, when a share is down, and above all **when the folder
has been moved** — precisely the case the identifier exists to survive. Reclaiming on that signal would
delete a user's history to punish them for the operation the design supports.

**The surface that decision assumes does not exist**, in the specification or in any other ADR, and
`origin.txt` — which records last-seen paths for diagnostics and for exactly this listing — **must not**
be consulted to resolve a store, so it cannot quietly become an identity mechanism. Ratify the behaviour,
or state that an orphaned store is never reclaimed and the disk cost is accepted.

***Unchanged in substance and MORE owed, 2026-09-02.*** The surface still does not exist, and ESC-19 has
added a second and a third source of stores nothing points at: **a restore displaces the store it
replaces** and keeps it under a UTC-timestamped name rather than deleting it (constraint W-24), and the
corruption ladder displaces a damaged one (W-17). Both are deliberate and both are right — the user is
mid-recovery in each case and a deleted store is history that existed nowhere else. But it means **the
two operations a user in trouble is most likely to reach for are the two that produce leftovers only this
surface can clear**, and it is the one surface the record assumes and nothing owns.

***MEASURED 2026-09-02, and the count of leftover kinds went from three to FIVE while the consequence
that tracks them was not updated.*** `spikes/backup-restore-mechanism.md` ran the restore and left two
kinds of leftover nobody has named. **(4) The staging directory.** In every measured failure — 30 of 30 on
the record's literal reading, 30 of 30 with a file manager holding the store's own directory, 30 of 30 at
second-granularity stamp collision, and the timeout case — a **full copy of the artifact's store** was left
at `<identifier>.restoring-<n>`. ADR-0058's layout block calls it "transient" and **no step deletes it**. It
is the size of the store. **(5) The obstruction aside-name.** The corrected reversal is displace-then-rename
and its displace step renames an occupying `<identifier>` aside to `<identifier>.obstruction-<stamp>`, which
is kept and never deleted on the same reclamation argument as everything else here. **Neither is enumerated
in ADR-0058 consequence 5, which is the consequence that tracks them**, and both are inside this question's
surface rather than beside it. *The register's observation, which is the reason this is written here rather
than left to the ADR:* every mechanism this record has added that displaces something has added a leftover
kind, none has added a way to reclaim one, and the surface that would clear all five still exists nowhere.
**Whoever owns ADR-0058 consequence 5 should be told, and this question is now owed five shapes rather than
three.**

**OQ-49 — What makes two directory strings the same directory. *RESOLVED 2026-09-02 by amendment.***
*(ADR-0002; constraint W-25, and now constraint W-27 for the store side.)* `REQ-STARTUP-163` **now owns
this**: what is resolved, what is deliberately not reconciled, and the bounded cost of not reconciling it,
plus two additions ADR-0002 did not state — a trailing separator carries no meaning, and abbreviated
alternate spellings the filesystem itself resolves are resolved. It states in terms that it is **not** the
definition of workspace identity, which is `REQ-SESSION-197`'s and is never derived from a path.
**ADR-0002 should now cite rather than decide, and W-25 moves from a ruling to a requirement citation.**
***One thing this closure does NOT cover, and a reader will assume it does.*** The requirement settles
which *window* a launch reaches. It says nothing about the **store**, where the same hazard is a
correctness failure rather than a usability one: two spellings of one store path were measured losing up
to 95 % of committed rows with both writers reporting success and a clean integrity check. That is
constraint **W-27** — one store, one canonical spelling, resolved once — and it is architecture's, not the
specification's. The original entry follows. `REQ-STARTUP-163` decides window reuse on whether "a main window of that instance already has
that directory open" and `REQ-STARTUP-041`(a) requires the directory "resolved and persisted as the
remembered workspace". **Neither fixes what makes two directory strings the same directory.** Symlinks,
junctions, filesystem case sensitivity and UNC against mapped-drive spellings all bear on it, and the
answer is user-visible: it decides whether a launch surfaces the window the user already has or builds a
second one on the same folder.

**ADR-0002 has decided it, because the workspace service needed a key**, and the decision is filed here
rather than presented as settled. Absolute and normalised; symlinks and junctions resolved to the real
path; compared case-insensitively where the filesystem is; and **not** reconciled across UNC against
mapped-drive spellings, because there is no reliable cross-platform way to do that and a wrong answer
merges two workspaces silently — which is a worse failure than declining to merge them.

**This is low-stakes and is filed anyway, and the reason is the shape rather than the size.** Where two
spellings fail to canonicalise the outcome is bounded: two workspace services, one identifier, and
ADR-0058's per-instance claim gives the store to the first, which is W-19's stated behaviour rather than
a new one. But it is user-observable behaviour invented on a specification silence, which is exactly the
class this register exists to keep visible, and a requirement would supersede it at no cost.

---

**OQ-50 — Validation by discovery proves nothing against a public catalog.** *(ADR-0030; raised by the slice's
first execution, 2026-09-05.)* `REQ-PROVIDER-133` holds that a key-based provider's credential is persisted only
after successful discovery, "so a bad key is never stored silently", and `REQ-PROVIDER-052/054/108` make discovery
the validation. OpenRouter's `/models` answers **without** any key, so a value of another vendor's shape was
discovered against, stored as authenticated, and refused at the first model call. The requirement's guarantee
rests on a property of the endpoint it does not state. The build now repeats the catalog request without the key
after a successful discovery and, where that also succeeds, completes the sign-in but says the key could not be
validated and leaves the provider's health unchecked. What the specification should decide: whether an
OpenAI-compatible instance's validation may issue a minimal paid request (the only authenticated call every such
endpoint has), whether a public catalog is a warning or a refusal, and where the statement lives.

**OQ-51 — Does an UNSCOPED queued prompt still exist?** *(No ADR; raised against `REQ-CHAT-039` by the composer's
first execution, Part AB, 2026-09-07.)* `REQ-CHAT-038` gives a queued prompt "a session ownership field (empty =
unscoped)" and `REQ-CHAT-039` gives an unscoped prompt a behaviour of its own: it "MUST be consumable by any run
but invisible to session-scoped listings". **Two things in the record now disagree with that sentence.**

1. **The store cannot represent one, and has not been able to since v6.** `queued_prompts.session_id` is
   `TEXT NOT NULL REFERENCES sessions(session_id)` (`store/src/schema.ts`, the v6 migration), so every queued
   prompt is scoped by construction. Nothing has ever written an unscoped one and no route offers to.
2. **`REQ-CHAT-041` was amended on 2026-09-07 and 039 was not amended with it.** The amendment
   (`docs/spec/resolutions/2026-09-06-accepted-review.md`, OQ-1/7/9/16/35) replaced "every window and every run
   sharing the same process" with "eligible windows and runs for the **same session ID** across its processes",
   and added "one authoritative service owns the queue and atomic queued-to-triggered transitions". Its own
   summary line reads "REQ-CHAT-041 assigns **one session-scoped queue** to the application instance." A queue
   that is session-scoped per instance has no place to put a prompt belonging to no session; but 039 still says
   one exists, and a requirement is not amended by another requirement's summary.

**What the owner should decide.** Either (a) an unscoped prompt is withdrawn — 039's second sentence goes, 038's
"empty = unscoped" becomes "always scoped", and the schema is already right; or (b) it survives, in which case
`REQ-CHAT-041`'s "same session ID" needs a carve-out saying which runs may consume a prompt belonging to no
session, `REQ-CHAT-036`'s panel needs a rule for a prompt it must not show but a run may consume, and the store
needs a nullable owner and a second visibility path.

**What Part AB built, and what it did not.** The **scoped** half is built and measured — ownership comes from the
session the prompt was submitted to (the control channel's addressing IS the explicit session id) or from a
`session_id` key in the context snapshot, which v13 now stores; a snapshot naming another session is refused
rather than silently re-scoped; ownership is the primary key's first column, so edit and trigger cannot move it;
and `pnpm composer-proof` measures REQ-CHAT-038's exactly-once transition under two callers on two connections.
The **unscoped** half is not implemented in either reading. `resolveQueueOwnership` returns an explicit
`unscoped` verdict that every route refuses, naming this question, so a future route meets a stated refusal
rather than a foreign-key error.

**OQ-52 — May a delegated child ask the user a structured question?** *(No ADR; raised against `REQ-TOOLS-002` by
structured questions' first execution, Part AC, 2026-09-07, and entered here by the manager — Part AC recorded it
in `children/personas.ts` and ADR-0016's note but not in this register, which is where a question has to be to be
answered.)*

The mechanism supports it: the wait registry is per tool port, and a port is one conversation, so a child could
hold its own pending prompt without disturbing the run's. Two things stop it being a decision the implementation
may take. **No requirement says which personas may ask** — `ask_questions` is declared by the orchestrator alone
in this build, and that was chosen to satisfy REQ-CHAT-094's one-pending-prompt-per-conversation rule rather than
because a requirement named the orchestrator. And **REQ-CHAT-051 defines ONE question trailer**: "a single question
row" attributed to the agent that asked. Two children asking at once has no defined presentation, and inventing a
second trailer would extend a vocabulary REQ-CHAT-046 closes.

Until it is answered the tool stays on the orchestrator, which is the narrow reading and refuses nothing a
requirement grants.

**OQ-53 — Which event reports a compression, given a closed catalogue?** *(No ADR beyond ADR-0060, which ships an
interim; raised against `REQ-CONFIG-135` by context compression's first execution, Part AH, 2026-09-08.)*

`REQ-CONFIG-135` says that whenever a compression trigger is resolved, the four inputs that produced it and the
resulting token number are surfaced "in exactly two places", the first being: "emitted on the session's event
stream as part of **the event that reports the compression**, carrying the four inputs and the resulting token
number as **separate machine-readable fields** so a consumer never has to parse a sentence". The second is the
transcript entry's reason line, rendered from those fields, and the same figures go to the per-session debug log.

**There is no such event.** `REQ-EVENTS-041` closes the published catalogue at exactly 23 types and none of them
reports a compression; `REQ-EVENTS-017` requires every event to carry an `event` value drawn from that catalogue,
so no new kind may be added without amending it. The requirement names a venue the product has no way to reach.

Two readings, and they differ in what a consumer of the recorded stream sees. Either **"the session's event
stream" means the timeline**, and the interim below already satisfies the requirement — this is the reading Part Q
took for `model_exhausted` and `model_override`, which are recorded facts the closed catalogue also has no kind
for. Or **`REQ-EVENTS-041` is to be amended with a compression event**, in which case the catalogue's count and
`REQ-EVENTS-017`'s payload table both change and an external consumer gains a type it must decode.

Shipped meanwhile (ADR-0060 decision 7): a `context_compressed` **timeline entry** carrying `threshold_percentage`,
`capacity`, `advertised_input_limit`, `default_threshold` and `trigger_tokens` as separate metadata fields beside
`trigger`, `count_source`, `counted_tokens`, `before_tokens`, `after_tokens`, `before_messages`, `after_messages`
and `latency_ms`; one `system` transcript row rendered from those fields; and the log line. What the requirement
asks to be carried is carried, in a venue it did not name. If the second reading is ruled, the entry stays and an
event joins it — the interim is not repaired quietly.

**OQ-54 — The user-terminal audit entry's `decision` and `source` fall outside the closed permission vocabularies.** *(spec 12 Data & Formats, "Permission audit entries for user terminal actions"; REQ-TOOLS-012/028. Raised by the terminal stream's first execution, Part AL, 2026-09-09.)*

REQ-SHELL-107 says a user's terminal action is written to the permission audit with `decision: user-input`, `source: user`. `DECISIONS` is the closed set `{allow, ask, deny}` (REQ-TOOLS-012) and `DECISION_SOURCES` the closed twelve (REQ-TOOLS-028); neither holds `user-input` or `user`. Part AL writes the entry as spec 12 words it (the writer takes the strings), so a decision-log reader that enumerates the closed vocabularies will not recognise it. Whether spec 12 mints two new members, or the audit entry is a different record from a permission decision, is the owner's call. Recorded, written as spec 12 says, not resolved.

**OQ-55 — Decision closed, 2026-09-11.** `REQ-CONFIG-116` gives the key a range of **1–64**. The figure is
`REQ-TRACE-481`'s ceiling taken with its reason — an input needs some upper bound, and a figure no machine could
actually service is of no use to anyone — rather than a fresh invention. A value outside the range is rejected at
load and on assignment (`REQ-CONFIG-111`), never clamped; `REQ-TOOLS-108` keeps the effective limit and the message
on reaching it. With the ceiling in place the staleness law Part T″ measured has both of its terms: at the maximum,
`(20 agents + 64) × windows` stays under the thousand-stream crossing for any window count a user can produce, so
the worst case a **configuration** can reach is the flat regime bounded by the drain's own one-second period rather
than the `streams × windows ÷ 1,000` seconds that applies above it. **ADR-0021's "The cap is load-bearing"
obligation 2 is discharged by this**, and says so in place.

**OQ-56 — The adopted `--rt-text-disabled` misses `REQ-SHELL-145`'s 3:1 floor on every surface but the page ground.** *(`docs/design/README.md` §5 item 1, which named this token as the one specifically at risk; REQ-SHELL-145, REQ-SHELL-160 (a). Raised 2026-09-12, when `pnpm theme-proof` settled that acceptance item from rendered pixels for the first time.)*

`docs/design/system/tokens/colors.css` sets `--rt-text-disabled` to `oklch(52% 0 0)` and `packages/contracts/src/theme/themes.ts`
transcribes it without drift, which a test pins by name. Against the default palette's own surfaces that value clears
**3.22:1 on `--rt-bg`, 3.07:1 on `--rt-chrome`, 2.90:1 on `--rt-surface`, 2.56:1 on `--rt-surface-2` and 2.48:1 on
`--rt-hover`** — and REQ-SHELL-145 requires 3:1 **on every background the token is actually painted on**. The rendered
proof measures **2.898:1** on a card for "Cancel selection" (`disabled`) and for Mission's "Pause" (`aria-disabled`,
which wears the same colour) at 100 %, 125 %, 150 % and 200 %; `nocturne` (60%) and `high-contrast` (62%) clear every
surface and are not affected. **At 175 % the same pair measures 3.030:1 and passes** — one scale's device-pixel
rounding is the entire distance to the floor, which is the strongest argument that the value was never measured rather
than deliberately chosen. The matrix was run twice and both passes name the same strings, the same ratio and the same
four scale points. The static check in `static-contrast.ts` passed because it tests the ground alone, which is
**REQ-SHELL-160 (a)'s own sentence** — "a token pair that computes correctly but paints over a different surface fails".

**Two resolutions, and both belong to the owner.** Either the adopted token rises — `oklch(58% 0 0)` clears 3.18:1 at
the dimmest surface and stays at 4.14:1 on the ground, comfortably under half the enabled 14.86:1 the same requirement
caps it by, and leaves the default still dimmer than the other two themes — or REQ-SHELL-145's floor is amended to name
the ground it is measured against. **An agent may not choose between them**: the first changes approved design material
and the second changes an approved requirement. Until it is answered, `pnpm theme-proof`'s `contrast` section is red on
`rotaris-dim` at four of the five scales **and on nothing else**, the two tests that pin the shortfall keep it from being
lost, and the narrow static check stays narrow so the conflict cannot be mistaken for an ordinary test failure.

**RULED 2026-09-18: the adopted token rises.** The owner chose the first resolution — `--rt-text-disabled`
to `oklch(58% 0 0)` in the adopted material, transcribed without drift, with `theme-proof`'s `contrast`
section as the measure that closes this question.

**OQ-57 — Decision closed, 2026-09-13.** The owner ruled by direction — *"i want you to fix ALL of them"* — so **the product draws a checkbox**, and it is assembled from parts the language already declares rather than invented as a new idiom: `.input`'s hairline and `--rt-boundary-strong`, `--rt-radius-sm`, `--rt-accent` for the checked ground, `--rt-accent-100` for the tick, and the one focus ring every control shares. It is `Checkbox` in `packages/ui/src/design-system/forms.tsx`, the twenty-eighth brief; the native `input` is the control itself under `appearance: none`, so a pointer, a screen reader and the focus ring all meet one element, and the label sits beside the box on one line. Seven call sites moved onto it. The `.check__box` span the first draft drew beside a hidden 1 px input is gone with it, because a hidden input takes two literals the baseline would have had to carry. **The question below is kept as it was asked**, because the reason it was a question — that an agent may not mint a member of the design language — is the part worth keeping, and the answer is the owner's, not the builder's. Recorded in `docs/product/requests.md` as R-008.

**OQ-57 — The product draws checkboxes and the adopted design language has none.** *(`docs/design/README.md` §2; raised 2026-09-12 by the first independent visual-critic pass, finding UIR-004.)*

`docs/design/` contains **no checkbox** — not in the token set, not in §1's component notes, not in the mockup. The
product needs them all the same: the start-session dialog's "Run in an isolated Git worktree", the Requirements board's
"Blocked column", and the worktree-cleanup dialog's "Don't ask again" (`REQ-GIT-135`). They are drawn today as the
platform's native control, and it shows — the critic measured the Requirements checkbox at **13 × 24 with
`border-radius: 0px`**, below every radius the system declares, and in the start-session dialog the box sits at one end
of its row with the words it governs at the other. The shared layer has no `Checkbox` because the material it is drawn
from has none, and `tools/check-ui-language.mjs` cannot catch it: the callers pass `type="checkbox"` to the shared
`Input`, so the guard sees a component, not a raw control.

**This is a gap in the adopted material, not a violation of it, and the difference decides who answers.** There is no
approved drawing to match and no requirement that states one, so an agent drawing a checkbox here would be inventing a
member of the design language — which `CLAUDE.md` forbids in exactly these words. Either the design material gains a
checkbox (and the shared layer gains the component that transcribes it, with the native input kept underneath for its
semantics), or the product states that these three choices are drawn as `ToggleSwitch`, which the language **does**
define. The layout half is not waiting on the answer and can be repaired under either: a control and its label belong on
one line, adjacent.

**OQ-58 — "the current session" has no referent while a workspace has several.** *(REQ-WORKSPACE-057, REQ-WORKSPACE-058, REQ-WORKSPACE-073 against `PD-WORKSPACE-001`; raised 2026-09-14 while planning portable-skill discovery, ADR-0063.)*

Three requirements scope skill state to "the current session": a manually loaded skill "applies to the
current session only" (057), the catalog cache is "cleared on every session creation" (058), and an
invoked skill's load mode becomes `on` "for the current session only" and is discarded by session
creation (073). Each was written when a workspace had one. `PD-WORKSPACE-001` has since made a second
session on one workspace an offered route — it is the directive's whole subject — and `REQ-STARTUP-162`
makes several windows ordinary. Two sessions on one workspace can therefore be live at once, and none
of the three requirements says whether a skill forced in one is forced in the other, or whether the
*second* session's creation clears a cache the *first* still depends on.

The gestures that set the state also have no session to name at the moment they happen. A user loads a
skill file or types its command from a window that may be showing no session at all, and the sentence
"applies to the current session" then has no referent rather than an ambiguous one.

**What the build proceeds under.** State is keyed by **session id**, with one `pending:<root>` bucket
per workspace root that the next session created for that root adopts. A gesture with no session
follows the pending bucket; a gesture with one is that session's alone. Session creation clears the
**catalog cache** for its root (058's literal rule, which is about re-reading disk and is harmless when
shared) and adopts the pending bucket, leaving any other live session's forced set untouched. That is
the reading under which no requirement is violated for a single session and no session can silently
change another's context.

**What the ruling decides.** Whether skill session-state is per session (built) or per workspace, and
whether a second session's creation may clear the first's forced skills. The second reading is cheaper
to implement and worse to use: a colleague starting a second session in the same folder would silently
drop a skill out of the first session's agents mid-run. Stated here rather than chosen quietly.

**OQ-59 — REQ-WORKSPACE-151's chooser asks for a file **or** a directory, which no platform dialog offers.** *(REQ-WORKSPACE-151 with REQ-WORKSPACE-057 and REQ-SHELL-164; raised 2026-09-14 by the same planning pass.)*

REQ-WORKSPACE-151 requires the "Load skill file…" action to open "the platform's own file chooser,
**restricted to selecting a `SKILL.md` file or a directory containing one**", applying REQ-WORKSPACE-057
— which accepts either. On Windows and Linux the host dialog cannot offer both: Electron's
`openFile` and `openDirectory` properties are mutually exclusive there and only macOS honours both at
once. The requirement asks for a restriction the platform does not have, so a product cannot be
answerable for it in REQ-SHELL-164's terms, which make the product answerable only for what it supplies
to the host.

**What the build proceeds under.** A **file** chooser filtered to `SKILL.md` on win32 and linux, both
properties on darwin. The file form is the one the requirement names first, it is what the mockup's
action implies, and a directory holding a `SKILL.md` is reachable by selecting that file. The
**directory** form of REQ-WORKSPACE-057 stays reachable through the typed `/skill <path>` command
(REQ-CHAT-162), so no capability the specification states is lost — only the dialog is narrower on two
of three platforms, and REQ-WORKSPACE-057's own directory-path error message stays reachable and is
still produced by the path resolver.

**What the ruling decides.** Whether REQ-WORKSPACE-151 is amended to name a file chooser (what is
built), or whether the action becomes two — "Load skill file…" and "Load skill folder…" — which is the
only way to offer both on every platform and adds a header action the requirement does not state.

**OQ-60 — What summary does a session carry when the run that owned it died without a teardown?** *(REQ-ORCH-082 with REQ-SESSION-060/062 and REQ-SESSION-093; raised 2026-09-16 while repairing the plan gate's cancel path.)*

`REQ-ORCH-082` is "the single definition of end-of-run summarization for the whole product", and all
five of its arms are selected by a **stop reason**. A run whose host process died recorded none: the
session is corrected by `Sessions.repairOne` under REQ-SESSION-060/062, which fixes exactly what that
correction writes — its type, severity, actor, message and metadata keys — and says nothing about the
three summary columns. So a recovered session reads back with `summary_text` NULL, and three readers
show the absence: the session record presents no summary at all, `summary.md` omits its Outcome block,
and the agents view's activity line is empty.

**What the build proceeds under.** Nothing: the repair path leaves the columns as it found them, which
is what it has always done. The sibling case that *is* decidable was fixed in the same pass — a cancel
taken at the plan gate comes to rest through `resolvePlanGate` rather than through the run's teardown,
and it records a stop reason of `user_cancelled`, so REQ-ORCH-082's first arm selects itself and is now
written there.

**What a ruling decides.** Whether REQ-ORCH-082 gains a sixth arm for a run that ended without ending
(and therefore whether an interruption is an outcome the product summarises at all), or whether
REQ-SESSION-062's correction entry is the whole of what a recovered session says about itself, in which
case the three NULL columns are correct and the readers should present that entry instead. The build
must not choose: a second place deciding a summary would contradict REQ-ORCH-082's own claim to be the
only one.

**OQ-61 — May an isolated run read the repository metadata of the worktree it is working in?** *(REQ-TOOLS-132 with REQ-GIT-019/021/022 and REQ-TOOLS-001/142; raised 2026-09-16 while repairing what an isolated plan-mode run hit.)*

An isolated run works in a linked worktree under `<workspace>/.rotaris/worktrees/<id>`, which
REQ-GIT-019 makes its effective root. A linked worktree's `.git` is a **file** holding a
`gitdir:` pointer, so HEAD, the refs and the worktree's own administrative directory all live
under `<workspace>/.git/`, above the fence. Every repository-metadata path the run reached for in
session `6696f6ed` — `.git/HEAD`, `.git/refs/heads/<branch>`, `<workspace>/.git/worktrees/<id>/HEAD`
and a bare `../` — was refused by REQ-TOOLS-129's boundary check, and the run recorded its own git
state as unverifiable.

The fence admits a read outside the root only from a **designated additional read-only root**
(REQ-TOOLS-132), and the corpus designates exactly two things: `runtime.additional_read_only_roots`
(REQ-CONFIG-468) and the catalogued skill directories (REQ-WORKSPACE-059). A repository's git
directory is not among them. Nor is there a read-only git tool to ask instead: REQ-TOOLS-001 and
REQ-TOOLS-142 declare `git_commit` and nothing else.

**What the build proceeds under.** Nothing changes: an isolated run still cannot read the metadata
of the worktree it occupies. What *was* repaired in this pass is only the answer it received —
`read_file .git/HEAD` replied `Its parent directory does not exist either.` about a `.git` that
exists and is a file, which sent the run looking for a path that was there all along.

**What a ruling decides.** Which of three shapes the capability takes, if it is wanted at all:
the run-host designates the base repository's git directory as an additional read-only root for an
isolated port, which needs no new tool but adds a read root the corpus does not name; or
REQ-TOOLS-001 gains a read-only git member, which is a new tool with its own contract and its own
permission facet; or the run is *told* its branch and base commit in the opening context it already
receives and never reads metadata at all, which is a message the specification does not have. The
build must not choose between them: each one adds product behaviour, and the third would put the
git state in a place no requirement says it appears.

**RULED 2026-09-18: REQ-TOOLS-001 gains a read-only git member.** The owner chose the second shape —
a new tool with its own contract and its own permission facet (reads declared, read-only class, no
writes, no commands), reading the worktree's metadata through the `gitdir:` pointer rather than
through a new read root. The refusal for unlisted metadata stands; only the tool's own operations
are granted.

**Built and run the same day it was ruled.** `git_read` (`packages/agent-tools/src/tools/git-read.ts`,
`REQ-TOOLS-193`): operations exactly `head` and `read_ref`, resolved from `HEAD`, loose refs and
`packed-refs` through the `gitdir:` pointer and its `commondir`, no subprocess, no command run; any
other repository path refused, a non-repository refused up front. Nineteen names in
`REQ-TOOLS-001`/`REQ-TOOLS-006`/`REQ-TOOLS-007`, the declaration and the class in `registry.ts`, the
executor wired in `run-host/tools.ts`, the read group in `children/personas.ts`. No policy rule
added — the tool takes no path, so the outside-workspace ask never fires — and no transcript change:
a tool call is a tool call. First execution: seven unit cases against real repositories (plain,
linked worktree with the pointer file, packed-only ref, detached HEAD, non-repository, traversal
names, the mandated refusals), plus the registry, planning-grants and contract pins — all green.

**OQ-62 — May a price come from a provider's discovery payload, and may a provider-reported cost be shown under its own qualifier? PARTLY RULED 2026-09-16 — the second half is answered, the first is not.** *(REQ-PROVIDER-072, REQ-MONITOR-166, REQ-CONFIG-088, with ADR-0031 and OQ-21; raised 2026-09-16 from a run whose cost read `0` throughout.)*

Every run's `cost` column reads `"0"` and every cost label reads "price not established". That is not a
defect of the aggregate: `Aggregates` has no mutator for cost because there is nothing to feed one.
Four routes to a figure exist and three of them need a ruling.

**Discovery drops the prices it is given.** `REQ-PROVIDER-072` admits pricing "only for
`concrete-cloud`", so `describeModel` returns `pricing: {}` for every other provider and a test pins
it. OpenRouter publishes per-token prices in the same payload, as decimal strings, and they are
discarded on the way past.

**A provider-reported per-request cost has nowhere to land.** OpenRouter answers `usage.cost` when the
request asks for it; the adapter neither asks nor reads it. `REQ-MONITOR-166` fixes the cost label's
qualifier as one of three — `unknown`, `incomplete`, `configured` — and a figure the provider itself
computed is none of them. A fourth would have to be named.

**Configured rates are covered in principle and blocked in practice.** `REQ-CONFIG-088`'s
`input_cost_per_token` / `output_cost_per_token` take effect only when both are set — and today they
take effect never: `effectivePricing()` has no callers at all. Multiplying them is where this stops.
`REQ-PROVIDER-121` states the one money rule, that no amount is computed in binary floating point
anywhere; ADR-0031 is the decision that carries it out, and it is **proposed**, names a spike it has
not had, and is blocked by **OQ-21** — the same two fields are float-typed at their source
(`REQ-CONFIG-088`, `REQ-PROVIDER-072`) and exact in the rule that consumes them. ADR-0031's first
accepted consequence settles what to do meanwhile in terms: if the float typing stands, the exactness
is unattainable and "that is a specification defect to be recorded rather than a design to be built
around".

**What the build proceeds under.** Nothing was built for this, deliberately. Cost stays `"0"` and the
label stays `price not established` under the `unknown` qualifier, which `REQ-MONITOR-166` provides
for. Writing the arithmetic now would choose ADR-0031's representation before OQ-21 answers and before
the spike that decision requires, and a second money path is precisely what the lint rule in that
decision exists to prevent. The gap is recorded as an open defect note instead.

**What a ruling decides.** Whether discovery carries per-token prices for every provider (as decimal
strings, extending OQ-21's own recommended reading, which would amend `REQ-PROVIDER-072`'s
`concrete-cloud` clause); whether `REQ-MONITOR-166`'s qualifier set gains a fourth member for a price
the provider computed rather than the product; and whether configured rates are meant to produce a
figure at all — which cannot be built until OQ-21 says what a price is.

> **Disposition, 2026-09-16 (R-026).** One of the three is ruled and the other two are not, so the paragraphs
> above stay as written rather than being edited to match the answer.
>
> **Ruled:** the provider-reported cost. `REQ-MONITOR-166`'s qualifier set gains a fourth member for a figure
> the provider computed, and the adapter asks for and reads it — `PD-MONITOR-001`, a directive rather than an
> amendment round, because the owner is choosing to narrow a requirement that is not wrong. The sentence above
> that says "a fourth would have to be named" is **falsified and kept**: it is what the record said before the
> owner named one. What made this branch rulable while the other two are blocked is that carrying a figure the
> provider computed is exact decimal **addition** and never a multiplication, so `REQ-PROVIDER-121`'s money
> rule is met without saying what a price is. See `owner-decisions.md`, "OQ-62 — a provider-reported cost,
> ruled".
>
> **Still open:** discovery pricing, which is blocked behind OQ-21 for the reason stated above, and configured
> rates, which stay unbuilt. The paragraph "What the build proceeds under" continues to hold for both: cost
> reads `"0"` under the `unknown` qualifier wherever no provider-reported figure exists, which after the
> ruling is every provider but OpenRouter.
>
> **Configured rates ruled, 2026-09-23 (R-049).** With OQ-21 answered, the third branch is ruled by
> `PD-MONITOR-001` revision 2: a request the provider did not price is priced from the model's configured rates
> where both are set, exactly, under the `configured` qualifier, and `incomplete` marks a total some requests
> could not contribute to. **Discovery pricing stays open**: the owner deferred it, so `REQ-PROVIDER-072`'s
> `concrete-cloud`-only clause still governs.
>
> **Built the same day.** The ruled branch is no longer only ruled: the adapter asks OpenRouter for the figure
> and reads it back, `Aggregates.addCost` adds it in exact decimal arithmetic, and the label carries the fourth
> qualifier. The two open branches were not touched by that work and are not unblocked by it — what made this
> one buildable was addition, and neither of theirs is addition. The account is in
> `docs/architecture/first-executions.md`, and the arithmetic is reported back into ADR-0031 in place.

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

**OQ-65 — Do the instruction-file switches reach the retrospective, or only what agents are given?** *(`PD-LIBRARY-002` over REQ-WORKSPACE-041, since narrowed by `PD-WORKSPACE-002`; REQ-WORKSPACE-048. Raised 2026-09-22 by repairing [`the-retrospective-reads-instruction-files-the-user-switched-off.md`](../defects/fixed/the-retrospective-reads-instruction-files-the-user-switched-off.md).)*

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

**OQ-66 — How does `delegate` name the child a continuation continues?** *(`PD-ORCH-004` over REQ-ORCH-088; REQ-TOOLS-152, with REQ-TOOLS-153/154, none of which the directive names. Raised 2026-09-27 by building `PD-ORCH-004` under [R-057](../product/requests.md#r-057).)*

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

**Ruled 2026-09-27 — by [`PD-ORCH-004`](../product/directives.md#pd-orch-004) revision 2, [R-058](../product/requests.md#r-058).**
The owner took the recommendation: the directive now states `continuation_of` and its refusals, and extends REQ-TOOLS-152,
which carries the back-pointer. The two limits named above are not settled by this ruling. Which agent may take up an
offer after the iteration that raised it has ended belongs to the run-continuation policy the same request opened, and
until that is ruled the build keeps the same-iteration reading.

**Ruled 2026-09-29 — OQ-66's open part, `session_id`, by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 5
(clause 22) and [`PD-TOOLS-006`](../product/directives.md#pd-tools-006) revision 3, [R-067](../product/requests.md#r-067).** The owner
took the recommendation. `session_id` (REQ-TOOLS-152) names, by task id, a settled child of the caller: a direct child,
by REQ-TOOLS-155's ownership test, that has reached a terminal state. A child its `child_timeout` cut off is not one; it
keeps `continuation_of` (`PD-ORCH-004`), and a `session_id` naming it is refused with a reason naming that field. The
follow-up resumes the named child from its recorded conversation (`PD-ORCH-005`'s record) under its own task id, with
the call's `task` appended as its next user message, and the child ends and reports again as any child does. A
`session_id` that names no such child is refused like REQ-TOOLS-152's other refusals: status `rejected`, no record, no
task id. REQ-TOOLS-152 is narrowed by `PD-TOOLS-006`, the one directive that narrows it, and its back-pointer is amended
in place; REQ-MONITOR-300's back-pointer from `PD-ORCH-005` names the one exit from a terminal state a follow-up takes.
Nothing is built by this ruling: until
[`delegate-drops-session-id-and-suppress-auto-context.md`](../defects/delegate-drops-session-id-and-suppress-auto-context.md)
is repaired the field is accepted and dropped. The first limit named above, which agent may take up an offer after its
iteration ended, was ruled by `PD-ORCH-004` revision 3; `session_id` keeps the direct-child test, so a later
iteration's root cannot follow up an earlier iteration's child.

**OQ-67 — Where does the `/skills` listing go when there is no transcript to write it into?** *(REQ-CHAT-162 with REQ-WORKSPACE-067 and REQ-WORKSPACE-151; OQ-58. Raised 2026-09-27 by building the listing, `first-release-plan.md` §2.2; raised as OQ-66 and renumbered OQ-67 when it reached `main`, where OQ-66 had been taken by the question `PD-ORCH-004` revision 2 rules.)*

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
  (`../defects/slash-proof-expects-every-built-in-to-carry-the-action-badge.md`).
- **(g) Who else reads the row.** The row is a system row, and the improvement analyst takes every recent row's
  text as evidence (`packages/engine/src/improvements/capture.ts`), so a listing carries the names, descriptions
  and paths of skills set to "hidden" to that model. The agent path does not (it keeps user and agent rows only).
  Whether "hidden" (REQ-WORKSPACE-062) reaches that far is not stated; nothing withholds them today.

**OQ-68 — What does REQ-WORKSPACE-049's "up to 20 context files" measure, when discovery can reach fourteen?** *(REQ-WORKSPACE-049 with REQ-WORKSPACE-041/042, both narrowed by `PD-WORKSPACE-002`; first-release-plan §3.2. Raised 2026-09-27 by building the fixture "at exactly that bound"; raised as OQ-66 and renumbered OQ-68 when it reached `main`, the `/skills` listing's OQ-67 having reached it first.)*

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

**OQ-69 — Does a default entry shipped switched off count as one the default configuration "launches"?** *(REQ-STARTUP-059 with REQ-MCP-095 and REQ-STARTUP-064; REQ-MCP-010, REQ-CONFIG-181. Raised 2026-09-27 by building the version guard, first-release plan §4.1; raised as OQ-66 and renumbered OQ-69 when it reached `main` after the `/skills` listing's OQ-67 and the injection proof's OQ-68.)*

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

**OQ-70 — Are the numbers in a release tag canonical decimals?** *(REQ-STARTUP-027, REQ-STARTUP-029, REQ-STARTUP-031, REQ-STARTUP-109. Raised 2026-09-27 by building the version guard, first-release plan §4.1; raised as OQ-67 and renumbered OQ-70 when it reached `main` after the `/skills` listing's OQ-67 and the injection proof's OQ-68.)*

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

**OQ-71 — With no version metadata, does the running desktop report `dev` or `0+unknown`?** *(REQ-STARTUP-004, REQ-STARTUP-007; REQ-STARTUP-109, REQ-STARTUP-158, REQ-STARTUP-159, REQ-SHELL-140. Raised 2026-09-27 by the review of the version guard, first-release plan §4.1; raised as OQ-68 and renumbered OQ-71 when it reached `main` after the `/skills` listing's OQ-67 and the injection proof's OQ-68.)*

Both requirements govern the same value and fix different literals for the same case. REQ-STARTUP-004: the product
reports its version from its own installation metadata, and "when that metadata is absent, the reported version SHALL
be the literal string `0+unknown`". REQ-STARTUP-007: the running desktop treats as its version the one that metadata
declares, "else the literal `dev` when no such metadata is present", and that value is the one the About surface
presents and the one compared against the release feed. REQ-STARTUP-007 cites REQ-STARTUP-004 for the first branch, so
the two are meant to agree, and do not. Before 2026-09-27 the code had no absent-metadata branch to disagree with:
`app.getVersion()` always answered something, Electron's own version for the unpacked entry. Reading the application's
manifest (`@rotaris/platform`, `version.ts`) gave the question a place to be answered.

**What the build proceeds under.** `dev`. REQ-STARTUP-007 is the requirement written for the running desktop and for
the two consumers of the value (the About surface, REQ-SHELL-140, and the update comparison); REQ-STARTUP-109's
unanswerable comparison names `dev` as its example; and `0+unknown` is not a version REQ-STARTUP-027's grammar parses
either, so nothing downstream distinguishes the two. `VERSION_WITHOUT_METADATA` in `packages/platform/src/version.ts`
carries the literal and cites this question. Neither literal can reach an installed build: REQ-STARTUP-004's own last
sentence and REQ-STARTUP-159's About observation forbid it, and electron-builder always packs the manifest.

**What a ruling decides.** Which literal the running desktop reports without metadata. If `0+unknown`, the constant
changes and nothing else does; if `dev`, REQ-STARTUP-004's second sentence is amended to agree.

**OQ-72 — What is one entry of the notices file: a package, or everything compiled into one?** *(REQ-STARTUP-142, REQ-STARTUP-143. Raised 2026-09-27 by building the notices generator, `first-release-plan.md` §4.3; raised as OQ-66 and renumbered OQ-72 when it reached `main`, after the `/skills` listing, the injection proof and the version guard had taken OQ-67 to OQ-71.)*

REQ-STARTUP-142 wants "one entry for every dependency present in the shipped artifact", each naming "the component,
its version, its license identifier, and its full license text", and REQ-STARTUP-143 fails the release on a
dependency that "declares no license identifier". Three kinds of thing are present in the artifact and are not
packages a package manager lists, and none of them can meet all four fields:

- **What is compiled into Electron.** The runtime's binaries carry 779 components — Chromium's third-party code,
  Node.js, V8 and ffmpeg, which is under the LGPL, among them. Electron's own credits file, `LICENSES.chromium.html`, gives each a
  title, a homepage and a licence text, and **no version and no identifier**. Read as 779 entries, the release could
  not pass REQ-STARTUP-143 until someone supplied 779 identifiers the credits do not carry, and the reviewed table
  has no route for a missing identifier (OQ-74).
- **What this build compiles into its own native modules.** SQLite into `better-sqlite3`, and winpty into
  `node-pty` on Windows, from sources the host packages vendor. `electron-builder.yml` strips those sources and their
  licence files from the archive (ADR-0056 rule 1).
- **What the bundled interpreter links.** The code-intelligence runtime's CPython (python-build-standalone, install-only)
  carries OpenSSL, SQLite and zlib linked in (the interpreter answers OpenSSL 3.5.7, SQLite 3.53.1, zlib 1.3.2) and
  Tcl/Tk beside it. Its `LICENSE.txt` names only the software incorporated into CPython itself, and never mentions
  OpenSSL. The install-only tree has no record of the rest that could be read offline.

**What the build proceeds under.** The entry is what a package manager enumerates — an npm package, a Python
distribution, the interpreter, a font — and what is compiled into one is that component's own disclosure:

- Electron is one entry (MIT, its `LICENSE`), and its credits are reproduced whole, in plain text, as the file's last
  section, each under its title and homepage, stated as "as compiled into Electron 44.1.1". That section is 19.8 MB
  of the file's 20.4 MB.
- SQLite and winpty are listed as entries of their own, read from the installed host package: the version from the
  sources, the identifier from the text (`blessing`, `MIT`), and "Contained in" naming the host. This is because the
  packager removes the only other place their notices would be.
- The interpreter's linked libraries are **not listed**. That is a known gap, not a reading, and it is stated here so
  it is not mistaken for coverage. The file says so too, at the head of its runtime section, and its header claims
  "the third-party components" of the build rather than every one.
- *Added 2026-09-27 by the gate review.* Two consequences of reading the closure from production edges:
  - The icon set appears twice: as `@phosphor-icons/web` 2.1.1, a production dependency of the application, and as
    "Phosphor Icons", which REQ-STARTUP-142 names on its own.
  - Two type-only packages are listed that no artifact carries: `json-schema` 0.4.0 and `@standard-schema/spec`
    1.1.0, production dependencies of `@ai-sdk/provider` and `@ai-sdk/provider-utils`. The review read a scratch
    build's sourcemaps and found that the bundler inlines neither.

  Both errors list more than ships, never less.

**What a ruling decides.** Whether the credits of a component the build takes whole (Electron's, and any other
bundled distribution's) satisfy REQ-STARTUP-142 when they are reproduced beneath it, or whether each credited
component must be an entry with a version and an identifier. And whether the interpreter's linked libraries must be
enumerated, which would mean building the runtime from a python-build-standalone archive that carries its licence
records (the full archive, not the install-only one) or declaring them by hand in a reviewed table.

**OQ-73 — REQ-STARTUP-142 names two things the first release does not carry: Manrope, and Git and ripgrep.** *(REQ-STARTUP-142 with REQ-STARTUP-040, REQ-STARTUP-058, `PD-STARTUP-001`. Raised 2026-09-27 by building the notices generator; raised as OQ-67 and renumbered OQ-73 when it reached `main`, after the `/skills` listing, the injection proof and the version guard had taken OQ-67 to OQ-71.)*

REQ-STARTUP-142 states the file "SHALL further contain the license texts of the bundled fonts JetBrains Mono,
Manrope and Space Grotesk", and that its tools section is "generated from the setup manifest of that same build,
listing for Git and for ripgrep the name, provisioned version, source URL and license identifier the manifest
pins". Both clauses assume something about the build that is not true of this one.

- **Manrope is not bundled.** The design import carried no Manrope file, so `packages/ui/src/fonts.css` declares two
  faces and the body text falls back to the system face (the file says so). REQ-STARTUP-040's "register bundled font
  families so branded fonts render from first paint" is short one family for the same reason.
- **No setup manifest in this build pins a machine tool.** Machine setup — REQ-STARTUP-058's first list, REQ-STARTUP-060
  onward — is not built, and it is not in the first-release plan. The only manifest the build carries is the
  code-intelligence pins (`apps/desktop/scripts/code-intelligence/pins.json`), whose `languageServers` is the second
  list of REQ-STARTUP-058. Nothing in this build downloads Git or ripgrep.

**What the build proceeds under.** The file tells the truth about the artifact and keeps each clause's text where
it can:

- Manrope's OFL-1.1 text is reproduced, as the requirement names it. Its entry's version reads "not contained in this
  build", so no reader takes the licence for a file that is not there. When the design material supplies the face and
  `fonts.css` declares it, the table beside the generator gains the file and nothing else changes.
- The tools section reads the manifest the build has. Under "Machine tools" it says the setup manifest of this build
  pins none, so this build downloads neither Git nor ripgrep. It then lists the language servers with their four
  fields, as IC-7 requires. When machine setup is built its manifest carries `machineTools`, and the section lists them
  as downloaded and not contained. The generator already renders that shape, and it is tested with ripgrep.
  *Added 2026-09-27 by the gate review:* that shape is the generator's own assumption: one `{name, version, source,
  license}` object per tool, under a `machineTools` key. REQ-STARTUP-058 describes the machine-tool manifest per
  platform, with archives, digests and layouts. Neither the key nor its shape is decided anywhere yet. Machine setup
  decides both, and the generator's reader follows.
  *Added 2026-09-28 (R-062), a report and not a ruling:* the setup manifest now exists
  (`apps/desktop/resources/setup-manifest.json`, `SetupManifestSchema`), so the shape is decided and the reader has
  followed it: `machineTools[]` with `provisionedVersion` as the version. The section lists Git 2.55.0 and ripgrep 15.2.0
  with their four fields. Machine setup is still not built, so the file does not say "downloaded after installation" as
  a fact: it says the tools are to be downloaded after installation by machine setup, which this build does not yet
  carry, so this build downloads none of them. What the file says once machine setup ships, or is ruled out of the
  first release, is still this question's ruling. The "pins no machine tools" sentence stays for a manifest that pins
  none (`../defects/fixed/the-notices-file-says-the-setup-manifest-pins-no-machine-tools.md`).

**What a ruling decides.** Whether the first release ships without Manrope, and if so whether REQ-STARTUP-142's
font clause is narrowed to the faces the build carries; and whether machine setup belongs in the first release —
without it REQ-STARTUP-058's first list is unmet, which is a larger question than the notices file.

**OQ-74 — May the reviewed-exceptions table supply a licence identifier a dependency does not declare?** *(REQ-STARTUP-143. Raised 2026-09-27 by the notices generator's first run against the bundled runtime; raised as OQ-68 and renumbered OQ-74 when it reached `main`, after the `/skills` listing, the injection proof and the version guard had taken OQ-67 to OQ-71.)*

REQ-STARTUP-143 fails the release on "a dependency in the shipped closure declares no license identifier", and
separately on "a dependency carries no license text and is not covered by the ... maintainer-review table". The
table's entries each carry "the license identifier claimed for it", but the requirement gives the table only the
second failure to excuse.

The first run found the case the requirement does not route: `dotenv` 0.9.9, a shim `serena-agent` 1.7.0 requires in
the code-intelligence runtime. It declares `License: UNKNOWN` and no classifier, and it ships an MIT `LICENSE`. It has
text and no identifier. No change a maintainer can make lets it pass, short of removing it from the runtime, which
would break the tool server.

**What the build proceeds under.** The requirement as worded: a missing identifier fails validation, and an
exception in the table does not excuse it (tested). The generator reads an identifier from what a component
declares, most specific first: `License-Expression`, a one-line `License`, the licence classifiers, the first line of
a `License` field that holds a whole text. `UNKNOWN` declares nothing. It never infers an identifier from a licence
text a dependency ships. The one place it reads a text for an identifier is a component that states its licence by
name inside it: the interpreter, SQLite and winpty.

**What a ruling decides.** Whether a table entry, being a reviewed and expiring claim of an identifier, may also
cover a dependency that declares none. That ruling would change REQ-STARTUP-143's wording and one condition in
`collectNotices`. Until then the first release is blocked on `dotenv` as surely as on O-3.

*Added 2026-09-27 by the generator's gate review:* an identifier is copied as the component declares it and is never
normalised. The runtime's distributions declare `BSD License` (`itsdangerous`, `Jinja2`, `pywebview`), `MIT License`,
`Apache Software License 2.0`, `LGPLv2+` and `BSD 3-Clause`. REQ-STARTUP-142 does not ask for an SPDX identifier, but
`BSD License` names a family rather than one licence. Whether an identifier must be an SPDX expression, and who
supplies one where the component does not, belongs to the same ruling.

**OQ-75 — When does a component carry "its full license text"?** *(REQ-STARTUP-142, REQ-STARTUP-143. Raised 2026-09-27 by the notices generator's gate review; raised as OQ-69 and renumbered OQ-75 when it reached `main`, after the `/skills` listing, the injection proof and the version guard had taken OQ-67 to OQ-71.)*

REQ-STARTUP-142 wants each entry to carry the component's "full license text", and REQ-STARTUP-143 fails a release on
a dependency that "carries no license text" unless a reviewed exception covers it. Neither says what a licence file
that does not carry the licence counts as. The first build counted any non-empty licence-named file as the text. The
gate review found `@workflow/serde` 4.1.0, which the main bundle inlines. Its only licence file reads, in full, "Apache
License 2.0" and "See the LICENSE file in the root of this repository.", and the package ships no such file.
Reading the rest of the closure found three more kinds:

- **A licence's per-file notice, and nothing else.** The notice is what a licence asks to be applied to each file
  with. Apache-2.0's reads "You may obtain a copy of the License at …". Five npm packages carry only that: `ai` 7.0.92,
  `@ai-sdk/gateway`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible` and `@ai-sdk/provider`. So does `mslex` 1.3.0 in
  the runtime. `certifi` 2026.7.22 carries only MPL-2.0's Exhibit A.
- **An attribution declared as a licence file:** `mslex`'s `AUTHORS.rst`, beside its notice.
- **A short file that sends the reader to its siblings:** "the licenses found in LICENSE.APACHE or LICENSE.BSD"
  (`cryptography`, `sniffio`, and pip's vendored `packaging`). Their siblings carry the texts.

**What the build proceeds under.** A licence file is one of three things (`licenseTextKind` in
`tools/notices/notices.mjs`), and only the first is the component's licence text:

- **text**: it carries a licence;
- **a reference**: it only names a licence on one line. Or it is at most 2,000 characters, it sends the reader
  elsewhere, and it carries no grant of its own. "Sends elsewhere" is one of: "see the LICENSE" (a markdown link,
  "see the `[LICENSE](LICENSE)`", included), "found in LICENSE", "obtain a copy of the License", "can obtain one at",
  "should have received a copy of the". The grants checked are those of the licences short enough to sit beside such
  words: MIT and Boost, ISC and 0BSD, the BSD family, zlib, the Unlicense and SQLite's blessing. Every full text
  that quotes its own notice in an appendix (Apache-2.0, the GPL family, MPL-2.0) is far longer than the bound;
- **an attribution**: a file named NOTICE, AUTHORS, CONTRIBUTORS or CREDITS.

References and attributions are still reproduced with the component, because they carry its copyright and
attribution notices; Apache-2.0's NOTICE must travel with the work. A component that carries no text fails
validation, and the message names each file and what it does instead. Only a reviewed exception lets it pass, as for
a component that ships no file at all.

Electron, the interpreter, a compiled-in library and a bundled asset each have one named licence file. If that file
is only a reference, validation fails and no reviewed exception can cover it. REQ-STARTUP-143 gives the table to "a
dependency" in general, so this is stricter than the requirement. It is recorded here as a reading. No such case
exists in the first release.

Over this tree the rule leaves 12 shipped components without licence text. The first run counted 4.

Three limits are stated here, so that none is read as coverage:

- The classifier reads words, so a pointer worded differently from the phrases above passes as text.
- A file that carries one licence's text and refers elsewhere for another counts as text. `tqdm` 4.67.1 declares
  `MPL-2.0 AND MIT` and carries the MIT text in full beside MPL-2.0's Exhibit A, so its entry has no MPL-2.0 text.
  The generator does not match the texts a component carries against the expression it declares.
- The pass is per component, and a component's vendored libraries are not components of their own (OQ-72). pip
  26.2.1 passes on its own MIT text. Its vendored `certifi` ships only MPL-2.0's Exhibit A, so pip's entry carries no
  MPL-2.0 text. Its vendored `cachecontrol` and `msgpack` ship only Apache-2.0's per-file notice. The Apache-2.0 text
  is in pip's entry only because its vendored `packaging` happens to ship it as `LICENSE.APACHE`. This is `tqdm`'s gap
  one level down. The ruling below would close it only together with OQ-72's granularity. *Added 2026-09-27 by the
  gate review's second round, checked against the bundled runtime.*

**What a ruling decides.** Whether a component that ships only a licence's notice should instead get the canonical
text of the identifier it declares, reproduced by the generator from a version-controlled copy beside it (as
`bundled-assets.json` does for the fonts). The reviewed table asks "why no license text is obtainable". For
Apache-2.0 or MPL-2.0 the honest answer is that the text is obtainable and the package left it out. That ruling
would change REQ-STARTUP-143's route for such a component, and it would close `tqdm`'s gap as well. Until then,
eight of O-11's twelve reviews are for a notice or a pointer.


**Historical question.** *(ADR-0021 "The cap is load-bearing", obligation 2; REQ-TOOLS-108; REQ-CONFIG-116. Raised by Part AL, 2026-09-09, on wiring the key into the terminal manager — defect fifty-two found it registered, validated and read by nothing.)*

The key is registered with default 20 and minimum 1. Each background session publishes its own `bg:<id>` stream at up to 50 frames/s (the 20 ms floor), so the produced aggregate is `(agents + background sessions) × 50 frames/s`, and only one of those two factors — agents, REQ-MONITOR-285's 20 — has a ceiling. Part AL reads the key into the manager and caps the *delivered* rate per window at 1,000 frames/s by merging (REQ-MONITOR-306, REQ-SHELL-103), so a user who configures 400 background sessions saturates the run-host → main pipe, not a renderer. A stated maximum on the key would let the produced rate be computed rather than absorbed. The owner's call; recorded, not resolved.

**OQ-76 — Which timeline word records that a run's user went away, and came back?** *(REQ-ORCH-139, REQ-SESSION-142,
`PD-TOOLS-005`. Raised 2026-09-28 by building `PD-TOOLS-005` under [R-062](../product/requests.md#r-062).)*

`PD-TOOLS-005` makes a run treat the user as away once an approval wait has expired unanswered, and present again on
their next input to the session. An autopsy of such a run wants both instants: every approval ask between them was
refused without a prompt, and the stretch is what explains a row of `permission_denied` issues. REQ-ORCH-139 closes
the timeline-event vocabulary to the list in domain 01's Data & Formats, and domain 05's own Data & Formats names the
only other timeline events a permission mechanism may write (`permission_approved`, `permission_mode_changed`,
`permission_mode_downgraded`). Neither has a word for the user's presence, and the directive mints none.

**What the build proceeds under.** Both transitions are written to the session log (REQ-SESSION-142) at `WARNING` —
the default level, so that the end of a stretch is visible wherever its start is — in the words `user away: an approval
in this run went unanswered for <N> seconds …` and `user returned: input reached this session …`
(`packages/engine/src/run/presence.ts`). The denials themselves carry the cause in the decision's reason, which the
`permission_denied` issue records, so an autopsy reading the store alone still sees why each ask was refused; what it
cannot read from the store is the instant the user returned.

**What a ruling decides.** Whether the timeline gains two names for the transitions, and in which domain's list, or
whether the log line is the record. Recommendation: two names in domain 05's list, because the timeline is what an
autopsy reads first and is among the records the export reaches (REQ-SESSION-199), and the session log is neither.

**OQ-77 — Does the away state resolve the approval an `ask_questions` call itself needs under the `ask` preset?**
*(`PD-TOOLS-005`, REQ-TOOLS-007, REQ-TOOLS-158, REQ-TOOLS-178. Raised 2026-09-28 by building `PD-TOOLS-005` under
[R-062](../product/requests.md#r-062).)*

The directive keeps questions prompting and waiting while the user is away: "questions put to the user (REQ-TOOLS-158,
REQ-TOOLS-178) still prompt and wait". But `ask_questions` is outside REQ-TOOLS-007's read-only class, so under the
`ask` preset — the default — its dispatch resolves to the preset's default decision, `ask`, and the call needs an
approval before the question exists. That approval is an ask that would prompt, so while the user is away it is
resolved at once and denied: under the default preset no question reaches an away user, and the clause is reachable
only where the call is permitted outright — `autonomous`, a rule, or a session approval of the tool.

**What the build proceeds under.** The literal reading: the away state resolves every approval ask, the question
tool's own included, and the clause governs the question the executor raises, which still prompts and waits wherever
the call is permitted. A gate case pins both halves (`gate.test.ts`, "a question still prompts and waits while the user
is away").

**What a ruling decides.** Whether `ask_questions`'s own dispatch is exempt from the away resolution — or from the
preset default altogether, as the loop-control tools are under REQ-TOOLS-014 — so that a question can reach a user
who is away in the approval sense and may still answer one. Recommendation: exempt the question tool's own dispatch
from the away resolution and nothing else; a question is the one prompt the directive means to keep, and the preset's
decision on the call otherwise stands.

**OQ-78 — Does an approval already queued when the first wait expires still get its own full wait?**
*(`PD-TOOLS-005`, REQ-TOOLS-052, REQ-TOOLS-055. Raised 2026-09-28 by the verification of the `PD-TOOLS-005` build under
[R-062](../product/requests.md#r-062).)*

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

**OQ-79 — Is a `SKILL.md` that cannot be decoded as UTF-8 an "unreadable file"?** *(REQ-WORKSPACE-053, with REQ-WORKSPACE-045 and REQ-WORKSPACE-044. Raised 2026-09-28 by repairing REQ-WORKSPACE-045's decoding half, R-062. Raised as OQ-76 on its branch; renumbered OQ-79 at the merge, because OQ-76 to OQ-78 were already on `main`.)*

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

**OQ-80 — Does REQ-STARTUP-158's "every artifact … SHALL declare … that same version" reach the Windows installer's own version metadata?** *(REQ-STARTUP-158, REQ-STARTUP-018, REQ-STARTUP-027, REQ-STARTUP-031. Raised 2026-09-28 by repairing the prerelease naming defect, R-062; `docs/defects/fixed/a-prerelease-version-reaches-the-installer-hyphenated.md` Raised as OQ-76 on its branch; renumbered OQ-80 at the merge, because OQ-76 to OQ-79 were already on `main`.)*

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

**OQ-81 — What is another parent's completed task to a `delegate` call's `inherited_context`?** *(REQ-TOOLS-152 with
REQ-TOOLS-155, REQ-ORCH-032 and REQ-ORCH-072; REQ-ORCH-046. Raised 2026-09-28 by repairing
`the-inherited-context-reports-never-reach-the-child` under [R-062](../product/requests.md#r-062). Raised as OQ-76 on its branch; renumbered OQ-81 at the merge, because OQ-76 to OQ-80 were already on `main`.)*

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

**OQ-82 — Does the reserved token's launch of the application's own executable carry the parent's Chromium switches?** *(REQ-MCP-033, REQ-STARTUP-002, REQ-STARTUP-015. Raised 2026-09-28 by repairing `the-code-intelligence-server-dies-when-the-app-runs-as-root.md` (R-062). Raised as OQ-76 on its branch; renumbered OQ-82 at the merge, because OQ-76 to OQ-81 were already on `main`.)*

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

**OQ-83 — Should the record fix the manifest signature's algorithm and the forms of the key and the signature?** *(REQ-STARTUP-032, REQ-STARTUP-167, REQ-STARTUP-168; ADR-0054 "The updater". Raised 2026-09-28 by building the updater, first-release-plan.md §4.6, under R-062. Raised as OQ-76 on its branch; renumbered OQ-83 at the merge, because OQ-76 to OQ-82 were already on `main`.)*

Domain 11's Data & Formats says "the form of a key, the form of a signature, and how many keys a build carries are implementation choices and no surface of the product reports them", and REQ-STARTUP-168 says how a key is generated, held or transferred "is an architecture decision and is fixed nowhere in this document". ADR-0054 decided the mechanism (a detached signature, a compiled-in set) and named no algorithm. The build had to choose one, because a verifier cannot verify an unnamed form, and it chose **Ed25519 (RFC 8032) through Node's `crypto`**: `SHA256SUMS.txt.sig` is the raw 64-byte signature over the manifest's exact published bytes, and a carried key is an SPKI PEM block — the forms `openssl genpkey -algorithm ed25519`, `openssl pkey -pubout` and `openssl pkeyutl -sign -rawin` produce, so O-2 and §4.7's pipeline need no tool of ours. The choice is stated in `apps/desktop/src/main/updater/keys.ts` and in ADR-0054, and a test key pair exercises it.

**What the build proceeds under.** That reading. **What a ruling decides.** Whether the record should fix the algorithm and both forms as a decision (an ADR consequence the pipeline's §4.7 and O-2 are bound by) rather than leave them as a reading a later builder of the pipeline could choose differently — a signature the verifier cannot read is refused as not verifying, which strands nothing but installs nothing either. The residue is one line in ADR-0054 either way; the question is whether it is a decision or an implementation note.

**OQ-84 — Is a packaged Windows build outside `InstallDir` and without the launcher's variable portable, or not updatable?** *(REQ-STARTUP-106, REQ-STARTUP-125, REQ-STARTUP-147; ADR-0054 "How the artifact is identified for the update path" and "The updater". Raised 2026-09-28 by building the classification, first-release-plan.md §4.6, under R-062. Raised as OQ-77 on its branch; renumbered OQ-84 at the merge, because OQ-76 to OQ-82 were already on `main`.)*

REQ-STARTUP-106 says "every other Windows standalone build is classified portable", and its last sentence reads a copied installed tree as portable, "and the portable strategy of REQ-STARTUP-125 replaces it with a self-contained executable that runs from any location". ADR-0054, having moved the artifact's identity to the launcher's declared variable (measured: `process.execPath` points into the preparation in 149 of 149 launches), reads the absent variable the other way: "someone who runs the payload's executable directly out of a preparation is not running from a released artifact, so REQ-STARTUP-106 classifies the build not updatable and no request is issued at all". REQ-STARTUP-147 bears on the same case from the other side: "a variable naming the artifact a launch started from decides which file an update replaces and decides nothing about whether, when, or where the check happens" — and under ADR-0054's reading the absence of `ROTARIS_PORTABLE_ARTIFACT` is exactly what decides whether a packaged Windows build outside `InstallDir` checks at all. A ruling therefore settles both texts. The two cases — a copied tree and a payload run directly — are indistinguishable to the process, which sees a packaged executable, no registry match and no variable, and the two texts give them opposite outcomes. Following the requirement's sentence would also replace a `win-unpacked` tree's executable with a single-file portable in place, leaving the tree's support files beside a file that no longer needs them.

**What the build proceeds under.** ADR-0054's reading: **not updatable**, no request, one `info` line naming this question (`classify.ts`). **What a ruling decides.** Whether REQ-STARTUP-106's copied-tree sentence describes a consequence the product must produce (then the target is the running executable and the portable strategy replaces it, as the sentence says) or a consequence the discriminator would have had before the artifact's identity moved to the launcher's variable, in which case the sentence wants amending to ADR-0054's reading — and REQ-STARTUP-147's sentence with it, since under ADR-0054's reading the variable decides whether the check happens. *(REQ-STARTUP-147 added to this entry 2026-09-28 by the item's verification.)*

**OQ-85 — Which requirement governs the update notice while the download runs: REQ-STARTUP-118 or REQ-SHELL-118?** *(REQ-STARTUP-118, REQ-STARTUP-119, REQ-STARTUP-120, REQ-STARTUP-122; REQ-SHELL-114, REQ-SHELL-118. Raised 2026-09-28 by building the updater's notices, first-release-plan.md §4.6, under R-062. Raised as OQ-78 on its branch; renumbered OQ-85 at the merge, because OQ-76 to OQ-82 were already on `main`.)*

REQ-STARTUP-118: "a non-persistent notice titled `Downloading Rotaris {version}` SHALL show the message `{measured} — verifying against the published checksum when it finishes.`". REQ-SHELL-118: "While the download runs the notice keeps that title [`Rotaris {version} is available`] and its identity — it is updated in place, never replaced — and its message SHALL convey two things and no more: that the update is downloading, and how far it has got … When the download completes the message SHALL convey that the update is ready to install and the action SHALL be enabled again, performing the install action of REQ-SHELL-115". The two disagree on the title, on persistence (a non-persistent notice against the persistent offer's identity), on the message's content (a fixed three-part sentence against two things and no more) and on whether the apply waits for a second click, where REQ-STARTUP-122 runs download → verify → apply in one sequence.

**What the build proceeds under.** The identity is kept and the notice updated in place (REQ-SHELL-118 and ADR-0054's "the same notice by identity, never by replacement"); the title and message are REQ-STARTUP-118's, because Distribution owns the words and Shell the surface (`CONTEXT-MAP.md`); the notice is not persistent while the download runs, so no dismissal can wave off a version whose install is in flight; the action is disabled with an accessible description; and the apply follows the verified download without a pause, so the "ready to install" state stands only for the length of the apply. The failure becomes REQ-STARTUP-120's `Update not installed` in place. **What a ruling decides.** Which of the two texts is amended to the other on the title, the persistence, the message and the pause. Nothing in the mechanism moves with the answer beyond the words and one boolean.

**OQ-86 — Does the update's own close ask REQ-STARTUP-046's active-run confirmation?** *(REQ-STARTUP-046, REQ-STARTUP-119, REQ-STARTUP-121; ADR-0054 "The updater". Raised 2026-09-28 by the verification of the updater, first-release-plan.md §4.6, under R-062. Raised as OQ-79 on its branch; renumbered OQ-86 at the merge, because OQ-76 to OQ-82 were already on `main`.)*

REQ-STARTUP-046: "When a run is active, a confirmation SHALL be presented before anything is torn down; declining it SHALL abort the close, leaving the window open and accepting input and the run still executing." REQ-STARTUP-119: "when the hand-off requires quitting (Windows installer), the window SHALL auto-close after a 1200 ms single delay." REQ-STARTUP-121: "the current window closes only after the successor has started". The installer's auto-close and the restart's close are closes of a window, and a run may be active in it when the user chooses `Update now` or `Restart now`. If the confirmation is asked and declined, the installer is already running against the tree the window runs from, and after a restart the record has already passed to the successor, so the declining instance would stay beside the one that now holds the record.

**What the build proceeds under.** ADR-0054's stated reading: both closes destroy the main windows without the confirmation (`mainWindows.dispose()`), because the user chose the action and, after the record has passed, the predecessor must not stay. **What a ruling decides.** Whether REQ-STARTUP-046's confirmation governs these two closes — then it has to be asked *before* the installer is spawned and before the successor is started, which moves it from the close to the action — or whether REQ-STARTUP-119/121 are exceptions REQ-STARTUP-046 should name.

**OQ-87 — What does a machine tool's "archive layout" comprise, and what are its expected executables relative to?** *(REQ-STARTUP-058 with REQ-STARTUP-085, REQ-STARTUP-086 and REQ-STARTUP-088. Raised 2026-09-28 by building the setup manifest, first-release plan §4.1. Raised as OQ-76 on its branch; renumbered OQ-87 at the merge, because OQ-76 to OQ-86 were already on `main`.)*

REQ-STARTUP-058 has each per-platform archive artifact declare "archive layout, expected executables" and says no more
about either. REQ-STARTUP-085 fixes the three archive formats extraction accepts and normalises entry names;
REQ-STARTUP-086 requires every expected executable to exist in staging before the tree is promoted, but names no base
the paths are relative to. The archives the manifest pins differ in exactly this respect: MinGit's entries sit at the
archive root (`cmd/git.exe`, `mingw64/bin/git.exe`), ripgrep's under one directory named after the archive
(`ripgrep-15.2.0-x86_64-pc-windows-msvc/rg.exe`). Whether the managed tool directory (`tools/<tool>/<provisioned_version>/`,
REQ-STARTUP-070) holds that directory or its contents decides which paths REQ-STARTUP-088 can prepend.

**What the build proceeds under.** `layout` is two things (`ArchiveSchema` in `packages/config/src/setup-manifest.ts`):
the archive `format`, one of REQ-STARTUP-085's three, and `topLevelDirectory`, the one directory every entry sits under,
or `null` when entries sit at the archive root. `executables` are written relative to that directory when one is
declared and to the archive root otherwise — `rg.exe` and `cmd/git.exe`, never `ripgrep-15.2.0-…/rg.exe` — which reads
the consumer as promoting the directory's contents, so a managed tool directory holds the executables at the same
paths whatever the archive did. Which subdirectory of a tool's managed directory is prepended to PATH is the consumer's
(REQ-STARTUP-088); the manifest names executables and nothing about PATH.

**What a ruling decides.** Whether "archive layout" is the format alone, the format with the top-level directory, or
something else (a list of entries to keep, a strip depth); and whether expected executables are relative to the archive
root or to the promoted tree. A different reading changes the schema's `layout` object and the shipped file, and the
fingerprint of REQ-STARTUP-061 with them, so it is cheapest before the first release ships a manifest that installations
have set up from.

**OQ-88 — May a setup manifest key an archive under REQ-STARTUP-060's raw `<os>-<machine>` fallback?** *(REQ-STARTUP-060 with REQ-STARTUP-058. Raised 2026-09-28 by the independent verification of the setup manifest, first-release plan §4.1. Raised as OQ-77 on its branch; renumbered OQ-88 at the merge, because OQ-76 to OQ-86 were already on `main`.)*

REQ-STARTUP-060 names three platform keys, "with a raw `<os>-<machine>` fallback for anything else", and says the keys
are shared between release artifact naming, updater asset selection and manifest artifact selection. It does not say
whether the fallback is a key a manifest may *write* an archive under, or only one a host may *compute* and then find
nothing under. The first reading makes the manifest's key set open-ended (any `<os>-<machine>` string); the second keeps
it to the three, which is what artifact naming (`PLATFORM_KEYS` in `tools/release-naming`) already does.

**What the build proceeds under.** The second. `SetupManifestSchema` (`packages/config/src/setup-manifest.ts`) admits an
archive only under one of the three keys, and `tools/release-guard/src/pins.test.ts` pins that an archive under
`freebsd-x86_64` is refused and that `config`'s key list equals release naming's. A host whose key is a fallback finds
no archive to select; what machine setup then does (REQ-STARTUP-060 onward, REQ-MCP-112's setup half) is the consumer's,
not built.

**What a ruling decides.** Whether a manifest may carry an archive for a platform outside the three. A ruling for the
first reading widens the schema's key to a pattern and changes nothing in the shipped file; either reading leaves the
consumer to state what a host with no matching archive is told.

**OQ-89 — Under a burst, is REQ-CHAT-055's append comparison read on the update as it arrived, or on an update that arrived alone?** *(REQ-CHAT-055, REQ-CHAT-154, REQ-CHAT-157; ADR-0045's measurement point. Raised 2026-09-28 by the measurement round R-048 authorized, taken under [R-062](../product/requests.md#r-062); the note is `docs/defects/appending-at-1200-rows-costs-two-to-three-times-an-empty-transcript.md`. Raised as OQ-76 on its branch; renumbered OQ-89 at the merge, because OQ-76 to OQ-88 were already on `main`.)*

REQ-CHAT-055 fixes "cost" as the time from an update's application to the frame that shows it, and compares that
figure for an appended row at a thousand rows with the same figure on an empty transcript. The round found the proof's
scripted run to be a burst: thirty increments arriving 4–13 ms apart, faster than the renderer shows them, so 57 of 62
samples a side measured the queue in front of them and the median stood at five to seven frames on BOTH sides while an
increment that arrived alone showed in two. The requirement does not say which of these the comparison is made on:

- **the update as it arrived**, queue included — what the reader waits, and the reading under which any work the
  product does per increment is multiplied by the increments queued in front of the one measured; or
- **an update that arrived to a quiet surface** — the cost of showing one row and nothing else, which in a scripted
  run is a handful of samples a launch, too few for a verdict on their own.

A second reading is bound up with it. The requirement's first sentence permits work proportional to **how many rows
are visible**, and its third compares against **an empty transcript** — which, once the run has appended to it, shows
eight rows where the loaded transcript shows a full viewport of nineteen. Work the first sentence permits therefore
moves the comparison the third sentence makes, and the requirement does not say by how much it may.

**What the build proceeds under.** `transcript-proof` reads the comparison **both ways and requires both to hold**
with one frame of slack at the cadence it measured: on every update as it arrived (pooled, sixty-two a side,
alternating launches) and on the row appends among them; it reports the samples that arrived alone and the isolated
ones beside them without a verdict of their own, because their count does not carry one. The burst is the same on
both sides, so the first reading is a fair comparison of per-increment cost; the repair made that cost independent
of the rows held (one bounded projection per increment, no row re-rendered for a value it could not see change), and
the residual difference — a full viewport of rows moving under the tail pin against a part-empty one — is inside the
slack. **A ruling would decide** whether a conformance harness must construct the quiet-surface case (spacing its
updates so each is shown before the next arrives, which the benchmark domain's phases do not do), and whether a
visible-row term is within the requirement while the third sentence's comparison holds, or is itself the thing the
third sentence forbids. Recommended: the first reading, as the one a reader experiences and the one the benchmark's
phases can measure, with the third sentence read at one frame of slack as the proof reads it.

**OQ-90 — Are the variables that name a launch's artifact removed from what the product's children inherit, and which requirement says so?** *(REQ-STARTUP-147, REQ-STARTUP-106, REQ-HOOKS-032; ADR-0054, "The updater", item (6). Raised 2026-09-28 by repairing `docs/defects/fixed/the-artifact-variables-reach-the-products-own-child-processes.md` under [R-062](../product/requests.md#r-062).)*

REQ-STARTUP-147 says a variable naming the artifact a launch started from is "set by the artifact's own runtime rather
than by a user" and "decides which file an update replaces", and REQ-STARTUP-106 takes the classification from "the
artifact the launch started from". Neither says what the product's own children receive. REQ-STARTUP-147's closing
sentence lists the "Variables written for child processes" — `PATH`/`Path`, `UV_CACHE_DIR`, `npm_config_cache` — and
names none removed; REQ-HOOKS-032 says a run started from the desktop application "sees exactly the environment the
application itself was started with", which read literally includes `APPIMAGE` and the portable launcher's
`ROTARIS_PORTABLE_ARTIFACT`.

**What the build proceeds under.** Main takes both names out of its own environment before it starts any child, so no
run host, workspace service, tool, terminal, hook, MCP server or code-intelligence branch carries them: a copy a child
inherits names an artifact that is not the child's launch, and a Rotaris started from inside one would otherwise
classify itself from the other's file. A hook therefore sees the application's environment less those two names.
**A ruling would decide** whether REQ-STARTUP-147 gains the removal beside the variables it writes for child
processes, and whether REQ-HOOKS-032's "exactly" is read over the environment less the artifact's own variables.
Recommended: both, as one sentence in REQ-STARTUP-147 that REQ-HOOKS-032 cites.

**OQ-91 — Does REQ-CHAT-048's "per agent" scope the comparison, or only the row that is dropped?** *(REQ-CHAT-048;
ADR-0046 step 4, the lookback its bounded form preserves. Raised 2026-09-28 by repairing
`docs/defects/fixed/duplicate-reasoning-hygiene-compares-with-the-previous-thinking-row-of-any-agent.md` under
[R-062](../product/requests.md#r-062); raised as OQ-90 on its branch and renumbered at the merge, OQ-90 having been taken on `main`.)*

REQ-CHAT-048 reads: "per agent, an unstamped (no duration) thinking row whose content equals the immediately previous
thinking row's content MUST project to zero rows". When two agents' reasoning interleaves — agent A's burst, then
agent B's, then an unstamped repeat of A's — the sentence has two readings:

- **"per agent" scopes the whole rule**: "the immediately previous thinking row" is A's own, so A's repeat is dropped
  whatever other agents reasoned in between, and an agent's burst is never compared with another agent's; or
- **"per agent" scopes only the dropped row**: "the immediately previous thinking row" is the transcript's, so the
  repeat is compared with B's row, is not equal to it (or names another agent), and is kept — A's duplicated burst
  is displayed twice whenever any other agent reasoned between the two copies.

**What the build proceeds under.** The first reading: the requirement's purpose clause — "so sessions recorded with
duplicated streamed reasoning display each burst once" — is met by it for every interleaving and by the second only
when no other agent reasons between the copies, which is the common case once children run in parallel. The
projection keeps, per agent, that agent's immediately previous thinking row (`previousThinkingByAgent` in
`packages/ui/src/transcript/project.ts`), and the bounded form of ADR-0046 step 4 looks each agent's row up lazily
below its cut, so the two forms agree (`projector.test.ts`'s seeded walk). Agent identity is the row's `name`, as the
comparison always read it. **A ruling for the second reading** would restore the any-agent lookback
(`lastThinkingBefore`, one scan below the cut) and turn the interleaved cases in `transcript.test.ts` around; nothing
else depends on it.

**OQ-92 — Where does `THIRD-PARTY-LICENSES.txt` report the tool-server package versions REQ-STARTUP-152 asks it to?** *(REQ-STARTUP-152 with REQ-STARTUP-142 and REQ-STARTUP-058. Raised 2026-09-28 by repairing the notices file's tools section under [R-062](../product/requests.md#r-062); the note is `../defects/fixed/the-notices-file-says-the-setup-manifest-pins-no-machine-tools.md`; raised as OQ-90 on its branch and renumbered at the merge, OQ-90 and OQ-91 having been taken on `main`.)*

REQ-STARTUP-152 requires "the tool and MCP package versions a build provisions and warms" to be "the same versions its
`THIRD-PARTY-LICENSES.txt` reports". REQ-STARTUP-142 says what the file's `Tools provisioned after installation`
section contains. It holds Git and ripgrep, then a sub-heading naming the bundled code-intelligence runtime with its
language servers. It names no place for the MCP packages REQ-STARTUP-058 pins, `@playwright/mcp` 0.0.80 in this
build. Nor are they "dependencies present in the shipped artifact": the built-in configuration launches them through
`npx`, which fetches them.

**What the build proceeds under.** A third sub-heading of the same section, `Tool-server packages`, after the language
servers, lists each package the manifest's `toolServerPackages` pins with REQ-STARTUP-142's four fields. It states
that a tool server of the built-in configuration launches each through its package runner, which downloads it when
that tool server is first started, and that none is contained in the artifact. The sub-heading is left out for a
manifest that pins no package. REQ-STARTUP-142's order, machine tools then the runtime's sub-heading, is kept.

**What a ruling decides.** Whether REQ-STARTUP-142 gains the sub-heading, with its wording, or the versions belong
somewhere else in the file.

**OQ-93 — Is a text field spell-checked, and if so, from what?** *(REQ-STARTUP-160, REQ-SHELL-005, REQ-STARTUP-159. Raised 2026-09-28 by the repair of `docs/defects/fixed/the-built-app-opens-a-connection-to-chromiums-component-updater.md`, under [R-062](../product/requests.md#r-062). Numbered OQ-91 on its branch because OQ-90 was already taken on a branch in flight beside it; renumbered OQ-93 at the merge, OQ-91 and OQ-92 having been taken on `main`.)*

The specification says nothing about spell-checking the composer or any other text field. The runtime's built-in
spellchecker, left at its default, fetches a Hunspell dictionary for the OS locale from `redirector.gvt1.com` whenever a
session is created — on Linux measured, on Windows owed to the next package (IC-3); on macOS the OS spellchecker is used
and nothing is fetched. That request is one REQ-STARTUP-160's disclosure may not name ("SHALL name no host, endpoint, or
request this document does not require"), one REQ-SHELL-005's demo mode forbids for the whole lifetime, and one the
offline launch of REQ-STARTUP-159 would attempt and fail. Three readings:

- **no text field is spell-checked** — the dictionary list is emptied and the spellchecker turned off for every session,
  on every platform, so the product's behaviour is one and its network activity is exactly what the document names;
- **spell-checking from what was installed** — dictionaries carried inside the artifact (REQ-STARTUP-159's "resolves
  from within what was installed"), which adds payload and a licence line under REQ-STARTUP-142, and a choice of
  languages the specification does not make; or
- **the OS spellchecker where the platform has one** — macOS's (and Windows' if the runtime uses it there), none on
  Linux, so the behaviour differs by platform.

**What the build proceeds under:** the first reading (`apps/desktop/src/main/runtime-requests.ts`), because it is the
only one that needs no requirement the specification lacks and adds no request. **A ruling would decide** whether
spell-checking is a behaviour the product owes; either of the other readings is additive to this build.

**OQ-94 — How does a `paused` agent present, and is it settled with its session?** *(`PD-ORCH-005` over REQ-MONITOR-300; REQ-MONITOR-014, REQ-MONITOR-046, REQ-MONITOR-211, REQ-MONITOR-213, REQ-SESSION-078 and REQ-SESSION-180, none of which the directive names. Raised 2026-09-27 by building `PD-ORCH-005` revisions 2 and 3 under [R-060](../product/requests.md#r-060) and [R-061](../product/requests.md#r-061). Numbered OQ-67 while it was built; renumbered when it reached `main`, where OQ-67 had been taken meanwhile.)*

`PD-ORCH-005` adds `paused` to the states REQ-MONITOR-300 governs. Three families of requirements it does not name meet
that state, and under `docs/product/README.md` each governs exactly as it did:

- **REQ-MONITOR-014** lists exactly ten states. REQ-MONITOR-300, which the directive narrows, says a state another
  domain needs is added there rather than described elsewhere; the build reads REQ-MONITOR-014's list as the table's
  restatement and adds `paused` to both.
- **REQ-MONITOR-046** maps engine states onto six presentation states and ends "anything else→queued". The mapping is
  total, and `paused` falls into its catch-all: **a paused agent presents as `queued`, as the requirement says.**
- **REQ-MONITOR-211/213 and REQ-SESSION-078/180** settle, for display, every running, waiting or queued agent of a
  session whose status neither claims a live run nor is `idle` — a `paused` session among them — to the run's outcome:
  `cancelled`, "ended with the run", tool chips cleared, on every surface. Applied to a `paused` agent this shows as
  cancelled an agent clauses 2 and 4 keep resumable, and that clause 6's Continue action counts as resuming.

**What the build proceeds under.** `paused` is added to REQ-MONITOR-014's list with the table. A paused agent presents
as `queued`, REQ-MONITOR-046's catch-all, with no change to that requirement. It is **not** settled for display: the
projection (`toAgentRecord`) exempts `paused` from REQ-MONITOR-211's settle and presents it as it is, carrying its
`interruption` on the agent record and no active tool chip. That exemption is a departure from four requirements
nothing narrowed, and it is recorded here rather than made quietly. Every other unfinished agent of a session at rest is
settled exactly as before.

**What a ruling decides.** Whether PD-ORCH-005 should name REQ-MONITOR-211/213 and REQ-SESSION-078/180 (and REQ-MONITOR-014)
as narrowed by `paused`, as built; and whether a paused agent should present as `queued` or as a presentation state of
its own (widening REQ-MONITOR-046's closed vocabulary), which would change the chip every agent surface draws for it.

**Ruled 2026-09-28 — by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 4, [R-064](../product/requests.md#r-064).** The owner took both recommendations. REQ-MONITOR-211/213,
REQ-SESSION-078/180 and REQ-MONITOR-014 join the Narrows list, as built, and each carries its back-pointer. A `paused`
agent presents in a presentation state of its own, `paused`, and REQ-MONITOR-046 is narrowed to map it so (clause 13).
Until that is built, a paused agent presents as `queued`, as the reading above says.

**Built 2026-09-28 under [R-065](../product/requests.md#r-065).** A `paused` agent presents as `paused` on every agent
surface, and the "until that is built" readings above are superseded. Building it raised OQ-100: how the counters and the
run-level agent read it, and how the agents a crash left present before the crash is recorded.

**OQ-95 — Is the transcript drawn from the conversation record, and what of a model exchange does the record hold?** *(`PD-ORCH-005` clauses 1 and 12; REQ-MONITOR-248, REQ-SESSION-196, REQ-CHAT-046 and REQ-SESSION-029, which the directive does not name. Raised 2026-09-27 by building `PD-ORCH-005` revision 2 under [R-060](../product/requests.md#r-060). Numbered OQ-68 while it was built; renumbered when it reached `main`, where OQ-68 had been taken meanwhile.)*

Clause 1 calls the conversation record "the record a resume is made from, and the same record a session's transcript
is drawn from". Read as an instruction, it would have the transcript's rows derived from the agents' conversations.
Read as a statement, it says the two come from one session record. Clause 12 separates them in the same breath —
paging the transcript never touches the conversation record, and clearing the transcript clears only closed
iterations' records — which an instruction to derive one from the other would make meaningless. REQ-SESSION-029, which
the directive does not name, promises that "no part of a session's content exists in two places where the two could
disagree", and the record and the transcript's rows now carry the same messages twice.

Clause 1 also says the record keeps "each message sent to and received from the model". Two parts of every request are
not messages of the conversation: the system prompt and the tool definitions, which the product rebuilds from the
persona each time an agent is built. And one part of a response is received but never sent back: streamed reasoning
(REQ-CHAT-163), drawn in its own row.

**What the build proceeds under.**

- **The statement.** The conversation record is a new part of the session's record (`agent_messages`, v23), written as
  each agent's conversation changes; the transcript's rows are written exactly as before (REQ-MONITOR-248,
  REQ-CHAT-046), and nothing re-derives either from the other. REQ-SESSION-029's promise is kept in its consequence:
  the two cannot disagree about what an agent was sent, because the transcript is not what a resume reads.
- **The conversation, not the request.** The record holds the messages of the conversation — everything a request
  carries after its system message — and not the system prompt, the tool definitions or streamed reasoning. A resumed
  agent is built from its persona as any agent is, so a persona edited between the rest and the resume gives it its new
  instructions and tools.
- **Clause 12's two rules as stated.** Paging releases transcript rows and leaves the record alone; a transcript clear
  removes the conversation entries of every iteration that is not open, in the clear's own transaction, and keeps an
  open iteration's until the next clear after it closes (the record is not cleared at the close itself). A plan cycle
  (iteration 0) has no open row, so a clear during a live plan cycle removes that cycle's record too; a plan cycle is
  never resumed (clause 11). The clear's acknowledgement is unchanged; the count removed is in `transcript_cleared`'s
  metadata.

**What a ruling decides.** Whether the transcript should be rebuilt from the conversation record — which would make the
record's content and the transcript's rows one fact with one writer, at the price of rewriting the transcript's
projection — or whether the two stay parallel records of the same run, as built; and whether the record should also
keep the system prompt and tool definitions each request carried, so a resume replays the instructions the agent had
rather than the persona's current ones.

**Ruled 2026-09-28 — by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 4, [R-064](../product/requests.md#r-064).** The owner took both recommendations. The transcript
and the conversation record stay two records of one run, each written as the run happens, and clause 1's last sentence
is replaced to say so. Each agent's record also keeps a fingerprint of the instructions and tools it started with; a
resumed agent runs with its persona's current ones, and the run states, as a warning, when they changed (clause 14).
Until that is built, a resume says nothing of a changed persona.

**Built 2026-09-28 under [R-065](../product/requests.md#r-065).** Store v24 keeps each agent's fingerprint
(`agent_fingerprints`), and a resume under changed instructions or tools states a warning naming the agent. Building it
raised OQ-105.

**OQ-96 — Which control is a stop and which the final cancel, and what does a rest do at the edges the directive does not reach?** *(`PD-ORCH-005` clauses 2, 3, 8, 9, 10 and 11; REQ-MONITOR-009, REQ-MONITOR-126, REQ-MONITOR-130, REQ-MONITOR-092, REQ-SESSION-092, REQ-SESSION-108, REQ-SESSION-186, REQ-SESSION-025, REQ-ORCH-080, REQ-ORCH-135, REQ-GIT-094, REQ-TOOLS-063 and REQ-CHAT-101, which the directive does not name. Raised 2026-09-27 by building `PD-ORCH-005` revisions 2 and 3 under [R-060](../product/requests.md#r-060) and [R-061](../product/requests.md#r-061). Numbered OQ-69 while it was built; renumbered when it reached `main`, where OQ-69 had been taken meanwhile.)*

Clause 3 leaves every unfinished agent `paused` after "a graceful stop" and keeps "the cancel control
(REQ-MONITOR-126, 'cannot be undone in this session')" final. The product has one stop control and one cancel. The stop
control is REQ-SESSION-186's: its first activation requests REQ-SESSION-092's graceful stop, and a second activation
while that is pending forces it; the engine receives both as the `cancel` operation. The cancel is REQ-MONITOR-126's
confirmed control, which reaches the engine as the cancellation of the run's reserved agent id (REQ-MONITOR-009). The
directive does not say whether a forced stop is still a stop. Nor does it say what becomes of a run the product ends on
its own account, or of a plan cycle a stop reaches. It also leaves open several edges of a rest: a model step in flight
when the pause is accepted, a rest that finds nothing unfinished, and what a crash can withdraw.

**What the build proceeds under.**

- **The stop and the cancel.** The `cancel` operation is the stop, graceful or forced alike, and brings the run to rest
  (`stop`, or `quit` for the application's shutdown). The reserved run id is the explicit cancel: its stop request is
  marked final (`StopRequest.final`), and it ends every agent `cancelled` and closes the iteration, as before. A stop the
  run raises on its own account (`agent_session_aborted`: a recording failure, the headless abort hook, a supervisor
  escalation) is no user's act and ends its agents as before.
- **Which surface sends which.** The composer's stop control ("Stop run", then "Force stop") sends the stop, and asks
  no confirmation: it ends nothing, and REQ-SESSION-186 asks for none. Every confirmed "Cancel the run?" — the
  inspector's cancel of the run-level agent, the Mission view's run row, the wait header's "Cancel the run" and a
  persona window's Cancel on the run's own instance — sends the reserved run id, the final cancel, so REQ-MONITOR-126's
  "cannot be undone in this session" is true of it; a persona window's Cancel of a child confirms it as REQ-MONITOR-128
  asks and cancels that child (REQ-SHELL-075(g), REQ-MONITOR-130's "an auxiliary window"). *Phase 5's second repair
  left the persona window's unconfirmed Cancel the stop, reasoning that a final cancel without a confirmation would
  break REQ-MONITOR-126; REQ-SHELL-075 forbids no confirmation, so the reason was a false choice, and the button now
  confirms and cancels (found by phase 5's third review).* `/stop` stays the stop: it asks nothing, and REQ-CHAT-029's
  "MUST cancel that run" is read as met by the run ending, though its description reads "Cancel the active run" — put
  to the owner below. *Until phase 5's repair every one of these
  surfaces sent the stop, and the composer's stop was itself confirmed by the "Cancel the run?" dialog, so the reading
  above — that the confirmed control reaches the engine as the reserved run id — was false of the built product: a
  confirmed "cannot be undone" left every agent paused and resumable, and the final cancel was reachable from no
  surface (found by phase 7's built-app rehearsal).*
- **A plan cycle is never at rest.** Clause 11 says no agent is unfinished while the plan gate holds, and a plan cycle
  runs while it holds. A stop or a quit during a plan cycle ends the cycle's agents as before and records no
  interruption, and a crash during one leaves no open iteration: a plan cycle has no `iterations` row, and its children
  are settled by REQ-ORCH-053 at the continue.
- **The step in flight.** A model step already streaming when the pause is accepted finishes (REQ-MONITOR-123: "the
  current step finishes"), and it is the last one. The calls it asks for were not in flight when the pause was
  accepted, so none of them starts; each is recorded as never run. A stop aborts that step, as REQ-SESSION-092 always has.
- **Nothing unfinished.** When a pause or a stop finds the root finished and no child unfinished, there is nothing to
  hold, and the iteration closes as REQ-MONITOR-123 and REQ-ORCH-135 have it close: `cancelled`, its task pending.
- **Background sessions (clause 10).** A session is its starting agent's, by task id. Its "last recorded output" is its
  last 2,000 characters. Its end is recorded once: a stop records `stop` before it ends the session, and the `killed`
  that the stop's kill then produces is refused. A quit records `quit` for the sessions this process still holds. A
  session still recorded `running` that this process does not hold ended with the process that did, and the crash
  record marks it `crash`.
- **What a crash can withdraw (clause 9).** The approvals a dead run left listed in `pending_approvals` are withdrawn by
  the crash record, one `approval_withdrawn` entry each, and the list is emptied. Pending questions are not persisted
  in this build (REQ-SESSION-025's question half is owed), so a crash leaves none to withdraw.
- **Cancelling one paused agent.** The cancellation of one agent is a control on a live run, as it is today. A session
  at rest has no run, so a paused agent is ended by clause 6's "continue without them" or resumed; it cannot be
  cancelled on its own while the session rests.
- **Loading is not continuing (clause 8).** Loading a session no longer runs the stale-child settle. Every settle, and
  the crash record before it, happens when a run of the session is about to start, and at a repair. The load's answer
  no longer carries a settled count.
- **Listing checkpoints is not continuing either (clause 8, REQ-GIT-094).** The checkpoint listing repairs the
  session's status first, as REQ-GIT-094 requires, and that repair records no crash: viewing a session's checkpoints
  changes no agent record. The crash is recorded by the repair the user asks for and by the continue.
- **Requirements the directive does not name.** Five requirements the Narrows list omits say otherwise where clauses 2,
  3 and 9 decide, and the build follows the clauses. REQ-ORCH-135 closes an iteration cancelled mid-run `cancelled`; a
  pause, a stop or a quit with an agent unfinished leaves it open, and REQ-ORCH-135 still governs the explicit cancel, a
  run the product ends on its own account, and a rest that finds nothing unfinished. REQ-MONITOR-130 settles every
  non-terminal agent `cancelled` when a run is cancelled; the build reads its cancel as REQ-MONITOR-126's explicit
  cancel, which still does exactly that from every surface, and a stop leaves the agents `paused` as clause 3 says.
  REQ-SESSION-108 puts the pause at the outer-loop boundary so that no agent is part-way through execution and no model
  request is outstanding; clause 2 stops every agent before its next model step instead, and the build reads "part-way
  through execution" as executing: once the pause has landed a paused agent executes nothing and no request is
  outstanding. REQ-TOOLS-063 has closing the approval dialog answer Deny, "no exit path leaves the request
  unanswered", and REQ-CHAT-101 has closing the window emit the question's cancellation. At a quit, clause 9 withdraws
  both instead, so main sends neither when the application's quit closes the surface (`exit.ts`'s `QuitState`): the
  approval or question stays pending until the run host's `shutdown` withdraws it. A quit Electron starts on its own
  account (SIGTERM, the desktop's logout, `app.quit()`) first closes the main windows through their guards, all or
  none, so no dialog closes before every main window's close is confirmed. While the application stays, both requirements govern unchanged.
  *Until phase 7's repairs the quit's close sent the Deny and the cancellation first, and the agent stepped on them
  (`docs/defects/fixed/a-quit-denies-the-approval-it-should-withdraw.md`).*
- **No model call after the pause, wherever one is made (clause 2).** The step in flight is the only model call that
  finishes, and its report stands: a transient failure of it is not retried, no fallback model is tried, a context
  rejection is not condensed, and a provider limit it meets is not waited on. An agent already parked on a provider limit
  stops waiting at once and makes no further request, so a pause during the wait on an exhausted provider completes;
  the turn checks the rest again after supervision and after compression, so neither leads to another step; the manual
  compression is refused, a departure from REQ-MONITOR-092 ("given at least one live agent conversation, manual
  compression compresses every one of them") that clause 2's "no model call is made after the pause is accepted"
  decides; and no child starts a summarising pass. A child's summarising call already in flight when
  the pause is accepted is a step in flight: it finishes, and a usable answer is the child's report, since the child
  then finished before the rest. An unusable one is not retried; the pass is cut short, and the child is left `paused`
  to summarise when it resumes. The same holds from a stop's acceptance, which also aborts the step in flight, so a
  child summarising when the stop lands is left `paused` the same way. The status reads `pausing` throughout, as
  REQ-MONITOR-124 has it.
- **Calls in flight at a stop or a quit (clauses 3 and 9).** Clause 9's last sentence gives every other in-flight call
  REQ-ORCH-134's deadline, and read alone it would give it on a stop and a quit too. Clause 3 has a stop's call "cut off
  before its result arrived", and REQ-SESSION-092's stop aborts at once, so the deadline is the pause's: a stop and a quit
  cut every call in flight at once, each recorded as interrupted with what it had produced.
- **A child that times out or raises during a rest.** "What is unchanged" keeps a timed-out child failed and never
  resumed. A child whose `child_timeout` fires while the run is coming to rest ends `failed` as it would have without
  the rest. Clause 2 permits no summarising call, so its report is the unsummarised one, whose `summary_failure` says
  the run was coming to rest. An agent whose execution raises while the run comes to rest is left `paused`, the root
  and a child alike. A raise mid-rest is most often the rest's own abort surfacing through a tool. The call it raised
  out of is answered in its record as interrupted, and its row settles (`answerOpenCalls`), so it resumes from a
  record whose every call has its result. A call that completed earlier in the same step keeps what it returned, read
  back from its settled row: clause 3 records as interrupted only a call "cut off before its result arrived" (found by
  phase 3's fourth review, which saw a finished write presented as undone). REQ-ORCH-073 (a child that raises ends `failed`) and REQ-ORCH-135 (an
  iteration that raises closes `failed`) still govern a raise outside a rest.
- **An execution the stop's grace gives up on.** A stop or a quit waits for its executions within REQ-SESSION-092's
  30 s. One still running after that is detached. It is left `paused` where it stood, and the call it never returned
  from is answered in its record as interrupted, its row settled; a call of the same step that completed keeps its
  result, as above. When the execution returns, the engine writes nothing
  more for it (REQ-SESSION-094's straggler clause). What the call's own tool gate or a streaming model step writes as it
  finishes is not stopped; `docs/defects/a-detached-call-still-writes-through-its-tool-gate.md` records it. A root's call
  has no such bound (`docs/defects/a-root-call-that-ignores-the-stop-holds-the-run-open.md`, which predates the
  build).
- **A call cut by no rest.** A call cut by its agent's limit, by the cancellation of that agent or by the explicit
  cancel is recorded as cut off, and its statement names no rest. Only a pause, a stop, a quit or a crash is named as
  what interrupted a call.
- **A child finished and unreported is unfinished work.** A child that reached its terminal state but whose report its
  parent has not received leaves the parent unfinished: the parent is left `paused`, and a root in that state leaves the
  iteration open, so the report is delivered when the parent resumes instead of being lost with a closed iteration.
- **The explicit cancel meanwhile.** A rest waits for every execution — a pause as long as the steps in flight take, a
  stop or a quit within REQ-SESSION-092's 30 s. The explicit cancel that arrives in that window is final: every agent
  the rest had paused ends `cancelled` and the iteration closes. So is one that arrives later, while teardown ends
  background sessions or runs the `session_end` hooks. Before the run's result is built, the iteration *this run* left
  open closes `cancelled` with every agent it paused, each told the user cancelled the run, and the background
  sessions a pause had left running end. A continue holds the iteration an earlier rest left open from its start,
  whether it resumes or declines it, so a cancel during its pre-flight or its `session_start` hooks closes that
  iteration the same way, and the agents it would have resumed end `cancelled` (found by phase 4's review). *Phase 3's
  third review had read the opposite — "an iteration an earlier run left open, which this run had not yet resumed or
  declined, is not this run's to close" — while every continue still declined such an iteration at its first
  iteration; once a continue resumes it before anything else, leaving it open would have the next Continue resume what
  the user cancelled.* A cancel that lands after that point would find nothing left to close, so it is refused rather
  than accepted and lost.
- **The explicit cancel and a child summarising (REQ-ORCH-080).** The explicit cancel does not abort a summarising
  pass. REQ-ORCH-080's drain waits for background children "without cancelling them", and clause 3 keeps the cancel "as
  today", so a child summarising when it lands writes its report during the drain. Only a rest's abort, a stop's or a
  quit's, ends the pass.
- **A pause accepted in the pre-flight.** The plan hold is not known until the pre-flight answers. A pause accepted
  before that is refused once the hold is known (`run_pause_refused`), and its tool deadline goes with it, even one
  that had already passed.
- **Background sessions at the other ends (clause 10).** The explicit cancel is a stop made final, so it records `stop`
  and ends them as a stop does. A run the product ends on its own account and a stop or a quit during a plan cycle do
  not come to rest, and record nothing of them, as before the build.

**What a ruling decides.** Whether a forced stop should be final, as REQ-SESSION-186's persisted `paused` for a forced
stop hints (a forced stop and a cancel persist the same status). Whether a stop during a plan cycle should leave the
cycle's agents to be resumed, which clause 11's durable hold arguably forbids. And whether one paused agent should be
cancellable while its session rests. Whether `/stop`, which REQ-CHAT-029 describes as "Cancel the active run" and says
"MUST cancel that run", should be the final cancel (and then confirmed) rather than the stop, or be reworded. Whether
REQ-ORCH-135, REQ-MONITOR-130, REQ-SESSION-108, REQ-TOOLS-063 and REQ-CHAT-101 should join the Narrows list, as the
build reads them. Each would change a control's reach, a surface's offer or the record's traceability, and
none is decided by the directive.

**Ruled 2026-09-28 — by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 4 and [`PD-CHAT-002`](../product/directives.md#pd-chat-002) revision 2, [R-064](../product/requests.md#r-064).** The owner took every
recommendation (clauses 15 and 16).
- A forced stop is a stop.
- A stop during a plan cycle ends the cycle's agents, and the plan gate keeps its hold.
- One paused child may be cancelled while its session rests, confirmed as REQ-MONITOR-128 requires; REQ-MONITOR-063 is
  narrowed.
- `/stop` is the stop and is described as "Stop the active run"; REQ-CHAT-029 is narrowed.
- REQ-ORCH-135, REQ-MONITOR-130, REQ-SESSION-108 and REQ-TOOLS-063 join the Narrows list, as the build reads them.
- REQ-CHAT-101 is already narrowed by `PD-CHAT-002`, so its quit case is that directive's revision 2.

**Built 2026-09-28 under [R-065](../product/requests.md#r-065).** The audit of clause 15 found it built, except for a
board run caught by the quit, which rested by `stop` and was repaired; a stop or a quit during a plan cycle now
withdraws what waits on a person. One paused child is cancellable while its session rests, and `/stop` reads "Stop the
active run". Building it raised OQ-101 and OQ-108.

Until they are built, a paused child is not cancellable at rest, and `/stop` keeps its old description.

**Ruled 2026-09-29 — by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 5, [R-067](../product/requests.md#r-067).** The
status a stop persists, which the build had read and not settled: a graceful user stop persists `paused`, as built, and
so does a forced one (clause 21). REQ-SESSION-186's "A run stopped gracefully and cleanly by the user persists
`stopped`" no longer governs a stop the user made; REQ-SESSION-186 joins the Narrows list and carries the back-pointer.
So does REQ-SESSION-073, whose vocabulary glosses `stopped` with "the user stopped it from the interface,
REQ-SESSION-186": `stopped` stays in the vocabulary for a run that exhausted a configured budget (REQ-MONITOR-029), and
the rest of that requirement governs as written. REQ-MONITOR-029 and REQ-SESSION-093, which already persist `paused` for
an interrupted or cancelled run, are unchanged. A stop and a pause both record the stop reason `user_cancelled`
(REQ-MONITOR-301's closed set has no member for a pause), so clause 21 tells them apart only by the interruption recorded
on the agents and the iteration (`stop` or `pause`) and by the timeline entries that name it.
`a-graceful-stop-persists-paused-where-one-requirement-says-stopped.md` is settled by this ruling and is in
`docs/defects/fixed/`. Nothing is built by it: the code already persists `paused` (`statusForResult`,
`packages/engine/src/run/stop-conditions.ts`).

**OQ-97 — How does a resumed iteration carry on where the directive says what and not how?** *(`PD-ORCH-005` clauses 4, 5, 6, 7 and 10; PD-TOOLS-006 revision 2; REQ-ORCH-095, REQ-ORCH-088, REQ-ORCH-152, REQ-HOOKS-075 and REQ-MONITOR-125, which the directive does not name. Raised 2026-09-27 by building `PD-ORCH-005` revisions 2 and 3 under [R-060](../product/requests.md#r-060) and [R-061](../product/requests.md#r-061). Numbered OQ-70 while it was built; renumbered when it reached `main`, where OQ-70 had been taken meanwhile.)*

Clause 4 restores the iteration's agents "with their identity … and their conversation, and each carries on from its
last message". A continue by message "delivers that message to the resumed root as the user's next message". The
clause fixes the outcome and leaves the mechanism open, and several requirements it does not name meet the resumed
iteration. Open: where an agent's last message is its own answer, what a continued prompt becomes, whether a plan-mode
continue holds, what the iteration's events and hooks say, and how REQ-ORCH-095's re-prompt and REQ-ORCH-088's retry
treat a resumed child.

**What the build proceeds under.**

- **Carrying on from the last message.** A resumed agent whose last message is a tool result, a user message or a
  message delivered at the resume takes a model step over its record. An agent whose last message is its own answer had
  finished its turn and was waiting on children of its own. It resumes into waiting and takes no step until one of them
  ends. A child restored `summarizing` is that case, and it writes its report. A step straight after its own answer
  would ask the model to go on from nothing. A child that had answered and is told of its background sessions at the
  resume (below) takes a step to read the notice, so it moves back `running` rather than `summarizing`, and works, and is
  counted, as a running child (found by phase 4's review).
- **The new message is not a task.** A continue that resumes an open iteration appends no todo task. The message is the
  resumed root's next message, recorded in its conversation at the continue itself, with the images attached to it —
  after the root's notice of its background sessions, so the user's message is the last it reads; a notice the root has
  not yet answered is not recorded again by a later continue — and
  REQ-SESSION-115's continuation payload is not sent (the directive narrows it so). The explicit cancel of that continue
  ends the iteration the message was delivered to, and the message with it: it stays in that iteration's record and in
  the transcript, and is not kept as a task. The iteration's own task is the one
  it holds, and it closes with it. *The first build recorded the message at the resumed iteration's first turn; a rest,
  a quit or a cancel that landed before that turn lost it while the transcript still showed it sent (found by phase 4's
  review).*
- **The resumed root keeps its persona.** A continue that resumes an open iteration is set up as the persona its root
  ran as (`iterations.root_persona`), whatever `default_persona` says now, since clause 4 names persona among the
  identity restored (found by phase 4's review). The persona holds for the whole run, so an iteration the run goes on
  to after the resumed one runs as it too, and a session model override made for the current entry role does not
  reach it. A persona the configuration no longer knows cannot be restored: the run is set up as the entry role, and
  its warnings say so. *The first repair refused that continue and named "continue without them"; a crashed session
  cannot take that route, which needs a `paused` one, so it was left no way on (found by phase 4's second review).*
  The pre-flight classifies the continue's message as it classifies any continuation's, and its route, grant and
  playbook reach the resumed agents as they reach the agents of any run.
- **One iteration, one start.** The resumed iteration keeps its number and its root's task id. It emits no second
  `iteration.start`; `iteration_resumed` records the resume. It closes as any iteration does, with `iteration.end`, its
  capture and the hooks' `iteration_end` (REQ-HOOKS-075).
- **Not held at the plan gate.** A continue that resumes an open iteration is not held, even on a session the user
  re-armed. The work it resumes was released before it came to rest, and clause 4 resumes it "before anything else
  runs". A later run of the session is held as REQ-ORCH-152 has it.
- **Which continues resume.** The three routes the clause names: a new message (`Sessions.prompt`), the Continue action
  on a `paused` session (`continueSession`) and a plan decision. Only the Continue action offers "continue without
  them" (clause 6), so declining is an option of `continueSession`. A session a crash left `interrupted` is continued
  by a new message, as today. A plan decision resumes nothing in practice: a run held at the plan gate never resumes an
  open iteration, and one that parks there has closed the iteration it found first, so no iteration is open when the
  plan is decided (found by phase 4's review). The route resumes as the other two would if one were.
- **A continue owns the open iteration from its start.** The run a continue starts holds the iteration it resumes or
  declines before its loop reaches it, so the explicit cancel during its pre-flight ends the agents it would have
  resumed and closes the iteration (see OQ-96).
- **The notice of background sessions (clause 10).** One user message, "You were paused and have now resumed…", lists
  each session the agent had started: still running, with its id, or ended and by what, with its exit code, and its
  last recorded output. Where this process still holds the session, the state is the process's own, since a session
  a pause left running may have ended since. The notice is recorded as part of the agent's conversation, and it counts
  as something said to the agent, so an agent that had answered takes a step to read it.
- **REQ-ORCH-095's re-prompt counts the calls made before the rest.** A child that worked before it was paused, and
  answers without a call after its resume, is not re-prompted. A child whose only call was never run is re-prompted, as
  any child that acted on nothing. The calls are counted from its row and from its record, whichever holds more, since
  a crash writes no count; a call the record answers as never started, with nothing it produced, is not counted, while
  a call whose approval or question was withdrawn was dispatched and is counted, as its row counts it (found by phase
  4's reviews). Calls the record shows and no count held join the session's total at the resume, once. A child restored
  `summarizing` was assessed when it answered, before the rest, and its attempt from the record is not assessed again;
  REQ-ORCH-088's retry from its payload is a new attempt, assessed as any.
- **REQ-ORCH-088's retry starts from the payload.** A resumed child that times out and is retried on its role's
  fallback starts its conversation again from its payload, as every retried child does. The payload's disclosure block
  is rebuilt from the claims as they stand at that moment.
- **The write scope (PD-TOOLS-006 revision 2).** Each resumed child re-claims its stored scope when it resumes, in the
  order the children were first accepted, so the child accepted first still holds a path both scopes match. The store
  lists children accepted in the same millisecond in the order they were inserted; the tie had fallen to their random
  task ids, so two children delegated in one step could swap on resume (found by phase 4's review).

**What a ruling decides.** Three questions. Should the new message also be recorded as a task, so that a resumed
iteration that closes without addressing it leaves the message pending? Should a crashed, `interrupted` session offer
the Continue action, and with it "continue without them"? And should a re-armed session hold its plan gate before the
resume, after it, or not at all — as built, the run that resumes is not held, and neither are the iterations it runs
after the resumed one?

**Ruled 2026-09-28 — by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 4 and [`PD-ORCH-003`](../product/directives.md#pd-orch-003) revision 2, [R-064](../product/requests.md#r-064).** The owner took every
recommendation.
- A continue's message is also a task, which closes with the resumed iteration (clause 17); REQ-ORCH-004 is narrowed.
- A session a crash left offers the Continue action and "continue without them" (clause 18); REQ-MONITOR-125 is
  extended.
- A resumed iteration is never held at the plan gate, and a gate that would hold the run holds before its first new
  iteration. That is `PD-ORCH-003` revision 2, since that directive already narrows REQ-ORCH-152.

**Built 2026-09-28 under [R-065](../product/requests.md#r-065).** The readings above that a continue's message is no
task and that a resumed iteration's run is never held are superseded: the message is a task the resumed iteration holds
(clause 17), a crash-left session offers both continues and the decline (clause 18), and an armed gate holds before the
first new iteration (`PD-ORCH-003` revision 2). Building it raised OQ-102, OQ-103 and OQ-104.

Until they are built, the readings above stand.

**OQ-98 — What does the Continue action count, where does it say so, and which continues offer the decline?** *(`PD-ORCH-005` clause 6; REQ-SHELL-023, REQ-MONITOR-125 and REQ-SESSION-110, which the directive does not name. Raised 2026-09-27 by building `PD-ORCH-005` revisions 2 and 3 under [R-060](../product/requests.md#r-060) and [R-061](../product/requests.md#r-061). Numbered OQ-71 while it was built; renumbered when it reached `main`, where OQ-71 had been taken meanwhile.)*

Clause 6: "The Continue action SHALL state how many agents will resume, and SHALL offer to continue without them;
choosing that ends those agents `cancelled`, the open iteration closes as cancelled, and the session continues as a
new iteration". Clause 4 restores "its root and every `paused` agent". The clause does not say whether the root is one
of the agents counted, where on the surface the count is stated, or whether the other continue routes offer the
decline too.

**What the build proceeds under.**

- **The count is every agent that resumes: the root and every unfinished agent of the open iteration.** Clause 4
  resumes the root with them, and declining ends the root's iteration too. After a rest the unfinished agents are the
  paused ones; after a crash not yet recorded they are the ones the crash record will pause (clause 8 forbids recording
  it on a read), so the count does not change when the crash is recorded. A session whose root was the only
  unfinished agent states "1 agent will resume". The count is read from the store (`SessionRecord.resumable`,
  `resumableOf`), as the plan gate is, because a session at rest has no process behind it.
- **Where.** In the composer's notices row, below the field and its strip, on a `paused` session, on one a crash left
  `interrupted`, and on one a crash left persisted busy with no run behind it — REQ-CHAT-008's recovery state, which a
  session is in when it is opened after a crash and before any repair, and whose continue by message records the crash
  and resumes the same agents (*the second build left that state out, so the most direct crash path stated no count:
  found by phase 5's second review*). REQ-SHELL-023 places the Continue action in the composer; no screen, tab or panel
  is added. The row holds the count
  as a sentence ("3 agents will resume") in the row's quiet hint style, which describes every continue that resumes
  them — each carries it as its accessible description — and on a `paused` session a compact ghost "Continue without
  them" beside it. The design material draws no paused composer. The row's controls are the mockup's own: the quiet
  hint, and the compact ghost button the session tables draw for "Resume" (*the second build cited the queue card above
  the field as the pattern, which sits in a chrome card with a kicker and is not what the row draws — phase 5's second
  review*). *The first build put the count and the decline in the strip itself; at the product's default window the
  strip then wrapped to three lines, and at 1280×800 the decline sat past its clipped edge (found by phase 5's review,
  measured in the built app).*
- **Against PD-CHAT-001.** Its body still says "The strip SHALL carry every control the composer draws … No control SHALL
  stand on a second chip row outside the dock", while its revision 3 quotes the same words as revision 2's and says
  they "no longer govern". The build reads the notices row as the composer's line for notices — the plan gate's hint and
  the pause's already stand there — and the decline as the count's own action, so neither is a chip row; the owner may
  read the body as still governing, which would put the decline in the strip and bring back the wrap.
- **The two continues' labels.** A paused session's strip draws two continues where the send pill stands, and at their
  full labels ("Continue run", "Continue with a message") the strip scrolled at the full and tight densities — by 8 px
  at a 908 px dock with the configured model and `autonomous` (phase 5's second review, measured). Each now shows a
  short label at every density, as the pill it replaces does, with its full name as accessible name and tooltip:
  `Continue`, which REQ-CHAT-005 as PD-CHAT-001 narrows it already gives the pill, and `Message`, which neither the
  specification nor the glossary has — put to the owner. With them the paused strip fits at every density from a
  548 px dock to a 968 px one with the configured model; a model id as long as revision 3's own example still scrolls
  the full-density strip, idle or paused, since full density shows every value. *The first repair shortened them at
  the narrow density only, which extended revision 3's enumerated rules and left the other two densities scrolling.*
- **Declining is confirmed.** It ends the paused agents `cancelled`, which clauses 3 and 5 make final, so it asks first,
  as the two other controls that end agents `cancelled` do (REQ-MONITOR-126, REQ-MONITOR-128), stating what ends and that
  it cannot be undone (found by phase 5's review).
- **Which continues offer the decline.** The Continue action only. A continue by message resumes (clause 4: the
  message goes to the resumed root) and offers no decline; a plan decision resumes as OQ-97 has it. A session a crash
  left `interrupted` is continued by a message, as today: it states the count, and offers no decline (OQ-97's second
  question stands).
- **What the decline carries.** `session.continue` gains an optional `withoutPaused`; absent, the Continue action
  resumes, which clause 6 makes the default.

**What a ruling decides.** Whether the count should name only the paused agents, leaving the root out. Whether the
decline should also be offered beside "Continue with a message", so a message can start a new iteration over a
declined one. Whether PD-CHAT-001's body still keeps every composer control in the strip. What the message continue's
short label should be, if not `Message`. And whether the design material should draw the Continue action's paused
state, which it does not.

**Ruled 2026-09-28 — by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 4 and [`PD-CHAT-001`](../product/directives.md#pd-chat-001) revision 4, [R-064](../product/requests.md#r-064).** The owner took every
recommendation.
- The count includes the root, and "continue without them" is offered beside the Continue action alone, as built
  (clause 19).
- `PD-CHAT-001`'s body is revised: a notice and the action that belongs to it stand in the notices row below the dock.
- The message continue's short label is `Send`, from the send pill it stands in for.
- The design material is asked to draw the composer's paused state (`docs/design/README.md` §3.2).

**Built 2026-09-28 under [R-065](../product/requests.md#r-065).** The count and the decline stand in the notices row, a
crash-left session shows them as a paused one does, and the message continue reads `Send`. Building it raised OQ-103 and
OQ-108.

Until they are built, the label reads `Message`.

**OQ-99 — Which artifact is REQ-SESSION-115's "latest orchestrator artifact", and how does a later root take up an offer?** *(`PD-ORCH-004` revision 3; REQ-SESSION-115, which `PD-ORCH-005` narrows for a resumed iteration and which nothing narrows here, and REQ-TOOLS-155, which the directive does not name. Raised 2026-09-27 by building `PD-ORCH-004` revision 3 with `PD-ORCH-005` under [R-059](../product/requests.md#r-059), and by the repair of `the-continuation-payload-says-no-artifact-is-recorded.md`. Numbered OQ-72 while it was built; renumbered when it reached `main`, where OQ-72 had been taken meanwhile.)*

REQ-SESSION-115's handoff carries "at most 6000 characters for the latest orchestrator artifact against an
8000-character artifact baseline". The session's artifact store holds child reports and the documents agents
published. The built-in orchestrator publishes no artifact of its own, so no record of a default configuration is an
"orchestrator artifact" by author. PD-ORCH-004 revision 3 keeps an offer open until it is taken up once, "by the agent
that delegated the child while that agent runs, or, in a later iteration or a later run of the session, by that
iteration's root agent". It does not say which iteration's children count as "left" for a resumed iteration, which
keeps its number across runs, nor how a later root learns an offer exists.

**What the build proceeds under.**

- **The artifact.** The latest record of the session's store that nothing has superseded, of any kind. It is where
  the run's work is recorded, and the handoff states it in place of the placeholder that claimed none existed. It is
  rendered as its id, title, kind and status — the id first, so no cut reaches it (REQ-SESSION-194) — then its summary
  and key findings, cut to 6,000 characters without splitting a character. A published document is stated once, as its
  body: its summary is its body's first line and its key findings its body (REQ-LIBRARY-093). The 8,000-character
  baseline is not applied: nothing larger is assembled before the cut. A session with none says so. "Latest" is the
  last created, in the listing's own index order (REQ-LIBRARY-096), so artifacts created in the same millisecond — a
  cancellation writes several reports at once — fall to their ids, a stable order but not the order they were written.
  *The first repair broke that tie by insertion order, which cost the index's order (a sort per read, found by phase 6's
  second review).* Two more limits stand, both found by phase 6's review: a report re-materialised in place keeps its creation time (REQ-LIBRARY-092), so a later iteration's report
  that reuses a canonical name does not become the latest (and overwrites the earlier one:
  `a-reused-canonical-name-overwrites-an-earlier-iterations-report-artifact.md`); and a body edited after publishing
  (REQ-LIBRARY-094) is stated as it was published.
- **Who takes up an earlier offer.** The agent that delegated the child, while it runs. Otherwise only an iteration's
  root, of an offer the session left before that root's run took the iteration up: any earlier iteration's (the
  child's `iteration` is lower), a grandchild's as readily as a direct child's, and — a resumed iteration keeping its
  number — its own iteration's children that had ended in an earlier run, whoever delegated them ("a later run of the
  session"; *the first build admitted only lower iterations, which read those words as redundant — found by phase 6's
  review*). A child of a later iteration is refused: the directive gives the offer to "that iteration's root agent", and
  REQ-TOOLS-155 keeps a child to its own children. A plan cycle's root takes up none, since a plan cycle is not an
  iteration (REQ-ORCH-153), and its refusal names only its own children; a plan cycle a continuation starts is still
  shown the open offers in its handoff, which it cannot take up there.
- **How a later root learns of an offer.** The offers no child has taken up are stated as `Open continuation offers`,
  with the way to take one up, each by the offering child's name and task id — the newest ten, the rest elided behind
  one line, since every part of the handoff is budgeted (found by phase 6's second review) — and only when there is one.
  A new iteration's root reads them in the handoff's progress context. A resumed root, which is sent no handoff, is told
  them at the continue that resumes it, after the notice of its background sessions and before the continue's message
  (found by phase 6's second review) — only the offers its conversation does not already hold, since its own children's
  reports carry theirs and an offer told once is not told again. An offer is held when the conversation carries the
  offer itself: a report's `continuation_of: "<id>"`, in a message or a tool result, or a line of an offers list it was
  told, alone or inside a handoff. A root that had answered and waits therefore takes a step only to read an offer it
  has not seen; *the second repair told the whole list at every continue, which had such a root step for it each time
  (found by phase 6's third review)*; *the third repair counted any mention of a task id as the offer told, so a root
  that had only named a task in passing was never told its offer (found by phase 6's fourth review)*. A compression
  that summarises the held offer away has it told again at the next continue, once. A later iteration of the same run starts from the launch content, which states
  none, so there an offer is taken up only by a root that already knows its task id.

**What a ruling decides.** Whether "orchestrator artifact" should instead name only what the root itself publishes,
leaving the line empty until it does. Whether the open offers belong in the handoff, which REQ-SESSION-115 defines as
"artifact, todo, and progress context", or should reach a later root some other way — and whether a later iteration of
the same run should be told of them too.

**Ruled 2026-09-28 — by [`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 4 and [`PD-ORCH-004`](../product/directives.md#pd-orch-004) revision 4, [R-064](../product/requests.md#r-064).** The owner took both
recommendations.
- The handoff's artifact is the latest one the iteration's root published and, when the root published none, the latest
  of any kind (clause 20).
- The open offers stay in the handoff, and the root of each later iteration of the same run is told them too, once.

**Built 2026-09-28 under [R-065](../product/requests.md#r-065).** The handoff's artifact is the latest the iteration's
root published, falling back to the latest of any kind, and the reading above that a later iteration of the same run is
told of no offer is superseded: every execution root's first message names the open offers it does not already hold.
Building it raised OQ-106 and OQ-107.

Until they are built, the artifact is the latest of any kind, and a later iteration of the same run is told of no
offer.

**OQ-100 — How does the counters' line spell the `paused` count clause 13 decides, where does the run-level agent that clause 13 does not name present, what does a live agent's cancel state for its paused descendants, and may the agents a crash left present `paused` before it is recorded, against clause 13's last sentence?** *(`PD-ORCH-005` clause 13, revision 4 — including its last sentence, "every other unfinished agent of a session at rest is settled as before", which the third reading below departs from — with clauses 8, 18 and 19; REQ-MONITOR-211/213, which that sentence keeps for every agent not `paused` and the third reading also departs from; REQ-MONITOR-169, whose count the clause's "the counters" decides and whose line's wording it does not; REQ-MONITOR-064 and REQ-MONITOR-128, which the directive does not name for a live agent's cancel and which the reading below departs from by counting and listing its paused descendants where they count and list live ones only; REQ-CHAT-069 and REQ-MONITOR-111, which it does not name and which the reading below departs from by showing a paused agent's state in "This task" without its elapsed time; REQ-MONITOR-043/057, REQ-MONITOR-045, REQ-SHELL-036, REQ-SESSION-171 and REQ-CHAT-008, which the directive does not name. Raised 2026-09-28 by building `PD-ORCH-005` revision 4 under [R-065](../product/requests.md#r-065). Numbered OQ-73 while it was built; renumbered when it reached `main`, where OQ-73 had been taken meanwhile.)*

Clause 13 gives an agent in the child state `paused` a presentation state of its own, `paused`, on "the agent tree,
the counters, the inspector, the Mission view and a persona window", keeps its last activity, and settles it for display
no more; its last sentence settles "every other unfinished agent of a session at rest ... as before". The mapping
(`presentationChildState`) and the projection (`toAgentRecord`) carry it to every surface, which each draw
`presentationState` as their dot's class and their state text. Four edges the clause does not reach, and one it does:

- **The counters' line — its wording, not its count.** Clause 13 names "the counters" among the surfaces on which a
  paused agent presents `paused`, so the count itself is decided: a paused agent counts as `paused`, never as waiting
  or failed (the built count had fallen to its last arm, failed). What the clause leaves open is how REQ-MONITOR-169's
  detail line, which names four counts — running, waiting (with queued), done, and failed (with cancelled and
  blocked) — spells the fifth: whether always, and where in the line.
- **The run-level agent.** The run's root is not a child and has no `children` row; the surfaces synthesise it from the
  session (REQ-MONITOR-043/057), and a session at rest drew it `cancelled`. Yet clause 19 counts it among the agents
  that resume, and the run records it `paused` at a rest.
- **What a crash left, before the crash is recorded — which the clause does reach.** Clause 8 records a crash only when
  a run of the session is about to start, or at a repair; a checkpoint listing's repair records none (OQ-96). Until
  then its agents are stored `running`, `queued` and so on, so they are not in the child state `paused`: they are
  among clause 13's "every other unfinished agent", settled "as before". In REQ-CHAT-008's recovery state "as before"
  drew them running, live and pulsing, and once `interrupted` REQ-MONITOR-211/213 settle them `cancelled`. Yet clause
  18 offers the Continue action for such a session "with the same count", and that count (`resumableOf`) counts every
  one of them as resuming — so the text, read literally, has the tree say `cancelled` (or running) for agents the
  Continue action says will resume.
- **The colour.** The mockup draws no paused agent.
- **A live agent's cancel.** Before clause 13 a paused agent presented `queued` and so was among the live descendants
  REQ-MONITOR-064 counts and REQ-MONITOR-128's confirmation lists. The live cancel (`IterationChildren.cancel`) still
  ends every descendant not terminal, `paused` among them — in a `pausing` run, a live child whose own child has
  already come to rest — so a confirmation that listed only live descendants would understate what it cancels.

**What the build proceeds under.**

- **The counters.** A paused agent is counted as `paused`, never as waiting or failed, as clause 13 decides; the
  reading is the line's wording: it names that count between waiting and done —
  `running 1 · waiting 0 · paused 2 · done 1 · failed 0` — **only while an agent is paused**, so every other session's
  line reads exactly as REQ-MONITOR-169 words it (`agentCounts`, `agentStatesLine`).
- **The run-level agent.** While its session rests with an iteration open — `paused`, `interrupted`, or in
  REQ-CHAT-008's recovery state — and only then, it presents `paused` (state `paused`), not live and not ended, its
  activity the run's summary as before (`runLevelAgent`, `runLevelResting`): the same sessions the composer states a
  count for. Only the renderer knows the recovery state (`useNeedsRecovery`, moved to `renderer/session-view.ts` so the
  Workspace, the Mission view and a persona window ask the one liveness predicate alike). It carries no
  `interruption`: the session record does not carry the iteration's. A session at rest with nothing open presents it as
  before, and a live run's root presents running though its iteration is open. In the recovery state the window's status
  strip names the run `Run needs recovery`, as the run header and the Mission view do (`statusStripRunItem`), so no
  surface reads a run as active beside a root drawn `paused`. A persona window's first view of the replica is renewed as
  it subscribes (`followCoalesced`), because a session at rest publishes nothing more, so the root keeps its last activity
  there too. *Until the fourteenth review round the strip read "run Running", and one drive showed that window's root
  with no rows; that second defect was not reproduced (`docs/defects/fixed/`).*
- **What a crash left — a departure from clause 13's last sentence and from REQ-MONITOR-211/213.** The agents the
  crash record will pause present as it will leave them — `paused`, interruption `crash`, their activity kept, no chip
  — before it is recorded, although they are not in the child state `paused` and the sentence settles them: every
  agent of the open iteration neither terminal nor `paused`, while that iteration's interruption is still NULL (no rest
  recorded one), and the session is `interrupted` or claims a run the one liveness predicate (REQ-SESSION-171) finds no
  process behind (`crashLeftOf`, asked once per projection). Nothing is written (clause 8). The build departs because
  the cross-lane contract of R-065's build asked the tree to agree with clause 18's count, and a tree that settles
  `cancelled` the agents a Continue action promises to resume would state two contradictory outcomes at once; the
  departure is the smallest that removes that contradiction, since the crash record, when it comes, leaves exactly
  these agents `paused`. Concretely, it changes two things "as before" meant: in REQ-CHAT-008's recovery state those
  agents no longer draw running, live and pulsing; and in a session `interrupted` by a checkpoint listing's repair
  (OQ-96), which recorded no crash, they are no longer settled `cancelled` for display. Every other unfinished agent of
  a session at rest — one of no open iteration, or of an iteration a rest already recorded — is settled as before. So
  is every agent of a session a store failure left busy (OQ-42), which reads `not-live` too but is not one a crash left
  (OQ-103): the projection names none of its agents and states nothing to resume (`Sessions.restingOf`), so its tree,
  its run-level agent and the composer's count present it as before rather than label a store failure a crash. In the
  process whose run failed, the projection is frozen at its durable boundary anyway (OQ-42) and shows the run's last
  live state; the renderer still reads the session as REQ-CHAT-008's recovery state from the session list's `stale`,
  and the frozen record still carries the count read while the run was live, so there the run-level agent presents
  `paused` and the composer draws the count and the decline, which the engine refuses `store-failed` (OQ-103).
- **The colour.** The dot takes `--rt-wait`, REQ-SHELL-036's waiting family, which already names `paused` for a
  session; full opacity, no pulse. The state text `paused` is what tells it from `queued` (`docs/design/README.md`'s
  "A paused agent — no design").
- **The controls.** A paused agent is not live (REQ-MONITOR-045): it offers no Steer — neither in the inspector
  (`inspectorEnablement`) nor in the Workspace's agents header (`steerOffered`, which keeps the header's older `queued`).
  Its own Cancel is clause 16's (OQ-101). Neither live nor ended, it shows no elapsed time, and the transcript's "This
  task" reads its state alone (`scopeDetail`) — **for a `paused` agent only**. That departs from REQ-CHAT-069's "its
  live elapsed wall-clock time (REQ-MONITOR-111)" for an agent that is not live: in REQ-CHAT-008's recovery state the
  busy status keeps the clock ticking, and the figure would otherwise count up while nothing runs. Every other agent
  keeps its time there as before, a waiting or queued one included. *The first build dropped it for every agent neither
  live (`AgentRecord.live`, running only) nor ended, so a waiting or queued agent read `waiting` alone where the base
  read `waiting · 1m 3s`; the merged build's eleventh review round restricted it to `paused`.* The agent tree, the
  table and the inspector drop a waiting or queued agent's time too, as they did before revision 4
  ([`a-waiting-agents-elapsed-time-is-not-shown.md`](../defects/a-waiting-agents-elapsed-time-is-not-shown.md)); that
  is not this directive's, and is not repaired here.
- **A live agent's cancel.** Its confirmation and cascade note name every descendant its cancel ends — live and
  paused, through a finished one (`cancelCascade`) — so that neither understates what the cancel ends; the body and
  the note name what they are: "Its live descendants", "Its paused descendants" or "Its live and paused descendants
  will be cancelled with it:", and "Cancelling cascades to 2 live and paused descendants." (`cascadeKind`). That departs
  from REQ-MONITOR-064's "live (running, waiting, or queued) descendants" and REQ-MONITOR-128's "one line per live
  descendant", which clause 16 governs for a paused child's own confirmation but not for a live agent's: a live agent
  whose only unfinished descendant is paused gets "Cancelling cascades to 1 paused descendant." where the requirement's
  note is empty. The run's cancel, which ends every unfinished agent, lists every live or paused one in the Mission
  view. A live agent none of whose descendants rests reads exactly as before.

**What a ruling decides.** Whether REQ-MONITOR-169's line should name the paused count always rather than only while
one is paused, and where. Whether REQ-MONITOR-064's "live (running, waiting, or queued) descendants" and
REQ-MONITOR-128's "one line per live descendant" should be named as narrowed so that a live agent's cascade counts and
lists its paused descendants, as the build does. Whether REQ-CHAT-069 should be named as narrowed so that "This task"
shows a paused agent's state without its elapsed time. Whether the run-level agent should present `paused` (it has no
child state), and carry the iteration's interruption. Whether clause 13's last sentence, which settles every unfinished
agent not in the child state `paused` as before, should yield for the agents a crash left before the crash is recorded
so that they present `paused` as the build presents them — and with it REQ-MONITOR-211/213 for an `interrupted`
session — or whether they should present as before (running in REQ-CHAT-008's recovery state, `cancelled` once
`interrupted`) until the crash is recorded, the tree disagreeing with clause 18's count until then.

**OQ-101 — What does cancelling one paused child at rest reach, say and leave, and what does it do with a child a crash left, which clauses 3 and 8 record only at a repair or a continue?** *(`PD-ORCH-005` clause 16, revision 4, with clauses 3 and 8 — "a crash is recorded when the session is next repaired or continued", and "settling, recording interruptions and resuming happen only when a run of the session is about to start" — which the crash reading below keeps, and clauses 10 and 18, whose "Either choice records the crash first" names the Continue action and "continue without them" and not the cancel; clause 15, whose "every confirmed 'Cancel the run?' is clause 3's explicit cancel, whichever surface asks it" the reading below departs from on one surface, a persona window on the run's own instance while the session rests (cross-cited from OQ-108); REQ-MONITOR-063, which the directive narrows; REQ-MONITOR-128, which clause 16 names for the paused child's confirmation and not for its refusal, and whose "an error message states that the agent is no longer cancellable" the reading below departs from for the refusals that say nothing of the agent; REQ-MONITOR-064, which the directive does not name and which the cascade note below departs from by counting paused descendants where the requirement counts live ones only (OQ-100); and REQ-MONITOR-055, REQ-ORCH-133, REQ-LIBRARY-092, REQ-TOOLS-111, REQ-SHELL-075, REQ-SESSION-129, REQ-ORCH-048, REQ-ORCH-054 and REQ-CHAT-008, which it does not name. Raised 2026-09-28 by building `PD-ORCH-005` revision 4 under [R-065](../product/requests.md#r-065). Numbered OQ-74 while it was built; renumbered when it reached `main`, where OQ-74 had been taken meanwhile.)*

Clause 16 has "a `paused` child" offer Cancel "wherever a live agent offers it", confirmed as REQ-MONITOR-128 requires —
naming the child and one line per paused descendant — and has it and each paused descendant end `cancelled`, the
iteration open, the rest resuming, and the Continue action's count dropping. The session command it takes had worked
only with a run behind it. The clause does not say:

- which agent a surface offers it for, when the run-level agent now presents `paused` too (OQ-100);
- what it does with a child a crash left, before the crash is recorded, which presents `paused` (OQ-100) but is stored
  `running`;
- what the cancelled child's report, timeline entry and background sessions become;
- what REQ-MONITOR-064's cascade note, which counts live descendants only, says for a paused child;
- what the confirmation says beyond naming;
- what becomes of an agent whose `depends_on` names the cancelled child (REQ-ORCH-048).

**What the build proceeds under.**

- **Where it is offered.** A `paused` child offers Cancel on every surface a live agent does — the inspector, the
  Mission view's "Cancel selection" and the Workspace's agents header — **while its session rests** with an iteration
  open (`cancelOffered(agent, runActive, resting)`, `resting` being `runLevelResting`: `paused`, `interrupted`, or
  REQ-CHAT-008's recovery state, the same predicate that decides the composer's count and the run-level agent's
  `paused`), as clause 16's heading and REQ-MONITOR-063's back-pointer say. It is not offered while a run is active and
  the session does not rest: a `pausing` run is still bringing its agents to rest one by one, and a continue has not yet
  resumed them all; a cancel sent then would reach the live run's cancel, which cancels every unfinished descendant. A
  persona window offers Cancel always (REQ-SHELL-075(g)). The run-level agent at rest is never offered it: clause 16
  names a child, and the whole iteration's equivalent is clause 6's "Continue without them". The one exception is a
  persona window on the run's own instance, because REQ-SHELL-075(g) gives it Cancel unconditionally. That window asks
  "Cancel the run?" of the root it draws `paused`. The confirmed `cancelAgent` for the run's id, with no run behind the
  session, reaches `Sessions.cancelPausedAtRest`, which refuses it, and the window states "The run is no longer
  cancellable." So clause 15's "every confirmed 'Cancel the run?' is clause 3's explicit cancel" does nothing on this
  one surface while the session rests — a departure from clause 15, which OQ-108's audit of clause 15 cross-cites. The
  behaviour predates revision 4, but a root drawn `paused` makes the offer look available. The button is kept, since
  withholding it would narrow REQ-SHELL-075(g). Found by the merged build's review. The Workspace's agents header now
  offers a live agent's Cancel only while its run is active, as the inspector already did; it had offered it with no
  run, and the engine refused. It offers a paused agent no Steer, as the inspector offers none (OQ-100).
- **The command.** `session.control`'s `cancelAgent` with no run behind the session goes to
  `Sessions.cancelPausedAtRest`. It is refused (`{ok: false}`, which the renderer states as "not cancellable",
  REQ-MONITOR-128) for the run's id or the root's, an id that is no child of the open iteration, and a child neither
  `paused` nor left by a crash; a refusal records nothing, and those are judged before the lock is taken, so none of
  them claims or reaps it. It is refused too when the chosen child's own move to `cancelled` fails, and then nothing
  below it is cancelled and nothing has been written: an illegal move is refused as "not cancellable", and a failed
  store write as `store_failed` (below). A descendant whose own move fails is warned of and left where it stood, to
  resume with the rest, and the chosen child's cancel stands. It is refused, writing nothing, under a store failure, as
  every continue is (`store-failed`, OQ-103): nothing can be recorded of the session until the reopen rebuilds the
  writer. It is written under the session's lock (ADR-0005), which it does not
  otherwise hold: a run releases the lock at its teardown, so a session paused in this process holds none. The cancel
  takes the lock for its write and gives it back after, keeps it when this process already holds it (a session loaded
  here), reaps a dead holder on this machine as loading a session does — through the one copy of that rule,
  `claimLockReaping`, which never reaps a holder whose pid is no positive integer — and is refused while another live
  process holds it — one that has loaded the session, or is resuming it — so it never writes into a session another
  instance owns. The refusals that say nothing of the agent carry the engine's words, which the renderer states in
  place of "not cancellable": `session_locked`, "Another process holds this session, so the agent was not cancelled.",
  only when the lock is held by another live process; and `store_failed` for a store failure — "The workspace store
  requires recovery before an agent can be cancelled: …" when one is found first or the chosen child's move fails to be
  written, and "The workspace store could not take this session's lock, so the agent was not cancelled: …" when
  reading or claiming the lock throws, where no other process is involved. Every other refusal states none, and the
  renderer's fallback is REQ-MONITOR-128's "no longer cancellable" ("That agent is not cancellable (unknown, or already
  finished)."). **This departs from REQ-MONITOR-128**, whose refusal sentence — "an error message states that the agent
  is no longer cancellable" — clause 16 does not govern: the directive names REQ-MONITOR-128 for the confirmation only.
  The build reads the requirement's sentence as written for an agent the run no longer has, and states the engine's
  words where the refusal is the store's or another process's, because "no longer cancellable" would be false of a
  paused child that stays cancellable once the store is restored or the other process lets the session go. Pinned in
  `children/children.test.ts` ("the cancel is made under the session's lock": the holder, a lock the store could not
  read, and a failed write of the chosen child) and `run/crash.test.ts`. *Until the merged build's twelfth review round
  every refusal read "That agent is not cancellable (unknown, or already finished).", false of a paused child the store
  or another process's lock stood in front of. Until the thirteenth a store error while taking the lock was refused as
  `session_locked`, "Another process holds this session", with no other process involved, and a failed write of the
  chosen child's move still read "not cancellable"; and this bullet presented the engine's words as keeping
  REQ-MONITOR-128 rather than departing from it.*
- **A crash not yet recorded — left to the next repair or continue.** A child a crash left unfinished, the crash not
  yet recorded (`crashLeftOf`), presents `paused` (OQ-100) and so is offered Cancel, but it is stored `running`,
  `queued` and so on. The cancel ends it, and each descendant the crash left or a rest paused, `cancelled` from the state
  it is stored in, as clause 3's "cancellation of one agent" ends its agents — and records nothing of the crash: no run
  is about to start and nothing is repaired or continued, which is when clauses 3 and 8 record one, and clause 18's
  "records the crash first" names the Continue action and "continue without them", not the cancel. So the open
  iteration's interruption stays NULL, the other agents the crash left stay as stored (still presenting `paused` by
  `crash`), the stored pending approvals stay listed — one for a cancelled agent too, which nothing can answer — and
  the background sessions still marked running stay so; the next repair or continue records all of it, and pauses only
  what is still unfinished. The one thing written of the crash is what no later record reaches: a crash record answers
  the calls of the agents it pauses, and a cancelled agent is terminal, so the cancel answers the cancelled agent's own
  calls the crash cut off as interrupted, their rows settling (`answerOpenCalls`, REQ-SESSION-129: no row is left
  `running`). A cancelled crash-left agent keeps a NULL `interruption` and `resume_state`. *The first build recorded the
  whole crash record first, at the cancel — a departure from clauses 3 and 8 taken as the cross-lane contract of R-065's
  build; the merged build's review found that a reading departing from nothing was available, and it replaced it
  ([`cancelling-one-crash-left-child-records-the-whole-crash.md`](../defects/fixed/cancelling-one-crash-left-child-records-the-whole-crash.md)).*
- **What it cancels.** The child and every `paused` descendant at any depth, including one below a descendant that had
  already finished; a finished descendant is left as it is, and a crash-left one is cancelled as above. Each moves
  `paused` → `cancelled` by the cancellation path, keeps its `interruption` and `resume_state` (as the decline does),
  and gains the live cancel's report — "The user cancelled this child." or "Cancelled with <name>, which the user
  cancelled." — its artifact (REQ-LIBRARY-092), and a `child_user_cancelled` entry whose message adds "while the session
  rested". Nothing else is written: the iteration, its task and the todo stay as they are, and the parent learns of the
  cancel when it resumes, as of any child that ended unobserved (REQ-ORCH-054).
- **Background sessions.** A cancelled agent's background terminal sessions are left as a live cancel of one child
  leaves them, for the next stop, quit or crash to end (clause 10, REQ-TOOLS-111).
- **The cascade note.** For any agent it counts every unfinished descendant its cancel ends, live and paused, through a
  finished one (OQ-100). For a paused child at rest those are its paused descendants — "Cancelling cascades to 1 paused
  descendant." — since at rest every unfinished descendant is `paused`. REQ-MONITOR-064 counts live descendants only and
  would leave that note empty; the build departs from it, as it does for a live agent's paused descendants (OQ-100).
  While a run is still `pausing`, a paused child a persona window cancels (REQ-SHELL-075(g) offers it Cancel always)
  reaches the live run's cancel, which also ends a descendant whose in-flight call has not yet let it rest; the note
  then says "live and paused", so the confirmation never understates what the engine ends.
- **The confirmation.** Titled "Cancel <name>?", it gives one line per descendant cancelled with it — the set the
  cascade note counts — and states that it cannot be undone, that the agent will not resume (clause 3's "final"), and
  which descendants are cancelled with it by the same adjective ("paused", or "live and paused" in a `pausing` run);
  with no descendant cancelled, that the other paused agents resume when the session continues. Its dismissal reads
  "Keep it paused" rather than "Keep running", on the Workspace and in a persona window through `AgentCancelConfirm`
  (its own module beside the cancel rules, the run's cancel on the Workspace included), whose props take no label a call
  site could override; a test over both call sites' source fails when either takes the labels itself again. The Mission
  view's own confirmation adds "and will not resume" to its sentence (`missionCancelBody`), and takes its title and both
  buttons from the same `cancelConfirmation` (`missionConfirmation`). The confirmation describes the session as it was
  when Cancel was pressed: a continue confirmed in another window before this one is answered sends the cancel to the
  live run, which cancels every unfinished descendant rather than the paused ones listed — the same window a live
  agent's confirmation has when its descendants change under it.
- **A dependent of the cancelled child.** The at-rest cancel runs no scheduler pass, so REQ-ORCH-048's cascade, which
  a live cancel's pass runs at once (`IterationChildren.cancel`), does not reach an agent whose `depends_on` names the
  cancelled child. That agent is neither the child nor its descendant, so it stays where it stood — `paused` with the
  resume state `waiting_on_dependencies`, or, left by a crash not yet recorded, stored `waiting_on_dependencies` and
  presenting `paused` (OQ-100). It stays in the Continue action's count, which drops by exactly as many as were
  cancelled, as clause 16 says, and the confirmation's "the other paused agents resume when the session continues" is
  literally what happens to it: the Continue action resumes it (`child_resumed`), and the resumed run's first scheduler
  pass blocks it (REQ-ORCH-048). It does no work, and it gets no report
  ([`a-child-blocked-by-its-dependency-gets-no-report.md`](../defects/a-child-blocked-by-its-dependency-gets-no-report.md),
  which a live cascade reaches too). So the count overstates by the dependents the resumed run will block at once.
  Blocking them at the cancel would make the count drop by more than were cancelled and would move an agent clause 16
  does not name, so the build does not. Pinned in `crash.test.ts` ("a dependent of the cancelled child stays counted
  …", `paused` and the recovery state). Found by the merged build's ninth review round.
- **Not built.** REQ-MONITOR-128's optimistic display: the surfaces wait for the republished record, for this cancel as
  for a live one.

**What a ruling decides.** Whether a crash-left child should be cancelled from its stored state as built, with its own
calls the crash cut off answered at the cancel, or be offered no Cancel until the crash is recorded. Whether a cancelled
paused agent's running background sessions should end at the cancel, since it will never resume. Whether REQ-MONITOR-064
should be named as narrowed for the paused count. Whether the recovery state's cancel should also repair the session's
status. Whether the resting run-level agent should offer a Cancel that declines the iteration, and whether a persona
window on the run's own instance should withhold its Cancel while the session rests rather than confirm one the engine
refuses. Whether the at-rest cancel should block, at the cancel, each agent whose `depends_on` names a child it cancels,
as the live cancel's pass does (REQ-ORCH-048), counting them out of the Continue action's count and naming them in the
confirmation, or leave them for the resumed run to block, as built. Whether a refusal by the store or by another
process's lock should state the engine's words, as built, or REQ-MONITOR-128's "no longer cancellable", which the
requirement prescribes for a refusal and clause 16 does not displace — and, if the engine's words, whether a store error
while taking the lock should read as the store's failure, as built, or as a refusal of its own.

**OQ-102 — How does a continue's message close with the resumed iteration, and which continues make one?** *(`PD-ORCH-005` clause 17 (revision 4); REQ-ORCH-004, which the clause narrows for a continue's message alone and which the reading below departs from for the continues the clause does not govern — the Continue action, "continue without them" and the message-limit resolution's 'continue' and 'double', none of which appends its request while the todo holds it unfinished, where REQ-ORCH-004's back-pointer keeps "Every other new top-level task is appended as stated" (the plan decision's relaunch, OQ-104, is not among them: it states no new top-level task, the held run having appended the gated work already, so appending none keeps REQ-ORCH-004); and REQ-ORCH-067, REQ-ORCH-069, REQ-ORCH-072, REQ-ORCH-077, REQ-ORCH-135, REQ-MONITOR-125, REQ-SESSION-110, REQ-ORCH-086, REQ-ORCH-087 and REQ-ORCH-153, which it does not name. Raised 2026-09-28 by building `PD-ORCH-005` revision 4 under [R-065](../product/requests.md#r-065). Numbered OQ-75 while it was built; renumbered when it reached `main`, where OQ-75 had been taken meanwhile.)*

Clause 17: "The message a continue delivers to the resumed root (clause 4) SHALL also be appended to the session's todo
as a task. That task closes with the resumed iteration: done when the iteration succeeds, and left pending when it is
cancelled or fails, so the next iteration takes it up." The clause names two closes of an iteration that has four
outcomes and several ways to close, and does not say what state the task is in while the iteration is open, whether
leaving it pending counts against it, how it meets the one-task-per-iteration rule, or which continues deliver a
message.

**What the build proceeds under.**

- **Only `succeeded` is done.** An iteration that ends `partial` — its own task requeued, or abandoned at the retry
  limit — is neither a success nor a cancel; it did not finish, so the message is left pending. So is every other close:
  failed, raised, cancelled by the explicit cancel or by a pause that found nothing unfinished, declined by "continue
  without them", closed because the run that owned it died, and the explicit cancel after a rest or during the
  continue's pre-flight. A rest does not close the iteration, so the task stays with it and is resumed with it.
- **While the iteration is open the task is in progress, held by it.** It is appended `in_progress` beside the
  iteration's own task, as REQ-ORCH-072's selected task is, so the Todo pane shows it active and no selection takes it
  while its iteration is open. The binding is the iteration's number on the task (`heldBy`), stored in the planner todo
  document itself, so no store column is added and the binding survives a rest, a quit and a crash with the todo.
- **Left pending is not a requeue.** No consecutive retry is counted: REQ-ORCH-077's count is an iteration's own task
  failing to finish, and the message was not the task the iteration selected.
- **The message is held, not selected.** REQ-ORCH-067's "one task" is the task an iteration selects; the resumed
  iteration selected its own before the rest, and it answers the message because clause 4 delivers it.
- **Left pending, it is the next iteration's.** The clause says the next iteration takes it up, so a message left
  pending is marked (`nextUp`, in the todo document) and selected before every other pending task, the resumed
  iteration's own requeued or reopened task included; that iteration may be a later one of the same run or the first of
  a later run. Several messages released together are taken up in the order they were appended. Once an iteration
  begins it, it is an ordinary task: requeued, it goes back to its place in the todo (the `Continued Prompts` phase).
  *The first build selected it in its place in the todo, after every task before it, so a partial close or a decline
  had the next iteration take the resumed iteration's own task instead (found by the iteration lane's second review).*
- **Taking it up sends it.** An iteration's first message is the launch content, whose latest request is whatever
  launched the run
  ([`every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`](../defects/fixed/every-iteration-is-sent-the-prompt-the-run-was-launched-with.md)),
  so a message taken up by a later run's iteration, or by the iteration after a continue by a second message, would be
  selected and marked done without ever being sent as the request, and the newer request worked in its place and again
  under its own task. So a task that is a continue's message (`message`, set when it is appended and kept for good, in
  the todo document) is sent to the fresh root of the iteration that selects it, as a text part after the launch content
  naming it the iteration's task and the latest request a separate one — unless the launch content's request is that
  same text, when the launch content already says it. It is sent only to an iteration's root: a plan cycle is not an
  iteration and has no iteration task (REQ-ORCH-153), so the plan cycle held after a resumed iteration whose own task
  was a message is not told it (found by the iteration lane's fifth review). Only the message's text is sent; its images
  are not, as the task holds its text only. Every other task an iteration selects that is not the run's own, and whose
  text is not the launch content's request, is sent the same way since the recorded defect's repair (2026-09-29, under
  [R-067](../product/requests.md#r-067)), in words that name it a task of the session's todo rather than an earlier
  message. *Until that repair every other task kept the recorded defect's behaviour — sent only the launch content —
  which this reading did not repair.* *The second build selected the message and sent it nothing of it (found by the
  iteration lane's fourth review).*
- **Several continues on one open iteration.** Each continue by message that resumes the iteration appends its own task,
  held by it; they close together, in the order they were appended.
- **Which continues make one.** Only a continue that delivers a message: a continue by message (`Sessions.prompt`), with
  text, images or both. A message of images alone makes a task whose text is empty, as a continued prompt's does. The
  Continue action and a plan decision deliver none and append none for a message.
- **A continue that states no new request appends no second task.** The Continue action, "continue without them", and
  the message-limit resolution's 'continue' and 'double' (REQ-SESSION-110, REQ-ORCH-086/087 — the dialog and the palette
  entry reach the same `continueSession`) continue from the last request (REQ-MONITOR-125) and append it as a task
  (REQ-ORCH-004); while the todo still holds a task of that request's text pending, or in progress and held by the open
  iteration (its own task, or a message it holds) — a continue's message a resumed iteration left pending or holds, or
  any request whose task a rest put back — they append none, and the run takes that task up as it stands. A request
  whose task is complete or abandoned is appended as before — a `paused` session holds its last request complete when
  its pause, stop or quit was accepted after its iteration closed, or when the plan cycle held after a resumed iteration
  that carried out the continue's message was cancelled, stopped or quit, and a `paused_message_limit` one when the
  limit was reached as the iteration that finished it closed, a resumed one included (OQ-103, "Nothing open to resume";
  OQ-104, "What a cancel leaves") — and so is one whose task is in progress with no iteration holding it: a selection
  takes only pending tasks, so nothing would take that task up, and the run would end at once with the request not done.
  A message a closed iteration still holds, and an iteration's own task its closed iteration left in progress (see "What
  a death leaves"), are judged as the run will take them: each is settled first, as the run settles it before it
  selects, so one returned to pending is not appended a second time and one completed is appended as any completed
  request is. *Until 2026-09-29 only the message was settled, so an own task a death left in progress was appended
  again beside itself and stayed in progress for good.* A continue by message is never judged so: it states a request, so
  it appends its task even when a task of the same text is still pending (REQ-ORCH-004), and the request is worked once
  for each time it was sent (pinned by the iteration lane's sixth review). *The fourth build judged such a message
  unheld, so a Continue action after the death appended it beside the task the run then returned to pending, and the run
  worked it twice (found by the iteration lane's fifth review).* *The second build counted any task in progress, which
  ended such a continue `no_pending_tasks` (found by the iteration lane's third review); the stranded task itself was
  [`an-iterations-own-task-is-left-in-progress-by-a-death-before-the-todo-save.md`](../defects/fixed/an-iterations-own-task-is-left-in-progress-by-a-death-before-the-todo-save.md),
  repaired 2026-09-29.*
  This repairs
  [`the-continue-action-appends-the-last-prompt-again-while-its-task-is-pending.md`](../defects/fixed/the-continue-action-appends-the-last-prompt-again-while-its-task-is-pending.md),
  which the clause had widened: a message left pending is the last user row, so a Continue action appended it beside its
  own task and the run worked it twice. *The first build closed only "continue without them" on an iteration that holds
  a message, and left the Continue action undecided (found by the iteration lane's second review).* *Until the iteration
  lane's seventh review the record named only the Continue action and the decline, though the guard covered the
  message-limit resolution from the second build: a session paused at its limit with the last request's task still
  pending appended it a second time on 'continue' or 'double' at the base, and appends none now.*
- **What a death leaves.** The todo is saved with the run's `starting` save, so a run host that dies during the
  pre-flight keeps the task as the root's record keeps the message. A task held by an iteration that is no longer open —
  a death between the iteration's close and the save that recorded the release — closes when the next run is built as
  the record says its iteration closed: `complete` when the iteration's row reads `succeeded`, since the clause's "done
  when the iteration succeeds" is decided by the outcome and not by which save landed, and `pending` otherwise, so it is
  never left in progress with nothing to close it and a message its iteration carried out is never worked again. Since
  2026-09-29 the close no longer leaves that window: an iteration's close commits the todo its task and held messages
  were closed in, in the transaction that records `iteration.end` (`SessionWriter.endIteration`), ahead of the capture
  and the hooks, on both closes (`iterate()` and `closeOpenIteration`). A store an earlier build wrote is still settled,
  and an iteration's own task such a death left in progress with it — as the latest row naming it closed: `succeeded`
  complete, `partial` requeued, `failed` or `abandoned` abandoned, `cancelled` pending (`Todo.settleStranded`; the repair
  of
  [`an-iterations-own-task-is-left-in-progress-by-a-death-before-the-todo-save.md`](../defects/fixed/an-iterations-own-task-is-left-in-progress-by-a-death-before-the-todo-save.md)).
  *Until then only a held message was settled, and the save came after the capture and the hooks.*

**What a ruling decides.** Whether a `partial` resumed iteration should close the message as done, since the root
answered it; whether leaving the message pending should count toward REQ-ORCH-077's limit, so a message no iteration
can finish is abandoned rather than taken up forever; whether a message left pending should be taken up before the
resumed iteration's own unfinished task, as built, or after it; whether a continue that states no new request may
append nothing while its last request is unfinished — a departure from REQ-ORCH-004 that no directive governs, since
clause 17 speaks only of the message a continue delivers — and, if so, whether it should recognise that request's task
by more than its text, and whether it should append a request whose task is already complete (OQ-103's ruling on the
same state, the message-limit resolution's included); and whether a message taken up by a later iteration
should be sent with its images, or become that iteration's launch content in place of the latest request.

**OQ-103 — Which sessions has a crash left, and what does the Continue action offer on one with nothing to resume?** *(`PD-ORCH-005` clause 18 (revision 4), with clauses 8, 11 and 19; clause 3, whose "those are never resumed" of the cancel control's agents the reading below departs from for a run whose explicit cancel was accepted but not carried out when its host died, and REQ-MONITOR-126 ("cannot be undone in this session"), which it departs from for the same run; REQ-MONITOR-125 as clause 18 extends it; REQ-CHAT-008, REQ-GIT-093, REQ-SESSION-171, REQ-SESSION-060, REQ-GIT-094, REQ-CHAT-006, REQ-ORCH-004, REQ-ORCH-085, REQ-ORCH-087 and REQ-SESSION-110, which the directive does not name; and `PD-CHAT-001` revision 4 ("The strip" and "The paused continues"), with REQ-CHAT-005 as it narrows it, which the reading below departs from by drawing the two continues in the send pill's place on a session that is not paused. Raised 2026-09-28 by building `PD-ORCH-005` revision 4 under [R-065](../product/requests.md#r-065). Numbered OQ-76 while it was built; renumbered when it reached `main`, where OQ-76 had been taken meanwhile.)*

Clause 18: "A session a crash left — `interrupted` after a repair, or in REQ-CHAT-008's recovery state before one — SHALL
offer the Continue action and 'continue without them' as a `paused` session does, with the same count. Either choice
records the crash first, as any continue does (clause 8)." The clause names the two states. It does not say how the
engine tells the recovery state apart from a session another process is still running. It does not say what a
crash-left session offers when no iteration is open, or whether the pause's statement is drawn on it. And it does not
say what the decline's wording means before the crash is recorded.

**What the build proceeds under.**

- **Which sessions a crash left.** `Sessions.continueSession` accepts a session whose status is `interrupted`. It also
  accepts one whose status is still busy when REQ-GIT-093's liveness predicate calls it `not-live`, the one predicate
  REQ-SESSION-171 and the repair already use. A busy session that is `live`, or whose liveness is `unknown`, is refused
  (`run-active`), because another process may still be running it. The renderer reads the same two states as
  `crashLeft`: `interrupted`, or busy with `needsRecovery` (the session list's `stale`). `paused_message_limit` and
  `awaiting_plan_decision` are durable holds, not busy statuses, so a crash does not make them crash-left. They keep
  their own continues (clause 11).
- **A session the store's failure left busy is not one a crash left.** A run that ends on a recording failure (OQ-42)
  leaves the durable status busy and this process's lock with no run behind it, so the liveness predicate reads
  `not-live`, the session list marks it `stale`, and the renderer's `crashLeft` draws the two continues on it. It did not
  crash, and nothing can be recorded of it. `Sessions.continueSession` therefore refuses every continue on it
  `store-failed` ("The workspace store requires recovery before continuing work"), as `Sessions.prompt` and the plan
  decision already do, so the Continue action, the decline and the continue by message all refuse the same state the
  same way. The guard stands first in `continueSession`, so a `paused` session under a store failure is refused too,
  where it was accepted before. The recovery is OQ-42's: restore storage and reopen the session, which rebuilds the
  writer. After the reopen the session is busy with nothing running it, which is REQ-CHAT-008's recovery state, and a
  continue then records the crash as for any other. The renderer does not tell this state apart: it knows nothing of
  the writer's failure beyond the recording-failure notice, whose action is the reopen. The engine does not call it
  crash-left anywhere else either: a projection read under the failure names none of its agents crash-left and states
  nothing to resume (`Sessions.restingOf`, OQ-100), and the at-rest cancel of a child is refused, writing nothing, as
  the continues are (OQ-101). In the process whose run failed the projection is frozen at the run's last live record
  (OQ-42), whose count the composer still draws beside the two continues, with the decline, all refused the same way.
  The projection withholds only for a busy status (`storeLeftBusy`). An `interrupted` or `paused` session whose store
  fails while it is followed keeps its count, its decline and a paused child's Cancel, and the engine refuses each
  (`store-failed`; the cancel's `store_failed`, whose words the surface states). Nothing is written, and the reopen is
  the recovery, as above. Recorded at the merged build's twelfth review round.
  *Until the merged build's review the projection named such a session's agents crash-left and the cancel wrote a crash
  record against the failed writer
  ([`the-at-rest-cancel-writes-against-a-failed-store.md`](../defects/fixed/the-at-rest-cancel-writes-against-a-failed-store.md)).* *The first build accepted such a
  session and reported `{resumed: true}` against the failed writer, where the same call had been refused `not-paused`
  before clause 18; the round-2 review found it.*
- **A run whose explicit cancel was in flight when it crashed.** The run-level explicit cancel (REQ-MONITOR-126, the
  reserved run id's `cancelAgent`, which every confirmed "Cancel the run?" sends, clause 15) writes nothing durable
  when it is accepted: `Run.cancelAgent` raises the final stop in memory, and the agents end `cancelled` and the
  iteration closes only in the teardown, once the root's turn returns. A host that dies in that window — a call that
  ignores the abort until its deadline, the quit's shutdown bound running out while the cancel settles, or the process
  killed — leaves the store as any mid-run crash does: busy, the open iteration's interruption NULL, the unfinished
  agents where they stood. The build cannot tell it apart, and treats it as crash-left: its agents present `paused` by
  `crash` (OQ-100), the Continue action counts them (clauses 6 and 19), and the repair or a continue records the crash
  and pauses them, so the Continue action resumes work the user confirmed as final. That departs from clause 3's "those
  are never resumed" and from REQ-MONITOR-126's "cannot be undone in this session", for a cancel that was requested and
  never carried out. The stop's `cancelling` status is written at once but is not final, so it cannot tell the two
  apart either; a single child's cancel is durable at once and is not affected. The alternative — a durable mark
  written when the explicit cancel is accepted, read by `crashLeftOf`, `resumableOf`, `recordCrash` and
  `continueSession`, so that the next repair or continue ends those agents `cancelled` and closes the iteration — needs
  a stored field and a reading of what the repair then records, so it is not built ahead of a ruling
  ([`a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md`](../defects/a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md)).
  At the base the case was reachable only by a continue by message. *Recorded at the merged build's thirteenth review
  round; until then this question did not name it.*
- **The actions at the message limit.** A crash-left session is not at the message limit, so it takes `action` as a
  manually paused session does. `continue` and `double` continue it; `cancel` leaves it as it is.
- **Nothing open to resume.** A crash-left session with no open iteration draws the two continues where the send pill
  stood, with no count and no decline, as a `paused` session with nothing to resume does. Its Continue action continues
  the last request, which is REQ-MONITOR-125's "resumed from the composer". Where the todo holds that request
  unfinished, OQ-102's no-append rule keeps the Continue from appending it again. It does not always hold it unfinished.
  If the host dies after an iteration closed `succeeded` and before the run's teardown settled the status, the session
  is left busy with nothing open and its last request `complete`. A `paused` session reaches the same state with no
  crash: a pause, a stop or the application's quit (`application_shutdown`, which rests `paused` as the stop does,
  clause 15) the run accepts after the iteration closed, while its checkpoint is captured, its `iteration_end` hooks
  fire or its events drain, is met at the loop head, which comes to rest before the stop conditions run. Only a pause,
  a stop or a quit accepted during the turn puts the iteration's task back to pending. A third route is the plan mode's:
  a resumed iteration closes the continue's message `complete` (clause 17), the gate then holds before the first new
  iteration (`PD-ORCH-003` revision 2), and a plan Cancel, or a stop or a quit during that plan cycle (clause 15, which
  pairs the two), leaves `paused` with nothing open and the continue's message, the last user row, finished (OQ-104,
  "What a cancel leaves"). The quit is the likeliest way there: the user closes the application while the plan is being
  drafted, and on relaunch the Continue action appends the finished message again. A fresh hold does not reach it,
  because the gated request's task is still pending. A fourth route is the message limit's, and it needs no directive:
  the limit is checked as each iteration closes, before the stop conditions and the gate (REQ-ORCH-085/087), so a limit
  reached as the iteration that finished the last request closes leaves `paused_message_limit` with nothing open and
  that request `complete` — after a resumed iteration that carried out the continue's message (clause 17), where the
  limit wins over the gate (OQ-104), and after any iteration that finished the request its run was launched with, as at
  the base. The resolution's 'continue' and 'double' (REQ-SESSION-110) reach `continueSession` as the Continue action
  does. On every route the build appends the finished request again as a new task (REQ-ORCH-004: OQ-102's rule covers
  only a request held unfinished), and a new iteration re-works a request that already succeeded, so the crash-left
  session does here what a `paused` one does, as clause 18 has it. Measured in `run/crash.test.ts`: "…nothing open and
  the last request finished…", for the recovery state and for `interrupted`, and "…accepted after the iteration
  closed…", for a pause, a stop and a quit; and in `run/plan-gate-resume.test.ts`, "after the hold that follows a
  resumed iteration, …", for a plan Cancel and for a stop and a quit during the plan cycle, and "the message-limit
  resolution …", for 'continue' and 'double' after a resumed iteration and after a fresh run's only iteration. *Until
  the merged build's sixth review round this bullet said no `paused` session reaches the state, so clause 18's "as a
  `paused` session does" had no counterpart for it, and the ruling question below named the crash-left session alone.
  Until the eighth it named two routes and not the plan mode's, which is the likeliest in `plan` mode. Until the tenth
  it said "The message-limit resolution does not reach this state: a crash-left session is not at the limit, and the
  pause and the stop leave `paused`, not `paused_message_limit`", which is false of the limit's own pause. Until the
  twelfth it named the pause and the stop on the first and third routes and not the application's quit, which reaches
  both the same way.*
- **The two continues take the send pill's place.** A crash-left session with an iteration open draws the Continue
  action and the continue by message (`Send`) in the strip where the send pill stood, and the count and "Continue
  without them" in the notices row, as a `paused` session does (`crashLeft` in `WorkspaceView`); with nothing open it
  draws the two continues and no count ("Nothing open to resume", above). `PD-CHAT-001` revision 4 prescribes that
  layout "on a paused session" alone ("the send pill, or on a paused session the two continues that take its place"; "On
  a paused session the send pill's place is taken by two continues"), and REQ-CHAT-005's send pill as it narrows it
  governs everywhere else. Clause 18 grants a crash-left session "the Continue action and 'continue without them' … as a
  `paused` session does"; it names neither the strip nor the continue by message. The build reads clause 18's "as a
  `paused` session does" to carry the paused session's presentation of those continues, and draws the continue by
  message beside them because the send pill it would otherwise keep sends a continue by message on that session too
  (`Sessions.prompt` records the crash first, as every continue does). Drawing it there departs from `PD-CHAT-001`
  revision 4's strip sentence and from REQ-CHAT-005 for a session neither directive governs; the alternative — keep the
  send pill, with the Continue action and the decline beside it in the notices row — was not taken, because the strip
  would then draw two different controls for the same pair of continues depending on why the session rests. *Until the
  merged build's eighth review round this was stated only in passing, in the bullet "Nothing open to resume" above, and
  not asked.*
- **No pause statement.** "Paused. Run controls need the run continued…" stays on a paused session only. A crash-left
  session is not paused, and its run state already says what it is (REQ-CHAT-008's "Run needs recovery", or the
  interrupted presentation). REQ-CHAT-006's chip reason in the recovery state is left as it stands. The Continue action
  belongs to the composer, not to the run controls.
- **The decline's wording before the crash is recorded.** In the recovery state the agents the count names are still
  `running` in the store, yet the decline says "The N paused agents end cancelled". The text is kept. The crash record
  pauses them first (clause 8), then the decline cancels them, so the words describe the act at the moment it happens.
  The wording agrees with how those agents present: before the crash is recorded they present as the crash record will
  leave them, `paused` by `crash` (OQ-100's reading, `crashLeftOf`), so the agent tree, the count and the decline name
  the same agents in the same state.
- **Either choice records the crash first, in one place.** Every continue passes `Sessions.launchContinuation`, which
  records the crash before the stale-child settle and before it resumes or declines the open iteration. So the Continue
  action, the continue by message (`Sessions.prompt`) and the decline need no crash-specific path.
- **The lock.** `Sessions.prompt` tries to re-claim a lock it no longer holds, but it cannot: `resume` returns early for
  a session already live in this process. A probe placed in that branch was never reached on any crash-left path, so
  `continueSession` does not copy it
  (`docs/defects/a-continue-by-message-cannot-re-claim-a-lock-it-no-longer-holds.md`).

**What a ruling decides.** Whether a crash-left session's strip should draw the two continues in the send pill's place,
as built, or keep the send pill (REQ-CHAT-005) with the Continue action and the decline in the notices row, since
`PD-CHAT-001` revision 4 prescribes the paused continues on a paused session only. Whether a busy session of unknown
liveness should also be continuable, for example after a confirmation, rather than refused. Whether a crash-left session
should state something of its own in the notices row, where a paused session states its pause. Whether a crash that left
a durable hold should offer anything beyond that hold's own continues. Whether the composer should withhold the
continues on a session the store's failure left busy, or on an `interrupted` or `paused` one whose store failed while it
was followed (and the surfaces a paused child's Cancel there), rather than draw them and have the engine refuse them.
Whether the Continue action on a session with nothing open and its last request finished — crash-left, `paused` by a
pause, a stop or the application's quit accepted after its iteration closed, `paused` by a plan Cancel, a stop or a quit
of the plan cycle held after a resumed iteration that carried out the continue's message, or `paused_message_limit` by a
limit reached as the iteration that finished it closed, whose resolution's 'continue' and 'double' take the same path —
should re-run that request as built, append nothing and run nothing, or not be offered at all, which for the crash-left
session would narrow clause 18's "SHALL offer". Whether a run whose explicit cancel was accepted but not carried out
when its host died is one a crash left, as built, so that clause 18's Continue action resumes its agents, or whether
clause 3's "those are never resumed" governs it, so that the cancel is made durable when it is accepted and the next
repair or continue ends its agents `cancelled` and closes the iteration.

**Ruled 2026-09-29 — the last question, [R-067](../product/requests.md#r-067).** The owner took the recommendation: clause 3's
"those are never resumed" governs a run whose explicit cancel was accepted but not carried out when its host died. The
cancel is made durable when it is accepted — a stored mark, written by an **appended** store migration — and read where
the build reads a crash: the next repair or continue ends those agents `cancelled` and closes the iteration, the Continue
action counts none of them, and clause 18's Continue does not resume them. REQ-MONITOR-126's "cannot be undone in this
session" then holds across the host's death. No directive text changes: clause 3 already says it, and the reading above,
which departed from it, is withdrawn by this ruling. The other questions of this entry stay open. Nothing is built by the
ruling; the repair is owed to
[`a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md`](../defects/a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md).

**OQ-104 — Where does the gate hold a run that resumed an iteration, and what does that plan cycle plan?** *(`PD-ORCH-003` revision 2, with `PD-ORCH-005` clause 18; REQ-ORCH-152, which the directive narrows for an iteration a rest left open (`PD-ORCH-005` clause 4), and which the reading below that an iteration a crash left open resumes unheld too departs from for an iteration the directive does not govern; REQ-ORCH-153, whose gate that reading also departs from for the same iteration; and REQ-ORCH-021, REQ-ORCH-067, REQ-ORCH-069, REQ-ORCH-073, REQ-ORCH-085, REQ-ORCH-154, REQ-CHAT-040, REQ-SESSION-115 and REQ-TOOLS-010, which it does not name. Raised 2026-09-28 by building `PD-ORCH-003` revision 2 under [R-065](../product/requests.md#r-065). Numbered OQ-77 while it was built; renumbered when it reached `main`, where OQ-77 had been taken meanwhile.)*

Revision 2: a continue that resumes an open iteration "SHALL run that iteration without holding it at the gate … When
the gate would hold that run … it SHALL hold before the first new iteration the run begins." The paragraph places the
hold and leaves open what happens at the edges of that point, what the plan cycle held there is asked to plan (the
launch content is the continue that resumed the iteration, whose work that iteration may or may not have finished),
and what the answer at that gate launches.

**What the build proceeds under.**

- **The hold falls where a new iteration would begin.** After the resumed iteration closes, the loop checks the stop,
  the pause, the queued prompts (REQ-CHAT-040) and the stop conditions (REQ-ORCH-069) as it does before every iteration,
  and holds only when they found work left. A run with nothing pending, or at its iteration or time limit, ends as it
  would have, with no gate. The message-limit pause reached as the resumed iteration closes wins (REQ-ORCH-085), and so
  do a pause or a stop accepted during it. The hold is then set before the park turn builds anything, so that turn's
  tool listing, its hooks, its children and its supervisor are all the held segment's (REQ-TOOLS-010, PD-ORCH-001), and
  a pause during it is refused and a stop records no interruption (`PD-ORCH-005` clauses 11 and 15).
- **An iteration a crash left open resumes unheld too, once the crash is recorded.** The revision names "an iteration a
  rest left open (`PD-ORCH-005` clause 4)"; it does not name one a crash left. Clause 18 has either continue of a
  crash-left session record the crash first, which writes the open iteration's interruption `crash` — the record a rest
  would have left, by another cause — and then resume it as a paused session's continue does. The build takes the
  revision to reach that iteration: it runs unheld, and the run holds before its first new iteration, by the same route
  and whichever continue resumed it (`plan-gate-resume.test.ts`, "left by a crash and resumed by …"). The alternative —
  hold the crash-left iteration at the gate, since the revision's words name only a rest — was not taken, because once
  the crash is recorded nothing in the run tells the two apart, and holding would put the work already under way behind
  a plan cycle that clause 18's continue does not otherwise meet. Because the revision governs only a rest's iteration,
  running a crash-left one unheld under `plan` departs from REQ-ORCH-152 ("In `plan` mode the gate of REQ-ORCH-153
  applies") and REQ-ORCH-153 beyond the revision, as the provenance above states. ADR-0062's amendment and the engine
  glossary's Plan gate entry cite this reading. Recorded at the merged build's review, which found both citing it here
  before it was stated.
- **Any iteration after the resumed one is new.** A resumed iteration that ends `partial` requeues its task
  (REQ-ORCH-073), and the next iteration would take it up again under a new number; that iteration is held too, since the
  directive's line is the iteration, not the task.
- **The answer group is exempt, as at the start of a run.** The intent is the pre-flight's classification of the
  continue — its message, or the last request for the Continue action — and a run whose intent is in REQ-ORCH-021's
  answer group is not held, so whether a run will be held stays answerable without knowing more than at the start.
- **What the plan cycle plans.** It is told the plan request, then that the run resumed the iteration, which has closed,
  and the tasks still pending in the order the run takes them up (the first twenty, the count the handoff shows of its
  todo under REQ-SESSION-115, each cut to 500 characters rather than the handoff's 80, since here a task's text is the
  work to plan and not a display title), then the launch content as the session's context. What it is told of the
  continue's message follows what `PD-ORCH-005` clause 17 made of it: carried out when the resumed iteration succeeded;
  not finished, among the pending tasks and taken up first, when it closed otherwise; and nothing when the resumed
  iteration held no message. The messages meant are every one the resumed iteration held — this continue's, and one an
  earlier continue by message delivered to it before it came to rest again, which a Continue action then resumed — and
  "carried out" is said only when all of them closed done. *The first build told it the message was already dealt with
  in every case, which contradicted the pending list after a `partial` close and after a Continue action (found by the
  lane's second review); the second read only the message this run's own continue delivered, so a Continue action that
  resumed an iteration holding an earlier continue's message was told nothing of it (found by the iteration lane's third
  review).* The pending tasks are what the first new iteration would have selected, so the approved plan is about the
  work it releases. The iteration is said to have been left open, not what left it: a crash-left session's continues
  take the same path as a paused one's (`PD-ORCH-005` clause 18), and the revision's "a rest left open" is the case it
  names, not a line it draws. *The second build said a rest had left it open, which is false on the crash route (found
  by the iteration lane's fourth review).*
- **The handoff after the preamble is the continue's.** The launch content that follows the preamble is the payload
  `Sessions.prompt` or `continueSession` built before `launchContinuation` ran: before the crash was recorded, before
  clause 17 appended the message's task and before the resumed iteration did any work. Its "Authoritative session
  handoff" is therefore stale by the time this plan cycle reads it: its todo shows the resumed iteration's task
  `in_progress` and not the continue's message, its artifact line (clause 20, OQ-106) was read before the resumed root
  published anything, and its progress and recent iterations are from before the close — while the preamble, read from
  the live todo, says that iteration has closed and, when it succeeded, carried the message out. The payload's own
  opening ("Prior session context is authoritative") leaves the role two statements of the todo that disagree. This is
  the staleness OQ-106 reads for a later iteration of the same run ("The handoff is read once"), met here by the first
  turn after the resumed iteration; nothing rebuilds the payload for the plan cycle, and the pending tasks the preamble
  lists are what the approved plan releases. The repair of
  [`every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`](../defects/fixed/every-iteration-is-sent-the-prompt-the-run-was-launched-with.md)
  (2026-09-29) keeps this: it adds an execution iteration's own task after the launch content and rebuilds no
  handoff, and a plan cycle is sent no iteration task. *Until that repair this bullet called the staleness the behaviour
  that defect records; the repair left it, so it stands on this reading and the ruling question below.* Measured in
  `plan-gate-resume.test.ts`, "the plan cycle held after a resumed iteration is sent the handoff the continue built
  before that iteration ran". Recorded at the merged build's tenth review.
- **What the answer launches.** A plan decision's relaunch appends no task: the held run's stored todo already carries
  every task — the gated work, and after this hold the continue's message too, which `PD-ORCH-005` clause 17 made a task
  of its own and closed with the resumed iteration, `complete` or `pending` and taken up first — so appending the last
  request again would duplicate it. *The first statement of this reason said the resumed iteration had dealt with the
  message, which is false after a `partial` close, and after a Continue action, whose last request is an earlier one
  (found by the iteration lane's third review); the behaviour was right and is unchanged.* The same append had made
  every approved prompt a second task, worked twice; that is repaired with it
  ([`a-plan-decision-appends-the-gated-prompt-as-a-second-task.md`](../defects/fixed/a-plan-decision-appends-the-gated-prompt-as-a-second-task.md)).
  The approved run is set up as any run is: the resumed root's persona covered the work already under way (OQ-97), and
  no iteration is open when the plan is decided, so the work after the gate runs as the entry role configured then.
- **A revise is launched as any revise is.** After this hold the run has closed the resumed iteration, so the revise's
  relaunch resumes nothing: its plan cycle is told the plan request, the handoff built for it — whose "Latest user
  request" is the continue's message and whose todo shows that message `complete` (or `pending`) beside the tasks still
  pending — and the plan and the changes the user stated. It is not told `resumedWorkSection` again; the record keeps no
  mark that the hold followed a resumed iteration, and the handoff's todo states the same work.
- **"Continue without them" is unchanged.** It resumes nothing, so its run is held before its first iteration, as any run
  that resumes nothing is.
- **What a cancel leaves.** A plan Cancel at this hold, or a stop or the application's quit during its plan cycle
  (`PD-ORCH-005` clause 15, which pairs the two), leaves the session `paused` with no iteration open, as at any hold.
  When the resumed iteration succeeded, the continue's message — the last user row — is `complete` (clause 17), so the
  next Continue action finds no unfinished task of its text and appends it again beside the pending work (OQ-102 appends
  a completed request as before). The plan cycle that run is held at is asked to plan the message as its latest request,
  and approved, the message is worked a second time. A cancel at a fresh hold does not do this: the gated request's task
  is still pending, so the Continue action appends nothing. OQ-103's "Nothing open to resume" records it beside the other
  routes to the same state, and its ruling question covers it. Measured in `plan-gate-resume.test.ts`, "after the hold
  that follows a resumed iteration, …", for a plan Cancel and for a stop and a quit during the plan cycle. Recorded at
  the merged build's eighth review; the quit, the likeliest of the three (the user closes the application while the plan
  is drafted), at the twelfth. The message-limit pause that wins over this hold (above) leaves the same state at
  `paused_message_limit`: nothing open and the message `complete`, so the resolution's 'continue' and 'double' append it
  again as the Continue action does ("the message-limit resolution's …", in the same file). Recorded at the merged
  build's tenth review.
- **No surface re-arms the gate on a paused session.** The revision holds a resumed run "because the session holds no
  release and the mode is `plan` or the release was re-armed", and the re-arm is the user choosing `plan` on the run-start
  control, which the composer disables on a paused session and in the recovery state (REQ-CHAT-006,
  `CHIPS_DISABLED_STATES`). `Sessions.planRearm` accepts a rested session, so a re-arm before a continue is reached only
  by command, or by a mode chosen before the pause. The build leaves the chip as REQ-CHAT-006 draws it. Found by the
  built-app drive of the merged build, which re-armed through `session.planRearm`.

**What a ruling decides.** Whether the revision's unheld resume reaches an iteration a crash left open once clause 18
has recorded the crash, as built, or only one a rest left, so that a crash-left iteration is held at the gate like a new
one; whether a requeued resumed task should count as work already under way rather than a new iteration; whether the
answer-group exemption should reach this hold; whether the plan cycle should plan only the first pending task or all of
them; whether this plan cycle should be sent a handoff rebuilt after the resumed iteration closed, rather than the
continue's, or be told that the handoff predates that iteration; whether a revise after this hold should be told again
what became of the continue's message; and whether a Continue action after a Cancel, a stop or a quit at this hold, or
the message-limit resolution after the limit won over it, should re-run a message the resumed iteration carried out, as
built, or continue with the pending work alone (with OQ-103's ruling on the same state); and whether the run-start control should offer the re-arm on a paused session.

**OQ-105 — What is an agent's fingerprint taken of, when is it compared, and where is the warning stated?** *(`PD-ORCH-005` clause 14 over OQ-95's reading; REQ-SESSION-029, REQ-SESSION-132, REQ-SESSION-134, REQ-SESSION-135, REQ-ORCH-019, REQ-ORCH-088, REQ-ORCH-095, REQ-WORKSPACE-047, REQ-WORKSPACE-050, REQ-WORKSPACE-058, REQ-WORKSPACE-060, REQ-TOOLS-010, REQ-TOOLS-053, REQ-TOOLS-069, REQ-MCP-101, REQ-CONFIG-166 and REQ-MONITOR-305, which the directive does not name; and REQ-ORCH-139, whose issue-kind vocabulary has no kind for the warning, which the reading below departs from by coining `resumed_under_changed_instructions`. Raised 2026-09-28 by building `PD-ORCH-005` revision 4 under [R-065](../product/requests.md#r-065). Numbered OQ-78 while it was built; renumbered when it reached `main`, where OQ-78 had been taken meanwhile.)*

Clause 14 has each agent's record keep "a fingerprint of the system instructions and the tool definitions the agent
started with", and has the run state, as a warning, which agent resumed under changed instructions when its persona's
current ones differ. It does not say what the instructions are — the persona's own text, or everything the request's
system prompt carries — nor when the comparison is made, how often a warning is repeated, or where the run states it.
REQ-MONITOR-305's warnings surface, where a warning would naturally be listed, is not built.

**What the build proceeds under.**

- **What the request carried.** The fingerprint is two SHA-256 digests (`agent_fingerprints`, v24): the system prompt
  exactly as the agent's first model request carried it — the persona's instructions, its playbook (REQ-ORCH-019), the
  session's context units (REQ-WORKSPACE-060) and the MCP section (REQ-MCP-101) — and the tool definitions that request
  offered (REQ-TOOLS-010), in name order with every object's keys sorted, so the order a listing was assembled in is not
  a change. A digest, not a copy: the instructions are not stored twice (REQ-SESSION-029). The consequence is stated
  here because it is wider than "its persona" alone: a continue whose pre-flight classifies a different intent (a
  different playbook), a skill force-loaded since, a changed MCP server, or a permission mode that changes the listing
  also warns, since each changes what the agent is instructed with or offered. The first is common: every continue
  runs the pre-flight again with its own message (`launchContinuation`), so a continue by message classified as a
  different intent warns for every resumed agent whose role has a playbook, though no persona was edited. The model is
  not part of it.
- **The workspace's own files are in it too.** The context units include REQ-WORKSPACE-047/050's workspace context — the
  instruction files (`AGENTS.md` and the like) merged from the run's execution root, the tree the agents write to — and
  the skill catalog block. So an agent that edits `AGENTS.md` as part of its task changes what every agent resumed after
  it is instructed with, and each is named "resumed under changed instructions: its system instructions differ",
  although no persona changed and the change is the run's own. Whether it is named depends on whether the merge was read
  again: REQ-WORKSPACE-058 holds it per workspace root until a rescan or a session creation clears it
  (`SkillRegistry.workspaceContext`), so a continue in the same process after nothing else happened is still handed the
  cached merge and states nothing, while the same continue after the app is relaunched, or after any session is created
  in that workspace, is handed the edited file and warns for every resumed agent. The warning is true of what the
  request carried in both cases; which of the two the agent is given is REQ-WORKSPACE-058's, not this build's. A lesser
  case of the same kind: `ask_questions` is listed only while the run host holds a live presenter (`userPromptChannel`,
  attendedness under REQ-TOOLS-053/069), so an agent that started during a lapse in the presenter and is resumed with
  one live is named for its tool definitions.
- **The first is kept.** The fingerprint is recorded at an agent's first model step and never replaced. Every resume
  compares against it, so each resume under instructions that still differ warns again; a resume under the instructions
  it started with states nothing.
- **Compared at the resumed execution's first model step**, just before the step goes out, once per execution — after
  the tool port is ready, so an MCP listing is complete. Any later execution of a task id that has a fingerprint is a
  resume (a task id is never executed twice otherwise). REQ-ORCH-088's fallback retry and REQ-ORCH-095's re-prompt run
  within one execution and compare nothing, and neither does a root re-entered with its children's reports, although
  REQ-CONFIG-166 re-reads the context units at every turn: a skill loaded mid-run is not a resume. A resumed root
  waiting on its children is compared when it next steps; one that never steps again never ran under the changed
  instructions and is not named.
- **An agent with no fingerprint** — recorded before v24, or paused before its first model step — has one recorded at
  its resumed first step and nothing is stated (REQ-SESSION-132).
- **Stated as a warning issue and a transcript line.** A `resumed_under_changed_instructions` issue at warning severity
  — a kind coined by this build: the specification's issue-kind vocabulary ("Issue kinds (session diagnostics)" in
  `docs/spec/01-run-orchestration.md`) has none for it — its actor the agent's canonical name, with its timeline entry
  (REQ-SESSION-134/135), and one `system` row in the transcript: "Agent <canonical name> (<task id>) resumed under
  changed instructions: its system instructions | tool definitions | system instructions and tool definitions differ
  from the ones it started with." The issue's metadata carries the task id, the iteration and which of the two changed.
- **Every agent**, the root and every child at every depth, each under its task id and its own iteration (the root's
  iteration number, a child's `children.iteration`). The fingerprint is part of the agent's record for clause 12: it is
  deleted with its session, and the transcript clear removes closed iterations' fingerprints with their conversations
  (`fingerprints_removed` in `transcript_cleared`'s metadata), so an open iteration's are kept however many iterations
  closed before it.

**What a ruling decides.** Whether "the system instructions" should be the persona's own definition only, so a changed
playbook, skill, MCP server, workspace instruction file (one the run's own agents may have edited) or presenter-bound
tool does not warn; whether a warning should be stated once per change (replacing the
fingerprint after a warned resume) rather than at every resume while it differs; and whether the warning should also
reach REQ-MONITOR-305's warnings surface once that is built, or be stated at the continue rather than at the agent's
first step; and what the issue kind is called, since the specification's vocabulary has none for it.

**OQ-106 — Whose root is "the iteration's root" when the handoff is built for an iteration that has not started?** *(`PD-ORCH-005` clause 20 over REQ-SESSION-115, with clause 16 and `PD-ORCH-003` revision 2; REQ-ORCH-153, REQ-ORCH-154, REQ-LIBRARY-092, REQ-LIBRARY-093 and REQ-LIBRARY-096, which the directive does not name. Raised 2026-09-28 by building `PD-ORCH-005` revision 4 under [R-065](../product/requests.md#r-065). Numbered OQ-79 while it was built; renumbered when it reached `main`, where OQ-79 had been taken meanwhile.)*

Clause 20 makes REQ-SESSION-115's artifact "the latest artifact the iteration's root published that nothing supersedes"
and, when the root published none, the latest of any kind. Every continue builds the handoff, including one that resumes
an open iteration, but it reaches a model only when a new iteration starts — a new prompt, a continue that finds nothing
open, "continue without them", the plan gate's approve, or the iteration after a resumed one — since a resumed root is
handed the new message alone; and that new iteration's root has published nothing yet. The clause does not say which
iteration it means. Three further edges meet it: a plan cycle's root (REQ-ORCH-153's iteration 0, never recorded as an
iteration), a root from before the iterations were recorded (v23), and a later iteration of the same run, which starts
from the launch content computed when the run began.

**What the build proceeds under.**

- **The iteration is the most recent recorded one**, open or closed — the highest-numbered row in `iterations`, the
  iteration the new one follows. A publish by an earlier iteration's root counts only as "of any kind". The alternative
  read "the orchestrator" as a role — the latest publish of any iteration's root — and was not taken, because the
  clause names one iteration's root.
- **The root is known by its task id.** A root's publish carries its task id as the artifact's `conversation_id` (its
  own tool port writes it; a child's report and a child's publish carry the child's), and the iteration's row records
  that id. `created_by` is not used: every root records its persona there
  (`a-roots-publish-names-its-persona-as-its-author.md`), so it cannot tell one iteration's root from another's.
- **A plan cycle's root is not an iteration's root.** Its publishes count only as "of any kind"; the approve path
  carries the plan itself in its own section.
- **Work that follows a plan cycle follows no iteration.** A plan cycle is never recorded as an iteration, so on the
  plan gate's approve and revise, and on a prompt after a declined plan, the most recent `iterations` row belongs to
  an earlier piece of work. Taking its root there would hand over that earlier work's document ahead of everything
  the plan cycle produced — its children's reports and the plan its root published — although the new work follows
  the plan cycle, not that iteration. So when the latest plan cycle opened its gate (`plan_cycles.opened_at`) after
  the latest iteration opened, no iteration's root is preferred and the handoff takes the latest of any kind that
  nothing supersedes. A prompt that opens a plan cycle on a re-armed session (`PD-ORCH-003`) is handed the latest
  iteration's root's document, since that plan cycle follows it; and once the approved iteration opens, its root is
  preferred again. The two instants are the session writer's own ISO times, so an equal pair (possible only under
  a stopped test clock) counts the iteration as the later.
- **The plan cycle `PD-ORCH-003` revision 2 holds after a resumed iteration is taken the same way, although it
  follows the same piece of work.** There the premise above does not hold: the most recent `iterations` row is the
  resumed iteration of the run that is still under way, and the plan cycle plans the work it left pending. A resume
  never rewrites `iterations.opened_at` (it records only the interruption's clearing), so that plan cycle always opened
  after the iteration, and the approve or revise relaunch prefers no root: the resumed root's own document counts only
  as "of any kind", and a later record — the plan cycle's own plan, a plan-cycle child's report, or a cancelled
  child's stub from clause 16's at-rest cancel — is handed over ahead of it (the decline writes no such later stub: a
  run that resumed the iteration did not decline it, and an earlier decline wrote its stubs before this iteration
  opened). The build keeps the one
  rule because the new work still follows the plan cycle, whose plan the approve carries in its own section; the
  alternative — prefer the resumed root's publish when the plan cycle was held after that iteration, since both
  belong to one run — was not taken, because the clause names the iteration the new one follows and nothing
  distinguishes the two plan cycles in the record except the order of the two instants. Found by the merged build's
  review.
- **A plan cycle that ended before its gate leaves no mark, so the work after it follows the earlier iteration.** The
  `plan_cycles` row is written only when the run parks at the gate (`SessionWriter.openPlanGate`). A plan cycle
  stopped, quit, crashed or failed before its root answered with a plan leaves none, so the next continuation finds
  the latest iteration the most recent record and prefers its root's document, ahead of anything that plan cycle's
  root or children published, although the new work follows the plan cycle. The code does what the rule above says;
  the rule's premise — that the record shows a plan cycle came after the iteration — does not hold here. The build
  keeps it: nothing in the record says a plan cycle ran, and adding a mark for an unparked cycle is a store change no
  directive asks for. Recorded at the merged build's eighth review, from the record lane's final-round nit.
- **A root with no recorded iteration or no tool port** (before v23, or a run with no tool port) has no publish to
  find, and the handoff takes the latest of any kind. Nothing is backfilled.
- **A root whose every publish is superseded published none.** Only artifacts nothing supersedes are candidates, so
  when a later record (a child's included) supersedes each of the root's publishes, the handoff takes the latest of any
  kind that nothing supersedes. The literal alternative — the root did publish, so the fallback does not apply and no
  artifact is carried — was not taken: it would carry nothing where an unsuperseded artifact stands.
- **The handoff is read once, when the continuation starts its run.** REQ-SESSION-115's handoff is "the payload handed
  to the run", built at the continue, and clause 20's "that nothing supersedes" holds of it then. A later iteration of
  the same run is not a new handoff: it is re-sent the launch content computed at the continue — the base of every
  iteration, which the repair of
  [`every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`](../defects/fixed/every-iteration-is-sent-the-prompt-the-run-was-launched-with.md)
  (2026-09-29) kept, adding only the iteration's own task after it — so **its artifact line can name an artifact
  superseded since, or another agent's where the resumed root published its first artifact after the continue**, as
  its todo and progress lines can be stale. The plan cycle held after a resumed iteration (`PD-ORCH-003` revision 2)
  is sent the same stale payload, whose artifact line was read before the resumed root published anything (OQ-104, "The
  handoff after the preamble is the continue's"). The artifact line is not recomputed alone, and `PD-ORCH-004` revision
  4 adds only the open offers to that first message. *Until that repair this bullet said the payload was re-sent by
  that defect and that its repair, which had to keep the three flows it names, would settle the staleness; the repair
  kept those flows by keeping the payload as every iteration's base, so the staleness stands on this reading and the
  ruling question below.*
- **A cancelled child's stub report counts as "of any kind".** A cancelled agent's report is stored as an artifact
  (REQ-LIBRARY-092), and clause 16 (OQ-101) adds a route that writes one every time: cancelling a `paused` child while
  its session rests. When the iteration's root published nothing, the handoff then carries that stub ("The user
  cancelled this child.") as the authoritative artifact, ahead of every earlier substantive report. This happens on
  "continue without them" and on the iteration that follows a resumed one. The clause's literal text allows it, and a
  live cancel could already do the same. The build does not filter by outcome, because the clause names no outcome.
  Found by the merged build's review.
- **Everything else stands as OQ-99 records it**: "latest" is the listing's order (created time, then id), a
  superseded record is never chosen, and the rendering (id first, 80-character title, a published body stated once,
  6,000 characters) is unchanged.

**What a ruling decides.** Whether "the iteration's root" is the root of the iteration the new one follows, as built,
or any iteration's root of the session, which would carry an earlier iteration's document forward past a later
iteration whose root published nothing; whether work that follows a plan cycle takes the latest of any kind, as
built, or prefers the plan cycle root's own publish, or the root of the last recorded iteration — the reading this
build first took, which handed an earlier piece of work's document over ahead of the plan cycle's; whether the plan
cycle `PD-ORCH-003` revision 2 holds after a resumed iteration of the same run is taken the same way, as built, or
prefers that resumed root's own publish over what the plan cycle produced; whether a plan cycle that ended before its
gate should also stop the earlier iteration's root being preferred, which needs a record of a plan cycle that never
parked; whether a root whose every publish is superseded counts as having published
none; whether a later iteration of the same run should have its handoff's artifact read again when it starts,
rather than be re-sent the one read at the continue, superseded or not; and whether the fallback of any kind should pass
over a cancelled agent's stub report, which clause 16's at-rest cancel writes every time.

**OQ-107 — Which offers is a later iteration's root told, where in its first message, and which roots count?** *(`PD-ORCH-004` revision 4; REQ-ORCH-088, which the directive narrows, REQ-TOOLS-152, which it extends, and REQ-SESSION-115, REQ-SESSION-194, REQ-ORCH-067, REQ-ORCH-072 and REQ-ORCH-153, which it does not name. Raised 2026-09-28 by building `PD-ORCH-004` revision 4 under [R-065](../product/requests.md#r-065). Numbered OQ-80 while it was built; renumbered when it reached `main`, where OQ-80 had been taken meanwhile.)*

Revision 4: every root that may take up an open offer "SHALL be told of it, once", and among them "the root of each
later iteration of the same run, in that iteration's first message". It does not say whether "once" is per root or per
offer, where in the first message the list sits, what a later iteration of a continuation run is told beside the
handoff it is re-sent, or whether a plan cycle's root is such a root.

**What the build proceeds under.**

- **Once per root.** Each iteration's root is a different agent, so the root of iteration 2 is told an offer even
  though the root of iteration 1 was. A root is told an offer once: the list is part of its first message, so its
  record holds it, and a continue that later resumes that root finds it there (`offersToldIn`) and does not tell it
  again.
- **The same rule for every execution root.** The first message of every execution iteration's root carries the open
  offers — every offer of the session no child has taken up, not a subset by iteration — that the message's launch
  content does not already hold. The root of a new session's first iteration has none to be told. A continuation's
  first iteration reads them all in its handoff and is told nothing more. Each later iteration of the same run is told
  those raised since, including any a resumed first iteration raised.
- **An offer a held list left out is held.** A list names the newest ten and, when there were more, says the earlier
  ones were left out; that is the whole of what the directive tells a root, so an offer a list left out is not named
  again in a second list beside it. An offer a list could not have named — raised since it was built — is still told,
  the newest ten of those with the same elision line, whichever child raised it and however early it was spawned.
  - *In an iteration's first message.* The session manager passes the run the offers open when the payload's handoff
    was built (`handoffOffers`), and those are held: the handoff covers them, named or left out.
  - *At the continue that resumes a root.* The record keeps the lists, not what each covered, so an offer is held by a
    list recorded as a message when its child was spawned before the oldest offer that list names and the record shows
    it raised — its child ended, `completed_at` — no later than the list was recorded; an offer with no end recorded
    counts as raised before. An offer raised in the same millisecond a list was recorded counts as held by it. A list a
    compression carried into the conversation holds only what it names, as a compression's summary of a list holds
    nothing (OQ-99).
  - *The first repair counted every offer spawned before a list's oldest line as held, and only in the first message:
    the continue that resumed a root named the offers its list had left out, and an offer raised after a handoff was
    built by a child spawned early was never told to any later root of the run (found by the iteration lane's second
    review).*
- **Where.** A text part of its own after the launch content — its text and any attachments — in the same first user
  message, so the root reads it as part of its task. It is the same list, header, lines, newest ten and elision line
  as the handoff's and the resumed root's, so a later reader recognises it.
- **The re-sent handoff is left as it is.** A later iteration of a continuation run is re-sent the payload built at
  the continue, whose list can name an offer taken up since (OQ-106's "The handoff is read once", which the repair of
  [`every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`](../defects/fixed/every-iteration-is-sent-the-prompt-the-run-was-launched-with.md)
  kept; *until that repair this bullet called it the behaviour that defect records*). Those lines are not rewritten; an offer the payload already names is not named again, and one taken up since
  is refused at admission with "already continued by".
- **A plan cycle is told none.** A plan cycle is not an iteration (REQ-ORCH-153) and its root takes up no offer
  (OQ-99), so neither a plan cycle at a run's start nor one held after a resumed iteration (`PD-ORCH-003` revision 2)
  has the list added; a continuation's plan cycle still reads the handoff's list, as before.
- **The root's execution record keeps its task.** REQ-ORCH-072's task payload on the root's record is the task string,
  as before; the list is in the conversation record only.

**What a ruling decides.** Whether "once" means once per offer across the run, so a root whose predecessor in the same
run was told an offer is not told it again; and whether the stale lines of a re-sent handoff should be rewritten rather
than left beside a fresh list.

**OQ-108 — What does the audit of clause 15, clause 19, PD-CHAT-001 revision 4 and PD-CHAT-002 revision 2 leave undecided?** *(`PD-ORCH-005` clauses 3, 9, 11, 15 and 19 (revision 4), clause 15's "whichever surface asks it" being departed from on one surface by OQ-101's reading; `PD-CHAT-001` revision 4, "The strip" and "The paused continues"; `PD-CHAT-002` revision 2; REQ-TOOLS-063 and REQ-CHAT-029, which `PD-ORCH-005` narrows, REQ-CHAT-005, which `PD-CHAT-001` narrows, and REQ-CHAT-101, which `PD-CHAT-002` narrows; REQ-TRACE-464, which the reading below departs from; and REQ-CHAT-021, REQ-CHAT-169, REQ-MONITOR-004, REQ-MONITOR-131, REQ-SESSION-186, REQ-TRACE-469 and REQ-SHELL-075, which the directives do not name. Raised 2026-09-28 by building `PD-ORCH-005` revision 4, `PD-CHAT-001` revision 4 and `PD-CHAT-002` revision 2 under [R-065](../product/requests.md#r-065). Numbered OQ-81 while it was built; renumbered when it reached `main`, where OQ-81 had been taken meanwhile.)*

Most of what these rulings decide was already built under OQ-96 and OQ-98's readings. The audit found one behaviour the
text contradicts: a board run caught by the application's quit came to rest by `stop`
(`docs/defects/fixed/a-board-run-caught-by-a-quit-rests-as-a-stop.md`). It also found two strings the rulings fix:
`/stop`'s description and the paused continue's `Send`. What the text leaves open concerns a plan cycle's waits at a
stop, the literal reach of "no other control stands outside the dock", REQ-TRACE-464's word "cancel", and a few names
the build kept.

**What the build proceeds under.**

- **A wait inside a plan cycle at a stop or a quit.** Clause 15 says a stop or a quit during a plan cycle "ends the
  cycle's agents and records no interruption". Its last bullet, which it decides "in each case", has the quit withdraw
  an approval its dialog closes (clause 9), and PD-CHAT-002 revision 2 has the quit withdraw a question. Neither makes
  an exception for a plan cycle, and a withdrawal names its own cause, apart from the agents' and the iteration's
  interruption. So an approval or a question pending in a plan cycle when the quit lands is **withdrawn by `quit`**
  (`Run.waitsWithdrawnBy`, which reads the stop request alone and never the plan hold, so the waits' release does not
  depend on when a plan cycle holds the run), while the cycle's agents still end `cancelled` and nothing records an
  interruption. The
  text decides the quit; the build reads the stop the same way, because clause 9 names the stop beside the quit and
  clause 15 puts the two together for a plan cycle: a wait pending in a plan cycle when a stop lands is withdrawn by
  `stop`. The explicit cancel still cancels it (clause 3: it is final), and so does a stop the run raised itself. *The
  first reading built, and superseded in the same round by the review: the pending wait was cancelled
  (`cancelPending`), on the ground that "a withdrawal is recorded by the interruption that caused it, and a plan cycle
  records none". That ground confused the wait's cause with the agents' interruption, and the directive's words govern
  the quit's case.* A stop or a quit at a *parked* gate has no turn in flight and nothing waiting.
- **A stop during a plan cycle, as the session shows it.** The cycle's agents end `cancelled` with their reports, no
  iteration row exists, and `plan_released` stays 0, so the next prompt or continue is held again. The session persists
  `paused` (REQ-SESSION-186's persisted status for a stop). Its result's summary reads "The run came to rest because a
  person stopped it.", because the summary is classified from the stop reason alone. Both are kept. The status is what
  a stop persists, and the wording describes the run, not an agent left to resume.
- **"No other control stands outside the dock."** The sentence governs the run-state notices it names and the strip's
  input controls. Three controls outside the dock and outside the notices row stay where they are, because each
  belongs to a surface the directive does not name: REQ-CHAT-021's "Command not run" notice with its dismiss, above the
  dock; the refusal line with "Open project setup", above the dock; and REQ-CHAT-169's attachment list with its Remove
  buttons, below the dock.
- **The names the build kept.** `/stop` is offered as "Stop the active run" and still sends the control op `cancel`,
  which is REQ-MONITOR-004's enumeration. The op is not renamed, and REQ-CHAT-029's "MUST cancel that run" is read
  through clause 15's narrowing. The paused strip's continue by message draws its own accessible name ("Continue with
  a message") and shows `Send`. The send pill's `sendName` arm for a paused session, which the strip never draws, is
  left as it stands. `PD-CHAT-001` revision 4 gives the word's source as "the send pill it stands in for", but the
  built pill never shows `Send`: its visible word is `Run`, `Continue` (any existing session at rest, a paused one
  included) or `Queue` (`sendShortLabel`, REQ-CHAT-005). The build draws `Send` because the directive names it, and
  reads the stated source as the directive's rationale rather than a rule that would make the word `Continue`.
- **"Whichever surface asks it" — one surface it does not reach.** Clause 15 makes every confirmed "Cancel the run?"
  clause 3's explicit cancel, whichever surface asks it. A persona window on the run's own instance offers Cancel
  always (REQ-SHELL-075(g)) and, while the session rests, asks "Cancel the run?" of a root drawn `paused`; the engine
  refuses the cancel with no run behind the session, and the window states "The run is no longer cancellable." So on
  that one surface, at rest, the confirmed question cancels nothing. The departure, its reason and its ruling question
  are OQ-101's ("Where it is offered").
- **The board's quit.** Main's board coordinator ends its runs at the last window's close with the run host's
  `announceShutdown` (REQ-MONITOR-131's shutdown request), renamed `quitAll`, rather than the stop control's `cancel`.
  A stop request keeps its first reason, so the `cancel` sent ahead of the run host's `shutdown` rested the run by
  `stop`. REQ-TRACE-469's unlimited approval wait is still released at once, withdrawn by the quit. REQ-TRACE-464 says
  "Closing the application SHALL **cancel** the run rather than leave it orphaned", and `PD-ORCH-005`'s Narrows list
  does not name it. The build reads the requirement's guarantee as the clause's own last words — the run is ended, not
  orphaned — and ends it as every quit ends a run, clause 3's quit: its agents rest `paused`, its iteration stays open,
  and a later continue resumes it. The word "cancel" is not met literally, and was not before the repair either (the
  stop's `cancel` rested the run by `stop`); nothing met it as the explicit cancel. So this is a departure from a
  requirement no directive names, and a back-pointer is owed: either `PD-ORCH-005` names REQ-TRACE-464 among what it
  narrows, or a ruling has a board run cancelled explicitly at the quit.

**What a ruling decides.** Whether a stop during a plan cycle, which the text leaves to clause 9, should withdraw its
pending approval or question as a quit does (the build) or cancel it. Whether REQ-TRACE-464's "SHALL cancel" is narrowed
by clause 3's quit, which would add it to `PD-ORCH-005`'s Narrows list, or a board run is cancelled explicitly at the
quit, final and never resumed. Whether a persona window's "Cancel the run?" at rest should decline the open iteration
as clause 15 reads, or be withheld (OQ-101). Whether the "Command not run" notice and the refusal line should
move into the notices row, a layout change. Whether a stop during a plan cycle should persist a status and a summary of
its own rather than a stop's `paused` and "came to rest".

**OQ-109 — Does a `code_intelligence` entry configured `enabled: false` still make `code-intelligence-setup` applicable?** *(REQ-WORKSPACE-090, REQ-MCP-037, REQ-CONFIG-465, REQ-MCP-040, REQ-WORKSPACE-083. Raised 2026-09-28 by the repair of [`plan-gate-proof-turns-code-intelligence-off-with-a-key-nothing-reads.md`](../defects/fixed/plan-gate-proof-turns-code-intelligence-off-with-a-key-nothing-reads.md), under [R-062](../product/requests.md#r-062). Raised as OQ-94 on its branch and renumbered at the merge, OQ-94 to OQ-108 having been taken on `main`.)*

REQ-WORKSPACE-090 makes the initialization task applicable exactly when the resolved configuration holds a server
named `code_intelligence` that is launchable, "judged by the one availability rule REQ-MCP-037 fixes", and it forbids
this domain a second rule. REQ-MCP-037's rule looks at the transport and the command, and never at `enabled`. So a
workspace whose entry is disabled still has the task pending on first open, and still runs the bundled runtime's
`project create` in the background. Measured in `plan-gate-proof` on Linux, 1.8 to 10.4 s of work for a server no run
will connect to. REQ-CONFIG-465 says of a disabled entry that "no connection to it is attempted". The setup launches
the runtime's own command line, not a connection to the server, and so falls outside that sentence's letter. Two
readings:

- **availability alone** — `enabled` does not enter applicability. A disabled entry's workspace is still set up, so
  enabling the entry later finds the project ready. This is the letter of REQ-WORKSPACE-090 and REQ-MCP-037.
- **enabled and available** — a disabled entry makes the task inapplicable, like an unlaunchable one. Nothing runs for
  a server the user turned off, which is the spirit of REQ-CONFIG-465 and REQ-MCP-040's "turning a server off is a
  choice". But it is a second input to a rule REQ-WORKSPACE-090 says has only one.

**What the build proceeds under:** the first reading (`apps/desktop/src/run-host/mcp.ts`, `setupApplicable`), because
it is the one the requirements state. The proofs that disable the entry to keep run starts short are unaffected,
because the setup does not delay a run start. **A ruling would decide** whether `enabled: false` is part of what
"launchable" means for this task.

**OQ-110 — Which retries come first when a model call fails: the dispatch layer's, or the ladder's?** *(REQ-CONFIG-086, whose `num_retries` "overrides the dispatch layer's default of **5**"; REQ-ORCH-091 (c), the suspended wait on a 429 without Retry-After, with its `model_wait` issue; REQ-ORCH-092, the transient budget (default 1), its delay min(2.0, n) and its `transient_llm_error` issue; REQ-SESSION-142, the session log. Raised 2026-09-29 from the first live run's finding L3 under [R-067](../product/requests.md#r-067), and ruled in the same entry. Raised as OQ-109 on its branch and renumbered at the merge, OQ-109 having been taken on `main`.)*

In the live run of 2026-09-29 (pack `2026-09-29T02-41-56-779Z`, scenario `faults-ladder`, session `474a2d22`) the
recording proxy answered one completion 429 and the next 500. Both were retried inside the model client by the SDK's own
backoff — the 429 at +2.0 s, the 500 at +4.0 s — because `packages/model/src/ai-sdk-client.ts:242` passes
`maxRetries: req.retries`, and the run's `modelRetries` is 5 (`packages/engine/src/run/run.ts:89`). The ladder
(`run/ladder.ts`) was never reached: the session has no issue row, its timeline holds only `run_start` and `run_end`,
and its session log says nothing of either failure. Read alone, REQ-ORCH-091 (c) has a 429 wait 60 s and record a
`model_wait` issue, and REQ-ORCH-092 has a 500 retried once after 1 s and recorded as `transient_llm_error`; REQ-CONFIG-086
has a dispatch layer that retries five times by default before either sees the failure. The 2026-09-22 row of
`first-executions.md` read the same traffic as the ladder recovering.

**Ruled 2026-09-29 — as the specification states the two layers, [R-067](../product/requests.md#r-067).** The owner took the
recommendation. The dispatch layer's retries (REQ-CONFIG-086's `num_retries`, default 5) come first, and the ladder
(REQ-ORCH-091/092) takes over when they are exhausted; nothing is added to the ladder, and neither requirement is
amended. So that an absorbed retry is diagnosable, each retry the dispatch layer absorbs SHALL be written to the session
log (REQ-SESSION-142) with the status it met and the delay it waited. The 2026-09-22 row of `first-executions.md` is
corrected in place, its falsified reason kept beside the replacement, and the live run's ladder check is to say what it
can see: that the run survived the refusals, not that the ladder handled them. Nothing is built by the ruling; the
session-log line is owed to the note that records L3, and the check to the note that records H3.

**OQ-111 — Which part of a long child's transcript does the report summariser read?** *(REQ-ORCH-110, which caps the transcript the report-producing pass is given at 12,000 characters in total and 2,000 per event, and does not say which part is kept; REQ-ORCH-108, which has parents consume the report in place of the transcript; REQ-ORCH-109, whose runner-owned fields the summariser cannot write; `PD-LIBRARY-001`, the report's commands. Raised 2026-09-29 from the duress live run's finding D1 under [R-067](../product/requests.md#r-067), and ruled in the same entry. Raised as OQ-110 on its branch and renumbered at the merge, OQ-109 having been taken on `main`.)*

`packages/engine/src/children/report.ts` builds the pass's transcript by joining the events and cutting the result to
12,000 characters from its head (`transcriptText`, line 79). In the duress live run of 2026-09-29 (pack
`2026-09-29T03-06-14-929Z`, session `379f1490`) the request that summarised child `d` was 12,388 characters and ended
`… [63288 characters omitted]` before `d`'s first edit. Five of the seven stored reports contradict their own
deterministic `edited_files`: `a` "did not write the documentation file", `c2` "does not show the creation of
docs/overview.md", `d` "shows no edits to the documents", `e` "No write to docs/decisions.md was observed", `d2` "shows no
document writes". `d`'s artifact read "No write or edit tool calls … are shown" directly above its own "Edited Files"
list, and it was the first thing the continuation `d2` read.

**Ruled 2026-09-29 — [R-067](../product/requests.md#r-067).** The owner took the recommendation. Within REQ-ORCH-110's
12,000-character cap, the transcript the summariser reads keeps its **start** — the task as given — and its **most
recent part**, with the omission marked between them, stating how much was left out. The pass is also given the
report's deterministic facts — the files the child edited, the commands it ran and their outcomes — so a report never
denies work the record shows. REQ-ORCH-110 fixes how much and not which part, so the ruling fills a silence and amends
nothing; the facts are what REQ-ORCH-109 already keeps runner-owned, given to the pass to condense and never to
overwrite. Nothing is built by the ruling; the repair is owed to the note that records D1.


**OQ-112 — May `delegate` give a `write_scope` to a persona that holds no file-writing tool?** *(`PD-TOOLS-006` over REQ-TOOLS-152; REQ-ORCH-095, whose text-only completion let the child end `succeeded`. Raised 2026-09-29 from the duress live run's finding D6 under [R-067](../product/requests.md#r-067), and ruled in the same entry. Raised as OQ-111 on its branch and renumbered at the merge, OQ-109 having been taken on `main`.)*

`PD-TOOLS-006` validates a `write_scope`'s patterns — empty, absolute, outside the root — and says nothing of the persona
that declares it. In the duress live run of 2026-09-29 (pack `2026-09-29T03-06-14-929Z`, session `379f1490`, tool call
#24) the orchestrator delegated `c: write docs/overview.md` to `codebase-analyst`, whose granted tools are read-only, with
`write_scope: ["docs/overview.md"]`. The call was accepted (`queued`). The child ran for 2 min 47 s, answered that it had no
file-writing tool, and its report read `succeeded` — REQ-ORCH-095 lets a text-only ending succeed after its one
re-prompt. The orchestrator then commissioned `c2` for the same file. The scope claimed a path nobody the claim protected
could write, and fenced the parent and every sibling out of it meanwhile.

**Ruled 2026-09-29 — by [`PD-TOOLS-006`](../product/directives.md#pd-tools-006) revision 3, [R-067](../product/requests.md#r-067).** The
owner took the recommendation. A delegation carrying a `write_scope` to a persona that holds no file-writing tool —
neither `write_file` nor `haet_edit` (with its alias `haet`) — is refused beside REQ-TOOLS-152's other refusals: status
`rejected`, before any record is created and with no task id. Its reason says that the persona cannot write files and,
where the persona catalogue shows any, names the personas that can. A persona's tools are the ones it would be granted
for the child, after REQ-TOOLS-006's controls. REQ-TOOLS-152 is narrowed by `PD-TOOLS-006`, and its back-pointer is
amended in place. REQ-ORCH-095 is untouched: a child with no scope that answers in text still ends as that requirement
says. Nothing is built by this ruling; the finding's note is D6's in `docs/defects/`.

**OQ-113 — When does REQ-LIBRARY-092's materialisation fall back to the canonical agent name?** *(REQ-LIBRARY-092, "idempotent keyed on the task id (falling back to the canonical agent name)", and its "Every terminal child report is materialized"; REQ-SESSION-115's handoff artifact as `PD-ORCH-005` clause 20 chooses it. Raised 2026-09-29 from the open note under [R-067](../product/requests.md#r-067), and ruled in the same entry. Raised as OQ-112 on its branch and renumbered at the merge, OQ-109 having been taken on `main`.)*

`materialiseChildReport` (`packages/engine/src/artifacts/store.ts:322`) looks the artifact up by the child's task id
and, when that finds none, by its canonical name. A child of a later iteration whose name repeats an earlier child's
finds the earlier report's artifact by name and rewrites it in place: the earlier report's summary, findings and status
are replaced by the later child's, while the record keeps the earlier child's task id and creation time
([`a-reused-canonical-name-overwrites-an-earlier-iterations-report-artifact.md`](../defects/a-reused-canonical-name-overwrites-an-earlier-iterations-report-artifact.md)).
The requirement's parenthesis does not say when the fallback applies. Read as "when the task-id lookup finds nothing",
two children with different task ids share one artifact, and the earlier child's report is no longer materialized,
against the same requirement's next sentence.

**Ruled 2026-09-29 — answered by amendment, [R-067](../product/requests.md#r-067).** The owner took the recommendation:
materialisation falls back to the canonical name only for a record that carries no task id, and two children with
different task ids never share or overwrite an artifact. The requirement disagreed with itself under the reading built,
so it is corrected in place rather than narrowed by a directive: `REQ-LIBRARY-092`'s parenthesis now says when the
fallback applies, with the inline mark "accepted amendment 2026-09-29, OQ-113", and domain 14's resolution record
carries the note. Nothing is built by the ruling; the repair is owed to the note above.

**OQ-114 — Do the specification's fixed figures still hold when the model on the critical path reasons before it answers?** *(REQ-ORCH-108 and REQ-ORCH-110, the report-producing pass before the parent resumes, two attempts within 120 s; REQ-ORCH-007 and REQ-ORCH-008, the 12.0 s intent bound and its fallback; REQ-TOOLS-006, whose `coordinator_only` control removes the orchestrator's terminal; REQ-CONFIG-467 and REQ-ORCH-104, the 2.0 s loop-classification bound and its fallback; REQ-LIBRARY-127 and REQ-CONFIG-118, analysis cancelled at shutdown and its 60 s bound; REQ-TOOLS-039 under REQ-TOOLS-033, the recursive-delete deny rule; `PD-ORCH-004` revision 2, "nothing of the continued child is injected". Raised 2026-09-29 from the live runs' frictions F1 to F5 and the duress run's continuation under [R-067](../product/requests.md#r-067). Open. Raised as OQ-113 on its branch and renumbered at the merge, OQ-109 having been taken on `main`.)*

The live runs of 2026-09-29 ran the built product against the owner's self-hosted endpoint (`qwen3.8-flash-next`, a
model that reasons before it answers; packs `2026-09-29T02-41-56-779Z` and `2026-09-29T03-06-14-929Z`). The product met
each requirement below as written, and each written figure cost the run time or tokens on its critical path.

- **The report summariser (F1).** Every child's report waits on a summarising call before its parent resumes. Summariser
  time on the critical path: `edit` 47.0 s; `requirements` 60.0 s and 39.2 s; `frictions` 40.8 s; `terminal` 9.7 s and
  33.9 s — 230.6 s of the 1,182.0 s wall clock of the four delegating runs (19.5 %). Each summary is a short JSON and
  took 647 to 3,430 output tokens, most of them reasoning. In the duress run seven summaries took 172.8 s, and 8,743 of
  their 10,838 output tokens were reasoning.
- **The intent bound (F2).** The pre-flight classification waited 3.5, 12.0, 10.2, 8.0, 4.5, 5.9 and 12.0 s (56.1 s in all)
  and ran into its 12 s bound twice, taking REQ-ORCH-007's fallback (`moderate_feature`); each answer took 207 to 1,641
  output tokens for three fields. The same bound was raised from 8.0 s under ESC-35 for a slow first token; here the
  cost is the reasoning. And the orchestrator holds no terminal (REQ-TOOLS-006): asked to run `node --test` itself, it
  told the user to run it.
- **The loop-classification bound (F3).** The 2.0 s bound cannot be met by this model: one classification took 8.5 s and
  610 output tokens, and in the duress run the classifier answered `"loop_detected": false` 23 s after the fallback had
  already declared a loop on counts (recorded as D3, a defect of the fallback's own).
- **The improvement analysis (F4).** No post-run analysis completed in either run: `improvement_artifacts` holds no row.
  Each scenario quit within 3 s of its run ending, and REQ-LIBRARY-127 cancels an analysis in progress at shutdown; the
  six analyst calls took 22 to 134 s at the endpoint, three of them beyond REQ-CONFIG-118's 60 s bound.
- **The recursive-delete rule (F5).** The starter deny rule refused `rm -rf /tmp/mut` on a scratch path outside the
  workspace (`edit`, tool call #38), as REQ-TOOLS-039 states it.
- **The continuation that starts from nothing.** `PD-ORCH-004` gives a continuation no part of the continued child, and
  the duress run's continuation `d2` of the cut-off `d` made 34 reads before its first edit — 6 min 40 s of its 515 s —
  re-deriving what `d` had known, beside a report whose summary denied `d`'s edits (OQ-111).

**What the build proceeds under.** Every figure as written; nothing here is a defect of the code.

**What a ruling decides.** Whether any of these figures or rules should change for a model of this kind — for example
whether the summarising pass may run off the parent's critical path or be skipped where the report's deterministic facts
suffice, whether the intent and loop-classification bounds should scale with the model's measured latency or request no
reasoning, whether an analysis in progress may finish within a bound after the last window closes, whether the
recursive-delete rule should admit a scratch directory, and whether a continuation should be given its predecessor's
record or report beyond the offer. Each is a change to a requirement or a directive that states the behavioural target
or the owner's choice, so each would be a directive or a revision, not a repair.

**OQ-115 — Should the bundled code-intelligence server's tool descriptions reach the system prompt verbatim?** *(REQ-MCP-101, which renders each tool's description text in the persona's MCP section; REQ-MCP-015, which puts usage-instruction retrieval in the READ tier every persona carrying the server holds. Raised 2026-09-29 from the first live run's finding L8 under [R-067](../product/requests.md#r-067). Open. Raised as OQ-114 on its branch and renumbered at the merge, OQ-109 having been taken on `main`.)*

`packages/config/src/mcp/prompt.ts:29` renders each server tool's description as REQ-MCP-101 requires, and the bundled
server's usage-instruction tool describes itself imperatively ("IMPORTANT: If you have not yet read the manual, call this
tool immediately …"; bound as `initial_instructions` in READ by
`packages/config/src/mcp/code-intelligence-manifest.generated.ts:36`). Every agent's system prompt carries it, and agents
obey it. In the live run of 2026-09-29 it was called three times — the orchestrator's first call in `requirements`
(2,188 ms), the verifier in the same session, and a child in `frictions` (2,244 ms) — and again by the orchestrator and
one child in the duress run. Each call returns 7.1 to 7.5 thousand characters, which every later request of that agent
re-sends: 33 requests in the first run, about 60,000 input tokens. The instruction also moves each agent's first step
onto a manual about a tool it may not need.

**What the build proceeds under.** REQ-MCP-101 as written: the description rendered verbatim. No requirement lets the
product rewrite a server's own description, and REQ-MCP-015 grants the tool.

**What a ruling decides.** Whether the product may substitute its own description for a bundled server's tool (a
product-owned override the manifest carries), whether usage-instruction retrieval should leave the READ tier or the
built-in grants, or whether the cost stands. Each departs from REQ-MCP-101 or REQ-MCP-015, which state the target.

**OQ-116 — Is a run's displayed tool-call total the persisted one while a long pass is still running?** *(REQ-ORCH-097, which accumulates per-child tool-call counters "after each successful execution pass"; REQ-MONITOR-102, which persists a session-wide total and has a displayed total be the persisted value. Raised 2026-09-29 from the duress live run's finding D4 under [R-067](../product/requests.md#r-067). Open. Raised as OQ-115 on its branch and renumbered at the merge, OQ-109 having been taken on `main`.)*

The root's calls are added to the persisted total after its turn returns, and a child's when it settles
(`packages/engine/src/run/run.ts`, `packages/engine/src/children/orchestration.ts`). In the duress run of 2026-09-29 (pack
`2026-09-29T03-06-14-929Z`, session `379f1490`) the root's one execution pass lasted the whole 40-minute run: at the
deadline `sessions.tool_calls` read 240 against 309 `tool_calls` rows — the orchestrator's 54 and the running child
`f`'s 15 missing, `f`'s own `children.tool_calls` 0 — and the autopsy's header said 240 above a per-tool breakdown summing
to 309. REQ-ORCH-097's "after each successful execution pass" is met to the letter, and a surface following REQ-MONITOR-102
shows a figure 69 calls behind the record for as long as the pass lasts. The crash half of the same finding — calls made
before a crash that never reach the total — is a defect of its own,
[`a-roots-calls-before-a-crash-never-reach-the-session-total.md`](../defects/a-roots-calls-before-a-crash-never-reach-the-session-total.md).

**What the build proceeds under.** REQ-ORCH-097 as written: accumulated at the end of each pass.

**What a ruling decides.** Whether the counters are accumulated as each call completes, so the displayed total follows the
record during a pass, which would amend or narrow REQ-ORCH-097's timing; or whether the lag stands and the surface says
the total is as of the last completed pass.

**OQ-117 — What is an iteration told of a task it takes up that is not the run's own, and with what?** *(REQ-CHAT-040, whose queued prompt becomes a task "carrying the prompt text as its content"; REQ-ORCH-004 and REQ-ORCH-135, whose task a resumed session carries on and "stays anchored"; REQ-ORCH-072, which gives the root execution record "the task's execution payload"; REQ-CHAT-090 and REQ-CHAT-091, which let the user rename a task; and `PD-ORCH-005` clause 17 with OQ-102, whose message is told in words of its own. Raised 2026-09-29 by the repair of [`every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`](../defects/fixed/every-iteration-is-sent-the-prompt-the-run-was-launched-with.md) under [R-067](../product/requests.md#r-067). Open.)*

No requirement says what an iteration's first message holds when the task it selected is not the one the launch
content states: a queued prompt (REQ-CHAT-040), a task a pause, a stop or a death put back and a later message's run
takes up (REQ-ORCH-135), a task after a plan decision's gated one, or an improvement run's proposal (REQ-LIBRARY-059,
whose launch prompt lists every proposal). The recorded defect sent such an iteration the launch content alone, so the
task was marked done without ever reaching a model.

**What the build proceeds under.**

- **The launch content is the base, and the task follows it.** Every execution iteration's first message is the launch
  content — which keeps the three flows the defect named: the approved plan, the executor's instructions and the
  continuation's handoff — then, when the selected task is not the run's own (`RunDeps.taskId`) and its text is not the
  launch content's request, a text part naming it the task to work on: "The task for this iteration is the task below,
  from the session's todo. Work on it now. What precedes it is what this run was launched with: read it as context, and
  leave any other work it asks for to its own task." followed by the task's text. The words are the build's; a
  continue's message keeps OQ-102's. The alternative — the task's text alone, in place of the launch content — was
  tried and reverted in `PD-ORCH-005` phase 2, because it loses all three flows.
- **A task of the same text as the launch content's request is told nothing more**, whichever task it is: the Continue
  action that restates a pending request, a plan decision's gated request, or a queued prompt that repeats the launch
  prompt word for word. The launch content already states it.
- **The run's own task is told nothing more even when the user renamed it** (REQ-CHAT-091): its iteration is sent the
  launch content, which still states the request as it was sent.
- **Only the task's text is sent.** A task holds its text only, so a request put back and taken up by a later run is sent
  without the images its prompt carried, as OQ-102 reads for a message.
- **The handoff is not rebuilt** (OQ-104, OQ-106).

**What a ruling decides.** Whether the product should word the task part otherwise, or name a queued prompt as
REQ-CHAT-040's "Queued Prompt: <id>"; whether a task that repeats the launch content's request should still be told it;
whether a renamed own task should be sent its new text; and whether a task taken up by a later run should carry the
images its prompt was sent with, which needs a task to hold them.

## Design-reference dependencies

The approved visual design reference was **not available** to the architects who produced the slice
proposals. Every proposal is therefore about *mechanism* — where state lives, what crosses a process
boundary, what paints a row, what a preference is written to. No mechanism above depends on the
reference, but **no screen can be built without it.**

> **Disposition, 2026-09-02 (owner ruling GD-1).** Both halves of that sentence are acted on rather than
> only the convenient one. The reference is **not a condition of the Architecture Gate**, because the gate
> is about mechanism and the independence stated above was established by the architects rather than
> assumed. It **is** a condition on building any screen, and that is recorded as IC-2 in
> `implementation-conditions.md` so it binds something rather than lapsing into nobody's. OQ-30 and the
> three items below it stay open and stay the reference's. OQ-31 was removed from this list and ruled
> without the reference; see its entry.

*Priced by Part T″, 2026-09-11 (`pnpm terminal-stream-proof`, the `obligation2` ladder).* At the licensed
rate of 50 frames/s per stream, with the delivered rate capped at `REQ-MONITOR-306`'s 1,000/s by merging: **twenty
background sessions alone offer exactly 1,000 deliveries a second, the whole aggregate**, before one of
`REQ-MONITOR-285`'s twenty agent streams is counted; the shipped ~40 offer 2,000/s and merge 2,960 frames over
three seconds; 400 streams offer 20,000/s, 1,000 streams 50,000/s, 3,000 streams 150,000/s. **Nothing is dropped at
any count** — the cap merges, as `REQ-SHELL-103` requires — so what the count buys is staleness, and the
staleness has a law: while `streams × windows ≤ 1,000` it is bounded by the drain's own one-second period (at
most 1,000 ms, about 500 ms in the median, whatever the count), and above that it is
`streams × windows ÷ 1,000` seconds (three thousand streams measured 3,000 ms worst and 1,500 ms median).
**So a stated maximum M would let the worst-case surface staleness be computed rather than absorbed:
`(agents + M) × windows ÷ 1,000` seconds.** That is what ADR-0021's "Revisit if" says a ceiling would buy.
The owner's call; recorded, not resolved.

**OQ-30 — Theme palettes and token values. CLOSED 2026-09-04 by the IC-2 implementation and rendered-pixel
proof.** *(ADR-0050; `spikes/theme-proof.md`.)* `REQ-SHELL-129` fixes the default theme's shell
metrics and token groups and `REQ-SHELL-133` fixes what each built-in theme's description must convey,
**but the palettes themselves are not specified anywhere in `docs/spec/`**. They come from the design
reference. ADR-0050's mechanism — themes as data, corrections computed, contrast asserted from rendered
pixels — is independent of the values. Nocturne now lowers every ground stop in the adopted hue system;
High Contrast uses near-black grounds, near-white text and strengthened boundaries. Those authored values
remain owner-replaceable through the same mechanism. All six acceptance items passed from built-app pixels in
three themes at five scale factors, and the two named counterfactuals failed at their asserted item.

**OQ-31 — Which Markdown dialect is rendered. CLOSED 2026-09-02 by owner ruling GD-1, and closed without
the design reference.** *(ADR-0051.)* `REQ-CHAT-056` named five treatments and required links to be
activatable; nothing said whether tables, task lists, block quotes, headings or images were supported. The
entry recorded this as "as much a visual question as a functional one" and therefore blocked on the
reference. **That framing was wrong, and the reason it was wrong is worth keeping**: the supported element
list fixes what the transcript renderer accepts from model output, which makes it a question about the
renderer's surface rather than about appearance, and the entry's own last sentence — that images interact
with the no-network-request rule — was the evidence for that sitting in plain sight.

Ruled: **GitHub Flavored Markdown, less raw HTML, less image loading.** Headings, block quotes, ordered and
unordered lists, task lists, tables, thematic breaks and strikethrough render, alongside the five
treatments already fixed, and bare URLs are linkified on `REQ-CHAT-076`'s terms. Raw HTML in Markdown
source is shown as text and never rendered as markup. **No image is ever loaded from a Markdown image
reference** — it renders as its alternative text carrying an activatable reference — and this holds for a
local path exactly as for a remote URL, because a transcript that reads locations named by model output
discloses whatever those locations hold, and because the same clause that forbids the network request also
requires rendering to complete synchronously. `REQ-CHAT-056` now carries all of it. Images the user
attaches and image bodies the product holds are untouched: the ruling governs what Markdown *syntax* may
cause to be loaded.

**Also needed from the reference, and not otherwise blocked:**

- The information architecture inside each of the seven primary views. The record fixes that all seven
  are constructed at window creation and that only one is visible (ADR-0048), and that every list surface
  with unbounded content uses the recycler (ADR-0045); it fixes nothing about what is in them.
- The visual form of the benchmark card and the diagnostics view, both of which have specified content
  and specified budgets but no specified layout.
- The glyph vocabulary that `REQ-SHELL-149`'s no-state-by-colour-alone rule requires to exist.

---

## Spikes required before the Architecture Gate closes

These are not open questions — they are measurements the record's decisions rest on. Each names the ADR
that changes if it fails.

**Numbers are stable and are never reused.** ADRs cite spikes by number, so a spike that is withdrawn
keeps its number as a tombstone (spike 9) and a spike whose subject changed keeps its number with new
content (spikes 8 and 19), exactly as constraint D-28 is handled. **Twenty-two numbered, one withdrawn,
EIGHT discharged and one discharged for Windows only — TWELVE outstanding.**

### What is outstanding is not one kind of thing, and the gate depends on the difference

A list of twelve outstanding measurements reads as twelve equal debts. It is not. As of the
restore-measurement round of 2026-09-02 the outstanding spikes fall into three groups plus a set of
sub-cases, and the last two are the ones that bear on the gate.

**(a) Genuinely not started, and owed by this record.** Spikes 2 to 8, 11, 13, 15 and 18. Nine of the
twelve. None of them blocks a decision that has already been taken; each of them prices one that has.
**Two of these grew in the measurement round.** Spike 8 now also owes the cost of `REQ-EVENTS-179`'s write
probe on the startup path, and the store's behaviour against a **real schema** — every measurement so far
used three tables with two primary keys and one listing index, and every additional index on the transcript
table adds write-ahead-log frames per insert and therefore moves **both** the commit cost and the checkpoint
period. Spike 18 now also owes **two run hosts** contending, which `REQ-TOOLS-089` and `REQ-SANDBOX-038`
permit and which spike 21 did not measure: only run-host-against-workspace-service was.

**(b) Cannot be run on this machine at all, and no amount of care here changes that.** **Spike 12** (the
Linux image's runtime on an unmodified baseline installation) needs a Linux machine that has never had
the legacy FUSE library installed. **Spike 17's two remaining platform keys** need a macOS machine and a
Linux machine of their own keys, because `REQ-STARTUP-155` binds all four artifacts and
`packaged-first-paint.md` built only the Windows two. **ADR-0056's build-time load proof** (below, an
unnumbered sibling obligation) must run on all three release runners. These are **build-host**
obligations, not architecture ones: they need infrastructure, they will not be closed by anyone reasoning
harder, and stating them as merely "outstanding" understates what it takes to clear them. ESC-11's choice
between its options turns on spike 12 and will stay open until a Linux host exists. ***One of these grew
materially on 2026-09-02***: ADR-0055's instance claim moved off the platform primitive on measurement, so
the claim, the hand-over endpoint and the stale-record protocol are now **ours on three platforms and
measured on one**. The verification is relocated rather than discharged, and `REQ-STARTUP-156`'s release
gate does **not** require launching the entry point twice on one user account — which is
`REQ-STARTUP-152`'s release-checkable form of SR-1, and the check that would catch a failure there.

***(c) The group that held spike 22 is now EMPTY, and what it left behind is a different kind of debt.***
This group read: "an architecture-side gate item that has never been run in its load-bearing half — spike
22, `REQ-SESSION-201`'s backup and restore … its restore half has not been executed in any part". **It has
now been executed and the mechanism did not work.** What replaces the group is not a spike but **eleven
defects**, three of them corrected and eight not, all of them in the gate verdict in
[`README.md`](README.md) §6 rather than here, because a defect with an owner is not a measurement. *The
distinction this group existed to protect still holds and now points the other way: **an unmeasured
mechanism was the risk, and the risk was real** — it did not merely fail to be evidence, it concealed a
mechanism that could not complete.*

**(d) Sub-cases left unmeasured inside spikes that otherwise passed, listed rather than absorbed.** Now
**four**, and they are listed separately because a sub-case folded into a discharged spike is a gap nobody
can see afterwards. **`REQ-STARTUP-165`(c)'s "no usable preparation at all" branch and its notice**, not
attempted by spike 20 — it is the only part of that requirement left untouched, ADR-0054 wrote it from
scratch on 2026-09-02 against the amended text, and its failure mode is a **missing warning**, which is the
outcome the clause exists to prevent. **ESC-21's second premise** — whether two machines on one synchronised
folder can each succeed at exclusive create on the same lock name — which spike 19 stated precisely,
called one afternoon's work, and refused to fake. And two from spike 22: ***the re-run of the corrected
restore***, which is owed because all three corrections are at this moment exactly the paper reasoning that
the three-for-three finding says is not evidence; and ***the kill-in-the-gap case***, which is now the only
route to an absent store directory that those corrections do not close. **The re-run is the one of the four
that a product owner should weigh at the gate**, because it is a re-measurement of a mechanism already known
to have been wrong three times, and it is bounded: race a launch into the refusal window, and force the
install rename to fail on an occupied name.

### What has been measured, and what each report did not settle

Nine reports exist, in [`spikes/`](spikes/) — eight for live spikes and one for a withdrawn one — four
dated 2026-09-01 and five dated 2026-09-02. **They are the only real evidence this record has, and several
of them overturned something it asserted.** Where they did, the overturned claim is preserved beside its
replacement in the ADR that carried it, and the entries above say which. **In the four of 2026-09-02 that
answered questions, what was overturned was more often a *reason* than a *conclusion*: every owner ruling
survived, three platform facts this record asserted were disproved, and one ADR's own stated gate trigger
fired. THE FIFTH DOES NOT FIT THAT PATTERN AND MUST NOT BE READ INTO IT** — spike 22 overturned a
*mechanism*: `REQ-SESSION-201`'s restore, decided on paper and never run, could not complete at all.

| Report | Spike | Discharged | Explicitly **not** settled |
|---|---|---|---|
| `ipc-hop-latency.md` | **10 — discharged** | ADR-0002's double-hop Revisit-if; ADR-0044's structured-clone trigger and its channel-isolation claim; `REQ-MONITOR-222` (p95 1.133 / 1.291 ms vs 250 ms), `REQ-MONITOR-223` (ratio 1.14 vs 2), `REQ-ORCH-155` (p95 5.951 ms vs 100 ms as SR-8 reads it) | **the commit `REQ-MONITOR-221` requires before publication**, which the report states is outside its interval, so every figure is a lower bound; fan-out to several windows; concurrent runs; the reconcile path (`refused = 0` everywhere); a real renderer |
| `packaged-first-paint.md` | **17 — discharged for Windows only** | that the `onefile` portable fails `REQ-STARTUP-155` at 13,287–19,580 ms across four bundle weights **including a zero-payload build**, with no packaging setting closing the gap; that bundle weight is close to free (~10 ms across 327 MB) on the flavours that pass. **It triggered SR-7** | the macOS `.dmg` and the Linux AppImage — **neither was built**, and `REQ-STARTUP-155` binds both; the harness "contains no product" — no persistence, no native module, nothing ADR-0055 puts before first paint |
| `renderer-invariance-and-benchmark-cadence.md` | **1 — discharged** | both counting rules against a running window (OQ-28); the tail-phase memory tripwire; that the reachable viewport is not knowable at construction (OQ-40); that ADR-0053's paint settle does not work and that `invalidate()` is worse than the timeout | whether a rAF settle and a paint settle measure the **same interval** where both resolve; the real component rather than a mock shell — the element counts and timings are stated as a **floor** |
| `windows-writer-handle-compaction.md` | **9 — withdrawn** | historically: that deleted rule 3 was right (0 of 115 trims, no observable symptom, ~73× throughput collapse), and **three corrections that outlive its subject** — what actually blocks a replace, that share-delete *is* requested, and that a directory `fsync` works on a write-opened handle | whether a replace survives a **power cut**, on any platform. The report declined to claim the guarantee from a success return. **And its directory-`fsync` figure is qualified by spike 19**, which found the same call failing on every spelling including local; the reconciliation is handle mode and is *inferred* (OQ-12) |
| `commit-on-the-publish-path.md` | **21 — discharged** | ADR-0058's own open item on the commit; `REQ-MONITOR-221` (0.396 ms p50 / 0.700 ms p95, work not a wait), `REQ-MONITOR-222` (p95 1.774 / 1.723 ms vs 250 ms), `REQ-MONITOR-223` (ratio 0.971 vs 2), `REQ-ORCH-155` on both readings, `REQ-EVENTS-029` (marginal cost −4 to +31 µs), `REQ-SESSION-067`/`-068`/`-072`; that the checkpoint period is arithmetic (7.44 frames per commit → every 135–136 commits at 9–11 ms p50); **that `REQ-SESSION-070`'s readability clause does not need the stronger durability setting**; that ADR-0002, ADR-0008 and ADR-0010 are not reopened | **a real schema with declared indexes** (spike 8); **two run hosts** contending (spike 18); **any failure path at all** — no torn write, no corruption, no disk-full, no read-only volume; packaging, so the native module's asar-unpacking obligation is untested; **power loss**, which is now the sole ground for forcing the stronger setting; macOS and Linux; the trim's own latency and the ring displacement's own cost |
| `remote-and-synchronised-storage.md` | **19 — discharged on its own question; it could NOT decide ESC-21's strength and says so** | ESC-15 supported on stronger evidence **and its stated mechanism disproved in two of three links**; ADR-0058's journal read-back as necessary-but-**insufficient**; that a naive copy of a live store is not a backup (625/627 unopenable) and the engine snapshot is (8/8, median 1,077 ms per 41 MB); ESC-21 premise 1 (2,500 races, one winner in 2,500); `REQ-STARTUP-166`'s classification as implementable, precise and cheap; `REQ-GIT-124`'s ordering confirmed | **ESC-21 premise 2 — no second machine, and it declined to fake one**; no synchronisation client was written to; **no Electron**, host Node with a prebuilt binding; one store-engine version, one binding; loopback rather than a network, so the 12 ms rename and the 6.2 % failure rate are **floors**; exclusive create against a dehydrated cloud placeholder; no power loss |
| `cached-portable-launch.md` | **20 — discharged; SR-7's gate condition met** | the cached-launch figure (575.5–723.1 ms warm, 897.3–1,414.6 ms cold vs 5,000 ms); the fast-path check (0.14–0.49 ms, against 709.6–845.0 ms for the cheapest digest it rejects); cache invalidation across an update (**did not fail**); that `REQ-STARTUP-125` is **rescued** rather than merely preserved by SR-7; **two defects in ADR-0054's own mechanism** — the commit could not commit, and the completeness check returned a hit on a preparation that produced no window | **clause (c)'s "no usable preparation at all" branch and its notice — not attempted**; clause (d) independently verified (no network capture, no privilege trace); a real read-only volume rather than an access-control approximation; the commit's durability discipline, so a power loss could leave a torn tree behind a valid marker; a real download with the platform's reputation check; a larger bundle or fewer cores |
| `presenter-liveness-and-instance-claim.md` | **14 and 16 — 16 discharged and ADR-0055's own rule FIRED; 14 measured and OQ-39 NOT closed** | that the liveness poll works and **must be gap-based**; that the exposure is every **synchronous native dialog** and not the approval dialog; that the run host dies with main in 207–341 ms and never sees the channel close; that no platform signal for an unresponsive main is usable from a utility process; that the platform single-instance primitive **fails** `REQ-STARTUP-164` on Windows (20.0 s, no reclaim, no window) | **macOS and Linux — zero coverage, on both sides of the decision, and this is the largest single gap**; the decision path (no gate, no pending-approval map, no headless policy), so *never a silent allow* is **unexercised**; **sizing the lapse window under product-shaped load**; whether every native dialog has a non-blocking form on every platform; packaged builds; the cross-platform hand-over endpoint, which has **no measurement anywhere behind it** |
| `backup-restore-mechanism.md` | **22 — discharged; the mechanism it measured DID NOT WORK** | that ADR-0058's restore as written fails **0 of 30** at the install rename, because nothing closes the staging connection; that the liveness gate is evaluated before runs are refused and a run admitted in that window **is destroyed by the swap**, measured mid-write; that the reversal fails identically wherever the install failed on an occupied name; that all three refusal gates are correct including the older-schema case that must **not** refuse; that ADR-0005 consequence 11 is vindicated **against its own counterfactual**; ESC-26's three identifier cases and all five unreadable shapes; the one-rename installation (20 of 20 gap observations, absent and never mixed); the whole cost curve — store unavailable 64 ms / 144 ms / **1.45 s** across 68 KB / 11.8 MB / 313 MB, renames flat at 3–5 ms; ADR-0056's owed Electron-ABI figure, whose answer is that **no rebuild is needed for this binding** | **the corrected mechanism — none of the three fixes has been run**; **the kill-in-the-gap case**, which is now the only route to an absent store directory the fixes do not close; a restore of an artifact read from a network destination; **two concurrent restores of one identifier**, so the instance claim is unmodelled; packaging, so the asar-unpack obligation is **still** untested; any user interface, so every "the product must convey" clause was tested by showing the *values* exist and never by rendering; and **eight defects it found and did not fix** — see [`README.md`](README.md) §6 |

**A note a reader should not have to work out.** Two of the nine measured a design that no longer
exists — the file-based journal and compaction that SR-4 removed, and the packaging target SR-7 replaced.
Neither is therefore wasted: what generalises from the writer-handle report is a **diagnosis** (an
append-and-compact file whose writer holds it open is a silent cap-enforcement failure) and three factual
corrections, and what generalises from the first-paint report is that the packaging *mechanism*, not the
bundle weight, was the cost. Both are cited above and in constraints D-27, D-28 and B-03.

### What is new

***Spikes 20, 21 AND 22 have been run and all three are discharged. No new spike is owed that was owed
before, and the sentence "spike 22 has not been run at all and is now the only new one still owed" is
withdrawn.*** Spike 20 was required before the gate by SR-7's own words and its condition is met. Spike 21
was required because the whole persist-before-publish design rested on a number nobody had taken, and that
number exists. Spike 19's question changed with ESC-15 and it keeps its number.

**Spike 22 — `spikes/backup-restore-mechanism.md`, 2026-09-02. Discharged, and it is the one that
found the most.** It was required because `REQ-SESSION-201`'s backup and restore is the largest mechanism
the record has ever added on one pass and its restore half had never been executed in any part.
**The headline is that the restore as ADR-0058 wrote it fails on this platform in 30 of 30 attempts** — the
staging store is opened read-write, no step closes it, and the rename of that directory is refused
`EPERM`; closing it first passes 30 of 30. Two further defects matter as much: the liveness gate was
evaluated **before** the run host was told to refuse runs and nothing re-checked, so a run launched in that
window took the lock, wrote at twenty rows a second, was asked to close mid-write, complied, **and had its
session and every row destroyed by the swap**; and the reversal **fails in the case it exists for**, with
the identical error, leaving a store directory holding no database and the real store under a timestamped
name. **All three are corrected** — in ADR-0058, in an amended `REQ-SESSION-201` and in a new
`REQ-SESSION-202` — and **eight further defects the spike found are not**, which is why the spike is
discharged and the mechanism is not clean. The eight are enumerated in [`README.md`](README.md) §6.

**What it confirmed is as load-bearing as what it broke**, and is recorded so no later pass disturbs it:
all three of ESC-26's identifier cases including the confirmed establishment, and all five unreadable
identifier shapes left byte-unchanged; all three refusal gates, including the older-schema case that must
**not** refuse; ADR-0005 consequence 11's lock-row correction against its own measured counterfactual —
without it, sessions live at backup time arrive **permanently** locked; the one-rename installation, with
20 of 20 gap observations seeing an absent store directory and never a mixed one; and the displaced store
retained, openable, with its bodies intact. It also priced the mechanism: the store is unavailable for
64 ms at 68 KB, 144 ms at 11.8 MB and **1.45 s at 313 MB**, while the two renames themselves are flat at
3–5 ms at every size, and the whole thing runs under Electron 44.1.0 in real utility processes with a
window painting at a main-process event-loop lag of 6 ms p50 and 13 ms max.

***Two sub-cases it could not reach, listed here rather than absorbed into the discharge.*** **(1) A
re-run of the corrected mechanism.** All three fixes are, right now, exactly the paper reasoning that
consequence 17 says is not evidence. The re-run must race a launch into the window between the refusal of
new runs and the run host's acknowledgement and confirm the second liveness evaluation catches it, and must
force the install rename to fail with the target name occupied and confirm the displace-then-rename
reversal leaves the store byte-identical. **(2) The kill-in-the-gap case.** What a restore interrupted
between the two renames leaves behind, with no process left to reverse anything. It is now the only route
to an absent store directory that the corrections do not close, and no power-loss or kill test was
performed. *A third, adjacent and not owed by the spike:* a restore of an artifact read from a network
destination, and two concurrent restores of one identifier, neither of which the instance claim was
modelled against.

***A methodological finding worth carrying, because it is evidence for the design rather than against
it.*** An earlier in-process version of the spike's own gap observer broke the displace rename with its own
transient handle. That is ADR-0004 rule 1 appearing unbidden inside a measurement harness, on a platform
where a single held handle anywhere inside a directory is fatal from any process.

**Two measurements are owed and are deliberately not numbered.** A **power-loss test**, which is now
larger than it was: it is OQ-12's outstanding half, and since 2026-09-02 it is also the **sole stated
ground** for forcing the stronger durability setting on a terminal save, because the readability clause
that used to carry that decision was tested and does not need it. And a **rebuilt-for-Electron
confirmation run of the storage measurements**: spike 19 ran host Node with a prebuilt binding, spike 21
rebuilt against the Electron runtime but measured different questions, and neither exercised the store
under a packaged build — so the first-statement failure `REQ-EVENTS-179` now governs was measured on one
binding on one machine.

1. ***Discharged 2026-09-01 — `spikes/renderer-invariance-and-benchmark-cadence.md`.*** Element-count
   invariance of a fixed slot-pool recycler through the benchmark's seven phases, under *both* counting
   rules, plus the tail-phase memory tripwire. **Answered on both halves, and the answer for the second
   rule is the one this entry named as the expected result.** Under reading 1, `widgets` was **629 at all
   384 observations**. Under reading 2 it moves at the `construct_window` → `apply_fixture` boundary in
   every run — **earlier than this entry predicted**, before any of the four phases it names — so the
   conflict is real in a running window and OQ-28 could not be de-escalated on the measurement. It was
   de-blocked by ESC-13 instead. The tripwire passes at 106,496–7,172,096 bytes against 64 MiB, worst case
   **10.7 %** of the threshold. **Three things it also established that were not asked for** and that are
   recorded above: the reachable viewport is not knowable at construction (OQ-40); ADR-0053's paint settle
   fails on exactly the phases with no visible damage and `invalidate()` is worse than the timeout (I-13);
   and a settle that expires destroys the meaning of the memory sample taken beside it (I-31).
   **The residue: its own section 10 states the element counts and timings are a floor** — no framework,
   no state store, no theming, no accessibility tree, no syntax highlighting, no tool rows, no live-row
   redraw path — so the real component is still owed (see spike 13).
2. **A Windows access-control mechanism** that can set an explicit list with inheritance disabled **and
   read it back**. *(ADR-0029.)* If none is acceptable, `REQ-PROVIDER-016` is unimplementable as written
   and this becomes an escalation.
3. ***Taken 2026-09-05 — `spikes/mcp-negotiation.md`.*** **Tool-server protocol version negotiation over
   our own transport.** *(ADR-0033, ESC-12.)* The sibling-probe policy is documented for the SDK's
   **standard** stdio transport, which ADR-0033 replaces with `OwnedStdioTransport`; establish what
   negotiation does over the custom transport before assuming a pin is needed there at all, then confirm
   that pinning to a mode which spawns no sibling probe process does not break servers speaking only the
   newer negotiation, against at least one modern and one legacy server. If the answer is that
   `REQ-MCP-067` is satisfied without pinning, ESC-12's balance changes. **Answered: no sibling is spawned
   over our transport under any mode; `REQ-MCP-067` holds without a pin; `'auto'` reaches every era; a
   strict legacy server that exits on the probe takes one sequential retry under `'legacy'`; ESC-12's
   balance changed as the entry predicted and option (a) was taken.**
4. ***Taken 2026-09-05 — `spikes/mcp-console-suppression.md`.*** **Console-window suppression verified on a
   packaged build spawning a console application** — that no window appears at any point. *(ADR-0033,
   `REQ-MCP-113`.)* **Answered:** on the packaged build, every process started after the launch (cmd, node, headless conhost) had window handle 0 and title N/A at every sample while the echo call succeeded; the reserved token's child fails at spawn (ENOENT), not with a window.
5. ***Taken 2026-09-06 — `spikes/code-intelligence-branch.md` (and `spikes/code-intelligence-bundle.md` beside it).***
   **The packaged binary's reserved-token branch** producing clean protocol output on standard output,
   nothing else on standard output, no window, and the correct exit status. *(ADR-0035.)* **Answered:** Electron's
   own main entry with the token first and `--` second (a scheme-looking positional followed by another positional
   exits the binary −1 before any JavaScript, measured on the development and the packaged binary); the runtime's
   JSON-RPC and nothing else after one CR LF Electron itself writes ~50 ms after start (tolerated by the transport as
   a blank line, not a message); no window handle on any process at any sample; the runtime's own exit status (0 on
   stdin's end, 2 from its argument parser, 1 when it is killed) observed by the parent every time. Re-run through the
   proof's own client on the development entry (`pnpm code-intel-proof` launch 1) and on the packaged artifact under
   `ROTARIS_CODE_INTEL_PACKAGED=1`.
6. **Responses-dialect model requests against a non-vendor base URL with custom headers.**
   *(ADR-0027.)* If it fails, the fallback is a hand-written dialect behind the same port.
7. **The board projection's serialisation cost across the workspace-service boundary** at
   `REQ-TRACE-300`'s scale. *(ADR-0002, ADR-0041, OQ-2.)* Unchanged by SR-4 — this measures the process
   crossing, not the store — but it now decides half of a question that has a second half in spike 18,
   and OQ-2 should be answered from both together rather than from either alone.
8. **Store query latency for the session listing and the requirements board, against real indexes.**
   *(ADR-0058 consequence 6, ADR-0041, ESC-9; constraints Y-04, I-15.)* **Rewritten: this spike used to
   decide whether ADR-0003's derived read index was needed, and that index is withdrawn as unnecessary
   under SR-4 — a listing served by an indexed query over the same rows has no staleness question. The
   measurement it existed to take is not withdrawn; it got harder.** A directory layout gave the listing's
   cost away for free and a schema does not: indexes and query plans are now a design obligation. Measure
   `REQ-SESSION-042`'s listing against `REQ-SHELL-150`'s 100 ms gesture budget, and `REQ-TRACE-239`'s
   board against its own 100 ms budget with `REQ-TRACE-367`'s linear-growth clause in force, both at a
   realistic workspace size and at `REQ-TRACE-300`'s scale, **with the indexes actually declared rather
   than assumed**. Report the plan each query takes, because a plan that degrades on a larger store is the
   failure this spike exists to catch and it is invisible in a wall-clock figure taken once.
   **Two things are added by the amendment and by ESC-15, and both are cheap here because the harness
   already has a store.** `REQ-SESSION-042` as amended now states the cost clause itself — a listing's
   cost grows with the number of sessions "and with nothing else" — so this is a conformance measurement
   rather than a prudence one (constraint D-13). And the **startup path** needs the same treatment:
   identifier read, store open, write-ahead-log recovery after an unclean shutdown, and an integrity check
   at realistic store sizes, measured where ADR-0058 puts it — inside `REQ-STARTUP-043`'s **post-show**
   activation — to confirm it never touches first paint. `spikes/packaged-first-paint.md` leaves roughly
   3.4–4.4 s of the 5 s budget on the flavours that pass and states that its harness contains **no
   persistence and no native module at all**, so nothing yet establishes what the store costs there.
   **Also owed here:** long-path behaviour on Windows for the layout ESC-15 produces — per-user data root
   plus identifier plus session id plus artifact body name, where the body name is the part that varies
   without bound.
9. ***Withdrawn 2026-08-31 under SR-4, deliberately and not by oversight.*** This was **Windows trim
   under an open writer and a concurrent follower** — the one failure mode ADR-0004's own evidence
   predicted and did not measure, and the only evidence rule 3 of ADR-0004 ever rested on. **Rule 3 is
   deleted and constraint D-28 is withdrawn with it**, because every file the discipline governed is now a
   table: `events.jsonl` (`REQ-EVENTS-091`), `permissions.jsonl` (`REQ-TOOLS-078`), the verification-gate
   log (`REQ-TOOLS-190`) and the ring-capped evidence files (`REQ-SESSION-133`). The concurrent-follower
   half went earlier, with SR-2. Checked rather than assumed: the only file still opened in append mode
   anywhere in the product is **the session's log** (`REQ-SESSION-142`), and nothing compacts it — **so no
   file in the product is now replaced by rename over a handle its own writer holds.** *(Path corrected
   2026-09-02: this named `evidence/debug.log`, which is withdrawn with the session-directory layout
   domain 18 carried; `REQ-SESSION-002` fixes three kinds of per-session file and no filenames. The fact
   is unchanged — only the name was wrong.)* The number is
   retained because ADR-0004, ADR-0009 and ADR-0024 all cited it; it is not to be reused.

   ***It was nevertheless measured, after it was withdrawn, and the report is
   `spikes/windows-writer-handle-compaction.md`.*** That is worth reading rather than skipping, because
   two of its findings outlive the design it measured and **both correct claims this record was making
   about the platform**, not about the file layout. (a) An `unlink` **succeeds** against a runtime-held
   handle, from another process too, while both fail against a holder requesting read/write sharing
   without delete — so the runtime **does** request share-delete, and the record's stated cause for rule 1
   was wrong. What actually fails is the **replace-by-rename call**, which cannot replace a destination
   with any open handle whatever its share mode, and fails even where the holder explicitly permits
   delete. (b) A directory `fsync` fails **only on a read-only handle**; on a write-opened handle it
   returns success, 200/200, at ~0.115 ms — see OQ-12, whose premise this falsifies. And (c) the
   prescription this spike existed to validate **was right**: 0 of 115 trims completed under the naive
   shape, the cap was exceeded and growing, **no reader observed any symptom**, and append throughput
   collapsed roughly seventy-fold. The **diagnosis** is what generalises and is retained as a standing
   prohibition in constraint D-28; the number is still not to be reused.
10. ***Discharged 2026-09-01 — `spikes/ipc-hop-latency.md`.*** The update path across the process hop,
    against `REQ-MONITOR-222`, `REQ-MONITOR-223` and `REQ-ORCH-155`. **All three pass**, and the entry's
    stated interesting failure — that the empty-session denominator might be small enough for a fixed
    per-update overhead to blow the factor of two on its own — **did not occur**: the ratio is 1.14
    against a ceiling of 2, and 1.19 at `REQ-SESSION-192`'s actual 5,000-row cap. **It also closed three
    ADR clauses and overturned one**: ADR-0002's double-hop Revisit-if, ADR-0044's structured-clone
    trigger, ADR-0044's channel-isolation claim (overturned — a channel name is not a transport), and the
    question of whether the direct `MessagePort` is required (it is not, because SR-8 removed the only
    budget the relay failed).
    **Three things it did not measure and one of them is spike 21.** The commit `REQ-MONITOR-221` requires
    before publication is **outside the measured interval**, stated in the report's own section 8, so
    every figure is a lower bound on the interval the requirement bounds. Fan-out to several windows
    (`REQ-MONITOR-243`, `REQ-STARTUP-163`) multiplies main's per-message cost by the window count and was
    not measured. The reconcile path — a whole read plus an index-0 increment over the resident window,
    the one path that legitimately publishes from index 0 — has never been costed, because `refused = 0`
    in every run. Also not measured: the search panel open (`REQ-CHAT-074`), which remains this entry's
    one unaddressed sub-question and belongs to ADR-0046.
11. **Parse-cache behaviour through `streaming_updates` under the read-but-do-not-insert rule**, on the
    fixture the benchmark actually uses. *(ADR-0051; constraint I-05.)* Confirm that hits and misses both
    climb (`REQ-UIBENCH-063`), that entries and characters stay inside their bounds
    (`REQ-UIBENCH-086`) **for the stated reason rather than by continuous eviction**, and that
    `REQ-NOTIFY-243`'s settle-time insertion produces the correct final rendering. Cheap; it decides
    whether the insertion policy is right before it becomes a reported figure.
12. **The application image's runtime on an unmodified baseline installation.** *(ADR-0054, ESC-11,
    `REQ-STARTUP-024`, `REQ-STARTUP-159`.)* Launch the published image on a machine that has never had the
    legacy FUSE library installed, and record whether the shell's process sandbox is active.
    `REQ-STARTUP-156`'s release gate names a machine the release owner controls, which is **not** the
    machine the requirement names, so this is not covered by the existing gate. ESC-11 turns on it.
13. **Forced synchronous commits at recycler-pool scale — *narrowed, and answered from one side already.***
    *(ADR-0057, ADR-0045, ADR-0053.)* Whether committing synchronously on every applied state holds
    `REQ-MONITOR-222`'s 250 ms p95 and `REQ-UIBENCH-118`'s sub-100 ms lag through the
    thousand-replacement tail phase. **Spike 1 answered the lag half against a mock shell**: a burst phase
    driver produces 588–2,752 ms of lag and a driver that yields after every update produces ≤74.8 ms, at
    the cost of multiplying phase wall times by 17×–26×. **What remains is the real component**, which
    spike 1's own section 10 says its numbers are a floor for: renderer framework, state store, theming,
    accessibility tree, icon set, bundled fonts, syntax highlighting, tool rows, group headers, verifier
    rows and the live-row redraw path. A 2,000-line tool output or a very wide table is the case most
    likely to move the 200 ms budget. **Two cheap follow-ons belong here rather than as new numbers**: the
    settle comparison ADR-0053 consequence 5 turns on — a rAF settle against a paint settle in the phases
    where **both** resolve, which either retires that consequence or sizes it — and ADR-0052's maintained
    session-store counters under the run host's actual write rate, to confirm that a counter incremented
    inside every insert transaction is genuinely free when diagnostics is off (`REQ-STARTUP-129`,
    `REQ-STARTUP-130`). It shares a harness with spike 1, so the marginal cost is small.
14. ***Measured 2026-09-02 — `spikes/presenter-liveness-and-instance-claim.md`. The mechanism is
    discharged; the window this spike exists to size is NOT, and OQ-39 stays open.*** The poll detected
    all nine blocked runs at **+386 to +468 ms** on a 500 ms threshold with **zero false lapses in 258 s**
    of unblocked running. Three findings it was not asked for and which are now in ADR-0019 and constraint
    T-31: the check **must be gap-based**, because a blocked main queues rather than drops and all 84
    outstanding replies arrived when the block ended, the last at **7,885 ms**; the exposure is **every
    synchronous native dialog**, not the approval dialog, which cost the poll nothing at a 266–267 ms
    maximum gap; and **no platform signal for an unresponsive main is usable from the run host**, the
    operating-system signals detecting a busy loop and never a native modal. **It also falsified an
    ADR-0019 mechanism**: the run host dies with main in **207–341 ms** and never observes the channel
    close, so the channel-close revocation is not what operates. **Why the window is still unsized is
    stated in the *Not discharged* paragraph below and has not changed.**
    **A presenter liveness lapse window that survives ordinary main-process load.** *(ADR-0019, OQ-39,
    constraint T-41.)* Measure the worst-case latency of a liveness poll answered by the desktop main
    process while it does the heaviest ordinary work it does — a large transcript render, a
    garbage-collection pause, a settings flush, a native dialog on the platform where one blocks — and
    confirm that a window exists comfortably above it that is still short enough that a wedged main does
    not read as attended for a user-noticeable time. **If no such window exists, ADR-0019's decision fails
    and OQ-39 becomes an escalation** between a hang at `runtime.approval_timeout_seconds: 0` and a
    specification change.
    ***Not discharged, and the reason is specific.*** `spikes/ipc-hop-latency.md` establishes a **floor**
    — a single `webContents.send` took 88.263 ms while main was otherwise **idle** — and confirms the
    wedged-main state occurs, at 22,777 ms of event-loop lag. **It never showed a dialog**, which is the
    one case this spike exists to measure, and a native modal is exactly the load the window must clear.
    The floor narrows the search; it does not size the window.
15. **Echo latency end to end against a real pseudo-terminal with the flush rule in force.** *(ADR-0021,
    OQ-38, `REQ-SHELL-166`.)* Measure key press to painted frame across both process hops with
    `runtime.terminal_stream_interval_ms` at its 100 ms default and at 2000, confirming that the
    ceiling-plus-flush reading actually lands inside `REQ-SHELL-150`'s 100 ms budget rather than merely
    removing the sampling term from the sum. If the two hops and the paint consume the budget on their
    own, the flush is necessary but not sufficient and OQ-38 becomes an escalation about the figures.
16. ***Discharged for Windows 2026-09-02 — `spikes/presenter-liveness-and-instance-claim.md` — AND THE
    STATED RULE FIRED. Observation 2 does not hold: the platform primitive is refused and the claim is
    ours on every platform.*** Against a primary running but not pumping messages,
    `app.requestSingleInstanceLock()` blocked **20,004.6 / 20,010.9 ms** against a 5-second interval,
    returned false, performed **no reclaim and no retry**, and the hand-over never reached the primary —
    not even in the 25 s after it recovered, so it was **dropped rather than queued** — and the launch
    ended with **no window on screen**. It cannot be wrapped: the call is synchronous on the launching
    process's own main thread and takes no timeout. **Observations 1 and 3 passed and are carried forward
    as measured obligations on the replacement** — first-attempt reclaim at **+187 ms** after a force-kill
    with the window shown at +345/+373 ms and the release bracketed to a 67–69 ms window, and 69 probes
    with no observable effect — as is declared-field delivery, because `argv` really was mangled. The
    JS-blocked-but-pumping sub-case passed at 4.07/4.82 ms, and it passed in a way the record would not
    have chosen: the hand-over callback ran inside the dialog's nested message pump while the primary's own
    timers were dead, so a hand-over can be delivered into a process that is otherwise entirely stopped.
    ***Two thirds of the obligation is now UNMET RATHER THAN INHERITED, and this is the part that grew.***
    macOS and Linux were not measurable on this host, and adopting our own record **relocates** the
    verification rather than discharging it: a hand-over endpoint and a stale-record protocol we write
    ourselves must be verified on both, and on macOS must additionally compose with the convention that a
    second launch of a bundle produces no second process. **The cross-platform endpoint is the piece with
    no measurement anywhere behind it**, it sits on the critical path of every launch, and its failure mode
    is the same one that failed under the primitive — a launch that ends with no window.
    **The single-instance record's probe and reclaim, on all three platform keys.** *(ADR-0055, which
    records this as a verification obligation and names it a spike; constraint P-16; `REQ-STARTUP-164`,
    `REQ-STARTUP-030`.)* `REQ-STARTUP-164` fixes a 5-second hand-over interval, **at most one** reclaim,
    two claim attempts, no spin, no side effect on the probed process, and nothing written but the record.
    The platform primitive performs the probe and the reclaim **on its own schedule**, and the documented
    surface states no timeout and no reclaim rule — so whether the schedule matches the requirement's is a
    measurement the record does not have. Three observations decide it: **(a)** a record left by a process
    killed without cleanup must not make the application unlaunchable, and the next launch must reach a
    window inside `REQ-STARTUP-155`'s 5 seconds; **(b)** a recorded process that is running but not
    answering resolves within the stated interval, with at most one reclaim and no spin; **(c)** the probe
    leaves the probed process unaffected. **If any of the three fails, ADR-0055's alternative I is adopted
    on every platform — our own record file and our own discipline — and the primitive is dropped rather
    than wrapped in a timeout**, because one record resolved two different ways is worse than either. The
    failure mode is a product that will not start, and it is invisible until it happens.
17. ***Discharged for Windows 2026-09-01 — `spikes/packaged-first-paint.md`. Narrowed, not struck: the
    macOS `.dmg` and the Linux AppImage were not built and `REQ-STARTUP-155` binds both.*** Launch each
    of `REQ-STARTUP-031`'s four artifacts and measure launch to first painted frame, with **no
    per-flavour differential** permitted. **The Windows result triggered SR-7**: the portable produced by
    the packaging tool's own target reached first paint in 13,287–19,580 ms at four bundle weights
    including a zero-payload build — 92 % of it before any of our code starts — against 664–1,561 ms for
    the same payload installed. No setting inside the tool closes the gap.
    **ADR-0055's "Revisit if" fired exactly as written and named the wrong remedy**, which is recorded in
    that ADR as a reversal: it predicted the conversation would be "about the budget or about what is
    bundled", and SR-7 kept the budget, kept `REQ-STARTUP-013` and `REQ-STARTUP-031`, kept what is
    bundled, and changed the **launch mechanism**. The clause assumed only two variables existed.
    **One factual correction the record must carry:** the portable stub **deletes its extraction directory
    on exit**, so there was never a warm path and no design may assume a portable user gets a cheaper
    second launch, or that anything may be cached in that directory between launches.
    **Still owed:** the two remaining platform artifacts, on machines of their own platform key, which
    `REQ-STARTUP-156` now requires at the release gate anyway.
18. **Cross-process write contention on the one workspace store.** *(ADR-0058 consequences 2 and 6,
    ADR-0002, OQ-2; constraints W-01, W-02, W-05, U-03, D-16.)* The run host and the workspace service
    both open the store read-write, so they share one write lock — a coupling that did not exist when they
    wrote different files. Measure the delay a run host's publish commit suffers while the workspace
    service is committing, at `REQ-TRACE-300`'s scale, with W-05's short `IMMEDIATE` transactions in force
    and with the ban on holding a write transaction across `REQ-TRACE-073`'s regexes and
    `REQ-TRACE-225`'s unbounded read **deliberately violated in one arm**, so the cost of getting that rule
    wrong is a number rather than a warning. `REQ-MONITOR-218` forbids a delay floor **of any size** before
    publishing an unseen row and D-16 requires it committed first, so any contention lands exactly there.
    **If it is real, ADR-0058's alternative G — one store written only by the run host and one only by
    the workspace service — removes it entirely and no requirement can observe the split**; SR-4 ruled one
    store per workspace, so taking alternative G would need the ruling revisited, which is why the number
    matters before implementation rather than after. **Run this with spike 21**, which needs the same
    harness and the same contending writer, and whose figure is meaningless without this one's.
19. ***Discharged on its own question 2026-09-02 — `spikes/remote-and-synchronised-storage.md`. It could
    NOT decide ESC-21's strength, and it said so rather than inventing a result.*** **What it settled:**
    exclusive create is a genuine primitive over a network share — 2,500 races across five pairings
    including two that mix I/O stacks, **exactly one winner in 2,500, more than one in 0, none in 0**; the
    atomic document primitive holds on a share **only with the retry ladder**, 6.2 % of first attempts
    failing with no other opener present (OQ-44); `REQ-STARTUP-166`'s direct classification is real,
    precise and cheap, correct at every depth inside a live third-party sync root and correctly negative
    one level above it, p50 0.10–1.83 ms; and `REQ-GIT-124`'s ordering of the storage check ahead of the
    lock check is confirmed by measurement, both halves independently. **What it disproved:** ESC-15's
    stated mechanism, in two of its three links (constraint W-04) — the conclusion survives on three worse
    measured failures. **What it exposed:** the `REQ-EVENTS-084`/`REQ-EVENTS-088` gap, now closed by
    `REQ-EVENTS-179`; and a same-machine two-spellings hazard now carried as constraint W-27.
    ***What it could not do, and this is the part that stays owed:*** ESC-21's **second** premise needs a
    second machine and a synchronisation account. The report states the closing experiment precisely — two
    machines, one synced folder, an exclusive-create race against the same lock name with a wall-clock
    barrier — and calls it one afternoon's work; **the single number that matters is races in which both
    machines' exclusive create returned success.** Until it is taken, the refusal-versus-warning strength
    of ESC-21 rests on reasoning rather than on measurement. **Also unmeasured and worth naming:** the
    classification's blind spot is any client that registers no platform sync root, and the most widely
    deployed such client was present on the measuring machine and registered **none**; exclusive create
    against a **dehydrated cloud placeholder** was not exercised; and the replace path was tested against
    only one of the four destinations ADR-0004 names — the spike declined to write into the machine's live
    sync roots because they hold the user's own material, which was the right call.
    **What ELSE the product writes into `.rotaris/` on synchronised storage.** *(Same number, **new
    question**, changed by ESC-15 exactly as that ruling said it would be. ADR-0058, ADR-0005;
    constraints D-29, W-20, W-04, W-27, B-24; ESC-21.)*

    **The old question is answered by a requirement and is withdrawn.** It asked which of three things
    happens to a store on a share or in a sync folder. `REQ-SESSION-198` puts the store on the machine's
    own storage always, and requires such a workspace to be **fully usable** — so no store is ever there
    to refuse, degrade or corrupt.

    **What replaces it is narrower and touches a safety property rather than a usability one.** Two things
    the product writes into `<workspace>/.rotaris/` now travel with the workspace and are reached by
    exclusive create (constraint D-29): the **workspace identifier**, and `REQ-GIT-128`'s
    **`integration.lock`**. Establish, on a mapped network drive, on an SMB share and inside at least two
    cloud-sync clients: whether exclusive create is honoured as a primitive or reconciled after the fact;
    whether two machines can each successfully create `integration.lock` and both proceed; and whether the
    identifier file can be duplicated, conflict-renamed or resurrected by a sync client. **The integration
    lock is the sharp part**, because `REQ-GIT-128` states a cross-machine obligation and its failure mode
    is two machines merging into one base branch at once, silently. A cloud-sync folder is a **local**
    filesystem with a daemon on top and must be measured separately from a true network share rather than
    assumed to share the verdict. **ESC-21 turns on this.**
20. ***Discharged 2026-09-02 — `spikes/cached-portable-launch.md`. SR-7's gate condition is met and the
    remaining options SR-7 held in reserve are not needed.*** **The three figures it was raised for.**
    Cached first paint **575.5–624.2 ms warm and 897.3–1,242.5 ms cold** (n = 6 each), replicated
    independently at 581.3–723.1 / 964.0–1,414.6 ms, against 5,000 ms; the exempt **preparing** run lands
    inside the bound it is exempt from at **1,634.7–2,091.3 ms** warm and 3,798.8–3,909.8 ms
    single-threaded. The **fast-path check** costs **0.14–0.49 ms warm, 0.37 ms on a cold first touch**,
    against 709.6–845.0 ms for the fastest launch-time digest of the artifact, 1.48–1.95 s for a
    pure-Rust one, and 4.43–5.50 s for a digest of the prepared tree. **Cache invalidation across an
    update did not fail** — a one-line change produced a different token and prepared afresh, the previous
    version's preparation stayed intact and was still used at 591.3 ms, and two token-named directories
    coexisted, each with its own marker. **Two defects were found in ADR-0054's own mechanism, both fixed
    there, and neither is visible in a build that never meets a damaged preparation**: the commit step
    could not commit (a directory cannot be renamed onto an existing directory on Windows), and the
    completeness check returned a **hit** on a preparation that launched and produced **no window**.
    **One correction the record must carry:** `REQ-STARTUP-125` is not merely preserved by SR-7's ruling,
    it is **rescued** by it — under the packaging tool's portable target the artifact was locked for the
    entire run, 79 consecutive failures with the first rename succeeding only at 16,837 ms as its own
    process exited, so "the replacement SHALL succeed while the application being replaced is still
    running" **was not satisfiable on that target at all**; under the preparation the rename succeeded on
    the first attempt at 189 ms with the application alive. **And one figure this register mis-attributed:
    the 13,287–19,580 ms is the packaging tool's extraction cost, not this mechanism's** — the launcher
    writes the same tree in 410.7–565.7 ms, so anywhere the price of a preparing run is quoted in tens of
    seconds it is the wrong number.
    ***What it did not do, and one item is a listed gap rather than a footnote:*** clause (c)'s **no
    usable preparation at all** branch and its notice were **not attempted**, and clause (d)'s "issues no
    network request and raises no elevation prompt" is true only by construction of the spike's own
    launcher — no network capture, no privilege trace. Also unmeasured: a real read-only volume rather than
    an access-control approximation; the commit's durability discipline, so a power loss could leave a torn
    tree behind a valid marker, which is the one damage class the per-file manifest does **not** catch; a
    real download carrying the platform's mark-of-the-web, which lands exactly where the release gate now
    looks; and a materially larger bundle or fewer cores, which is the figure that stops being comfortable
    first.
    **The prepared portable's steady-state launch. *`owner-decisions.md` SR-7 named this as required
    before the gate.*** *(ADR-0054, ADR-0055, ADR-0056; constraint B-23, `REQ-STARTUP-165`,
    `REQ-STARTUP-155`.)* Three figures, in order of what they decide. **The cached-launch first paint**,
    which is the whole point: SR-7 keeps `REQ-STARTUP-155`'s 5 s bound for every run after the one that
    prepares, and the only evidence it is reachable is the §6.1 file-copy baseline of **0.7 s for the same
    508 MB tree**, which is a baseline and **not a result**. **The cost of the identity check on the fast
    path**, which ADR-0054 designs as one directory probe and one small marker read against a build-time
    token, deliberately not a launch-time digest of a 100–500 MB artifact. **Cache invalidation across an
    update**, where `REQ-STARTUP-125` lands the replacement on the artifact and leaves the preparation to
    be superseded on the next launch, so the next launch must notice.
    **ADR-0054's and ADR-0055's *Revisit if* clauses both turn on this**, and `REQ-STARTUP-156` now
    requires the release gate to observe **two runs** of a self-preparing artifact on the same machine —
    the one that prepares, and a later one where the bound is actually observed — so this is a release
    obligation as well as an architecture one.
    ***Corrected 2026-09-02: this entry said "One case has no stated outcome and should be exercised
    here". The outcome is now stated and the case should still be exercised — as specified behaviour to
    verify rather than as a gap to characterise.*** `REQ-STARTUP-165`(c)'s third paragraph covers a run
    that can produce **no** usable preparation at all: it "SHALL still start the artifact", is exempt
    from the first-paint bound, and — uniquely among the five preparation outcomes — **is reported**,
    once per such run, after the window is painted, on the persistent notice surface at warning severity,
    conveying that the artifact could not prepare itself, which storage it could not prepare into, and
    that every launch will cost what this one cost until that storage accepts a preparation. So the
    silent 13–19 s degradation this entry described is no longer the specified behaviour. What to
    exercise: that the notice actually fires, that it names the per-user data location and never the
    placement within it, and that the four silent outcomes stay silent — ADR-0054 names
    "implementing four-silent-one-loud from a habit of *the-preparation-is-silent*" as the specific error
    to prevent.
    **One reading question rides on this and should be settled before, not after** (see the specification
    defects the gate verdict lists): clause (c) requires such a run to start the artifact and clause (d)
    requires preparing to "write nothing outside the per-user directories of `REQ-STARTUP-145`", and the
    payload cannot run without existing as files — so where that root refuses **every** write the two
    clauses are jointly unsatisfiable on the conservative reading. ADR-0054 designs for the conservative
    reading, covers the reachable failures by placing an ephemeral tree under the same root, and records
    the residue.
    ***Also on this spike's harness, and cheap there:*** the cost of the store open after the show, which
    ADR-0055 keeps off the critical path by construction and nothing has measured. `PRAGMA quick_check`
    on a large store is bounded rather than fast, and the post-show pipeline is where the window becomes
    *useful*.
21. ***Discharged 2026-09-02 — `spikes/commit-on-the-publish-path.md`. The lower bound is gone and the
    margin survives at two thirds of its old size.*** Commit **then** publish, end to end over the relay:
    **p95 1.774 ms at 0 rows and 1.723 ms at 10,000**, against 250 ms — the quoted margin falls from ~221×
    to **~141×**. `REQ-MONITOR-223`'s ratio is **0.971** against a ceiling of 2; zero of 20,000
    publications exceeded 250 ms; the commit alone is **0.28 %** of the budget and the whole interval
    **0.71 %**. Persist-before-publish costs **0.396 ms p50 / 0.700 ms p95** and it is work, not a wait.
    Making each event durable individually is **free** — marginal cost −4 to +31 µs at p50 — so
    `REQ-EVENTS-029` is not a cost the design absorbs. **ADR-0058's own open item is closed** and its
    commit-cost Revisit-if is **not triggered, on evidence**.
    ***Three things it changed that were not the question.*** **(a) The shape of the distribution matters
    more than the percentile**: the automatic checkpoint fires every **135–136 commits** — arithmetic, from
    7.44 log frames per publish-path commit against a threshold of 1,000 — at **9–11 ms p50, worst observed
    53 ms**, while the other 99.27 % cost 179–220 µs. Nothing threatens 250 ms, but any threshold built on
    "about a millisecond" will see routine fifty-fold excursions on a fixed period, and **the checkpoint
    period is a design input**: widening the publish-path transaction shortens it proportionally.
    **(b) ADR-0058's stated ground for forcing the stronger durability setting on a terminal save is
    false** — a separate process using a different binding read a terminal status back immediately at the
    weaker setting — and the decision is re-grounded on power loss, which nothing has tested (constraint
    W-06, OQ-12). **(c) `REQ-MONITOR-218`'s no-delay-floor rule can be broken from outside this record**:
    a second process holding a 200 ms write transaction produced a **205.4 ms** commit, and held back to
    back the writer starved indefinitely, which makes constraint W-05 a conformance obligation with a
    number attached rather than hygiene.
    ***What it did not measure*** is listed in the group (a) note above and in the table: a real schema, two
    run hosts, any failure path at all, packaging, power loss, and any machine but one.
    **The commit on the publish path.** *(ADR-0058, ADR-0008, ADR-0009, ADR-0010;
    constraints D-16, U-03, U-04, W-05, W-06, W-21, W-28.)* `spikes/ipc-hop-latency.md` states in its own
    section 8 that "the database commit `REQ-MONITOR-221` requires before publication" is **outside** its
    measured interval, so every transport figure in this record is a **lower bound** on `REQ-MONITOR-222`'s
    and `REQ-ORCH-155`'s own intervals. `REQ-MONITOR-218` forbids a delay floor **of any size** before
    publishing an unseen row and D-16 requires it committed first, so any cost lands exactly there.
    Measure: commit cost at the weaker durability setting under write-ahead logging, for **one transcript
    row plus its event** in one transaction and for **one whole-session update**, at `REQ-MONITOR-219`'s
    20-per-second tick, **with a second writer process contending on `BEGIN IMMEDIATE`** (which is spike
    18's subject and shares this harness), plus the `fsync` cost of a terminal-status save
    (`REQ-SESSION-070`) on each platform's per-user data volume.
    **One input to this measurement does not exist yet and must be counted first.** With
    `REQ-SESSION-067`'s window withdrawn, the **save-request rate** is set by the run loop's call sites
    and by nothing this record controls, and `REQ-SESSION-071` states no bound. Nobody has counted it.
    **A related figure is owed on the same path**: the summary rewrite at that rate, including
    `REQ-SESSION-033`'s ladder under anti-malware, which the writer-handle spike showed is load-bearing
    rather than defensive at realistic reader cadences and which was never exercised against that file.
    *For calibration rather than as a claim: the file design's per-event durable write measured 0.518 ms
    p50 with an `fsync` and 0.0135 ms without one. An ordinary commit performs no `fsync` and should cost
    less — that is inference, and it is exactly what this spike exists to replace with a number.*
22. **The whole-store backup and its restore, end to end. *DISCHARGED 2026-09-02 —
    `spikes/backup-restore-mechanism.md`. BOTH halves are now measured and the restore as ADR-0058 wrote
    it FAILED 0 of 30.*** *(ADR-0058, ADR-0005, ADR-0002, ADR-0056; constraints W-24, W-29, W-30, W-31;
    `REQ-SESSION-201`, `REQ-SESSION-202`.)*

    ***What discharged it, and what a reader must not take from the discharge.*** The restore was built
    and run — three real processes, an Electron confirmation run, a fault injector at every point the
    record names a failure, thirty repetitions per verdict on a fresh world each time. **It found three
    defects, all three now corrected, and eight more it did not fix.** The three: the staging connection
    that no step closed, so the install rename was refused `EPERM` in 30 of 30; the liveness gate evaluated
    before runs were refused, which destroyed a live session and every row it had written; and the reversal
    that fails identically to the step it exists to undo. **The eight uncorrected are enumerated in the gate
    verdict in [`README.md`](README.md) §6 and are defects with owners rather than measurements owed.**
    **A spike is discharged when its question is answered, not when the answer is comfortable** — and this
    one's answer is that the mechanism did not work. *Two sub-cases it could not reach are carried in group
    (d) above: the re-run of the corrected mechanism, and the kill-in-the-gap case.* **Everything below that
    the measurement did not reach is marked in place rather than deleted, because what a spike leaves owed
    is as much a part of its result as what it settled.**

    ***What spike 19 settled incidentally, on 2026-09-02, and it settled the alternative rather than the
    mechanism.*** A **naive file copy of a live store is unopenable 625 times in 627** — 150 of 152 under
    write-ahead logging and **475 of 475** under a rollback journal, so the rollback case is worse rather
    than a safe fallback — while `VACUUM INTO` produced **8 valid snapshots out of 8** during 108,525
    concurrent commits, integrity-clean, checksum-clean and monotonic, at a **median 1,077 ms per 41 MB**
    on local storage. That is the mechanism `REQ-SESSION-201`'s "valid while runs are live" needs and it
    now has a number. **And the trap is recorded so nobody falls into it twice:** the gentle version of the
    same experiment — a realistic 20 commits per second against a small store — returns **0 bad copies in
    40**, so the obvious test gives a false all-clear and makes the choice look arbitrary to whoever runs
    it next.

    ***"Everything below is still owed. Every step of the restore is individually justified from the
    requirement; nothing has been run" — WITHDRAWN 2026-09-02.*** It has been run. What follows is kept
    with each item marked, because four of the five things this entry asked for are answered and one is
    not, and collapsing them would hide which.

    **A documentation check comes first, costs nothing, and decides one alternative against another on
    its own.** ADR-0058 chooses `VACUUM INTO` over the engine's stepped online-backup API on a
    *documented* property — that the stepped API restarts the copy when the source is written through a
    connection other than the one driving it — and says explicitly that it read this rather than measured
    it. ADR-0002 puts **two** writer processes on this store, and `REQ-SESSION-201` forbids refusing a
    backup because a session is live, so under `REQ-MONITOR-219`'s tick every run-host commit is an
    external write and termination is not obvious. **Confirm the property against the binding's own
    documentation before measuring anything.** If it does not hold as stated, the stepped API is the
    better mechanism and `VACUUM INTO` should be dropped. A reader skimming ADR-0058's *Decision* could
    take this as established; it is not. ***STILL OWED after spike 22.*** The spike modelled ADR-0058's
    chosen mechanism and states in terms that **alternative U is untouched**, so this check is exactly as
    open as it was and it is still the cheapest thing on this list.

    **Then four figures, in the order of what they decide.** (1) `VACUUM INTO` cost on a live store —
    time, destination space, and the one that is not obvious: **how much the write-ahead log grows while
    the read transaction pins it**, on a store large enough to matter, with a run committing at
    `REQ-MONITOR-219`'s tick. ***Half of this is now answered and half is not, and the split is the whole
    point.*** The **correctness** is settled — 8 valid snapshots in 8 under concurrent load — and the
    **time** has a figure at one size, a median 1,077 ms per 41 MB. **The log growth is not measured**, and
    it is the only input the mid-copy-checkpoint question and the progress-reporting question turn on. So
    the question is now "at what size does this stop being comfortable", not "seconds or minutes". This
    decides whether progress reporting, cancellation and a mid-copy checkpoint strategy are needed at all. ESC-19's own survey cites a comparable product's session logs
    reaching 700 MB to 2 GB, and ESC-9 leaves retention unbounded, so "large enough to matter" is not
    hypothetical. ***STILL OWED: spike 22 measured the restore, not the backup's log growth.*** (2) **The
    restore's connection-close handshake**, which had no timing figure anywhere. ***ANSWERED.*** The
    handshake itself is **1.2–1.5 ms** at every store size with the run host answering at once; the
    workspace service's own close is **1.0 ms**; each re-open is **3.4–5 ms**; and the figure this item was
    really about — **how long a user stares at a workspace whose store is deliberately absent** — is
    **64 ms at 68 KB, 144 ms at 11.8 MB and 1.45 s at 313 MB**, with the whole action reaching 2.67 s at
    that size. *Two things the measurement added that this item did not anticipate: the wait has **no bound
    at all** and does not terminate against a run host that never answers, which is now a defect rather than
    a figure; and the state the user sees during the gap is no longer only an empty list, because
    `REQ-SESSION-202` reclassifies the durable form of it as a store that could not be opened.* (3) The two
    renames, which ADR-0058 does **not** claim atomic, on the filesystems the writer-handle spike did not
    cover — network shares, ReFS, removable media and cloud-sync folders, all of which the destination
    may be. ***STILL OWED.*** Spike 22 ran on `C:` NTFS on local NVMe only, and states so. What it did add
    is the **local** semantics in full, which nothing had: a rename onto a name that does not exist succeeds
    30 of 30; onto an existing directory it fails **even when that directory is empty**, so there is no
    "replace if empty" on this platform; onto an existing **file** it succeeds and destroys the file; and a
    single held handle anywhere inside the directory is fatal from **any** process. (4) Whether an export
    holding a long read transaction can delay a transition commit, which `REQ-EVENTS-098` forbids
    **outright** rather than budgeting for; ADR-0024's and ADR-0041's export mechanisms both infer from the
    journal mode that it cannot, and inference is not what that requirement asks for. ***STILL OWED, and
    partly reframed rather than answered:*** spike 21 measured a *compliant* reader costing the writer
    163.6 → 345.9 µs p50 with zero lock contention, and `REQ-EVENTS-098` has since been amended into three
    clauses in which a measurable scheduling cost is expressly not a violation — so what is left to measure
    is the export's own reader, not the requirement's meaning.

    ***"This deserves running before the Architecture Gate rather than after" — DISCHARGED. It was run
    before the gate, and it was right that it should be.*** The requirement it implements is one of the two
    the owner minted in this pass, the mechanism is entirely architecture's, and running it found three
    defects that no reading of the record had caught in the months it stood.

**Not a numbered spike, and deliberately so: a build-host obligation ADR-0056 creates.** Rule 4 of that
record requires a **build-time proof that each native binding loads under the shipped Electron binary,
from the packaged tree**, failing the build if it does not. It is the only check anywhere in the record
that catches an unloadable store binding, and the reason is an asymmetry worth stating once:
`REQ-STARTUP-156`'s release gate observes **first paint**, first paint does not open a store (ADR-0055
keeps the workspace read off the critical path, ADR-0058 opens after show), so **an artifact with an
unloadable store binding passes the release gate** — the property that makes the failure graceful is the
same property that makes the gate blind to it. The proof must run against the packaged tree under the
Electron binary that tree carries: run against `node_modules` in the checkout it proves nothing about
asar unpacking, and run under the host Node it passes on exactly the artifact that fails. **A proof
written the easy way is worse than none, because it reads as verified.** Somebody must establish that it
is constructible on all three release runners before it is relied on as the only defence.
