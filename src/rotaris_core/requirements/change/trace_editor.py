"""Rewriting one annotation, in the user's own source (SWR-3507).

The last unimplemented seam of the superseding migration. ``TraceEditor`` has
existed since the epic's first slice with three test fakes behind it and nothing
shipped; this is the implementation, and it is not the fake.

**The fake would corrupt this repository.** ``TreeEditor`` in the integration
tests deletes the line a site names. That is correct for a site whose annotation
holds one id and occupies one line, and wrong for everything else — because a
:class:`~rotaris_core.reqtocode.conventions.Reference` reports the line its *own
symbol* sits on, not the line the call opens on. Measured over ``src/``,
``apps/`` and ``tests/``: 8522 annotation call sites, of which **2121 carry more
than one id** and **53 are wrapped over several lines**. Deleting the line would
take a sibling id off with it, or leave an ``@traces(`` with no closing bracket.

So this editor reads what is actually written, through the call-level view
SWR-3517 added to the annotation convention — the same scan the coverage sweep
reads from, so a rewrite and the sweep that found the site cannot disagree about
what an annotation is.

Three rewrites and one refusal:

- **re-point** replaces that one id's symbol and nothing else. The span comes
  from the convention, so the edit cannot spill into a neighbour.
- **remove**, where the annotation carries other ids, drops that argument and its
  comma. The remaining arguments keep their own text, so a wrapped annotation
  stays wrapped and a one-line one stays on its line.
- **remove**, where it was the last id, takes the whole annotation out —
  ``start_line`` through ``end_line``, which for a wrapped call is four lines, not
  the one the symbol was on.
- **anything it cannot identify with certainty** comes back as an unapplied
  :class:`~rotaris_core.requirements.change.superseding.TraceEdit` carrying the
  reason. That is not a soft failure: ``MigrationExecution.completed`` is false
  while any edit is unapplied, and ``SupersedingCompletion`` refuses to deprecate
  an incomplete execution — so a site this editor would have to guess at stops
  the migration rather than being written over.

The call form is one of those refusals, and deliberately. This very package
annotates itself by applying the decorator to a name as a plain statement;
removing such a line deletes what a module *does*, not what it claims, and no
worklist entry says to do that.

Ordering is the caller's: ``ApprovedMigration.operations`` yields operations
bottom-up within each file, which is what keeps every planned line number true
when its operation runs. This editor re-reads the file for each operation and
never caches, so it observes each previous edit rather than assuming it.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.reqtocode.conventions import DEFAULT_CONVENTIONS
from rotaris_core.requirements.change.superseding import MigrationAction, TraceEdit
from rotaris_core.requirements.writeback import atomic_write_text

if TYPE_CHECKING:
    from rotaris_core.reqtocode.conventions import Annotation, ConventionRegistry
    from rotaris_core.requirements.change.superseding import TraceOperation
    from rotaris_core.requirements.writeback import Replacer

__all__ = ["SourceTraceEditor"]

_SWR_ID_RE = re.compile(r"^SWR-(\d+)$")

#: Said when the annotation is applied to a name rather than written above a
#: definition. Removing it is deleting a statement, which no worklist row asks for.
CALL_FORM_REFUSAL = (
    "the annotation is applied as a statement rather than written as a decorator;"
    " removing it would delete behaviour, so it is left for a person"
)


@traces(SWR.SWR_3507)
class SourceTraceEditor:
    """Applies one approved annotation edit to a file under *root*.

    Holds a root, a convention registry and a replacer — no store, no source, no
    requirement. What it can reach is one file under one directory, and what it
    can do to it is bounded by the three rewrites above.
    """

    def __init__(
        self,
        root: Path,
        *,
        conventions: ConventionRegistry = DEFAULT_CONVENTIONS,
        replace: Replacer = os.replace,
    ) -> None:
        self._root = Path(root).expanduser()
        self._conventions = conventions
        self._replace = replace

    @property
    def root(self) -> Path:
        """The tree this editor may write in, and nowhere else."""
        return self._root

    @traces(SWR.SWR_3507)
    def apply(self, operation: TraceOperation) -> TraceEdit:
        """Carry *operation* out, or say why it was not carried out.

        Never raises for a site it cannot handle: an unapplied edit with a reason
        is a result the executor collects and the completion refuses on, and that
        is a better answer than an exception that abandons the remaining
        operations mid-file.
        """
        site = operation.site
        located = self._locate(operation)
        if isinstance(located, TraceEdit):
            return located
        path, text, annotation, index = located
        if not annotation.decorator:
            return self._refused(operation, CALL_FORM_REFUSAL)
        if operation.action is MigrationAction.RE_POINT:
            target = _number_of(operation.target)
            if target is None:
                return self._refused(operation, f"{operation.target!r} is not a requirement id")
            updated = self._repointed(text, annotation, index, target)
            detail = f"re-pointed at {operation.target}"
        elif len(annotation.ids) > 1:
            updated = self._without_argument(text, annotation, index)
            detail = f"dropped {site.req_id} from an annotation of {len(annotation.ids)} ids"
        else:
            updated = self._without_annotation(text, annotation)
            detail = f"removed the annotation, which held only {site.req_id}"
        try:
            atomic_write_text(path, updated, replace=self._replace)
        except OSError as error:  # pragma: no cover - filesystem refusal
            return self._refused(operation, f"the file could not be written: {error}")
        return TraceEdit(site=site, action=operation.action, applied=True, detail=detail)

    # -- locating ------------------------------------------------------------

    def _locate(
        self,
        operation: TraceOperation,
    ) -> tuple[Path, str, Annotation, int] | TraceEdit:
        """The annotation this operation names, or the refusal that replaces it."""
        site = operation.site
        number = _number_of(site.req_id)
        if number is None:
            return self._refused(operation, f"{site.req_id!r} is not a requirement id")
        path = (self._root / site.path).resolve()
        try:
            path.relative_to(self._root.resolve())
        except ValueError:
            return self._refused(operation, f"{site.path} is outside {self._root}")
        convention = self._conventions.for_path(path)
        if convention is None:
            return self._refused(operation, f"no annotation convention claims {path.suffix!r}")
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as error:
            return self._refused(operation, f"the file could not be read: {error}")
        for annotation in convention.iter_annotations(text):
            if not annotation.covers(site.line):
                continue
            held = annotation.id_at(site.line, number)
            if held is None:
                continue
            return path, text, annotation, annotation.ids.index(held)
        return self._refused(
            operation,
            f"no annotation at {site.path}:{site.line} claims {site.req_id};"
            " the file moved under the plan, so nothing was changed",
        )

    def _refused(self, operation: TraceOperation, why: str) -> TraceEdit:
        return TraceEdit(site=operation.site, action=operation.action, applied=False, detail=why)

    # -- the three rewrites --------------------------------------------------

    def _repointed(self, text: str, annotation: Annotation, index: int, target: int) -> str:
        """*text* with one id's symbol replaced, and nothing else touched."""
        held = annotation.ids[index]
        return f"{text[: held.start]}SWR_{target}{text[held.end :]}"

    def _without_argument(self, text: str, annotation: Annotation, index: int) -> str:
        """*text* with one argument dropped from an annotation that holds others.

        The remaining arguments keep the source text they were written with —
        their own leading newline and indentation — so a wrapped annotation stays
        wrapped and a one-line one stays on its line. Splitting on commas is safe
        because the grammar this convention matches admits no nested brackets.
        """
        start, end = _argument_span(text, annotation)
        arguments = text[start:end]
        parts = arguments.split(",")
        held = annotation.ids[index]
        offset = held.start - start
        position = next(
            (
                number
                for number, _part in enumerate(parts)
                if _bounds(parts, number)[0] <= offset < _bounds(parts, number)[1]
            ),
            None,
        )
        if position is None:  # pragma: no cover - the span always contains the id
            return text
        remaining = ",".join(parts[:position] + parts[position + 1 :])
        if not arguments[:1].isspace():
            remaining = remaining.lstrip(" \t")
        return text[:start] + remaining + text[end:]

    def _without_annotation(self, text: str, annotation: Annotation) -> str:
        """*text* with the whole annotation gone, however many lines it occupied."""
        lines = text.splitlines(keepends=True)
        del lines[annotation.start_line - 1 : annotation.end_line]
        return "".join(lines)


def _argument_span(text: str, annotation: Annotation) -> tuple[int, int]:
    """Where the annotation's argument list begins and ends, brackets excluded."""
    opening = text.index("(", annotation.start)
    return opening + 1, annotation.end - 1


def _bounds(parts: list[str], index: int) -> tuple[int, int]:
    """The half-open offsets *index* occupies within the joined argument text."""
    start = sum(len(part) + 1 for part in parts[:index])
    return start, start + len(parts[index]) + 1


def _number_of(req_id: str) -> int | None:
    """``SWR-3507`` as ``3507``, or ``None`` for anything that is not one."""
    match = _SWR_ID_RE.match(req_id.strip())
    return int(match.group(1)) if match else None
