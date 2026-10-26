# ADR-0065 — The retrospective: a second analysis pass, user-started, workspace-wide, riding the improvement lifecycle unchanged

- **Status:** accepted, awaiting its first execution
- **Date:** 2026-09-17
- **Origin:** `PD-LIBRARY-002`, raised by the owner as [R-033](../../product/requests.md#r-033) on
  2026-09-17. The directive is the whole of what this record implements; where it governs, this ADR
  cites it rather than the requirement it extends.
- **Depends on:** ADR-0061 (the improvement artifact store's write path — the one writer this pass
  saves through), ADR-0058 (the workspace database, whose migration discipline v19 follows), ADR-0030
  (credential leasing — how a pass with no run obtains a bearer), ADR-0026 (the model boundary),
  ADR-0044 (the IPC contract — one new renderer command and one new host request), ADR-0049 (notices —
  the two this pass posts, both in the existing vocabulary), ADR-0036/0037 (configuration loading and
  when a change takes effect — the three keys).
- **Requirements:** `PD-LIBRARY-002` governing; `REQ-LIBRARY-003`, `006`, `008`, `009`, `015`, `016`,
  `017`, `019`, `020`, `021`, `022`, `023`, `024`, `025`, `026`, `035`, `037`, `040`, `042`, `045`,
  `046`, `047`, `116`, `122`..`127`, `162`, `165`; `REQ-WORKSPACE-041` (instruction-file discovery);
  `REQ-SHELL-135`, `REQ-SHELL-149` (how the activity is conveyed).

## Parts

Since 2026-10-26 the rest of this document is in [`0065-the-retrospective-pass/`](0065-the-retrospective-pass/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0065-the-retrospective-pass/01-context.md) | Context |
| [02](0065-the-retrospective-pass/02-decision.md) | Decision |
| [03](0065-the-retrospective-pass/03-consequences.md) | Consequences |
| [04](0065-the-retrospective-pass/04-alternatives-considered-and-rejected.md) | Alternatives considered and rejected |
| [05](0065-the-retrospective-pass/05-what-its-first-execution-owes.md) | What its first execution owes |
| [06](0065-the-retrospective-pass/06-what-its-first-execution-found-2026-09-17.md) | What its first execution found — 2026-09-17 |
| [07](0065-the-retrospective-pass/07-live-run-finding-l10-2026-09-29-r-067-the.md) | Live-run finding L10 — 2026-09-29 (R-067), the indicators' label measured, not only read |
| [08](0065-the-retrospective-pass/08-decision-7s-three-surfaces-made-to-agree-2026.md) | Decision 7's three surfaces made to agree — 2026-10-13 (`PD-LIBRARY-002` revision 2, OQ-236, R-072) |
| [09](0065-the-retrospective-pass/09-decision-2-and-the-per-run-history-2026-10-14.md) | Decision 2 and the per-run history — 2026-10-14 (`PD-LIBRARY-002` revision 3 (h), OQ-271, R-072) |
| [10](0065-the-retrospective-pass/10-decision-5-measured-live-2026-10-14-the-live.md) | Decision 5 measured live — 2026-10-14 (the live scenario run at `ce5f952`, F2; fin43) |
| [11](0065-the-retrospective-pass/11-decision-1s-system-text-measured-live-2026-10.md) | Decision 1's system text measured live — 2026-10-14 (the default live run at `b9e3005`, L1; fin46) |
| [12](0065-the-retrospective-pass/12-decision-5-and-adr-0022s-gate-2026-10-15-fin47.md) | Decision 5 and ADR-0022's gate — 2026-10-15 (fin47, `fin47-accept1-4`; acceptance finding A3) |
| [13](0065-the-retrospective-pass/13-decision-5s-refusal-set-built-and-measured-2026.md) | Decision 5's refusal set, built and measured — 2026-10-20 (`PD-LIBRARY-002` revision 6, OQ-363, R-072; loc1) |
