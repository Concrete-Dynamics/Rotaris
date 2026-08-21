"""Requirement-coverage evidence for one iteration (SWR-2606, SWR-2607).

The completion gate (SWR-2604) proves the *project's* check suite ran and passed.
It says nothing about whether the *requirements the iteration touched* have named
evidence: an agent can edit the module implementing SWR-1234, never touch that
requirement's covering test, and still pass a green suite.

This module closes that gap. From the files an iteration changed it derives:

- **which requirements the change served** — via ReqToCode's implementation-site
  index (:mod:`rotaris_core.reqtocode.coverage`, SWR-2336), not a second scanner;
- **what covers each of them** — the requirement's own ``@verifies`` test sites;
- **whether those covering tests actually ran in this iteration's suite** — matched
  against the :class:`~rotaris_core.verifier.runner.CheckResult` list the verifier
  produced. A covering test that exists but did not run is not the same fact as one
  that passed, and the two are distinguishable here without reading a log;
- **what the change touched that no requirement asked for** — delegated to
  :mod:`rotaris_core.verifier.scope_drift` (SWR-2607).

Three properties are load-bearing:

- **Runner-owned.** ``SummaryAgent._normalize_payload`` strips these fields from LLM
  output before validation, exactly as it does ``verifier_results``. A summarizing
  model must not be able to claim coverage it never produced.
- **Reporting, not gating.** Nothing here can fail an iteration. Making a missing
  acceptance criterion block completion is a later policy decision; doing both at
  once would make an unadopted workspace un-runnable.
- **``None`` means "not computed".** A workspace with no requirement store, or an
  unreadable index, yields ``None`` — never an empty result that would read as
  "nothing was touched".

Two limits are worth stating plainly rather than discovering later:

- The **changed set is what the iteration declared**. SWR-2602's tool-call delta
  counts mutations without recording paths, so the child report's
  ``edited_files``/``created_files`` are the only naming source. An edit made
  through a tool that never reported it is outside this evidence — the same blind
  spot the verifier's change detection already documents.
- The sweep reads the workspace **after** the change. A file the iteration
  *deleted* carries no annotation to find, so a requirement whose last
  implementation site was just removed is not reported as touched.

Cost: one requirement parse, one annotation sweep and one orphan-module scan per
*code-modifying* iteration — the sweep and its parse are computed once and shared
by the coverage pass and the drift pass. Measured at ~2.3s on this repository
(1353 requirements), against a check suite that already costs minutes. Callers
must not run it for an iteration that changed nothing.
"""

from __future__ import annotations

import logging
import re
import shlex
import time
from pathlib import Path, PurePosixPath
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.verifier.scope_drift import ScopeDriftEvidence, build_scope_drift

if TYPE_CHECKING:
    from collections.abc import Collection, Iterable, Sequence

    from rotaris_core.reqtocode.conventions import ConventionRegistry
    from rotaris_core.reqtocode.declarations import ReqMeta
    from rotaris_core.reqtocode.layout import RepoLayout
    from rotaris_core.verifier.runner import CheckResult

_log = logging.getLogger(__name__)

#: How well a touched requirement is backed by evidence from *this* iteration.
#:
#: - ``uncovered``     — no covering test exists at all (SWR-2606's named gap).
#: - ``not_run``       — a covering test exists but this iteration's suite did not run it.
#: - ``inconclusive``  — a check reached the test but said nothing about *it*: the run
#:   was killed, or it failed as a whole, or it selected only part of the file. The
#:   suite has a verdict; this test does not.
#: - ``failing``       — a covering test ran and *that test* did not pass.
#: - ``verified``      — a covering test ran and *that test* passed.
CoverageState = Literal["uncovered", "not_run", "inconclusive", "failing", "verified"]

#: What one check's result licenses us to say about one covering test it reached.
#:
#: The whole correctness argument of this module lives in this type. A check result
#: is a *suite-level* observation; a covering test's state is a *test-level* claim,
#: and only two inferences carry from one to the other without a per-test report:
#: a check that passed while selecting everything it reached ran and passed every
#: test in those files, and a check that never reached a file ran none of it.
#: Everything else — killed, failed as a whole, or narrowed to a subset — leaves the
#: individual test unobserved, and saying otherwise is how one dead check came to
#: accuse 8329 tests it never ran.
TestVerdict = Literal["passed", "failed", "unknown", "not_run"]

#: Statuses that mean a check actually executed. ``skipped`` deliberately does not
#: qualify: a skipped check is not evidence, which is the same distinction
#: ``VerifierEvidence`` draws between ``skipped`` and ``passed``.
_EXECUTED_STATUSES = frozenset({"passed", "failed", "timeout"})

#: Statuses that mean the check itself did not pass. A **check-level** fact, and
#: deliberately not a test-level one: it decides which check is reported when
#: several reached a file, and it gates the suite, but on its own it never decides
#: that a particular test failed. :func:`verdict_for` owns that step.
_FAILED_STATUSES = frozenset({"failed", "timeout"})

#: Commands recognised as running a test suite. A check that only lints or type-checks
#: must never be read as evidence that a covering test ran, so the match is a
#: allow-list of runners rather than "anything that exited zero".
_TEST_RUNNER_RE = re.compile(
    r"(?:^|[\s/\\;&|(])(?:"
    r"py\.?test|unittest|nox|tox|jest|vitest|mocha|ava|karma|rspec|phpunit"
    r"|(?:go|cargo|dotnet|swift|gradle|mvn|bazel)\s+test"
    r"|(?:npm|pnpm|yarn|bun|deno)\s+(?:run\s+)?test"
    r"|(?:make|just|task)\s+\S*test"
    r")",
    re.IGNORECASE,
)

#: A check whose *name* says it runs tests counts too, so a workspace can declare
#: intent for a runner this module has never heard of.
_TEST_NAME_RE = re.compile(r"(?:^|[^a-z])tests?(?:$|[^a-z])", re.IGNORECASE)

#: File suffixes a bare (slash-free) command token may carry to still be a path.
_SOURCE_SUFFIXES = frozenset(
    {".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".rb", ".java", ".kt", ".cs", ".php"},
)

#: A posix-normalized path that is absolute, on either platform: a leading slash
#: or a Windows drive letter. Such a target cannot be compared to a
#: repository-relative site directly, only on the tail it ends with.
_ABSOLUTE_RE = re.compile(r"^(?:/|[A-Za-z]:/)")

#: Flags whose *next* token is a value, not a path target. Without these,
#: ``pytest -k tests/slow`` would read its filter expression as a directory.
_VALUE_FLAGS = frozenset(
    {"-k", "-m", "-p", "-c", "-n", "-o", "--deselect", "--ignore", "--rootdir", "--junitxml"},
)

#: Flags that reduce *which tests inside a selected file* run. A green check
#: carrying one of these proves only that the subset it chose passed, so the file's
#: other covering tests stay unobserved.
#:
#: Early-exit flags (``-x``, ``--maxfail``, ``--bail``) are deliberately **absent**.
#: They narrow a run only when something fails, and a failing check is already
#: unattributable for every test — so listing them here would cost precision on
#: healthy repositories and buy nothing. ``--lf`` / ``--ff`` / ``--stepwise`` *are*
#: listed: they narrow a *passing* run to what failed last time, which says nothing
#: about the rest.
_SELECTION_FLAGS = frozenset(
    {
        # pytest
        "-k",
        "-m",
        "--deselect",
        "--lf",
        "--last-failed",
        "--ff",
        "--failed-first",
        "--stepwise",
        "--sw",
        # jest / vitest
        "-t",
        "--testNamePattern",
        "--testPathPattern",
        "--onlyFailures",
        "--onlyChanged",
        "--changedSince",
        "--shard",
        # go
        "-run",
        # cargo / nextest
        "--skip",
        "-E",
        "--filter-expr",
    },
)

#: ``pytest::node::ids`` and ``cargo test some_filter`` narrow within a file without
#: any flag at all. A ``::`` in a target is the portable marker for "part of a file".
_NODE_ID_RE = re.compile(r"::")


@traces(SWR.SWR_2606)
class RequirementSite(BaseModel):
    """One annotated location: where a requirement is implemented or covered."""

    path: str  # repository-relative posix path
    line: int


@traces(SWR.SWR_2606)
class CoveringTest(BaseModel):
    """A test declared to cover a requirement, and what this iteration did with it."""

    path: str
    line: int
    #: Whether this iteration's check suite actually ran the file this test lives in.
    #: ``False`` with a covering test present is the case SWR-2606 exists to expose:
    #: named evidence that nobody executed.
    executed: bool = False
    #: The check that ran it, when one did. ``None`` when ``executed`` is False.
    check_name: str | None = None
    #: That check's status (``passed`` / ``failed`` / ``timeout``). When several
    #: checks ran the file, a failing one is reported in preference to a passing
    #: one so the evidence never over-claims. A **check-level** fact, kept for the
    #: audit trail; what it is worth as evidence about *this test* is ``verdict``.
    check_status: str | None = None
    #: What the run licensed us to say about this test (:func:`verdict_for`).
    #: ``unknown`` where a check reached the file but observed nothing about the
    #: test itself — a killed run, a red suite, a narrowed selection.
    verdict: TestVerdict = "not_run"

    @model_validator(mode="before")
    @classmethod
    def _read_verdict_of_older_records(cls, data: object) -> object:
        """Derive ``verdict`` for a record written before the field existed.

        Every verification already on disk carries ``check_status`` and no verdict,
        and those records are the ones that read a killed suite as a per-test
        failure. Deriving here rather than in a migration means the honest reading
        arrives everywhere at once — board, gate, report — without rewriting a
        store, and a rewrite (``requirements verifications repair``) becomes a
        tidy-up rather than a correctness fix.

        A stored ``passed`` is taken at its word: the command that produced it is
        not kept on the record, so narrowing cannot be re-checked retrospectively.
        That is the one inference this migration cannot make, and it errs towards
        the reading the record was written to mean.
        """
        if not isinstance(data, dict) or data.get("verdict") is not None:
            return data
        status = data.get("check_status")
        if not data.get("executed") or status is None:
            return data
        derived: TestVerdict = "passed" if str(status) == "passed" else "unknown"
        return {**data, "verdict": derived}


@traces(SWR.SWR_2606)
class TouchedRequirement(BaseModel):
    """One requirement this iteration's changed files implement."""

    req_id: str  # e.g. "SWR-2606"
    number: int
    #: Requirement lifecycle from the workspace's own store: ``draft`` /
    #: ``approved`` / ``deprecated``, or ``unknown`` for a number that code
    #: references but the store no longer declares.
    status: str = "unknown"
    title: str = ""
    #: Where the requirement is declared, when the store knows.
    source_path: str | None = None
    #: Implementation sites **inside this iteration's changed set** — the reason
    #: this requirement is on the report at all, not every site it has.
    implementations: list[RequirementSite] = Field(default_factory=list)
    #: Every test declared to cover this requirement, changed or not.
    covering_tests: list[CoveringTest] = Field(default_factory=list)
    #: Stored rather than derived so it survives the report's JSON round-trip,
    #: for the same reason ``VerifierEvidence.verdict`` is stored.
    coverage_state: CoverageState = "uncovered"

    @property
    def is_covered(self) -> bool:
        """Whether any test at all declares it covers this requirement."""
        return bool(self.covering_tests)

    @property
    def is_verified(self) -> bool:
        """Whether a covering test ran in this iteration and its check passed."""
        return self.coverage_state == "verified"


@traces(SWR.SWR_2606)
class RequirementEvidence(BaseModel):
    """What this iteration's changes were accountable to, and what proved it."""

    #: The changed files the evidence was derived from, repo-relative and sorted.
    changed_files: list[str] = Field(default_factory=list)
    #: Requirements traced from those files, ordered by number. Empty means the
    #: change touched no traced production code — which is a computed fact, not
    #: a missing one; ``None`` on the report is the missing case.
    requirements: list[TouchedRequirement] = Field(default_factory=list)
    #: Requirement ids with no covering test at all. Named, not counted: the
    #: point of the field is that a reviewer can go and write the missing test.
    uncovered_requirements: list[str] = Field(default_factory=list)
    #: Requirement ids whose covering tests exist but did not run in this
    #: iteration's suite — the "unverified, and you could not tell from the logs"
    #: case that motivates SWR-2606.
    unrun_requirements: list[str] = Field(default_factory=list)
    #: Requirement ids whose covering test ran and *that test* did not pass.
    failing_requirements: list[str] = Field(default_factory=list)
    #: Requirement ids a check reached without observing: the run was killed, the
    #: suite failed as a whole, or it selected part of the file. Separate from
    #: ``failing_requirements`` on purpose — "this test broke" and "nobody can say"
    #: send a reader to different places, and merging them is what made a timed-out
    #: suite read as 1413 broken requirements.
    inconclusive_requirements: list[str] = Field(default_factory=list)
    #: Wall-clock cost of computing this evidence, so the overhead is observable
    #: rather than guessed at.
    duration_s: float = 0.0

    @property
    def verified_requirements(self) -> list[str]:
        """Requirement ids a covering test ran and passed for."""
        return [req.req_id for req in self.requirements if req.coverage_state == "verified"]


@traces(SWR.SWR_2606, SWR.SWR_2607)
class IterationEvidence(BaseModel):
    """Both SWR-2606 and SWR-2607 answers from a single repository sweep."""

    requirements: RequirementEvidence
    scope_drift: ScopeDriftEvidence


# --------------------------------------------------------------------------
# Changed-set normalization
# --------------------------------------------------------------------------


@traces(SWR.SWR_2606)
def changed_paths(
    repo_root: Path,
    edited_files: Sequence[object] = (),
    created_files: Sequence[object] = (),
) -> list[str]:
    """Repository-relative posix paths this iteration declared it changed.

    The child report is the only source that names *which* files moved — the
    SWR-2602 tool-call delta counts mutations without recording their paths — so
    the report's ``edited_files``/``created_files`` are read here, and the
    SWR-2602 signal decides only *whether* to compute at all.

    Never raises: an entry with no readable ``path`` contributes nothing rather
    than breaking the iteration.
    """
    resolved_root = _resolve(repo_root)
    seen: set[str] = set()
    for entry in (*edited_files, *created_files):
        raw = getattr(entry, "path", entry)
        if not isinstance(raw, str):
            continue
        normalized = _normalize_path(raw, resolved_root)
        if normalized:
            seen.add(normalized)
    return sorted(seen)


def _resolve(path: Path) -> Path:
    try:
        return path.resolve()
    except OSError:  # pragma: no cover - unreachable on supported platforms
        return path


def _normalize_path(raw: str, resolved_root: Path) -> str | None:
    text = raw.strip().replace("\\", "/")
    if not text:
        return None
    candidate = Path(text)
    if candidate.is_absolute():
        try:
            text = _resolve(candidate).relative_to(resolved_root).as_posix()
        except (ValueError, OSError):
            # Outside the workspace: nothing in the requirement index can match
            # it, and reporting it as repo-relative would be a lie.
            return None
    posix = PurePosixPath(text)
    parts = [part for part in posix.parts if part not in {".", ""}]
    if not parts or ".." in parts:
        return None
    return "/".join(parts)


# --------------------------------------------------------------------------
# Matching covering tests against what the suite executed
# --------------------------------------------------------------------------


@traces(SWR.SWR_2606)
def executed_test_runners(checks: Iterable[CheckResult]) -> list[CheckResult]:
    """The executed checks that plausibly ran tests.

    A lint or type-check pass is not evidence that a covering test ran, so only
    recognised test runners — or checks a workspace named for tests — qualify,
    and only when they actually executed.
    """
    return [
        check
        for check in checks
        if str(getattr(check, "status", "")) in _EXECUTED_STATUSES
        and (
            _TEST_RUNNER_RE.search(str(getattr(check, "command", "") or ""))
            or _TEST_NAME_RE.search(str(getattr(check, "name", "") or ""))
        )
    ]


def _runner_arguments(command: str) -> str:
    """The part of ``command`` that follows the runner itself.

    Everything up to and including the runner is program, interpreter and
    subcommand — ``.venv/bin/python -m``, ``uv run``, ``cargo``. Reading those as
    path targets is how a whole-suite run gets misreported as "the covering test
    did not run": ``.venv/bin/python`` is path-shaped, matches no test file, and
    would make an unfiltered ``pytest`` look filtered.

    When the runner is recognised by the check's *name* rather than its command,
    no runner token can be located, so only the leading program word is dropped.

    Deliberately the **first** match, not the last: a target path may itself
    contain a runner name (pytest's own ``/tmp/pytest-of-<user>/`` directories
    do), and taking the last match would swallow the real target.
    """
    match = _TEST_RUNNER_RE.search(command)
    if match is not None:
        return command[match.end() :]
    _program, _, arguments = command.strip().partition(" ")
    return arguments


@traces(SWR.SWR_2606)
def check_path_selectors(command: str, known_dirs: Collection[str] = ()) -> list[str]:
    """Path arguments a check command targets, posix-normalized.

    An empty list means the command named no paths — ``pytest``, ``npm test`` —
    and therefore runs the whole suite. The program, interpreter and subcommand
    words are not targets, nor are flags or the values of the selection flags
    that take one; a ``pytest`` node id keeps only its file part.

    ``known_dirs`` names directories the caller already knows exist (the ancestor
    directories of the test file being matched). Without it a separator-free
    token such as the ``tests`` in ``pytest tests`` is indistinguishable from a
    subcommand like the ``test`` in ``cargo test``, and the command would be read
    as an unfiltered whole-suite run.
    """
    arguments = _runner_arguments(command)
    try:
        tokens = shlex.split(arguments, posix=False)
    except ValueError:
        tokens = arguments.split()

    selectors: list[str] = []
    skip_next = False
    for token in tokens:
        stripped = token.strip().strip("'\"")
        if not stripped:
            continue
        if stripped.startswith("-"):
            skip_next = stripped in _VALUE_FLAGS
            continue
        if skip_next:
            # The value of a selection flag (``-k some_name``), not a target.
            skip_next = False
            continue
        head = stripped.split("::", 1)[0].replace("\\", "/")
        if head in {".", "./"}:
            selectors.append("")  # repository root: selects everything
            continue
        if _ABSOLUTE_RE.match(head):
            # Keep it verbatim; `_selector_covers` matches it on its tail, which
            # is the only part that can correspond to a repository-relative site.
            selectors.append(head.rstrip("/"))
            continue
        cleaned = "/".join(part for part in PurePosixPath(head).parts if part not in {".", "/", ""})
        cleaned = cleaned.rstrip("/")
        if not cleaned:
            continue
        if (
            "/" in cleaned
            or PurePosixPath(cleaned).suffix.lower() in _SOURCE_SUFFIXES
            or cleaned in known_dirs
        ):
            selectors.append(cleaned)
    return selectors


def _selector_covers(selector: str, test_path: str) -> bool:
    if not selector:
        return True
    if test_path == selector or test_path.startswith(selector + "/"):
        return True
    if _ABSOLUTE_RE.match(selector):
        # An absolute target names the same tree from outside the repository:
        # compare on the repository-relative tail it ends with.
        return any(
            selector.endswith("/" + candidate)
            for candidate in (test_path, *_ancestor_dirs(test_path))
        )
    return False


def _ancestor_dirs(test_path: str) -> frozenset[str]:
    """Every directory ``test_path`` lives under, repo-relative and posix."""
    parts = PurePosixPath(test_path).parts[:-1]
    return frozenset("/".join(parts[: index + 1]) for index in range(len(parts)))


def _check_covers(check: CheckResult, test_path: str) -> bool:
    selectors = check_path_selectors(
        str(getattr(check, "command", "") or ""),
        _ancestor_dirs(test_path),
    )
    if not selectors:
        # No paths named: a whole-suite run, which reaches every test file.
        return True
    return any(_selector_covers(selector, test_path) for selector in selectors)


@traces(SWR.SWR_2606)
def narrows_selection(command: str) -> bool:
    """Whether *command* runs only part of the test files it names.

    A green check licenses "every test in the files it reached passed" only when it
    ran all of them. ``pytest -k serialise`` reaches ``test_store.py``, passes, and
    proves nothing about that file's other twenty tests — so without this the
    board credits twenty tests nobody ran, which is the same defect as blaming
    tests nobody ran, pointed the other way.

    Not the same question as :func:`check_path_selectors`, which asks *which files*
    a command names. This asks what happens *inside* them.
    """
    for token in _runner_arguments(command).split():
        if token.split("=", 1)[0] in _SELECTION_FLAGS:
            return True
        # A node id (``tests/test_x.py::test_one``) selects one test in a file.
        if not token.startswith("-") and _NODE_ID_RE.search(token):
            return True
    return False


@traces(SWR.SWR_2606, SWR.SWR_2622)
def verdict_for(
    check: CheckResult | None,
    *,
    test_path: str = "",
    line: int | None = None,
    name: str = "",
) -> TestVerdict:
    """What *check* licenses us to say about one covering test it reached.

    The single place the suite-level → test-level step is taken, so there is one
    definition of it rather than one per consumer.

    **A per-test report answers first** (SWR-2622). When the check produced one
    and it says something about this test, that is a real observation and it wins
    — including over a red suite, which is how a run with one broken test names
    the one and verifies the rest instead of going quiet about all of them.

    Without such a report the only sound reading of a check that did not pass — or
    that passed while running a subset — is ``unknown``: the suite has a verdict,
    this test does not.

    ``unknown`` is not a softer ``failed``. It still refuses ``Done``, because the
    completion gate answers the suite's own failure separately (SWR-2604). What it
    refuses to do is name a test as the cause.
    """
    if check is None:
        return "not_run"
    status = str(getattr(check, "status", ""))
    if status not in _EXECUTED_STATUSES:
        return "not_run"

    from rotaris_core.verifier.test_results import report_verdict  # noqa: PLC0415

    observed = report_verdict(
        getattr(check, "report", None),
        test_path=test_path,
        line=line,
        name=name,
    )
    if observed is not None:
        return observed

    if status != "passed":
        # Failed or killed, and nothing observed this test: the suite says
        # something, this test does not.
        return "unknown"
    if narrows_selection(str(getattr(check, "command", "") or "")):
        return "unknown"
    return "passed"


@traces(SWR.SWR_2606)
def execution_for(test_path: str, runners: Sequence[CheckResult]) -> CheckResult | None:
    """Which executed check, if any, ran the test file at ``test_path``.

    Returns ``None`` when no check reached it. When several did, a check that did
    not pass wins over one that did, so the evidence never shows a pass that
    another check contradicts.

    The granularity is the **file**, and the claim is "a check that runs this
    file executed", not "this test function ran and passed". What that execution
    is worth as evidence *about one test* is :func:`verdict_for`'s question, and
    keeping the two apart is what stopped a whole-suite timeout from reading as a
    per-test failure.
    """
    matches = [check for check in runners if _check_covers(check, test_path)]
    if not matches:
        return None
    return next(
        (check for check in matches if str(check.status) in _FAILED_STATUSES),
        matches[0],
    )


def _state_for(covering: Sequence[CoveringTest]) -> CoverageState:
    """The worst thing true of *covering*, in severity order.

    ``failing`` outranks ``inconclusive`` because a named failure is actionable and
    an unobserved test is not; ``inconclusive`` outranks ``verified`` because a
    requirement is only as verified as its least-observed covering test.
    """
    if not covering:
        return "uncovered"
    verdicts = {test.verdict for test in covering}
    if "failed" in verdicts:
        return "failing"
    if "unknown" in verdicts:
        return "inconclusive"
    if "passed" in verdicts:
        return "verified"
    return "not_run"


# --------------------------------------------------------------------------
# The builder
# --------------------------------------------------------------------------


@traces(SWR.SWR_2606)
def has_requirement_store(repo_root: Path, layout: RepoLayout | None = None) -> bool:
    """Whether *repo_root* has a ReqToCode requirement store to read at all.

    One ``is_dir()`` call, so a caller can rule out the whole computation before
    paying for a worker thread. A workspace that has not adopted ReqToCode is the
    common case for which the answer is always ``None``, and reaching that answer
    should not cost a thread hand-off per iteration.
    """
    try:
        from rotaris_core.reqtocode.layout import DEFAULT_LAYOUT

        effective = layout if layout is not None else DEFAULT_LAYOUT
        return (repo_root / effective.requirements_dir).is_dir()
    except Exception:  # noqa: BLE001 - a broken layout is "no store", not a crash.
        _log.debug("Could not probe for a requirement store", exc_info=True)
        return False


@traces(SWR.SWR_2606, SWR.SWR_2607)
def build_iteration_evidence(
    repo_root: Path,
    changed_files: Sequence[str],
    checks: Sequence[CheckResult] = (),
    *,
    layout: RepoLayout | None = None,
    conventions: ConventionRegistry | None = None,
) -> IterationEvidence | None:
    """Requirement coverage and scope drift for one iteration, or ``None``.

    ``None`` means *not computed*: the workspace has no requirement store, or the
    index could not be read. That is deliberately distinct from an
    :class:`IterationEvidence` whose lists are empty, which means the sweep ran
    and found nothing.

    Performs exactly one requirement parse and one repository sweep, shared by
    both answers. Callers must not invoke it for an iteration that changed
    nothing — there is no answer to compute and the sweep is not free.
    """
    if not changed_files:
        return None

    started = time.monotonic()
    try:
        from rotaris_core.reqtocode.generator import parse_requirements
        from rotaris_core.reqtocode.layout import DEFAULT_LAYOUT
        from rotaris_core.reqtocode.verifier import sweep_references

        effective_layout = layout if layout is not None else DEFAULT_LAYOUT
        if not has_requirement_store(repo_root, effective_layout):
            # No requirement store: this workspace has not adopted ReqToCode, and
            # saying "nothing was touched" would be a claim we cannot support.
            # Re-checked here, not only at the caller, so the invariant holds for
            # every entry point rather than only the loop's.
            return None

        parsed = parse_requirements(repo_root, effective_layout)
        sweep = sweep_references(repo_root, parsed.legacy_aliases, effective_layout, conventions)
    except Exception:  # noqa: BLE001 - evidence must never abort an iteration.
        _log.warning("Requirement-coverage evidence could not be computed", exc_info=True)
        return None

    try:
        changed = sorted(set(changed_files))
        requirements = _requirements_for(
            sweep=sweep,
            parsed=parsed,
            changed=changed,
            checks=checks,
        )
        drift = build_scope_drift(
            repo_root,
            changed,
            sweep=sweep,
            parsed=parsed,
            layout=effective_layout,
            conventions=conventions,
        )
    except Exception:  # noqa: BLE001 - see above.
        _log.warning("Requirement-coverage evidence could not be projected", exc_info=True)
        return None

    return IterationEvidence(
        requirements=requirements.model_copy(
            update={"duration_s": round(time.monotonic() - started, 4)},
        ),
        scope_drift=drift,
    )


def _requirements_for(
    *,
    sweep: object,
    parsed: object,
    changed: list[str],
    checks: Sequence[CheckResult],
) -> RequirementEvidence:
    from rotaris_core.reqtocode.coverage import coverage_from_sweep

    changed_set = set(changed)
    impl_traces: dict[int, list[object]] = getattr(sweep, "impl_traces", {}) or {}
    touched_numbers = sorted(
        number
        for number, occurrences in impl_traces.items()
        if any(getattr(occ, "file", None) in changed_set for occ in occurrences)
    )

    meta_by_number = _meta_index(parsed)
    runners = executed_test_runners(checks)

    requirements: list[TouchedRequirement] = []
    for number in touched_numbers:
        coverage = coverage_from_sweep(sweep, number)  # type: ignore[arg-type]
        covering: list[CoveringTest] = []
        for site in coverage.tests:
            executed = execution_for(site.path, runners)
            covering.append(
                CoveringTest(
                    path=site.path,
                    line=site.line,
                    executed=executed is not None,
                    check_name=executed.name if executed is not None else None,
                    check_status=str(executed.status) if executed is not None else None,
                    verdict=verdict_for(executed, test_path=site.path, line=site.line),
                ),
            )
        meta = meta_by_number.get(number)
        requirements.append(
            TouchedRequirement(
                req_id=getattr(meta, "req_id", None) or f"SWR-{number}",
                number=number,
                status=_status_of(meta),
                title=getattr(meta, "title", "") or "",
                source_path=getattr(meta, "source_path", None),
                implementations=[
                    RequirementSite(path=site.path, line=site.line)
                    for site in coverage.implementations
                    if site.path in changed_set
                ],
                covering_tests=covering,
                coverage_state=_state_for(covering),
            ),
        )

    return RequirementEvidence(
        changed_files=changed,
        requirements=requirements,
        uncovered_requirements=[r.req_id for r in requirements if r.coverage_state == "uncovered"],
        unrun_requirements=[r.req_id for r in requirements if r.coverage_state == "not_run"],
        failing_requirements=[r.req_id for r in requirements if r.coverage_state == "failing"],
        inconclusive_requirements=[
            r.req_id for r in requirements if r.coverage_state == "inconclusive"
        ],
    )


def _meta_index(parsed: object) -> dict[int, ReqMeta]:
    """Requirement metadata from the workspace's own store, keyed by number.

    Deliberately *only* the parsed store, never the generated ``swr.META``: META
    describes whichever repository the runner was built from, so falling back to
    it would give a foreign workspace's stale reference a Rotaris title. A number
    the store no longer declares is reported as ``unknown`` instead — the honest
    answer, and itself a signal worth seeing.
    """
    index: dict[int, ReqMeta] = {}
    for meta in getattr(parsed, "requirements", []) or []:
        number = getattr(meta, "number", None)
        if isinstance(number, int):
            index[number] = meta
    return index


def _status_of(meta: ReqMeta | None) -> str:
    status = getattr(meta, "status", None)
    if status is None:
        return "unknown"
    return str(getattr(status, "value", status))
