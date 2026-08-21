"""Best-effort check-suite detection from workspace markers (SWR-2601).

Pure filesystem probing: no config import, no execution. Each detector returns
:class:`~rotaris_core.verifier.suite.ResolvedCheck` entries tagged with the marker
they came from, so the resolved suite can always be audited for *why* a check is
in it.

Severity policy: the checks that establish correctness (tests, typecheck) are
``blocking``; style checks (lint, format) are ``advisory`` so a formatting nit
never blocks completion.
"""

from __future__ import annotations

import json
import re
import tomllib
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.verifier.suite import CheckRole, ResolvedCheck

if TYPE_CHECKING:
    from pathlib import Path

_Severity = Literal["blocking", "advisory"]

#: Make targets we know how to interpret, mapped to their severity. The target
#: name is also the role it fills, which is what lets SWR-2608 recognize
#: ``make test`` as the same work a detected ``pytest`` already covers.
_MAKE_TARGETS: dict[CheckRole, _Severity] = {
    "test": "blocking",
    "typecheck": "blocking",
    "lint": "advisory",
}

#: ``package.json`` scripts we know how to interpret, mapped to their severity.
#: ``build`` is deliberately absent — too slow to gate an iteration on.
_NPM_SCRIPTS: dict[CheckRole, _Severity] = {
    "test": "blocking",
    "typecheck": "blocking",
    "lint": "advisory",
}


@traces(SWR.SWR_2608)
@dataclass(frozen=True, slots=True)
class DetectionResult:
    """What detection found: the suite to run, and every marker that fired.

    The two lists differ on purpose. ``checks`` is deduplicated by role so a
    workspace never verifies the same thing twice, while ``detections`` keeps
    every recognized marker — including the ones whose check was suppressed —
    so ``state/run_config.json`` still records what the workspace declares.
    """

    checks: list[ResolvedCheck] = field(default_factory=list)
    detections: list[str] = field(default_factory=list)


#: A Makefile target definition at the start of a line, e.g. ``test:`` or
#: ``test: deps``. Excludes pattern rules (``%.o:``) and variable assignments.
_MAKE_TARGET_RE = re.compile(r"^([A-Za-z0-9_.-]+)\s*:(?!=)", re.MULTILINE)


@traces(SWR.SWR_2601, SWR.SWR_2608)
def detect_check_suite(workspace_root: Path) -> DetectionResult:
    """Return a best-effort check suite for *workspace_root*, plus its markers.

    Never raises: an unreadable or malformed marker file contributes nothing.
    An empty result means "no marker recognized", which the caller must report
    as a detection outcome rather than as an explicit "no verification".

    Detector order is python → node → make, and it now decides only between two
    *equally-sourced* candidates: which command wins a role is
    :func:`_rank_by_role`'s question, and it answers it by how specifically the
    scope was declared rather than by which detector ran first (SWR-2620).
    """
    from rotaris_core.verifier.gate_state import subproject_roots  # noqa: PLC0415

    found: list[ResolvedCheck] = []
    for where in ("", *subproject_roots(workspace_root)):
        base = workspace_root / where if where else workspace_root
        found.extend(_detect_python(base, where, workspace_root))
        found.extend(_detect_node(base, where))
        found.extend(_detect_make(base, where))
    return DetectionResult(
        checks=_rank_by_role(found),
        detections=[check.detected_from for check in found if check.detected_from],
    )


@traces(SWR.SWR_2601)
def detect_checks(workspace_root: Path) -> list[ResolvedCheck]:
    """Return only the checks :func:`detect_check_suite` resolved."""
    return detect_check_suite(workspace_root).checks


@traces(SWR.SWR_2618)
def _named(name: str, where: str) -> str:
    """A check name that says which tree it verifies.

    A workspace with two ``pytest`` checks needs them told apart everywhere a
    name travels — evidence, repair context, timeline events, the probe cache —
    and the directory is the only thing that distinguishes them.
    """
    return f"{name}:{where}" if where else name


@traces(SWR.SWR_2618)
def _from(marker: str, where: str) -> str:
    """The marker this check came from, located in the workspace."""
    return f"{where}/{marker}" if where else marker


@traces(SWR.SWR_2601, SWR.SWR_2618)
def _detect_python(
    root: Path, where: str = "", workspace_root: Path | None = None
) -> list[ResolvedCheck]:
    pyproject = root / "pyproject.toml"
    if not pyproject.is_file():
        return []
    tables = _read_pyproject_tools(pyproject)
    # A uv workspace keeps one lockfile at its root and none in the members, so a
    # sub-project's commands still need the ``uv run`` prefix that resolves them.
    outer = workspace_root if workspace_root is not None else root
    prefix = "uv run " if (root / "uv.lock").is_file() or (outer / "uv.lock").is_file() else ""
    cwd = where or None
    checks: list[ResolvedCheck] = []

    if "pytest" in tables or "pytest.ini_options" in tables or (root / "tests").is_dir():
        paths = _stated_scope(pyproject, "pytest", ("testpaths",), sub="ini_options")
        scope_suffix = f" {paths}" if paths else ""
        checks.append(
            ResolvedCheck(
                name=_named("pytest", where),
                command=f"{prefix}pytest -q{scope_suffix}",
                severity="blocking",
                detected_from=_from("pyproject.toml:pytest", where),
                role="test",
                cwd=cwd,
            ),
        )
    if "mypy" in tables or (root / "mypy.ini").is_file():
        # ``mypy .`` walks everything: examples, scratch trees, fixtures a project
        # deliberately never type-checks. Where the configuration states a scope,
        # that scope is the project's own answer and this uses it (SWR-2620).
        scope = _stated_scope(pyproject, "mypy", ("files", "packages", "modules")) or "."
        checks.append(
            ResolvedCheck(
                name=_named("mypy", where),
                command=f"{prefix}mypy {scope}",
                severity="blocking",
                detected_from=_from("pyproject.toml:mypy", where),
                role="typecheck",
                cwd=cwd,
            ),
        )
    if "ruff" in tables or (root / "ruff.toml").is_file():
        checks.append(
            ResolvedCheck(
                name=_named("ruff", where),
                command=f"{prefix}ruff check .",
                severity="advisory",
                detected_from=_from("pyproject.toml:ruff", where),
                role="lint",
                cwd=cwd,
            ),
        )
    return checks


@traces(SWR.SWR_2620)
def _stated_scope(
    pyproject: Path,
    tool: str,
    keys: tuple[str, ...],
    *,
    sub: str = "",
) -> str:
    """The paths *tool* says it applies to, or ``""`` when it says nothing.

    A synthesized command is only ever a guess about scope, and this is the one
    place the project can correct it without writing a ``verifier.checks`` entry.
    Absent configuration returns ``""`` and the caller keeps its default — an
    invented narrow scope would be worse than an honest wide one.
    """
    try:
        with pyproject.open("rb") as handle:
            data = tomllib.load(handle)
    except (OSError, tomllib.TOMLDecodeError):
        return ""
    table = data.get("tool")
    if not isinstance(table, dict):
        return ""
    block = table.get(tool)
    if sub and isinstance(block, dict):
        block = block.get(sub)
    if not isinstance(block, dict):
        return ""
    for key in keys:
        value = block.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, list):
            paths = [str(item).strip() for item in value if str(item).strip()]
            if paths:
                return " ".join(paths)
    return ""


def _read_pyproject_tools(pyproject: Path) -> set[str]:
    """Return the ``[tool.*]`` table names declared in *pyproject*.

    ``[tool.pytest.ini_options]`` also yields the dotted name so the caller can
    distinguish a real pytest configuration from a bare ``[tool.pytest]``.
    """
    try:
        with pyproject.open("rb") as handle:
            data = tomllib.load(handle)
    except (OSError, tomllib.TOMLDecodeError):
        return set()
    tool = data.get("tool")
    if not isinstance(tool, dict):
        return set()
    names: set[str] = set()
    for name, table in tool.items():
        names.add(name)
        if isinstance(table, dict):
            names.update(f"{name}.{sub}" for sub in table)
    return names


@traces(SWR.SWR_2601, SWR.SWR_2618)
def _detect_node(root: Path, where: str = "") -> list[ResolvedCheck]:
    package_json = root / "package.json"
    if not package_json.is_file():
        return []
    try:
        data = json.loads(package_json.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    scripts = data.get("scripts") if isinstance(data, dict) else None
    if not isinstance(scripts, dict):
        return []
    return [
        ResolvedCheck(
            name=_named(f"npm:{script}", where),
            command="npm test" if script == "test" else f"npm run {script}",
            severity=severity,
            detected_from=_from(f"package.json:{script}", where),
            role=script,
            cwd=where or None,
            # The project wrote this script down; whatever it expands to is what
            # this project means by "test" (SWR-2620).
            origin="declared",
        )
        for script, severity in _NPM_SCRIPTS.items()
        if isinstance(scripts.get(script), str) and scripts[script].strip()
    ]


@traces(SWR.SWR_2601, SWR.SWR_2618)
def _detect_make(root: Path, where: str = "") -> list[ResolvedCheck]:
    makefile = root / "Makefile"
    if not makefile.is_file():
        return []
    try:
        text = makefile.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    targets = set(_MAKE_TARGET_RE.findall(text))
    return [
        ResolvedCheck(
            name=_named(f"make:{target}", where),
            command=f"make {target}",
            severity=severity,
            detected_from=_from(f"Makefile:{target}", where),
            role=target,
            cwd=where or None,
            # A target the project wrote: it carries the scope, flags, excludes
            # and parallelism no synthesized invocation can infer (SWR-2620).
            origin="declared",
        )
        for target, severity in _MAKE_TARGETS.items()
        if target in targets
    ]


#: How much a command's origin is trusted to describe this project's real scope.
#: Lower wins. See :data:`~rotaris_core.verifier.suite.CheckOrigin`.
_ORIGIN_RANK: dict[str, int] = {"config": 0, "declared": 1, "synthesized": 2}


@traces(SWR.SWR_2608, SWR.SWR_2620)
def _rank_by_role(checks: list[ResolvedCheck]) -> list[ResolvedCheck]:
    """One check per role — the best-sourced one — carrying the rest as fallbacks.

    **The project's own command wins.** Detector order used to decide this, with
    ``make`` deliberately last, and the result was that a repository stating
    ``uv run pytest -q --timeout=120 -n auto`` and ``mypy src/`` in its Makefile
    was verified with a synthesized serial ``pytest -q`` and a whole-tree
    ``mypy .`` instead. The serial run outgrew its budget and was killed; the
    whole-tree type-check failed on files the project never type-checks. Neither
    command was wrong about its tool and both were wrong about the project, and
    only the project can settle that — which it did, in a file, in its own words.

    The reason ``make`` came last was sound and is preserved differently: a
    project-level target is not guaranteed to be runnable on this host. So the
    losing candidates are kept as :attr:`ResolvedCheck.alternatives`, and the
    runner drops to the next one when the chosen command cannot *start*
    (SWR-2620) — as opposed to when it runs and fails, which is a real answer and
    must never be retried away.

    ``other`` carries no shared meaning, so those checks keep the name dedupe:
    two unrelated ``other`` checks must both survive.

    **Deduplication is per directory** (SWR-2618). A root ``pyproject.toml`` and
    an ``apps/x/pyproject.toml`` describe two different projects that happen to
    fill the same role, and collapsing them would leave one of them unverified;
    a root ``Makefile`` duplicating the root's own detected test check is still
    the same work twice and is still suppressed.
    """
    by_role: dict[tuple[str, str], list[ResolvedCheck]] = {}
    seen_names: set[tuple[str, str]] = set()
    roleless: list[ResolvedCheck] = []
    for check in checks:
        where = check.cwd or ""
        if check.role == "other":
            if (where, check.name) not in seen_names:
                seen_names.add((where, check.name))
                roleless.append(check)
            continue
        by_role.setdefault((where, check.role), []).append(check)

    ranked: list[ResolvedCheck] = []
    for candidates in by_role.values():
        # Stable within an origin: the detector order still decides between two
        # equally-sourced commands, which is the part of it that was never wrong.
        ordered = sorted(candidates, key=lambda one: _ORIGIN_RANK.get(one.origin, 99))
        best, rest = ordered[0], tuple(ordered[1:])
        ranked.append(best.model_copy(update={"alternatives": rest}) if rest else best)
    return [*ranked, *roleless]
