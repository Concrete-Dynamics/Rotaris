## Records and code comments describe ruled questions as open, and cite questions that were never raised

After the owner's ruling of 2026-10-06 ([R-071](../product/requests.md#r-071)) closed every open question then
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
