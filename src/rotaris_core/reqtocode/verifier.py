"""ReqToCode verifier (blueprint §6): one pure check routine for every layer.

Returns error/warning lists, does no logging itself. The reference sweep is a
static text scan (Python has no compile step; blueprint §13 sanctions AST/static
scan). Implementation traces and test coverage are counted separately:
`traces()` only counts inside implementation roots, `verifies()` and `# @req:`
comments only inside test roots.

Bootstrap debt is carried by a baseline file (shrink-only ratchet): approved
requirements that predate ReqToCode and have no annotations yet are listed
there and suppressed until annotated; new violations are always errors.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode.conventions import (
    COVERAGE_KINDS,
    DEFAULT_CONVENTIONS,
    TRACE_KIND,
    ConventionRegistry,
    LineIndex,
    PythonConvention,
)
from rotaris_core.reqtocode.declarations import ReqMeta, ReqStatus
from rotaris_core.reqtocode.generator import (
    ParseResult,
    generate,
    parse_requirements,
    read_generated,
)
from rotaris_core.reqtocode.layout import DEFAULT_LAYOUT, RepoLayout

if TYPE_CHECKING:
    from rotaris_core.reqtocode.conventions import AnnotationConvention

#: Backwards-compatible aliases of the default layout (the pre-SWR-2335 constants).
BASELINE_PATH = DEFAULT_LAYOUT.baseline_path
ORPHAN_BASELINE_PATH = DEFAULT_LAYOUT.orphan_baseline_path
TEST_ORPHAN_BASELINE_PATH = DEFAULT_LAYOUT.test_orphan_baseline_path

#: A module (or, for tests, a function near this marker) is intentionally
#: trace-free (pure config, re-export shim, generated glue, requirement-free
#: fixture/scaffolding) and is excused from the orphan-code/orphan-test check.
EXEMPT_MARKER = DEFAULT_LAYOUT.exempt_marker

IMPL_ROOTS = DEFAULT_LAYOUT.impl_roots
TEST_ROOTS = DEFAULT_LAYOUT.test_roots

#: Live-provider confidence tests (test strategy: optional, never sole E2E
#: coverage) exercise general framework capability, not one requirement.
#: The name is historical: `tests/live` is excused on the same grounds, so read
#: `excused_test_roots` rather than this when you want all of them.
CAPABILITY_TEST_ROOT = DEFAULT_LAYOUT.excused_test_roots[0]

_SWR_ID_RE = re.compile(r"^SWR-(\d+)$")
_TEST_ORPHAN_ENTRY_RE = re.compile(r"^[\w./\-]+\.\w+(?:::\w+)*::test_\w+$")


@dataclass(frozen=True)
class Occurrence:
    number: int
    file: str  # repo-relative posix path
    line: int
    kind: str  # "traces" | "verifies" | "@req"


@dataclass
class Sweep:
    impl_traces: dict[int, list[Occurrence]] = field(default_factory=dict)
    test_coverage: dict[int, list[Occurrence]] = field(default_factory=dict)
    all_references: dict[int, list[Occurrence]] = field(default_factory=dict)
    unresolved_legacy: list[tuple[str, str, int]] = field(default_factory=list)
    traced_files: set[str] = field(default_factory=set)  # impl files with ≥1 traces() ref


@dataclass
class VerificationResult:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    stats: dict[str, int] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.errors


def _iter_source_files(
    repo_root: Path,
    roots: tuple[Path, ...],
    layout: RepoLayout,
    conventions: ConventionRegistry,
) -> list[tuple[Path, AnnotationConvention]]:
    """Every scannable file under `roots`, paired with the convention claiming it."""
    files: list[tuple[Path, AnnotationConvention]] = []
    generated = repo_root / layout.generated_path
    extensions = conventions.extensions()
    for root in roots:
        base = repo_root / root
        if not base.is_dir():
            continue
        candidates = {path for extension in extensions for path in base.rglob(f"*{extension}")}
        for path in sorted(candidates, key=lambda p: p.as_posix()):
            rel_parts = path.relative_to(base).parts
            if any(part in layout.skip_parts for part in rel_parts):
                continue
            if path == generated:
                continue
            convention = conventions.for_path(path)
            if convention is not None:
                files.append((path, convention))
    return files


def _record(store: dict[int, list[Occurrence]], occ: Occurrence) -> None:
    store.setdefault(occ.number, []).append(occ)


def sweep_references(
    repo_root: Path,
    legacy_aliases: dict[str, str],
    layout: RepoLayout | None = None,
    conventions: ConventionRegistry | None = None,
) -> Sweep:
    """Collect trace/coverage occurrences across the impl and test roots.

    Recognition is delegated to the annotation convention claiming each file, so
    a non-Python stack is swept by the same rules.
    """
    layout = layout if layout is not None else DEFAULT_LAYOUT
    conventions = conventions if conventions is not None else DEFAULT_CONVENTIONS
    sweep = Sweep()
    for is_test_root, roots in ((False, layout.impl_roots), (True, layout.test_roots)):
        for path, convention in _iter_source_files(repo_root, roots, layout, conventions):
            rel = path.relative_to(repo_root).as_posix()
            text = path.read_text(encoding="utf-8", errors="replace")
            for ref in convention.iter_references(text, legacy_aliases):
                # Transitional `@req:` comments are a test-side convention only.
                if ref.kind == "@req" and not is_test_root:
                    continue
                if ref.number is None:
                    sweep.unresolved_legacy.append((ref.raw_id, rel, ref.line))
                    continue
                occ = Occurrence(number=ref.number, file=rel, line=ref.line, kind=ref.kind)
                _record(sweep.all_references, occ)
                if ref.kind == TRACE_KIND and not is_test_root:
                    _record(sweep.impl_traces, occ)
                    sweep.traced_files.add(rel)
                elif ref.kind in COVERAGE_KINDS and is_test_root:
                    _record(sweep.test_coverage, occ)
    return sweep


def load_baseline(
    repo_root: Path, layout: RepoLayout | None = None
) -> tuple[dict[int, set[str]], list[str]]:
    """Baseline entries: `SWR-<n> trace [test]` per line. Returns (entries, errors)."""
    layout = layout if layout is not None else DEFAULT_LAYOUT
    path = repo_root / layout.baseline_path
    entries: dict[int, set[str]] = {}
    errors: list[str] = []
    if not path.is_file():
        return entries, errors
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        id_match = _SWR_ID_RE.match(parts[0])
        flags = set(parts[1:])
        if not id_match or not flags or not flags <= {"trace", "test"}:
            errors.append(
                f"{layout.baseline_path.as_posix()}:{lineno}: malformed baseline entry {line!r}"
                " (expected 'SWR-<n> trace|test [trace|test]')"
            )
            continue
        entries.setdefault(int(id_match.group(1)), set()).update(flags)
    return entries, errors


def find_orphan_modules(
    repo_root: Path,
    sweep: Sweep,
    layout: RepoLayout | None = None,
    conventions: ConventionRegistry | None = None,
) -> list[str]:
    """Impl modules with no trace reference — the reqtospec reverse check.

    Every production module must trace to a requirement (blueprint: no orphan
    code). Excused: the convention's structural shims (`__init__.py` re-exports
    for Python), the generated traceables file, and modules carrying the exempt
    marker. Deleting a requirement strips its `@traces`; if that was a module's
    only link it resurfaces here.
    """
    layout = layout if layout is not None else DEFAULT_LAYOUT
    conventions = conventions if conventions is not None else DEFAULT_CONVENTIONS
    orphans: list[str] = []
    for path, convention in _iter_source_files(repo_root, layout.impl_roots, layout, conventions):
        rel = path.relative_to(repo_root).as_posix()
        if convention.is_module_excused(rel) or rel in sweep.traced_files:
            continue
        if layout.exempt_marker in path.read_text(encoding="utf-8", errors="replace"):
            continue
        orphans.append(rel)
    return sorted(orphans)


def _iter_test_functions(text: str) -> list[tuple[str, int, int]]:
    """Back-compatible view of the Python convention's test-function scan."""
    return [
        (fn.qualname, fn.start_line, fn.end_line)
        for fn in PythonConvention().iter_test_functions(text)
    ]


def find_orphan_tests(
    repo_root: Path,
    sweep: Sweep,
    layout: RepoLayout | None = None,
    conventions: ConventionRegistry | None = None,
) -> list[str]:
    """Test functions with no coverage reference — the test-side reverse check
    (mirrors `find_orphan_modules`).

    Every test must trace to the requirement it verifies (test strategy: tests
    begin from productive intent, not internal implementation steps). Excused:
    the layout's excused test roots (optional live-provider confidence, never the
    sole E2E coverage for a requirement) and functions annotated with the exempt
    marker. Identifiers are `<repo-relative path>::<function name>` (module
    level) or `<repo-relative path>::<class name>::<function name>` (nested),
    matching pytest's own node-id convention.
    """
    layout = layout if layout is not None else DEFAULT_LAYOUT
    conventions = conventions if conventions is not None else DEFAULT_CONVENTIONS
    coverage_lines: dict[str, list[int]] = {}
    for occs in sweep.test_coverage.values():
        for occ in occs:
            coverage_lines.setdefault(occ.file, []).append(occ.line)

    orphans: list[str] = []
    marker_re = re.compile(re.escape(layout.exempt_marker))
    for path, convention in _iter_source_files(repo_root, layout.test_roots, layout, conventions):
        rel = path.relative_to(repo_root).as_posix()
        if layout.is_excused_test_file(rel):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        functions = convention.iter_test_functions(text)
        if not functions:
            continue
        covered = coverage_lines.get(rel, [])
        exempt_lines = LineIndex(text)
        exempt = [exempt_lines.line(m.start()) for m in marker_re.finditer(text)]
        for function in functions:
            window = range(function.start_line - 2, function.end_line + 1)
            if any(ln in window for ln in covered) or any(ln in window for ln in exempt):
                continue
            orphans.append(f"{rel}::{function.qualname}")
    return sorted(orphans)


def load_test_orphan_baseline(
    repo_root: Path, layout: RepoLayout | None = None
) -> tuple[set[str], list[str]]:
    """Orphan-test baseline: one `path::func` entry per line. Returns (entries, errors)."""
    layout = layout if layout is not None else DEFAULT_LAYOUT
    path = repo_root / layout.test_orphan_baseline_path
    entries: set[str] = set()
    errors: list[str] = []
    if not path.is_file():
        return entries, errors
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if not _TEST_ORPHAN_ENTRY_RE.match(line):
            errors.append(
                f"{layout.test_orphan_baseline_path.as_posix()}:{lineno}: malformed"
                f" orphan-test entry {line!r}"
                " (expected 'path/to/test_file.py::test_function_name')"
            )
            continue
        entries.add(line)
    return entries, errors


def render_test_orphan_baseline(entries: set[str], layout: RepoLayout | None = None) -> str:
    layout = layout if layout is not None else DEFAULT_LAYOUT
    lines = [
        "# ReqToCode orphan-test baseline - pre-existing unannotated tests.",
        "# Each line is 'path/to/test_file.py::test_function_name' excused from",
        "# the reverse (test -> requirement) check. This file may only SHRINK:",
        "# add @verifies (or '# @req: SWR-<n>'), mark it",
        f"# '{layout.exempt_marker}', or delete the test, then prune via",
        "#   python -m rotaris_core.reqtocode check --update-baseline",
        "# Never add entries for new tests.",
    ]
    lines.extend(sorted(entries))
    return "\n".join(lines) + "\n"


def load_orphan_baseline(
    repo_root: Path, layout: RepoLayout | None = None
) -> tuple[set[str], list[str]]:
    """Orphan baseline: one repo-relative module path per line. Returns (entries, errors)."""
    layout = layout if layout is not None else DEFAULT_LAYOUT
    path = repo_root / layout.orphan_baseline_path
    entries: set[str] = set()
    errors: list[str] = []
    if not path.is_file():
        return entries, errors
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "." not in Path(line).name or " " in line:
            errors.append(
                f"{layout.orphan_baseline_path.as_posix()}:{lineno}: malformed orphan entry"
                f" {line!r} (expected a single repo-relative source path)"
            )
            continue
        entries.add(line)
    return entries, errors


def render_orphan_baseline(paths: set[str], layout: RepoLayout | None = None) -> str:
    layout = layout if layout is not None else DEFAULT_LAYOUT
    lines = [
        "# ReqToCode orphan-code baseline - pre-existing untraced modules.",
        "# Each line is a repo-relative source path excused from the reverse",
        "# (code -> requirement) check. This file may only SHRINK: trace the",
        f"# module (add @traces), mark it '{layout.exempt_marker}', or delete it,",
        "# then prune via  python -m rotaris_core.reqtocode check --update-baseline",
        "# Never add entries for new modules.",
    ]
    lines.extend(sorted(paths))
    return "\n".join(lines) + "\n"


def _check_derived_origin(
    req: ReqMeta, origin: int, by_number: dict[int, ReqMeta], result: VerificationResult
) -> None:
    if origin == req.number:
        result.errors.append(
            f"{req.req_id} {req.title!r} ({req.source_path}) lists itself in derived-from."
            " A technical requirement must derive from a different one."
        )
        return
    target = by_number.get(origin)
    if target is None:
        result.errors.append(
            f"{req.req_id} {req.title!r} ({req.source_path}) derives from SWR-{origin}"
            " but no such requirement exists. Point derived-from at a real"
            " originating requirement or remove it."
        )
    elif target.status is ReqStatus.DEPRECATED:
        result.warnings.append(
            f"{req.req_id} derives from deprecated requirement {target.req_id}"
            f" ({target.title!r}, {target.source_path}). Re-point it at the"
            " superseding requirement."
        )


def check_technical_links(requirements: list[ReqMeta], result: VerificationResult) -> None:
    """Enforce the ReqToCode technical-requirement contract (derived-from integrity).

    The forward `derived-from` frontmatter link is the single source of truth; a
    technical requirement must declare one, only technical requirements may, and
    every origin must resolve to a real, non-self requirement (deprecated origins
    warn). This keeps supplementary code from drifting away from the product
    requirement that motivated it.
    """
    by_number = {r.number: r for r in requirements}
    for req in requirements:
        is_technical = req.req_type == "technical"
        if is_technical and not req.derived_from:
            result.errors.append(
                f"{req.req_id} {req.title!r} ({req.source_path}) is type: technical but has"
                " no derived-from. Add 'derived-from: SWR-<origin>' naming the requirement"
                " whose implementation made this supplementary code necessary."
            )
        if req.derived_from and not is_technical:
            result.errors.append(
                f"{req.req_id} {req.title!r} ({req.source_path}) declares derived-from but is"
                " not type: technical. Set 'type: technical' or remove the derived-from link."
            )
        for origin in req.derived_from:
            _check_derived_origin(req, origin, by_number, result)


def _check_orphan_modules(
    repo_root: Path,
    sweep: Sweep,
    result: VerificationResult,
    layout: RepoLayout,
    conventions: ConventionRegistry,
) -> int:
    """Reverse check: untraced impl modules are errors unless baselined. Returns suppressed."""
    orphans = find_orphan_modules(repo_root, sweep, layout, conventions)
    baseline, baseline_errors = load_orphan_baseline(repo_root, layout)
    result.errors.extend(baseline_errors)
    orphan_set = set(orphans)
    suppressed = 0
    for rel in orphans:
        if rel in baseline:
            suppressed += 1
            continue
        result.errors.append(
            f"{rel} has no @traces() reference (orphan code). Trace it to the requirement"
            " it serves with @traces(SWR.SWR_<n>) — create a technical requirement"
            f" (type: technical, derived-from) if none fits — or mark it '{layout.exempt_marker}'"
            " if it is intentionally trace-free."
        )
    for rel in sorted(baseline - orphan_set):
        result.warnings.append(
            f"orphan baseline entry {rel} is now traced/exempt/removed; prune it from"
            f" {layout.orphan_baseline_path.as_posix()}"
            " (python -m rotaris_core.reqtocode check --update-baseline)"
        )
    return suppressed


def _check_orphan_tests(
    repo_root: Path,
    sweep: Sweep,
    result: VerificationResult,
    layout: RepoLayout,
    conventions: ConventionRegistry,
) -> int:
    """Reverse check: unannotated test functions are errors unless baselined. Returns suppressed."""
    orphans = find_orphan_tests(repo_root, sweep, layout, conventions)
    baseline, baseline_errors = load_test_orphan_baseline(repo_root, layout)
    result.errors.extend(baseline_errors)
    orphan_set = set(orphans)
    suppressed = 0
    for entry in orphans:
        if entry in baseline:
            suppressed += 1
            continue
        result.errors.append(
            f"{entry} has no @verifies()/# @req: reference (orphan test). Add"
            " @verifies(SWR.SWR_<n>) naming the requirement it verifies — author a"
            " technical requirement (type: technical, derived-from) if none fits —"
            f" or mark it '{layout.exempt_marker}' if it is intentionally requirement-free."
        )
    for entry in sorted(baseline - orphan_set):
        result.warnings.append(
            f"orphan-test baseline entry {entry} is now annotated/exempt/removed; prune it"
            f" from {layout.test_orphan_baseline_path.as_posix()}"
            " (python -m rotaris_core.reqtocode check --update-baseline)"
        )
    return suppressed


def verify(
    repo_root: Path,
    parsed: ParseResult | None = None,
    layout: RepoLayout | None = None,
    conventions: ConventionRegistry | None = None,
) -> VerificationResult:
    """Apply the lifecycle rules of blueprint §5. Pure: returns issue lists."""
    layout = layout if layout is not None else DEFAULT_LAYOUT
    conventions = conventions if conventions is not None else DEFAULT_CONVENTIONS
    result = VerificationResult()
    parsed = parsed if parsed is not None else parse_requirements(repo_root, layout)
    result.errors.extend(parsed.errors)
    if parsed.errors:
        return result  # everything downstream depends on a clean parse

    if read_generated(repo_root, layout) != generate(parsed.requirements, layout):
        result.errors.append(
            f"generated traceables file {layout.generated_path.as_posix()} is stale or missing."
            " Run: python -m rotaris_core.reqtocode check --fix"
        )

    sweep = sweep_references(repo_root, parsed.legacy_aliases, layout, conventions)
    baseline, baseline_errors = load_baseline(repo_root, layout)
    result.errors.extend(baseline_errors)

    check_technical_links(parsed.requirements, result)

    by_number = {r.number: r for r in parsed.requirements}

    # Removed-requirement semantics: a reference to a nonexistent symbol.
    for number in sorted(sweep.all_references):
        if number in by_number:
            continue
        for occ in sweep.all_references[number]:
            result.errors.append(
                f"{occ.file}:{occ.line} references SWR_{number} but no requirement"
                f" SWR-{number} exists (removed or never created). Remove the reference"
                " or restore the requirement file."
            )

    suppressed_trace = suppressed_test = 0
    for req in parsed.requirements:
        refs = sweep.all_references.get(req.number, [])
        if req.status is ReqStatus.DEPRECATED and refs:
            sites = ", ".join(f"{o.file}:{o.line}" for o in refs[:5])
            more = f" (+{len(refs) - 5} more)" if len(refs) > 5 else ""
            result.warnings.append(
                f"{req.req_id} {req.title!r} is deprecated but still referenced at"
                f" {sites}{more}. Migrate or remove the references ({req.source_path})."
            )
        if req.status is not ReqStatus.APPROVED:
            continue
        baseline_flags = baseline.get(req.number, set())
        if req.trace_required and not sweep.impl_traces.get(req.number):
            if "trace" in baseline_flags:
                suppressed_trace += 1
            else:
                result.errors.append(
                    f"{req.req_id} {req.title!r} ({req.source_path}) is approved with"
                    " trace: required but has no traces() reference. Add"
                    f" @traces(SWR.SWR_{req.number}) to the implementing code element"
                    " (from rotaris_core.reqtocode import SWR, traces)."
                )
        if req.test_required and not sweep.test_coverage.get(req.number):
            if "test" in baseline_flags:
                suppressed_test += 1
            else:
                result.errors.append(
                    f"{req.req_id} {req.title!r} ({req.source_path}) is approved with"
                    " test: required but has no test coverage. Add"
                    f" @verifies(SWR.SWR_{req.number}) to a covering test"
                    " (from rotaris_core.reqtocode import SWR, verifies)."
                )

    # Baseline ratchet hygiene: entries must shrink as debt is paid.
    for number in sorted(baseline):
        base_req = by_number.get(number)
        if base_req is None or base_req.status is not ReqStatus.APPROVED:
            result.warnings.append(
                f"baseline entry SWR-{number} no longer matches an approved requirement;"
                f" remove it from {layout.baseline_path.as_posix()}"
                " (python -m rotaris_core.reqtocode check --update-baseline)"
            )
            continue
        satisfied = set()
        if "trace" in baseline[number] and (
            not base_req.trace_required or sweep.impl_traces.get(number)
        ):
            satisfied.add("trace")
        if "test" in baseline[number] and (
            not base_req.test_required or sweep.test_coverage.get(number)
        ):
            satisfied.add("test")
        if satisfied:
            result.warnings.append(
                f"baseline entry SWR-{number} [{' '.join(sorted(satisfied))}] is satisfied;"
                f" prune it from {layout.baseline_path.as_posix()}"
                " (python -m rotaris_core.reqtocode check --update-baseline)"
            )

    for raw_id, rel, line in sweep.unresolved_legacy:
        result.warnings.append(
            f"{rel}:{line}: '# @req: {raw_id}' does not resolve to a requirement"
            " (ambiguous or unknown legacy id). Replace it with the SWR-<n> id."
        )

    suppressed_orphan = _check_orphan_modules(repo_root, sweep, result, layout, conventions)
    suppressed_orphan_test = _check_orphan_tests(repo_root, sweep, result, layout, conventions)

    approved = [r for r in parsed.requirements if r.status is ReqStatus.APPROVED]
    result.stats = {
        "requirements": len(parsed.requirements),
        "approved": len(approved),
        "traced": sum(1 for r in approved if sweep.impl_traces.get(r.number)),
        "covered": sum(1 for r in approved if sweep.test_coverage.get(r.number)),
        "baseline_suppressed_trace": suppressed_trace,
        "baseline_suppressed_test": suppressed_test,
        "baseline_suppressed_orphan": suppressed_orphan,
        "baseline_suppressed_orphan_test": suppressed_orphan_test,
    }
    return result


def compute_baseline(
    repo_root: Path,
    parsed: ParseResult | None = None,
    layout: RepoLayout | None = None,
    conventions: ConventionRegistry | None = None,
) -> dict[int, set[str]]:
    """Current unmet trace/test obligations for approved requirements."""
    layout = layout if layout is not None else DEFAULT_LAYOUT
    parsed = parsed if parsed is not None else parse_requirements(repo_root, layout)
    sweep = sweep_references(repo_root, parsed.legacy_aliases, layout, conventions)
    missing: dict[int, set[str]] = {}
    for req in parsed.requirements:
        if req.status is not ReqStatus.APPROVED:
            continue
        flags = set()
        if req.trace_required and not sweep.impl_traces.get(req.number):
            flags.add("trace")
        if req.test_required and not sweep.test_coverage.get(req.number):
            flags.add("test")
        if flags:
            missing[req.number] = flags
    return missing


def compute_orphan_baseline(
    repo_root: Path,
    parsed: ParseResult | None = None,
    layout: RepoLayout | None = None,
    conventions: ConventionRegistry | None = None,
) -> set[str]:
    """Current set of orphan (untraced, non-exempt) impl modules."""
    layout = layout if layout is not None else DEFAULT_LAYOUT
    parsed = parsed if parsed is not None else parse_requirements(repo_root, layout)
    sweep = sweep_references(repo_root, parsed.legacy_aliases, layout, conventions)
    return set(find_orphan_modules(repo_root, sweep, layout, conventions))


def compute_orphan_test_baseline(
    repo_root: Path,
    parsed: ParseResult | None = None,
    layout: RepoLayout | None = None,
    conventions: ConventionRegistry | None = None,
) -> set[str]:
    """Current set of orphan (unannotated, non-exempt, non-excused) test functions."""
    layout = layout if layout is not None else DEFAULT_LAYOUT
    parsed = parsed if parsed is not None else parse_requirements(repo_root, layout)
    sweep = sweep_references(repo_root, parsed.legacy_aliases, layout, conventions)
    return set(find_orphan_tests(repo_root, sweep, layout, conventions))


def _self_annotate() -> None:
    # Bootstrap-safe (blueprint §11): tolerate a missing generated module.
    try:
        from rotaris_core.reqtocode.declarations import traces
        from rotaris_core.reqtocode.swr import SWR

        traces(SWR.SWR_2326)(verify)
        traces(SWR.SWR_2326)(sweep_references)
        traces(SWR.SWR_2335)(verify)
        traces(SWR.SWR_2335)(_iter_source_files)
        traces(SWR.SWR_2337)(sweep_references)
        traces(SWR.SWR_2327)(load_baseline)
        traces(SWR.SWR_2327)(compute_baseline)
        traces(SWR.SWR_2331)(check_technical_links)
        traces(SWR.SWR_2331)(_check_derived_origin)
        traces(SWR.SWR_2333)(find_orphan_modules)
        traces(SWR.SWR_2333)(_check_orphan_modules)
        traces(SWR.SWR_2333)(load_orphan_baseline)
        traces(SWR.SWR_2333)(compute_orphan_baseline)
        traces(SWR.SWR_2334)(_iter_test_functions)
        traces(SWR.SWR_2334)(find_orphan_tests)
        traces(SWR.SWR_2334)(_check_orphan_tests)
        traces(SWR.SWR_2334)(load_test_orphan_baseline)
        traces(SWR.SWR_2334)(compute_orphan_test_baseline)
    except (ImportError, AttributeError):  # pragma: no cover - bootstrap/stale swr.py
        return


def render_baseline(entries: dict[int, set[str]]) -> str:
    lines = [
        "# ReqToCode bootstrap baseline - pre-existing traceability debt.",
        "# Each line: SWR-<n> followed by the unmet flags (trace/test) it is",
        "# excused from. This file may only SHRINK: pay debt by annotating the",
        "# implementation/tests, then prune via",
        "#   python -m rotaris_core.reqtocode check --update-baseline",
        "# Never add entries for new work.",
    ]
    for number in sorted(entries):
        flags = " ".join(sorted(entries[number]))
        lines.append(f"SWR-{number} {flags}")
    return "\n".join(lines) + "\n"


_self_annotate()
