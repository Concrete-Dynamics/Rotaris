## The built routing table drops REQ-ORCH-028's capability clauses

REQ-ORCH-028's default routing carries two statements of capability: a question about the repository as it stands goes to
`codebase-analyst`, "which reads the workspace but does not modify it", and a question answerable only from outside the
repository goes to `librarian`, "which likewise does not modify the workspace". The built coordinator's routing table
(`ROUTING`, `packages/engine/src/children/personas.ts`) keeps the routes and drops both clauses, so the coordinator is
never told that either role cannot write.

In both duress live runs of 2026-10-06 the coordinator then gave `codebase-analyst` a write task (#107 at `c2fdd6a`, #7
at `c2a9444`), each refused at the call by PD-TOOLS-006 revision 3's write-scope refusal.

Found by the R-072 consortium's ruling of [OQ-216](../../architecture/open-questions.md) (advocate B), reading the
live-run findings L4 and N3.

## Specs

- `REQ-ORCH-028` — "The default routing MUST be: … a question about the repository as it stands → `codebase-analyst`,
  which reads the workspace but does not modify it; a question answerable only from outside the repository … →
  `librarian`, which likewise does not modify the workspace; …". The built table omits both clauses. Covered work; no
  directive.

## Relevant files

- `packages/engine/src/children/personas.ts` — `ROUTING`, which `ORCHESTRATOR_COORDINATING` places in the built
  orchestrator's instructions.

## Repaired — 2026-10-07, under OQ-216's ruling (R-072)

`ROUTING` now reads "a question about the repository as it stands → codebase-analyst, which reads the workspace but does
not modify it; a question answerable only from outside the repository → librarian, which likewise does not modify the
workspace", REQ-ORCH-028's words; the comment above it keeps the reason the clauses were missing. Pinned by
"names codebase-analyst as reading the workspace without modifying it, and librarian as likewise not modifying it" in
`packages/engine/src/children/personas.test.ts`, red on the table before the repair. What each persona's tools let it do is
stated beside it in `delegate`'s description since `PD-TOOLS-006` revision 4. A configured `system_prompt` replaces this
table with the rest of the built-in prompt (REQ-CONFIG-100); the description is not replaced.
