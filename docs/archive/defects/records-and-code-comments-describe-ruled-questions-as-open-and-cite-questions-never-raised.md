## Records and code comments describe ruled questions as open, and cite questions that were never raised

After the owner's ruling of 2026-10-06 ([R-071](../../product/requests.md#r-071)) closed every open question then
standing, the code and the record kept saying otherwise in two ways.

**Ruled questions presented as the build's reading or as asked.** Four comments still describe a question the owner has
ruled as an unruled reading: `packages/ui/src/ArtifactLinks.tsx` ("what it opens is OQ-125's reading"),
`packages/agent-tools/src/terminal/foreground.ts` (`submitLine`'s comment: "which is OQ-146's reading"),
`packages/ui/src/WorkspaceView.tsx` (the paused continues: "drawing them on a crash-left one too is OQ-103's reading of
clause 18", which `PD-ORCH-005` clause 26 now states) and `packages/engine/src/children/report.ts` (`reportFacts`: "the
build's reading, asked as OQ-120"). The record does the same: `docs/architecture/codebase.md` (Part N: "OQ-37 stays open";
OQ-37 closed 2026-09-07; the design-language row: `theme-proof`'s contrast section "stays red there until the owner rules",
OQ-56 ruled 2026-09-18), `docs/architecture/first-release-plan.md` ("OQ-131 open", "OQ-114 to OQ-116 are open", "OQ-67 open
against its reach from Settings", "The open question. OQ-67", "OQ-58 and OQ-59 are also open"; all ruled),
`docs/architecture/README.md` (OQ-1 "carried as open question", closed 2026-09-07; OQ-30's palettes "stay open", closed
2026-09-04), and `docs/architecture/views/README.md` (a note that "stays open for residuals 1 and 3 (OQ-170)", another
that "stays open for the ruling" of OQ-154, and "OQ-159 asks which, open": the notes are in `fixed/` and the questions
ruled). `docs/architecture/first-executions.md`'s 2026-10-06 POSIX shell-state row links the PowerShell note at `fixed/`
and still reads "recorded, not repaired".

**Questions claimed as raised that have no entry.** Three comments say a question "is raised as an open question" or "is
recorded as an open question", and `docs/architecture/open-questions.md` has no entry for any of them:
`packages/engine/src/artifacts/sidecar.ts` (a publish's `body_markdown` as the rendered document, the submitted body kept
twice), `packages/engine/src/artifacts/store.ts` (`markConsumed` recording the canonical instance name where
REQ-LIBRARY-099 says "the reading persona" and REQ-LIBRARY-096 "the actor") and `packages/contracts/src/roles.ts` (no
built-in persona declares `artifact_write`). `docs/architecture/adr/0003-files-are-the-system-of-record.md` calls the
first an "Open question, not a settled reading" with no number either. The owner was never asked any of the three.

Found by acceptance round 1 of finacc3 on merged `main` (finding F16, the earlier verifiers' known findings 5 and 13).

## Specs

None contradicted: the code behaves as ruled. The record misstates what the owner has and has not decided, which
`CLAUDE.md` ("A question the specification leaves open is raised, never ruled by you") and the views' maintenance rule
(a record that disagrees with the code is a defect of the change that made it so) make a defect of the record.

## Relevant files

- `packages/ui/src/ArtifactLinks.tsx`, `packages/agent-tools/src/terminal/foreground.ts`, `packages/ui/src/WorkspaceView.tsx`,
  `packages/engine/src/children/report.ts`: the ruled questions' comments.
- `packages/engine/src/artifacts/sidecar.ts`, `packages/engine/src/artifacts/store.ts`, `packages/contracts/src/roles.ts`,
  `docs/architecture/adr/0003-files-are-the-system-of-record.md`: the claims with no question behind them.
- `docs/architecture/codebase.md`, `docs/architecture/first-release-plan.md`, `docs/architecture/README.md`,
  `docs/architecture/views/README.md`, `docs/architecture/first-executions.md`: the record's lines.
- `docs/architecture/open-questions.md`: each ruling, and where the three missing questions belong.

## Outcome

Repaired 2026-10-06 by finacc3's acceptance repair (bundle `finacc3-accept1-3`).

- **The three questions never raised are raised**, each with the reading the build proceeds under, in
  `docs/architecture/open-questions.md`: [OQ-210](../../architecture/open-questions.md) (a publish's `body_markdown` is the
  rendered document and the submitted body is kept twice), OQ-211 (an artifact's consumer is the reading instance's
  canonical name) and OQ-212 (no built-in persona declares `artifact_write`). The three comments and ADR-0003's execution
  note cite them; ADR-0003's "Open question, not a settled reading" is struck and kept. Raising OQ-212 found
  [`can-publish-artifacts-is-read-and-never-gates-artifact-write.md`](can-publish-artifacts-is-read-and-never-gates-artifact-write.md),
  recorded and not repaired here.
- **The four comments** name OQ-103 (with `PD-ORCH-005` clause 26), OQ-120, OQ-125 and OQ-146 as ruled on 2026-10-06.
- **The record**: `codebase.md` (OQ-37, OQ-56), `first-release-plan.md` (OQ-58, OQ-59, OQ-67 twice, OQ-114 to OQ-116,
  OQ-131), the architecture README (OQ-1, OQ-30) and the views' change log (OQ-154's and OQ-170's notes, OQ-159, OQ-172)
  strike or annotate each claim with its ruling, the history kept; `first-executions.md`'s 2026-10-06 POSIX row says the
  PowerShell note was repaired that day, its Windows run owed.
- **Pinned by a gate**: `tools/check-open-question-claims.mjs`, a step of `pnpm lint`, reads each question's state from
  `open-questions.md` and fails on a sentence in the code, the views, `codebase.md`, `first-release-plan.md` or the
  architecture README that calls a settled question open, unless struck or followed by its ruling, and on a claim that a
  question was raised that names none. `tools/check-open-question-claims.test.ts` runs it over the tree and over fixtures
  (the forms above, a range, a table row, struck history, an open and a deferred question). On the tree before this repair
  (`7eee460`) the gate named fifteen claims: the three unraised ones, `report.ts`'s "asked as OQ-120", and every record
  line above but three, the views' OQ-154 note (its sentence names no question), their OQ-172 line ("the build's reading
  of OQ-172", a form it does not read, below) and `first-executions.md`, which it does not read; after it, none. The other
  three comments said "OQ-<n>'s reading", the form below, and were found by reading, not by the gate.
- ~~**Not repaired here, and why.** Code comments that call a ruled behaviour "OQ-<n>'s reading" without saying "the build's
  reading" or "asked" (some forty, OQ-22, OQ-38, OQ-82, OQ-145, OQ-147, OQ-165 and others) name the behaviour the
  question settled and do not claim the question open; the gate does not read them, nor ADRs, the defect notes or
  `open-questions.md` itself, whose history stays as written.~~ *Falsified at the bundle's verification (repair round 1):
  the form "OQ-<n>'s reading" is the one this note's own first paragraph counts as the defect for `ArtifactLinks.tsx` and
  `WorkspaceView.tsx`, and the swept views still carried it for ruled questions, `03-runtime-view.md`'s OQ-103 line
  making the very claim the `WorkspaceView` comment had been repaired of.*
- **Repair round 1: a ruled question's answer called the build's reading.** The gate reads a third kind of sentence,
  "OQ-<n>'s reading", "OQ-<n>'s build reading" or "the build's reading, recorded beside OQ-<n>" of a settled question, and
  fails it unless the ruling stands beside it. Run over the round's base tree (`b7d8c3d`) the final gate names 64: eleven in
  the views and `first-release-plan.md` (`02-process-view.md` OQ-161; `03-runtime-view.md` OQ-103, OQ-159 and OQ-194;
  `04-seams.md` OQ-181 and OQ-184; the views' change log OQ-102, OQ-103 and OQ-165; `first-release-plan.md` OQ-69 and
  OQ-71), one in `packages/engine/CONTEXT.md` (OQ-102, "which no directive governs" of what `PD-ORCH-005` clause 25 now
  states, struck and annotated) and fifty-two in code comments, tests and proofs (OQ-5, OQ-22, OQ-23, OQ-38, OQ-82,
  OQ-100, OQ-102, OQ-141, OQ-145, OQ-147, OQ-149, OQ-152, OQ-154, OQ-159, OQ-161, OQ-164, OQ-165, OQ-178, OQ-181, OQ-182,
  OQ-184, OQ-190, OQ-193). Each now says how it was ruled: "confirmed 2026-10-06 by R-071" where the owner confirmed the
  build, "ruled 2026-10-06 by R-071" for OQ-165, the closing of 2026-09-06 or 2026-09-11 for OQ-5, OQ-23 and OQ-38, the
  directive clause where one states it (`PD-ORCH-005` clauses 23, 25 and 26, `PD-STARTUP-003`), "superseded by its
  ruling" for OQ-194's literal reading. Four lines of the same form already carried words the gate takes as history
  and are unchanged ("Until 2026-10-06 this read" at `sessions.ts`'s OQ-182 and `config/src/mcp/index.ts`'s OQ-194,
  "clause 18 supersedes OQ-98's reading" in `continue-action.test.ts`, "since the ruling of 2026-10-06" at `todo.ts`'s
  OQ-102); two more passed on a word that was not their ruling and were annotated all the same (`02-process-view.md`'s
  OQ-82, `03-runtime-view.md`'s OQ-182). `packages/ui/src/agents.ts`'s run-level persona is no answer to OQ-97 but a side
  note its entry records as not ruled; its comment said "the build's reading, recorded beside OQ-97" and now says that.
  The gate also reads `AGENTS.md`, `docs/module-map.md`, the domain glossaries and `.claude/rules/`, which describe the
  build too. Its history words are tied to a ruling: a bare "closed" ("OQ-37 stays open; the socket is closed after
  use") and "not ruled" no longer pass, and "until 2026-…" counts only before a reading, in its own sentence. Two
  fixture cases in `tools/check-open-question-claims.test.ts` pin the reading form and the bare "closed", both red on
  the round's base gate; the tree case is red on the base tree with the 64 above. ADRs, directives, `open-questions.md`,
  `first-executions.md` and the defect notes keep their history as written and are not read.
