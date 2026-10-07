## Three PD-TOOLS-002 reaches and one PD-SHELL-003 reach lack a back-pointer or a disposition

A directive's register entry and the note at its requirement record one fact twice (`docs/product/README.md`, "The
back-pointer, in place"). `tools/symbol-artifact/back-pointers.test.ts` read only one direction, a note against the
register, so a requirement the register lists with no note at it went unseen, and so did one the directive's rule
reaches by name with neither. On `origin/main` at `a68f121`:

| Requirement | The register | The note at the requirement |
|---|---|---|
| REQ-TOOLS-069 | Narrowed by `PD-TOOLS-002` | none |
| REQ-SHELL-119 | Extended by `PD-SHELL-003` | none |
| REQ-TOOLS-071 | nothing | none, though `PD-TOOLS-002`'s rule names it beside REQ-SANDBOX-104 and REQ-SANDBOX-110 and removes its downgrade sentence (no transcript message, no `permission_mode_downgraded` event, no log warning) |
| REQ-TOOLS-072 | nothing | none, though the rule names it among the advisory requirements and removes its "states that a downgrade was applied" clause |

So a reader of `docs/spec/05-tools-permissions-approvals.md` finds REQ-TOOLS-071 and REQ-TOOLS-072 stating downgrade
behaviour the product no longer has, with nothing at either saying so, and a reader of REQ-TOOLS-069 or REQ-SHELL-119 is
not told a directive reaches it. The converse direction was raised by the R-072 consortium's advocate B while ruling
BP1, and found by running that check against the register: exactly REQ-TOOLS-069 and REQ-SHELL-119. REQ-TOOLS-071 and
REQ-TOOLS-072 were named by both advocates and added to `PD-TOOLS-002`'s Narrows by the ruling (OQ-222).

## Specs

- `docs/product/README.md`, "The back-pointer, in place": "A directive that supersedes, narrows or extends a
  requirement writes a note **at that requirement** … in the same commit."
- `PD-TOOLS-002`'s rule (`docs/product/directives.md`), which names REQ-TOOLS-071 and REQ-TOOLS-072 by identifier;
  `PD-SHELL-003`, whose Extends names REQ-SHELL-119.
- No requirement's text is contradicted.

## Relevant files

- `docs/spec/05-tools-permissions-approvals.md` — REQ-TOOLS-069, REQ-TOOLS-071, REQ-TOOLS-072.
- `docs/spec/12-desktop-shell-windows.md` — REQ-SHELL-119.
- `docs/product/directives.md` — `PD-TOOLS-002`'s Narrows line.
- `tools/symbol-artifact/back-pointers.test.ts` — the check, which read one direction.

## Repaired

2026-10-07, under the ruling on OQ-222 (BP1, R-072). `PD-TOOLS-002`'s Narrows line names REQ-TOOLS-071 and
REQ-TOOLS-072 (with REQ-SANDBOX-104), with a dated italic line beneath it; "Narrowed by `PD-TOOLS-002`" notes were
written at REQ-TOOLS-069, REQ-TOOLS-071 and REQ-TOOLS-072, and an "Extended by `PD-SHELL-003`" note at REQ-SHELL-119
beside its `PD-SHELL-009` narrowing, each closing "Written 2026-10-07". `tools/symbol-artifact/back-pointers.test.ts`
gained the converse case (every `SUPERSEDED_BY`, `NARROWED_BY` and `EXTENDED_BY` entry has its labelled note), red on
the old record with exactly REQ-TOOLS-069 and REQ-SHELL-119, and its OQ-222 case pins REQ-TOOLS-071 and REQ-TOOLS-072
to `PD-TOOLS-002`.
