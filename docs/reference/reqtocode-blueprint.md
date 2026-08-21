# ReqToCode Blueprint — Requirements-to-Code Traceability System

A language- and framework-agnostic specification for rebuilding this system in any
stack. Give this document to a coding agent together with the instruction:
*"Implement this system for our codebase"*. Everything below describes **what** to
build and **why**; per-stack mapping hints are at the end. This blueprint was
extracted from a working implementation (C#/Unity), but nothing in the core design
depends on it.

## 1. Core idea

Requirements and code drift apart because their link is prose (comments, tickets,
wikis) that nothing enforces. ReqToCode fixes this by making the link a
**compile-time artifact**:

1. Requirements live as **versioned, structured files inside the repository** —
   the single source of truth.
2. A **generator** turns them into a **language-native code element** (enum,
   constants, symbols — whatever the language checks at compile/build time), one
   member per requirement, carrying status metadata.
3. Implementation code **references** its requirement via an annotation/attribute/
   decorator on the implementing element. Tests reference requirements via a
   **separate** annotation. These are real symbol references, not strings.
4. Consequences are structural, not procedural:
   - **Removed** requirement → its symbol disappears → every reference is a
     build error.
   - **Deprecated** requirement → its symbol carries the language's deprecation
     marker → every reference produces an IDE/compiler warning at the exact spot.
   - **Approved but unreferenced** requirement → a verifier turns this into
     errors, failing tests, a failing build gate, and a rejected commit.

> Design principle: *a broken trace is a broken build.* The build/commit is the
> trigger for change propagation — no manual coordination needed.

## 2. Requirement store

- One directory in the repo (here: `Docs/requirements/`), one subfolder per
  feature, one file per requirement. Human-readable format (markdown) with a
  machine-readable header (YAML frontmatter). Files without the header are
  ignored (analysis reports, test protocols can live alongside).
- Header fields:

  | Field | Values | Meaning |
  | --- | --- | --- |
  | `req-id` | `SWR-<number>`, globally unique, **stable forever** | Becomes the code symbol (`SWR_<number>`) |
  | `status` | `draft` \| `approved` \| `deprecated` | Lifecycle, see §4 |
  | `trace` | `required` (default) \| `optional` | Must implementation reference it? |
  | `test` | `required` (default) \| `optional` | Must a test reference it? |
  | `title` | free text | Short label; fallback: first heading of the document |

- ID convention: `x00` = feature epic (trace/test optional — realized through its
  sub-requirements), `x01+` = individual requirements; one hundreds-block per
  feature. Epics, pure analysis tasks, and not-yet-implemented features get
  `optional` / `draft`; everything else defaults to enforced.

## 3. Generated traceables

The generator reads all requirement files and emits **one generated source file**
(never edited by hand, header says so) containing:

- A file-level **global hash** of all parsed requirement data — used for staleness
  detection and meaningful diffs.
- One symbol per requirement (`SWR_101 = 101`), each carrying:
  - a **doc comment** with status, title, and source file path (IDE hover shows
    the requirement),
  - a **metadata annotation** with id, status, title, source path, trace-required
    flag, **content hash** of the requirement document (changes whenever the
    requirement text changes → drift is visible in the generated file's diff),
    and test-required flag,
  - the language's **deprecation marker** iff status is `deprecated`, with a
    message naming the requirement and its source file.

Generator requirements:

- **Deterministic**: same inputs → byte-identical output (fixed ordering by
  requirement number, normalized line endings, fixed encoding).
- **Validating**: malformed IDs, unknown status/flag values, duplicate IDs are
  errors that abort generation.
- **Idempotent**: if the regenerated content equals the file on disk, do not
  write (avoids rebuild loops).
- Exposes three operations: `parse` (with error list), `generate` (pure,
  input → source text), `isUpToDate` (disk file vs. regenerated content).

## 4. Trace and coverage annotations

Two small hand-written declarations live next to the generated file:

- `Traces(reqs...)` — placed on the class/function/method that **implements** a
  requirement. Multiple requirements per element and multiple elements per
  requirement are allowed.
- `Verifies(reqs...)` — placed on the **test** (method or class) that covers a
  requirement. Only occurrences inside **test modules** count as coverage
  (detect test modules by their dependency on the test framework).

Both take the generated symbols as arguments, so both inherit the compile-time
lifecycle (removal breaks them, deprecation warns on them). Implementation traces
and test coverage are **counted separately** — a `Traces` inside a test does not
count as coverage, and a `Verifies` does not count as a trace.

## 5. Lifecycle semantics (graduated enforcement)

| State | Effect |
| --- | --- |
| `draft` | Symbol exists, may be referenced, nothing enforced |
| `approved` + `trace: required` | ≥ 1 `Traces` reference must exist, else verification error |
| `approved` + `test: required` | ≥ 1 `Verifies` reference in a test module must exist, else verification error |
| `deprecated` | Deprecation warning at every reference (code and tests); still-referenced deprecated requirements are reported as warnings by the verifier |
| file/`req-id` deleted | Symbol vanishes → compile error at every reference |

## 6. Verifier

A single check routine, **pure** (returns error/warning lists, does no logging
itself — callers decide how to surface), used by every enforcement layer:

1. Requirement sources parse without errors.
2. Generated file is up to date (matches regeneration of current sources).
3. Sweep all modules that depend on the traceables module, collect
   `Traces`/`Verifies` occurrences per requirement (reflection, or static
   analysis/AST scan in languages without runtime reflection).
4. Apply the lifecycle rules from §5. Error messages must be actionable: name the
   requirement, its title, its source file, and the exact fix
   (“Add `[Traces(SWR.SWR_103)]` to the implementing code element”).

## 7. Enforcement layers (defense in depth)

Implement as many as the stack supports; each catches drift at a different moment:

1. **IDE/compiler**: deprecation warnings and missing-symbol errors — free, via
   the generated symbols.
2. **Post-compile hook** (watch mode / editor callback / build plugin): after
   every compile, auto-regenerate if stale (triggering one more compile), else
   run the verifier and print violations as errors.
3. **Meta-tests** in the normal test suite (see §9) — makes CI enforce it with
   zero extra CI config.
4. **Release/build gate**: production build aborts when the verifier reports
   errors.
5. **Pre-commit hook**: versioned in the repo (`git config core.hooksPath ...`
   one-time setup per clone). Must run **without** the heavyweight toolchain
   (IDE/engine not required), so it may be a lightweight mirror: re-implements
   parse + generate + a text-scan approximation of the reference check (regex for
   `Traces(...SWR_n...)` / `Verifies(...)`), compares the generated file, offers
   a `-Fix` flag to regenerate. Exit codes: 0 ok / 1 violations / 2 internal
   error.
   **Critical**: if generator logic exists twice (authoritative in-toolchain +
   mirror in the hook), add a **parity meta-test** asserting both produce
   byte-identical output — otherwise the mirror rots.

## 8. Change-propagation triggers

- Regeneration triggers: post-compile hook (staleness check via hash), manual
  command (menu item / CLI), and **before every agent-driven test run** (the
  test-runner entry point regenerates first, so a requirement edit automatically
  becomes a failing verification in the same run).
- The generated file's diff is the review artifact: a changed content hash on a
  member tells reviewers *this requirement's text changed*; a flipped flag or
  added deprecation marker shows the lifecycle change.

## 9. Test suite contents

Two categories:

- **Meta-tests** (system tests the system): sources parse; IDs unique; generated
  file up to date; verifier reports zero violations; generator emits deprecation
  marker for `deprecated` and not for others; generator emits the flags; removing
  a requirement removes its symbol; (if mirror exists) mirror/authoritative
  parity.
- **Coverage tests**: real behavioral tests per requirement, annotated with
  `Verifies`. They must test actual behavior of the traced code — a test that
  would pass without the implementation is a red flag.

## 10. Agent workflow integration

Ship a **propagation playbook** (agent skill / runbook in the repo, referenced
from the repo's agent instructions) that activates on any ReqToCode signal
(verifier errors, failing meta-tests, compile errors on removed symbols,
deprecation warnings, hook-rejected commit, or edited requirement files):

1. **Read the requirement diff** (working tree, staged, or last commits touching
   the requirements directory) and classify each change: text changed /
   deprecated / removed / new / enforcement flag flipped — each maps to a
   concrete code obligation. Read the full new requirement text, not just the
   diff.
2. **Regenerate and verify** (`check --fix`, then `check`); the violation list is
   the work queue.
3. **Find all reference sites** (search for the symbol name); `Traces` hits =
   implementation, `Verifies` hits = tests.
4. **Rework each implementation site** to match the new requirement text; the
   `Traces` annotation moves with the behavior.
5. **Update/create the `Verifies` tests**, run the full suite, loop 4–5 until
   green.
6. **Commit** requirement docs + generated file + code + tests as **one unit**
   with the requirement ID in the message. The pre-commit hook re-checks; never
   bypass it and never silence a violation by deleting annotations or weakening
   the requirement.

## 11. Implementation order (bootstrap sequence, avoids chicken-and-egg traps)

1. Tag all existing requirement files with header + IDs (assign statuses honestly:
   implemented = `approved`, planned = `draft`).
2. Create the hand-written declarations (status enum, metadata annotation,
   `Traces`, `Verifies`).
3. Write the generator against those declarations.
4. Bootstrap the generated file **before** the toolchain first compiles the
   generator (hand-write it or run the mirror script) — the codebase must never
   pass through a state where the generated file doesn't compile, because the
   auto-regenerator itself needs a successful compile to run. Corollary: when
   later **extending** the metadata annotation's signature, add new parameters
   with default values so the old generated file keeps compiling until
   regeneration.
5. Add verifier + post-compile hook + build gate.
6. Add `Traces` annotations to the existing implementations.
7. Add meta-tests; wire test modules' dependencies to the traceables module.
8. Add `Verifies` + real coverage tests (in environments where the framework's
   object lifecycle doesn't run in unit-test mode, drive it explicitly —
   reflection-invoke initializers, inject dependencies manually).
9. Add the pre-commit hook (+ mirror + parity test), activate `hooksPath`.
10. Document: requirements-directory README (fields, lifecycle, workflow) + agent
    instructions file + propagation playbook.

## 12. Acceptance protocol (verify the finished system exactly like this)

1. **Positive**: full test suite green; standalone check exits 0.
2. **Negative trace probe**: flip one uncovered requirement to `trace: required`
   → check exits 1 naming that requirement; test suite fails on the traceability
   meta-test; revert; regenerate; green again.
3. **Negative coverage probe**: same with `test: required` on a requirement
   without tests.
4. **Self-heal probe**: edit requirement text only → generated file regenerates
   automatically on the next compile/test-run/`--fix` with a changed content
   hash; nothing else fails.
5. **Hook probe**: run the pre-commit hook through git itself (e.g.
   `git hook run pre-commit`) in both clean and violating states.

## 13. Per-stack mapping hints

| Concept | C#/.NET (reference impl.) | Java/Kotlin | TypeScript/JS | Python | Rust |
| --- | --- | --- | --- | --- | --- |
| Traceable symbol | `enum SWR` | `enum` | `const enum` / frozen object + type | `Enum` | `enum` |
| Deprecation marker | `[Obsolete]` | `@Deprecated` | `/** @deprecated */` + lint rule | decorator emitting `DeprecationWarning` / lint | `#[deprecated]` |
| Metadata | attribute on enum field | annotation | metadata map keyed by symbol | decorator/registry | attribute macro or registry |
| Trace/Verify markers | attributes | annotations (RUNTIME retention) | decorators or typed registry calls | decorators | attribute macros / registry |
| Reference sweep | runtime reflection over assemblies | classpath scan (e.g. annotation processor or reflections lib) | AST scan (ts-morph) or registry introspection | import + inspect / AST scan | compile-time via macro registry or AST scan |
| Post-compile hook | editor callback / MSBuild task | build plugin (Gradle/Maven) | watcher / build script | pre-test conftest / build script | build.rs / cargo xtask |
| Build gate | build preprocessor throwing | plugin failing the build | CI/build script exit code | packaging hook | build.rs panic / xtask |
| Test-module detection | references NUnit | depends on JUnit | test dir / framework import | test dir / pytest | `#[cfg(test)]` |

If the language has no runtime reflection, do the reference sweep as static
analysis on the AST — the semantics of §6 stay identical.

## 14. Deliverables checklist

- [ ] Requirement files tagged (`req-id`, `status`, `trace`, `test`, `title`)
- [ ] Declarations: status enum, metadata annotation, `Traces`, `Verifies`
- [ ] Generator (parse / generate / isUpToDate / regenerate-if-stale + manual command)
- [ ] Generated traceables file, bootstrapped and current
- [ ] Verifier (pure) + post-compile error surfacing + build gate
- [ ] `Traces` on all required implementations, `Verifies` + real tests on all required requirements
- [ ] Meta-tests incl. mirror parity (if mirror exists)
- [ ] Pre-commit hook (toolchain-free) + one-time activation documented
- [ ] Test-runner entry point regenerates before running
- [ ] Docs: requirements README, agent instructions, propagation playbook
- [ ] Acceptance protocol (§12) executed and passing
