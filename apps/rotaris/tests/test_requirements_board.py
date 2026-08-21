"""The requirements area: its seam to the engine, its state, and its one wire.

Every test here works against the *real* board projection (SWR-3216) — crafted
from real requirements and real delivery records, or read off a synthetic
requirement store on disk. Nothing stubs the engine's answers, because the whole
point of SWR-3311 is that the desktop has no second source for them.
"""

from __future__ import annotations

import ast
import datetime as dt
import re
import subprocess
import threading
import time
from dataclasses import replace
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pytest
from fakes import FakeRequirementsBridge
from PySide6.QtCore import QEvent, QPointF, QSettings, QSize, Qt, Signal
from PySide6.QtGui import QEnterEvent, QFont, QFontMetrics
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication, QLabel, QPushButton, QToolButton, QWidget
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change_host import EvaluationDepth
from rotaris_core.requirements.delivery.audit import AuditEvent, AuditEventKind, AuditStore
from rotaris_core.requirements.delivery.evidence import EvidenceInputs
from rotaris_core.requirements.delivery.history import RecordedHash, build_revision_history
from rotaris_core.requirements.delivery.projection import (
    BlockerKind,
    BlockerView,
    BoardAxis,
    BoardInputs,
    ExecutionSummary,
    ExecutionUnitView,
    RequirementPriority,
    RunOutcome,
    RunView,
    project_board,
)
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery, SatisfiedLog
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    DeliveryStatus,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryIndex, DeliveryRecord, DeliveryStore
from rotaris_core.requirements.execution.target import no_commit_refusal
from rotaris_core.requirements.model import (
    CanonicalRequirement,
    Relation,
    RelationKind,
    RequirementLifecycle,
)
from rotaris_core.requirements.registry import RequirementIndex
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite
from ui_query import accessible_names, click_by_name, find_by_accessible_name, settle

from rotaris import theme
from rotaris.models.requirements_state import (
    DEFAULT_BOARD_AXIS,
    DETAIL_SECTIONS,
    PENDING_HISTORY_REASON,
    RequirementCard,
    RequirementFact,
    RequirementsBoardState,
    board_groupings,
    build_board_state,
    build_card,
    build_detail,
    describe_age,
    describe_moment,
    grouping_for,
)
from rotaris.models.state import NoticeSeverity
from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.git_service import GIT_SETUP_ACTION, GitService
from rotaris.services.requirements_bridge import (
    NO_SOURCE_REASON,
    BoardEvaluation,
    BoardSource,
    RequirementsBridge,
    RequirementsUnavailableError,
    WorkspaceBoard,
    diff_board,
)
from rotaris.services.requirements_controller import (
    ANALYSE_OFF_TOOLTIP,
    ANALYSE_TOOLTIP,
    NO_COMMIT_NOTICE,
    STOP_ANALYSING,
    STOP_ANALYSING_TOOLTIP,
    RequirementsController,
)
from rotaris.theme import raise_to_readable, tokens
from rotaris.views.chrome import NAV_ITEMS
from rotaris.views.main_window import MainWindow
from rotaris.views.requirements import (
    COLUMN_HINTS,
    COLUMN_ORDER,
    OPEN_COLUMN_MAX_WIDTH,
    OPEN_COLUMN_MIN_WIDTH,
    OVERSCAN,
    REEVALUATE_TOOLTIP,
    SEARCH_DEBOUNCE_MS,
    BoardColumnModel,
    BoardFilter,
    ColumnFolds,
    RequirementsView,
    board_columns,
    card_axis_value,
    load_board_preferences,
    load_column_folds,
    pipeline_unused,
    save_column_folds,
    sort_cards,
    visible_cards,
)
from rotaris.widgets.evidence_ring import EvidenceRing
from rotaris.widgets.feedback import EmptyState, InlineBanner
from rotaris.widgets.hold_reason import HOLD_REASON_REQUIRED
from rotaris.widgets.requirement_card import EpicCard, RequirementCardWidget

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Mapping

    from rotaris_core.requirements.delivery.projection import BoardProjection

pytestmark = pytest.mark.integration

WHEN = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
NOW = dt.datetime(2026, 8, 14, 12, 0, tzinfo=dt.UTC)

SRC_ROOT = Path(__file__).resolve().parents[1] / "src" / "rotaris"
MAIN_WINDOW = SRC_ROOT / "views" / "main_window.py"


# ── crafting a projection ──────────────────────────────────────────────────


def _requirement(
    req_id: str,
    title: str = "",
    *,
    parent: str | None = None,
    depends_on: tuple[str, ...] = (),
    lifecycle: RequirementLifecycle = RequirementLifecycle.APPROVED,
) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title=title or f"{req_id} title",
        description=f"{req_id} says what the product does.",
        lifecycle=lifecycle,
        source_id="reqtocode",
        source_path=f"docs/requirements/{req_id}.md",
        parent=parent,
        relations=tuple(
            Relation(kind=RelationKind.DEPENDS_ON, target=target) for target in depends_on
        ),
    )


def _board(
    requirements: Iterable[CanonicalRequirement],
    *,
    records: Iterable[DeliveryRecord] = (),
    evidence: Mapping[str, EvidenceInputs] | None = None,
    execution: Mapping[str, ExecutionSummary] | None = None,
    priorities: Mapping[str, RequirementPriority] | None = None,
    blockers: Mapping[str, tuple[BlockerView, ...]] | None = None,
    evaluated_at: dt.datetime | None = NOW,
) -> BoardProjection:
    """A real projection over crafted inputs — the engine's own code path."""
    return project_board(
        BoardInputs(
            index=RequirementIndex(requirements=tuple(requirements), generation=7),
            delivery=DeliveryIndex(records={record.req_id: record for record in records}),
            evidence=dict(evidence or {}),
            execution=dict(execution or {}),
            priorities=dict(priorities or {}),
            blockers=dict(blockers or {}),
            evaluated_at=evaluated_at,
        ),
    )


def _delivered(req_id: str, satisfied_hash: str) -> DeliveryRecord:
    """A requirement Rotaris delivered once, at *satisfied_hash*."""
    return DeliveryRecord(
        req_id=req_id,
        delivery=DeliveryStatus(
            state=DeliveryState.DONE,
            changed_at=WHEN,
            changed_by=DeliveryActor.system("runner"),
            cause=TransitionCause.COMPLETION_ACCEPTED,
        ),
        satisfied=SatisfiedLog(
            entries=(
                SatisfiedDelivery(
                    req_id=req_id,
                    satisfied_hash=satisfied_hash,
                    run_id="run-7",
                    satisfied_at=WHEN,
                ),
            ),
        ),
    )


def _failing_tests(req_id: str, requirement_hash: str) -> EvidenceInputs:
    """Complete traceability, and a covering test that ran and failed (§22)."""
    return EvidenceInputs(
        req_id=req_id,
        requirement_hash=requirement_hash,
        implementations=(RequirementSite(path="src/rotaris_core/thing.py", line=12),),
        covering_tests=(
            CoveringTest(
                path="tests/unit/test_thing.py",
                line=40,
                executed=True,
                check_name="pytest",
                check_status="failed",
                # This test itself failed, which is what turns the ring red. A
                # check status alone never establishes that (SWR-2606).
                verdict="failed",
            ),
        ),
    )


class _BoardViewStub(QWidget):
    """A view declaring exactly the signals a requirement view declares.

    Stands in for the board widget the next slice adds, so the wiring contract
    in `RequirementsController.VIEW_SIGNALS` is asserted against something that
    behaves like a view rather than against the controller's own bookkeeping.
    """

    refresh_requested = Signal()
    requirement_selected = Signal(str)
    requirement_activated = Signal(str)
    scroll_changed = Signal(int)

    def __init__(self) -> None:
        super().__init__()
        self.boards: list[tuple[RequirementsBoardState, Any]] = []
        self.details: list[Any] = []

    def set_board(self, state: RequirementsBoardState, delta: Any) -> None:
        self.boards.append((state, delta))

    def show_detail(self, detail: Any) -> None:
        self.details.append(detail)


class _RecordingSource:
    """A board source that answers with a projection and records how it was called."""

    def __init__(self, projection: BoardProjection) -> None:
        self.projection = projection
        self.calls = 0
        self.threads: list[int] = []
        self.error: Exception | None = None
        #: Held here until a test releases it, so "a pass is in flight" is a fact
        #: rather than a hope. Without it a fake this fast can finish between two
        #: lines of the test that is trying to observe it mid-pass.
        self.gate = threading.Event()
        self.gate.set()

    def project(self) -> BoardProjection:
        self.calls += 1
        self.threads.append(threading.get_ident())
        self.gate.wait(10)
        if self.error is not None:
            raise self.error
        return self.projection


class _DeepSource(_RecordingSource):
    """A source with the deep half as well: the board, plus one card's history.

    The shape :class:`~rotaris.services.requirements_bridge.WorkspaceBoard` has —
    a cheap board pass and a per-requirement pass carrying the revision history
    (SWR-3313) — so the bridge's two-pass path is driven here without a
    repository.
    """

    def __init__(self, projection: BoardProjection, deep: BoardProjection) -> None:
        super().__init__(projection)
        self.deep = deep
        self.deep_calls: list[str] = []
        self.deep_threads: list[int] = []

    def project_detail(self, req_id: str) -> BoardProjection:
        self.deep_calls.append(req_id)
        self.deep_threads.append(threading.get_ident())
        return self.deep


# ── SWR-3304: the card, over a real projection ─────────────────────────────


@verifies(SWR.SWR_3304, SWR.SWR_3311)
def test_cards_report_the_lifecycle_delivery_and_health_the_engine_computed() -> None:
    delivered = _requirement("SWR-1001")
    drafted = _requirement("SWR-1002", lifecycle=RequirementLifecycle.DRAFT)
    projection = _board(
        [delivered, drafted],
        records=[_delivered("SWR-1001", "stale-hash")],
        evidence={"SWR-1002": _failing_tests("SWR-1002", drafted.current_hash)},
    )

    state = build_board_state(projection, now=NOW)

    assert state.ids == ("SWR-1001", "SWR-1002")
    for entry in projection.entries:
        card = state.card(entry.req_id)
        assert card is not None
        # Identity, not similarity: the desktop renders the engine's verdict and
        # has no way to compute a second one (SWR-3311).
        assert card.health == str(entry.health.health)
        assert card.health_label == entry.health.health.label
        assert card.evidence_state == str(entry.evidence_state)
        assert (card.lifecycle, card.delivery_label) == (
            str(entry.lifecycle),
            entry.badges[1],
        )
        assert tuple(segment.state for segment in card.evidence) == tuple(
            str(obligation.state) for obligation in entry.evidence.obligations
        )


@verifies(SWR.SWR_3304)
def test_a_card_states_its_exceptional_facts_in_words() -> None:
    requirement = _requirement("SWR-1003")
    projection = _board(
        [requirement],
        records=[_delivered("SWR-1003", "an-older-hash")],
        evidence={"SWR-1003": _failing_tests("SWR-1003", requirement.current_hash)},
    )
    card = build_card(projection.entries[0], now=NOW)

    assert "Specification changed since it was delivered" in card.alerts
    assert any("Test evidence is failing" in alert for alert in card.alerts)
    # Colour is a second channel over the words, never the only one.
    assert theme.health_color(card.health) != tokens().color.neutral[600]
    assert card.accessible_description.count("Specification changed") == 1


@verifies(SWR.SWR_3304)
def test_a_card_without_runs_units_or_priority_omits_them() -> None:
    projection = _board([_requirement("SWR-1004")])
    card = build_card(projection.entries[0], now=NOW)

    assert card.units_label == "No execution units yet"
    assert card.last_run_label == "Never run"
    assert card.unit_count == 0
    # `Source` is the one fact every requirement has — it came from somewhere —
    # and the board filters and groups by it (SWR-3309, SWR-3318). The optional
    # ones are absent, which is what this test is about.
    assert [fact.label for fact in card.facts] == ["Source"]
    assert all(fact.value for fact in card.facts)


@verifies(SWR.SWR_3304)
def test_a_card_shows_the_optional_facts_the_projection_carried() -> None:
    requirement = _requirement("SWR-1005", parent="SWR-1000")
    epic = _requirement("SWR-1000", "Requirement board")
    execution = ExecutionSummary(
        req_id="SWR-1005",
        units=(ExecutionUnitView(unit_id="unit-1", agent="coding-agent"),),
        runs=(
            RunView(
                run_id="run-3",
                unit_id="unit-1",
                outcome=RunOutcome.FAILED,
                started_at=WHEN,
                finished_at=WHEN + dt.timedelta(minutes=5),
                failure_reason="the suite failed",
            ),
        ),
    )
    projection = _board(
        [epic, requirement],
        execution={"SWR-1005": execution},
        priorities={"SWR-1005": RequirementPriority.CRITICAL},
    )
    card = build_card(projection.entry("SWR-1005"), now=NOW)

    facts = {fact.label: fact.value for fact in card.facts}
    assert facts["Priority"] == "Critical"
    assert facts["Epic"] == "SWR-1000"
    assert facts["Agent"] == "coding-agent"
    assert card.units_label == "1 execution unit"
    assert card.last_run_label == "Last run 2 hours ago (Failed)"
    epic_card = build_card(projection.entry("SWR-1000"), now=NOW)
    assert epic_card.is_epic
    assert epic_card.epic_label == "0 of 1 requirements done"


@pytest.mark.unit
@verifies(SWR.SWR_3304)
def test_every_board_colour_is_a_token_and_stays_readable() -> None:
    """Health and evidence are printed as well as painted, so each owes both floors.

    The semantics table answers with the *graphical* form of a state — the ring
    segment, the column accent, the status dot — which owes 3:1. The card also
    prints the same states as words, and reaches the text floor the way
    `RequirementCardWidget._restyle` does, by lifting that colour rather than by
    holding a second one. Both readings are asserted here because the board
    performs both, and a colour that only clears one of them is unreadable in
    whichever half was not measured.

    Measured against the readable ground: it is the lightest surface the board
    paints on, so clearing it clears every darker card and column too.
    """
    t = tokens()
    projection = _board([_requirement("SWR-1009")])
    card = build_card(projection.entries[0], now=NOW)

    painted = [
        theme.health_color(card.health),
        theme.delivery_color(card.delivery),
        *(theme.evidence_color(segment.state) for segment in card.evidence),
    ]
    for colour in painted:
        shape = theme.contrast_ratio(colour, t.color.readable_ground)
        assert shape >= t.min_boundary_contrast, f"{colour} paints at {shape:.2f}:1"
        word = raise_to_readable(colour, t)
        ratio = theme.contrast_ratio(word, t.color.readable_ground)
        assert ratio >= t.min_text_contrast, f"{colour} reads as {word} at {ratio:.2f}:1"
    # Every state the engine can report has its own token; nothing falls through
    # to the "unknown" grey by accident.
    assert theme.evidence_color("satisfied") != theme.evidence_color("failed")
    assert theme.health_color("blocked") != theme.health_color("verification-failed")
    # `idle`, not a raw ramp step: the degrade colour has to clear the same
    # non-text floor as every other segment, and a bare 600 does not on this
    # ground. Asserting the token rather than a hex keeps this true per theme.
    assert theme.health_color("a state nobody defined") == t.color.idle


@pytest.mark.unit
@verifies(SWR.SWR_3304)
def test_ages_are_words_and_a_missing_clock_prints_the_timestamp() -> None:
    assert describe_age(NOW - dt.timedelta(seconds=30), NOW) == "just now"
    assert describe_age(NOW - dt.timedelta(minutes=1), NOW) == "1 minute ago"
    assert describe_age(NOW - dt.timedelta(hours=5), NOW) == "5 hours ago"
    assert describe_age(NOW - dt.timedelta(days=3), NOW) == "3 days ago"
    assert describe_age(WHEN, None) == "2026-08-14 09:00"
    assert describe_age(None, NOW) == ""


def _instant(moment: str) -> dt.datetime:
    """The instant a rendered moment names — the proof that it is unambiguous.

    Parsing the string back is the whole assertion: a timestamp a reader cannot
    resolve to one point in time is exactly the thing a relative age already
    failed at, so a rendering that loses the offset fails here.
    """
    return dt.datetime.strptime(moment, "%Y-%m-%d %H:%M UTC%z")


@pytest.mark.unit
@verifies(SWR.SWR_3304)
def test_every_relative_age_carries_the_moment_it_rounded_off() -> None:
    """Productive use: on a board adopted this morning every card reads "just now", and a
    user has to say which of two requirements changed first, quote one of them in a ticket,
    or line one up against a commit log.
    Expected outcome: the exact moment travels with every age the board renders — the card's
    last change and last run, the detail view's last run and verification, and the history —
    as a local time whose offset makes it resolvable to one instant anywhere."""
    assert describe_moment(None) == ""
    # Naive in, naive out: an offset nobody stated is not invented here.
    assert describe_moment(WHEN.replace(tzinfo=None)) == "2026-08-14 09:00"
    assert _instant(describe_moment(WHEN)) == WHEN

    requirement = _requirement("SWR-1051")
    execution = ExecutionSummary(
        req_id="SWR-1051",
        units=(ExecutionUnitView(unit_id="unit-1", agent="coding-agent"),),
        runs=(
            RunView(
                run_id="run-3",
                unit_id="unit-1",
                outcome=RunOutcome.FAILED,
                started_at=WHEN,
                finished_at=WHEN + dt.timedelta(minutes=5),
            ),
        ),
    )
    projection = _board(
        [requirement],
        records=[_delivered("SWR-1051", requirement.current_hash)],
        execution={"SWR-1051": execution},
    )
    entry = projection.entry("SWR-1051")
    card = build_card(entry, now=NOW)

    # The card still reads at a glance…
    assert card.last_run_label == "Last run 2 hours ago (Failed)"
    change = next(fact for fact in card.facts if fact.label == "Last change")
    assert change.glance == f"Last change: {change.value}"
    # …and the moment behind each age is on the card, and announced with it.
    assert _instant(card.last_run_moment) == entry.execution.last_run_at
    assert card.last_run_announced == f"{card.last_run_label} ({card.last_run_moment})"
    assert card.last_run_announced in card.accessible_description
    assert _instant(change.detail) == entry.last_changed_at.replace(second=0, microsecond=0)
    assert change.sentence == f"{change.glance} ({change.detail})"
    assert change.sentence in card.accessible_description

    detail = build_detail(entry, now=NOW)
    last_run = next(fact for fact in detail.section("execution").facts if fact.label == "Last run")
    assert last_run.value.endswith("ago")
    assert _instant(last_run.detail) == entry.execution.last_run_at
    assert last_run.sentence == f"Last run: {last_run.value} ({last_run.detail})"

    verified = next(
        fact
        for fact in detail.section("verification").facts
        if fact.label == "Last successful verification"
    )
    assert _instant(verified.detail) == entry.deliveries[-1].satisfied_at

    # A history entry is where two ages are read against each other, so the line
    # itself prints both rather than hiding one behind a hover.
    revisions = build_detail(_board_with_history("SWR-1052").entry("SWR-1052"), now=NOW).revisions
    dated = [revision for revision in revisions if revision.when]
    assert dated, "the engine's history carried no dated revision to render"
    for revision in dated:
        assert _instant(revision.moment)
        assert f"{revision.when} ({revision.moment})" in revision.sentence


# ── SWR-3307: the detail view, over a real projection ──────────────────────


@verifies(SWR.SWR_3307)
def test_the_detail_view_reports_the_source_path_and_hash_the_engine_reports() -> None:
    requirement = _requirement(
        "SWR-1006",
        parent="SWR-1000",
        depends_on=("SWR-1001", "SWR-9999"),
    )
    projection = _board(
        [_requirement("SWR-1000"), _requirement("SWR-1001"), requirement],
        records=[_delivered("SWR-1006", "an-older-hash")],
        evidence={"SWR-1006": _failing_tests("SWR-1006", requirement.current_hash)},
    )
    entry = projection.entry("SWR-1006")
    detail = build_detail(entry, now=NOW)

    assert [section.key for section in detail.sections] == [key for key, _, _ in DETAIL_SECTIONS]
    facts = {fact.label: fact.value for fact in detail.section("requirement").facts}
    assert facts["Source path"] == entry.source_path
    assert facts["Current hash"] == entry.current_hash
    assert facts["Delivered hash"] == "an-older-hash"
    assert facts["Delivery state"] == entry.state.label
    assert detail.section("requirement").body == entry.description

    relations = detail.section("relations")
    assert ("SWR-1000", True) in [(link.req_id, link.resolved) for link in relations.links]
    unresolved = [link for link in relations.links if not link.resolved]
    assert [link.req_id for link in unresolved] == ["SWR-9999"]
    assert "unresolved" in unresolved[0].sentence

    traceability = detail.section("traceability")
    assert "src/rotaris_core/thing.py:12" in traceability.lines
    assert "tests/unit/test_thing.py:40" in traceability.lines


@verifies(SWR.SWR_3307)
def test_each_detail_section_degrades_on_its_own() -> None:
    projection = _board([_requirement("SWR-1007")])
    detail = build_detail(projection.entries[0], now=NOW)

    empty = {section.key for section in detail.sections if section.empty}
    assert empty == {"relations", "execution", "verification"}
    for section in detail.sections:
        assert section.empty_message
    assert detail.section("execution").empty_message == "Nothing has run for this requirement yet."


@verifies(SWR.SWR_3307)
def test_the_detail_view_renders_the_execution_fields_the_engine_fills() -> None:
    """Slice 4 fills these; until it does the section states its own emptiness."""
    execution = ExecutionSummary(
        req_id="SWR-1008",
        units=(ExecutionUnitView(unit_id="unit-1", depends_on=("unit-0",)),),
        runs=(
            RunView(
                run_id="run-9",
                unit_id="unit-1",
                outcome=RunOutcome.SUCCEEDED,
                branch="rotaris/req/SWR-1008/unit-1",
                produced_commits=("abc1234",),
                started_at=WHEN,
                finished_at=WHEN + dt.timedelta(minutes=2),
                verified=True,
                verification_detail="every check passed",
            ),
        ),
    )
    projection = _board([_requirement("SWR-1008")], execution={"SWR-1008": execution})
    detail = build_detail(projection.entries[0], now=NOW)

    section = detail.section("execution")
    assert not section.empty
    facts = {fact.label: fact.value for fact in section.facts}
    assert facts["Branches"] == "rotaris/req/SWR-1008/unit-1"
    assert facts["Commits"] == "abc1234"
    assert "unit-1: Pending (after unit-0)" in section.lines


# ── SWR-3311: structured data, never command output ────────────────────────


_ANNOTATION_API = {"SWR", "traces", "verifies"}
#: Names that *decide* a requirement's health, evidence or epic progress. The
#: desktop may render those verdicts; computing one is a second engine.
_ENGINE_VERDICTS = {
    "derive_health",
    "project_evidence",
    "aggregate_epics",
    "resolve_obligations",
    "coverage_map",
    "DerivedHealth",
    "EvidenceProjection",
}
_COMMAND_WORD = re.compile(r"\b(?:reqtocode|rotaris-cli|rotaris-headless)\b")
_PROCESS_NAMES = ("subprocess", "QProcess", "Popen")

#: The one desktop module the read-path bans do not apply to, and why.
#:
#: SWR-3311 constrains what the board *renders*: every fact on a card comes from
#: the projection, and nothing on that path spawns a process or parses output.
#: Starting a requirement run is not on that path — SWR-3416 says the desktop
#: "becomes one consumer of that seam" — and a run host that may not run anything
#: is a run host that starts nothing, which is how the released product ended up
#: with a Ready column that moved cards and did no work.
#:
#: The exemption is bounded rather than open, and the two assertions at the end
#: of the sweep are the bounds: the module may run exactly one command and that
#: command is ``git``, and it still may not compute a verdict or reach a
#: ReqToCode internal — those checks stay global.
_RUN_HOST_MODULE = "services/requirements_actions.py"


def _docstring_ids(tree: ast.Module) -> set[int]:
    """Identify docstring constants, so prose about a command is not a command."""
    found: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            if not node.body:
                continue
            first = node.body[0]
            if (
                isinstance(first, ast.Expr)
                and isinstance(first.value, ast.Constant)
                and isinstance(first.value.value, str)
            ):
                found.add(id(first.value))
    return found


@pytest.mark.unit
@verifies(SWR.SWR_3311)
def test_no_desktop_module_runs_reqtocode_or_computes_health_itself() -> None:
    violations: list[str] = []
    swept: list[str] = []
    requirement_modules: list[Path] = []
    for path in sorted(SRC_ROOT.rglob("*.py")):
        text = path.read_text(encoding="utf-8")
        where = path.relative_to(SRC_ROOT).as_posix()
        swept.append(where)
        if "requirements" in path.stem:
            requirement_modules.append(path)
        tree = ast.parse(text)
        docstrings = _docstring_ids(tree)
        # A string is only a command line if this module can start a process;
        # `auth_recovery` telling a user to run `rotaris-cli login` is advice,
        # not an invocation, and the difference is whether anything here can run
        # it.
        runs_processes = any(name in text for name in _PROCESS_NAMES)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and (node.module or "").startswith("rotaris_core"):
                module = node.module or ""
                names = {alias.name for alias in node.names}
                if module.startswith("rotaris_core.verifier") and where != _RUN_HOST_MODULE:
                    violations.append(f"{where}: imports the verifier ({module})")
                if module == "rotaris_core.reqtocode" and not names <= _ANNOTATION_API:
                    violations.append(f"{where}: imports {sorted(names - _ANNOTATION_API)}")
                if module.startswith("rotaris_core.reqtocode."):
                    violations.append(f"{where}: imports a ReqToCode internal ({module})")
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.startswith("rotaris_core.reqtocode.") or (
                        alias.name.startswith("rotaris_core.verifier") and where != _RUN_HOST_MODULE
                    ):
                        violations.append(f"{where}: imports {alias.name}")
            if isinstance(node, ast.Name) and node.id in _ENGINE_VERDICTS:
                violations.append(f"{where}: computes a verdict itself ({node.id})")
            if isinstance(node, ast.Attribute) and node.attr in _ENGINE_VERDICTS:
                violations.append(f"{where}: computes a verdict itself ({node.attr})")
            if (
                runs_processes
                and isinstance(node, ast.Constant)
                and isinstance(node.value, str)
                and id(node) not in docstrings
                and _COMMAND_WORD.search(node.value)
            ):
                violations.append(f"{where}: could run {node.value!r}")

    assert violations == [], "\n".join(violations)
    assert "services/requirements_bridge.py" in swept, "the guard swept the wrong tree"
    assert len(requirement_modules) >= 3, "the requirement modules moved out of the sweep"
    for path in requirement_modules:
        source = path.read_text(encoding="utf-8")
        if path.relative_to(SRC_ROOT).as_posix() == _RUN_HOST_MODULE:
            continue
        assert not any(name in source for name in _PROCESS_NAMES), (
            f"{path.name} starts a process; the board reads the engine as a library (SWR-3311)"
        )

    # The exemption, bounded: the composition root runs exactly one command and
    # that command is `git`. Anything else it wanted to shell out to would fail
    # here rather than quietly widening the hole this exemption opened.
    host = SRC_ROOT / _RUN_HOST_MODULE
    assert host in requirement_modules, "the run host moved out of the sweep"
    invocations = [
        node
        for node in ast.walk(ast.parse(host.read_text(encoding="utf-8")))
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in {"run", "Popen", "check_output", "call"}
        and isinstance(node.func.value, ast.Name)
        and node.func.value.id == "subprocess"
    ]
    assert len(invocations) == 1, f"{_RUN_HOST_MODULE} runs {len(invocations)} commands, not one"
    argv = invocations[0].args[0]
    assert isinstance(argv, ast.List) and argv.elts, "the command is a literal argument list"
    program = argv.elts[0]
    assert isinstance(program, ast.Constant) and program.value == "git", (
        "the only command a desktop requirement module runs is git (SWR-3311, SWR-3416)"
    )


#: The requirement surfaces of this slice. They render the projection and reach
#: the engine only through the bridge, so none of them may import the requirement
#: engine at run time at all (SWR-3311).
_BOARD_SURFACES = (
    "views/requirements.py",
    "views/requirement_detail.py",
    "views/requirement_graph.py",
    "widgets/requirement_card.py",
    "widgets/evidence_ring.py",
)


@pytest.mark.unit
@verifies(SWR.SWR_3311)
def test_no_board_surface_reaches_the_requirement_engine_at_all() -> None:
    """Productive use: someone adds a widget that "just quickly" reads the delivery store.
    Expected outcome: the sweep names the module — the board's only engine seam is the bridge."""
    violations: list[str] = []
    for where in _BOARD_SURFACES:
        path = SRC_ROOT / where
        assert path.exists(), f"{where} is missing; the guard sweeps the wrong tree"
        tree = ast.parse(path.read_text(encoding="utf-8"))
        typing_only = {
            id(node)
            for parent in ast.walk(tree)
            if isinstance(parent, ast.If) and ast.unparse(parent.test) == "TYPE_CHECKING"
            for node in ast.walk(parent)
        }
        for node in ast.walk(tree):
            if not isinstance(node, ast.Import | ast.ImportFrom) or id(node) in typing_only:
                continue
            modules = (
                [node.module or ""]
                if isinstance(node, ast.ImportFrom)
                else [alias.name for alias in node.names]
            )
            for module in modules:
                if module.startswith("rotaris_core.requirements"):
                    violations.append(f"{where}: imports the engine at run time ({module})")
                if module.startswith("rotaris.services"):
                    violations.append(f"{where}: reaches past the projection into {module}")

    assert violations == [], "\n".join(violations)


@verifies(SWR.SWR_3311)
def test_an_unavailable_projection_states_itself_and_invents_no_board(qtbot) -> None:
    store = WorkspaceStore()
    source = _RecordingSource(_board([]))
    source.error = RequirementsUnavailableError("this workspace keeps no requirement store")
    controller = RequirementsController(store, source=source)
    qtbot.addWidget(controller.surface)

    with qtbot.waitSignal(controller.bridge.unavailable, timeout=5000):
        controller.refresh()
    settle(qtbot)

    assert store.requirements.available is False
    assert store.requirements.cards == ()
    assert "keeps no requirement store" in store.requirements.unavailable_reason
    placeholder = find_by_accessible_name(
        controller.surface,
        "Requirements are unavailable",
        EmptyState,
    )
    assert "keeps no requirement store" in placeholder.accessibleDescription()
    controller.shutdown()


@verifies(SWR.SWR_3311)
def test_a_controller_without_a_source_says_so_rather_than_showing_nothing(qtbot) -> None:
    store = WorkspaceStore()
    controller = RequirementsController(store, workspace=None)
    qtbot.addWidget(controller.surface)

    assert controller.refresh() is False
    settle(qtbot)

    assert store.requirements.unavailable_reason == NO_SOURCE_REASON
    controller.shutdown()


# ── SWR-3312: following the repository, in place ───────────────────────────


@pytest.mark.unit
@verifies(SWR.SWR_3312)
def test_a_diff_names_only_the_requirements_that_moved() -> None:
    before = build_board_state(
        _board([_requirement("SWR-2001"), _requirement("SWR-2002")]),
        now=NOW,
    )
    after = build_board_state(
        _board(
            [_requirement("SWR-2001"), _requirement("SWR-2002", "a new title")],
            records=[_delivered("SWR-2002", "some-hash")],
        ),
        now=NOW,
    )

    first = diff_board(RequirementsBoardState(), before)
    assert first.first is True
    assert first.added == ("SWR-2001", "SWR-2002")

    delta = diff_board(before, after)
    assert delta.changed == ("SWR-2002",)
    assert delta.added == () and delta.removed == ()
    assert delta.columns_changed is True  # SWR-2002 moved from Backlog to Done
    assert diff_board(before, before).empty is True


@verifies(SWR.SWR_3312)
def test_an_evaluation_runs_off_the_qt_thread(qtbot) -> None:
    source = _RecordingSource(_board([_requirement("SWR-2003")]))
    bridge = RequirementsBridge(source, clock=lambda: NOW)

    source.gate.clear()
    with qtbot.waitSignal(bridge.evaluated, timeout=5000) as caught:
        assert bridge.refresh() is True
        # Held inside `project` until the gate opens, so the pass is provably
        # still in flight here rather than merely likely to be: this fake is fast
        # enough to finish between two lines of the test observing it.
        qtbot.waitUntil(lambda: source.calls == 1, timeout=5000)
        # Refused while one pass is in flight: a board must never be assembled
        # from two evaluations at once.
        assert bridge.refresh() is False
        source.gate.set()

    state, delta = caught.args
    assert state.ids == ("SWR-2003",)
    assert delta.first is True
    assert source.threads and source.threads[0] != threading.get_ident()
    bridge.shutdown()


@pytest.mark.integration
@verifies(SWR.SWR_3313, SWR.SWR_3311)
def test_the_workspace_board_wires_the_engines_deep_views_for_a_real_workspace(
    tmp_path: Path,
) -> None:
    """Productive use: the shipped app opens a requirement of a real project.
    Expected outcome: the projection the desktop actually builds carries the engine's own
    revision history and audit trail — not `None` fields the panel has to guess around."""
    workspace = _workspace_with_a_requirement(tmp_path)
    board = WorkspaceBoard(workspace)

    shallow = board.project().entry("SWR-6200")
    deep = board.project_detail("SWR-6200").entry("SWR-6200")

    assert shallow is not None and deep is not None
    # The board pass stays cheap; the deep views arrive on the detail pass.
    assert shallow.history is None
    assert deep.history is not None, "the desktop wires a DetailReader (SWR-3216)"
    assert deep.history.source_history_available is True, "read out of the real checkout"
    assert deep.audit is not None, "the recorded trail is projected too (SWR-3213)"
    commits = {entry.artefact_commit for entry in deep.history.entries}
    assert _head(workspace) in commits, f"the requirement's own commit is listed: {commits}"
    assert [entry.run_id for entry in deep.history.entries if entry.delivered] == ["run-7"]
    detail = build_detail(deep, now=NOW)
    assert detail.history_available is True
    assert any(revision.delivered for revision in detail.revisions)
    assert any(revision.current for revision in detail.revisions)


def _workspace_with_a_requirement(root: Path) -> Path:
    """A git checkout with a ReqToCode store, a delivery record and an audit trail."""
    workspace = root / "project"
    (workspace / "docs" / "requirements").mkdir(parents=True)
    document = workspace / "docs" / "requirements" / "SWR-6200-a-real-requirement.md"
    document.write_text(
        '---\nreq-id: SWR-6200\nstatus: approved\ntitle: "A real requirement"\n---\n\n'
        "# SWR-6200 — A real requirement\n\nThe product does the thing.\n",
        encoding="utf-8",
    )
    _git(workspace, "init", "-b", "main")
    _git(workspace, "config", "user.name", "Test User")
    _git(workspace, "config", "user.email", "test@example.invalid")
    _git(workspace, "add", ".")
    _git(workspace, "commit", "-m", "add SWR-6200")
    trail = AuditStore(workspace)
    trail.append(
        AuditEvent(
            req_id="SWR-6200",
            kind=AuditEventKind.DELIVERY_TRANSITION,
            at=WHEN,
            actor=DeliveryActor.system("runner"),
            to_state=DeliveryState.DONE,
            cause=TransitionCause.COMPLETION_ACCEPTED,
            requirement_hash="an-older-version",
            satisfied_hash="an-older-version",
            run_id="run-7",
        ),
    )
    delivered = DeliveryRecord(
        req_id="SWR-6200",
        delivery=DeliveryStatus(
            state=DeliveryState.DONE,
            changed_at=WHEN,
            changed_by=DeliveryActor.system("runner"),
            cause=TransitionCause.COMPLETION_ACCEPTED,
        ),
        satisfied=SatisfiedLog(
            entries=(
                SatisfiedDelivery(
                    req_id="SWR-6200",
                    satisfied_hash="an-older-version",
                    run_id="run-7",
                    satisfied_at=WHEN,
                ),
            ),
        ),
    )
    DeliveryStore(workspace).update_record("SWR-6200", lambda _record: delivered, at=WHEN)
    return workspace


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(  # noqa: S603 - fixed argv, no shell, test fixture
        ["git", *args],  # noqa: S607
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def _head(workspace: Path) -> str:
    return _git(workspace, "rev-parse", "HEAD").strip()


def _run_together(*passes: tuple[str, Callable[[], None]]) -> list[str]:
    """Start every pass on its own thread, released together, and report what raised.

    The barrier is what makes the interleaving worth asserting on: without it the
    first thread is usually finished before the second is scheduled.
    """
    gate = threading.Barrier(len(passes))
    failures: list[str] = []

    def guarded(name: str, run: Callable[[], None]) -> Callable[[], None]:
        def go() -> None:
            gate.wait(timeout=30)
            try:
                run()
            except Exception as error:  # noqa: BLE001 - reported, not swallowed
                failures.append(f"{name}: {error!r}")

        return go

    threads = [threading.Thread(target=guarded(name, run), name=name) for name, run in passes]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=120)
    assert not any(thread.is_alive() for thread in threads), "a pass never finished"
    return failures


@pytest.mark.serial
@verifies(SWR.SWR_3311)
def test_two_threads_opening_a_cold_board_read_the_workspace_source_once(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user opens a card in the same moment the first refresh starts.
    Expected outcome: the two passes share one registry — not two, one of which is thrown
    away with the source read and the snapshot cache it just paid for."""
    from rotaris.services import requirements_actions

    workspace = _workspace_with_a_requirement(tmp_path)
    board = WorkspaceBoard(workspace)
    resolved: list[Path] = []
    real_source_for = requirements_actions.requirement_source_for

    def counting(target: Path):
        resolved.append(target)
        time.sleep(0.05)  # widen the window the lock has to close
        return real_source_for(target)

    monkeypatch.setattr(requirements_actions, "requirement_source_for", counting)

    failures = _run_together(
        ("board", board.project),
        ("detail", lambda: board.project_detail("SWR-6200")),
    )

    assert failures == []
    assert len(resolved) == 1, f"the workspace source was resolved {len(resolved)} times"


@pytest.mark.serial
@verifies(SWR.SWR_3311, SWR.SWR_3313)
def test_a_detail_read_during_a_board_pass_describes_one_generation_of_the_board(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user opens a card while the board is re-evaluating behind it.
    Expected outcome: the card is described by one pass's index, evidence and relations —
    never this pass's index beside the last pass's sweep, which is a board that never was.

    The board pass is ``evaluate()`` then ``project()`` — the two stages the
    projection worker runs, since SWR-3519 made the write the one that says so."""
    from rotaris_core.requirements.delivery import projection

    from rotaris.services import requirements_bridge

    workspace = _workspace_with_a_requirement(tmp_path)
    board = WorkspaceBoard(workspace)
    published: list[object] = []
    decided: dict[str, list[tuple[object, object]]] = {}
    projected: dict[str, list[tuple[object, object]]] = {}
    ledger = threading.Lock()
    real_decision = WorkspaceBoard._decision
    real_projector = projection.BoardProjector
    real_snapshot = requirements_bridge._BoardSnapshot

    def recording_decision(self, index, relations):
        with ledger:
            decided.setdefault(threading.current_thread().name, []).append((index, relations))
        return real_decision(self, index, relations)

    def recording_projector(index, store, **fields):
        with ledger:
            projected.setdefault(threading.current_thread().name, []).append(
                (index, fields["evidence"])
            )
        return real_projector(index, store, **fields)

    def recording_snapshot(**fields):
        snapshot = real_snapshot(**fields)
        with ledger:
            published.append(snapshot)
        return snapshot

    monkeypatch.setattr(WorkspaceBoard, "_decision", recording_decision)
    monkeypatch.setattr(projection, "BoardProjector", recording_projector)
    monkeypatch.setattr(requirements_bridge, "_BoardSnapshot", recording_snapshot)

    def a_board_pass() -> None:
        """What the projection worker does: the write, then the read (SWR-3216)."""
        board.evaluate()
        board.project()

    a_board_pass()  # one generation exists before the interleaving starts
    rounds = 8
    for round_number in range(rounds):
        failures = _run_together(
            (f"board-{round_number}", a_board_pass),
            (f"detail-{round_number}", lambda: board.project_detail("SWR-6200")),
        )
        assert failures == []

    details = sorted(name for name in decided if name.startswith("detail-"))
    assert len(details) == rounds, f"every detail pass was recorded: {details}"
    for name in details:
        assert len(decided[name]) == 1 and len(projected[name]) == 1
        index, relations = decided[name][0]
        projected_index, evidence = projected[name][0]
        assert index is projected_index, f"{name} read the index twice and got two answers"
        assert any(
            snapshot.index is index
            and snapshot.evidence is evidence
            and snapshot.relations is relations
            for snapshot in published
        ), f"{name} mixed generations: its three values are not one pass's"


@verifies(SWR.SWR_3216, SWR.SWR_3519)
def test_projecting_the_board_moves_no_card_and_writes_no_record(tmp_path: Path) -> None:
    """Productive use: a review panel, a detail fallback or a repaint asks for the board.
    Expected outcome: nothing moves. The port has always said "reads only; never writes"
    (SWR-3216) and the shipped reader used to run the propagation pass first, so every
    read of a workspace with an edited requirement silently transitioned a card."""
    workspace = _workspace_with_a_requirement(tmp_path)
    _edit_the_delivered_requirement(workspace)
    board = WorkspaceBoard(workspace)
    before = _delivery_bytes(workspace)

    board.project()

    assert _delivery_bytes(workspace) == before, "a projection wrote to the delivery store"
    assert DeliveryStore(workspace).read("SWR-6200").state is DeliveryState.DONE


@verifies(SWR.SWR_3502, SWR.SWR_3519)
def test_evaluating_moves_the_card_the_projection_then_shows(tmp_path: Path) -> None:
    """The other half: what `project()` stopped doing, `evaluate()` does and says it does.
    SWR-3502 asks a delivered requirement whose text moved to reach Needs Update without
    user action — on evaluation, which is now the call that carries the name."""
    workspace = _workspace_with_a_requirement(tmp_path)
    _edit_the_delivered_requirement(workspace)
    board = WorkspaceBoard(workspace)

    outcome = board.evaluate()

    assert outcome.moves, "the pass says what it moved"
    assert outcome.cancelled is False
    assert DeliveryStore(workspace).read("SWR-6200").state is DeliveryState.NEEDS_UPDATE
    assert board.specification_moves == outcome.moves
    # The delivery records are read fresh per projection, never cached on the
    # snapshot — which is what lets a read issued straight after a write show it.
    entry = board.project().entry("SWR-6200")
    assert entry is not None and entry.delivery.state is DeliveryState.NEEDS_UPDATE


@pytest.mark.unit
@verifies(SWR.SWR_3216)
def test_the_read_port_and_the_write_port_are_two_and_a_reader_satisfies_only_one() -> None:
    """The seam itself, asserted rather than described.

    A double that implements `project` alone is a pure reader and can never be
    asked to write; the shipped board implements both and says so.
    """

    class ReadOnlyBoard:
        def project(self) -> None: ...

    assert isinstance(ReadOnlyBoard(), BoardSource)
    assert not isinstance(ReadOnlyBoard(), BoardEvaluation)
    assert isinstance(WorkspaceBoard(Path()), BoardSource)
    assert isinstance(WorkspaceBoard(Path()), BoardEvaluation)


def _edit_the_delivered_requirement(workspace: Path) -> None:
    """Move the requirement's text away from the version that was delivered."""
    document = workspace / "docs" / "requirements" / "SWR-6200-a-real-requirement.md"
    document.write_text(
        document.read_text(encoding="utf-8") + "\nA sixth attempt locks the account.\n",
        encoding="utf-8",
    )


def _delivery_bytes(workspace: Path) -> dict[str, bytes]:
    """Every byte of the delivery store, so "wrote nothing" is measured not hoped."""
    root = workspace / ".rotaris"
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


@pytest.mark.unit
@verifies(SWR.SWR_3311)
def test_each_pass_touches_the_snapshot_once_so_it_cannot_be_read_in_parts() -> None:
    """Productive use: a later slice reaches for `self._snapshot.index` where it needs it.
    Expected outcome: the sweep names the method — one load per pass is what makes the
    coherence structural, and three convenient reads put the race back by hand."""
    tree = ast.parse((SRC_ROOT / "services" / "requirements_bridge.py").read_text(encoding="utf-8"))
    board = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.ClassDef) and node.name == "WorkspaceBoard"
    )
    touches = {
        method.name: sum(
            1
            for node in ast.walk(method)
            if isinstance(node, ast.Attribute)
            and node.attr == "_snapshot"
            and isinstance(node.value, ast.Name)
            and node.value.id == "self"
        )
        for method in board.body
        if isinstance(method, ast.FunctionDef)
    }

    assert touches["project"] == 1, "the board pass publishes once, when all four values exist"
    assert touches["project_detail"] == 1, "the detail pass loads the whole snapshot or none of it"
    assert touches["specification_moves"] == 1, "one load, then the moves off that one value"


@pytest.mark.unit
@verifies(SWR.SWR_3311)
def test_the_board_keeps_a_pass_in_one_value_and_nothing_beside_it(tmp_path: Path) -> None:
    """Productive use: a later slice caches one more thing on the board "while it is there".
    Expected outcome: the inventory names it — index, evidence, relations and moves travel
    as one snapshot precisely so a reader on another thread cannot see half a generation."""
    board = WorkspaceBoard(tmp_path)

    assert set(vars(board)) == {
        "_workspace",
        "_registry",
        "_store",
        "_source",
        "_snapshot",
        "_lock",
        # A collaborator, not a pass value: it is set once by whoever owns the
        # run starter and *asked* during a pass, so it holds nothing a generation
        # could be seen half of (SWR-3611).
        "_running_here",
    }, "a pass's values belong inside _BoardSnapshot, not in a fifth mutable field beside it"


@verifies(SWR.SWR_3312)
def test_a_re_evaluation_updates_one_card_and_keeps_selection_and_scroll(qtbot) -> None:
    store = WorkspaceStore()
    source = _RecordingSource(_board([_requirement("SWR-2004"), _requirement("SWR-2005")]))
    controller = RequirementsController(store, source=source, clock=lambda: NOW)
    view = _BoardViewStub()
    qtbot.addWidget(controller.surface)
    controller.attach_view(view)

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)
    controller.select("SWR-2005")
    controller.remember_scroll(320)

    _idle(qtbot, controller)
    source.projection = _board(
        [_requirement("SWR-2004"), _requirement("SWR-2005", "a rewritten title")],
    )
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    _, delta = view.boards[-1]
    assert delta.changed == ("SWR-2005",)
    assert delta.rebuild_required is False
    assert store.requirements.selected_req_id == "SWR-2005"
    assert store.requirements.scroll_offset == 320
    assert store.requirements.card("SWR-2005").title == "a rewritten title"
    controller.shutdown()


@verifies(SWR.SWR_3312)
def test_a_failed_evaluation_keeps_the_last_good_board_and_states_why(qtbot) -> None:
    store = WorkspaceStore()
    source = _RecordingSource(_board([_requirement("SWR-2006")]))
    controller = RequirementsController(store, source=source, clock=lambda: NOW)
    qtbot.addWidget(controller.surface)
    controller.surface.show()
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    _idle(qtbot, controller)
    source.error = OSError("the requirement store could not be read")
    with qtbot.waitSignal(controller.bridge.failed, timeout=5000):
        controller.refresh()
    settle(qtbot)

    assert store.requirements.ids == ("SWR-2006",)  # the last good board still stands
    notice = store.requirements.notice
    assert notice is not None
    assert notice.persistent is True
    assert notice.action_label == "Retry"
    assert "could not be read" in notice.details
    banner = find_by_accessible_name(
        controller.surface,
        "error: Requirements could not be evaluated",
        InlineBanner,
    )
    assert banner.isVisible()

    # The stated failure is actionable: its action re-evaluates.
    _idle(qtbot, controller)
    source.error = None
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        click_by_name(qtbot, controller.surface, "Retry", QPushButton)
    settle(qtbot)
    assert store.requirements.notice is None
    controller.shutdown()


@verifies(SWR.SWR_3312)
def test_the_area_states_when_it_last_evaluated_and_offers_a_refresh(qtbot) -> None:
    store = WorkspaceStore()
    source = _RecordingSource(_board([_requirement("SWR-2007")], evaluated_at=NOW))
    controller = RequirementsController(
        store,
        source=source,
        clock=lambda: NOW + dt.timedelta(minutes=4),
    )
    qtbot.addWidget(controller.surface)
    controller.surface.show()

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    status = find_by_accessible_name(controller.surface, "Requirements evaluation status")
    assert status.text().startswith("Evaluated 4 minutes ago")
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        click_by_name(qtbot, controller.surface, "Refresh requirements", QPushButton)
    assert source.calls == 2
    controller.shutdown()


@verifies(SWR.SWR_3312)
def test_the_problems_the_status_line_counts_can_be_read(qtbot) -> None:
    """Productive use: the status line says this store has problems, and the user
    wants to know which ones. Expected outcome: the sentences behind the number hang
    off the line that counts them, as its tooltip and as what a screen reader
    announces with it. The count used to be the entire report — "2 notice(s)", with
    nowhere to go from there and nothing on screen that named a single one of them."""
    store = WorkspaceStore()
    projection = _board(
        [
            _requirement("SWR-2401", depends_on=("SWR-9998",)),
            _requirement("SWR-2402", depends_on=("SWR-9999",)),
        ],
        evaluated_at=NOW,
    )
    controller = RequirementsController(
        store,
        source=_RecordingSource(projection),
        clock=lambda: NOW,
    )
    qtbot.addWidget(controller.surface)
    controller.surface.show()

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    assert len(store.requirements.notices) == 2
    status = find_by_accessible_name(controller.surface, "Requirements evaluation status")
    assert "2 problems with this store" in status.text()
    # The count is plain language now, and it is not the only thing said.
    assert "notice(s)" not in status.text()
    for dangling in ("SWR-9998", "SWR-9999"):
        assert dangling in status.toolTip()
        assert dangling in status.accessibleDescription()
    # One problem is one problem: the count is a sentence, not a template.
    single = replace(store.requirements, notices=("SWR-2401: one thing went wrong",))
    assert "1 problem with this store" in controller._status_text(single)
    # And so is one requirement. "(s)" is a template; a screen reader reads it
    # out as "requirement open bracket s close bracket".
    one = replace(store.requirements, cards=store.requirements.cards[:1])
    assert "1 requirement" in controller._status_text(one)
    assert "requirement(s)" not in controller._status_text(one)
    assert "2 requirements" in controller._status_text(store.requirements)
    controller.shutdown()


@verifies(SWR.SWR_3312)
def test_the_counted_problems_open_into_a_notice_that_can_be_answered_and_dismissed(
    qtbot,
) -> None:
    """Productive use: the status line says this store has two problems and the user
    wants to do something about them. Expected outcome: the count is a link, opening it
    puts the problems in the area's notice — named, copyable, with the re-read that
    answers them and a dismiss for a reader who has read them — and both controls do
    what they say. The count used to be reachable only by hovering it, which told a
    pointer what was wrong and offered nobody a way out of it."""
    from rotaris.services.requirements_controller import (
        STORE_NOTICES_HREF,
        STORE_NOTICES_NOTICE,
    )

    store = WorkspaceStore()
    source = _RecordingSource(
        _board(
            [
                _requirement("SWR-2411", depends_on=("SWR-9998",)),
                _requirement("SWR-2412", depends_on=("SWR-9999",)),
            ],
            evaluated_at=NOW,
        ),
    )
    controller = RequirementsController(store, source=source, clock=lambda: NOW)
    qtbot.addWidget(controller.surface)
    controller.surface.show()

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    status = find_by_accessible_name(controller.surface, "Requirements evaluation status")
    # An eye can see there is somewhere to go, not only a screen reader.
    assert f'<a href="{STORE_NOTICES_HREF}"' in status.text()
    assert "2 problems with this store</a>" in status.text()
    # And a keyboard can take it: the link is in the tab order, not pointer-only.
    assert status.focusPolicy() != Qt.FocusPolicy.NoFocus

    status.linkActivated.emit(STORE_NOTICES_HREF)
    settle(qtbot)

    notice = store.requirements.notice
    assert notice is not None, "the count opens what it counts"
    assert notice.id == STORE_NOTICES_NOTICE
    assert notice.title == "2 problems with this store"
    assert notice.persistent is True
    for dangling in ("SWR-9998", "SWR-9999"):
        assert dangling in notice.details
    banner = find_by_accessible_name(
        controller.surface,
        "warning: 2 problems with this store",
        InlineBanner,
    )
    assert banner.isVisible()

    # It can be answered: the offered move re-reads the store the problems are in.
    _idle(qtbot, controller)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        click_by_name(qtbot, controller.surface, "Re-read requirements", QPushButton)
    settle(qtbot)
    assert source.calls == 2

    # And it can be put away. Before this, Dismiss was drawn on every persistent
    # notice this area publishes and answered by nobody.
    status.linkActivated.emit(STORE_NOTICES_HREF)
    settle(qtbot)
    assert store.requirements.notice is not None
    click_by_name(qtbot, controller.surface, "Dismiss", QPushButton)
    settle(qtbot)

    assert store.requirements.notice is None
    assert not banner.isVisible()
    controller.shutdown()


@verifies(SWR.SWR_3304, SWR.SWR_3312)
def test_the_status_line_prints_the_moment_behind_its_relative_age(qtbot) -> None:
    """Productive use: the header says the board was evaluated four minutes ago, and the
    user is trying to tell whether that was before or after the commit they just made.
    Expected outcome: the line carries the moment itself beside the age, in the same
    words the cards offer. A relative age alone cannot be compared with anything —
    a commit log, a CI run, or the clock on the wall."""
    from rotaris.models.requirements_state import describe_moment

    store = WorkspaceStore()
    controller = RequirementsController(
        store,
        source=_RecordingSource(_board([_requirement("SWR-2413")], evaluated_at=NOW)),
        clock=lambda: NOW + dt.timedelta(minutes=4),
    )
    qtbot.addWidget(controller.surface)
    controller.surface.show()

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    status = find_by_accessible_name(controller.surface, "Requirements evaluation status")
    line = controller._status_text(store.requirements)

    assert line.startswith("Evaluated 4 minutes ago")
    assert describe_moment(NOW) in line, "the age carries the moment it rounds off"
    assert describe_moment(NOW) in status.accessibleDescription()
    # One rendering of the moment, not two: the absolute form is the one the
    # cards print, taken from the model rather than spelled again here.
    assert line.count(describe_moment(NOW)) == 1
    controller.shutdown()


# ── SWR-3419: a workspace that can host no run says so up front ────────────


@verifies(SWR.SWR_3419)
def test_a_board_on_a_checkout_with_no_commit_says_so_before_any_card_moves(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: someone opens Rotaris on a project they have only just
    ``git init``ed. Expected outcome: the board states, in its own notice area and
    before anything is dragged, that nothing can run here and what to do about
    it. The condition is a fact about the workspace, and it used to be discovered
    one drop at a time — a refusal per requirement for something that was never
    about a requirement."""
    workspace = tmp_path / "punchclock"
    workspace.mkdir()
    _git(workspace, "init", "-b", "main")
    store = WorkspaceStore()
    controller = RequirementsController(
        store,
        workspace=workspace,
        source=_RecordingSource(_board([_requirement("SWR-7101")])),
        clock=lambda: NOW,
    )
    qtbot.addWidget(controller.surface)
    controller.surface.show()

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    notice = store.requirements.notice
    assert notice is not None, "a workspace with no commit says so before a card is dragged"
    assert notice.id == NO_COMMIT_NOTICE
    assert notice.persistent is True
    # The same sentence the drop-time refusal raises, asked without a
    # requirement — nothing has been chosen yet (SWR-3419).
    assert notice.message.startswith(no_commit_refusal(workspace))
    assert "punchclock" in notice.message
    assert "SWR-7101" not in notice.message
    # And it offers to satisfy the precondition rather than only naming it,
    # saying what that will do before it is pressed.
    assert notice.action_id == GIT_SETUP_ACTION
    assert notice.action_label == "Set up Git here"
    assert ".rotaris/" in notice.message
    assert "Initial commit" in notice.message
    assert "Nothing is pushed" in notice.message
    assert find_by_accessible_name(
        controller.surface,
        "warning: Nothing can run here yet",
        InlineBanner,
    ).isVisible()

    # It clears itself: the first evaluation after the first commit finds a base.
    _idle(qtbot, controller)
    _git(workspace, "config", "user.name", "Test User")
    _git(workspace, "config", "user.email", "test@example.invalid")
    _git(workspace, "commit", "--allow-empty", "-m", "init")
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)
    assert store.requirements.notice is None
    controller.shutdown()


@verifies(SWR.SWR_3419)
def test_a_board_on_a_checkout_that_has_committed_carries_no_such_notice(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: the ordinary project, opened on any day but its first.
    Expected outcome: nothing is said, and the notice slot stays free for the
    failures that need it."""
    workspace = _workspace_with_a_requirement(tmp_path)
    store = WorkspaceStore()
    controller = RequirementsController(
        store,
        workspace=workspace,
        source=_RecordingSource(_board([_requirement("SWR-7102")])),
        clock=lambda: NOW,
    )
    qtbot.addWidget(controller.surface)
    controller.surface.show()

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    assert store.requirements.notice is None
    controller.shutdown()


# ── SWR-3315: one seam, one touch in the window ────────────────────────────


@pytest.mark.unit
@verifies(SWR.SWR_3315)
def test_the_controller_wires_every_signal_a_requirement_view_declares(qtbot) -> None:
    store = WorkspaceStore()
    bridge = FakeRequirementsBridge()
    controller = RequirementsController(store, bridge=bridge)
    view = _BoardViewStub()
    qtbot.addWidget(controller.surface)

    connected = controller.attach_view(view)

    assert connected == tuple(name for name, _ in RequirementsController.VIEW_SIGNALS)
    view.refresh_requested.emit()
    assert bridge.refreshes == 1
    view.requirement_selected.emit("SWR-3001")
    assert store.requirements.selected_req_id == "SWR-3001"
    view.scroll_changed.emit(140)
    assert store.requirements.scroll_offset == 140


@verifies(SWR.SWR_3315, SWR.SWR_3307)
def test_activating_a_card_reaches_the_engine_seam_through_the_controller(qtbot) -> None:
    store = WorkspaceStore()
    source = _RecordingSource(_board([_requirement("SWR-3002")]))
    controller = RequirementsController(store, source=source, clock=lambda: NOW)
    view = _BoardViewStub()
    qtbot.addWidget(controller.surface)
    controller.attach_view(view)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    view.requirement_activated.emit("SWR-3002")

    assert store.requirements.selected_req_id == "SWR-3002"
    assert [detail.req_id for detail in view.details] == ["SWR-3002"]
    assert view.details[0].section("requirement").facts
    controller.shutdown()


@verifies(SWR.SWR_3313, SWR.SWR_3315)
def test_opening_a_card_reads_its_revision_history_off_the_qt_thread(qtbot) -> None:
    """Productive use: a user opens a requirement and asks which versions were built.
    Expected outcome: the panel opens at once saying the history is being read, and the
    engine's own revision history replaces it — read on a worker thread, not on the Qt one."""
    store = WorkspaceStore()
    requirement = _requirement("SWR-3002")
    source = _DeepSource(_board([requirement]), _board_with_history("SWR-3002"))
    controller = RequirementsController(store, source=source, clock=lambda: NOW)
    view = _BoardViewStub()
    qtbot.addWidget(controller.surface)
    controller.attach_view(view)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    with qtbot.waitSignal(controller.bridge.detail_ready, timeout=5000):
        view.requirement_activated.emit("SWR-3002")

    settle(qtbot)
    shallow, deep = view.details[0], view.details[-1]
    assert len(view.details) == 2, "the panel opens on the board's entry, then deepens"
    assert shallow.revisions == ()
    assert shallow.history_reason == PENDING_HISTORY_REASON
    assert [revision.requirement_hash for revision in deep.revisions] == [
        "built-once",
        requirement.current_hash,
    ]
    assert deep.revisions[0].run_id == "run-88"
    assert deep.revisions[-1].current is True
    assert deep.revisions[-1].outcome == "Not yet delivered"
    assert source.deep_calls == ["SWR-3002"]
    assert source.deep_threads[0] != threading.get_ident(), "the deep read is off the Qt thread"
    controller.shutdown()


def _board_with_history(req_id: str) -> BoardProjection:
    """A projection whose entry carries the engine's own revision history."""
    requirement = _requirement(req_id)
    return project_board(
        BoardInputs(
            index=RequirementIndex(requirements=(requirement,), generation=8),
            histories={
                req_id: build_revision_history(
                    req_id,
                    current_hash=requirement.current_hash,
                    recorded=(RecordedHash(requirement_hash="built-once", at=WHEN),),
                    deliveries=(
                        SatisfiedDelivery(
                            req_id=req_id,
                            satisfied_hash="built-once",
                            run_id="run-88",
                            satisfied_at=WHEN,
                            verified_commit="abc1234",
                        ),
                    ),
                    current_at=NOW,
                ),
            },
            evaluated_at=NOW,
        ),
    )


@verifies(SWR.SWR_3315)
def test_the_window_constructs_and_registers_the_area_and_wires_nothing(qtbot) -> None:
    window = MainWindow(WorkspaceStore())
    qtbot.addWidget(window)

    assert "requirements" in window.VIEW_ORDER
    assert window.views["requirements"] is window.requirements_controller.surface
    assert ("requirements", "diamonds-four", "Requirements") in NAV_ITEMS
    window.show_view("requirements")
    assert window.stack.currentWidget() is window.requirements_controller.surface

    # The whole of SWR-3315: the window's additions are construction and
    # registration. Every connection the area needs lives on the controller.
    source = MAIN_WINDOW.read_text(encoding="utf-8")
    wiring = [
        line.strip()
        for line in source.splitlines()
        if "requirement" in line.lower() and ".connect(" in line
    ]
    assert wiring == [], f"main_window.py wires the requirements area itself: {wiring}"

    # Nor does it know any requirement widget: the board, the detail view, the
    # evidence view and the graph all attach to the controller (SWR-3315).
    for module in ("views.requirements", "views.requirement_detail", "views.requirement_graph"):
        assert module not in source, f"main_window.py imports {module}"
    # The sessions dialog is exempt *by location*, not by text. SWR-3612 requires
    # a requirement-started run to say so "where sessions are listed", which is a
    # surface that already existed and is not the requirement feature growing into
    # the window — the thing SWR-3315 protects against. This guard reads the word
    # "requirement" and cannot tell the two apart, so the rule is stated instead.
    #
    # Stated as a rule rather than by adding the two lines to the list below,
    # because the list is text-exact: any rewording of that tooltip would break
    # this test, and the obvious repair would be "update the string here". Do that
    # twice and the assertion has quietly become a blessing list instead of a
    # bound, which is how a containment guard rots. What the exemption permits is
    # narrow — non-wiring, non-importing mentions inside one dialog — because
    # ``.connect(`` and the view imports are both still checked across the whole
    # file, above.
    exempt = next(
        node
        for node in ast.walk(ast.parse(source))
        if isinstance(node, ast.ClassDef) and node.name == "_SessionsDialog"
    )
    touched = [
        line.strip()
        for number, line in enumerate(source.splitlines(), 1)
        if "requirement" in line.lower()
        and not line.strip().startswith("#")
        and not (exempt.lineno <= number <= (exempt.end_lineno or exempt.lineno))
    ]
    assert sorted(touched) == sorted(
        [
            '"requirements",',  # VIEW_ORDER
            "from rotaris.services.requirements_controller import RequirementsController",
            "self.requirements_controller = RequirementsController(",
            "self.requirements = self.requirements_controller.surface",
            '"requirements": self.requirements,',  # the view map
        ],
    ), f"main_window.py grew past construction and registration: {touched}"


# ── the product flow ───────────────────────────────────────────────────────


@pytest.mark.e2e
@verifies(SWR.SWR_3312, SWR.SWR_3304)
def test_a_change_in_the_repository_changes_the_board_without_a_restart(
    qtbot,
    tmp_path: Path,
) -> None:
    """A user edits a requirement in another window; the affected card changes.

    Driven through the real window, the real controller, the real bridge and the
    real requirement engine over a requirement store on disk. Nothing is faked:
    the only thing this test supplies is the workspace.
    """
    store_dir = tmp_path / "docs" / "requirements"
    store_dir.mkdir(parents=True)
    spec = store_dir / "SWR-0001-example.md"
    spec.write_text(
        "---\n"
        "req-id: SWR-0001\n"
        "status: approved\n"
        "trace: required\n"
        "test: required\n"
        'title: "Example requirement"\n'
        "date: 2026-08-14\n"
        "---\n\n"
        "# SWR-0001 — Example requirement\n\n"
        "The product does the thing.\n",
        encoding="utf-8",
    )

    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service._providers = lambda: []  # type: ignore[method-assign]
    service._subscription_limits = lambda: []  # type: ignore[method-assign]
    service.load()
    window = MainWindow(store, config_service=service)
    qtbot.addWidget(window)
    controller = window.requirements_controller
    window.show()
    qtbot.waitExposed(window)

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=30000):
        click_by_name(qtbot, window.nav, "Open Requirements", QToolButton)
    settle(qtbot)
    assert store.ui.active_view == "requirements"
    assert store.requirements.card("SWR-0001").title == "Example requirement"
    controller.select("SWR-0001")

    spec.write_text(
        spec.read_text(encoding="utf-8").replace(
            'title: "Example requirement"',
            'title: "Example requirement, revised"',
        ),
        encoding="utf-8",
    )
    # What the Git view does after a commit lands — no restart, no manual reload.
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=30000) as caught:
        store.git_changed.emit()
    settle(qtbot)

    _, delta = caught.args
    assert delta.changed == ("SWR-0001",)
    assert store.requirements.card("SWR-0001").title == "Example requirement, revised"
    assert store.requirements.selected_req_id == "SWR-0001"
    controller.shutdown()


# ── the board itself: columns, blockers, filters, panes ────────────────────


def _blocked(req_id: str, reason: str) -> DeliveryRecord:
    """A requirement stopped on something a human has to answer (SWR-3303)."""
    return DeliveryRecord(
        req_id=req_id,
        delivery=DeliveryStatus(
            state=DeliveryState.BLOCKED,
            blocked_reason=reason,
            blocked_from=DeliveryState.READY,
            changed_at=WHEN,
            changed_by=DeliveryActor.system("runner"),
            cause=TransitionCause.BLOCKER_RAISED,
        ),
    )


def _attached(
    qtbot,
    projection: BoardProjection,
    store: WorkspaceStore | None = None,
) -> tuple[RequirementsController, RequirementsView, _RecordingSource]:
    """A board view attached to a real controller over *projection*.

    The seam the window uses: `RequirementsController.attach_view` connects the
    view's signals and pushes boards into it (SWR-3315), so a test that drives
    the view here drives exactly what the window drives.
    """
    source = _RecordingSource(projection)
    controller = RequirementsController(
        store if store is not None else WorkspaceStore(),
        source=source,
        clock=lambda: NOW,
    )
    view = RequirementsView()
    qtbot.addWidget(controller.surface)
    controller.attach_view(view)
    controller.surface.resize(1000, 640)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=20000):
        controller.refresh()
    settle(qtbot)
    qtbot.waitUntil(lambda: not view.populating, timeout=20000)
    return controller, view, source


@pytest.mark.unit
@verifies(SWR.SWR_3302)
def test_every_requirement_lands_in_exactly_one_column_and_empty_ones_say_why() -> None:
    """Productive use: a user asks "what is where" and counts the board.
    Expected outcome: each requirement is in one column, and an empty column states what belongs."""
    projection = _board(
        [_requirement(f"SWR-90{index:02d}") for index in range(1, 4)],
        records=[
            _delivered("SWR-9002", "a-hash"),
            _blocked("SWR-9003", "SWR-9001 has to land first"),
        ],
    )
    state = build_board_state(projection, now=NOW)

    columns = board_columns(state, state.cards)

    placed = [req_id for column in columns for req_id in column.card_ids]
    assert sorted(placed) == ["SWR-9001", "SWR-9002", "SWR-9003"]
    assert len(placed) == len(set(placed)), "a requirement is in two columns"
    by_key = {column.key: column for column in columns}
    assert by_key["backlog"].card_ids == ("SWR-9001",)
    assert by_key["done"].card_ids == ("SWR-9002",)
    assert by_key["blocked"].card_ids == ("SWR-9003",)
    # Blocked is pinned first so it cannot be scrolled past (SWR-3303).
    assert columns[0].key == "blocked"
    assert [column.key for column in columns[1:]] == [
        "backlog",
        "ready",
        "running",
        "review",
        "needs-update",
        "done",
    ]
    assert by_key["ready"].count == 0
    assert by_key["ready"].empty_message == COLUMN_HINTS["ready"]
    assert len({column.empty_message for column in columns}) == len(columns)


@verifies(SWR.SWR_3302, SWR.SWR_3321)
def test_the_board_renders_one_column_per_delivery_state_with_its_count(qtbot) -> None:
    """Productive use: a user opens Requirements and reads the board.
    Expected outcome: every column is on screen, counted, and the empty ones explain themselves."""
    projection = _board(
        [_requirement(f"SWR-91{index:02d}") for index in range(1, 4)],
        records=[_delivered("SWR-9102", "a-hash")],
    )
    controller, view, _source = _attached(qtbot, projection)

    for column in view.columns:
        widget = view.column_widget(column.key)
        assert widget is not None, f"{column.key} was not rendered"
        assert widget.header.text() == f"{column.label} · {column.count}"
        if column.count:
            assert not widget.folded
            assert not widget.empty_label.isVisible()
            continue
        # An empty column folds to its rail (SWR-3321), and the sentence saying
        # what belongs there moves onto the rail rather than disappearing.
        assert widget.folded, f"{column.key} is empty and should have folded"
        assert widget.rail.text() == f"{column.label} · 0"
        assert column.empty_message in widget.rail.accessibleDescription()
    assert set(view.card_widgets) == {"SWR-9101", "SWR-9102", "SWR-9103"}
    assert view.column_widget("done") is not None
    assert view.column_widget("done").header.text().endswith("· 1")
    controller.shutdown()


@verifies(SWR.SWR_3302, SWR.SWR_3317)
def test_a_board_of_several_hundred_requirements_realises_only_what_is_on_screen(
    qtbot,
) -> None:
    """Productive use: a real store of several hundred requirements is opened.

    Expected outcome: every requirement is counted in its column, and the board
    holds card widgets only for the handful the user can actually see — which is
    what stops the paint costing one widget per requirement (SWR-3317).

    This used to assert that all 300 cards existed as widgets, and that is
    exactly the property that made the board unusable over a real store: it is
    not something a user can observe, and paying for it cost 84 seconds on the
    Qt thread here. What a user *can* observe is the column count and the cards
    in front of them, and those are what is asserted now.
    """
    projection = _board([_requirement(f"SWR-6{index:03d}") for index in range(300)])
    state = build_board_state(projection, now=NOW)
    view = RequirementsView()
    qtbot.addWidget(view)
    view.resize(1000, 640)
    view.show()
    qtbot.waitExposed(view)

    view.set_board(state)
    settle(qtbot)

    # The board holds all 300 and paints a fraction of them. How small that
    # fraction is depends on how tall a card comes out, so what is asserted is
    # the property rather than a widget count: most of this column has no
    # widget at all.
    assert sum(column.count for column in view.columns) == 300
    assert view.column_widget("backlog").header.text() == "Backlog · 300"
    realised = len(view.card_widgets)
    assert 0 < realised * 4 < 300, f"the board realised {realised} of 300 cards"
    assert view.pending_count == 300 - realised
    # …and nothing is left over: the paint finished inside the call above.
    assert view.populating is False
    # The realised cards are the top of the column, because that is where the
    # column is scrolled to — a contiguous band, not a scattering.
    backlog = view.column_widget("backlog")
    assert set(view.card_widgets) == set(backlog.card_ids[:realised])


def _long_board(qtbot, count: int = 300) -> RequirementsView:
    """A shown board over *count* requirements, all in one column."""
    projection = _board([_requirement(f"SWR-6{index:03d}") for index in range(count)])
    view = RequirementsView()
    qtbot.addWidget(view)
    view.resize(1000, 640)
    view.show()
    qtbot.waitExposed(view)
    view.set_board(build_board_state(projection, now=NOW))
    settle(qtbot)
    return view


@pytest.mark.unit
@verifies(SWR.SWR_3317)
def test_scrolling_a_long_column_recycles_its_cards_instead_of_building_more(qtbot) -> None:
    """Productive use: a user scrolls a column of three hundred requirements.

    Expected outcome: the cards that scroll in are the ones that scrolled out,
    repainted in place — so reading the whole column costs a handful of widgets
    rather than three hundred.
    """
    view = _long_board(qtbot)
    column = view.column_widget("backlog")
    assert column is not None
    at_the_top = set(view.card_widgets)
    built = len(view.findChildren(RequirementCardWidget))
    assert built * 4 < 300

    bar = column.card_scroll.verticalScrollBar()
    for step in range(1, 11):
        bar.setValue(int(bar.maximum() * step / 10))
        settle(qtbot)

    # A whole column read end to end, and the board grew by nothing worth
    # counting: every card that came into view took a recycled widget.
    grew = len(view.findChildren(RequirementCardWidget)) - built
    assert grew <= 2 * OVERSCAN, f"scrolling built {grew} further card widgets"
    # …and it is showing the end of the column, not still the beginning.
    at_the_bottom = set(view.card_widgets)
    assert at_the_bottom.isdisjoint(at_the_top)
    assert column.card_ids[-1] in at_the_bottom, "the last card cannot be reached"
    # Each realised widget paints the requirement it is filed under, so a
    # recycled one never keeps the card it was built for.
    for req_id, widget in view.card_widgets.items():
        assert widget.req_id == req_id


@pytest.mark.unit
@verifies(SWR.SWR_3317)
def test_a_card_the_user_has_not_scrolled_to_can_still_be_reached_by_name(qtbot) -> None:
    """Productive use: the board has to focus a selection the user scrolled past.

    Expected outcome: asking for one requirement scrolls its column to it and
    gives it a widget, because after SWR-3317 a card nobody can see has none.
    """
    view = _long_board(qtbot)
    assert "SWR-6280" not in view.card_widgets, "the whole column was realised"

    revealed = view.reveal("SWR-6280")

    assert revealed is not None
    assert revealed.req_id == "SWR-6280"
    assert view.card_widgets["SWR-6280"] is revealed
    assert revealed.isVisible()
    # Reaching it did not realise everything on the way there.
    assert len(view.card_widgets) <= 4 * OVERSCAN
    # A requirement this board does not hold has nothing to reveal.
    assert view.reveal("SWR-0000") is None
    assert view.reveal("") is None


@verifies(SWR.SWR_3317, SWR.SWR_3309)
def test_a_filter_change_repaints_the_board_instead_of_rebuilding_it(qtbot) -> None:
    """Productive use: a user narrows a large board while reading a column.

    Expected outcome: the same columns and the same card widgets are still
    there, repainted — so the selection and the scroll position the user left
    survive a filter exactly as they survive a re-evaluation.
    """
    projection = _board([_requirement(f"SWR-70{index:02d}") for index in range(10, 60)])
    controller, view, _source = _attached(qtbot, projection)
    column = view.column_widget("backlog")
    assert column is not None
    bar = column.card_scroll.verticalScrollBar()
    bar.setValue(bar.maximum() // 2)
    settle(qtbot)
    offset = view.column_offset("backlog")
    onscreen = dict(view.card_widgets)
    assert onscreen
    view._select(next(iter(onscreen)))  # noqa: SLF001 — the board's own selection path
    selected = view.selected_req_id
    columns = {key: view.column_widget(key) for key in (column.key for column in view.columns)}

    # A filter every card survives: nothing may move.
    view.set_filter(BoardFilter(text="SWR-70"))
    settle(qtbot)

    assert {key: view.column_widget(key) for key in columns} == columns, "columns were rebuilt"
    for req_id, widget in onscreen.items():
        assert view.card_widgets[req_id] is widget, "a card widget was rebuilt"
    assert view.selected_req_id == selected
    assert view.column_offset("backlog") == offset

    # …and one that almost nothing survives still keeps the columns themselves.
    view.set_filter(BoardFilter(text="SWR-7042"))
    settle(qtbot)

    assert {key: view.column_widget(key) for key in columns} == columns, "columns were rebuilt"
    assert view.column_widget("backlog").card_ids == ("SWR-7042",)
    assert set(view.card_widgets) == {"SWR-7042"}
    controller.shutdown()


@pytest.mark.unit
@verifies(SWR.SWR_3317)
def test_the_search_box_waits_for_the_typing_to_stop_before_it_filters(qtbot) -> None:
    """Productive use: a user types five characters into the search box.

    Expected outcome: the board is recomputed once, when they stop — not once
    per character, which is what made every keystroke cost the whole board.
    """
    view = _long_board(qtbot, count=40)
    search = find_by_accessible_name(view, "Search requirements", visible_only=True)

    qtbot.keyClicks(search, "SWR-60")

    # Mid-typing: the box has the text, the board does not have the filter yet.
    assert search.text() == "SWR-60"
    assert view.populating is True
    assert view.board_filter.text == ""

    qtbot.waitUntil(lambda: not view.populating, timeout=5000)
    settle(qtbot)

    assert view.board_filter.text == "SWR-60"
    assert view.column_widget("backlog").card_ids == tuple(
        f"SWR-60{index:02d}" for index in range(40)
    )
    # The wait is a debounce, not a background pass: once it has landed the
    # board is finished, whatever else the user does next.
    assert SEARCH_DEBOUNCE_MS > 0
    assert view.populating is False


@verifies(SWR.SWR_3303)
def test_blocked_requirements_are_stated_above_the_board_with_their_reason(qtbot) -> None:
    """Productive use: a user whose requirement blocked on a dependency opens the board.
    Expected outcome: the blocked count and each reason are readable without scrolling a column."""
    projection = _board(
        [_requirement("SWR-9201"), _requirement("SWR-9202"), _requirement("SWR-9203")],
        records=[
            _blocked("SWR-9201", "a decision is missing"),
            _blocked("SWR-9202", "SWR-9101 has to land first"),
        ],
    )
    controller, view, _source = _attached(qtbot, projection)

    assert view.blocked_banner.isVisible()
    assert "2 blocked requirements" in view.blocked_heading.text()
    described = view.blocked_banner.accessibleDescription()
    assert "a decision is missing" in described
    assert "SWR-9101 has to land first" in described
    # The banner sits above the columns, so it is reachable without scrolling
    # any of them (SWR-3303).
    assert view.blocked_banner.y() < view.columns_scroll.y()
    # One sentence per requirement: the id labels the row, the heading has
    # already said "blocked", and the engine's words are what is left.
    labels = accessible_names(view.blocked_banner, QLabel)
    assert "SWR-9201 — a decision is missing" in labels
    assert "SWR-9201 — Blocked: a decision is missing" not in labels
    # Stated, not only coloured: the card says it too.
    card = view.card_widgets["SWR-9201"]
    assert isinstance(card, RequirementCardWidget)
    assert any("a decision is missing" in alert for alert in card.card.alerts)
    assert "Blocked" in card.accessibleDescription()
    # Each blocked requirement is reachable straight from the banner, and the
    # banner's first action is the one that addresses the block: a blocked
    # requirement's only legal move is back where it came from (SWR-3201). The
    # second goes to the card, because the banner summarises a column it does not
    # replace.
    buttons = accessible_names(view.blocked_banner, QPushButton)
    assert "Show SWR-9201 in the Blocked column" in buttons
    assert "Return SWR-9201 to Ready" in buttons
    controller.shutdown()


@verifies(SWR.SWR_3303, SWR.SWR_3601)
def test_the_banner_offers_a_blocked_requirement_the_move_that_unblocks_it(qtbot) -> None:
    """Productive use: a requirement blocked by a failed run has to go back into the pipeline.
    Expected outcome: the banner row's own control raises the move the engine allows, so the
    user is not left with an action that only opens the requirement's document."""
    projection = _board(
        [_requirement("SWR-9211")],
        records=[_blocked("SWR-9211", "this workspace has no commit for a run to start from")],
    )
    controller, view, _source = _attached(qtbot, projection)
    moves: list[tuple[str, str, str]] = []
    view.move_requested.connect(lambda req, source, target: moves.append((req, source, target)))

    click_by_name(qtbot, view.blocked_banner, "Return SWR-9211 to Ready", QPushButton)
    settle(qtbot)

    assert moves == [("SWR-9211", "blocked", "ready")]
    controller.shutdown()


@verifies(SWR.SWR_3305)
def test_rings_on_the_board_carry_the_engines_evidence_health(qtbot) -> None:
    """Productive use: a user scans the board for delivered work whose tests fail.
    Expected outcome: each ring's segments are the projection's obligation states, not a count."""
    failing = _requirement("SWR-9301")
    projection = _board(
        [failing, _requirement("SWR-9302")],
        records=[_delivered("SWR-9301", "a-hash")],
        evidence={"SWR-9301": _failing_tests("SWR-9301", failing.current_hash)},
    )
    controller, view, _source = _attached(qtbot, projection)

    entry = projection.entry("SWR-9301")
    card = view.card_widgets["SWR-9301"]
    assert isinstance(card, RequirementCardWidget)
    ring = card.findChild(EvidenceRing)
    assert ring is not None
    assert [segment.state for segment in ring.segments] == [
        str(obligation.state) for obligation in entry.evidence.obligations
    ]
    # Complete traceability with a failing test is not a green ring (§22).
    assert theme.evidence_color("failed") in {arc.color for arc in ring.arcs}
    assert "Test: Failed" in ring.accessibleDescription()
    controller.shutdown()


@verifies(SWR.SWR_3306)
def test_the_ring_opens_the_evidence_and_a_site_reaches_its_file(qtbot) -> None:
    """Productive use: a user clicks a red ring and lands on the failing test.
    Expected outcome: the evidence view opens and the site reports the projection's path and line."""
    failing = _requirement("SWR-9401")
    projection = _board(
        [failing],
        records=[_delivered("SWR-9401", "a-hash")],
        evidence={"SWR-9401": _failing_tests("SWR-9401", failing.current_hash)},
    )
    controller, view, _source = _attached(qtbot, projection)
    card = view.card_widgets["SWR-9401"]
    ring = card.findChild(EvidenceRing)
    assert ring is not None

    qtbot.mouseClick(ring, Qt.MouseButton.LeftButton, pos=ring.rect().center())
    settle(qtbot)

    assert view.page == "evidence"
    assert view.evidence_view.req_id == "SWR-9401"
    with qtbot.waitSignal(view.open_file_requested, timeout=1000) as caught:
        click_by_name(
            qtbot,
            view,
            "Covering test tests/unit/test_thing.py:40 — Failed",
            QPushButton,
        )
    assert caught.args == ["tests/unit/test_thing.py", 40]
    controller.shutdown()


@verifies(SWR.SWR_3307)
def test_opening_a_card_shows_the_detail_the_engine_reports(qtbot) -> None:
    """Productive use: a user opens a requirement from the board to read everything about it.
    Expected outcome: the detail pane shows the source path and hash the projection carries."""
    requirement = _requirement("SWR-9501", parent="SWR-9500")
    projection = _board([_requirement("SWR-9500"), requirement])
    controller, view, _source = _attached(qtbot, projection)
    entry = projection.entry("SWR-9501")

    click_by_name(qtbot, view, "Open SWR-9501", QPushButton)
    settle(qtbot)

    assert view.page == "detail"
    assert view.detail_view.req_id == "SWR-9501"
    names = accessible_names(view.detail_view)
    assert f"Source path: {entry.source_path}" in names
    assert f"Current hash: {entry.current_hash}" in names
    assert "Parent epic SWR-9500" in accessible_names(view.detail_view, QPushButton)
    # …and Escape brings the user back to the board they came from.
    qtbot.keyClick(view, Qt.Key.Key_Escape)
    settle(qtbot)
    assert view.page == "board"
    controller.shutdown()


@verifies(SWR.SWR_3308)
def test_epic_cards_report_the_progress_the_engine_computed_and_filter_the_board(qtbot) -> None:
    """Productive use: a user checks an epic's progress and drills into its children.
    Expected outcome: the engine's progress sentence, the children's counts, and a board reduced to them."""
    children = [_requirement(f"SWR-960{index}", parent="SWR-9600") for index in (1, 2, 3)]
    projection = _board(
        [_requirement("SWR-9600"), *children, _requirement("SWR-9700")],
        records=[_delivered("SWR-9601", "a-hash"), _blocked("SWR-9602", "a decision is missing")],
    )
    controller, view, _source = _attached(qtbot, projection)

    epic_card = view.card_widgets["SWR-9600"]
    assert isinstance(epic_card, EpicCard)
    entry = projection.entry("SWR-9600")
    assert entry.epic is not None
    assert epic_card.card.epic_label == f"{entry.epic.done} of {entry.epic.total} requirements done"
    summary = epic_card.summary
    assert epic_card.card.epic_label in summary
    assert "Done 1" in summary
    assert "1 blocked" in summary
    assert epic_card.delivery_action_area is None

    click_by_name(qtbot, view, "Show the children of SWR-9600", QPushButton)
    settle(qtbot)
    qtbot.waitUntil(lambda: not view.populating, timeout=10000)

    assert view.board_filter.epic == "SWR-9600"
    # The children, plus the epic itself as the context of what is on screen —
    # and nothing from outside the epic.
    assert set(view.card_widgets) == {"SWR-9600", "SWR-9601", "SWR-9602", "SWR-9603"}
    assert "SWR-9700" not in view.card_widgets
    assert "Filtered by epic SWR-9600" in view.filter_summary.text()
    controller.shutdown()


@verifies(SWR.SWR_3304, SWR.SWR_3307)
def test_the_execution_fields_render_when_filled_and_degrade_while_they_are_empty(
    qtbot,
) -> None:
    """Productive use: slice 4 fills the execution fields; until then they are empty.

    Expected outcome: units, runs, branches and commits are rendered when the
    projection carries them, and the same surfaces state their own emptiness
    while it does not — no blank rows either way.
    """
    execution = ExecutionSummary(
        req_id="SWR-9051",
        units=(ExecutionUnitView(unit_id="unit-1", agent="coding-agent"),),
        runs=(
            RunView(
                run_id="run-9",
                unit_id="unit-1",
                outcome=RunOutcome.SUCCEEDED,
                branch="rotaris/req/SWR-9051/unit-1",
                produced_commits=("abc1234",),
                started_at=WHEN,
                finished_at=WHEN + dt.timedelta(minutes=2),
                verified=True,
                verification_detail="every check passed",
            ),
        ),
    )
    projection = _board(
        [_requirement("SWR-9051"), _requirement("SWR-9052")],
        execution={"SWR-9051": execution},
    )
    controller, view, _source = _attached(qtbot, projection)

    filled = view.card_widgets["SWR-9051"]
    assert isinstance(filled, RequirementCardWidget)
    rendered_execution = filled.execution_label.text()
    assert rendered_execution.startswith("1 execution unit · Last run ")
    assert rendered_execution.endswith("(Succeeded)")
    assert filled.card.unit_count == 1

    empty = view.card_widgets["SWR-9052"]
    assert isinstance(empty, RequirementCardWidget)
    assert empty.execution_label.text() == "No execution units yet · Never run"

    click_by_name(qtbot, view, "Open SWR-9051", QPushButton)
    settle(qtbot)
    section = view.detail_view.section_widget("execution")
    assert section is not None
    rendered = section.accessibleDescription()
    assert "Branches: rotaris/req/SWR-9051/unit-1" in rendered
    assert "Commits: abc1234" in rendered
    assert "unit-1" in rendered
    assert "run-9" in rendered

    view.show_board()
    click_by_name(qtbot, view, "Open SWR-9052", QPushButton)
    settle(qtbot)
    empty_section = view.detail_view.section_widget("execution")
    assert empty_section is not None
    assert empty_section.accessibleDescription() == "Nothing has run for this requirement yet."
    controller.shutdown()


@pytest.mark.unit
@verifies(SWR.SWR_3309)
def test_the_board_sorts_by_priority_then_id_and_puts_no_priority_last() -> None:
    """Productive use: a user opens a board of mixed priorities.
    Expected outcome: Critical first, then High, Normal, Low — and the unprioritised after Low."""
    projection = _board(
        [_requirement(f"SWR-97{index:02d}") for index in (1, 2, 3, 4, 10)],
        priorities={
            "SWR-9702": RequirementPriority.LOW,
            "SWR-9703": RequirementPriority.CRITICAL,
            "SWR-9704": RequirementPriority.NORMAL,
            "SWR-9710": RequirementPriority.HIGH,
        },
    )
    state = build_board_state(projection, now=NOW)

    ordered = sort_cards(state.cards, "priority")

    assert [card.req_id for card in ordered] == [
        "SWR-9703",  # Critical
        "SWR-9710",  # High
        "SWR-9704",  # Normal
        "SWR-9702",  # Low
        "SWR-9701",  # none at all, after Low rather than anywhere
    ]
    # Sorting by id is numeric, so SWR-9710 does not sort before SWR-9702.
    assert [card.req_id for card in sort_cards(state.cards, "id")] == [
        "SWR-9701",
        "SWR-9702",
        "SWR-9703",
        "SWR-9704",
        "SWR-9710",
    ]


@pytest.mark.unit
@verifies(SWR.SWR_3309)
def test_every_filter_dimension_selects_and_free_text_matches_id_and_title() -> None:
    """Productive use: a user narrows four hundred requirements to the ones they own.
    Expected outcome: each dimension filters, and an impossible filter selects nothing."""
    epic = _requirement("SWR-9800")
    filtered = _requirement("SWR-9801", "The board filters", parent="SWR-9800")
    drafted = _requirement("SWR-9802", "A drafted one", parent="SWR-9800")
    projection = _board(
        [epic, filtered, drafted],
        records=[_delivered("SWR-9801", "a-hash")],
        evidence={"SWR-9801": _failing_tests("SWR-9801", filtered.current_hash)},
        priorities={"SWR-9801": RequirementPriority.CRITICAL},
    )
    state = build_board_state(projection, now=NOW)

    def ids(board_filter: BoardFilter) -> list[str]:
        return [card.req_id for card in visible_cards(state, board_filter, "priority")]

    assert ids(BoardFilter()) == ["SWR-9801", "SWR-9800", "SWR-9802"]
    assert ids(BoardFilter(text="board filters")) == ["SWR-9801"]
    assert ids(BoardFilter(text="swr-9802")) == ["SWR-9802"]
    assert ids(BoardFilter(epic="SWR-9800")) == ["SWR-9801", "SWR-9800", "SWR-9802"]
    assert ids(BoardFilter(priority="Critical")) == ["SWR-9801"]
    assert ids(BoardFilter(lifecycle="Approved")) == ["SWR-9801", "SWR-9800", "SWR-9802"]
    failing_health = state.card("SWR-9801").health_label
    assert failing_health != state.card("SWR-9802").health_label
    assert ids(BoardFilter(health=failing_health)) == ["SWR-9801"]
    assert ids(BoardFilter(text="nothing matches this")) == []
    assert BoardFilter().active is False
    assert BoardFilter(priority="Critical").active is True
    assert "priority Critical" in BoardFilter(priority="Critical").description


@pytest.mark.unit
@verifies(SWR.SWR_3309)
def test_the_source_dimension_selects_the_requirements_of_one_source() -> None:
    """Productive use: a project reads its requirements from two sources at once.
    Expected outcome: the source filter selects the cards of one of them and no other.

    Over cards carrying the ``Source`` fact directly: the board projection's card
    (`rotaris.models.requirements_state.build_card`) does not yet put
    ``source_id`` on a card, so a board over this repository's single-source
    store offers only "Any source". The filter dimension itself is the same code
    path as every other one.
    """
    cards = tuple(
        RequirementCard(
            req_id=req_id,
            title=f"{req_id} title",
            lifecycle="approved",
            lifecycle_label="Approved",
            delivery="backlog",
            delivery_label="Backlog",
            health="healthy",
            health_label="Healthy",
            evidence_state="satisfied",
            facts=(RequirementFact(label="Source", value=source),),
        )
        for req_id, source in (("SWR-9871", "reqtocode"), ("SWR-9872", "specs"))
    )
    state = RequirementsBoardState(cards=cards, available=True)

    selected = visible_cards(state, BoardFilter(source="specs"), "id")

    assert [card.req_id for card in selected] == ["SWR-9872"]
    assert len(visible_cards(state, BoardFilter(), "id")) == 2
    assert visible_cards(state, BoardFilter(source="jira"), "id") == ()


@verifies(SWR.SWR_3309)
def test_a_filter_that_matches_nothing_says_so_and_offers_to_clear_itself(qtbot) -> None:
    """Productive use: a user searches for a requirement that is not on this board.
    Expected outcome: the board states the active filter and offers one action to drop it."""
    projection = _board([_requirement("SWR-9901"), _requirement("SWR-9902")])
    controller, view, _source = _attached(qtbot, projection)

    view.set_filter(BoardFilter(text="nothing matches this"))
    settle(qtbot)

    assert view.card_widgets == {}
    assert view.empty_state.isVisible()
    assert "No requirement matches this filter" in view.empty_state.title_label.text()
    assert 'text "nothing matches this"' in view.empty_state.description_label.text()

    click_by_name(qtbot, view, "Clear the board filter", QPushButton)
    settle(qtbot)
    qtbot.waitUntil(lambda: not view.populating, timeout=10000)

    assert view.board_filter.active is False
    assert set(view.card_widgets) == {"SWR-9901", "SWR-9902"}
    assert view.empty_state.isVisible() is False
    controller.shutdown()


@verifies(SWR.SWR_3309)
def test_filter_and_sort_selections_survive_the_next_construction(qtbot) -> None:
    """Productive use: a user filters to their epic, closes Rotaris and opens it again.
    Expected outcome: the same filter and order are restored from the desktop's own settings."""
    projection = _board([_requirement("SWR-9950", parent="SWR-9940"), _requirement("SWR-9940")])
    controller, view, _source = _attached(qtbot, projection)

    view.set_filter(BoardFilter(epic="SWR-9940", priority="Critical"))
    view.set_sort_order("id")
    settle(qtbot)

    stored = load_board_preferences()
    stored_filter = stored.filter
    assert stored_filter.epic == "SWR-9940"
    assert stored_filter.priority == "Critical"
    assert stored.order == "id"
    assert stored.blocked_column is True

    restored = RequirementsView()
    qtbot.addWidget(restored)
    assert restored.board_filter == stored_filter
    assert restored.sort_order == "id"
    assert restored.filter_summary.text() == stored_filter.description
    controller.shutdown()


@verifies(SWR.SWR_3312, SWR.SWR_3317)
def test_a_re_evaluation_repaints_the_board_and_keeps_selection_and_scroll(qtbot) -> None:
    """Productive use: a colleague commits while the user is reading the board.

    Expected outcome: the cards on screen are repainted in place — the very same
    widgets — and the selection and the column's scroll position are exactly
    where the user left them.

    The requirement it was scrolled *away* from has no widget at all after
    SWR-3317, so it is asked for by name and carries the new text when it
    arrives. That is the honest form of "repainted, not rebuilt": a widget the
    user cannot see is not a thing this board keeps.
    """
    projection = _board([_requirement(f"SWR-95{index:02d}") for index in range(1, 12)])
    controller, view, source = _attached(qtbot, projection)
    view.reveal("SWR-9502")
    view.card_widgets["SWR-9502"].setFocus()
    settle(qtbot)
    column = view.column_widget("backlog")
    assert column is not None
    column.card_scroll.verticalScrollBar().setValue(
        column.card_scroll.verticalScrollBar().maximum(),
    )
    settle(qtbot)
    offset = view.column_offset("backlog")
    onscreen = dict(view.card_widgets)
    assert onscreen, "the column scrolled to a band with no cards in it"

    source.projection = _board(
        [
            _requirement("SWR-9502", "a rewritten title")
            if index == 2
            else _requirement(f"SWR-95{index:02d}")
            for index in range(1, 12)
        ],
    )
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=20000):
        controller.refresh()
    settle(qtbot)

    for req_id, widget in onscreen.items():
        assert view.card_widgets[req_id] is widget, "the board was rebuilt instead of repainted"
    assert view.selected_req_id == "SWR-9502"
    assert view.column_offset("backlog") == offset
    # The changed requirement is off screen; asked for, it arrives with the new
    # text rather than with the one the board was showing before the commit.
    revealed = view.reveal("SWR-9502")
    assert revealed is not None
    assert revealed.card.title == "a rewritten title"
    controller.shutdown()


@verifies(SWR.SWR_3301, SWR.SWR_3302, SWR.SWR_3321)
def test_the_board_is_usable_at_the_supported_minimum_window_size(qtbot) -> None:
    """Productive use: a user runs Rotaris in a 1000×680 window and opens Requirements.
    Expected outcome: nothing clips, the columns scroll instead, and the window minimum has not grown."""
    projection = _board(
        [_requirement(f"SWR-94{index:02d}") for index in range(1, 8)],
        records=[_blocked("SWR-9401", "a decision is missing")],
    )
    store = WorkspaceStore()
    window = MainWindow(store)
    qtbot.addWidget(window)
    view = RequirementsView()
    window.requirements_controller.attach_view(view)
    window.resize(1000, 680)
    window.show()
    qtbot.waitExposed(window)
    window.show_view("requirements")
    state = build_board_state(projection, now=NOW)
    state = replace(state, unanalysed=("SWR-9999",))
    # Published the way an evaluation publishes it, so the controller shows the
    # area and the board renders the same state.
    store.set_requirements(state)
    view.set_board(state)
    qtbot.waitUntil(lambda: not view.populating, timeout=20000)
    settle(qtbot)

    # The documented minimum window size, unchanged by the new view.
    assert window.minimumSize() == QSize(1000, 680)
    # …and the view itself fits inside what the window gives it, in both axes,
    # with the filter row open — its widest state.
    click_by_name(qtbot, view, "Show filters", QPushButton)
    settle(qtbot)
    assert view.minimumSizeHint().width() <= view.width(), "the board is wider than its pane"
    assert view.minimumSizeHint().height() <= view.height(), "the board is taller than its pane"
    assert view.filter_row.minimumSizeHint().width() <= view.width(), "the filter row clips"

    # Every control above the board is inside the view, not pushed off it.
    for name in ("Search requirements", "Clear filters", "Verify requirements"):
        control = find_by_accessible_name(view, name, visible_only=True)
        assert control.width() > 0 and control.height() > 0
        geometry = control.geometry().translated(
            control.mapTo(view, control.rect().topLeft()) - control.geometry().topLeft(),
        )
        assert view.rect().contains(geometry), f"{name} is cut off at 1000×680"

    # No card clips inside its column: the column is wider than the widest card.
    for column in view.columns:
        widget = view.column_widget(column.key)
        assert widget is not None
        assert widget.width() >= widget.minimumSizeHint().width(), f"{column.key} is clipped"
        for req_id in column.card_ids:
            card = view.card_widgets[req_id]
            assert card.width() <= widget.card_scroll.viewport().width(), (
                f"{req_id} is wider than the {column.key} column"
            )

    # The row of columns scrolls horizontally rather than clipping, and the last
    # column can actually be reached (SWR-3302). Measured with every column
    # open, which is the widest the board gets: folding an empty column is what
    # makes seven of them fit (SWR-3321), and the guarantee under test here is
    # the one that has to hold when nothing is folded.
    for column in view.columns:
        view.set_column_folded(column.key, folded=False)
    settle(qtbot)
    holder = view.columns_scroll.widget()
    viewport = view.columns_scroll.viewport()
    assert holder.width() > viewport.width(), "seven open columns fit in 1000px — check the test"
    bar = view.columns_scroll.horizontalScrollBar()
    assert bar.maximum() > 0, "the columns clip instead of scrolling"
    bar.setValue(bar.maximum())
    settle(qtbot)
    last = view.column_widget(view.columns[-1].key)
    assert last is not None
    assert last.visibleRegion().boundingRect().width() > 0, "the last column cannot be reached"
    # The blocked strip stays where it is: reachable without scrolling a column.
    assert view.blocked_banner.isVisible()
    assert view.blocked_banner.height() > 0

    # Folded, the same columns fit the supported window with room to spare, and
    # a rail is never narrower than the turned text it has to draw (SWR-3321).
    for column in view.columns:
        view.set_column_folded(column.key, folded=True)
    settle(qtbot)
    assert holder.width() <= viewport.width(), "folding the whole board still does not fit"
    for column in view.columns:
        rail = view.column_widget(column.key)
        assert rail is not None
        assert rail.width() >= rail.rail.minimumSizeHint().width(), f"{column.key} rail clips"


@pytest.mark.e2e
@verifies(SWR.SWR_3301, SWR.SWR_3302, SWR.SWR_3309, SWR.SWR_3316)
def test_a_user_opens_requirements_from_the_rail_and_narrows_the_board(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a user clicks Requirements in the rail, reads the board and narrows it.

    Driven through the window a user sees, over a requirement store on disk: the
    nav rail, the real controller, the real bridge, the real engine. The only
    thing this test supplies is the workspace.

    It used to supply one more thing — the board itself, attached by hand — and
    that is exactly what hid SWR-3316 for a whole epic: a shipped Rotaris had
    nobody to make that call, so it opened this view on the controller's status
    surface and nothing else. The board is taken from the controller here, so a
    composition root that stops installing one fails this test rather than
    passing it with a stand-in the product never builds.
    """
    store_dir = tmp_path / "docs" / "requirements"
    store_dir.mkdir(parents=True)
    for req_id, title in (
        ("SWR-0101", "The board shows requirements"),
        ("SWR-0102", "The board can be filtered"),
        ("SWR-0103", "The board scrolls"),
    ):
        (store_dir / f"{req_id}-example.md").write_text(
            "---\n"
            f"req-id: {req_id}\n"
            "status: approved\n"
            "trace: required\n"
            "test: required\n"
            f'title: "{title}"\n'
            "date: 2026-08-14\n"
            "---\n\n"
            f"# {req_id} — {title}\n\n"
            "The product does the thing.\n",
            encoding="utf-8",
        )

    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service._providers = lambda: []  # type: ignore[method-assign]
    service._subscription_limits = lambda: []  # type: ignore[method-assign]
    service.load()
    window = MainWindow(store, config_service=service)
    qtbot.addWidget(window)
    controller = window.requirements_controller
    # Nobody attaches a board: the area installs its own (SWR-3316). Before the
    # click there is none, because a window constructor must not build one.
    assert controller.view is None, "the window built a board it was never asked for"
    window.resize(1000, 680)
    window.show()
    qtbot.waitExposed(window)

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=30000):
        click_by_name(qtbot, window.nav, "Open Requirements", QToolButton)
    settle(qtbot)
    view = controller.view
    assert isinstance(view, RequirementsView), "opening Requirements did not install a board"
    qtbot.waitUntil(lambda: not view.populating, timeout=30000)

    assert store.ui.active_view == "requirements"
    assert window.stack.currentWidget() is controller.surface
    assert set(view.card_widgets) == {"SWR-0101", "SWR-0102", "SWR-0103"}
    backlog = view.column_widget("backlog")
    assert backlog is not None
    assert backlog.header.text() == "Backlog · 3"

    search = find_by_accessible_name(view, "Search requirements", visible_only=True)
    search.setFocus()
    qtbot.keyClicks(search, "filtered")
    settle(qtbot)
    qtbot.waitUntil(lambda: not view.populating, timeout=30000)
    assert set(view.card_widgets) == {"SWR-0102"}
    assert 'text "filtered"' in view.filter_summary.text()
    assert view.filter_summary.isVisible(), "a filtered board has to say what it is filtered by"

    click_by_name(qtbot, view, "Clear filters", QPushButton)
    settle(qtbot)
    qtbot.waitUntil(lambda: not view.populating, timeout=30000)
    assert set(view.card_widgets) == {"SWR-0101", "SWR-0102", "SWR-0103"}
    # …and an unfiltered one says nothing at all, rather than spending a whole row
    # on "No filter" above a Clear button greyed out for the same reason.
    assert view.filter_summary.text() == ""
    assert not view.filter_summary.isVisible()
    controller.shutdown()


@pytest.mark.e2e
@verifies(SWR.SWR_3317, SWR.SWR_3302)
def test_a_user_opens_a_board_of_a_thousand_requirements_and_searches_it(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a user opens Requirements on a real, large project.

    Expected outcome: the board comes up over a thousand requirements, holds a
    card widget only for what is on screen, and a search narrows it — all
    through the window a user sees, over a requirement store on disk.

    The numbers this exists for were measured against this repository's own
    store of 1494 requirements. Before SWR-3317 the first paint took 84 seconds
    on the Qt thread and every single keystroke in the search box took another
    66–74; after it the paint is 0.03 seconds and a keystroke 0.03–0.11 plus the
    debounce. This test asserts the shape of that — bounded widgets, one
    recompute per pause — rather than a wall clock, which would be a flake.
    """
    store_dir = tmp_path / "docs" / "requirements"
    store_dir.mkdir(parents=True)
    total = 1000
    for index in range(total):
        req_id = f"SWR-{1000 + index}"
        # Two thirds are "the board", one third "the queue": enough of a
        # difference for a search to have something to narrow to.
        subject = "board" if index % 3 else "queue"
        (store_dir / f"{req_id}-example.md").write_text(
            "---\n"
            f"req-id: {req_id}\n"
            "status: approved\n"
            "trace: optional\n"
            "test: optional\n"
            f'title: "The {subject} does thing {index}"\n'
            "date: 2026-08-15\n"
            "---\n\n"
            f"# {req_id} — The {subject} does thing {index}\n\n"
            "The product does the thing.\n",
            encoding="utf-8",
        )

    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service._providers = lambda: []  # type: ignore[method-assign]
    service._subscription_limits = lambda: []  # type: ignore[method-assign]
    service.load()
    window = MainWindow(store, config_service=service)
    qtbot.addWidget(window)
    controller = window.requirements_controller
    window.resize(1000, 680)
    window.show()
    qtbot.waitExposed(window)

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=180000):
        click_by_name(qtbot, window.nav, "Open Requirements", QToolButton)
    settle(qtbot)
    view = controller.view
    assert isinstance(view, RequirementsView)
    qtbot.waitUntil(lambda: not view.populating, timeout=30000)

    assert len(store.requirements.cards) == total
    assert sum(column.count for column in view.columns) == total
    realised = len(view.card_widgets)
    assert 0 < realised * 10 < total, f"the board realised {realised} of {total} cards"
    assert view.pending_count == total - realised

    # The user types. The board recomputes when they stop, not per character.
    search = find_by_accessible_name(view, "Search requirements", visible_only=True)
    search.setFocus()
    qtbot.keyClicks(search, "queue")
    assert view.populating is True, "the search box applied a filter mid-word"
    qtbot.waitUntil(lambda: not view.populating, timeout=30000)
    settle(qtbot)

    matching = sum(column.count for column in view.columns)
    assert matching == len([index for index in range(total) if index % 3 == 0])
    assert 'text "queue"' in view.filter_summary.text()
    assert len(view.card_widgets) * 4 < matching
    # …and every card still on screen is one the search actually matched.
    for widget in view.card_widgets.values():
        assert "queue" in widget.card.title.casefold()
    controller.shutdown()


# ── the area composes itself (SWR-3316) ────────────────────────────────────


@pytest.mark.unit
@verifies(SWR.SWR_3316)
def test_the_area_installs_its_own_board_and_keeps_one_a_caller_attached(qtbot) -> None:
    """Productive use: a composition root constructs the area and nothing else.
    Expected outcome: opening it yields a board, and a caller that brought its
    own keeps it."""
    controller = RequirementsController(WorkspaceStore(), clock=lambda: NOW)
    qtbot.addWidget(controller.surface)

    # Constructing costs nothing: no board, and no read of a requirement store.
    assert controller.view is None

    assert controller.install_board() is True
    installed = controller.view
    assert isinstance(installed, RequirementsView)
    # …and it is wired, not merely parented.
    assert controller.connected_signals == tuple(
        name for name, _ in RequirementsController.VIEW_SIGNALS
    )

    # Idempotent: a second call neither builds nor replaces.
    assert controller.install_board() is False
    assert controller.view is installed

    # Deferential: a caller's own view survives, because installing checks first.
    own = RequirementsView()
    controller.attach_view(own)
    assert controller.install_board() is False
    assert controller.view is own
    controller.shutdown()


@pytest.mark.unit
@verifies(SWR.SWR_3316, SWR.SWR_3315)
def test_the_panes_are_built_on_first_use_and_never_twice(qtbot, tmp_path: Path) -> None:
    """Productive use: a user opens a board and never opens the editor.
    Expected outcome: nothing built the editor — and the first use does, once."""
    store_dir = tmp_path / "docs" / "requirements"
    store_dir.mkdir(parents=True)
    (store_dir / "SWR-0201-example.md").write_text(
        "---\nreq-id: SWR-0201\nstatus: approved\ntrace: required\ntest: required\n"
        'title: "Editable"\ndate: 2026-08-15\n---\n\n'
        "# SWR-0201 — Editable\n\nThe product does it.\n",
        encoding="utf-8",
    )
    controller = RequirementsController(WorkspaceStore(), workspace=tmp_path, clock=lambda: NOW)
    qtbot.addWidget(controller.surface)
    controller.install_board()
    view = controller.view
    assert isinstance(view, RequirementsView)

    # A board that is only read pays for nothing else — the trade the review's
    # own docstring states, and the one SWR-3316 keeps.
    assert "editor" not in view.panes
    assert "blockers" not in view.panes

    assert controller.install_editor() is True
    assert "editor" in view.panes and "create" in view.panes
    assert controller.install_editor() is False, "a second use reuses the surface"

    assert controller.install_blockers() is True
    assert "blockers" in view.panes
    assert controller.install_blockers() is False
    controller.shutdown()


@pytest.mark.unit
@verifies(SWR.SWR_3316)
def test_a_workspace_with_no_writable_store_gets_a_board_and_no_editor(qtbot) -> None:
    """Productive use: a project Rotaris can read but not write opens the board.
    Expected outcome: the board is there and the editor is not — an offered save
    that cannot happen is worse than no offer (SWR-3602)."""
    controller = RequirementsController(WorkspaceStore(), clock=lambda: NOW)
    qtbot.addWidget(controller.surface)
    controller.install_board()

    assert controller.editing is None
    assert controller.install_editor() is False
    view = controller.view
    assert isinstance(view, RequirementsView)
    assert "editor" not in view.panes
    controller.shutdown()


@pytest.mark.integration
@verifies(SWR.SWR_3316, SWR.SWR_3302)
def test_every_surface_the_area_installs_fits_the_supported_window(qtbot, tmp_path: Path) -> None:
    """Productive use: a user on a 1000×680 screen opens the queue, then the board.
    Expected outcome: neither clips — the panes share one stack, so a pane wider
    than the window makes the *board* unusable too."""
    store_dir = tmp_path / "docs" / "requirements"
    store_dir.mkdir(parents=True)
    (store_dir / "SWR-0301-example.md").write_text(
        "---\nreq-id: SWR-0301\nstatus: approved\ntrace: required\ntest: required\n"
        'title: "Sized"\ndate: 2026-08-15\n---\n\n# SWR-0301 — Sized\n\nThe product does it.\n',
        encoding="utf-8",
    )
    controller = RequirementsController(WorkspaceStore(), workspace=tmp_path, clock=lambda: NOW)
    qtbot.addWidget(controller.surface)
    controller.install_board()
    view = controller.view
    assert isinstance(view, RequirementsView)
    for install in (
        controller.install_queue,
        controller.install_editor,
        controller.install_blockers,
    ):
        install()
    controller.surface.resize(1000, 680)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    # Evaluated, because the area only shows the board once it has one — a
    # hidden view is given no width and would make this assertion meaningless.
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=30000):
        controller.refresh()
    qtbot.waitUntil(lambda: not view.populating, timeout=30000)
    settle(qtbot)

    # The board's pane is what the window actually gives the view; every page in
    # the stack has to live inside it, because the stack is sized by its widest.
    assert view.isVisible()
    assert view.minimumSizeHint().width() <= view.width(), (
        f"an installed pane is wider than the area: {view.minimumSizeHint().width()}"
        f" > {view.width()}"
    )
    controller.shutdown()


# ── grouping the board by an axis (SWR-3318) ───────────────────────────────


def _mixed_board() -> BoardProjection:
    """A store whose delivery axis is degenerate and whose health axis is not.

    Exactly the shape of a project on the day it adopts Rotaris: nothing was ever
    delivered, so every card is Backlog, while the repository already knows which
    requirements are traced and tested and which are not.
    """
    return _board(
        [
            _requirement("SWR-9801"),
            _requirement("SWR-9802"),
            _requirement("SWR-9803", lifecycle=RequirementLifecycle.DEPRECATED),
        ],
        evidence={
            "SWR-9801": EvidenceInputs(
                req_id="SWR-9801",
                implementations=(RequirementSite(path="src/a.py", line=1),),
                covering_tests=(
                    CoveringTest(
                        path="tests/test_a.py",
                        line=2,
                        executed=True,
                        check_status="passed",
                    ),
                ),
            ),
        },
    )


@verifies(SWR.SWR_3318)
def test_the_delivery_axis_is_what_a_board_opens_on(qtbot) -> None:
    """Productive use: a user opens Requirements without ever having changed anything.
    Expected outcome: the columns are the delivery states, exactly as SWR-3302 says."""
    controller, view, _source = _attached(qtbot, _mixed_board())

    assert view.axis == DEFAULT_BOARD_AXIS
    assert [column.key for column in view.columns][-6:] == list(COLUMN_ORDER)
    controller.shutdown()


@verifies(SWR.SWR_3318)
def test_grouping_by_health_distributes_a_board_that_is_all_backlog(qtbot) -> None:
    """Productive use: every requirement sits in Backlog, which answers nothing. The user
    groups by health instead.
    Expected outcome: the same cards, spread over what the repository actually knows —
    and not one delivery record written to get there."""
    controller, view, _source = _attached(qtbot, _mixed_board())
    delivery_columns = {column.key: column.count for column in view.columns}
    assert delivery_columns["backlog"] == 3

    view.set_axis("health")
    settle(qtbot)

    grouped = {column.key: column.count for column in view.columns if column.count}
    assert sum(grouped.values()) == 3
    # The point of the axis: one column became several, without a single write.
    assert len(grouped) > 1
    assert "deprecated" in grouped
    controller.shutdown()


@verifies(SWR.SWR_3318)
@pytest.mark.parametrize("axis", [grouping.key for grouping in board_groupings()])
def test_every_card_lands_in_exactly_one_column_on_every_axis(qtbot, axis: str) -> None:
    """Productive use: a user tries each grouping in turn.
    Expected outcome: no axis loses a card and none shows one twice."""
    controller, view, _source = _attached(qtbot, _mixed_board())

    view.set_axis(axis)
    settle(qtbot)

    placed = [req_id for column in view.columns for req_id in column.card_ids]
    assert sorted(placed) == ["SWR-9801", "SWR-9802", "SWR-9803"]
    assert len(placed) == len(set(placed))
    controller.shutdown()


@verifies(SWR.SWR_3318, SWR.SWR_3311)
@pytest.mark.parametrize("axis", [grouping.key for grouping in board_groupings()])
def test_the_board_groups_a_card_exactly_where_the_engine_would(axis: str) -> None:
    """Productive use: the desktop groups cards; the engine groups entries.
    Expected outcome: the two agree card by card, so switching an axis can never move a
    requirement somewhere the projection would not have put it (SWR-3311)."""
    projection = _mixed_board()
    state = build_board_state(projection)
    engine_axis = BoardAxis(axis)

    for card in state.cards:
        entry = projection.entry(card.req_id)
        assert entry is not None
        assert card_axis_value(card, axis) == entry.axis_value(engine_axis)


@verifies(SWR.SWR_3318)
def test_switching_the_axis_writes_no_delivery_record(qtbot, tmp_path) -> None:
    """Productive use: a user looks at their project through three different lenses.
    Expected outcome: grouping is display only — the delivery store stays untouched."""
    controller, view, _source = _attached(qtbot, _mixed_board())
    store = DeliveryStore(tmp_path)

    for axis in ("health", "lifecycle", "priority", DEFAULT_BOARD_AXIS):
        view.set_axis(axis)
        settle(qtbot)

    assert list(tmp_path.rglob("*.json")) == []
    assert store.load("SWR-9801").record.delivery.pristine
    controller.shutdown()


@verifies(SWR.SWR_3318)
def test_a_card_is_not_draggable_when_the_columns_are_not_delivery_states(qtbot) -> None:
    """Productive use: a user grouped by health tries to drag a card into "Healthy".
    Expected outcome: no drag starts — health is derived, so the drop could not be
    honoured — and the board says so rather than letting the gesture look available."""
    controller, view, _source = _attached(qtbot, _mixed_board())

    view.set_axis("health")
    settle(qtbot)

    assert not grouping_for("health").draggable
    assert grouping_for(DEFAULT_BOARD_AXIS).draggable
    assert "drag disabled" in view.filter_summary.text()
    controller.shutdown()


@verifies(SWR.SWR_3318)
def test_an_empty_column_says_what_belongs_there_on_every_axis(qtbot) -> None:
    """Productive use: a user groups by lifecycle in a project with no deprecated ids.
    Expected outcome: the empty column explains itself instead of being a blank gap."""
    controller, view, _source = _attached(qtbot, _mixed_board())

    view.set_axis("lifecycle")
    settle(qtbot)

    empty = [column for column in view.columns if not column.count]
    assert empty, "the crafted board has no deprecated requirement, so a column is empty"
    assert all(column.empty_message for column in empty)
    controller.shutdown()


@verifies(SWR.SWR_3318)
def test_the_chosen_axis_survives_the_next_construction(qtbot) -> None:
    """Productive use: a user groups by health, closes Rotaris and opens it again.
    Expected outcome: the board comes back grouped the way they left it."""
    controller, view, _source = _attached(qtbot, _mixed_board())

    view.set_axis("health")
    settle(qtbot)
    assert load_board_preferences().axis == "health"

    restored = RequirementsView()
    qtbot.addWidget(restored)
    assert restored.axis == "health"
    controller.shutdown()


@verifies(SWR.SWR_3318)
def test_an_axis_this_build_no_longer_offers_falls_back_to_delivery() -> None:
    """Productive use: a settings file written by a later build names an axis this one
    does not have.
    Expected outcome: the board opens on delivery state rather than failing to draw."""
    assert grouping_for("nonsense-axis").key == DEFAULT_BOARD_AXIS
    assert grouping_for("").key == DEFAULT_BOARD_AXIS


# ── SWR-3319: what a refresh may cost, said out loud ───────────────────────


class _StagedSource(_RecordingSource):
    """A board source with the write half, recording what each pass was allowed.

    The seam the split exists for: a source that satisfies ``BoardEvaluation`` as
    well as ``BoardSource`` is asked to evaluate, and it records the depth and the
    token it was handed — so "which trigger may reach a model" is asserted on the
    call itself rather than on a mock of one.
    """

    def __init__(self, projection: BoardProjection) -> None:
        super().__init__(projection)
        self.depths: list[object] = []
        self.tokens: list[object] = []
        self.outcome_unanalysed: tuple[str, ...] = ()
        self.analysis_enabled = True
        #: When set, ``evaluate`` waits here until it is cancelled — the only way
        #: to hold a pass open long enough for a stop to be a real gesture.
        self.block_until_cancelled = False

    def evaluate(self, *, depth=None, cancel=None):  # noqa: ANN001, ANN204
        from rotaris.services.requirements_bridge import EvaluationOutcome

        self.depths.append(depth)
        self.tokens.append(cancel)
        cancelled = False
        if self.block_until_cancelled and cancel is not None:
            # Long enough that a pass nobody stopped outlives any waiting test:
            # a shorter ceiling would let "gave up on its own" pass for "was
            # stopped", which is the one thing these tests are here to tell apart.
            deadline = time.monotonic() + 60
            while not cancel.cancelled and time.monotonic() < deadline:
                time.sleep(0.005)
            cancelled = cancel.cancelled
        return EvaluationOutcome(
            moves=("a card moved",),
            cancelled=cancelled,
            unanalysed=self.outcome_unanalysed,
            analysis_enabled=self.analysis_enabled,
        )


def _idle(qtbot, controller: RequirementsController) -> None:
    """Wait for the bridge to stop being busy before starting another pass.

    ``evaluated`` is emitted from the worker's *result*, which reaches this
    thread while the worker's thread may still be winding down — and a refresh is
    refused outright while one is in flight, so a second pass issued on that
    signal alone is a race. It is decided by how fast the platform tears a thread
    down: it holds on Linux and does not on Windows, which is where it surfaced.

    Every test here that runs two passes waits on this. Deliberately in the tests
    rather than papered over in the bridge: refusing a second pass mid-flight is
    the documented guarantee — a board is never assembled from two evaluations at
    once — and the caller that must not lose an event already handles it, by
    re-arming a timer (``_evaluation_due``).
    """
    qtbot.waitUntil(lambda: not controller.bridge.busy, timeout=5000)
    settle(qtbot)


def _staged(qtbot, *, projection: BoardProjection | None = None):  # noqa: ANN202
    """A controller over a source that records every pass's depth, and its store."""
    source = _StagedSource(
        projection if projection is not None else _board([_requirement("SWR-2100")]),
    )
    store = WorkspaceStore()
    controller = RequirementsController(store, source=source, clock=lambda: NOW)
    qtbot.addWidget(controller.surface)
    return controller, source, store


@verifies(SWR.SWR_3319, SWR.SWR_3503)
def test_a_refresh_a_user_asked_for_reaches_no_analyst(qtbot) -> None:
    """Productive use: somebody presses Re-evaluate to see the board catch up with an
    edit they just made.
    Expected outcome: the rules run and the card moves, and nothing waits on a provider.
    Before the kinds existed this same press could sit inside four model calls with no
    state saying so and no way out."""
    controller, source, store = _staged(qtbot)

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    assert source.depths == [EvaluationDepth.RULES_ONLY], (
        "the manual refresh asked the engine for the cheap pass"
    )
    assert source.tokens == [None], "and carried no token, because there is nothing to stop"
    controller.shutdown()


@verifies(SWR.SWR_3319, SWR.SWR_3503)
def test_asking_for_the_judgement_is_what_reaches_the_analyst(qtbot) -> None:
    """The other half: the cost is available, it is simply no longer implicit."""
    controller, source, store = _staged(qtbot)

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.analyse()
    settle(qtbot)

    assert source.depths == [EvaluationDepth.FULL], "every rule, including the analyses"
    assert source.tokens[0] is not None, "and a token, because this one is worth stopping"
    controller.shutdown()


@verifies(SWR.SWR_3319)
def test_the_expensive_pass_says_it_is_running_and_the_cheap_one_does_not(qtbot) -> None:
    """Productive use: a user watches the status line during each kind of refresh.
    Expected outcome: only the pass that may take minutes claims the analysing state.
    Both are busy — that is what `loading` has always meant — and spelling both as
    "Evaluating requirements…" is exactly what left a provider wait indistinguishable
    from a file read."""
    controller, source, store = _staged(qtbot)
    analysing: list[bool] = []
    busy: list[bool] = []
    controller.bridge.analysing_changed.connect(analysing.append)
    controller.bridge.busy_changed.connect(busy.append)

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    # The end of a pass rides `QThread.finished`, which lands after the board
    # does — so the wait is on the record, never on a repaint having settled.
    qtbot.waitUntil(lambda: busy == [True, False], timeout=5000)
    assert analysing == [], "a cheap pass never claims the analysing state"

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.analyse()
    qtbot.waitUntil(lambda: analysing == [True, False], timeout=5000)
    assert busy == [True, False, True, False], "both passes were busy; only one analysed"
    assert store.requirements.analysing is False
    del source
    controller.shutdown()


@verifies(SWR.SWR_3319, SWR.SWR_3519)
def test_stopping_an_analysis_still_lands_a_board(qtbot) -> None:
    """Productive use: an analysis has been thinking for a minute and the user gives up.
    Expected outcome: the pass stops and the board still arrives. A stop is the
    difference between waiting and not waiting for the remaining judgements — never
    between a board and no board (SWR-3519)."""
    controller, source, store = _staged(qtbot)
    source.block_until_cancelled = True

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=10000):
        controller.analyse()
        qtbot.waitUntil(lambda: controller.bridge.analysing, timeout=5000)
        assert controller.cancel_analysis() is True
    settle(qtbot)

    assert source.calls == 1, "the projection ran after the stop, not instead of it"
    assert store.requirements.available, "and the board landed"
    qtbot.waitUntil(lambda: not controller.bridge.analysing, timeout=5000)
    assert source.tokens[-1].cancelled, "the stop reached the pass rather than merely returning"
    assert store.requirements.analysing is False
    controller.shutdown()


@verifies(SWR.SWR_3319)
def test_there_is_nothing_to_stop_when_nothing_is_analysing(qtbot) -> None:
    """A control that claims to have stopped something it did not is worse than a
    disabled one, so the answer is reported rather than assumed."""
    controller, _source, store = _staged(qtbot)

    assert controller.cancel_analysis() is False, "nothing is in flight"

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)
    assert controller.cancel_analysis() is False, "and a cheap pass is not one to stop"
    controller.shutdown()


@verifies(SWR.SWR_3319, SWR.SWR_3519)
def test_what_a_cheap_refresh_left_unjudged_reaches_the_board(qtbot) -> None:
    """Productive use: a rules-only refresh moved two cards it did not judge.
    Expected outcome: the board carries both facts — what is owed, and whether asking
    would pay it off. Unnamed, that work is indistinguishable from a card with nothing
    to do, which is the silence SWR-3519 exists to prevent."""
    controller, source, store = _staged(qtbot)
    source.outcome_unanalysed = ("SWR-2100", "SWR-2101")

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)
    state = store.requirements
    assert state.unanalysed == ("SWR-2100", "SWR-2101")
    assert state.analysis_enabled is True, "asking would clear it"

    _idle(qtbot, controller)
    source.outcome_unanalysed = ()
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.analyse()
    settle(qtbot)
    assert store.requirements.unanalysed == (), "and asking did"
    controller.shutdown()


@verifies(SWR.SWR_3319, SWR.SWR_3117)
def test_a_workspace_that_switched_the_analysis_off_says_so_rather_than_offering_it(
    qtbot,
) -> None:
    """Productive use: a project that keeps `analyze_changes: false` opens the board.
    Expected outcome: the work still shows as owed, and the board knows no pass will
    ever pay it — the difference between an explanation and a button that does nothing
    however many times it is pressed."""
    controller, source, store = _staged(qtbot)
    source.outcome_unanalysed = ("SWR-2100",)
    source.analysis_enabled = False

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    state = store.requirements
    assert state.unanalysed == ("SWR-2100",) and state.analysis_enabled is False
    controller.shutdown()


@verifies(SWR.SWR_3319)
def test_only_the_declared_moments_may_reach_a_model_without_being_asked() -> None:
    """The call-site policy, read off the controller rather than trusted.

    Every refresh in this file funnels through one method whose default is the
    cheap kind, so the policy is not a table somebody has to keep in step with
    ten call sites — it is the default, plus the sites that deliberately opt out
    of it. This asserts exactly that: the default is cheap, and the only two
    places that name the expensive kind are the repository-event trigger
    (SWR-3210's declared moments) and the control a user presses to ask for it.
    """
    import inspect

    from rotaris.services import requirements_controller as module
    from rotaris.services.requirements_bridge import RefreshKind

    assert (
        inspect.signature(RequirementsController.refresh).parameters["kind"].default
        is RefreshKind.EVALUATE
    ), "a refresh that says nothing costs nothing"

    tree = ast.parse(Path(module.__file__).read_text(encoding="utf-8"))
    opted_in = {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef)
        for inner in ast.walk(node)
        if isinstance(inner, ast.Attribute)
        and inner.attr == "ANALYSE"
        and isinstance(inner.value, ast.Name)
        and inner.value.id == "RefreshKind"
    }
    assert opted_in == {"analyse", "_evaluation_due"}, (
        f"a new site started spending model calls unasked: {sorted(opted_in)}"
    )


def _staged_view(qtbot):  # noqa: ANN001, ANN202
    """A real board view attached to a controller over a source that stages passes."""
    source = _StagedSource(_board([_requirement("SWR-2110"), _requirement("SWR-2111")]))
    store = WorkspaceStore()
    controller = RequirementsController(store, source=source, clock=lambda: NOW)
    view = RequirementsView()
    qtbot.addWidget(controller.surface)
    controller.attach_view(view)
    controller.surface.resize(1000, 640)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    return controller, view, source, store


@verifies(SWR.SWR_3319)
def test_one_control_starts_the_re_evaluation_and_it_says_what_it_does(qtbot) -> None:
    """Productive use: a user wants the board to catch up with an edit they just made,
    and looks for the control that does it.
    Expected outcome: there is one, it is where the counts it changes are stated, and its
    sentence is true.

    There used to be two, in two places, with two labels — the area's "Refresh
    requirements" and the board's "Re-evaluate" — reaching the same slot with the same
    argument. Nothing on screen said how they differed, because they did not."""
    controller, view, _source, _store = _staged_view(qtbot)

    area = find_by_accessible_name(controller.surface, "Refresh requirements", QPushButton)
    assert area.toolTip() == REEVALUATE_TOOLTIP
    assert "Consults no model" in REEVALUATE_TOOLTIP
    assert "Cards a rule moves will move" in REEVALUATE_TOOLTIP

    # And the board's toolbar no longer carries a second word for it. Every button
    # left on it is checked, not just the one that went, so a later slice cannot
    # quietly reintroduce a synonym.
    board_verbs = {
        name
        for name in accessible_names(view, QPushButton, visible_only=True)
        if "refresh" in name.casefold() or "evaluate" in name.casefold()
    }
    assert board_verbs == set(), f"the board carries a second refresh verb: {board_verbs}"
    controller.shutdown()


@verifies(SWR.SWR_3319)
def test_the_board_offers_the_judgement_for_what_a_cheap_pass_left_unjudged(qtbot) -> None:
    """Productive use: a user re-evaluates after editing two requirements.
    Expected outcome: the cards move, and the board says two are waiting on a judgement
    and offers to run it. Without that the two would sit in Needs Update carrying no
    offer, indistinguishable from cards with nothing to do."""
    controller, view, source, store = _staged_view(qtbot)
    source.outcome_unanalysed = ("SWR-2110", "SWR-2111")

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=20000):
        controller.refresh()
    settle(qtbot)

    offer = find_by_accessible_name(
        controller.surface,
        "Analyse changed requirements",
        QPushButton,
    )
    assert offer.isVisible()
    assert offer.text() == "Analyse changes (2)"
    assert offer.isEnabled()
    assert offer.toolTip() == ANALYSE_TOOLTIP
    status = find_by_accessible_name(controller.surface, "Requirements evaluation status")
    assert status.text().endswith("· 2 awaiting analysis")

    _idle(qtbot, controller)
    source.outcome_unanalysed = ()
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=20000):
        click_by_name(qtbot, controller.surface, "Analyse changed requirements", QPushButton)
    settle(qtbot)

    assert source.depths[-1] is EvaluationDepth.FULL, "the control asked for the judgement"
    assert not offer.isVisible(), "and nothing is waiting on one any more"
    del store, view
    controller.shutdown()


@verifies(SWR.SWR_3319, SWR.SWR_3117)
def test_a_workspace_with_the_analysis_off_is_told_so_rather_than_offered_a_dead_control(
    qtbot,
) -> None:
    """Productive use: a project that keeps `analyze_changes: false` opens the board.
    Expected outcome: the count is still shown, the control is disabled, and hovering it
    names the switch to change. A greyed control with no explanation is the one thing
    the desktop's own standard forbids."""
    controller, view, source, _store = _staged_view(qtbot)
    source.outcome_unanalysed = ("SWR-2110",)
    source.analysis_enabled = False

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=20000):
        controller.refresh()
    settle(qtbot)

    offer = find_by_accessible_name(
        controller.surface,
        "Analyse changed requirements",
        QPushButton,
    )
    assert offer.isVisible(), "the work is still owed, and still worth seeing"
    assert not offer.isEnabled(), "but pressing it would change nothing"
    assert offer.toolTip() == ANALYSE_OFF_TOOLTIP
    assert "analyze_changes" in ANALYSE_OFF_TOOLTIP, "and it names what to change"
    del view
    controller.shutdown()


@verifies(SWR.SWR_3319, SWR.SWR_3519)
def test_the_board_says_it_is_analysing_and_the_user_can_stop_it(qtbot) -> None:
    """Productive use: a commit lands, the board starts judging what changed, and the
    user does not want to wait.
    Expected outcome: the status line says what is happening and how long it may take —
    not "Evaluating requirements…" — a stop control is there, and pressing it lands a
    complete board rather than throwing one away (SWR-3519)."""
    controller, view, source, _store = _staged_view(qtbot)
    # A board first, because the analysing state is something a user *watches*
    # happen to a board they are already looking at.
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=20000):
        controller.refresh()
    settle(qtbot)
    _idle(qtbot, controller)
    source.block_until_cancelled = True

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=20000):
        controller.analyse()
        qtbot.waitUntil(lambda: controller.bridge.analysing, timeout=5000)
        settle(qtbot)
        status = find_by_accessible_name(controller.surface, "Requirements evaluation status")
        assert status.text() == "Analysing changes — this may take minutes"
        # The control that started it is the control that stops it, and it says so.
        stop = find_by_accessible_name(controller.surface, "Stop analysing changes", QPushButton)
        assert stop.text() == STOP_ANALYSING
        assert stop.toolTip() == STOP_ANALYSING_TOOLTIP
        assert "still arrives" in STOP_ANALYSING_TOOLTIP, (
            "a user deciding whether to stop is owed the fact that a board still lands"
        )
        click_by_name(qtbot, controller.surface, "Stop analysing changes", QPushButton)
    settle(qtbot)

    qtbot.waitUntil(lambda: not controller.bridge.analysing, timeout=5000)
    assert source.tokens[-1].cancelled, "the control reached the pass's own stop signal"
    assert source.calls == 2, "and the stopped pass still projected"
    assert stop.accessibleName() == "Analyse changed requirements", "the control went back"
    del view
    assert not status.text().startswith("Analysing"), "and the board stopped saying it"
    controller.shutdown()


@verifies(SWR.SWR_3312, SWR.SWR_3319)
def test_a_finished_pass_retires_itself_and_never_the_one_that_replaced_it(qtbot) -> None:
    """Productive use: two refreshes land back to back — a commit while a user presses
    Re-evaluate, which on a busy repository is ordinary rather than exotic.
    Expected outcome: the first pass ending does not clear the second pass's
    bookkeeping.

    ``QThread.finished`` reaches this thread as a queued call, so it can arrive after
    the next pass has already started: ``busy`` reads ``isRunning()``, which goes false
    the moment the thread stops, while the slot is still in the event queue. Clearing
    the attributes unconditionally there left ``busy`` false during a live pass — so a
    third refresh could start beside it — and left ``cancel_analysis`` with no token
    while an analysis was running.
    """
    controller, source, _store = _staged(qtbot)
    bridge = controller.bridge

    with qtbot.waitSignal(bridge.evaluated, timeout=5000):
        controller.refresh()
    first = bridge._thread
    assert first is not None

    # Wait for the thread itself rather than for the event loop: `QThread.wait`
    # blocks without pumping, so the queued `finished` is provably still waiting
    # to be delivered. That is the window, reproduced rather than described.
    assert first.wait(5000), "the first pass's thread stopped"
    assert not bridge.busy, "…and the bridge already reads idle"

    # Held open, so "the second pass is still running when its predecessor's
    # `finished` lands" is a fact rather than a race with the event loop: this
    # source is fast enough to finish inside the `settle` below.
    source.block_until_cancelled = True
    assert controller.analyse() is True, "so a second pass starts in that window"
    second = bridge._thread
    assert second is not None and second is not first
    assert bridge.analysing

    settle(qtbot)  # the first pass's `finished` lands here, on top of the second

    assert bridge._thread is second, "the late finish retired the pass that replaced it"
    assert bridge.analysing, "and left an analysis running with nothing to stop it"
    assert bridge.cancel_analysis() is True, "the token is the second pass's, not the first's"
    qtbot.waitUntil(lambda: not bridge.analysing, timeout=5000)
    controller.shutdown()


def _board_at_minimum_window(qtbot) -> tuple[MainWindow, RequirementsView]:
    """A shown requirements board in a window the size the product says it supports."""
    store = WorkspaceStore()
    window = MainWindow(store)
    qtbot.addWidget(window)
    view = RequirementsView()
    window.requirements_controller.attach_view(view)
    window.resize(1000, 680)
    window.show()
    qtbot.waitExposed(window)
    window.show_view("requirements")
    state = build_board_state(
        _board([_requirement(f"SWR-95{index:02d}") for index in range(1, 6)]),
        now=NOW,
    )
    store.set_requirements(state)
    view.set_board(state)
    qtbot.waitUntil(lambda board=view: not board.populating, timeout=20000)
    settle(qtbot)
    return window, view


@verifies(SWR.SWR_3301, SWR.SWR_3302)
def test_the_requirements_area_fits_the_supported_window_on_this_platform(qtbot) -> None:
    """Productive use: a user runs Rotaris in a 1000×680 window — the smallest size
    `apps/rotaris/AGENTS.md` says is supported — and opens Requirements.
    Expected outcome: the area fits, on whatever platform and font this is running.

    This is the assertion the Windows defect broke: the area wanted 1052 points on
    `windows-latest` against a documented 1000, because the filter bar's eight controls
    were on one enforced line and its minimum was their sum. Run at the platform's own
    font on purpose — that is the width the 1000×680 claim is about, and it is the one
    number that means the same thing on every runner.
    """
    window, _view = _board_at_minimum_window(qtbot)
    surface = window.requirements_controller.surface

    assert surface.minimumSizeHint().width() <= 1000, (
        f"the requirements area needs {surface.minimumSizeHint().width()} points at this "
        f"platform's font ({QApplication.font().family()!r}), over the supported 1000"
    )
    window.close()


@verifies(SWR.SWR_3301, SWR.SWR_3302)
def test_the_filter_bar_wraps_rather_than_widening_the_window_in_a_wider_font(qtbot) -> None:
    """Productive use: a user runs Rotaris on a platform whose font is wider than the one
    the bar was laid out against — Windows, or a desktop scaled for readability.
    Expected outcome: the bar wraps onto further lines and keeps asking for very little,
    instead of making the window as wide as the sum of everything it holds.

    A wider font is the same pressure as a wider platform font, which is what makes the
    Windows defect reproducible on any runner: the old bar wanted 790 points at 9pt and
    1088 at 28pt, so it was always reachable here — nobody had looked.

    Asserted on the bar alone, deliberately. The area also holds cards, columns and a
    detail pane, all text-sized, so *its* minimum grows with the font whatever the bar
    does — 1031 points at 14pt on Windows, measured by this test's first version. That is
    a real constraint but a different one, it is not platform-specific, and no supported
    configuration reaches it. Asserting it here would fail for a reason this fix is not
    about, and would mask the regression this guard exists to catch.
    """
    original = QApplication.font()
    try:
        for points in (9, 14, 20):
            font = QFont(original)
            font.setPointSizeF(points)
            QApplication.setFont(font)
            window, view = _board_at_minimum_window(qtbot)
            bar = find_by_accessible_name(view, "Requirement filters")

            # Half the supported window. The bar is one band in an area that also owes
            # room to the columns, so a toolbar wanting more than half of the smallest
            # supported window is dictating the window size — which is exactly what it
            # was doing at 790 points on Linux and 1052 on Windows.
            assert bar.minimumSizeHint().width() <= 500, (
                f"at {points}pt the filter bar needs {bar.minimumSizeHint().width()} "
                f"points of the supported 1000; it is sizing to the sum of its controls"
            )

            # It gave up width by wrapping, not by painting past its own edge. A layout
            # that claims a small minimum and then lays its controls out on one line
            # regardless is worse than the bug this fixes: the window stops growing and
            # the controls leave the visible area instead.
            for name in ("Search requirements", "Clear filters", "Verify requirements"):
                control = find_by_accessible_name(view, name, visible_only=True)
                assert control.width() > 0, f"{name} was collapsed away at {points}pt"
                right = control.mapTo(bar, control.rect().topRight()).x()
                assert right <= bar.width(), (
                    f"at {points}pt {name} ends at {right} in a bar {bar.width()} wide — "
                    "the bar is not wrapping, it is overflowing"
                )
            window.close()
    finally:
        QApplication.setFont(original)


@verifies(SWR.SWR_3302)
def test_the_filter_bar_asks_for_its_widest_control_not_the_sum_of_them(qtbot) -> None:
    """Productive use: the requirements bar grows a seventh control, or a translation
    makes every label longer.
    Expected outcome: the window's minimum does not move, because a flowing bar's
    minimum is the widest single control rather than the total of what it holds.

    Stated against the sum rather than against a recorded number: a recorded width
    only catches the change somebody thought to record, and the property here is
    structural — adding controls must not be able to widen the window.
    """
    store = WorkspaceStore()
    window = MainWindow(store)
    qtbot.addWidget(window)
    view = RequirementsView()
    window.requirements_controller.attach_view(view)
    window.resize(1000, 680)
    window.show()
    qtbot.waitExposed(window)
    window.show_view("requirements")
    settle(qtbot)

    bar = find_by_accessible_name(view, "Requirement filters")
    flow = bar.layout().itemAt(0).layout()
    controls = [flow.itemAt(index).widget() for index in range(flow.count())]
    controls = [control for control in controls if control is not None]
    assert len(controls) >= 6, "the bar under test no longer holds the controls this is about"

    # The effective minimum Qt lays out against: a control's hint, or the floor it
    # was given explicitly (the search field asks for 150 outright).
    def floor(control) -> int:
        return max(control.minimumSizeHint().width(), control.minimumWidth())

    widest = max(floor(control) for control in controls)
    total = sum(floor(control) for control in controls)
    assert total > widest * 3, "the fixture is too uniform to tell a sum from a maximum"
    assert flow.minimumSize().width() <= widest + flow.spacing(), (
        f"the bar asks for {flow.minimumSize().width()} — the sum is {total}, "
        f"its widest control is {widest}; it is sizing to the sum again"
    )


# ── SWR-3321: columns fold to a rail, and stay how the user left them ──────


def _column(key: str, count: int) -> BoardColumnModel:
    """A rendered column holding *count* cards, for the fold rule to read."""
    return BoardColumnModel(
        key=key,
        label=key.capitalize(),
        card_ids=tuple(f"SWR-9{index:03d}" for index in range(count)),
        empty_message=f"Nothing is in {key}.",
    )


def _ready(req_id: str) -> DeliveryRecord:
    """A requirement a user released for work — the one thing that fills Ready."""
    return DeliveryRecord(
        req_id=req_id,
        delivery=DeliveryStatus(
            state=DeliveryState.READY,
            changed_at=WHEN,
            changed_by=DeliveryActor.user("david"),
            cause=TransitionCause.USER_ACTION,
        ),
    )


def _one_empty_column() -> BoardProjection:
    """A projection whose delivery columns are a mix of full and empty."""
    return _board(
        [_requirement(f"SWR-94{index:02d}") for index in range(1, 4)],
        records=[_delivered("SWR-9402", "a-hash")],
    )


def _showing(qtbot, state: RequirementsBoardState, *, workspace: str) -> RequirementsView:
    """A board of *state*, opened against *workspace* — folds and all."""
    view = RequirementsView(workspace=workspace)
    qtbot.addWidget(view)
    view.set_board(state)
    settle(qtbot)
    return view


@pytest.mark.unit
@verifies(SWR.SWR_3321)
def test_a_column_folds_while_it_is_empty_and_opens_when_it_fills() -> None:
    """Productive use: a user opens a board where most delivery states hold nothing.
    Expected outcome: the empty columns are folded and the ones with work are not — and a
    column that later gains a card is open, because emptiness is re-read and not recorded."""
    folds = ColumnFolds()

    assert folds.folded(_column("ready", 0))
    assert not folds.folded(_column("backlog", 3))
    # The same column, one card later: nothing was stored, so nothing keeps it shut.
    assert not folds.folded(_column("ready", 1))


@pytest.mark.unit
@verifies(SWR.SWR_3321)
def test_a_fold_the_user_made_outranks_emptiness_in_both_directions() -> None:
    """Productive use: a user folds a busy column they are not working on, and unfolds an
    empty one they are about to fill.
    Expected outcome: both decisions stand, whatever the counts do afterwards."""
    folded_full = ColumnFolds().with_choice("done", folded=True)
    opened_empty = ColumnFolds().with_choice("ready", folded=False)

    assert folded_full.folded(_column("done", 12))
    assert not opened_empty.folded(_column("ready", 0))
    # …and the decision survives the column changing under it.
    assert folded_full.folded(_column("done", 0))
    assert not opened_empty.folded(_column("ready", 4))


@pytest.mark.unit
@verifies(SWR.SWR_3321)
def test_folds_survive_a_settings_round_trip_and_a_file_this_build_cannot_read() -> None:
    """Productive use: a user's folds are written and read back; a later build once wrote
    something this one does not understand.
    Expected outcome: the folds come back as they went in, and an unreadable value opens
    the board on the empty-only rule rather than failing to draw it."""
    folds = ColumnFolds().with_choice("done", folded=True).with_choice("ready", folded=False)

    save_column_folds("/tmp/a-workspace", folds)

    restored = load_column_folds("/tmp/a-workspace")
    assert restored.folded(_column("done", 9))
    assert not restored.folded(_column("ready", 0))
    # A workspace nobody wrote for has no folds at all, and neither has a broken one.
    assert load_column_folds("/tmp/another-workspace").choices == {}
    QSettings().setValue("workspaces//tmp/a-workspace/requirementColumnFolds", "not json at all")
    assert load_column_folds("/tmp/a-workspace").choices == {}


@pytest.mark.unit
@verifies(SWR.SWR_3321)
def test_folds_drop_the_columns_the_board_no_longer_has() -> None:
    """Productive use: a user folds an epic's column, then the epic is renamed away.
    Expected outcome: the dead entry goes, so grouping by epic cannot accumulate one
    record per id the project ever used."""
    folds = ColumnFolds().with_choice("SWR-3300", folded=True).with_choice("done", folded=True)

    pruned = folds.pruned(["done", "backlog"])

    assert set(pruned.choices) == {"done"}


@verifies(SWR.SWR_3321)
def test_a_rendered_board_folds_its_empty_columns_and_realises_nothing_in_them(qtbot) -> None:
    """Productive use: a user opens Requirements on a project whose work is all in two states.
    Expected outcome: the empty columns are rails carrying their heading and their sentence,
    and none of them holds a card widget to pay for."""
    controller, view, _source = _attached(qtbot, _one_empty_column())

    empty = [column for column in view.columns if not column.count]
    assert empty, "the crafted board has no empty column"
    for column in empty:
        widget = view.column_widget(column.key)
        assert widget is not None
        assert widget.folded
        assert widget.rail.isVisible()
        assert not widget.card_scroll.isVisible()
        assert widget.rail.text() == f"{column.label} · 0"
        assert widget.realised == ()
    for column in (column for column in view.columns if column.count):
        widget = view.column_widget(column.key)
        assert widget is not None
        assert not widget.folded, f"{column.key} holds cards and must be open"
    controller.shutdown()


@verifies(SWR.SWR_3321, SWR.SWR_3314)
def test_clicking_a_heading_folds_a_column_and_clicking_the_rail_opens_it(qtbot) -> None:
    """Productive use: a user folds a column they are not working in, then wants it back.
    Expected outcome: the heading folds it and the rail opens it, and no delivery record moves."""
    controller, view, _source = _attached(qtbot, _one_empty_column())
    backlog = view.column_widget("backlog")
    assert backlog is not None and not backlog.folded

    backlog.header.click()
    settle(qtbot)

    assert view.column_folded("backlog")
    assert backlog.rail.isVisible()

    backlog.rail.click()
    settle(qtbot)

    assert not view.column_folded("backlog")
    assert backlog.card_scroll.isVisible()
    # Display only: folding a column is not a move (SWR-3321).
    assert [card.delivery for card in view.state.cards if card.req_id == "SWR-9401"] == ["backlog"]
    controller.shutdown()


@verifies(SWR.SWR_3321)
def test_a_folded_column_that_gains_its_first_card_is_open_on_the_next_board(qtbot) -> None:
    """Productive use: a user watches an empty Done column while a requirement finishes.
    Expected outcome: the column they never touched opens by itself, so the card cannot
    arrive somewhere they cannot see."""
    controller, view, _source = _attached(qtbot, _one_empty_column())
    assert view.column_folded("ready")

    moved = _board(
        [_requirement(f"SWR-94{index:02d}") for index in range(1, 4)],
        records=[_delivered("SWR-9402", "a-hash"), _ready("SWR-9401")],
    )
    view.set_board(build_board_state(moved, now=NOW))
    settle(qtbot)

    assert not view.column_folded("ready"), "a column with a card in it must be open"
    controller.shutdown()


@verifies(SWR.SWR_3321)
def test_a_column_the_user_folded_stays_folded_once_it_fills(qtbot) -> None:
    """Productive use: a user folds Ready because they do not care about it today.
    Expected outcome: it stays folded when work lands in it, because they said so."""
    controller, view, _source = _attached(qtbot, _one_empty_column())
    view.set_column_folded("ready", folded=True)
    settle(qtbot)

    moved = _board(
        [_requirement(f"SWR-94{index:02d}") for index in range(1, 4)],
        records=[_delivered("SWR-9402", "a-hash"), _ready("SWR-9401")],
    )
    view.set_board(build_board_state(moved, now=NOW))
    settle(qtbot)

    assert view.column_folded("ready")
    controller.shutdown()


@verifies(SWR.SWR_3321, SWR.SWR_3318)
def test_every_axis_folds_its_empty_columns(qtbot) -> None:
    """Productive use: a user groups by an axis that produces a column per value.
    Expected outcome: the values nothing carries are rails, so the ones that matter are
    on screen instead of behind a horizontal scroll."""
    controller, view, _source = _attached(qtbot, _one_empty_column())

    view.set_axis("lifecycle")
    settle(qtbot)

    empty = [column for column in view.columns if not column.count]
    assert empty, "the crafted board fills every lifecycle value — pick another axis"
    assert all(view.column_folded(column.key) for column in empty)
    assert not any(view.column_folded(column.key) for column in view.columns if column.count)
    controller.shutdown()


@verifies(SWR.SWR_3321)
def test_the_folds_belong_to_the_workspace_and_reach_no_other(qtbot) -> None:
    """Productive use: a user folds a column in one project and opens a second one.
    Expected outcome: the second project opens on its own folds — which columns are worth
    seeing follows from what a project contains, not from who is reading it."""
    state = build_board_state(_one_empty_column(), now=NOW)

    theirs = _showing(qtbot, state, workspace="/tmp/project-one")
    assert theirs.set_column_folded("backlog", folded=True)
    settle(qtbot)

    assert load_column_folds("/tmp/project-one").choices == {"backlog": True}
    assert load_column_folds("/tmp/project-two").choices == {}

    # The same project again — the board a user comes back to.
    assert _showing(qtbot, state, workspace="/tmp/project-one").column_folded("backlog")
    # …and a different one, which never heard about that decision.
    assert not _showing(qtbot, state, workspace="/tmp/project-two").column_folded("backlog")


@verifies(SWR.SWR_3321, SWR.SWR_3601)
def test_a_dragged_card_opens_a_folded_column_and_gives_it_back(qtbot) -> None:
    """Productive use: a user drags a requirement towards a folded, empty Ready column.
    Expected outcome: the column opens under the card so the drop target and its stated
    reason are visible, and it folds again when the drag ends — the fold is not a decision
    the drag gets to make."""
    controller, view, _source = _attached(qtbot, _one_empty_column())
    ready = view.column_widget("ready")
    assert ready is not None and ready.folded

    view.begin_drag("SWR-9401")
    ready.set_sprung(sprung=True)
    settle(qtbot)

    assert not ready.folded, "the drag cannot see a target it cannot open"
    assert ready.card_scroll.isVisible()

    view.cancel_drag()
    settle(qtbot)

    assert ready.folded, "the drag left the column open"
    # The fold set itself was never touched: a drag borrows a column, it does not
    # decide anything about it.
    assert load_column_folds("").choices == {}
    controller.shutdown()


@pytest.mark.unit
@verifies(SWR.SWR_3321)
def test_a_pipeline_nothing_has_moved_through_is_read_as_unused() -> None:
    """Productive use: Rotaris decides whether a board is lopsided or simply unstarted.
    Expected outcome: cards waiting in Backlog — or stopped in Blocked before they got
    anywhere — leave the pipeline unused; one card past either, and it is in use.

    The distinction is what stops a first-run board folding itself away: on a project
    nobody has released anything in, every downstream column is empty, so the "an empty
    column folds" rule collapses the whole workflow into rails."""
    fresh = (_column("blocked", 0), _column("backlog", 60), _column("ready", 0))
    assert pipeline_unused(fresh)

    # A requirement that stopped on its way in has still not been through the
    # pipeline — which is exactly the board a failed first release leaves.
    stopped = (_column("blocked", 2), _column("backlog", 58), _column("ready", 0))
    assert pipeline_unused(stopped)

    started = (_column("blocked", 0), _column("backlog", 59), _column("ready", 1))
    assert not pipeline_unused(started)
    assert not pipeline_unused((_column("backlog", 0), _column("done", 12)))


@pytest.mark.unit
@verifies(SWR.SWR_3321)
def test_the_fold_rule_can_be_told_to_leave_an_empty_column_open() -> None:
    """Productive use: the board applies the first-run exception to the emptiness rule.
    Expected outcome: an untouched empty column stays open when asked, and a decision the
    user made still outranks both answers in either direction."""
    folds = ColumnFolds()

    assert folds.folded(_column("ready", 0))
    assert not folds.folded(_column("ready", 0), fold_empty=False)
    # A card in it is open either way; the exception only ever opens columns.
    assert not folds.folded(_column("ready", 4), fold_empty=False)

    chosen = ColumnFolds().with_choice("ready", folded=True)
    assert chosen.folded(_column("ready", 0), fold_empty=False), "the user still decides"


@verifies(SWR.SWR_3321)
def test_a_first_run_board_shows_its_pipeline_and_folds_it_once_work_moves(qtbot) -> None:
    """Productive use: somebody opens Requirements on a project they have just pointed
    Rotaris at, where every requirement is still in Backlog.
    Expected outcome: the delivery columns are open and droppable, so the workflow they
    are about to use is legible.

    Folding an empty column is what makes seven of them fit (SWR-3321), but on a fresh
    project it folded five at once: the first thing a new user saw of the pipeline was the
    one view of it that cannot be read, with a drop target a few points wide. Once a card
    has actually been somewhere, the rule comes back."""
    projection = _board([_requirement(f"SWR-96{index:02d}") for index in range(1, 4)])
    controller, view, _source = _attached(qtbot, projection)

    downstream = [column for column in view.columns if column.key not in {"backlog", "blocked"}]
    assert downstream, "the delivery axis lost its downstream columns"
    assert all(not column.count for column in downstream), "this board is not a first run"
    for column in downstream:
        widget = view.column_widget(column.key)
        assert widget is not None
        assert not widget.folded, f"{column.key} folded on a board nothing has moved through"
        assert widget.card_scroll.isVisible()
        assert widget.empty_label.isVisible(), "an open empty column still says what belongs"

    # One requirement reaches Done, and the columns nobody is using fold again.
    moved = _board(
        [_requirement(f"SWR-96{index:02d}") for index in range(1, 4)],
        records=[_delivered("SWR-9602", "a-hash")],
    )
    view.set_board(build_board_state(moved, now=NOW))
    settle(qtbot)

    assert view.column_folded("ready"), "a pipeline in use folds the states nothing is in"
    assert not view.column_folded("done")
    controller.shutdown()


@verifies(SWR.SWR_3317)
def test_a_column_keeps_its_estimate_until_a_card_has_really_been_laid_out(qtbot) -> None:
    """Productive use: a user opens a long Backlog and asks for a card near the end of it.
    Expected outcome: the card is on screen whole, and the column holds widgets for the
    band around it rather than for everything it contains.

    A card inserted into a column Qt has not sized yet reports a height of a few points.
    Recorded as a measurement, that made every offset below it wrong by a factor of twenty:
    the band covered the entire column, `reveal` concluded every card was already visible
    and scrolled to none of them, and the spacers left the top card of a scrolled column
    cut through the middle — no id, no title, half an alert."""
    projection = _board([_requirement(f"SWR-97{index:02d}") for index in range(1, 31)])
    controller, view, _source = _attached(qtbot, projection)
    backlog = view.column_widget("backlog")
    assert backlog is not None

    # Every card is worth roughly what one card is worth — not a twentieth of it.
    tallest = max(view.card_widgets[req_id].height() for req_id in backlog.realised)
    offsets = backlog._offsets()  # noqa: SLF001 — the model the band and the scroll share
    assert offsets[1] >= tallest, "the column recorded a height no card was ever laid out at"
    assert len(backlog.realised) < len(backlog.card_ids), "the whole column was realised"

    # And a card far down the column is scrolled to whole, not to somewhere near it.
    target = backlog.card_ids[-1]
    widget = view.reveal(target)
    settle(qtbot)
    assert widget is not None and widget.isVisible()
    viewport = backlog.card_scroll.viewport()
    top = widget.mapTo(viewport, widget.rect().topLeft()).y()
    assert top >= 0, "the revealed card starts above its own viewport"
    assert top + widget.height() <= viewport.height() + 1, "the revealed card is cut off"
    controller.shutdown()


@verifies(SWR.SWR_3302, SWR.SWR_3309)
def test_a_drop_down_fits_the_value_it_shows_or_states_what_it_cut(qtbot) -> None:
    """Productive use: a user reads the sort control to see how the board is ordered, then
    picks an epic whose id is long.
    Expected outcome: the order is readable in full, and a value too long for the box is
    elided with an ellipsis and carried whole by the tooltip.

    "Priority, then ic" was what the sort control said: a hard cap of 150 points, no
    ellipsis, and no second copy of the value anywhere. The cap is still there — a combo
    that sizes to the longest epic id is how a bar that fit at 1000x680 stops fitting —
    but reaching it now costs an ellipsis instead of a word."""
    long_id = "SWR-9800-a-deliberately-long-epic-identifier"
    controller, view, _source = _attached(qtbot, _board([_requirement("SWR-9800")]))

    assert view.sort_combo.currentText() == "Priority, then id"
    assert view.sort_combo.displayed_text() == view.sort_combo.currentText(), (
        "the board's own default sort order does not fit the control that states it"
    )
    assert view.sort_combo.toolTip() == view.sort_combo.purpose

    # A value past the ceiling keeps the ellipsis and the whole value both.
    view.epic_combo.addItem(long_id, long_id)
    view.epic_combo.setCurrentIndex(view.epic_combo.findData(long_id))
    settle(qtbot)
    shown = view.epic_combo.displayed_text()
    assert shown != long_id, "a 43-character id fits the compact filter bar — check the test"
    assert shown.endswith("…"), f"the value was cut without saying so: {shown!r}"
    assert long_id in view.epic_combo.toolTip()
    assert long_id in view.epic_combo.accessibleDescription()
    assert view.epic_combo.width() <= 150, "the filter bar sized itself to the longest entry"
    controller.shutdown()


@verifies(SWR.SWR_3606, SWR.SWR_3314)
def test_the_board_toolbar_weights_a_control_by_what_pressing_it_costs(qtbot) -> None:
    """Productive use: a user opens Requirements on a fresh project and looks for the one
    thing there is to do.
    Expected outcome: writing a requirement is the filled control and it leads the row; the
    controls that write to the project are bordered; the ones that only change what is on
    screen are flat.

    Before the rule, the only filled-looking control on the screen was a refresh, the
    primary action sat at the far right of a secondary strip beside a disabled Move, and
    bordered and flat buttons alternated in one row with no rule to infer."""
    controller, view, _source = _attached(qtbot, _board([_requirement("SWR-9900")]))

    weights = {
        button.accessibleName(): button.property("variant")
        for button in view.findChildren(QPushButton)
        if button.accessibleName() and button.isVisible()
    }
    assert weights["Create a requirement"] == "primary"
    assert [name for name, weight in weights.items() if weight == "primary"] == [
        "Create a requirement",
    ], "a surface gets one primary action"
    # Writes something to the project.
    assert weights["Verify requirements"] == "secondary"
    assert weights["Move the selected requirement"] == "secondary"
    # Changes only what is on screen.
    assert weights["Show filters"] == "ghost"
    assert weights["Clear filters"] == "ghost"
    assert weights["Show the delivery queue"] == "ghost"

    # And it leads the row rather than trailing a strip: nothing else above the
    # board starts further left than it.
    create = find_by_accessible_name(view, "Create a requirement", QPushButton, visible_only=True)
    left = create.mapTo(view, create.rect().topLeft()).x()
    beside = [
        widget
        for widget in (view.search, view.sort_combo, view.group_combo, view.verify_button)
        if widget.isVisible()
    ]
    assert beside, "the toolbar rendered nothing beside the primary action"
    assert all(left <= widget.mapTo(view, widget.rect().topLeft()).x() for widget in beside)
    controller.shutdown()


@verifies(SWR.SWR_3303, SWR.SWR_3314)
def test_a_blocked_reason_is_not_the_quietest_sentence_on_the_board(qtbot) -> None:
    """Productive use: a user glances at a board where two requirements have stopped.
    Expected outcome: why they stopped is among the loudest text on the screen, not the
    faintest.

    It used to be 11px in the palette's lightest muted grey — quieter than the card facts
    beside it and quieter than the column headings above it, while a green acceptance sat
    in the same viewport. The most consequential sentence on the board was set as its own
    footnote."""
    projection = _board(
        [_requirement("SWR-9251"), _requirement("SWR-9252")],
        records=[_blocked("SWR-9251", "a decision is missing")],
    )
    controller, view, _source = _attached(qtbot, projection)

    rows = [
        label
        for label in view.blocked_banner.findChildren(QLabel)
        if "a decision is missing" in label.text()
    ]
    assert rows, "the banner rendered no reason at all"
    t = tokens()
    style = rows[0].styleSheet()
    assert f"color:{t.color.text}" in style, f"the reason is not painted in body text: {style}"
    assert f"font-size:{t.type.scale.xs}px" not in style, "the reason is still set as a footnote"

    # Measured rather than asserted by name: the reason has to beat the token the
    # board's own secondary text uses, on the ground the banner paints it on.
    reason = theme.contrast_ratio(t.color.text, t.color.surface)
    secondary = theme.contrast_ratio(t.color.text_secondary, t.color.surface)
    assert reason > secondary
    assert reason >= t.min_text_contrast
    controller.shutdown()


@pytest.mark.unit
@verifies(SWR.SWR_3304, SWR.SWR_3314)
def test_a_screen_reader_hears_a_blocked_sentence_as_often_as_the_card_paints_it() -> None:
    """Productive use: a run fails, so the engine records the stop twice — once as the
    delivery state's reason and once as the blocker raised for it — and someone reads
    the card with a screen reader.
    Expected outcome: they hear the sentence once, which is how often the card paints
    it. The projection used to carry both spellings and only the painting step dropped
    the repeat, so the card announced a sentence it did not show — one card with two
    accounts of what it says."""
    reason = "the run stopped: nothing here answers the importer question"
    projection = _board(
        [_requirement("SWR-9261")],
        records=[_blocked("SWR-9261", reason)],
        blockers={
            "SWR-9261": (
                BlockerView(req_id="SWR-9261", kind=BlockerKind.RUN_FAILURE, reason=reason),
            ),
        },
    )
    entry = projection.entry("SWR-9261")
    assert entry is not None
    assert entry.delivery.blocked_reason == reason, "the engine still raises both facts"
    assert [blocker.reason for blocker in entry.blockers] == [reason]

    card = build_card(entry, now=NOW)

    assert [alert for alert in card.alerts if reason in alert] == [f"Blocked: {reason}"]
    assert card.accessible_description.count(reason) == 1
    # Repeats are what is dropped, never sentences: nothing else was collapsed.
    assert len(card.alerts) == len(set(card.alerts))


# ── SWR-3321: what a folded rail says, and how it says it ──────────────────


@verifies(SWR.SWR_3321, SWR.SWR_3314)
def test_a_folded_rail_states_its_heading_upright_and_the_count_under_it(qtbot) -> None:
    """Productive use: a user — including one reading the board through a screen
    magnifier — glances at the columns their project is not using.
    Expected outcome: every rail is read the way the rest of the screen is read, left to
    right, and it still carries the heading, the count and the sentence saying what belongs
    in an empty column.

    The rail used to paint its heading turned a quarter turn. Rotated text is slow to read
    at the best of times, and under magnification it leaves the viewport in the direction
    the user is not panning — so the one part of the board that had to be scannable was the
    one part nobody could scan."""
    controller, view, _source = _attached(qtbot, _one_empty_column())
    ready = view.column_widget("ready")
    assert ready is not None and ready.folded

    lines = ready.rail.painted_lines()

    # Which way it opens, the heading upright, and the count under it.
    assert lines[0] == "›"
    assert "".join(lines[1:-1]) == "Ready"
    assert lines[-1] == "0"
    # Upright means the rail is wide enough for the word, rather than tall enough
    # for it: the old rail's height was the length of its own heading.
    metrics = QFontMetrics(ready.rail.font())
    assert ready.rail.width() >= metrics.horizontalAdvance("Ready")
    assert ready.rail.minimumSizeHint().height() <= 6 * metrics.height()
    # Nothing SWR-3321 asks of a rail was traded for the legibility: the heading,
    # the count and the empty sentence are all still on it.
    assert "Ready · 0" in ready.rail.toolTip()
    assert ready.rail.accessibleDescription() == COLUMN_HINTS["ready"]

    # A heading too long for one line wraps at its own word break rather than
    # being cut in half or widening the rail to fit it.
    needs_update = view.column_widget("needs-update")
    assert needs_update is not None and needs_update.folded
    wrapped = needs_update.rail.painted_lines()
    assert list(wrapped[1:-1]) == ["Needs", "Update"]
    assert wrapped[-1] == "0"
    controller.shutdown()


@verifies(SWR.SWR_3321, SWR.SWR_3314)
def test_a_folded_rail_reads_as_a_column_that_opens_rather_than_as_a_divider(qtbot) -> None:
    """Productive use: a user scans a board with folded columns on it and has to tell a
    control from decoration.
    Expected outcome: the rail says which way it opens, says it again under the pointer and
    under focus, and is wide enough to read as a squeezed column rather than as a line.

    A rotated "· 0" beside a dark gap is indistinguishable from a separator, which is how a
    user comes to believe a folded column is not there at all."""
    controller, view, _source = _attached(qtbot, _one_empty_column())
    ready = view.column_widget("ready")
    assert ready is not None and ready.folded
    rail = ready.rail

    assert rail.cursor().shape() == Qt.CursorShape.PointingHandCursor
    assert rail.focusPolicy() != Qt.FocusPolicy.NoFocus
    assert rail.accessibleName() == "Unfold the Ready column"
    assert "Click to open the Ready column" in rail.toolTip()
    # Wide enough to be a column rather than a rule between two of them.
    metrics = QFontMetrics(rail.font())
    assert rail.width() >= 3 * metrics.averageCharWidth()

    # Under the pointer the affordance doubles — a shape, not only a colour.
    at = QPointF(2.0, 2.0)
    rail.enterEvent(QEnterEvent(at, at, at))
    settle(qtbot)
    assert rail.painted_lines()[0] == "»"

    rail.leaveEvent(QEvent(QEvent.Type.Leave))
    settle(qtbot)
    assert rail.painted_lines()[0] == "›"

    # And a keyboard user gets the same answer without a pointer to hover with.
    rail.setFocus(Qt.FocusReason.TabFocusReason)
    settle(qtbot)
    assert rail.hasFocus()
    assert rail.painted_lines()[0] == "»"
    controller.shutdown()


@verifies(SWR.SWR_3321, SWR.SWR_3601, SWR.SWR_3602)
def test_every_folded_rail_offers_itself_while_a_card_is_in_the_air(qtbot) -> None:
    """Productive use: a user picks a card up on a board whose unused columns are folded.
    Expected outcome: every rail widens and states whether the card can land there, before
    the pointer has reached any of them — and gives the width back when the drag ends.

    Spring-open-on-hover already opened a folded column under the card (SWR-3321), but
    nothing said so in advance and a rail the width of a scrollbar does not read as a drop
    target, so in practice the drag was abandoned for the move control."""
    controller, view, _source = _attached(qtbot, _one_empty_column())
    ready = view.column_widget("ready")
    review = view.column_widget("review")
    assert ready is not None and ready.folded
    assert review is not None and review.folded
    folded_width = ready.width()
    assert ready.rail.painted_lines()[0] == "›"

    options = view.begin_drag("SWR-9401")
    settle(qtbot)

    assert options, "the board offered the dragged card no move at all"
    # Reachable and refused are both stated, in a glyph and in the engine's own
    # sentence — never in the border colour alone (SWR-3602).
    assert ready.rail.painted_lines()[0] == "↓"
    assert review.rail.painted_lines()[0] == "⃠"
    reachable = view.option_for("SWR-9401", "ready")
    assert reachable is not None and reachable.reachable
    assert ready.rail.toolTip() == reachable.sentence
    assert ready.rail.accessibleDescription() == reachable.sentence
    # Wider while the card is in the air, and wider everywhere rather than only
    # under the pointer.
    assert ready.width() > folded_width, "the rail is the same target it always was"
    assert review.width() > folded_width
    # The sentence is shown, not abbreviated to the glyph: SWR-3602 exists so the
    # engine's reason reaches the person who tried the move, and a "⃠" says no
    # without saying why. The rail cannot carry a sentence at eight characters
    # wide, so the column stops being eight characters wide for the duration.
    assert ready.drop_hint.isVisible()
    assert ready.drop_hint.text() == reachable.sentence
    refused = view.option_for("SWR-9401", "review")
    assert refused is not None and not refused.reachable
    assert review.drop_hint.isVisible()
    assert review.drop_hint.text() == refused.sentence

    view.cancel_drag()
    settle(qtbot)

    assert ready.width() == folded_width, "the drag kept the width it borrowed"
    assert ready.rail.painted_lines()[0] == "›"
    assert ready.rail.accessibleDescription() == COLUMN_HINTS["ready"]
    controller.shutdown()


@verifies(SWR.SWR_3302, SWR.SWR_3321)
def test_open_columns_spend_the_width_a_folded_board_leaves_over(qtbot) -> None:
    """Productive use: a user with a wide monitor opens a board where most columns are
    folded to rails.
    Expected outcome: the columns holding cards grow towards their cap instead of leaving
    half the window as dark nothing — and they stop at the cap, because a card's title read
    across 700 points is not a card anybody scans.

    The board used to pin every open column to its minimum: two columns and five rails took
    about a third of a 1920-point window and the rest was empty."""
    controller, view, _source = _attached(qtbot, _one_empty_column())
    controller.surface.resize(1600, 800)
    settle(qtbot)

    opened = [column for column in view.columns if not view.column_folded(column.key)]
    assert opened, "the crafted board folded everything"
    for column in opened:
        widget = view.column_widget(column.key)
        assert widget is not None
        assert widget.width() > OPEN_COLUMN_MIN_WIDTH, (
            f"{column.key} left the window's spare width unspent"
        )
        assert widget.width() <= OPEN_COLUMN_MAX_WIDTH, f"{column.key} grew past its cap"

    # And the promise that pays for the cap: at the supported minimum window the
    # board is still only as wide as the window, and scrolls rather than clipping.
    controller.surface.resize(1000, 680)
    for column in view.columns:
        view.set_column_folded(column.key, folded=False)
    settle(qtbot)
    for column in view.columns:
        widget = view.column_widget(column.key)
        assert widget is not None
        assert widget.width() >= OPEN_COLUMN_MIN_WIDTH, f"{column.key} is narrower than a card"
    assert view.columns_scroll.horizontalScrollBar().maximum() > 0
    controller.shutdown()


@verifies(SWR.SWR_3303, SWR.SWR_3601)
def test_the_blocked_banner_points_at_the_column_instead_of_listing_it_twice(qtbot) -> None:
    """Productive use: a user reads the blocked strip on a board that also has a Blocked
    column, and goes to one of the requirements in it.
    Expected outcome: the strip says where the requirements are and takes them there —
    opening the column if it is folded, selecting the card and handing it the focus — while
    the move that unblocks a requirement stays on the row.

    The same two requirements used to be listed twice with different affordances in each
    place: a card with a detail, an evidence pane and a drag in the column, and a row whose
    only action opened a file in the strip above it."""
    projection = _board(
        [_requirement("SWR-9271"), _requirement("SWR-9272")],
        records=[_blocked("SWR-9271", "a decision is missing")],
    )
    controller, view, _source = _attached(qtbot, projection)

    assert "in the Blocked column" in view.blocked_heading.text()
    names = accessible_names(view.blocked_banner, QPushButton)
    assert "Show SWR-9271 in the Blocked column" in names
    assert "Return SWR-9271 to Ready" in names, "the recovery path left the row"
    assert not [name for name in names if name.startswith("Open blocked requirement")], (
        "the banner is still a second listing with its own way into the requirement"
    )

    # Folded by hand, so the row has something to open on the way.
    assert view.set_column_folded("blocked", folded=True)
    settle(qtbot)
    click_by_name(qtbot, view.blocked_banner, "Show SWR-9271 in the Blocked column", QPushButton)
    settle(qtbot)

    assert view.page == "board"
    assert not view.column_folded("blocked"), "the row pointed at a column it left folded"
    assert view.selected_req_id == "SWR-9271"
    card = view.card_widgets["SWR-9271"]
    # The window's focus widget rather than `hasFocus`, which is also false for
    # the right widget in a window the offscreen platform never activates.
    assert view.window().focusWidget() is card, "the row did not hand the card over"
    assert card.isVisible(), "the card was focused inside a column nobody can see"

    # With the column switched off there is nothing to point at, so the row opens
    # the requirement itself — the banner is the only listing there is.
    click_by_name(qtbot, view, "Show filters", QPushButton)
    settle(qtbot)
    click_by_name(qtbot, view.filter_row, "Show a Blocked column", QPushButton)
    settle(qtbot)

    assert "no column shows them" in view.blocked_heading.text()
    assert "Open blocked requirement SWR-9271" in accessible_names(
        view.blocked_banner,
        QPushButton,
    )
    controller.shutdown()


@verifies(SWR.SWR_3606, SWR.SWR_3314)
def test_the_one_primary_action_is_the_heaviest_control_on_the_screen(qtbot) -> None:
    """Productive use: a user opens Requirements on a project with nothing delivered and
    looks for the action the screen is for.
    Expected outcome: writing a requirement is the filled, bold, tallest control, and the
    refresh beside the status sentence is visibly none of those.

    A variant was not carrying the hierarchy on its own: a filled accent button and a
    bordered one are the same rectangle at the same height, so the header's "Refresh
    requirements" — which changes nothing a user cannot get back — still read as the most
    important thing on the screen."""
    controller, view, _source = _attached(qtbot, _board([_requirement("SWR-9910")]))
    create = find_by_accessible_name(view, "Create a requirement", QPushButton, visible_only=True)

    assert create.property("variant") == "primary"
    assert create.font().bold()
    # The mark moved from a "+" text prefix into a real plus icon (SWR-3708).
    assert not create.icon().isNull(), "the app marks the action that makes a new thing"

    toolbar = create.parentWidget()
    beside = [
        button
        for button in toolbar.findChildren(QPushButton)
        if button is not create and button.isVisible()
    ]
    assert beside, "the toolbar rendered nothing beside the primary action"
    for button in beside:
        assert not button.font().bold(), f"{button.accessibleName()} competes with the primary"
        assert create.height() > button.height(), (
            f"{button.accessibleName()} is as tall as the primary action"
        )

    refresh = find_by_accessible_name(
        controller.surface,
        "Refresh requirements",
        QPushButton,
        visible_only=True,
    )
    assert refresh.property("variant") != "primary"
    assert not refresh.font().bold()
    assert create.height() > refresh.height(), "the refresh is still the same weight"
    controller.shutdown()


@verifies(SWR.SWR_3419, SWR.SWR_3315)
def test_taking_the_setup_offer_clears_the_notice_without_the_window_saying_so(
    qtbot,
    tmp_path,
) -> None:
    """Productive use: a user opens a folder they never versioned and takes the offer.
    Expected outcome: the board stops saying nothing can run here — because the area
    listens for Git moving, not because the window told it to (SWR-3315)."""
    workspace = tmp_path / "punchclock"
    workspace.mkdir()
    (workspace / "app.py").write_text("x = 1\n", encoding="utf-8")

    store = WorkspaceStore()
    controller = RequirementsController(
        store,
        workspace=workspace,
        source=_RecordingSource(_board([_requirement("SWR-7102")])),
        clock=lambda: NOW,
    )
    qtbot.addWidget(controller.surface)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    notice = store.requirements.notice
    assert notice is not None and notice.id == NO_COMMIT_NOTICE
    assert notice.action_id == GIT_SETUP_ACTION

    # The offer, taken. This is a Git action: it does not touch the board.
    git = GitService(workspace, store)
    _git(workspace, "init", "-b", "main")
    _git(workspace, "config", "user.name", "Test User")
    _git(workspace, "config", "user.email", "test@example.invalid")
    git.prepare_repository()
    settle(qtbot)

    assert store.ui.notice is None or store.ui.notice.id != NO_COMMIT_NOTICE, (
        "the board kept refusing work for want of a commit that now exists"
    )
    # The notice lives in the *board's* slot, which is the one that has to be
    # cleared: asserting only on the window's passed while "Nothing can run here
    # yet" stood over a workspace that had just committed.
    assert store.requirements.notice is None
    controller.shutdown()


@verifies(SWR.SWR_2005, SWR.SWR_3419, SWR.SWR_3315)
def test_pressing_the_setup_offer_sets_git_up_and_says_it_did(
    qtbot,
    tmp_path,
    monkeypatch,
) -> None:
    """Productive use: a user opens a folder they never versioned and presses the
    offer's own button. Expected outcome: a repository with their work committed in
    it, and a report saying so. The button was drawn, labelled and answered by
    nobody — the action id reached this area's banner and stopped there, which is
    the dead affordance the same screen forbids everywhere else."""
    workspace = tmp_path / "punchclock"
    workspace.mkdir()
    (workspace / "app.py").write_text("x = 1\n", encoding="utf-8")
    # An identity belonging to this test, whatever the machine's git carries.
    identity = tmp_path / "gitconfig"
    identity.write_text(
        "[user]\n\tname = Test User\n\temail = test@example.invalid\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(identity))
    monkeypatch.setenv("GIT_CONFIG_SYSTEM", str(tmp_path / "absent.gitconfig"))

    store = WorkspaceStore()
    controller = RequirementsController(
        store,
        workspace=workspace,
        source=_RecordingSource(_board([_requirement("SWR-7103")])),
        clock=lambda: NOW,
    )
    qtbot.addWidget(controller.surface)
    controller.surface.show()
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)
    assert store.requirements.notice is not None

    _idle(qtbot, controller)
    click_by_name(qtbot, controller.surface, "Set up Git here", QPushButton)
    settle(qtbot)

    assert (workspace / ".git").is_dir(), "the offer's button did nothing at all"
    assert _git(workspace, "log", "-1", "--pretty=%s").strip() == "Initial commit"
    # And the user is told what happened, rather than left to guess whether a
    # press that writes to their project did anything.
    reported = store.ui.notice
    assert reported is not None
    assert reported.severity is NoticeSeverity.SUCCESS
    assert "Initial commit" in reported.message
    # The precondition is gone, so the notice stating it is too.
    assert store.requirements.notice is None
    controller.shutdown()


@verifies(SWR.SWR_2005, SWR.SWR_3315)
def test_a_setup_offer_that_git_refuses_says_so_and_stays_on_offer(
    qtbot,
    tmp_path,
    monkeypatch,
) -> None:
    """Productive use: git is installed on this machine but was never told who the
    user is. Expected outcome: git's refusal is reported in the user's words, and
    the offer stays where it was so the way back is the same button."""
    workspace = tmp_path / "punchclock"
    workspace.mkdir()
    (workspace / "app.py").write_text("x = 1\n", encoding="utf-8")
    # An identity that resolves to nothing, whatever the machine is configured with.
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(tmp_path / "absent.gitconfig"))
    monkeypatch.setenv("GIT_CONFIG_SYSTEM", str(tmp_path / "absent.gitconfig"))

    store = WorkspaceStore()
    controller = RequirementsController(
        store,
        workspace=workspace,
        source=_RecordingSource(_board([_requirement("SWR-7104")])),
        clock=lambda: NOW,
    )
    qtbot.addWidget(controller.surface)
    controller.surface.show()
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    _idle(qtbot, controller)
    click_by_name(qtbot, controller.surface, "Set up Git here", QPushButton)
    settle(qtbot)

    reported = store.ui.notice
    assert reported is not None
    assert reported.severity is NoticeSeverity.ERROR
    assert "git config --global user.name" in reported.message
    assert reported.persistent is True
    # Nothing committed under a name git would have had to invent, and the offer
    # still standing.
    unborn = subprocess.run(  # noqa: S603 - fixed argv, no shell, test fixture
        ["git", "rev-parse", "--verify", "HEAD"],  # noqa: S607
        cwd=workspace,
        capture_output=True,
        text=True,
        check=False,
    )
    assert unborn.returncode != 0, "a refused setup must not have made a commit"
    offered = store.requirements.notice
    assert offered is not None and offered.action_id == GIT_SETUP_ACTION
    controller.shutdown()


@verifies(SWR.SWR_3601, SWR.SWR_3201, SWR.SWR_3314)
def test_the_board_asks_why_before_it_blocks_a_requirement(qtbot) -> None:
    """Productive use: a user picks Blocked in the move bar and presses Move.
    Expected outcome: the board asks for the reason the engine requires before it
    raises the move at all — it used to raise it with none and hand the user back
    a refusal it could have seen coming — and the confirmed answer travels with
    the move it was asked for."""
    projection = _board([_requirement("SWR-9221")])
    controller, view, _source = _attached(qtbot, projection)
    moves: list[tuple[str, str, str, str]] = []
    view.move_requested.connect(
        lambda req, source, target, reason: moves.append((req, source, target, reason)),
    )

    assert view.move_card("SWR-9221", "blocked") is True

    assert moves == [], "nothing is moved until there is a reason to record"
    assert view.hold_bar.isVisible()
    assert view.hold_bar.holding == "SWR-9221"
    assert view.hold_bar.confirm.isEnabled() is False
    assert HOLD_REASON_REQUIRED in view.hold_bar.confirm.toolTip()

    view.hold_bar.reason.setText("waiting on the data owner")
    settle(qtbot)
    assert view.hold_bar.confirm.isEnabled() is True
    click_by_name(qtbot, view.hold_bar, "Confirm holding SWR-9221", QPushButton)
    settle(qtbot)

    assert moves == [("SWR-9221", "backlog", "blocked", "waiting on the data owner")]
    assert view.hold_bar.isVisible() is False
    controller.shutdown()


@verifies(SWR.SWR_3601, SWR.SWR_3201, SWR.SWR_3314)
def test_a_hold_the_user_takes_back_moves_nothing(qtbot) -> None:
    """Productive use: the user picks Blocked, thinks better of it, and presses Escape.
    Expected outcome: no move is raised and the card stays where it was — a
    question asked is not an action taken."""
    projection = _board([_requirement("SWR-9222")])
    controller, view, _source = _attached(qtbot, projection)
    moves: list[tuple[str, str, str, str]] = []
    view.move_requested.connect(
        lambda req, source, target, reason: moves.append((req, source, target, reason)),
    )

    view.move_card("SWR-9222", "blocked")
    view.hold_bar.reason.setText("half a thought")
    QTest.keyClick(view, Qt.Key.Key_Escape)
    settle(qtbot)

    assert moves == []
    assert view.hold_bar.isVisible() is False
    assert view.hold_bar.holding == ""
    controller.shutdown()
