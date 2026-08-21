"""The gate a workspace is verified by, as a tracked fact (SWR-2612).

Until now the check suite was re-inferred from filesystem markers on every
session (SWR-2601). That re-inference remembers nothing, so two very different
workspaces produce the same answer: one that has no gate *yet* — its techstack is
what the first run will create — and one that was looked at and needs none. Both
resolved to an exempt suite, and an exempt suite reads as a clean run.

This module gives the gate an explicit lifecycle instead:

``absent``
    No recognized marker and no source a gate could cover.
``pending``
    The workspace carries code but no gate: nothing is configured and detection
    resolved nothing, or authoring has not completed (SWR-2615).
``calibrated``
    A suite is bound and every check in it carries a probe verdict (SWR-2613)
    taken at the current fingerprint.
``stale``
    A suite is bound but is **not** calibrated at this fingerprint.

``stale`` deliberately covers two situations that look different and are the
same instruction: the fingerprint moved, and the suite was never probed here.
Both mean *probe before trusting this*, which is why no fifth state is needed and
why an explicitly configured ``verifier.checks`` is never ``pending`` — a stated
suite is bound the moment it is stated, it merely has not been checked yet.

**One gate, one home.** The gate itself stays in ``verifier.checks`` in
``<workspace>/.rotaris/agents.yaml``, where a human edits it. What lives here is
metadata *about* it, in a rotaris-managed
``<workspace>/.rotaris/verifier.state.json`` that is never hand-authored and
never holds the suite.

**Nothing here executes anything.** Resolution is filesystem reads, and a
missing, unreadable or malformed state file is treated as "not yet known" and
recomputed rather than raised — which is what makes deleting the file a
supported reset.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import logging
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, ConfigDict, Field

from rotaris_core.fs import atomic_write
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.verifier.test_results import PRUNED_DIRS

if TYPE_CHECKING:
    from collections.abc import Iterable
    from pathlib import Path

    from rotaris_core.verifier.suite import ResolvedCheck, ResolvedCheckSuite

_log = logging.getLogger(__name__)

__all__ = [
    "GATE_STATE_FILENAME",
    "MARKER_FILES",
    "SUBPROJECT_DEPTH",
    "TEST_ROOTS",
    "GateRecord",
    "GateState",
    "ProbeRecord",
    "ProbeVerdict",
    "SuiteOrigin",
    "gate_state_path",
    "load_gate_record",
    "marker_files",
    "refresh_gate_state",
    "resolve_gate_state",
    "save_gate_record",
    "subproject_roots",
    "unprobed_checks",
    "workspace_fingerprint",
]

GateState = Literal["absent", "pending", "calibrated", "stale"]

#: What a cheap probe concluded about one command (SWR-2613). Recorded here
#: because the verdict is a fact about a *fingerprint*, not a permanent judgement:
#: a check demoted for collecting nothing is promoted back by a later probe that
#: finds work, and that only works if the verdict expires with the fingerprint.
ProbeVerdict = Literal["verified", "empty", "unavailable", "undecidable"]

#: Where the bound suite came from. ``authored`` is distinguishable from
#: ``config`` only here: an authored gate is written into ``verifier.checks``
#: (SWR-2614) and resolves as configuration from then on, so without this record
#: "Rotaris wrote your gate" and "you wrote your gate" would read identically.
SuiteOrigin = Literal["config", "detected", "authored"]

GATE_STATE_FILENAME = "verifier.state.json"

#: Files whose presence *and content* contribute to the fingerprint. Manifests,
#: lockfiles, tool configuration and task runners — everything a detector reads,
#: plus the lockfiles that change what those manifests resolve to. An added
#: marker, a removed marker and an edited marker all move the fingerprint, which
#: is the whole point: the gate is only as current as the markers it was built
#: from.
MARKER_FILES: tuple[str, ...] = (
    ".ruff.toml",
    "Cargo.lock",
    "Cargo.toml",
    "Justfile",
    "Makefile",
    "Taskfile.yaml",
    "Taskfile.yml",
    "go.mod",
    "go.sum",
    "justfile",
    "mypy.ini",
    "noxfile.py",
    "package-lock.json",
    "package.json",
    "pnpm-lock.yaml",
    "poetry.lock",
    "pyproject.toml",
    "pytest.ini",
    "ruff.toml",
    "setup.cfg",
    "setup.py",
    "tox.ini",
    "tsconfig.json",
    "uv.lock",
    "yarn.lock",
)

#: Directories whose *presence* marks a workspace as holding tests a gate could
#: cover. Content is deliberately not read: a fingerprint that moved every time
#: somebody edited a test would re-probe the whole suite on every iteration.
TEST_ROOTS: tuple[str, ...] = ("tests", "test", "spec", "__tests__")

#: How far below the workspace root a sub-project manifest is looked for.
#: ``apps/rotaris/pyproject.toml`` and ``packages/x/package.json`` are depth 2;
#: three leaves room for one more nesting level without becoming a tree walk.
SUBPROJECT_DEPTH = 3

#: Manifests that make a directory a sub-project in its own right. Narrower than
#: :data:`MARKER_FILES` on purpose — a stray ``Makefile`` three levels down is not
#: a project, and treating it as one would put its whole subtree in the
#: fingerprint.
_SUBPROJECT_MANIFESTS: frozenset[str] = frozenset(
    {"pyproject.toml", "package.json", "go.mod", "Cargo.toml"},
)

#: Bound on how many marker files are hashed. A pathological monorepo must not be
#: able to turn a session start into a full-tree read; past this the fingerprint
#: is still stable and still moves, it simply stops growing.
_MAX_MARKERS = 200

#: Bound on how much of one marker is read. Lockfiles run to megabytes and their
#: opening is where the resolved versions change.
_MAX_MARKER_BYTES = 256_000


@traces(SWR.SWR_2612, SWR.SWR_2613)
class ProbeRecord(BaseModel):
    """What a probe concluded about one check, and when (SWR-2613)."""

    model_config = ConfigDict(frozen=True)

    check: str
    command: str
    verdict: ProbeVerdict
    #: The severity detection gave this check, *before* a verdict demoted it.
    #: Kept so the demotion is reversible: SWR-2613 promotes an ``empty`` check
    #: back to its detected severity on a later probe that finds work, and a
    #: record that overwrote the original severity could never do that.
    detected_severity: Literal["blocking", "advisory"] = "blocking"
    taken_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.UTC))
    note: str = ""


@traces(SWR.SWR_2612)
class GateRecord(BaseModel):
    """The lifecycle metadata of one workspace's gate.

    Advisory data *about* the gate, never the gate. Nothing reads a check out of
    here, and nothing writes one in.
    """

    model_config = ConfigDict(frozen=True)

    state: GateState = "absent"
    #: Content hash of the recognized markers. ``""`` means no marker at all,
    #: which is the same thing as ``absent`` and is what SWR-2615's techstack
    #: event watches for.
    fingerprint: str = ""
    suite_origin: SuiteOrigin | None = None
    probes: tuple[ProbeRecord, ...] = ()
    #: Run that last wrote this record, for correlating with the timeline.
    run_id: str = ""
    #: Why authoring produced nothing bindable (SWR-2615), so the next attempt
    #: waits for a fingerprint change instead of retrying every iteration.
    authoring_note: str = ""
    written_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.UTC))

    def probe_for(self, name: str, command: str) -> ProbeRecord | None:
        """The verdict recorded for exactly this check *and* this command.

        Both, because SWR-2613 re-probes when a check's command changes: a
        verdict about ``make test`` says nothing about the ``uv run pytest`` that
        replaced it under the same name.
        """
        return next(
            (probe for probe in self.probes if probe.check == name and probe.command == command),
            None,
        )

    def same_facts_as(self, other: GateRecord) -> bool:
        """Whether two records say the same thing, ignoring when they said it.

        What :func:`refresh_gate_state` uses to avoid rewriting an unchanged file
        on every session start.
        """
        mine = self.model_dump(mode="json", exclude={"written_at"})
        theirs = other.model_dump(mode="json", exclude={"written_at"})
        return mine == theirs


# ---------------------------------------------------------------------------
# The fingerprint
# ---------------------------------------------------------------------------


def _readable_dirs(directory: Path) -> Iterable[Path]:
    """Sub-directories of *directory* worth descending into, in a stable order."""
    try:
        entries = sorted(directory.iterdir(), key=lambda item: item.name)
    except OSError:
        return
    for entry in entries:
        if entry.name in PRUNED_DIRS or entry.name.startswith("."):
            continue
        try:
            if entry.is_dir():
                yield entry
        except OSError:
            continue


@traces(SWR.SWR_2612, SWR.SWR_2618)
def subproject_roots(root: Path, *, depth: int = SUBPROJECT_DEPTH) -> tuple[str, ...]:
    """Workspace-relative directories below *root* that carry their own manifest.

    Bounded and pruned rather than an ``rglob``: this runs at session start and
    after marker-touching iterations, and an unbounded walk of somebody's home
    directory is the difference between a feature and an outage. Build output,
    virtualenvs, version control and nested worktrees are never descended into.
    """
    found: list[str] = []

    def walk(directory: Path, remaining: int) -> None:
        if remaining <= 0:
            return
        for entry in _readable_dirs(directory):
            if any((entry / manifest).is_file() for manifest in _SUBPROJECT_MANIFESTS):
                found.append(entry.relative_to(root).as_posix())
            walk(entry, remaining - 1)

    try:
        walk(root, depth)
    except OSError:
        _log.debug("Sub-project scan of %s stopped early", root, exc_info=True)
    return tuple(sorted(found))


@traces(SWR.SWR_2612)
def marker_files(root: Path) -> tuple[str, ...]:
    """Recognized markers at *root* and at each sub-project root, workspace-relative."""
    directories = ["", *subproject_roots(root)]
    found: list[str] = []
    for directory in directories:
        base = root / directory if directory else root
        for name in MARKER_FILES:
            candidate = base / name
            try:
                if candidate.is_file():
                    found.append(candidate.relative_to(root).as_posix())
            except OSError:
                continue
    return tuple(sorted(found)[:_MAX_MARKERS])


def _digest_of(path: Path) -> str:
    """A bounded content digest, or a sentinel for a marker that would not read.

    An unreadable marker still contributes — its *presence* is a fact — and it
    contributes stably, so a permissions problem does not make the fingerprint
    flap between two values.
    """
    try:
        with path.open("rb") as handle:
            return hashlib.sha256(handle.read(_MAX_MARKER_BYTES)).hexdigest()
    except OSError:
        return "unreadable"


@traces(SWR.SWR_2612)
def workspace_fingerprint(root: Path) -> str:
    """A content hash of everything a detector would read from *root*.

    Both the file set and each file's content contribute, so an added marker, a
    removed marker and an edited marker all move it, while an ordinary source
    edit does not. The conventional test roots contribute by *presence* only:
    hashing their contents would move the fingerprint on every test edit and
    re-probe the whole suite on every iteration.

    ``""`` for a workspace with no marker and no test root — the ``absent`` case,
    and the thing SWR-2615's techstack event watches a workspace leave.
    """
    markers = marker_files(root)
    roots = tuple(directory for directory in TEST_ROOTS if (root / directory).is_dir())
    if not markers and not roots:
        return ""
    digest = hashlib.sha256()
    for relative in markers:
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(_digest_of(root / relative).encode("ascii"))
        digest.update(b"\n")
    for directory in roots:
        digest.update(b"root:")
        digest.update(directory.encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


@traces(SWR.SWR_2612)
def gate_state_path(workspace_root: Path) -> Path:
    """Where the lifecycle metadata lives. Never the gate itself."""
    return workspace_root / ".rotaris" / GATE_STATE_FILENAME


@traces(SWR.SWR_2612)
def load_gate_record(workspace_root: Path) -> GateRecord | None:
    """The recorded state, or ``None`` when there is none to be had.

    ``None`` covers absent, unreadable and malformed alike, because all three
    mean the same thing to every caller: recompute. Deleting the file is
    therefore a supported reset, and a half-written one cannot wedge a session.
    """
    path = gate_state_path(workspace_root)
    try:
        payload = path.read_text(encoding="utf-8")
    except OSError:
        return None
    try:
        return GateRecord.model_validate_json(payload)
    except ValueError:
        _log.warning("Ignoring unreadable gate state at %s; recomputing.", path)
        return None


@traces(SWR.SWR_2612)
def save_gate_record(workspace_root: Path, record: GateRecord) -> bool:
    """Persist *record* atomically. Reports whether it landed; never raises.

    A workspace Rotaris cannot write to keeps working — it simply re-derives the
    state each session, which costs a fingerprint and a probe pass and is a far
    better outcome than a run that will not start.
    """
    path = gate_state_path(workspace_root)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write(path, record.model_dump_json(indent=2) + "\n")
    except OSError as error:
        _log.warning("Could not write gate state to %s: %s", path, error)
        return False
    return True


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------


@traces(SWR.SWR_2612, SWR.SWR_2613)
def unprobed_checks(
    suite: ResolvedCheckSuite,
    record: GateRecord | None,
    fingerprint: str,
) -> tuple[ResolvedCheck, ...]:
    """The checks in *suite* with no probe verdict at *fingerprint*.

    The question SWR-2613 asks before it spends anything: a ``calibrated`` gate
    answers with an empty tuple and re-probes nothing.
    """
    if record is None or record.fingerprint != fingerprint:
        return tuple(suite.checks)
    return tuple(
        check for check in suite.checks if record.probe_for(check.name, check.command) is None
    )


def _origin_for(suite: ResolvedCheckSuite, record: GateRecord | None) -> SuiteOrigin:
    """Where this suite came from, preserving an authored gate's provenance.

    A gate the gatekeeper wrote lands in ``verifier.checks`` and from then on
    resolves as configuration like any other. Only the record remembers that
    Rotaris wrote it, and a user deserves to be told which of the two they are
    looking at — so ``authored`` survives as long as the commands do.
    """
    if suite.source not in {"config", "explicit_empty"}:
        return "detected"
    if record is None or record.suite_origin != "authored":
        return "config"
    recorded = {probe.command for probe in record.probes}
    if recorded and all(check.command in recorded for check in suite.checks):
        return "authored"
    return "config"


@traces(SWR.SWR_2612)
def resolve_gate_state(
    suite: ResolvedCheckSuite,
    workspace_root: Path,
    *,
    record: GateRecord | None = None,
    fingerprint: str | None = None,
    run_id: str = "",
) -> GateRecord:
    """The gate's state right now, as a record. Reads files; executes nothing.

    Takes the already-resolved suite rather than resolving one, so this module
    never imports :mod:`rotaris_core.verifier.suite` — the dependency runs the
    other way, since ``ResolvedCheckSuite`` carries a :class:`GateRecord`.

    Never raises. A workspace that cannot be read resolves ``absent``, which is
    the honest answer and never blocks a session.
    """
    try:
        current = workspace_fingerprint(workspace_root) if fingerprint is None else fingerprint
    except Exception:  # noqa: BLE001 - a fingerprint must never stop a session
        _log.warning("Could not fingerprint %s; treating the gate as absent.", workspace_root)
        current = ""

    at_fingerprint = record is not None and record.fingerprint == current
    carried = record.probes if at_fingerprint and record is not None else ()
    note = record.authoring_note if at_fingerprint and record is not None else ""

    if suite.source == "explicit_empty":
        # The user stated that this workspace runs no verification. That is a
        # decision, not a gap, and it is never re-litigated (SWR-2601).
        return GateRecord(
            state="calibrated",
            fingerprint=current,
            suite_origin="config",
            run_id=run_id,
        )

    if not suite.checks:
        return GateRecord(
            state="absent" if not current else "pending",
            fingerprint=current,
            suite_origin=None,
            run_id=run_id,
            authoring_note=note,
        )

    calibrated = not unprobed_checks(suite, record, current)
    return GateRecord(
        state="calibrated" if calibrated else "stale",
        fingerprint=current,
        suite_origin=_origin_for(suite, record),
        probes=carried,
        run_id=run_id,
        authoring_note=note,
    )


@traces(SWR.SWR_2612)
def refresh_gate_state(
    suite: ResolvedCheckSuite,
    workspace_root: Path,
    *,
    run_id: str = "",
) -> GateRecord:
    """Load, recompute, persist if anything moved, and return the record.

    The call a session start and a marker-touching iteration make. Writing only
    on a real change keeps an unchanged workspace from rewriting the same file
    every time it is opened.
    """
    previous = load_gate_record(workspace_root)
    resolved = resolve_gate_state(
        suite,
        workspace_root,
        record=previous,
        run_id=run_id,
    )
    if previous is None or not previous.same_facts_as(resolved):
        save_gate_record(workspace_root, resolved)
    return resolved
