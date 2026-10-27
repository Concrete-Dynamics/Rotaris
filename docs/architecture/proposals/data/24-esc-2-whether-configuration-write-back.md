# Architecture proposals — DATA slice — ESC-2 — Whether configuration write-back preserves comments

Part 24 of 25 of [the data proposal](../data.md), which indexes every part.

## ESC-2 — Whether configuration write-back preserves comments

`REQ-CONFIG-252` states plainly that everything the write path does not touch round-trips through
parse-and-re-emit, and that "**Comments and formatting are lost while content is preserved — the
observable cost of editing models from a UI**." That is a fixed observable.

Spike 2 showed that preserving comments is nearly free: `yaml`'s `Document` edit API keeps comments,
layout and key order through a targeted edit, and it is the same API ADR-DATA-03 already recommends
for tri-state. Preserving them is *less* work than deliberately discarding them.

The options:

1. **Match the specification** — parse and re-emit, losing comments. Conformant. Costs the user the
   comment header the bootstrap itself writes (`REQ-CONFIG-025` specifies a comment header explaining
   what the file overrides), the first time they touch a model slot on the settings screen.
2. **Preserve comments** — a strictly better user outcome, and cheaper to build, but it changes an
   observable the specification fixes, so a black-box conformance comparison would flag it.

This is a product decision because it changes what a user's file looks like after they use the
settings screen, and because the specification went out of its way to name the loss as a cost rather
than as an incidental. It is worth deciding deliberately rather than inheriting.

Note the interaction: `REQ-CONFIG-248` requires key order preserved and never alphabetised, which
option 2 also satisfies. Nothing else depends on comments being lost. **ESCALATE.**
