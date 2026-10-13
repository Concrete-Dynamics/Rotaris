## A requirement two directives narrow can name only one, so the second is recorded under another verb

`tools/symbol-artifact/generate.mjs` keeps one directive per verb per requirement (`NARROWED_BY`, `EXTENDED_BY` and
`SUPERSEDED_BY` each map a requirement to one identifier) and refuses a second ("… is narrows by both … and …; precedence
must be unambiguous"). `docs/product/README.md` defines the verbs by what a directive does to the requirement:
**Narrows**, the requirement still governs except in the case the directive names; **Extends**, the requirement is
untouched and still governs in full. When a second directive narrows a requirement another directive already narrows,
the record cannot say so, and the builds have written it under the other verb (or dropped it) to get past the generator:

- `PD-TOOLS-013` (OQ-226, 2026-10-07) adds a member to REQ-TOOLS-112's closed `outcome_kind` set and a mapping to its
  test 1, and exempts an interrupted call from REQ-SESSION-136's issues: both narrowings, recorded as **Extends**
  because `PD-TOOLS-009` and `PD-SESSION-003` already narrow those two.
- `PD-CONFIG-003` (OQ-218) names REQ-CONFIG-256 and REQ-CONFIG-417 as **Narrows** where its ruling named them extended,
  because `PD-WORKSPACE-002` already extends them.
- `PD-SHELL-009` (OQ-206) carries its ruling's REQ-SHELL-021 through REQ-SHELL-122, because `PD-SHELL-001` already
  narrows REQ-SHELL-021.

Each build stated the substitution in its directive and its first-executions row, so nothing is hidden, but the generated
artifact (`packages/kernel/src/generated/requirements.ts`) answers "extended by PD-TOOLS-013 … still governs in full" for
REQ-TOOLS-112, which no longer governs in full, the shape acceptance finding F15 repaired for `PD-ORCH-014`
([`pd-orch-014-records-req-config-135-as-extended-where-oq-53-narrows-it`](pd-orch-014-records-req-config-135-as-extended-where-oq-53-narrows-it.md)).
Whether two directives may narrow one requirement in disjoint cases (the register then holding a list), or a later one
must revise the earlier, is a decision for the record's owner, not this note.

Noticed 2026-10-07 by fin31's reviewer while reviewing PD-TOOLS-013. Recorded, not repaired.

## Specs

- `docs/product/README.md`, "The shape of an entry" (the meaning of Narrows and Extends) and "The back-pointer, in place"
  ("to match the disposition").
- No requirement's text is contradicted.

## Relevant files

- `tools/symbol-artifact/generate.mjs`: the per-verb maps and the "precedence must be unambiguous" refusal.
- `docs/product/directives.md`: the disposition blocks of `PD-TOOLS-013`, `PD-CONFIG-003` and `PD-SHELL-009`, and the
  italic lines under them that state the substitution.
- `packages/kernel/src/generated/requirements.ts`: `NARROWED_BY` and `EXTENDED_BY`, generated from those blocks.

## Repaired — 2026-10-13

Ruled as [OQ-237](../../architecture/open-questions.md) (GV1, under the owner's delegation, R-072): Narrows and Extends hold
a list per requirement, Supersedes stays single, and two narrowings of one requirement state disjoint cases with at least
one naming the other. Built by fin34 (`fin34-record-and-cancels`):

- `tools/symbol-artifact/generate.mjs` holds `narrowedBy` and `extendedBy` as lists and emits `NARROWED_BY` and
  `EXTENDED_BY` as sorted arrays (`Partial<Record<RequirementId, readonly DirectiveId[]>>`); the double-Supersedes refusal
  stays; Supersedes beside Extends is refused; a pair of narrowings of which neither entry names the other is refused; each
  requirement's JSDoc names every directive under every verb.
- The dispositions are corrected, each old line or reason kept beside its replacement: `PD-TOOLS-013` narrows REQ-TOOLS-100,
  REQ-TOOLS-112 and REQ-SESSION-136; `PD-SHELL-009` narrows REQ-SHELL-021 beside REQ-SHELL-122, with a new note at
  REQ-SHELL-021 and a line appended to `PD-SHELL-001`'s; `PD-WORKSPACE-002` narrows REQ-CONFIG-464 (its cross-reference now
  a labelled note), REQ-CONFIG-256 and REQ-CONFIG-417; `PD-CONFIG-003`'s Narrows stays, its forced-by-the-generator reason
  marked as no longer one. The re-read the ruling asked for found two more the note did not list: `PD-ORCH-004` narrows
  REQ-TOOLS-152 (Extends in R-058 "because the symbol artifact holds one narrowing directive per requirement"), and
  `PD-LIBRARY-001` narrows REQ-LIBRARY-099 and REQ-TOOLS-148, whose closed section sets gain `commands`. The "lands here
  whatever it is about" sentences of `PD-TOOLS-006` and `PD-ORCH-006`, the folded revision of `PD-MONITOR-004` and the
  "it would also be refused" of `PD-ORCH-003` (its supersession half still holds) are marked as no longer binding.
- `docs/product/README.md` is amended in place (Identifiers; "Two directives on one requirement"; "The back-pointer, in
  place") and carries the first execution; OQ-66, OQ-206, OQ-216, OQ-218 and OQ-226 carry pointer lines.

Pinned by `tools/symbol-artifact/back-pointers.test.ts`'s OQ-237 case (red on the uncorrected register: `expected [
'PD-TOOLS-009' ] to deeply equal [ 'PD-TOOLS-009', 'PD-TOOLS-013' ]`) and by `pnpm directive-proof`'s new counterfactuals
(42/42; 29/42 on the old generator). Recorded beside it, not repaired: `PD-LIBRARY-001`'s Extends on REQ-LIBRARY-088 and
REQ-LIBRARY-090, outside the bounded re-read
([`pd-library-001-extends-two-requirements-whose-closed-sets-it-changes`](../pd-library-001-extends-two-requirements-whose-closed-sets-it-changes.md)).
