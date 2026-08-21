---
req-id: SWR-3517
status: approved
trace: required
test: required
type: technical
derived-from: SWR-3507
title: "One reader of the annotation grammar"
epic: SWR-3500
date: 2026-08-16
source: docs/plans/2026-08-16-requirements-migration.md
---

# SWR-3517 — One reader of the annotation grammar

SWR-3507's fourth criterion asks that executing a worklist leave no `@traces`
pointing at a removed requirement. Executing it means rewriting annotations, and
a rewriter needs to know something the reference sweep never had to say: not
*which* requirements a file claims, but *what is written where*.

`Reference` fans a multi-id annotation out into one record per id, each carrying
the line its own symbol sits on, with no back-link to the call. A rewriter
holding one cannot tell a lone id from one of five, cannot find where the call
begins and ends, and cannot tell a decorator from the same call applied to a name
as a statement. Measured over this repository: **8522 annotation call sites, of
which 2121 carry more than one id, 53 are wrapped over several lines, and 1 is
the call form.** A rewriter that guessed from references alone would corrupt
every one of them.

The wrong fix is a second parser. The annotation grammar is exactly the kind of
thing two readers drift on, and ReqToCode's own sweep is the other reader.

Derived from: [SWR-3507](SWR-3507-superseding-migration.md)

Requirement: the annotation convention answers at call granularity as well as at
reference granularity, from one scan.

- A convention yields annotations carrying their kind, their line span, their
  character span, and every id they hold with each id's own line and span.
- Whether the annotation is a decorator or the call form is part of the answer,
  because removing the second is deleting behaviour rather than a claim.
- The reference reading is *derived* from the annotation reading, so a file's
  declared ids cannot differ between the two.
- The package stays stdlib-only, as its own constraint requires.

## Acceptance criteria

- A multi-id annotation yields one annotation carrying every id, and the same
  ids the reference reading reports.
- An annotation wrapped over several lines reports the span it really occupies,
  not the line one of its symbols happens to sit on.
- The call form is distinguishable from a decorator.
- The reference reading over any file is unchanged by this: the repository's own
  sweep reports the same traced and covered counts as before.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Single-id, multi-id, wrapped and call-form annotations, and that both readings agree | The annotation convention | `tests/unit/reqtocode/test_conventions.py` |
| Integration | The repository's own sweep is byte-identical before and after | ReqToCode over this repository | `tests/unit/reqtocode/test_traceability_meta.py` |
| User-flow E2E | N/A — a technical requirement; its product flow is SWR-3507's migration | — | — |

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
