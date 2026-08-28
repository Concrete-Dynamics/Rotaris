---
req-id: [SWR-2300, SWR-2303, SWR-2311, SWR-2315, SWR-2316, SWR-2317, SWR-2318, SWR-2319, SWR-2322, SWR-2324, SWR-2325, SWR-2326, SWR-2327, SWR-2328, SWR-2329, SWR-2330, SWR-2331, SWR-2332, SWR-2333, SWR-2334, SWR-2335, SWR-2336, SWR-2337]
status: draft
trace: required
test: required
title: "Requirements Traceability"
---

# 2300-traceability spec

## SWR-2300 — Requirements Traceability
status: approved
trace: optional
test: optional

The requirements traceability system itself: ID conventions, matrix generation, and test annotation coverage.

## SWR-2303 — Annotation convention is stack-resolved, not Python-only
legacy-id: REQ-20260417-120000-003
date: 2026-04-17
source: docs/requirement-log/partial/requirements-20260417-173238.md

Every test must reference the ids of all requirements it covers, and the **annotation
convention used to express that reference must follow from the project's stack**, not from
ReqToCode being written in Python. Today the reference sweep recognises exactly one
convention: the `traces(...)`/`verifies(...)` call text plus `SWR_<n>` symbols, and the
transitional `# @req:` comment, scanned in `.py` files only
(`src/rotaris_core/reqtocode/verifier.py`). A project in another language therefore cannot
satisfy its own traceability obligation.

Requirement: the sweep resolves its convention from the detected stack (SWR-2315) through a
registerable convention interface (SWR-2316), with the Python convention as the default and
unchanged behaviour for this repository.

## SWR-2311 — Coverage report for repositories without a ratchet
legacy-id: REQ-20260417-120000-011
date: 2026-04-17
source: docs/requirement-log/partial/requirements-20260417-173238.md

A repository adopting ReqToCode for the first time has no baseline and cannot start with a
hard gate — every pre-existing requirement would be an error. It needs a **reporting** mode:
list every requirement whose implementation trace or test coverage is missing, as
information rather than as a violation, so a team can see the size of the debt before
deciding what to enforce.

Requirement: `check` offers a non-blocking coverage report (uncovered requirements with
their titles and source files, exit code 0) distinct from the enforcing run (SWR-2317).
This repository's own behaviour — enforcing, baseline-suppressed — is unchanged.

## SWR-2315 — Stack detection for a target repository
legacy-id: REQ-20260417-130000-020
date: 2026-04-17
source: docs/requirement-log/partial/requirements-20260417-173238.md

ReqToCode currently assumes this repository's layout: implementation roots
`src/rotaris_core` and `apps/rotaris/src`, test roots `tests` and `apps/rotaris/tests`,
Python sources (`src/rotaris_core/reqtocode/verifier.py`). A foreign repository must not
have to hand-write all of that before it can run a first check.

Requirement: given a repository root, ReqToCode proposes a layout — implementation roots,
test roots and the annotation convention per detected stack — from the markers actually
present (`pyproject.toml`, `package.json` with a test runner dependency, `*.csproj`/`*.sln`,
`go.mod`, `Cargo.toml`). Multiple stacks in one repository are supported. Detection is a
*proposal*: it is written into the project's ReqToCode configuration (SWR-2335) where a
human can correct it, never applied invisibly.

## SWR-2316 — Registerable annotation conventions
legacy-id: REQ-20260417-130000-021
date: 2026-04-17
source: docs/requirement-log/partial/requirements-20260417-173238.md

For each detected stack, the reference sweep applies that stack's annotation convention —
e.g. C#: `[Trait("Covers", "SWR-…")]` or `// covers: SWR-…`; TypeScript/JavaScript:
`// covers: SWR-…` or a `@covers SWR-…` JSDoc tag; Python: the existing
`traces(...)`/`verifies(...)` calls. Additional conventions are registerable through
configuration without editing ReqToCode's source.

Both directions of the sweep must honour the convention: requirement → code (`traces`) and
requirement → test (`verifies`), plus the reverse orphan checks (SWR-2333/SWR-2334), which
today only recognise Python files.

## SWR-2317 — Enforcement level is a project decision
legacy-id: REQ-20260417-130000-022
date: 2026-04-17
source: docs/requirement-log/partial/requirements-20260417-173238.md

`check` is unconditionally enforcing today: a missing trace or test on an approved
requirement is an error and exits 1. That is right for this repository and wrong as a first
experience elsewhere, where it would fail on every pre-existing requirement.

Requirement: the enforcement level is configurable per project — report-only (always exit 0,
see SWR-2311) versus enforcing (exit 1 on violations), selectable by flag and by
configuration, with enforcing as the documented target state and this repository's setting.
Whichever level is active must be stated in the output, so a green run can never be mistaken
for a run that checked nothing.

## SWR-2318 — Removed requirement tombstones
status: approved
legacy-id: REQ-20260417-130000-023
date: 2026-04-17
source: docs/requirement-log/partial/requirements-20260417-173238.md

An id must never be reassigned after its requirement is deleted, but nothing today records
that a deleted id ever existed: it simply disappears from `META`, and only the git history
remembers. A repository that adopts ReqToCode later, or a team reading a stale reference,
has no way to distinguish "never existed" from "retired".

Requirement: deleting a requirement appends a tombstone record — id, last known title,
removal date (ISO 8601) — to a retired-ids log in the requirement store, and the generator
rejects any attempt to reuse a tombstoned id. Complements SWR-2333, which already surfaces
the *code* left behind by a deletion.

## SWR-2319 — Zero Manual Intervention
status: approved
trace: optional
test: optional
legacy-id: REQ-20260417-120000-015
date: 2026-04-17
source: docs/requirement-log/partial/requirements-20260417-173238.md

After initial hook registration, the matrix must update without any manual script invocation.

## SWR-2322 — agents.md Location
status: approved
trace: optional
test: optional
legacy-id: REQ-20260417-120000-018
date: 2026-04-17
source: docs/requirement-log/partial/requirements-20260417-173238.md

The `agents.md` file is located at the project root and must not be moved.

## SWR-2324 — Generated Traceables Module
status: approved
date: 2026-07-18

A generator reads every frontmatter-tagged file under `docs/requirements/` and emits
`src/rotaris_core/reqtocode/swr.py`: one `SWR` IntEnum member per requirement
(`SWR-<n>` → `SWR_<n>`), a `META` map carrying status, title, source path,
trace/test flags and a content hash of the requirement document, a `DEPRECATED`
member set, and a file-level global hash.

Acceptance criteria (blueprint §3):

- **Deterministic**: same inputs produce byte-identical output (fixed ordering by
  requirement number, LF endings, UTF-8).
- **Validating**: malformed ids, unknown status/flag values, and duplicate ids
  abort generation with actionable errors.
- **Idempotent**: regeneration does not rewrite an up-to-date file.
- Exposes `parse_requirements`, `generate` (pure), `is_up_to_date`, and
  `regenerate_if_stale`.

## SWR-2325 — Trace and Coverage Annotations
status: approved
date: 2026-07-18

Two hand-written decorators link code to requirements (blueprint §4):

- `traces(*reqs)` on the class/function that **implements** a requirement.
- `verifies(*reqs)` on the **test** that covers a requirement.

Both take generated `SWR` symbols, attach the referenced requirement numbers as
introspectable attributes, and emit a `DeprecationWarning` when a referenced
requirement is `deprecated`. Implementation traces and test coverage are counted
separately: `traces` inside a test root is not coverage, `verifies` outside a
test root is not a trace. Transitional `# @req: SWR-<n>` comments in tests also
count as coverage (legacy ids resolve via `legacy-id` frontmatter).

## SWR-2326 — Pure Traceability Verifier
status: approved
date: 2026-07-18

A single pure check routine (`rotaris_core.reqtocode.verifier.verify`) used by every
enforcement layer. It returns error/warning lists and does no logging itself
(blueprint §6). Checks, in order:

1. Requirement sources parse without errors.
2. The generated traceables file matches a regeneration of current sources.
3. A static reference sweep over implementation roots (`src/rotaris_core`,
   `apps/rotaris/src`) and test roots (`tests`, `apps/rotaris/tests`).
4. Lifecycle rules (blueprint §5): approved + `trace: required` needs ≥1 trace;
   approved + `test: required` needs ≥1 covering test reference; deprecated but
   still-referenced requirements produce warnings; references to nonexistent
   requirements are errors (removed-symbol semantics).

Error messages are actionable: they name the requirement, its title, its source
file, and the exact fix.

## SWR-2327 — Bootstrap Baseline Ratchet
status: approved
date: 2026-07-18

Pre-existing traceability debt (approved requirements that predate ReqToCode and
have no annotations) is recorded once in
`docs/requirements/traceability-baseline.txt`. The verifier suppresses missing
trace/test violations only for baselined flags; all new violations are errors.

The baseline may only **shrink**: `check --update-baseline` prunes entries whose
obligation is now satisfied and never adds entries to an existing file. Satisfied
or stale baseline entries surface as verifier warnings until pruned.

## SWR-2328 — Traceability Enforcement Layers
status: approved
trace: optional
date: 2026-07-18

Defense in depth (blueprint §7/§8):

- **CLI**: `python -m rotaris_core.reqtocode check [--fix]` — exit codes 0 ok /
  1 violations / 2 internal error; stdlib-only so it runs without the venv.
- **Test runner**: `tests/conftest.py` regenerates the traceables file before
  every pytest run, so a requirement edit becomes a failing verification in the
  same run.
- **Meta-tests**: `tests/unit/reqtocode/test_traceability_meta.py` asserts a
  clean parse, an up-to-date generated file, and zero verifier errors — CI
  enforces traceability with no extra CI config.
- **Pre-commit hook**: `.pre-commit-hook.py` regenerates and stages the
  traceables file, then blocks the commit on verifier errors. No mirror
  implementation exists — the hook imports the same `rotaris_core.reqtocode`
  modules, so no parity test is needed.

## SWR-2329 — Change Propagation Playbook
status: approved
trace: optional
test: optional
date: 2026-07-18

A propagation playbook (`docs/reference/reqtocode-playbook.md`, referenced from
`AGENTS.md` and `CLAUDE.md`) tells agents how to react to any ReqToCode signal:
verifier errors, failing meta-tests, missing-symbol failures, deprecation
warnings, hook-rejected commits, or edited requirement files. It maps each
requirement-diff class (text changed / deprecated / removed / new / flag
flipped) to a concrete code obligation and requires committing requirement
docs + generated file + code + tests as one unit (blueprint §10).

## SWR-2330 — Multi-ID Spec Files
status: approved
date: 2026-07-20

A requirement file's `req-id` frontmatter may be a bracketed list
(`req-id: [SWR-101, SWR-102, SWR-103]`) instead of a single id, in which case
the file is a **spec**: it declares several requirements at once rather than
one requirement per file.

Each id in the list must have a matching `## SWR-<n> — Title` heading
(`##`–`######`) in the file body; the parser errors if an id in the list has
no matching heading. The heading supplies that requirement's title. Optional
`key: value` lines directly beneath the heading (`status`, `trace`, `test`,
`legacy-id`) override the file's frontmatter defaults for that one id only;
any field not overridden falls back to the frontmatter value. All ids in the
spec share the file's `content_hash` (one file, one hash) — editing any part
of the file invalidates baseline suppression for every id it declares.

A single-id file (`req-id: SWR-<n>`) is unaffected; body override blocks are
only consulted when `req-id` is a list.

## SWR-2331 — Technical Requirement Traceability
status: approved

Supports the **ReqToCode** principle (all code and all tests trace to a
requirement) by making supplementary code first-class in the spec instead of
orphaned. A requirement may declare `type: technical` (default `product`) and
`derived-from: SWR-<origin>` (single id or a `[SWR-a, SWR-b]` list) naming the
requirement(s) whose implementation made the supplementary code necessary. Both
fields are honored at file-frontmatter level and, for multi-id spec files, in a
per-id body override block.

The generator parses and validates them (unknown `type` and malformed
`derived-from` ids abort generation) and mirrors `req_type` / `derived_from`
into the generated `ReqMeta`, folding both into the file's global hash so a
change propagates. The verifier enforces the forward link — the single source
of truth for the bidirectional relation — with these rules:

- `type: technical` **must** declare a `derived-from` (else error).
- `derived-from` may appear **only** on a `type: technical` requirement (else error).
- every `derived-from` id must resolve to an existing, non-self requirement
  (a dangling or self origin is an error).
- a `derived-from` id whose target is `deprecated` produces a warning.

Backward compatible: requirements without these fields default to
`type: product` with no derived link and are unaffected.

## SWR-2332 — Requirement-Diff Propagation Trigger
status: approved

Closes the spec-drift hole that `check` cannot see: a requirement whose **text**
changes while its `@traces`/`@verifies` annotations stay intact keeps the
verifier green but leaves the code stale. `python -m rotaris_core.reqtocode diff
[--base <ref>] [--strict]` compares each requirement's `content_hash` between a
git base ref (default `HEAD`) and the working tree, classifies every change, and
maps it to the reference sites that must be reviewed:

- **added** (in worktree, not base) — implement, then add trace + test.
- **removed** (in base, not worktree) — delete or re-point every reference.
- **modified** (content hash differs) — re-verify every site against the new text.
- **status** (lifecycle changed, hash same) — reconcile references.

Base metadata is read from the committed generated `swr.py` at the base ref (the
hook and CI keep it in lock-step with the requirements, so its per-requirement
`content_hash` is the authoritative "before" snapshot). The `--strict` gate
exits non-zero when an **approved** requirement's text changed but **none** of
its implementing/covering site files were touched in the same change — the
precise "modified requirement, stale code" signal. Committing the requirement
edit and the code update together (the one-unit rule) empties the diff, which is
the propagation's re-confirmation.

Acceptance criteria:

- Classification is pure and independently testable
  (`classify_changes(current, base_meta, sites, changed_files)`).
- Missing/foreign base `swr.py` degrades gracefully (reports "no base", never crashes).
- Stdlib-only (git via `subprocess`) so the pre-commit hook can run it without the venv.

## SWR-2333 — Orphan-Code Reverse Enforcement
status: approved

Enforces the reqtospec forward promise ("no orphan code") and closes the delete
path: when a requirement is deleted, its `@traces` reference vanishes and, if it
was a module's only link, the module becomes untraced — the verifier must flag
it so the code is deleted or re-pointed, not left as dead weight.

Every production module under the implementation roots (`src/rotaris_core`,
`apps/rotaris/src`) must carry at least one `@traces()` reference. A module with
none is an **orphan-code** error. Excused:

- `__init__.py` re-export shims and the generated `swr.py`.
- modules carrying the `# reqtocode: exempt` marker (intentionally trace-free:
  pure config, glue, generated code).
- modules listed in the shrink-only `docs/requirements/orphan-baseline.txt`
  (pre-existing untraced modules recorded once at bootstrap).

The orphan baseline mirrors the trace/test debt ratchet: it may only shrink.
`check --update-baseline` bootstraps it (records all current orphans) and prunes
entries that are now traced, exempt, or removed; satisfied/stale entries surface
as warnings until pruned. New orphan modules are always errors — they can never
be added to the baseline.

## SWR-2334 — Orphan-Test Reverse Enforcement
status: approved

Extends the SWR-2333 reverse-enforcement principle from modules to individual
tests: a test with no requirement link verifies nothing and is spec drift in
the other direction — effort spent maintaining a test that traces to no
product or technical need.

Every `test_*` function (module-level or nested one level in a `class Test...`
grouping) under the test roots (`tests/`, `apps/rotaris/tests/`) must carry a
`@verifies()` reference or the transitional `# @req: SWR-<n>` comment. A test
with neither is an **orphan-test** error. Excused:

- tests under `tests/capability/` (optional live-provider confidence tests per
  the [test strategy](../testing/test_strategy.md); they exercise general
  framework capability, not an individual requirement).
- functions carrying the `# reqtocode: exempt` marker (intentionally
  requirement-free: fixtures-as-tests, generated/parametrized scaffolding).
- functions listed in the shrink-only `docs/requirements/orphan-test-baseline.txt`
  (pre-existing unannotated tests recorded once at bootstrap, grandfathered per
  the test strategy's prospective-only policy).

The orphan-test baseline mirrors the orphan-module ratchet: it may only shrink.
`check --update-baseline` bootstraps it (records all current orphan tests) and
prunes entries that are now annotated, exempt, or removed; satisfied/stale
entries surface as warnings until pruned. New orphan tests are always errors —
they can never be added to the baseline, so every new or materially changed
test must carry its `@verifies` per the test strategy's prospective policy.

## SWR-2335 — Repository layout is described, not hard-coded
status: approved

ReqToCode knows exactly one repository: every root and file location is a module constant —
`REQ_DIR` and `GENERATED_PATH` (`generator.py`), `IMPL_ROOTS`, `TEST_ROOTS`,
`CAPABILITY_TEST_ROOT` and the three baseline paths (`verifier.py`), and the repo-detection
heuristic in `cli.py::find_repo_root`. Nothing about the checking logic is
Rotaris-specific; only these constants are.

Requirement: a **layout description** value object carries the requirement-store directory,
the generated-traceables path, the implementation roots, the test roots, the excused test
roots, the baseline file paths and the exempt marker. `parse_requirements`, `verify`,
`sweep_references`, `compute_requirement_diff` and the CLI accept one; every entry point
keeps a default that reproduces today's constants byte-for-byte, so this repository's
behaviour and output are unchanged.

The layout may be read from a configuration file in the target repository, which is where
stack detection (SWR-2315) writes its proposal. ReqToCode stays **stdlib-only** — the
pre-commit hook runs it without the project virtualenv (SWR-2328), so no third-party
config or validation library may be introduced.

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A synthetic repository with different roots (`lib/`, `spec/`) verifies cleanly with a custom layout, and the default layout still reproduces the current constants | `parse_requirements` / `verify` / `sweep_references` with an explicit layout | `tests/unit/reqtocode/test_layout.py` |
| Integration | `python -m rotaris_core.reqtocode check` on *this* repository is unchanged — same stats, same exit code | CLI over the real store | `tests/unit/reqtocode/test_traceability_meta.py` (existing, must stay green) |
| User-flow E2E | `N/A — developer tooling; the meta-test over the real repository is the productive path` | — | — |

## SWR-2336 — Public coverage query API
status: approved

The per-requirement coverage information already exists inside the verifier —
`Sweep.impl_traces` and `Sweep.test_coverage` map a requirement number to every
`@traces`/`@verifies` site with file and line — but it is reachable only by running the
whole verification and is not part of any public surface. Evidence-gated completion per
acceptance criterion (epic 2600 follow-up) and the Mission-Control coverage view need
exactly this data without the enforcement.

Requirement: a public, side-effect-free query API answers "which implementation sites and
which covering tests exist for requirement X" — for one id and for all ids — returning the
site records (path, line, kind) that the sweep already produces. It performs no I/O beyond
reading the source roots, raises no errors for uncovered requirements, and is usable
without a git checkout.

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A requirement with two implementations and one test returns both site sets; an uncovered requirement returns empty sets rather than raising | The public query functions | `tests/unit/reqtocode/test_coverage_api.py` |
| Integration | Querying a known requirement of this repository returns its real sites | The API over the real store | `tests/unit/reqtocode/test_coverage_api.py` |
| User-flow E2E | `N/A — library API; its product flow is the completion gate that consumes it (epic 2600 follow-up)` | — | — |

## SWR-2337 — Annotation convention behind an interface
status: approved

The sweep hard-codes one convention: `_CALL_RE` matching `traces(...)`/`verifies(...)` call
text, `_SYMBOL_RE` matching `SWR_<n>`, `_REQ_COMMENT_RE` matching `# @req:`, applied to
`.py` files only. SWR-2316 (per-stack conventions) cannot be built while that is inlined.

Requirement: annotation recognition sits behind a small interface — given a file, yield the
requirement references it declares and whether each is a trace or a coverage reference,
plus which file extensions the convention claims. The Python convention is the default
implementation and its behaviour, including the transitional `# @req:` comments and legacy
id resolution, is unchanged. The orphan-code and orphan-test checks (SWR-2333/SWR-2334)
consult the same interface, so a non-Python stack cannot silently escape reverse
enforcement.

This requirement delivers the seam only. Registering concrete non-Python conventions is
SWR-2316.

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A fake convention over a non-Python file yields its references; the Python convention keeps recognising decorators, direct calls and `# @req:` comments | The convention interface + sweep | `tests/unit/reqtocode/test_annotation_conventions.py` |
| Integration | The full verifier run over this repository yields byte-identical stats before and after the refactor | `verify()` over the real store | `tests/unit/reqtocode/test_traceability_meta.py` (existing) |
| User-flow E2E | `N/A — internal seam; product value arrives with SWR-2316` | — | — |

## History

- 2026-08-09 — **Triage of the pre-ReqToCode remainder.** Thirteen ids had stood on
  `draft` since the 2026-04-17 import and described the *generated matrix* that ReqToCode
  replaced in 2026-07-19; because they were `draft`, their inherited `trace: required` /
  `test: required` flags were never enforced, so the debt was invisible. Seven are now
  retired as absorbed or never-adopted (SWR-2302, 2307, 2308, 2309, 2312, 2314, 2323 —
  deprecated on that date, deleted in the 2026-08-28 sweep, tombstoned in `retired-ids.txt`);
  six are re-cut in ReqToCode terms as the productization backlog (SWR-2303, 2311, 2315,
  2316, 2317, 2318). Three new requirements carry the first productization step —
  SWR-2335 (layout as data), SWR-2336 (public coverage query), SWR-2337 (annotation
  convention seam) — which are what the later per-stack work depends on. Derivation:
  [docs/plans/2026-08-09-marktanalyse-offene-punkte.md](../plans/2026-08-09-marktanalyse-offene-punkte.md), item O1.

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
