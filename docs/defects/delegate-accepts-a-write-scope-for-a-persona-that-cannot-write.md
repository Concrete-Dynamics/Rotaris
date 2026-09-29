## `delegate` accepts a write scope for a persona that cannot write

A delegation's `write_scope` is validated for its patterns and never against the persona's tools. A read-only persona
given a scope is accepted, claims the path — fencing the parent and every sibling out of it — cannot write it, and its
report can still read `succeeded` over its own "I have no file-writing tool".

Live-run finding: D6 (live runs of 2026-09-29)

**Ruled 2026-09-29 — [OQ-111](../architecture/open-questions.md), [`PD-TOOLS-006`](../product/directives.md#pd-tools-006) revision 3,
[R-067](../product/requests.md#r-067).** A delegation carrying a `write_scope` to a persona that holds no file-writing
tool (`write_file`, `haet_edit` or its alias `haet`) is refused with status `rejected` and no record, beside
REQ-TOOLS-152's other refusals; the reason says the persona cannot write files and names the personas that can, where
the catalogue says. That refusal is this note's repair.

## Specs

- `PD-TOOLS-006` revision 3 (OQ-111), narrowing `REQ-TOOLS-152`. `REQ-ORCH-095`'s text-only completion is what let the
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
