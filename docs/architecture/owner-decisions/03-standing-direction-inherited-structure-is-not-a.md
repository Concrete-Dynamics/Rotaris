# Product-owner decisions on the architecture record — Standing direction: inherited structure is not a reason

Part 3 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part.

## Standing direction: inherited structure is not a reason

The product owner has directed that patterns carried over from the reference product's shape are to be
challenged rather than reproduced:

> If we are already rewriting my Rotaris app, there is no need to take over bad structural decisions,
> communication patterns and architectural choices.

This is a **standing amendment to the requirement-amendment policy**. Where a requirement encodes a
structural choice that follows from the reference product being a multi-process command-line and terminal
tool, and this product is one graphical desktop application, the requirement is a candidate for amendment
rather than a constraint to design around. The Specification Gate already permits divergence for behavioural
conflicts; this extends the same latitude to structural ones.

It does **not** license divergence for convenience, for implementation difficulty, or from requirements that
encode a genuine product behaviour the owner wants. The test is whether the requirement exists because of a
process model this product does not have.

---
