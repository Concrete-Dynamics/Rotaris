# Clean-Room Zone Policy

The rewrite separates agents that may inspect the reference implementation from agents that design
or write the replacement. The separation is a process control, not a stylistic preference: it is the
evidence that the implementation was produced independently.

## Zones

**RED — reference zone.** May read the frozen reference. Produces raw behavioral analysis into the
sealed area. May never write to this repository and may never later act as an implementation agent.

**Gateway.** Reads exactly one sealed RED file at a time and emits a sanitized behavioral
specification into `docs/spec/`. Never reads the reference itself. A separate scanning pass compares
each emitted specification against the reference and rewrites anything that leaked.

**Manager (clean side).** Coordinates the process, holds the gates, and reads only this repository
and sanitized agent returns. Never reads the reference, the sealed area, or raw audit reports.

**GREEN — implementation zone.** Reads only approved specifications, approved architecture
decisions, public technical documentation, approved design material, and sanitized oracle feedback.
Never reads the reference or any RED or sealed material.

**Oracle.** May run the reference to compare observable behavior against the rewrite. Reports
observable differences only — never source, stack traces exposing internals, or explanations of how
the reference behaves internally.

**PURPLE — audit zone.** May read both implementations to test for similarity. Writes no
implementation code. Raw reports stay sealed; only generic verdicts and required actions cross to
the clean side.

## Information flow

Information moves in one direction only, and only after sanitization:

```text
reference ──► RED ──► gateway ──► approved spec ──► architecture ──► GREEN
                                                                      │
                          sanitized behavioral differences ◄── oracle ┘
                          generic audit verdicts ◄────────── PURPLE
```

## Standing rules

1. No agent context is reused across zones. An agent that has read the reference is treated as
   contaminated for implementation purposes, permanently.
2. Sealed material lives outside this repository and is never committed.
3. When it is unclear whether a detail may cross into the clean side, it does not cross. It is
   converted into an observable behavioral fact, a requirement, a sanitized conformance result, or a
   generic audit verdict.
4. Speed, convenience, and implementation difficulty are never reasons to bypass the boundary.
5. Pretraining exposure is not assumed away. The control being demonstrated is that no reference
   material was retrieved or inspected during specification, design, or implementation sessions.

## What may appear in a specification

Specifications state what an implementation must do, observably. Concrete behavioral values —
timeouts, limits, exit codes, file formats, event names, command and flag names, configuration keys,
on-disk layouts — are required content: they are the compatibility surface, and a compatible
implementation must reproduce them.

Specifications must not contain reference source, pseudocode shaped like the reference, original
comments, internal identifiers, internal file or module names, internal architecture, control flow
that is not behaviorally required, or the names of libraries the reference happens to use.
