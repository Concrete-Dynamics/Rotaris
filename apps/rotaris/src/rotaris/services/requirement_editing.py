"""The two writes a user makes by hand, carried into the project's own artefact.

If changing a sentence means leaving the product, the requirement loop breaks at
its most frequent step. So this is the seam behind the editor: an edit of an
existing requirement and the creation of a new one, each reaching the source's
own adapter and coming back as a value the surface can render.

```text
RequirementEditorPanel ─ edit_submitted ─▶ RequirementEditing.apply
   (fields, notice)                            │  RequirementWriteBack  (SWR-3111)
       ▲                                       ▼  the project's own file
       └────────── report(EditOutcome) ─── written / refused / conflicted
RequirementCreationForm ─ creation_submitted ─▶ RequirementEditing.create
   (source, epic, kind, origin, target)         │  RequirementWriteBack  (SWR-3112)
```

Three properties are load-bearing:

- **Nothing here decides a delivery state.** An edit writes the artefact and
  stops. The `Needs Update` that follows a change to a delivered requirement is
  produced by the ordinary evaluation pass
  (:class:`~rotaris_core.requirements.change.detection.NeedsUpdatePass`,
  SWR-3502) on the next board read — this module names no delivery state at all,
  which is what makes "no special case in the UI" checkable rather than promised
  (SWR-3605's fourth acceptance criterion). A guard test sweeps this module and
  :mod:`rotaris.widgets.requirement_editor` together for exactly that.
- **A failed write preserves the input.** Every refusal, conflict and error comes
  back as an :class:`EditOutcome` *carrying what the user typed*, so the surface
  can put it back rather than clearing the form. Losing a paragraph to a hash
  conflict is the one failure an editor may not have.
- **Creation states its target before it writes.** :func:`preview_target`
  resolves the id and the path the store's own conventions would use
  (SWR-3112) — asked of the adapter, never derived here.

**This lives under ``services/`` because it is a service.** It was written beside
the Qt panels, and ``services/requirements_actions.workspace_editing`` imported
*up* into ``widgets/`` to reach it — a dependency pointing the wrong way, and the
place future source-kind knowledge would have accreted as SWR-3122 and SWR-3118
multiply the kinds. Widgets now keep only widgets.

The value objects here are frozen dataclasses rather than Pydantic models, which
is the desktop layer's idiom (``models/requirements_state.py``): they cross Qt
signals inside one process and never a file or a wire, and the engine's own
Pydantic models are what they are built from.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

from rotaris.models.state import NoticeSeverity, UiNotice

if TYPE_CHECKING:
    from collections.abc import Collection, Iterable

    from rotaris_core.requirements.sources.base import (
        RequirementDraft,
        RequirementEdit,
        RequirementSource,
    )
    from rotaris_core.requirements.writeback import RequirementWriteBack

__all__ = [
    "NOTHING_TO_SAVE",
    "ORIGIN_REQUIRED",
    "TARGET_UNSTATED",
    "TITLE_REQUIRED",
    "VERSION_FACT",
    "CreationOutcome",
    "CreationTarget",
    "EditInput",
    "EditOutcome",
    "NewRequirement",
    "RequirementEditing",
    "SourceOption",
    "creation_sources",
    "preview_target",
]

#: Why a creation is refused before the store is touched. Stated as values
#: because the form shows them and a test asserts them; the store's own
#: :func:`~rotaris_core.requirements.writeback.validate_draft` refuses the same
#: two things at the door, and this is only the earlier, kinder telling of it.
ORIGIN_REQUIRED = (
    "A technical requirement must name the requirement whose implementation made it "
    "necessary; without it the project's own requirement check refuses the file."
)
TITLE_REQUIRED = "A requirement needs a title: the store builds its file name from it."
TARGET_UNSTATED = (
    "Rotaris has not resolved where this would be written yet. "
    "Nothing is created until the location is stated."
)

#: What the editor says when Save would write nothing. An edit that changes
#: nothing is not an error and must not read like one.
NOTHING_TO_SAVE = "Nothing has changed, so there is nothing to write."

#: The fact the projection states the requirement's current version under
#: (``_requirement_section``). Named here because the editor aims its write at
#: exactly that version and a renamed fact must break loudly, not silently
#: disarm the conflict check (SWR-3111).
VERSION_FACT = "Current hash"


# ── the sources a creation may target (SWR-3105, SWR-3606) ─────────────────


@traces(SWR.SWR_3606, SWR.SWR_3105)
@dataclass(frozen=True)
class SourceOption:
    """One requirement source, and what it will accept.

    Carried rather than looked up again at the moment of the write: the whole
    point of SWR-3105 is that a consumer holding a requirement — or a source —
    already knows whether offering an action would be honest.
    """

    source_id: str
    location: str = ""
    can_create: bool = False

    @property
    def label(self) -> str:
        """``reqtocode — docs/requirements``, or just the id when it has no path."""
        return f"{self.source_id} — {self.location}" if self.location else self.source_id


@traces(SWR.SWR_3606, SWR.SWR_3105)
def creation_sources(sources: Iterable[RequirementSource]) -> tuple[SourceOption, ...]:
    """The sources a requirement may be created in, in configuration order.

    Filtered on the declared capability, never on a trial write: a source that
    would raise on ``create`` and one that says it cannot create look identical
    to a user, and only the second is an honest offer (SWR-3606's first
    acceptance criterion).
    """
    from rotaris_core.requirements.model import SourceCapability

    return tuple(
        SourceOption(
            source_id=source.source_id,
            location=_location_of(source),
            can_create=True,
        )
        for source in sources
        if source.capabilities.can(SourceCapability.CREATE)
    )


def _location_of(source: RequirementSource) -> str:
    """Where a source keeps its artefacts, when the adapter can say.

    Asked structurally rather than by importing an adapter: a file-backed store
    exposes ``store_path`` (the one Rotaris ships does), and one that keeps its
    requirements in a tracker simply has no path to show. Neither is an error.
    """
    store = getattr(source, "store_path", None)
    return str(store) if isinstance(store, Path) else ""


# ── what a creation would write, before it writes it (SWR-3606) ────────────


@traces(SWR.SWR_3606, SWR.SWR_3112)
@dataclass(frozen=True)
class CreationTarget:
    """Where a creation will land, resolved from the store's own conventions.

    ``known`` false is a real answer, not a failure: an adapter that cannot name
    a location before the write says so, and the form shows *that* rather than a
    plausible path it made up.
    """

    source_id: str
    req_id: str = ""
    path: str = ""
    index_path: str = ""
    #: Why the location could not be resolved. Empty when it could.
    reason: str = ""

    @property
    def known(self) -> bool:
        """Whether the artefact's location is resolved."""
        return bool(self.path)

    @property
    def sentence(self) -> str:
        """One line naming the id, the file and the index the creation touches."""
        if not self.known:
            return f"{self.source_id}: {self.reason or 'the location is not known yet'}"
        where = f"{self.req_id} will be written to {self.path}"
        return f"{where}, and listed in {self.index_path}" if self.index_path else where


@traces(SWR.SWR_3606, SWR.SWR_3112)
def preview_target(
    source: RequirementSource,
    form: NewRequirement,
    *,
    used_ids: Collection[str] | None = None,
) -> CreationTarget:
    """The id and the path *form* would be created under, without writing.

    **The adapter answers; this translates.** Where a creation lands is the
    store's own convention — which id block an epic allocates from, which folder
    its index points at, how a file name is built — and this surface asks for it
    through :func:`~rotaris_core.requirements.sources.base.preview_of`, the
    ask-first check beside ``history_of``. The answer comes from the same call
    the write makes, so the path shown before the write is the path the write
    produces, by construction rather than by two rules agreeing.

    A source that declares no preview is not an error: it gets the stated "cannot
    name a location yet" sentence, which is the honest answer for a tracker that
    issues ids on submit (SWR-3606).
    """
    from rotaris_core.requirements.sources.base import preview_of
    from rotaris_core.requirements.writeback import CreationError, WriteBackError

    preview = preview_of(source)
    if preview is None:
        return CreationTarget(
            source_id=source.source_id,
            reason=(
                f"{source.source_id} does not name a file location for a new requirement "
                "before it is created."
            ),
        )
    try:
        planned = preview.preview_creation(form.to_draft(), used_ids=used_ids)
    except (CreationError, WriteBackError, OSError) as error:
        return CreationTarget(source_id=source.source_id, reason=str(error))
    return CreationTarget(
        source_id=source.source_id,
        req_id=planned.req_id,
        path=planned.path,
        index_path=planned.index_path or "",
    )


# ── the two things a user types (SWR-3605, SWR-3606) ───────────────────────


@traces(SWR.SWR_3605)
@dataclass(frozen=True)
class EditInput:
    """What the user changed about one requirement, and against which version.

    :attr:`expected_hash` is the version the form was opened on. It travels into
    the write so a source that moved underneath is refused with a stated conflict
    rather than silently overwritten (SWR-3111).
    """

    req_id: str
    title: str = ""
    description: str = ""
    expected_hash: str = ""

    def changes(self, *, title: str, description: str) -> tuple[str, ...]:
        """Which fields differ from the values *this* input was opened on."""
        moved: list[str] = []
        if self.title.strip() != title.strip():
            moved.append("title")
        if self.description.strip() != description.strip():
            moved.append("description")
        return tuple(moved)

    def to_edit(self, *, title: str, description: str) -> RequirementEdit:
        """The adapter's own edit value, carrying only what actually changed.

        Only the changed fields, because an edit that restates every field would
        rewrite the artefact's title line on a description change and produce a
        diff the user did not make (SWR-3111).
        """
        from rotaris_core.requirements.sources.base import RequirementEdit as Edit

        moved = self.changes(title=title, description=description)
        return Edit(
            title=self.title if "title" in moved else None,
            description=self.description if "description" in moved else None,
            expected_hash=self.expected_hash or None,
        )


@traces(SWR.SWR_3606)
@dataclass(frozen=True)
class NewRequirement:
    """A requirement a user is composing, before any store has seen it.

    Pure: it validates itself, and turns into the adapter's own
    :class:`~rotaris_core.requirements.sources.base.RequirementDraft` only when
    it is about to be written.
    """

    title: str = ""
    description: str = ""
    source_id: str = ""
    #: The epic this requirement belongs under (SWR-3108). Optional: a store
    #: without epics simply has none.
    parent: str = ""
    #: Technical rather than product (SWR-3411) — the classification that decides
    #: whether an origin is mandatory.
    technical: bool = False
    #: The requirement whose implementation made this technical one necessary.
    origin: str = ""

    @property
    def problems(self) -> tuple[str, ...]:
        """Every reason this cannot be created, in the order a form shows them."""
        found: list[str] = []
        if not self.title.strip():
            found.append(TITLE_REQUIRED)
        if not self.source_id.strip():
            found.append("Choose the requirement source this will be created in.")
        if self.technical and not self.origin.strip():
            found.append(ORIGIN_REQUIRED)
        return tuple(found)

    @property
    def valid(self) -> bool:
        """Whether the store would accept this draft."""
        return not self.problems

    def to_draft(self) -> RequirementDraft:
        """The adapter's own draft: classification, origin and epic included."""
        from rotaris_core.requirements.model import Relation, RelationKind, RequirementType
        from rotaris_core.requirements.sources.base import RequirementDraft as Draft

        relations = (
            (Relation(kind=RelationKind.DERIVED_FROM, target=self.origin.strip()),)
            if self.technical and self.origin.strip()
            else ()
        )
        return Draft(
            title=self.title.strip(),
            description=self.description.strip(),
            req_type=RequirementType.TECHNICAL if self.technical else RequirementType.PRODUCT,
            parent=self.parent.strip() or None,
            relations=relations,
        )


# ── what came back (SWR-3605, SWR-3606) ────────────────────────────────────


@traces(SWR.SWR_3605, SWR.SWR_3111)
@dataclass(frozen=True)
class EditOutcome:
    """The result of one write-back attempt, with the user's input kept.

    :attr:`preserved` is the requirement, not a convenience: a refused write, a
    hash conflict and an unreadable artefact all end here, and each of them would
    otherwise cost the user everything they typed.
    """

    req_id: str
    written: bool = False
    reason: str = ""
    changed_paths: tuple[str, ...] = ()
    requirement_hash: str = ""
    preserved: EditInput | None = None

    @property
    def ok(self) -> bool:
        """Whether the source now holds the edit."""
        return self.written and not self.reason

    @property
    def message(self) -> str:
        """One line: what the write did, or why it did not happen."""
        if self.ok:
            where = ", ".join(self.changed_paths) or "its own artefact"
            return f"{self.req_id} was written to {where}."
        return self.reason or NOTHING_TO_SAVE

    def notice(self) -> UiNotice:
        """The persistent banner this outcome deserves (Rotaris UX standards)."""
        return UiNotice(
            id=f"requirement-edit-{self.req_id}",
            severity=NoticeSeverity.SUCCESS if self.ok else NoticeSeverity.ERROR,
            title=f"{self.req_id} saved" if self.ok else f"{self.req_id} was not saved",
            message=self.message,
            persistent=not self.ok,
        )


@traces(SWR.SWR_3606, SWR.SWR_3112)
@dataclass(frozen=True)
class CreationOutcome:
    """The result of one creation attempt, with the composed requirement kept."""

    req_id: str = ""
    written: bool = False
    reason: str = ""
    changed_paths: tuple[str, ...] = ()
    preserved: NewRequirement | None = None

    @property
    def ok(self) -> bool:
        """Whether the store now holds the requirement."""
        return self.written and not self.reason

    @property
    def message(self) -> str:
        """One line: what was created and where, or why nothing was."""
        if self.ok:
            where = ", ".join(self.changed_paths) or "the chosen source"
            return f"{self.req_id} was created in {where}."
        return self.reason or "The requirement was not created."

    def notice(self) -> UiNotice:
        """The persistent banner this outcome deserves."""
        title = f"{self.req_id} created" if self.ok else "The requirement was not created"
        return UiNotice(
            id="requirement-creation",
            severity=NoticeSeverity.SUCCESS if self.ok else NoticeSeverity.ERROR,
            title=title,
            message=self.message,
            persistent=not self.ok,
        )


# ── the write seam (SWR-3111, SWR-3112) ────────────────────────────────────


@traces(SWR.SWR_3605, SWR.SWR_3606, SWR.SWR_3111, SWR.SWR_3112)
class RequirementEditing:
    """The editor's one door into the project's own requirement store.

    Wraps :class:`~rotaris_core.requirements.writeback.RequirementWriteBack` and
    adds exactly two things a *surface* owes on top of it: every failure becomes
    a value carrying the user's input, and nothing raises across the Qt boundary
    — an exception on the event loop is a crash, and "the file is read-only" is
    not a crash.

    It writes requirement **text** and nothing else. No delivery state, no run,
    no evidence: those follow from the ordinary evaluation of the changed source
    (SWR-3502), and a shortcut here would be the special case SWR-3605's fourth
    acceptance criterion forbids.
    """

    def __init__(self, writeback: RequirementWriteBack) -> None:
        self._writeback = writeback

    @property
    def writeback(self) -> RequirementWriteBack:
        """The adapter-side write path this editor uses."""
        return self._writeback

    @traces(SWR.SWR_3606, SWR.SWR_3105)
    def creation_sources(self) -> tuple[SourceOption, ...]:
        """The sources that declared the ``create`` capability."""
        return creation_sources(self._writeback.sources())

    @traces(SWR.SWR_3606)
    def preview(self, form: NewRequirement) -> CreationTarget:
        """Where *form* would be written, resolved before anything is written."""
        source = next(
            (one for one in self._writeback.sources() if one.source_id == form.source_id),
            None,
        )
        if source is None:
            return CreationTarget(
                source_id=form.source_id,
                reason=f"No configured requirement source is named {form.source_id!r}.",
            )
        return preview_target(source, form)

    @traces(SWR.SWR_3605, SWR.SWR_3111)
    def apply(self, edit: EditInput, *, title: str, description: str) -> EditOutcome:
        """Write *edit* into the artefact its requirement came from.

        *title* and *description* are the values the form was **opened** on, so
        the adapter receives only what the user actually changed. An edit that
        changes nothing writes nothing and says so — the store must not gain a
        commit for a save nobody made.
        """
        from rotaris_core.requirements.writeback import WriteBackError

        if not edit.changes(title=title, description=description):
            return EditOutcome(req_id=edit.req_id, reason=NOTHING_TO_SAVE, preserved=edit)
        try:
            outcome = self._writeback.update(
                edit.req_id,
                edit.to_edit(title=title, description=description),
            )
        except (WriteBackError, OSError) as error:
            return EditOutcome(
                req_id=edit.req_id,
                reason=f"{edit.req_id} could not be written: {error}",
                preserved=edit,
            )
        if not outcome.ok:
            return EditOutcome(req_id=edit.req_id, reason=outcome.reason, preserved=edit)
        written = outcome.requirement
        return EditOutcome(
            req_id=edit.req_id,
            written=True,
            changed_paths=outcome.changed_paths,
            requirement_hash=written.current_hash if written is not None else "",
        )

    @traces(SWR.SWR_3606, SWR.SWR_3112)
    def create(self, form: NewRequirement) -> CreationOutcome:
        """Create *form* in the source it names, under that store's conventions."""
        from rotaris_core.requirements.writeback import CreationError, WriteBackError

        problems = form.problems
        if problems:
            return CreationOutcome(reason=" ".join(problems), preserved=form)
        try:
            outcome = self._writeback.create(form.to_draft(), source_id=form.source_id)
        except (CreationError, WriteBackError, OSError) as error:
            return CreationOutcome(
                reason=f"The requirement could not be created: {error}",
                preserved=form,
            )
        if not outcome.ok:
            return CreationOutcome(reason=outcome.reason, preserved=form)
        created = outcome.requirement
        return CreationOutcome(
            req_id=created.req_id if created is not None else "",
            written=True,
            changed_paths=outcome.changed_paths,
        )
