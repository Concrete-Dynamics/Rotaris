"""Editing and creating requirements from Rotaris (SWR-3605, SWR-3606).

Every write in this file goes into a **real** requirement store: a synthetic
ReqToCode-shaped Markdown tree under ``tmp_path``, read and written by the
adapter the product ships
(:class:`~rotaris_core.requirements.sources.reqtocode.ReqToCodeSource`) through
the real write-back service (SWR-3111, SWR-3112). Nothing stubs the write,
because the whole promise of SWR-3605 is that the edit lands in the team's own
file in the team's own format — and a stubbed writer would verify the stub.

The `Needs Update` half is deliberately *not* driven by the editor. The test
that covers it edits the requirement, then runs the ordinary evaluation pass
(:class:`~rotaris_core.requirements.change.detection.NeedsUpdatePass`, SWR-3502)
over the real delivery store, and reads the answer off the board. A guard test
below reads this module's own source to prove the editor could not have taken a
shortcut even if somebody wanted it to.
"""

from __future__ import annotations

import ast
import datetime as dt
from pathlib import Path
from typing import TYPE_CHECKING

import pytest
from a11y import text_contrast_violations, unnamed_controls
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QLineEdit, QPlainTextEdit, QPushButton
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.generator import parse_requirements
from rotaris_core.requirements.change.detection import NeedsUpdatePass
from rotaris_core.requirements.delivery.audit import AuditStore
from rotaris_core.requirements.delivery.completion import (
    CompletionEvidence,
    CoveringTestEvidence,
    UnitEvidence,
    UnitExecution,
    completion_gate,
)
from rotaris_core.requirements.delivery.projection import BoardInputs, project_board
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.requirements.delivery.transitions import TransitionRequest
from rotaris_core.requirements.execution.snapshot import ExecutionTransitions
from rotaris_core.requirements.model import READ_ONLY, RequirementType, SourceCapability
from rotaris_core.requirements.registry import RequirementRegistry
from rotaris_core.requirements.sources.base import BaseRequirementSource, SourceRead
from rotaris_core.requirements.sources.reqtocode import ReqToCodeSource
from rotaris_core.requirements.writeback import RequirementWriteBack
from ui_query import click_by_name, find_by_accessible_name, settle, type_text

from rotaris.models.requirements_state import (
    READ_ONLY_SOURCE_NOTICE,
    RequirementDetail,
    build_board_state,
    build_detail,
)
from rotaris.models.store import WorkspaceStore
from rotaris.services.requirement_editing import (
    NOTHING_TO_SAVE,
    ORIGIN_REQUIRED,
    TARGET_UNSTATED,
    CreationTarget,
    EditInput,
    EditOutcome,
    NewRequirement,
    RequirementEditing,
    SourceOption,
    creation_sources,
    preview_target,
)
from rotaris.services.requirements_actions import BoardAction, RequirementActions
from rotaris.services.requirements_controller import RequirementsController
from rotaris.views.requirements import RequirementsView
from rotaris.widgets.requirement_editor import (
    RequirementCreationForm,
    RequirementEditorPanel,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from pytestqt.qtbot import QtBot
    from rotaris_core.requirements.delivery.projection import BoardProjection
    from rotaris_core.requirements.model import CanonicalRequirement
    from rotaris_core.requirements.registry import RequirementIndex
    from rotaris_core.requirements.sources.base import RequirementArtifact

pytestmark = pytest.mark.unit

NOW = dt.datetime(2026, 8, 15, 9, 0, tzinfo=dt.UTC)
#: The two halves of the editing feature. The seam moved to ``services/`` and the
#: panels stayed; the guard below sweeps both, because the class it is really
#: about — ``RequirementEditing`` — is the one that moved.
_APP_SOURCE = Path(__file__).resolve().parents[1] / "src" / "rotaris"
EDITOR_SOURCES = (
    _APP_SOURCE / "services" / "requirement_editing.py",
    _APP_SOURCE / "widgets" / "requirement_editor.py",
)

EPIC_INDEX = """---
req-id: SWR-4200
status: draft
trace: optional
test: optional
title: "Spreadsheet Import"
---

# SWR-4200 — Spreadsheet Import

Reading and writing tabular data.

## Requirements

| ID | Title | Status |
| --- | --- | --- |
| [SWR-4201](4200-spreadsheet-import/SWR-4201-import-a-csv.md) | Import a CSV | draft |

## History

- 2026-01-02 — Epic cut.
"""

IMPORT_REQUIREMENT = """---
req-id: SWR-4201
status: approved
trace: required
test: required
title: "Import a CSV"
epic: SWR-4200
date: 2026-01-02
---

# SWR-4201 — Import a CSV

The user imports a CSV file.

## Acceptance criteria

- A malformed row is reported with its line number.

Epic: [Spreadsheet Import](../4200-spreadsheet-import.md)
"""


# ── a real store, a real adapter, a real write path ────────────────────────


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A synthetic repository whose requirement store is the shipped layout."""
    store = tmp_path / "docs" / "requirements"
    folder = store / "4200-spreadsheet-import"
    folder.mkdir(parents=True)
    (store / "4200-spreadsheet-import.md").write_text(EPIC_INDEX, encoding="utf-8")
    (folder / "SWR-4201-import-a-csv.md").write_text(IMPORT_REQUIREMENT, encoding="utf-8")
    return tmp_path


def _source(repo: Path) -> ReqToCodeSource:
    """The adapter Rotaris ships, with a fixed date so a creation is reproducible."""
    return ReqToCodeSource(repo, today=lambda: "2026-08-15")


class _Store:
    """One workspace: its requirement source, its registry and its write path."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.source = _source(root)
        self.registry = RequirementRegistry([self.source])
        self.editing = RequirementEditing(RequirementWriteBack(self.registry))
        self.index: RequirementIndex = self.registry.refresh()
        self.delivery = DeliveryStore(root)
        self.audit = AuditStore(root)
        self.writer = ExecutionTransitions.for_workspace(
            root,
            current_for=lambda req_id: self.index.requirement(req_id),
            completion=completion_gate(
                lambda record, request: self._evidence(request.req_id),
            ),
        )

    def reread(self) -> RequirementIndex:
        """Re-read the sources, exactly as a board refresh does (SWR-3116)."""
        self.index = self.registry.refresh()
        return self.index

    def hash_for(self, req_id: str) -> str:
        requirement = self.index.requirement(req_id)
        return requirement.current_hash if requirement is not None else ""

    def _evidence(self, req_id: str) -> CompletionEvidence:
        """Evidence satisfying every condition of SWR-3215, for the walk to Done."""
        return CompletionEvidence(
            req_id=req_id,
            current_hash=self.hash_for(req_id),
            satisfied_hash=self.hash_for(req_id),
            units=(UnitEvidence(unit_id="unit-1", execution=UnitExecution.FINISHED),),
            implementation_traces=("src/importer.py:12",),
            covering_tests=(
                CoveringTestEvidence(
                    path="tests/test_importer.py",
                    line=8,
                    executed=True,
                    passed=True,
                ),
            ),
            gate_passed=True,
            integration_complete=True,
        )

    def advance(self, req_id: str, *states: DeliveryState) -> None:
        """Walk the engine's own transitions until the record reaches *states*."""
        causes = {
            DeliveryState.READY: TransitionCause.USER_ACTION,
            DeliveryState.RUNNING: TransitionCause.RUN_STARTED,
            DeliveryState.REVIEW: TransitionCause.RUN_COMPLETED,
            DeliveryState.DONE: TransitionCause.COMPLETION_ACCEPTED,
        }
        for offset, state in enumerate(states):
            outcome = self.writer.apply(
                TransitionRequest(
                    req_id=req_id,
                    target=state,
                    actor=DeliveryActor.system("requirement-flow"),
                    cause=causes.get(state, TransitionCause.USER_ACTION),
                    at=NOW + dt.timedelta(seconds=offset),
                    requirement_hash=self.hash_for(req_id),
                    delivery=self._satisfied(req_id) if state is DeliveryState.DONE else None,
                ),
            )
            assert outcome.accepted, outcome.message

    def _satisfied(self, req_id: str):  # noqa: ANN202 - the engine's own value type
        from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery
        from rotaris_core.requirements.execution.snapshot import capture_snapshot

        requirement = self.index.requirement(req_id)
        assert requirement is not None
        return SatisfiedDelivery.from_snapshot(
            capture_snapshot(requirement, run_id="run-1", base_commit="a1b2c3d", at=NOW),
            run_id="run-1",
            at=NOW,
        )

    def project(self) -> BoardProjection:
        """The board, from what the store and the sources currently hold."""
        return project_board(
            BoardInputs(
                index=self.index,
                delivery=self.delivery.load_all(),
                evaluated_at=NOW,
            ),
        )

    def detail(self, req_id: str) -> RequirementDetail:
        entry = self.project().entry(req_id)
        assert entry is not None, f"{req_id} is not on the board"
        return build_detail(entry, now=NOW)

    def evaluate(self) -> None:
        """The ordinary evaluation pass — SWR-3502's rule, nothing else.

        This is the *only* thing that may turn a delivered requirement into
        ``Needs Update``, and it is deliberately reached here the way a real
        evaluation reaches it: over every record in the store, against the hashes
        the sources currently hold.
        """
        index = self.reread()
        NeedsUpdatePass(self.writer, audit=self.audit).run(
            self.delivery.load_all().records.values(),
            {requirement.req_id: requirement.current_hash for requirement in index.requirements},
            at=NOW + dt.timedelta(minutes=5),
        )


class _ReadOnlySource(BaseRequirementSource):
    """A source that can be read and nothing else — the SWR-3105 refusal case."""

    capabilities = READ_ONLY

    def __init__(self, requirements: Sequence[CanonicalRequirement]) -> None:
        self._requirements = tuple(requirements)

    @property
    def source_id(self) -> str:
        return "spreadsheet"

    def discover(self) -> tuple[RequirementArtifact, ...]:
        return ()

    def read(self) -> SourceRead:
        return SourceRead(
            source_id=self.source_id,
            revision="r1",
            requirements=self._requirements,
        )

    def revision(self) -> str:
        return "r1"


def _detail(
    req_id: str = "SWR-4201",
    *,
    editable: bool = True,
    description: str = "The user imports a CSV file.",
) -> RequirementDetail:
    """A detail view value, built directly for the widget-only tests."""
    return RequirementDetail(
        req_id=req_id,
        title="Import a CSV",
        description=description,
        editable=editable,
        source_id="reqtocode",
        source_path="docs/requirements/4200-spreadsheet-import/SWR-4201-import-a-csv.md",
    )


# ── SWR-3605: editable where the source allows it ──────────────────────────


@verifies(SWR.SWR_3605)
def test_a_writable_source_is_edited_here_and_a_read_only_one_is_named_and_opened(
    qtbot: QtBot,
) -> None:
    """Productive use: a user opens a requirement to change a sentence.
    Expected outcome: a writable source gets fields; a read-only one gets the
    stated notice, the artefact's name and a way to open it — never a disabled
    field with no explanation."""
    panel = RequirementEditorPanel()
    qtbot.addWidget(panel)
    panel.resize(1000, 680)
    panel.show()
    qtbot.waitExposed(panel)

    panel.show_detail(_detail())
    assert panel.editable is True
    assert panel.title_field.isVisible() and panel.description_field.isVisible()
    assert panel.save_button.isVisible()
    assert not panel.read_only.isVisible()
    assert panel.description_field.toPlainText() == "The user imports a CSV file."
    # Usable at the supported minimum window (apps/rotaris/AGENTS.md).
    hint = panel.minimumSizeHint()
    assert hint.width() <= 1000 and hint.height() <= 680, hint

    read_only = _detail(editable=False)
    panel.show_detail(read_only)
    assert panel.editable is False
    assert not panel.title_field.isVisible(), "a read-only source must not offer a field"
    assert not panel.save_button.isVisible()
    assert panel.read_only.isVisible()
    notice = panel.read_only_label.text()
    assert READ_ONLY_SOURCE_NOTICE in notice
    assert read_only.source_path in notice, "the notice has to name where the text lives"
    # Hidden fields must leave the tab order rather than sit in it invisibly.
    assert panel.title_field.focusPolicy().name == "NoFocus"

    opened: list[str] = []
    panel.source_requested.connect(opened.append)
    click_by_name(qtbot, panel, f"Open {read_only.source_path}, where SWR-4201 is written")
    assert opened == [read_only.source_path]


@verifies(SWR.SWR_3605)
def test_a_failed_write_keeps_every_word_the_user_typed_and_states_why(qtbot: QtBot) -> None:
    """Productive use: the write fails and the user still has their paragraph.
    Expected outcome: the fields hold the rejected text and the panel states the
    engine's own reason, persistently."""
    panel = RequirementEditorPanel()
    qtbot.addWidget(panel)
    panel.resize(1000, 680)
    panel.show()
    qtbot.waitExposed(panel)
    panel.show_detail(_detail())
    panel.description_field.setPlainText("The user imports a CSV and reviews the parsed rows.")
    typed = panel.current

    panel.report(
        EditOutcome(
            req_id="SWR-4201",
            reason="SWR-4201: the source moved since the edit was prepared",
            preserved=typed,
        ),
    )

    assert panel.description_field.toPlainText() == typed.description
    assert panel.title_field.text() == typed.title
    assert panel.notice.isVisible()
    assert "the source moved" in panel.notice.message.text()
    assert panel.notice.dismiss_button.isVisible(), "a failure has to persist until read"


@verifies(SWR.SWR_3605)
def test_save_is_refused_while_there_is_nothing_to_write_and_named_when_there_is(
    qtbot: QtBot,
) -> None:
    """Productive use: the user opens an editor and changes nothing.
    Expected outcome: Save says why it is unavailable, and becomes available the
    moment a word changes."""
    panel = RequirementEditorPanel()
    qtbot.addWidget(panel)
    panel.show_detail(_detail())

    assert panel.dirty is False
    assert panel.save_button.isEnabled() is False
    assert panel.save_button.toolTip() == NOTHING_TO_SAVE

    submitted: list[tuple[str, str, str]] = []
    panel.edit_submitted.connect(lambda *args: submitted.append(args))
    panel.description_field.setPlainText("The user imports a CSV file, one sheet at a time.")
    assert panel.dirty is True
    assert panel.save_button.isEnabled() is True
    panel.save_button.click()
    assert submitted == [
        ("SWR-4201", "Import a CSV", "The user imports a CSV file, one sheet at a time.")
    ]

    panel.title_field.clear()
    assert panel.save_button.isEnabled() is False
    assert "title" in panel.save_button.toolTip()


@verifies(SWR.SWR_3605)
def test_the_adapter_receives_only_what_changed_aimed_at_the_version_it_was_read_at() -> None:
    """Productive use: a description edit must not rewrite the title line.
    Expected outcome: the edit carries the changed field alone, plus the version
    it was prepared against, so a moved source is refused rather than overwritten."""
    opened = EditInput(
        req_id="SWR-4201",
        title="Import a CSV",
        description="The user imports a CSV file, one sheet at a time.",
        expected_hash="abc123",
    )

    edit = opened.to_edit(title="Import a CSV", description="The user imports a CSV file.")

    assert edit.changed_fields() == ("description",)
    assert edit.title is None
    assert edit.description == "The user imports a CSV file, one sheet at a time."
    assert edit.expected_hash == "abc123"
    assert opened.changes(title="Import a CSV", description=opened.description) == ()


@verifies(SWR.SWR_3605)
def test_the_editor_states_no_delivery_state_and_performs_no_transition() -> None:
    """Productive use: an edit must reach Needs Update the ordinary way.
    Expected outcome: neither half of the editing feature names a delivery state,
    a transition or a board action — so the only path from an edit to Needs Update
    is the evaluation pass of SWR-3502.

    Both files, deliberately. The seam this is really about — `RequirementEditing`
    — moved to `services/` while the panels stayed, and a sweep left pointing at
    the widgets module alone would have kept passing while guarding nothing."""
    for path in EDITOR_SOURCES:
        assert path.exists(), f"{path.name} is missing; the guard sweeps the wrong tree"
        body = "\n".join(
            line
            for line in path.read_text(encoding="utf-8").splitlines()
            if not line.lstrip().startswith(("#:", "#"))
        )
        for forbidden in (
            "DeliveryState",
            "TransitionRequest",
            "apply_transition",
            "DeliveryStore",
            "satisfied_hash",
            "BoardAction",
        ):
            assert forbidden not in body, f"{path.name} must not reach for {forbidden}"


# ── SWR-3606: creation ─────────────────────────────────────────────────────


@verifies(SWR.SWR_3606)
def test_creation_offers_only_the_sources_that_declare_the_create_capability(
    repo: Path,
) -> None:
    """Productive use: a project with one writable and one read-only source.
    Expected outcome: only the writable one is offered, decided on the declared
    capability rather than on a trial write."""
    writable = _source(repo)
    read_only = _ReadOnlySource(RequirementRegistry([writable]).refresh().requirements)

    offered = creation_sources([writable, read_only])

    assert [option.source_id for option in offered] == [writable.source_id]
    assert offered[0].can_create is True
    assert str(writable.store_path) == offered[0].location
    assert read_only.capabilities.can(SourceCapability.CREATE) is False


@verifies(SWR.SWR_3606)
def test_a_technical_requirement_cannot_be_created_without_naming_its_origin(
    qtbot: QtBot,
) -> None:
    """Productive use: a user classifies a new requirement as technical.
    Expected outcome: Create is refused with the origin's own reason until the
    origin is named — the same refusal the store's own check would give."""
    form = RequirementCreationForm()
    qtbot.addWidget(form)
    form.resize(1000, 680)
    form.show()
    qtbot.waitExposed(form)
    form.set_sources([SourceOption(source_id="reqtocode", location="docs", can_create=True)])
    form.title_field.setText("Cache the parsed store")
    form.kind_combo.setCurrentIndex(1)
    form.set_target(CreationTarget(source_id="reqtocode", req_id="SWR-4202", path="a/b.md"))

    hint = form.minimumSizeHint()
    assert hint.width() <= 1000 and hint.height() <= 680, hint
    assert form.form.technical is True
    assert ORIGIN_REQUIRED in form.problems
    assert form.create_button.isEnabled() is False
    assert ORIGIN_REQUIRED in form.create_button.toolTip()
    assert form.origin_field.isVisible(), "the field the refusal is about has to be reachable"

    form.origin_field.setText("SWR-4201")
    form.set_target(CreationTarget(source_id="reqtocode", req_id="SWR-4202", path="a/b.md"))
    assert form.problems == ()
    assert form.create_button.isEnabled() is True

    created: list[NewRequirement] = []
    form.creation_submitted.connect(created.append)
    click_by_name(qtbot, form, "Create requirement", QPushButton)
    assert created and created[0].origin == "SWR-4201"
    draft = created[0].to_draft()
    assert draft.req_type is RequirementType.TECHNICAL
    assert [relation.target for relation in draft.relations] == ["SWR-4201"]


@verifies(SWR.SWR_3606)
def test_the_form_refuses_to_create_until_it_can_say_where_the_artefact_goes(
    qtbot: QtBot,
) -> None:
    """Productive use: the user must see the target before anything is written.
    Expected outcome: Create is unavailable with a stated reason while no target
    is resolved, and the resolved target names the id, the file and the index."""
    form = RequirementCreationForm()
    qtbot.addWidget(form)
    form.set_sources([SourceOption(source_id="reqtocode", location="docs", can_create=True)])
    form.title_field.setText("Export a CSV")

    assert form.target is None
    assert TARGET_UNSTATED in form.problems
    assert form.create_button.isEnabled() is False

    form.set_target(
        CreationTarget(
            source_id="reqtocode",
            req_id="SWR-4202",
            path="docs/requirements/4200-spreadsheet-import/SWR-4202-export-a-csv.md",
            index_path="docs/requirements/4200-spreadsheet-import.md",
        ),
    )

    assert "SWR-4202 will be written to" in form.target_label.text()
    assert "4200-spreadsheet-import.md" in form.target_label.text()
    assert form.create_button.isEnabled() is True


@pytest.mark.integration
@verifies(SWR.SWR_3606)
def test_the_previewed_target_is_the_path_the_store_actually_writes(repo: Path) -> None:
    """Productive use: the preview promises a location and the write keeps it.
    Expected outcome: the previewed id and path are what the creation produces,
    because both come from the store's own allocation and naming."""
    store = _Store(repo)
    form = NewRequirement(
        title="Export a CSV",
        description="The user exports the current table.",
        source_id=store.source.source_id,
        parent="SWR-4200",
    )

    target = preview_target(store.source, form)
    assert target.known is True
    assert target.req_id == "SWR-4202"
    assert target.path.endswith("SWR-4202-export-a-csv.md")
    assert not Path(target.path).exists(), "a preview must not write anything"
    assert target.index_path.endswith("4200-spreadsheet-import.md")

    outcome = store.editing.create(form)

    assert outcome.ok, outcome.reason
    assert outcome.req_id == target.req_id
    assert Path(target.path).exists()
    assert outcome.changed_paths == (Path(target.path).relative_to(repo).as_posix(),)


@pytest.mark.integration
@verifies(SWR.SWR_3606, SWR.SWR_3112)
def test_the_preview_and_the_write_name_the_same_file_with_an_epic_and_without(
    repo: Path,
) -> None:
    """Productive use: a user composes a requirement, reads the target, then creates it.
    Expected outcome: the file the label promised is the file that appears — under
    an epic, where the id comes from that epic's block and the index is mirrored,
    and at the root, where neither applies.

    The sampled version of this only covered the epic path. Both are asserted now
    because the two branches resolve different directories and different ids, and
    an agreement that holds on one of them is not the property SWR-3606 asks for.
    """
    for parent in ("SWR-4200", ""):
        store = _Store(repo)
        form = NewRequirement(
            title=f"Export a CSV to {parent or 'nowhere'}",
            description="The user exports the current table.",
            source_id=store.source.source_id,
            parent=parent,
        )

        target = preview_target(store.source, form)
        assert target.known is True, target.reason
        assert not Path(target.path).exists(), "a preview must not write anything"

        outcome = store.editing.create(form)

        assert outcome.ok, outcome.reason
        assert outcome.req_id == target.req_id
        assert Path(target.path).exists(), "the write landed somewhere else than promised"
        written = Path(repo / outcome.changed_paths[0]).resolve()
        assert written == Path(target.path).resolve()
        if parent:
            assert target.index_path.endswith("4200-spreadsheet-import.md")
        else:
            assert target.index_path == "", "a root requirement is listed in no epic index"


@pytest.mark.integration
@verifies(SWR.SWR_3606)
def test_a_draft_the_store_would_refuse_previews_the_refusal_rather_than_a_file(
    repo: Path,
) -> None:
    """Productive use: the creation form is open and the title box is still empty.
    Expected outcome: the label states that a title is needed, rather than naming a
    file the write would then refuse.

    This is a deliberate change. The preview used to fall back to the id for the
    file name — `SWR-4202-swr-4202.md` — for a draft `validate_draft` rejects, so
    the one criterion SWR-3606 states about previews ("the user sees where the
    artefact will be written") was answered with a location nothing would write.
    Preview and create now refuse at the same door, because they are one call.
    """
    store = _Store(repo)
    untitled = NewRequirement(
        title="",
        description="The user exports the current table.",
        source_id=store.source.source_id,
        parent="SWR-4200",
    )

    target = preview_target(store.source, untitled)

    assert target.known is False
    assert "title" in target.reason, target.reason
    assert store.editing.create(untitled).ok is False


@pytest.mark.unit
@verifies(SWR.SWR_3606, SWR.SWR_3105)
def test_a_source_that_declares_no_preview_states_that_instead_of_inventing_one(
    repo: Path,
) -> None:
    """Productive use: a project keeps its requirements in a tracker that issues ids on submit.
    Expected outcome: the form says the location is not known yet — an honest answer
    — rather than a plausible path Rotaris made up.

    Asked through `preview_of`, so the *declaration* decides. A source that has the
    method in order to refuse (every `BaseRequirementSource` does) must not look
    like one that can answer.
    """
    from rotaris_core.requirements.sources.base import preview_of

    read_only = _ReadOnlySource(RequirementRegistry([_source(repo)]).refresh().requirements)
    form = NewRequirement(title="Export a CSV", source_id=read_only.source_id)

    assert preview_of(read_only) is None

    target = preview_target(read_only, form)

    assert target.known is False
    assert "does not name a file location" in target.reason


@pytest.mark.unit
@verifies(SWR.SWR_3606, SWR.SWR_3311)
def test_the_desktop_holds_no_knowledge_of_the_stores_layout() -> None:
    """Productive use: SWR-3122 adds sectioned documents and SWR-3118 source-reported state.
    Expected outcome: the new layouts are learned by their adapters, because this
    module has nowhere to put them — the preview path names no layout type and
    probes for no store path.

    `_location_of` keeps its `store_path` probe and is exempt by name: it is a
    combo label, display-only, and refusing it here would be a rule about a
    different thing.
    """
    module = EDITOR_SOURCES[0]
    tree = ast.parse(module.read_text(encoding="utf-8"))
    body = "\n".join(
        ast.unparse(node)
        for node in tree.body
        if not (isinstance(node, ast.FunctionDef) and node.name == "_location_of")
    )

    for forbidden in ("MarkdownStoreLayout", "allocate_requirement_id", "requirement_filename"):
        assert forbidden not in body, f"the desktop reaches for {forbidden}"
    assert "store_path" not in body, "a second store_path probe appeared"


@pytest.mark.integration
@verifies(SWR.SWR_3606, SWR.SWR_3112)
def test_a_created_requirement_lands_in_the_store_and_appears_on_the_board_in_backlog(
    repo: Path,
) -> None:
    """Productive use: a new idea starts in Rotaris rather than arriving as an import.
    Expected outcome: the artefact follows the store's conventions, the epic
    index lists it, and the next board read shows it in Backlog."""
    store = _Store(repo)

    outcome = store.editing.create(
        NewRequirement(
            title="Export a CSV",
            description="The user exports the current table to a CSV file.",
            source_id=store.source.source_id,
            parent="SWR-4200",
        ),
    )
    assert outcome.ok, outcome.reason

    # The project's own parser reads it, with the id and epic it was created under.
    parsed = {meta.req_id: meta for meta in parse_requirements(repo).requirements}
    assert outcome.req_id in parsed
    created = parsed[outcome.req_id]
    assert created.source_path.endswith("SWR-4202-export-a-csv.md")
    index_text = (repo / "docs/requirements/4200-spreadsheet-import.md").read_text(encoding="utf-8")
    assert outcome.req_id in index_text, "the epic index has to list what was created"

    board = build_board_state(project_board(BoardInputs(index=store.reread(), evaluated_at=NOW)))
    column = board.column("backlog")
    assert column is not None
    assert outcome.req_id in column.req_ids
    card = board.card(outcome.req_id)
    assert card is not None
    assert card.title == "Export a CSV"


# ── the seam: view → engine → the project's own file ───────────────────────


@pytest.mark.integration
@verifies(SWR.SWR_3605, SWR.SWR_3111)
def test_an_edit_writes_one_file_and_the_next_board_read_carries_the_new_version(
    repo: Path,
) -> None:
    """Productive use: a user changes a sentence and the board follows.
    Expected outcome: exactly the requirement's own file moves, and the card's
    version is the one the store now holds — never one Rotaris computed."""
    store = _Store(repo)
    before = {
        path.relative_to(repo).as_posix(): path.read_bytes()
        for path in sorted(repo.rglob("*"))
        if path.is_file()
    }
    detail = store.detail("SWR-4201")
    opened = EditInput(
        req_id="SWR-4201",
        title=detail.title,
        description="The user imports a CSV file and reviews the parsed rows first.",
        expected_hash=store.hash_for("SWR-4201"),
    )

    outcome = store.editing.apply(opened, title=detail.title, description=detail.description)

    assert outcome.ok, outcome.reason
    after = {
        path.relative_to(repo).as_posix(): path.read_bytes()
        for path in sorted(repo.rglob("*"))
        if path.is_file()
    }
    changed = [path for path in after if after[path] != before.get(path)]
    assert changed == ["docs/requirements/4200-spreadsheet-import/SWR-4201-import-a-csv.md"]
    assert "reviews the parsed rows first" in (repo / changed[0]).read_text(encoding="utf-8")

    board = build_board_state(project_board(BoardInputs(index=store.reread(), evaluated_at=NOW)))
    card = board.card("SWR-4201")
    assert card is not None
    assert card.current_hash == outcome.requirement_hash != opened.expected_hash


@pytest.mark.integration
@verifies(SWR.SWR_3605, SWR.SWR_3111)
def test_an_edit_against_a_version_the_store_has_left_is_refused_with_the_input_kept(
    repo: Path,
) -> None:
    """Productive use: two windows edit the same requirement.
    Expected outcome: the second write is refused with the conflict stated and
    the user's text handed back, rather than overwriting the first."""
    store = _Store(repo)
    stale = EditInput(
        req_id="SWR-4201",
        title="Import a CSV",
        description="A description prepared against an older version.",
        expected_hash="a-version-this-store-never-had",
    )

    outcome = store.editing.apply(
        stale,
        title="Import a CSV",
        description="The user imports a CSV file.",
    )

    assert outcome.ok is False
    assert "moved since the edit was prepared" in outcome.reason
    assert outcome.preserved == stale
    assert "prepared against an older version" not in (
        repo / "docs/requirements/4200-spreadsheet-import/SWR-4201-import-a-csv.md"
    ).read_text(encoding="utf-8")


@pytest.mark.integration
@verifies(SWR.SWR_3605, SWR.SWR_3502)
def test_editing_a_delivered_requirement_produces_needs_update_through_the_evaluation_pass(
    repo: Path,
) -> None:
    """Productive use: a delivered requirement's text changes and the board says so.
    Expected outcome: `Needs Update` arrives from the ordinary evaluation over the
    real delivery store — the editor writes the artefact and nothing else."""
    store = _Store(repo)
    store.advance(
        "SWR-4201",
        DeliveryState.READY,
        DeliveryState.RUNNING,
        DeliveryState.REVIEW,
        DeliveryState.DONE,
    )
    assert store.delivery.read("SWR-4201").state is DeliveryState.DONE
    delivered_hash = store.hash_for("SWR-4201")

    outcome = store.editing.apply(
        EditInput(
            req_id="SWR-4201",
            title="Import a CSV",
            description="The user imports a CSV file and every malformed row is listed.",
            expected_hash=delivered_hash,
        ),
        title="Import a CSV",
        description="The user imports a CSV file.",
    )
    assert outcome.ok, outcome.reason
    # The write alone changes no delivery state: the board would still say Done.
    assert store.delivery.read("SWR-4201").state is DeliveryState.DONE

    store.evaluate()

    record = store.delivery.read("SWR-4201")
    assert record.state is DeliveryState.NEEDS_UPDATE
    # The delivered version is kept, which is what makes the card able to say
    # *which* version was built (SWR-3502).
    assert record.satisfied_hash == delivered_hash
    board = build_board_state(store.project())
    column = board.column("needs-update")
    assert column is not None
    assert "SWR-4201" in column.req_ids
    assert any(
        event.kind.value == "specification-changed"
        for event in store.audit.load("SWR-4201").trail.events
    ), "the pass that moved the state has to say so in the trail (SWR-3213)"


# ── the user-flow (SWR-3605, SWR-3606) ─────────────────────────────────────


class _BoardSource:
    """The bridge's port, answering from the live store on every read."""

    def __init__(self, store: _Store) -> None:
        self._store = store
        self.calls = 0

    def project(self) -> BoardProjection:
        self.calls += 1
        self._store.reread()
        return self._store.project()


def _desktop(
    qtbot: QtBot,
    store: _Store,
) -> tuple[RequirementsController, RequirementsView, RequirementEditorPanel]:
    """A board, its controller and the editor pane, wired as the area wires them.

    ``main_window.py`` is untouched by construction (SWR-3315), and **nothing
    here wires the editor either** (SWR-3316): the area installs its own board
    and its own editor, and the only thing this helper supplies is the write
    path, which a productive session resolves from its workspace instead.

    It used to hand-roll both — the pane registration and two closures for
    opening and saving. That is what let the product ship with an `Edit` control
    connected to nothing while these tests passed: the test composed what the
    window did not.
    """
    controller = RequirementsController(
        WorkspaceStore(),
        source=_BoardSource(store),
        clock=lambda: NOW,
    )
    qtbot.addWidget(controller.surface)
    controller.attach_editing(store.editing)
    assert controller.install_board() is True
    assert controller.install_editor() is True
    view = controller.view
    assert isinstance(view, RequirementsView)
    panel = view.pane("editor")
    assert isinstance(panel, RequirementEditorPanel)
    controller.surface.resize(1000, 680)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    return controller, view, panel


@pytest.mark.e2e
@verifies(SWR.SWR_3605)
def test_a_user_edits_a_requirement_in_rotaris_and_finds_the_change_in_their_own_file(
    qtbot: QtBot,
    repo: Path,
) -> None:
    """Productive use: the whole point of SWR-3605, driven through the window.
    Expected outcome: the user opens a card, edits it, saves, and the project's
    own Markdown file carries the new sentence."""
    store = _Store(repo)
    controller, view, panel = _desktop(qtbot, store)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    controller.open_requirement("SWR-4201")
    settle(qtbot)
    assert view.page == "detail"
    click_by_name(qtbot, view.detail_view, "Edit SWR-4201", QPushButton)
    settle(qtbot)

    assert view.page == "editor"
    assert panel.req_id == "SWR-4201"
    field = find_by_accessible_name(panel, "Requirement description", QPlainTextEdit)
    field.clear()
    type_text(qtbot, field, "The user imports a CSV file and reviews the parsed rows first.")
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        click_by_name(qtbot, panel, "Save requirement", QPushButton)
    settle(qtbot)

    written = (
        repo / "docs/requirements/4200-spreadsheet-import/SWR-4201-import-a-csv.md"
    ).read_text(encoding="utf-8")
    assert "reviews the parsed rows first" in written
    assert "req-id: SWR-4201" in written, "the store's own frontmatter has to survive the edit"
    assert panel.notice.isVisible()
    card = controller.detail_for("SWR-4201")
    assert card is not None
    assert "reviews the parsed rows first" in card.description


@pytest.mark.e2e
@verifies(SWR.SWR_3606)
def test_a_user_creates_a_requirement_and_releases_it_in_one_sitting(
    qtbot: QtBot,
    repo: Path,
) -> None:
    """Productive use: an idea becomes a requirement and starts moving, in one go.
    Expected outcome: the created requirement is on the board in Backlog and the
    board's own release moves it to Ready — through the engine, not the form."""
    store = _Store(repo)
    controller, view, _ = _desktop(qtbot, store)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)
    controller.attach_actions(
        RequirementActions(
            store.writer,
            hash_for=store.hash_for,
            actor_name="dvf",
            clock=lambda: NOW,
        ),
    )
    # The form the *area* installed, opened the way the board's own control
    # opens it (SWR-3316) — not a second one wired by hand here.
    controller.create_requirement()
    settle(qtbot)
    form = view.pane("create")
    assert isinstance(form, RequirementCreationForm)
    assert view.page == "create"
    type_text(qtbot, find_by_accessible_name(form, "New requirement title", QLineEdit), "Export")
    type_text(qtbot, find_by_accessible_name(form, "Parent epic", QLineEdit), "SWR-4200")
    settle(qtbot)
    assert form.target is not None and form.target.known, form.target_label.text()
    # The area's own write path answers this, and re-reads the board itself.
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        click_by_name(qtbot, form, "Create requirement", QPushButton)
    settle(qtbot)
    column = controller._store.requirements.column("backlog")  # noqa: SLF001 - store state
    assert column is not None and "SWR-4202" in column.req_ids

    outcome = controller.perform_action(str(BoardAction.RELEASE), "SWR-4202")
    assert outcome is not None and outcome.accepted, outcome.reason if outcome else "no outcome"
    assert store.delivery.read("SWR-4202").state is DeliveryState.READY
    # Released, so the board re-read itself: let that evaluation finish before
    # teardown takes the widgets away underneath it.
    controller.shutdown()


# ── SWR-3314: both writing surfaces are usable without a mouse ─────────────


@verifies(SWR.SWR_3605, SWR.SWR_3606)
def test_the_editor_and_the_creation_form_are_announced_readable_and_reachable(
    qtbot: QtBot,
) -> None:
    """Productive use: a screen-reader and keyboard user changes a requirement and
    writes a new one.
    Expected outcome: every control on both surfaces announces a name, every label
    clears its WCAG AA ratio, and each control can be tabbed to — the accessibility
    sweep the board itself passes, applied to the two surfaces that write."""
    panel = RequirementEditorPanel()
    qtbot.addWidget(panel)
    panel.resize(1000, 680)
    panel.show()
    qtbot.waitExposed(panel)
    panel.show_detail(_detail())
    settle(qtbot)

    unnamed = unnamed_controls(panel)
    assert not unnamed, f"the requirement editor has silent control(s): {unnamed}"
    violations = text_contrast_violations(panel)
    assert not violations, "unreadable text in the requirement editor:\n" + "\n".join(
        f"  {violation}" for violation in sorted({str(item) for item in violations})
    )
    for name in ("Requirement title", "Requirement description", "Save requirement"):
        control = find_by_accessible_name(panel, name, visible_only=True)
        assert control.focusPolicy() != Qt.FocusPolicy.NoFocus, f"{name} cannot be tabbed to"

    # The read-only case has to announce itself too: the notice replaces the
    # fields, and a surface that only says things through hidden widgets says
    # nothing at all.
    panel.show_detail(_detail(editable=False))
    settle(qtbot)
    assert not unnamed_controls(panel), "the read-only notice has silent control(s)"
    assert not text_contrast_violations(panel), "the read-only notice is unreadable"

    form = RequirementCreationForm()
    qtbot.addWidget(form)
    form.resize(1000, 680)
    form.show()
    qtbot.waitExposed(form)
    form.set_sources([SourceOption(source_id="reqtocode", location="docs", can_create=True)])
    form.kind_combo.setCurrentIndex(1)
    settle(qtbot)

    unnamed = unnamed_controls(form)
    assert not unnamed, f"the creation form has silent control(s): {unnamed}"
    violations = text_contrast_violations(form)
    assert not violations, "unreadable text on the creation form:\n" + "\n".join(
        f"  {violation}" for violation in sorted({str(item) for item in violations})
    )
    for name in (
        "New requirement title",
        "Requirement source",
        "Requirement classification",
        "Origin requirement",
        "Create requirement",
    ):
        control = find_by_accessible_name(form, name, visible_only=True)
        assert control.focusPolicy() != Qt.FocusPolicy.NoFocus, f"{name} cannot be tabbed to"
