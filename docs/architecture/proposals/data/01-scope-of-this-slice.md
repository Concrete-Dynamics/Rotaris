# Architecture proposals — DATA slice — Scope of this slice

Part 1 of 25 of [the data proposal](../data.md), which indexes every part.

## Scope of this slice

This slice owns everything the product writes down and everything it reads back: what lives in a
database and what stays as files; how the layered YAML configuration is loaded, merged, validated
and watched; how the per-user desktop preference store relates to that configuration; how Git is
invoked and how worktrees, checkpoints and integration are managed; and how the requirement
delivery and traceability stores behave as they grow.

It does **not** own: the run event journal itself (domain 20, `REQ-EVENTS`), the session snapshot
format (domain 07, `REQ-SESSION`), permission and sandbox policy (domains 05 and 10), or model
routing (domain 04). Where a decision of mine depends on one of those, the dependency is named.

Requirement counts in scope: `REQ-GIT` 161 identifiers (8 withdrawn), `REQ-TRACE` 512 (16
withdrawn), `REQ-LIBRARY` 175 (14 withdrawn), `REQ-CONFIG` 476 (16 withdrawn) — 1,324 identifiers,
1,270 carrying live behaviour, roughly a third of the shipping total.

---

# Part 1 — Extracted constraints

Each constraint is labelled **hard** (the specification fixes an observable only some designs can
produce), **strong hint** (not fixed, but one design makes several requirements natural and the
alternatives make them awkward), or **free** (genuinely an implementation choice).
