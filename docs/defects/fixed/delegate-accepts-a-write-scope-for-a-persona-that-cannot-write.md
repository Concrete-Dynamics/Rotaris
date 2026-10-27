## `delegate` accepts a write scope for a persona that cannot write

A delegation's `write_scope` is validated for its patterns and never against the persona's tools. A read-only persona
given a scope is accepted, claims the path — fencing the parent and every sibling out of it — cannot write it, and its
report can still read `succeeded` over its own "I have no file-writing tool".

Live-run finding: D6 (live runs of 2026-09-29)

**Ruled 2026-09-29 — [OQ-112](../../architecture/open-questions.md), [`PD-TOOLS-006`](../../product/directives/pd-tools-006.md#pd-tools-006) revision 3,
[R-067](../../product/requests.md#r-067).** A delegation carrying a `write_scope` to a persona that holds no file-writing
tool (`write_file`, `haet_edit` or its alias `haet`) is refused with status `rejected` and no record, beside
REQ-TOOLS-152's other refusals; the reason says the persona cannot write files and names the personas that can, where
the catalogue says. That refusal is this note's repair.

## Specs

- `PD-TOOLS-006` revision 3 (OQ-112), narrowing `REQ-TOOLS-152`. `REQ-ORCH-095`'s text-only completion is what let the
  child end `succeeded`, and it is unchanged.

## Evidence

- Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), session `379f1490`, tool call #24: `delegate` to `codebase-analyst` with `write_scope: ["docs/overview.md"]`,
  "queued — Accepted". The child `c` (`bg_a879a419`) ran 03:07:35.708–03:10:22.727 with read-only `granted_tools` and
  reported `succeeded` over "Blocker: I have no file-writing tool…"; the orchestrator re-commissioned `c2`
  (`bg_d49ce6f8`, `docs-writer`) for the same file.

## Relevant files

- `packages/engine/src/children/orchestration.ts:224-238` — the scope's validation and the spawn, with no check against
  `persona.tools`.
- `packages/engine/src/children/write-scope.ts` — `validateWriteScope`.
- `packages/agent-tools/src/tools/delegation.ts` — the tool's schema and refusal rendering.

## Repaired — 2026-09-29

Repaired 2026-09-29 under [R-067](../../product/requests.md#r-067), as [`PD-TOOLS-006`](../../product/directives/pd-tools-006.md#pd-tools-006)
revision 3 ([OQ-112](../../architecture/open-questions.md)) states. `IterationChildren.delegate` now refuses a delegation
whose `write_scope` holds patterns for a known persona that cannot write files. The check comes straight after the
scope's own validation, before any record exists. The refusal carries status `rejected` and no task id. The check is
`writesFiles` in `write-scope.ts`: the persona holds `write_file`, `haet_edit` or `haet`, and neither `coordinator_only`
nor `read_only` removes them. Those are the two REQ-TOOLS-006 controls that reach a child's grant; the run-scoped
allow-list binds the entry agent alone. The reason, `scopeWithoutWriterReason`, reads "write_scope was given to
'<persona>', which cannot write files: it holds no file-writing tool (write_file, haet_edit). The delegation was not
started." It then names the catalogue's writers (`fileWriters`) when there are any: the configured known roles, the
same list the unknown-persona refusal gives, or the built-in table (`coding-agent, tester, docs-writer, refactorer`).
An unknown persona is still refused by the ledger, with the list of known personas. A delegation without a scope is
unchanged, as is REQ-ORCH-095's text-only completion. The persona checked is the one the ledger resolves, an alias
included: a configured catalogue resolves aliases itself, and where the built-in table stands alone `resolveRole` is
read, as `ChildLedger.spawn` reads it.

*The first repair's gap, found by the branch's verification and kept beside its repair:* the check read `personaOf`,
whose built-in path looks the name up in the table and never in `ROLE_ALIASES`. `delegate({persona: 'playwright',
write_scope: [...]})` skipped the check as an unknown persona, and the ledger then accepted it as `ui-verifier`, which
holds no file-writing tool. The check now reads the ledger's resolution.

Evidence: `packages/engine/src/children/children.test.ts`, "PD-TOOLS-006 revision 3 (OQ-112, live-run finding D6)…".
It is the duress call's shape: `codebase-analyst` with `write_scope: ["docs/overview.md"]`. The test checks that the call
is rejected, that no child is recorded, that the resumed parent reads the reason with the writers named, and that no
task id appears. It fails with the check removed. `write-scope.test.ts`, "PD-TOOLS-006 revision 3 (OQ-112)…", pins three
things: the predicate over the controls (`haet` alone writes; `read_only`, `coordinator_only` and `terminal`-only
personas do not), the catalogue's writers for the built-in table and for a configured resolver, and the reason's text.
A second case in `children.test.ts`, "…an ALIAS of a persona that cannot write files…", delegates to `playwright` with a
scope on the built-in table's path and checks that it is refused as `ui-verifier` with no record; it fails with the
check reading `personaOf` again. Two earlier write-scope cases in `children.test.ts` scoped a `codebase-analyst` and
now scope a `docs-writer`, since the directive forbids the earlier form.

Live, 2026-09-29: `pnpm live-run --confirm --only=duress` against the unmetered `katalyst` endpoint, built from this
branch's code, pack `.live-run/runs/2026-09-29T07-18-48-658Z` (this branch's worktree; git-ignored), session `b4a768a2`.
At 07:38:05 the orchestrator delegated `wave3-f verification` to `verifier`, which holds `terminal` and no file tool,
with a `write_scope`. The call answered: "Task 'wave3-f verification': rejected — write_scope was given to 'verifier',
which cannot write files: it holds no file-writing tool (write_file, haet_edit). The delegation was not started.
Personas that can write files: coding-agent, tester, docs-writer, refactorer. …" No record was made. Its next request,
15 s later (traffic #116), delegated the same task to `docs-writer` (`bg_6d91af9c`), which wrote `docs/verification.md`
and ended `succeeded`. The earlier run lost 2 min 47 s and a second child to the same mistake.

Live again, 2026-09-29, built from the alias repair: `pnpm live-run --confirm --only=duress`, pack
`.live-run/runs/2026-09-29T08-18-41-076Z` (this branch's worktree; git-ignored), session `059ae1d7`. The orchestrator
made the finding's own mistake in its first request: `Wave 1c — write docs/overview.md` to `codebase-analyst` with
`write_scope: ["docs/overview.md"]`. It was refused with the writers named, no record was made, and the next request
(traffic #20) delegated it to `docs-writer`, which wrote the file. In wave 3 it gave a scope to `verifier`; that was
refused the same way, and the next request (#128) delegated to `tester`. No alias was delegated in this run; the alias
is shown by the unit case above only.
