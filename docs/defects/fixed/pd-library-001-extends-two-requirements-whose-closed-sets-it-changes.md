## PD-LIBRARY-001 extends two requirements whose closed sets it changes

`PD-LIBRARY-001`'s disposition block lists REQ-LIBRARY-088 and REQ-LIBRARY-090 under **Extends**, and their back-pointers
read **Extended by**. "Extends" means the named requirement is untouched and still governs in full
(`docs/product/README.md`, "The shape of an entry"). Neither is untouched. REQ-LIBRARY-088's field inventory is closed —
the note at it says the closure "is what makes that an amendment rather than an addition made quietly", and the directive's
own "Why" says "this directive is that change" — and the directive adds `commands[]` to it. REQ-LIBRARY-090 fixes the
sidecar's sections "in this order", and the directive adds **Commands** before Edited Files. A change to an exact
enumeration is a narrowing (acceptance finding F15,
[`pd-orch-014-records-req-config-135-as-extended-where-oq-53-narrows-it`](pd-orch-014-records-req-config-135-as-extended-where-oq-53-narrows-it.md)),
so the generated artifact answers "Extended by PD-LIBRARY-001 … This still governs in full" for two requirements whose
stated sets no longer govern as written.

Noticed 2026-10-13 by fin34 while building OQ-237 (GV1), which corrected the same directive's REQ-LIBRARY-099 and
REQ-TOOLS-148 to **Narrows** on the same test. Those two were inside GV1's bounded re-read (the requirements two directives
reach); these two are reached by `PD-LIBRARY-001` alone and are outside it. Recorded, not repaired. Cosmetic: no code reads a
disposition to decide behaviour. Whether other directives reached by one directive alone carry the same shape was not
swept.

**Outcome (2026-10-13, fin36, `fin36-last-notes-and-optionals`): repaired as a record correction.** `PD-LIBRARY-001`'s
disposition block now reads `> **Narrows:** REQ-LIBRARY-088, REQ-LIBRARY-090, REQ-LIBRARY-099, REQ-TOOLS-148`, with the
two-line disposition it replaces quoted beside it under a dated correction citing OQ-237 (GV1) and acceptance finding F15,
and no revision taken, since no behaviour moves. The back-pointers at REQ-LIBRARY-088 and REQ-LIBRARY-090 read
**Narrowed by** and keep their text, each with the relabel line fin34 wrote at REQ-LIBRARY-099 and REQ-TOOLS-148. No other
directive reaches either requirement, so the pair rule does not apply. `pnpm symbols` now gives `NARROWED_BY` both and
`EXTENDED_BY` neither (203 narrowed, 59 extended, from 201 and 61), pinned by the case "OQ-237 (GV1, R-072), outside the
bounded re-read" in `tools/symbol-artifact/back-pointers.test.ts`, which fails on the old register; `pnpm directive-proof`
42/42. Reported in place in OQ-237's entry and `docs/product/README.md`'s first-execution section. Still not swept: whether
any other directive that alone reaches a requirement carries the same shape.

## Specs

- `docs/product/README.md`, "The shape of an entry" (the meaning of Narrows and Extends) and "The back-pointer, in place".
- No requirement's text is contradicted; the disposition and the labels disagree with the README's definitions.

## Relevant files

- `docs/product/directives.md`: `PD-LIBRARY-001`'s disposition block (`> **Extends:** REQ-LIBRARY-088, REQ-LIBRARY-090`).
- `docs/spec/14-library-artifacts-improvements.md`: the **Extended by** notes under REQ-LIBRARY-088 and REQ-LIBRARY-090.
- `packages/kernel/src/generated/requirements.ts`: `EXTENDED_BY['REQ-LIBRARY-088']` and `EXTENDED_BY['REQ-LIBRARY-090']`.
- `tools/symbol-artifact/back-pointers.test.ts`: would pin the corrected verbs.
