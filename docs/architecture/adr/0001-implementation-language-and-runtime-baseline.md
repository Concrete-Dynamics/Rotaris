# ADR-0001 — Implementation language and runtime baseline

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** DATA (constraint G5, ADR-DATA-06), EXEC (C-144, ADR-EXEC-12), RUNTIME (ADR-RUNTIME-07 spike)
- **Depended on by:** every other decision in this record

## Context

The product decision fixes Electron as the shell. It does not fix the implementation language, and
one domain constrains that choice directly rather than incidentally.

`REQ-TRACE-075` requires that **exactly one annotation convention be registered by default and that
it claim the single source extension of the implementation language**. `REQ-TRACE-039` derives
`generated_path` (`src/requirement_ids` plus that extension) and the two `skip_parts` directory names
from the same language's toolchain. `REQ-TRACE-053` requires a generated module exposing one
integer-valued symbol per requirement plus a number-to-metadata lookup. `REQ-TRACE-181` requires a
deleted requirement's symbol to become a **build error** and a deprecated one to carry **the
language's own deprecation marker** so every reference warns at the exact spot. `REQ-TRACE-104`
requires a test over a module's **parsed** contents — imports, module-level assignments and
documentation only, with any function, class or conditional disqualifying it. `REQ-TRACE-109`
requires test collection from a **syntax tree**. `REQ-TRACE-110` requires a syntax error to yield an
empty function list rather than a failure. `REQ-TRACE-182` requires the **test session itself** to
regenerate the artifact before collecting tests.

Taken together the language must have: an integer enumeration with per-member documentation, a
deprecation marker the editor and the build honour, a syntax-tree parser the product can run **at run
time**, and a test runner with a before-collection hook.

Separately, `REQ-CONFIG-015` requires YAML parsed in a safe subset; `REQ-TRACE-013` forbids the
requirement parser from using any third-party YAML, TOML or validation library; `REQ-SESSION-051` to
`REQ-SESSION-054` require a process-liveness probe that delivers no signal or console control event
on Windows; `REQ-MCP-113` requires the product to create a child's three standard streams itself with
no console window; `REQ-PROVIDER-016` requires an explicit Windows ACL with inheritance disabled.

## Alternatives considered

**A — TypeScript on Node, executed by Electron.** Satisfies `REQ-TRACE-181` through an `enum` with
`@deprecated` JSDoc: a removed member fails compilation, and the deprecation marker is honoured by
editors. Satisfies `REQ-TRACE-104`, `REQ-TRACE-109` and `REQ-TRACE-110` by shipping a TypeScript
syntax-tree parser inside the product — either the compiler API (correct, heavy, already present if
the build uses it) or a fast native parser such as `oxc` or `swc` (lighter, but a native module that
ADR-0003 has otherwise removed from the stack). **Cost:** making a deprecated symbol a build
*warning* rather than only an editor hint needs a lint rule — a small but standing obligation.

**B — Python.** Would satisfy `REQ-TRACE-104` and `REQ-TRACE-109` with the standard library's syntax
tree at near-zero cost, satisfies `REQ-TRACE-182` through a collection hook, and — decisively for one
requirement — would make `REQ-TOOLS-161` to `REQ-TOOLS-165`'s **in-process `*.py` plugin loading**
possible as written. But it is not a language Electron's main or renderer processes run, so it would
require a second runtime alongside the Electron one in every process of ADR-0002, which
`REQ-STARTUP-002`'s single-executable rule and `REQ-STARTUP-015` make expensive to justify.

**C — TypeScript with a Python sidecar for the traceability engine.** Rejected. `REQ-TRACE-206` and
`REQ-TRACE-377` forbid a consuming surface from launching a checking process at all, and require a
guard test asserting that no desktop module spawns one. A sidecar makes that requirement
unsatisfiable rather than merely awkward.

## Decision

**TypeScript, executed by Node inside Electron.** The generated requirement-symbol artifact is a
TypeScript module; the built-in annotation convention claims the TypeScript source extension; the
product ships a TypeScript syntax-tree parser for `REQ-TRACE-104` and `REQ-TRACE-109`; the test
runner must expose a before-collection hook for `REQ-TRACE-182`.

## Consequences

1. A syntax-tree parser for the implementation language ships **inside the product**. Which one is
   left open in ADR-0040: the compiler API costs bundle size and start-up against `REQ-STARTUP-155`'s
   5 s budget, and a native parser costs the rebuild-per-Electron-version obligation ADR-0003
   otherwise removes.
2. `REQ-TRACE-181`'s "a deprecated requirement's symbol warns at every reference" holds at editor
   level through JSDoc and at build level only if a lint rule is added. That lint rule is a
   deliverable, not a nicety.
3. **`REQ-TOOLS-165`'s `*.py` plugin extension is unsatisfiable as written.** A TypeScript/Node host
   cannot import a Python module into its own process, which `REQ-TOOLS-163` requires. Escalated in
   ADR-0025 rather than absorbed here.
4. OQ-15's accepted amendment (2026-09-07) defines language-independent product diagnostics.
   `REQ-TOOLS-101` retains `error_class: "ValueError"` as a fixed compatibility string.
   `REQ-SANDBOX-083` fixes wrap refusals to `SandboxUnavailableError`; implementation exception
   names may appear in optional redacted detail. The stable machine-readable codes are
   `failure_kind` and outcome kind. Schema refusal preserves the terminal diagnostic through the gate.
5. The test framework must be chosen for its before-collection hook, not only for ergonomics.

## Revisit if

The traceability domain's generated-artifact requirements are relaxed, or `REQ-TOOLS-163` is amended
in a direction that reopens the plugin-language question (ADR-0025).
