[Product directives](../directives.md) › PD-ORCH-010

<a id="pd-orch-010"></a>

### PD-ORCH-010 — a child is never named after a root of its session

*Renumbered before landing: built as `PD-ORCH-009` on its branch, it took the next free number, `PD-ORCH-010`, when `PD-ORCH-009` (the answerless entry role, OQ-199) landed on `main` first; its citations followed.*

Beside REQ-ORCH-044's rule, a delegated child at any depth SHALL NOT take as its canonical name the canonical name or the
persona of the root it works under, nor of any root the session has recorded: each iteration's root persona and root
canonical name, and each publishing root that no iteration records. Such a name is in use for that child, and the child is
renamed `<name>_<n>` by REQ-ORCH-044's own rule, though no sibling under its parent holds the name. A child named before
this rule was built keeps its name.

One case is accepted for the first release and left until after it: a **root named like an earlier child**. Where the
entry persona of a later run is one whose id an earlier child's canonical name already spells, the root's rows carry that
child's name, and the surfaces that know an agent by its name present the root as that child too, and the child as the
run-level agent. A root's name is its persona, which no ledger chooses.

**As built.** `ChildLedger.spawn` (`packages/engine/src/children/ledger.ts`) counts as taken, beside the parent's
children's names, its root's canonical name and persona and every recorded root's two names (`recordedRootNames`,
`packages/engine/src/children/naming.ts`). The accepted case is recorded in
[`fixed/a-root-named-like-an-earlier-child-is-presented-as-that-child-too.md`](../../defects/fixed/a-root-named-like-an-earlier-child-is-presented-as-that-child-too.md).

**Why, and what it costs.** OQ-158: a transcript row, a tool call and an artifact know their agent by a name alone, so a
child whose canonical name a root carries is drawn as both agents. REQ-ORCH-044 renames only a name "reused" under the
child's parent. The other reading, rows that carry an identity the surfaces match instead of the name, widens the
transcript row's envelope and leaves every row recorded before on the name rule. The owner accepted the renaming. What it
costs: a child the model names `orchestrator` two levels down is `orchestrator_1` where REQ-ORCH-044 alone would keep its
name, and the root named like an earlier child stays drawn as both until after the first release.

> **Narrows:** REQ-ORCH-044

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-158.*
