## The process pages say only the owner rules an open question

Since 2026-10-07 ([R-072](../../product/requests.md#r-072)) an open question that would wait on the owner is ruled by the
orchestrator's consortium (two advocate agents and a ruling agent, run as a dynamic workflow), and the record applies it
throughout `docs/architecture/open-questions.md`. The instructions a fresh agent reads first do not say so:
`.agents/skills/orchestrated-build/references/repository.md` still lists "ruling an open question" as "**The owner's
alone**", the skill's SKILL.md §1.2 and §5 send every ruling to "needs the owner" with no consortium step, and
`CLAUDE.md`'s "When the owner asks for something" implies every OQ waits on the owner. Nor does any of them say how two
parallel plans keep their open-question numbers apart, which lives only in session notes and
`references/environment.md` ("Parallel plans").

R-072 reaches open questions only: an escalation, and a clause the owner ruled personally (R-048, R-071,
`PD-CONFIG-003`), stay the owner's (`docs/architecture/open-questions.md`, OQ-214's re-ruling: "R-072 delegates open
questions and does not reach a clause the owner has already decided"). A workflow's builder still raises and never
decides.

Found by the 2026-10-13 survey at `6de2a67` (item N94).

## Specs

- None in the product. `docs/product/requests.md` R-072 is the authority the pages trail.

## Relevant files

- `.agents/skills/orchestrated-build/references/repository.md` — "Boundaries that bind every step", the owner's-alone bullet.
- `.agents/skills/orchestrated-build/SKILL.md` — §1.2 (classification), §5 (record every finding left unrepaired).
- `CLAUDE.md` — "When the owner asks for something".
- `docs/architecture/open-questions.md` — the 2026-10-07 paragraph near the top; OQ-214's re-ruling.

## Repaired — 2026-10-13 (fin41)

- `.agents/skills/orchestrated-build/references/repository.md` — the owner's-alone bullet keeps escalations and the
  reversal of a clause the owner ruled personally; an open question is ruled by the orchestrator's consortium under
  R-072, never by a workflow's builder or reviewer, which raise it at the number the brief assigns. The old wording is
  quoted beside it.
- `.agents/skills/orchestrated-build/SKILL.md` — §1.2 gains the consortium step (two independent advocates, user's and
  system's view, and a ruling agent, as one dynamic workflow; the ruling written into the entry and minted as a directive
  where it departs from a requirement); §2 gives each plan its own number ranges; §5 sends an unrepaired finding's open
  question to the consortium before the next round. CHANGELOG entry of 2026-10-13 ("open questions go to the
  consortium").
- `CLAUDE.md` — "When the owner asks for something" gains a paragraph: R-072, its scope, that only the orchestrator's
  consortium rules, and the parallel plans' number ranges with the next-free-number rule.

**Left, and proposed to the owner:** SKILL.md's protected invariant "nothing grants permissions, spends, rules an
owner's decision, or stores a secret" is unchanged. It is consistent with R-072 as written (a delegated open question is
no longer an owner's decision), and naming R-072 there would edit a protected invariant, which
`references/skill-review.md` step 4 makes the owner's to approve. The consortium's workflow script stays outside the
repository.

No test: documentation only. `node .agents/skills/orchestrated-build/scripts/orchestration.mjs self-test` passed.
