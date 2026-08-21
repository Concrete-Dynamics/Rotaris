"""Writing an edit back into the artefact it came from (SWR-3111), and creating a
requirement the way the target store already creates them (SWR-3112).

Rotaris must not become the place where requirements diverge from the project's
own store. An edit made in Rotaris therefore travels back into the *originating*
artefact, in that artefact's own format — and a requirement Rotaris creates has
to be indistinguishable from one the team wrote by hand, or the project's own
tooling (here: ReqToCode's verifier and its epic index) rejects it.

Three properties are load-bearing and are asserted by the tests, not assumed:

- **Surgical.** :class:`MarkdownRequirementDocument` keeps every frontmatter line
  it did not change *verbatim* — order, quoting style, unmodelled keys, the body
  sections the canonical model knows nothing about. ``parse(text).render() ==
  text`` holds for any document, which is what makes "changes exactly one field"
  checkable rather than hopeful.
- **Atomic, or nothing.** :func:`atomic_write_text` writes a sibling temporary
  file and moves it over the target in one step. A failure anywhere — encoding,
  disk, a refused rename — leaves the artefact byte-identical and removes the
  temporary file. The replace step is injected so that failure path is a test,
  not a thought experiment.
- **The source owns the hash.** :meth:`RequirementWriteBack.update` re-reads the
  source after the write and returns *that* requirement. What an adapter claims
  it wrote is never taken as the new ``current_hash`` (SWR-3111): only the source
  can say what it now holds, and every downstream comparison —
  ``satisfied_hash`` (SWR-3204), change detection (SWR-3501) — is built on that
  value being real.

**Nothing is written that was not asked for.** A write into a source lacking the
``update`` capability is refused *before* the source is touched, and the refusal
is a value (:class:`~rotaris_core.requirements.sources.base.WriteRefusal`) the
caller can show (SWR-3105, SWR-3605). An edit carrying an ``expected_hash`` that
no longer matches is a reported conflict, not a lost edit. An edit that changes
nothing writes nothing.

The Markdown half of this module is deliberately concrete: it knows the shape of
a ReqToCode requirement document (frontmatter keys, ``# SWR-<n> — Title``
heading, prose before the first ``##`` section) because SWR-3112 is a statement
about *conventions*, and a convention expressed as an abstraction is no
convention at all. A source adapter for another store maps its own format onto
:class:`~rotaris_core.requirements.sources.base.RequirementEdit` and reuses
:func:`atomic_write_text`.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import os
import re
import tempfile
from dataclasses import dataclass
from dataclasses import replace as dataclass_replace
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.model import (
    CanonicalRequirement,
    RelationKind,
    RequirementLifecycle,
    RequirementType,
    SourceCapability,
    requirement_sort_key,
)
from rotaris_core.requirements.sources.base import (
    RequirementDraft,
    RequirementEdit,
    RequirementSource,
    WritableRequirementSource,
    WriteRefusal,
    refusal_for,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Collection, Iterable, Sequence
    from pathlib import Path

__all__ = [
    "FRONTMATTER_KEYS",
    "CreationError",
    "HashConflict",
    "MarkdownArtifactWriter",
    "MarkdownRequirementDocument",
    "MarkdownStoreLayout",
    "MarkdownStoreWriter",
    "RequirementCreation",
    "RequirementWriteBack",
    "SourceProvider",
    "WriteBackError",
    "WriteBackOutcome",
    "allocate_requirement_id",
    "apply_edit",
    "atomic_write_text",
    "epic_index_row",
    "mirror_into_epic_index",
    "remove_from_epic_index",
    "render_requirement_document",
    "requirement_filename",
    "requirement_slug",
    "validate_draft",
]

#: Signature of the "move the finished file into place" step. Injected so the
#: failure half of SWR-3111 — "a failed write leaves the artefact byte-identical"
#: — is exercised by a test instead of being asserted in prose.
type Replacer = Callable[[str, str], None]


class WriteBackError(RuntimeError):
    """A write-back could not be carried out, with the reason stated."""


class CreationError(RuntimeError):
    """A requirement could not be created under the target store's conventions."""


# --------------------------------------------------------------------------
# Atomic artefact writes (SWR-3111)
# --------------------------------------------------------------------------


@traces(SWR.SWR_3111)
def atomic_write_text(
    path: Path,
    text: str,
    *,
    encoding: str = "utf-8",
    replace: Replacer = os.replace,
) -> None:
    """Replace *path*'s content in one step, or leave it exactly as it was.

    The temporary file is created *beside* the target so the final move stays
    within one filesystem and is therefore atomic; on any failure it is removed
    again and the original bytes are untouched. ``newline=""`` disables newline
    translation: the caller renders the document with the line endings the
    artefact already used, and this must not silently rewrite them.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    handle_fd, tmp_name = tempfile.mkstemp(
        dir=str(path.parent),
        prefix=f".{path.name}.",
        suffix=".tmp",
    )
    try:
        with os.fdopen(handle_fd, "w", encoding=encoding, newline="") as handle:
            handle.write(text)
        replace(tmp_name, str(path))
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp_name)
        raise


# --------------------------------------------------------------------------
# The Markdown requirement document (SWR-3111)
# --------------------------------------------------------------------------

_KEY_RE = re.compile(r"^([A-Za-z][A-Za-z0-9_-]*):(.*)$")
_FENCE = "---"
_H1_RE = re.compile(r"^#\s+(?P<id>\S+)\s+(?P<dash>[—–-])\s+(?P<title>.*)$")

#: A per-id section heading in a multi-id spec file (ReqToCode's SWR-2330). The
#: same shape ``generator._BLOCK_HEADING_RE`` recognises, so the prose this
#: module attributes to an id is the prose the parser attributed to it.
_SECTION_RE = re.compile(r"^#{2,6}[ \t]+(?P<id>SWR-\d+)")

#: A ``key: value`` metadata line at the top of such a section.
_METADATA_LINE_RE = re.compile(r"^[a-z][a-z-]*:")

#: Canonical model field -> frontmatter key in a ReqToCode-shaped store. The map
#: is data so a test can state the whole contract in one assertion instead of
#: re-deriving it from the writer's branches.
FRONTMATTER_KEYS: dict[str, str] = {
    "req_id": "req-id",
    "title": "title",
    "lifecycle": "status",
    "req_type": "type",
    "parent": "epic",
    "trace_required": "trace",
    "test_required": "test",
}

#: The one relation kind this document format expresses (ReqToCode's SWR-2331).
DERIVED_FROM_KEY = "derived-from"


@dataclass(frozen=True, slots=True)
class FrontmatterField:
    """One frontmatter entry, with the exact source lines that produced it.

    ``lines`` is what gets re-emitted for an untouched field, which is the whole
    reason this is not a plain ``dict[str, str]``: a value wrapped across
    continuation lines, an unusual quoting style or an alignment convention
    survives an edit to a *different* field.
    """

    key: str
    value: str
    lines: tuple[str, ...]
    quoted: bool = False


def _split_value(raw: str) -> tuple[str, bool]:
    value = raw.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1], True
    return value, False


def _render_value(value: str, *, quoted: bool) -> str:
    return f'"{value}"' if quoted else value


@traces(SWR.SWR_3111)
@dataclass(frozen=True, slots=True)
class MarkdownRequirementDocument:
    """A Markdown requirement artefact, editable one field at a time.

    Round-trip exact: ``parse(text).render() == text``. Every edit method returns
    a new document, so a caller can build the result, compare it with what is on
    disk and skip the write entirely when nothing moved.
    """

    fields: tuple[FrontmatterField, ...]
    body: tuple[str, ...]
    newline: str = "\n"
    open_fence: str = _FENCE
    close_fence: str = _FENCE
    has_frontmatter: bool = True

    # -- parsing / rendering -------------------------------------------------

    @classmethod
    def parse(cls, text: str) -> Self:
        """Read *text* without normalising anything."""
        newline = "\r\n" if "\r\n" in text else "\n"
        lines = text.split(newline)
        if not lines or lines[0].strip() != _FENCE:
            return cls(fields=(), body=tuple(lines), newline=newline, has_frontmatter=False)

        closing = next(
            (index for index in range(1, len(lines)) if lines[index].strip() == _FENCE),
            None,
        )
        if closing is None:
            # Unterminated frontmatter: the same call ReqToCode's parser makes —
            # treat the file as having none rather than inventing a boundary.
            return cls(fields=(), body=tuple(lines), newline=newline, has_frontmatter=False)

        fields: list[FrontmatterField] = []
        for line in lines[1:closing]:
            match = _KEY_RE.match(line)
            if match is not None:
                value, quoted = _split_value(match.group(2))
                fields.append(
                    FrontmatterField(key=match.group(1), value=value, lines=(line,), quoted=quoted),
                )
                continue
            if fields:
                previous = fields[-1]
                fields[-1] = dataclass_replace(
                    previous,
                    value=f"{previous.value} {line.strip()}".strip(),
                    lines=(*previous.lines, line),
                )
        return cls(
            fields=tuple(fields),
            body=tuple(lines[closing + 1 :]),
            newline=newline,
            open_fence=lines[0],
            close_fence=lines[closing],
        )

    def render(self) -> str:
        """The document as text, byte-identical where nothing was changed."""
        if not self.has_frontmatter:
            return self.newline.join(self.body)
        lines = [self.open_fence]
        for field in self.fields:
            lines.extend(field.lines)
        lines.append(self.close_fence)
        lines.extend(self.body)
        return self.newline.join(lines)

    # -- frontmatter ---------------------------------------------------------

    def keys(self) -> tuple[str, ...]:
        """Frontmatter keys in the order the artefact declares them."""
        return tuple(field.key for field in self.fields)

    def get(self, key: str) -> str | None:
        """The logical value of *key*, or ``None`` when it is not declared."""
        return next((field.value for field in self.fields if field.key == key), None)

    def with_field(self, key: str, value: str | None) -> Self:
        """Set, replace or (with ``None``) remove one frontmatter field.

        A new key is appended at the end of the block rather than inserted at a
        guessed position: the store's own field order is the store's business,
        and appending is the only edit that cannot reorder what is already there.
        """
        if value is None:
            return dataclass_replace(
                self,
                fields=tuple(field for field in self.fields if field.key != key),
            )
        updated: list[FrontmatterField] = []
        replaced = False
        for field in self.fields:
            if field.key != key:
                updated.append(field)
                continue
            rendered = f"{key}: {_render_value(value, quoted=field.quoted)}"
            updated.append(
                FrontmatterField(key=key, value=value, lines=(rendered,), quoted=field.quoted),
            )
            replaced = True
        if not replaced:
            quoted = key == "title"
            rendered = f"{key}: {_render_value(value, quoted=quoted)}"
            updated.append(
                FrontmatterField(key=key, value=value, lines=(rendered,), quoted=quoted),
            )
        return dataclass_replace(self, fields=tuple(updated))

    # -- body ----------------------------------------------------------------

    def _heading_index(self) -> int | None:
        return next(
            (index for index, line in enumerate(self.body) if line.startswith("# ")),
            None,
        )

    def _description_span(self) -> tuple[int, int]:
        """Half-open line range of the prose the canonical ``description`` maps to.

        The prose between the ``# SWR-<n> — Title`` heading and the first ``##``
        section: everything below that heading is structure the canonical model
        does not represent (acceptance criteria, the test-portfolio table, the
        epic link) and an edit must leave it alone.
        """
        heading = self._heading_index()
        start = 0 if heading is None else heading + 1
        end = next(
            (index for index in range(start, len(self.body)) if self.body[index].startswith("## ")),
            len(self.body),
        )
        return start, end

    @property
    def description(self) -> str:
        """The document's requirement prose, without its surrounding blank lines."""
        start, end = self._description_span()
        return self.newline.join(self.body[start:end]).strip()

    def with_description(self, text: str) -> Self:
        """Replace the requirement prose, leaving every other section untouched.

        The blank line either side is restored rather than preserved: they are
        the paragraph separators the store's own format uses, and the replaced
        span is bounded by the heading above and the next ``##`` section below.
        """
        start, end = self._description_span()
        paragraph = text.strip().replace("\r\n", "\n").replace("\r", "\n").split("\n")
        span: tuple[str, ...] = ("", *paragraph, "")
        return dataclass_replace(self, body=(*self.body[:start], *span, *self.body[end:]))

    def section_description(self, req_id: str) -> str | None:
        """The prose of this document's ``## <req_id> — Title`` section.

        A multi-id spec file (SWR-2330) declares several requirements in one
        document, each under its own ``## SWR-<n>`` heading; the prose of *that*
        section is the requirement's description, and the file preamble is not.
        Without this, every id in such a file would carry the same text and
        therefore the same content hash — which is precisely the collision
        SWR-3107 exists to prevent.

        The leading ``key: value`` lines of a section are ReqToCode's per-id
        metadata overrides, not prose, and are skipped by the same rule the
        parser applies (``generator._read_override_fields``). ``None`` means the
        document has no section for *req_id*.
        """
        start: int | None = None
        for index, line in enumerate(self.body):
            heading = _SECTION_RE.match(line)
            if heading is not None and heading.group("id") == req_id:
                start = index
                break
        if start is None:
            return None
        end = next(
            (
                index
                for index in range(start + 1, len(self.body))
                if _SECTION_RE.match(self.body[index]) is not None
            ),
            len(self.body),
        )
        lines = list(self.body[start + 1 : end])
        while lines and not lines[0].strip():
            lines.pop(0)
        while lines and _METADATA_LINE_RE.match(lines[0].strip()) is not None:
            lines.pop(0)
        return self.newline.join(lines).strip()

    @property
    def heading_title(self) -> str | None:
        """The title as the ``# SWR-<n> — Title`` heading states it."""
        index = self._heading_index()
        if index is None:
            return None
        match = _H1_RE.match(self.body[index])
        return match.group("title").strip() if match is not None else None

    def with_title(self, title: str) -> Self:
        """Set the title in the frontmatter *and* in the heading that repeats it.

        Both, because they are one fact written twice: ReqToCode falls back to
        the heading when a document has no ``title`` field, so updating only the
        frontmatter would leave a document whose two titles disagree.
        """
        updated = self.with_field("title", title)
        index = updated._heading_index()
        if index is None:
            return updated
        match = _H1_RE.match(updated.body[index])
        if match is None:
            return updated
        heading = f"# {match.group('id')} {match.group('dash')} {title}"
        return dataclass_replace(
            updated,
            body=(*updated.body[:index], heading, *updated.body[index + 1 :]),
        )


@traces(SWR.SWR_3111)
def apply_edit(
    document: MarkdownRequirementDocument,
    edit: RequirementEdit,
) -> MarkdownRequirementDocument:
    """Apply *edit* to *document*, touching only the fields the edit sets.

    Raises :class:`WriteBackError` for a relation kind this document format
    cannot express. Dropping it silently would lose an authored relation on the
    way into the file, and a lost relation is invisible until change propagation
    (SWR-3109, SWR-3502) draws the wrong conclusion from its absence.
    """
    result = document
    if edit.title is not None:
        result = result.with_title(edit.title)
    if edit.description is not None:
        result = result.with_description(edit.description)
    if edit.lifecycle is not None:
        result = result.with_field(FRONTMATTER_KEYS["lifecycle"], str(edit.lifecycle))
    if edit.req_type is not None:
        result = result.with_field(FRONTMATTER_KEYS["req_type"], str(edit.req_type))
    if edit.parent is not None:
        result = result.with_field(FRONTMATTER_KEYS["parent"], edit.parent)
    if edit.trace_required is not None:
        result = result.with_field(
            FRONTMATTER_KEYS["trace_required"],
            "required" if edit.trace_required else "optional",
        )
    if edit.test_required is not None:
        result = result.with_field(
            FRONTMATTER_KEYS["test_required"],
            "required" if edit.test_required else "optional",
        )
    if edit.relations is not None:
        result = _apply_relations(result, edit.relations)
    return result


def _apply_relations(
    document: MarkdownRequirementDocument,
    relations: Sequence[object],
) -> MarkdownRequirementDocument:
    derived: list[str] = []
    parent: str | None = None
    for relation in relations:
        kind = getattr(relation, "kind", None)
        target = str(getattr(relation, "target", ""))
        if kind is RelationKind.DERIVED_FROM:
            derived.append(target)
        elif kind is RelationKind.PARENT:
            parent = target
        else:
            raise WriteBackError(
                f"a ReqToCode requirement document cannot express the relation kind"
                f" {str(kind)!r}; write it in the store's own format instead",
            )
    result = document
    if parent is not None:
        result = result.with_field(FRONTMATTER_KEYS["parent"], parent)
    if derived:
        value = derived[0] if len(derived) == 1 else f"[{', '.join(sorted(derived))}]"
        result = result.with_field(DERIVED_FROM_KEY, value)
    return result


@traces(SWR.SWR_3111)
class MarkdownArtifactWriter:
    """Applies an edit to one Markdown artefact, atomically and in place."""

    def __init__(self, *, replace: Replacer = os.replace) -> None:
        self._replace = replace

    def apply(self, path: Path, edit: RequirementEdit) -> str:
        """Write *edit* into *path* and return the artefact's new text.

        An edit that produces the text already on disk performs no write at all:
        the artefact's modification identity is what an incremental refresh keys
        on (SWR-3116), and moving it for a no-op edit would invalidate every
        cached read for nothing.
        """
        text = path.read_text(encoding="utf-8")
        updated = apply_edit(MarkdownRequirementDocument.parse(text), edit).render()
        if updated != text:
            atomic_write_text(path, updated, replace=self._replace)
        return updated

    def create(self, path: Path, text: str) -> None:
        """Write a *new* artefact, refusing to overwrite an existing one."""
        if path.exists():
            raise CreationError(f"{path} already exists; creation never overwrites")
        atomic_write_text(path, text, replace=self._replace)


# --------------------------------------------------------------------------
# Creation conventions (SWR-3112)
# --------------------------------------------------------------------------

_ID_NUMBER_RE = re.compile(r"^(?P<prefix>[A-Za-z]+)-(?P<number>\d+)$")
_SLUG_STRIP_RE = re.compile(r"[^a-z0-9]+")

#: Size of an epic's id block in a ReqToCode store: ``SWR-3100`` owns
#: ``SWR-3101`` … ``SWR-3199``. The convention this repository's store already
#: follows, which is exactly what SWR-3112 asks a created requirement to obey.
EPIC_BLOCK_SIZE = 100


def _id_number(req_id: str, prefix: str) -> int | None:
    match = _ID_NUMBER_RE.match(req_id.strip())
    if match is None or match.group("prefix").upper() != prefix.upper():
        return None
    return int(match.group("number"))


@traces(SWR.SWR_3112, SWR.SWR_3113)
def allocate_requirement_id(
    *,
    used_ids: Collection[str],
    retired_ids: Collection[str] = (),
    epic: str | None = None,
    prefix: str = "SWR",
    block_size: int = EPIC_BLOCK_SIZE,
) -> str:
    """The next free id under the store's convention.

    Never issues an id that is in use *or* that only exists as a tombstone
    (SWR-3113): an id that once meant something must never mean something else,
    and Rotaris still holds delivery state and run history under the retired one.

    With an *epic*, the id is allocated inside that epic's block — the layout the
    store already uses — and an exhausted block is an error rather than a silent
    spill into the next epic's numbers.
    """
    taken = {
        number
        for number in (_id_number(value, prefix) for value in (*used_ids, *retired_ids))
        if number is not None
    }
    if epic is None:
        start = max(taken, default=0) + 1
        return f"{prefix}-{start}"

    epic_number = _id_number(epic, prefix)
    if epic_number is None:
        raise CreationError(f"cannot allocate an id under epic {epic!r}: not a {prefix}-<n> id")
    base = epic_number - (epic_number % block_size)
    candidate = next(
        (number for number in range(base + 1, base + block_size) if number not in taken),
        None,
    )
    if candidate is None:
        raise CreationError(
            f"epic {epic} has no free id left in {prefix}-{base + 1}"
            f"…{prefix}-{base + block_size - 1}",
        )
    return f"{prefix}-{candidate}"


@traces(SWR.SWR_3112)
def requirement_slug(title: str, *, max_words: int = 8) -> str:
    """The file-name slug this store builds from a requirement title."""
    words = [word for word in _SLUG_STRIP_RE.split(title.casefold()) if word]
    if not words:
        return "requirement"
    return "-".join(words[:max_words])


@traces(SWR.SWR_3112)
def requirement_filename(req_id: str, title: str) -> str:
    """``SWR-3111-requirement-write-back.md`` — the store's own file naming."""
    return f"{req_id}-{requirement_slug(title)}.md"


@traces(SWR.SWR_3112)
def validate_draft(draft: RequirementDraft) -> None:
    """Refuse a draft the target store's own check would reject.

    Mirrors ReqToCode's ``check_technical_links`` (SWR-2331) at creation time
    rather than after the fact: a technical requirement must name the origin that
    made it necessary, and only a technical requirement may. Creating the file
    first and discovering that from a failing ``reqtocode check`` would leave the
    user with a broken store to repair by hand.
    """
    origins = [
        relation.target
        for relation in draft.relations
        if relation.kind is RelationKind.DERIVED_FROM
    ]
    if draft.req_type is RequirementType.TECHNICAL and not origins:
        raise CreationError(
            "a technical requirement must declare derived-from naming the"
            " requirement whose implementation made it necessary (SWR-2331)",
        )
    if origins and draft.req_type is not RequirementType.TECHNICAL:
        raise CreationError(
            "derived-from is only valid on a technical requirement;"
            " set req_type=technical or drop the relation (SWR-2331)",
        )
    if not draft.title.strip():
        raise CreationError("a requirement needs a title; the store's file name is built from it")


@traces(SWR.SWR_3112)
def render_requirement_document(
    *,
    req_id: str,
    title: str,
    description: str,
    date_text: str,
    epic_id: str | None = None,
    epic_link: str | None = None,
    lifecycle: RequirementLifecycle = RequirementLifecycle.DRAFT,
    req_type: RequirementType = RequirementType.PRODUCT,
    derived_from: Sequence[str] = (),
    derived_link: str | None = None,
    trace_required: bool = True,
    test_required: bool = True,
) -> str:
    """Render a new requirement document from the store's own template.

    Follows ``docs/requirements/TEMPLATE.md`` — field order, the two variants,
    the placeholder test-portfolio table — because "indistinguishable from one
    the team created by hand" is the requirement (SWR-3112), and a
    Rotaris-flavoured layout would be recognisable at a glance and would drift
    from the template the moment either changed.

    Pure: the date is passed in rather than read from a clock.
    """
    technical = req_type is RequirementType.TECHNICAL
    lines = [
        _FENCE,
        f"req-id: {req_id}",
        f"status: {lifecycle}",
        f"trace: {'required' if trace_required else 'optional'}",
        f"test: {'required' if test_required else 'optional'}",
    ]
    if technical:
        lines.append("type: technical")
        joined = derived_from[0] if len(derived_from) == 1 else f"[{', '.join(derived_from)}]"
        lines.append(f"derived-from: {joined}")
    lines.append(f'title: "{title}"')
    if epic_id:
        lines.append(f"epic: {epic_id}")
    lines.extend([f"date: {date_text}", _FENCE, "", f"# {req_id} — {title}", ""])
    lines.extend(description.strip().split("\n") if description.strip() else [""])
    lines.append("")
    if technical:
        lines.extend(
            [
                "## Test coverage",
                "",
                "Describe the unit and/or integration coverage appropriate to this seam and name",
                "the originating product flow enabled by `derived-from`.",
                "",
            ],
        )
        if derived_link:
            lines.extend([f"Derived from: {derived_link}", ""])
    else:
        lines.extend(
            [
                "## Test portfolio",
                "",
                "| Level | Productive scenario | Exercised boundary | Planned/covering test |",
                "| --- | --- | --- | --- |",
                "| Unit | ... | ... | ... |",
                "| Integration | ... | ... | ... |",
                "| User-flow E2E | ... | Public product boundary → user-observable result | ... |",
                "",
            ],
        )
    if epic_link:
        lines.extend([f"Epic: {epic_link}", ""])
    return "\n".join(lines)


@traces(SWR.SWR_3112)
def epic_index_row(req_id: str, title: str, *, lifecycle: str, relative_path: str) -> str:
    """One row of an epic index's requirement table."""
    return f"| [{req_id}]({relative_path}) | {title} | {lifecycle} |"


@traces(SWR.SWR_3112)
def mirror_into_epic_index(index_text: str, *, row: str, req_id: str) -> str:
    """Insert (or replace) *req_id*'s row in the epic index's table, in id order.

    The epic index is how a ReqToCode store presents an epic's contents; a
    requirement created without its row is invisible to every reader of the store
    even though the verifier is happy. Rewriting the row when it already exists
    makes this callable twice without producing a duplicate.
    """
    newline = "\r\n" if "\r\n" in index_text else "\n"
    lines = index_text.split(newline)
    table = [index for index, line in enumerate(lines) if line.startswith("| ")]
    if len(table) < 2:
        raise CreationError(
            "epic index has no requirement table to mirror the new requirement into",
        )
    data_rows = [index for index in table[2:] if lines[index].strip().startswith("| [")]
    marker = f"[{req_id}]"
    for index in data_rows:
        if marker in lines[index]:
            lines[index] = row
            return newline.join(lines)

    key = requirement_sort_key(req_id)
    insert_at = table[1] + 1
    for index in data_rows:
        existing = re.search(r"\[([^\]]+)\]", lines[index])
        if existing is not None and requirement_sort_key(existing.group(1)) < key:
            insert_at = index + 1
    lines.insert(insert_at, row)
    return newline.join(lines)


@traces(SWR.SWR_3112, SWR.SWR_3113)
def remove_from_epic_index(index_text: str, req_id: str) -> str:
    """Drop *req_id*'s row from the epic index's table, if it has one.

    The mirror image of :func:`mirror_into_epic_index`, and the second half of a
    deletion: a requirement whose file is gone but whose row still points at it
    leaves the store with a dead link that ``reqtocode check`` does not catch.
    Idempotent — an index that never listed the id is returned unchanged.
    """
    newline = "\r\n" if "\r\n" in index_text else "\n"
    lines = index_text.split(newline)
    marker = f"[{req_id}]"
    kept = [line for line in lines if not (line.strip().startswith("| [") and marker in line)]
    return newline.join(kept)


def _today_iso() -> str:
    """Today's date, ISO-8601, for the template's ``date:`` field.

    A default, not a dependency: :func:`render_requirement_document` takes the
    date as text and stays pure, and a test injects a fixed one.
    """
    return dt.date.today().isoformat()


@dataclass(frozen=True, slots=True)
class MarkdownStoreLayout:
    """Where a ReqToCode-shaped Markdown store keeps its epics and requirements.

    Resolved by *reading* the store rather than by convention over the epic id:
    the folder name carries a slug (``3100-requirement-sources``) that only the
    store knows, and guessing it would put a created requirement in a directory
    the epic index does not point at.
    """

    root: Path

    def epic_index_path(self, epic_id: str) -> Path | None:
        """The index document declaring *epic_id*, when the store has one."""
        for path in sorted(self.root.glob("*.md")):
            document = MarkdownRequirementDocument.parse(path.read_text(encoding="utf-8"))
            if document.get("req-id") == epic_id:
                return path
        return None

    def epic_folder(self, epic_id: str) -> Path | None:
        """The directory holding *epic_id*'s requirements, when it exists."""
        index = self.epic_index_path(epic_id)
        if index is None:
            return None
        return index.with_suffix("")

    def used_ids(self) -> tuple[str, ...]:
        """Every requirement id the store currently declares, in id order."""
        found: set[str] = set()
        for path in sorted(self.root.rglob("*.md")):
            document = MarkdownRequirementDocument.parse(path.read_text(encoding="utf-8"))
            declared = document.get("req-id")
            if not declared:
                continue
            if declared.startswith("["):
                found.update(part.strip() for part in declared[1:-1].split(",") if part.strip())
            else:
                found.add(declared)
        return tuple(sorted(found, key=requirement_sort_key))


@traces(SWR.SWR_3112)
class RequirementCreation(BaseModel):
    """What a creation produced: the id issued and every artefact it touched."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    path: str
    epic_id: str | None = None
    index_path: str | None = None

    @property
    def changed_paths(self) -> tuple[str, ...]:
        """Every artefact the creation wrote, in write order."""
        if self.index_path is None:
            return (self.path,)
        return (self.path, self.index_path)


@traces(SWR.SWR_3112)
class MarkdownStoreWriter:
    """Creates requirements the way a ReqToCode Markdown store creates them.

    Owns the whole convention in one place — id allocation inside the epic's
    block, the store's file naming, the template, and the epic-index row — so a
    created requirement passes ``python -m rotaris_core.reqtocode check`` without
    anyone editing it afterwards (SWR-3112).
    """

    def __init__(
        self,
        layout: MarkdownStoreLayout,
        *,
        replace: Replacer = os.replace,
        today: Callable[[], str] = _today_iso,
    ) -> None:
        self._layout = layout
        self._replace = replace
        self._writer = MarkdownArtifactWriter(replace=replace)
        self._today = today

    @property
    def layout(self) -> MarkdownStoreLayout:
        return self._layout

    @traces(SWR.SWR_3112, SWR.SWR_3606)
    def plan(
        self,
        draft: RequirementDraft,
        *,
        used_ids: Collection[str] | None = None,
        retired_ids: Collection[str] = (),
    ) -> RequirementCreation:
        """Where *draft* would land, resolved without writing anything.

        Everything :meth:`create` does before its first write, returning the same
        value it returns. That is the whole point: SWR-3606 asks the user to see
        where the artefact will be written *before* it is written, and a preview
        computed by a second rule would be a promise nobody keeps. Two
        implementations that agree today are not the property worth having — one
        implementation is.

        Refuses exactly what the write refuses, at the same door: a draft the
        store's own check would reject (:func:`validate_draft`), an epic whose id
        block is exhausted, an id already in use or retired. A preview that named
        a file the write would then refuse is a worse answer than the refusal.
        """
        req_id, path, index_path = self._resolve(draft, used_ids=used_ids, retired_ids=retired_ids)
        return RequirementCreation(
            req_id=req_id,
            path=str(path),
            epic_id=draft.parent,
            index_path=str(index_path) if index_path is not None else None,
        )

    def _resolve(
        self,
        draft: RequirementDraft,
        *,
        used_ids: Collection[str] | None,
        retired_ids: Collection[str],
    ) -> tuple[str, Path, Path | None]:
        """The id, the artefact and the epic index one creation would touch.

        The single answer :meth:`plan` renders and :meth:`create` writes. It
        returns paths rather than the strings :class:`RequirementCreation` holds
        so the write does not round-trip through them.
        """
        validate_draft(draft)
        known = tuple(used_ids) if used_ids is not None else self._layout.used_ids()
        req_id = draft.req_id or allocate_requirement_id(
            used_ids=known,
            retired_ids=retired_ids,
            epic=draft.parent,
        )
        if req_id in set(known) | set(retired_ids):
            raise CreationError(
                f"{req_id} is already in use or retired; an id never means two things (SWR-3113)",
            )
        folder = self._layout.epic_folder(draft.parent) if draft.parent else None
        target_dir = folder if folder is not None else self._layout.root
        return (
            req_id,
            target_dir / requirement_filename(req_id, draft.title),
            self._layout.epic_index_path(draft.parent) if draft.parent else None,
        )

    def create(
        self,
        draft: RequirementDraft,
        *,
        used_ids: Collection[str] | None = None,
        retired_ids: Collection[str] = (),
    ) -> RequirementCreation:
        """Create the artefact (and mirror the epic index), returning what moved.

        :meth:`plan` decides *where*; this writes it. The split is what makes the
        preview and the write structurally the same answer (SWR-3606).
        """
        req_id, path, index_path = self._resolve(draft, used_ids=used_ids, retired_ids=retired_ids)
        derived = [
            relation.target
            for relation in draft.relations
            if relation.kind is RelationKind.DERIVED_FROM
        ]
        epic_link = None
        if index_path is not None:
            epic_link = f"[{draft.parent}](../{index_path.name})"
        text = render_requirement_document(
            req_id=req_id,
            title=draft.title,
            description=draft.description,
            date_text=self._today(),
            epic_id=draft.parent,
            epic_link=epic_link,
            lifecycle=draft.lifecycle,
            req_type=draft.req_type,
            derived_from=derived,
            trace_required=draft.trace_required,
            test_required=draft.test_required,
        )
        self._writer.create(path, text)

        mirrored: str | None = None
        if index_path is not None:
            relative = f"{index_path.stem}/{path.name}"
            row = epic_index_row(
                req_id,
                draft.title,
                lifecycle=str(draft.lifecycle),
                relative_path=relative,
            )
            index_text = index_path.read_text(encoding="utf-8")
            atomic_write_text(
                index_path,
                mirror_into_epic_index(index_text, row=row, req_id=req_id),
                replace=self._replace,
            )
            mirrored = str(index_path)

        return RequirementCreation(
            req_id=req_id,
            path=str(path),
            epic_id=draft.parent,
            index_path=mirrored,
        )

    def update(self, path: Path, edit: RequirementEdit) -> str:
        """Apply *edit* to one artefact; see :meth:`MarkdownArtifactWriter.apply`."""
        return self._writer.apply(path, edit)

    def delete(self, path: Path, req_id: str, *, epic_id: str | None = None) -> tuple[str, ...]:
        """Remove *req_id*'s artefact and its epic-index row; return what moved.

        The index row goes first: an index pointing at a file that no longer
        exists is a broken store, while an index that lost its row a moment
        before the file disappears is merely out of date. A document declaring
        *several* ids is refused rather than half-emptied — removing one id from
        a spec file is an edit of that file's structure, not a deletion, and
        guessing which lines belonged to the id would silently drop prose.

        The tombstone (SWR-3113) is the caller's business: this writes the store,
        and forgetting that an id ever existed is exactly what a tombstone
        prevents.
        """
        document = MarkdownRequirementDocument.parse(path.read_text(encoding="utf-8"))
        declared = document.get("req-id") or ""
        if declared.startswith("["):
            raise WriteBackError(
                f"{req_id} is declared by the multi-id document {path.name} together with"
                f" {declared}; delete it by editing that document instead",
            )
        if declared and declared != req_id:
            raise WriteBackError(f"{path.name} declares {declared!r}, not {req_id!r}")

        changed: list[str] = []
        index_path = self._layout.epic_index_path(epic_id) if epic_id else None
        if index_path is not None and index_path != path:
            index_text = index_path.read_text(encoding="utf-8")
            without_row = remove_from_epic_index(index_text, req_id)
            if without_row != index_text:
                atomic_write_text(index_path, without_row, replace=self._replace)
                changed.append(str(index_path))
        path.unlink()
        changed.append(str(path))
        return tuple(changed)


# --------------------------------------------------------------------------
# The write-back service (SWR-3111)
# --------------------------------------------------------------------------


@traces(SWR.SWR_3111)
class HashConflict(BaseModel):
    """The source moved under an edit that stated which version it was changing."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    source_id: str
    expected_hash: str
    actual_hash: str

    @property
    def message(self) -> str:
        return (
            f"{self.req_id}: the source moved since the edit was prepared"
            f" (expected {self.expected_hash!r}, source holds {self.actual_hash!r});"
            " re-read the requirement and apply the edit again"
        )


@traces(SWR.SWR_3111)
class WriteBackOutcome(BaseModel):
    """The result of one write-back attempt: what happened, and to what.

    A refusal and a conflict are *values*, not exceptions, because both are
    outcomes a user has to be shown (SWR-3105, SWR-3605) rather than failures a
    caller has to survive. Anything genuinely unexpected still raises.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: The requirement as the source holds it *after* the write — never the value
    #: an adapter claimed to have written (SWR-3111).
    requirement: CanonicalRequirement | None = None
    refusal: WriteRefusal | None = None
    conflict: HashConflict | None = None
    #: Whether the source was written at all. False for a refusal, a conflict and
    #: an edit that would change nothing.
    written: bool = False
    #: The artefacts the write touched, when the adapter can name them.
    changed_paths: tuple[str, ...] = ()

    @property
    def ok(self) -> bool:
        """True when the source now holds the edit."""
        return self.refusal is None and self.conflict is None and self.requirement is not None

    @property
    def reason(self) -> str:
        """Why the write did not happen, or ``""`` when it did."""
        if self.refusal is not None:
            return self.refusal.message
        if self.conflict is not None:
            return self.conflict.message
        return ""


def _writable(
    source: RequirementSource,
    operation: SourceCapability,
) -> WritableRequirementSource:
    """The same source, typed for the write it already declared it supports.

    The capability check has happened by the time this is called — it is what
    decides whether a write may happen at all (SWR-3105). This only asserts that
    an adapter which *declares* an operation also implements it, and says so
    plainly when it does not, instead of failing later with an ``AttributeError``
    that reads like a Rotaris bug.
    """
    if isinstance(source, WritableRequirementSource):
        return source
    raise WriteBackError(
        f"source {source.source_id!r} declares {str(operation)!r} but does not implement it",
    )


@runtime_checkable
class SourceProvider(Protocol):
    """Anything that can name the configured requirement sources.

    Structural on purpose: :class:`~rotaris_core.requirements.registry.RequirementRegistry`
    satisfies it without this module importing it, which keeps the write path
    usable with a single ad-hoc source and keeps the dependency one-way.
    """

    def sources(self) -> Sequence[RequirementSource]: ...


@traces(SWR.SWR_3111, SWR.SWR_3112)
class RequirementWriteBack:
    """Routes an edit or a creation to the source that owns the requirement.

    The order of operations is the requirement: resolve the source, refuse
    without touching it when the capability is missing, refuse when the stated
    ``expected_hash`` no longer matches, write, then **re-read** and report what
    the source now holds.
    """

    def __init__(self, provider: SourceProvider | Iterable[RequirementSource]) -> None:
        if isinstance(provider, SourceProvider):
            self._provider: SourceProvider = provider
        else:
            sources = tuple(provider)
            self._provider = _FixedSources(sources)

    def sources(self) -> Sequence[RequirementSource]:
        """The configured sources, in configuration order."""
        return self._provider.sources()

    def _resolve(self, req_id: str) -> tuple[RequirementSource, CanonicalRequirement] | None:
        """The owning source *and* the requirement as it stands right now.

        Both in one pass: the pre-write read is what answers "who owns this id"
        and "what does the source hold", and doing it twice would leave a window
        in which the two answers describe different content.
        """
        for source in self.sources():
            try:
                current = source.read().by_id().get(req_id)
            except Exception:  # noqa: BLE001 - a failing source is not this id's owner
                continue
            if current is not None:
                return source, current
        return None

    def source_for(self, req_id: str) -> RequirementSource | None:
        """The first configured source declaring *req_id* (SWR-3115 order)."""
        resolved = self._resolve(req_id)
        return resolved[0] if resolved is not None else None

    def update(self, req_id: str, edit: RequirementEdit) -> WriteBackOutcome:
        """Write *edit* back into the artefact *req_id* came from."""
        resolved = self._resolve(req_id)
        if resolved is None:
            raise WriteBackError(f"no configured requirement source declares {req_id}")
        source, current = resolved

        refusal = refusal_for(
            source,
            SourceCapability.UPDATE,
            location=current.source_path,
            detail="this requirement's source is read-only",
        )
        if refusal is not None:
            return WriteBackOutcome(requirement=current, refusal=refusal)
        if edit.is_empty:
            return WriteBackOutcome(requirement=current)
        if edit.expected_hash and edit.expected_hash != current.current_hash:
            return WriteBackOutcome(
                requirement=current,
                conflict=HashConflict(
                    req_id=req_id,
                    source_id=source.source_id,
                    expected_hash=edit.expected_hash,
                    actual_hash=current.current_hash,
                ),
            )

        _writable(source, SourceCapability.UPDATE).update(req_id, edit)
        after = source.read().by_id().get(req_id)
        if after is None:
            raise WriteBackError(
                f"{req_id} disappeared from source {source.source_id!r} during the write",
            )
        return WriteBackOutcome(
            requirement=after,
            written=True,
            changed_paths=(after.source_path,) if after.source_path else (),
        )

    def delete(self, req_id: str) -> WriteBackOutcome:
        """Remove *req_id* from the source that owns it.

        Refused without touching the source when the capability is missing
        (SWR-3105). Success is *proved* by re-reading: an adapter reporting a
        deletion the source did not perform would leave Rotaris hiding a
        requirement that still exists in the project's own store.
        """
        resolved = self._resolve(req_id)
        if resolved is None:
            raise WriteBackError(f"no configured requirement source declares {req_id}")
        source, current = resolved

        refusal = refusal_for(
            source,
            SourceCapability.DELETE,
            location=current.source_path,
            detail="this requirement's source does not delete requirements",
        )
        if refusal is not None:
            return WriteBackOutcome(requirement=current, refusal=refusal)

        _writable(source, SourceCapability.DELETE).delete(req_id)
        if source.read().by_id().get(req_id) is not None:
            raise WriteBackError(
                f"{req_id} was deleted in {source.source_id!r} but the source still declares it",
            )
        return WriteBackOutcome(
            written=True,
            changed_paths=(current.source_path,) if current.source_path else (),
        )

    def create(
        self,
        draft: RequirementDraft,
        *,
        source_id: str | None = None,
    ) -> WriteBackOutcome:
        """Create a requirement in the named source (or the only writable one)."""
        source = self._creation_source(source_id)
        refusal = refusal_for(
            source,
            SourceCapability.CREATE,
            detail="this source does not create requirements",
        )
        if refusal is not None:
            return WriteBackOutcome(refusal=refusal)

        created = _writable(source, SourceCapability.CREATE).create(draft)
        after = source.read().by_id().get(created.req_id)
        if after is None:
            raise WriteBackError(
                f"{created.req_id} was created in {source.source_id!r} but the source"
                " does not declare it on the next read",
            )
        return WriteBackOutcome(
            requirement=after,
            written=True,
            changed_paths=(after.source_path,) if after.source_path else (),
        )

    def _creation_source(self, source_id: str | None) -> RequirementSource:
        sources = self.sources()
        if source_id is not None:
            found = next((one for one in sources if one.source_id == source_id), None)
            if found is None:
                raise WriteBackError(f"no configured requirement source is named {source_id!r}")
            return found
        writable = [one for one in sources if one.capabilities.can(SourceCapability.CREATE)]
        if not writable:
            raise WriteBackError("no configured requirement source can create requirements")
        if len(writable) > 1:
            names = ", ".join(sorted(one.source_id for one in writable))
            raise WriteBackError(
                f"several sources can create requirements ({names}); name the one to use",
            )
        return writable[0]


class _FixedSources:
    """Adapts a plain sequence of sources to :class:`SourceProvider`."""

    def __init__(self, sources: Sequence[RequirementSource]) -> None:
        self._sources = tuple(sources)

    def sources(self) -> Sequence[RequirementSource]:
        return self._sources
