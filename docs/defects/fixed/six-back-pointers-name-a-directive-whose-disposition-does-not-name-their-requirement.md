## Six back-pointers name a directive whose disposition block does not name their requirement

`docs/product/README.md` has a directive that supersedes, narrows or extends a requirement write a note at that
requirement, labelled `Superseded by`, `Narrowed by` or `Extended by` "to match the disposition", and the symbol
generator turns each directive's disposition block into `SUPERSEDED_BY`, `NARROWED_BY` and `EXTENDED_BY` in
`packages/kernel/src/generated/requirements.ts`. Read side by side on `origin/main` at `1e1aa76`, every back-pointer in
`docs/spec/` agrees with the register but six, each of which names a directive that the generated artifact does not
record as reaching that requirement at all, under any verb:

| Where | The back-pointer | What the register records for the requirement |
|---|---|---|
| `docs/spec/02-run-monitoring-steering.md:494` | REQ-MONITOR-173, **Extended by** `PD-LIBRARY-002` | nothing |
| `docs/spec/10-sandbox-network-egress.md:184` | REQ-SANDBOX-104, **Narrowed by** `PD-TOOLS-002` | nothing (`PD-TOOLS-002`'s Narrows names REQ-SANDBOX-103 and REQ-SANDBOX-105 beside it, not 104) |
| `docs/spec/13-workspace-context-onboarding.md:169` | REQ-WORKSPACE-041, **Extended by** `PD-LIBRARY-002` | narrowed by `PD-WORKSPACE-002` only |
| `docs/spec/14-library-artifacts-improvements.md:14` | the domain's introduction, **Extended by** `PD-LIBRARY-002` | not a requirement |
| `docs/spec/14-library-artifacts-improvements.md:80` | REQ-LIBRARY-017, **Extended by** `PD-LIBRARY-002` | nothing (`PD-LIBRARY-002` names it in its `New:` line, as the fence a new pass sits beside) |
| `docs/spec/19-notifications-errors-recovery.md:638` | REQ-NOTIFY-251, **Extended by** `PD-LIBRARY-002` | nothing |

So a reader of code who asks the generated artifact "is the requirement I am about to cite still the thing that
governs?" gets "untouched" for REQ-SANDBOX-104, while the specification file says a directive narrowed it. Either the
directive's disposition block omits a requirement it reaches (likely for REQ-SANDBOX-104, whose note states a case the
requirement no longer governs), or the note is a cross-reference written in the shape of a back-pointer (likely for
`PD-LIBRARY-002`'s, whose entry declares itself `New` beside three it extends). Which, per note, is a reading for the
directive's owner to confirm, not one this note makes; the repair is a disposition line or a relabelled note, never an
edit of a requirement's text.

Noticed 2026-10-06 while repairing acceptance finding F15
([`pd-orch-014-records-req-config-135-as-extended-where-oq-53-narrows-it`](pd-orch-014-records-req-config-135-as-extended-where-oq-53-narrows-it.md)).
`tools/symbol-artifact/back-pointers.test.ts` holds these six as its known list, so a seventh fails the suite, and so
does one of these six once it agrees.

## Specs

- `docs/product/README.md`, "The back-pointer, in place": "Use `Superseded by`, `Narrowed by` or `Extended by` to match
  the disposition."
- `PD-LIBRARY-002` (`> **Extends:** REQ-LIBRARY-003, REQ-LIBRARY-006, REQ-LIBRARY-015` and a `New:` line) and
  `PD-TOOLS-002` (its `Narrows:` line) in `docs/product/directives.md`.
- No requirement's text is contradicted.

## Relevant files

- `docs/spec/02-run-monitoring-steering.md`, `docs/spec/10-sandbox-network-egress.md`,
  `docs/spec/13-workspace-context-onboarding.md`, `docs/spec/14-library-artifacts-improvements.md`,
  `docs/spec/19-notifications-errors-recovery.md` — the six notes.
- `docs/product/directives.md` — `PD-LIBRARY-002`'s and `PD-TOOLS-002`'s disposition blocks.
- `tools/symbol-artifact/generate.mjs` — what the register's disposition becomes in the artifact.
- `tools/symbol-artifact/back-pointers.test.ts` — the check and its known list.

## Repaired

2026-10-07, under the R-072 consortium's ruling on OQ-222 (BP1), which read five of the six notes as reaches the
disposition blocks left out and the sixth as a cross-reference. No requirement text and no rule text changed:

- `PD-TOOLS-002`'s Narrows line gained REQ-SANDBOX-104, and with it REQ-TOOLS-071 and REQ-TOOLS-072, which its rule names
  by identifier and narrows the same way
  ([`three-pd-tools-002-reaches-and-one-pd-shell-003-reach-lack-a-note-or-a-disposition`](three-pd-tools-002-reaches-and-one-pd-shell-003-reach-lack-a-note-or-a-disposition.md)).
- `PD-LIBRARY-002`'s Extends line gained REQ-LIBRARY-017, REQ-MONITOR-173, REQ-NOTIFY-251 and REQ-WORKSPACE-041, and its
  `New:` line was retired, quoted word for word in the italic line beneath the block
  ([`the-symbol-generator-drops-an-identifier-written-on-a-new-line`](the-symbol-generator-drops-an-identifier-written-on-a-new-line.md)).
- Domain 14's introduction reads "**This domain carries a second analysis pass under `PD-LIBRARY-002`, 2026-09-17.**",
  a cross-reference no register entry stands behind; `docs/product/README.md`, "The back-pointer, in place", now says a
  note naming a directive with no disposition for its requirement takes none of the three labels.
- The notes at REQ-WORKSPACE-041 and REQ-MONITOR-173 each gained a dated sentence (OQ-65's read; the retrospective's
  start gesture in the card header), so both stay true.

`tools/symbol-artifact/back-pointers.test.ts` lost its known list: its general case asserts that no note disagrees,
red on the old register with exactly these six; a converse case asserts that every register entry has its note; and an
OQ-222 case pins the five register entries and REQ-WORKSPACE-041's narrowing by `PD-WORKSPACE-002`. `pnpm symbols`
gained three narrowed and four extended entries: 177 and 51 to 180 and 55 as built, 181 and 53 to 184 and 57 on the
head rebased onto origin/main at landing.
