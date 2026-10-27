# The codebase — how the architecture is laid out in code

> The picture of what this map describes — packages and edges, processes and messages, a run's lifecycle — is [`views/`](views/README.md), kept in step with the code by the rule in `CLAUDE.md`.

- **Created:** 2026-09-03, with the walking skeleton (the first production code in this repository).
- **Governs:** where a thing goes, what it may import, and which lint proves it.
- **Reads with:** [`README.md`](README.md) §1 (the four process kinds), the ADRs each package cites,
  and [`implementation-conditions.md`](implementation-conditions.md).

## Parts

Since 2026-10-26 the rest of this document is in [`codebase/`](codebase/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](codebase/01-packages-follow-process-boundaries-not-features.md) | Packages follow process boundaries, not features |
| [02](codebase/02-the-disciplines-mechanised.md) | The disciplines, mechanised |
| [03](codebase/03-a-test-reads-the-plan-not-only-the-time.md) | A test reads the plan, not only the time |
| [04](codebase/04-what-pnpm-package-does-and-refuses.md) | What `pnpm package` does, and refuses |
| [05](codebase/05-what-the-walking-skeleton-does-and-nothing-more.md) | What the walking skeleton does, and nothing more |
| [06](codebase/06-what-the-walking-skeleton-does-and-nothing-more-2.md) | What the walking skeleton does, and nothing more *(continued, from "27. **the bundled code-intelligence runtime — ADR-0035's first execution (2026-09-06, …")* |
| [07](codebase/07-what-the-walking-skeleton-does-and-nothing-more-3.md) | What the walking skeleton does, and nothing more *(continued, from "Configuration.")* |
| [08](codebase/08-what-the-walking-skeleton-does-and-nothing-more-4.md) | What the walking skeleton does, and nothing more *(continued, from "The five decisions this scenario was held on were taken on 2026-09-22")* |
| [09](codebase/09-what-the-walking-skeleton-does-and-nothing-more-5.md) | What the walking skeleton does, and nothing more *(continued, from "What `pnpm resilience-proof` does.")* |
| [10](codebase/10-what-the-walking-skeleton-does-and-nothing-more-6.md) | What the walking skeleton does, and nothing more *(continued, from "What `pnpm library-proof` does.")* |
| [11](codebase/11-the-driver-a-step-that-waits-instead-of.md) | The driver — a step that waits instead of guessing (2026-09-11) |
| [12](codebase/12-two-main-windows-behind-one-builder-2026-09-12.md) | Two main windows behind one builder (2026-09-12) |
| [13](codebase/13-the-first-two-product-directives-2026-09-12.md) | The first two product directives (2026-09-12) |
| [14](codebase/14-opening-a-project-from-inside-the-application.md) | Opening a project from inside the application (2026-09-12) |
| [15](codebase/15-the-two-directives-built-and-what-the-directive.md) | The two directives, built — and what the directive layer learned about itself (2026-09-12) |
| [16](codebase/16-the-adopted-language-drawn-once-and-the.md) | The adopted language, drawn once — and the evidence a critic reads (2026-09-12) |
| [17](codebase/17-all-twelve-critic-findings-repaired-and.md) | All twelve critic findings, repaired and measured (2026-09-13); UIR-014 was `flex-shrink`, and the guard that now catches its whole class; The third cycle's critique, recovered from the reader rather than from the disk — §272.98 |
| [18](codebase/18-verifying-a-part-runs-the-whole-proof-suite-not.md) | Verifying a part runs the WHOLE proof suite, not its neighbours |
| [19](codebase/19-verifying-a-part-runs-the-whole-proof-suite-not-2.md) | Verifying a part runs the WHOLE proof suite, not its neighbours *(continued, from "Two further readings the same evidence corrects.")* |
| [20](codebase/20-where-the-next-work-lands.md) | Where the next work lands |
| [21](codebase/21-where-the-next-work-lands-2.md) | Where the next work lands *(continued, from "structured questions and the stepper~~ **done 2026-09-07** (Part AC; `pnpm …")* |
| [22](codebase/22-where-the-next-work-lands-3.md) | Where the next work lands *(continued, from "the first release, Windows only (R-051, `PD-STARTUP-001`) — **planned 2026-09-25** in …")* |
