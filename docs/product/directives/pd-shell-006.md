[Product directives](../directives.md) › PD-SHELL-006

<a id="pd-shell-006"></a>

### PD-SHELL-006 — four tool results keep the plural marker their requirements spell

REQ-SHELL-044's rule that "the literal parenthesised '(s)' form is never rendered anywhere in the product" SHALL NOT reach
four tool results whose requirements fix their text as a contract a caller may match: REQ-TOOLS-110's
`Sent <n> byte(s) to session <id>.`, REQ-TOOLS-134's `N match(es) for '<pattern>':`, REQ-LIBRARY-100's `<N> artifact(s):`,
and REQ-LIBRARY-089's refusal beginning `Invalid tag(s): `. Each keeps its marker exactly as spelt, in the result the model
receives and wherever the transcript's tool row draws that result. Every other string the product can draw agrees with its
count, as REQ-SHELL-044 states.

**As built.** `tools/check-plural-markers.mjs` names these four in its `ALLOWED` list and fails `pnpm lint` on any other
literal marker in a string the product can draw.

**Why, and what it costs.** OQ-138: the four texts are fixed word for word by their requirements, and the tool row draws
a tool's result, which REQ-SHELL-044's "anywhere" reaches. The owner ruled them fixed contract text. What it costs: four
strings a user can read in the transcript keep a marker the rest of the product never shows.

> **Narrows:** REQ-SHELL-044

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-138.*
