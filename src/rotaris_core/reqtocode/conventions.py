"""ReqToCode annotation conventions — how a reference is written, as a seam.

The reference sweep used to hard-code one convention: `traces(...)`/`verifies(...)`
call text, `SWR_<n>` symbols and `# @req:` comments, applied to `.py` files only.
`AnnotationConvention` is that knowledge behind a small interface: given a file's
text it yields the requirement references the file declares and whether each is a
trace or a coverage reference, names the extensions it claims, and (for the
reverse orphan checks) recognises re-export shims and test functions.

`PythonConvention` is the default implementation and reproduces the previous
behaviour exactly, including the transitional `# @req:` comments and legacy id
resolution. Registering concrete non-Python conventions is a later requirement;
this module delivers the seam and the registry they will plug into.
"""

from __future__ import annotations

import ast
import re
from bisect import bisect_right
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping, Sequence

#: Kind of a reference that claims *implementation* of a requirement.
TRACE_KIND = "traces"
#: Kinds of a reference that claim *test coverage* of a requirement.
COVERAGE_KINDS = frozenset({"verifies", "@req"})


@dataclass(frozen=True)
class Reference:
    """One requirement reference found in a source file.

    `number` is the resolved requirement number, or `None` when the written id
    could not be resolved (an unknown or ambiguous legacy id); `raw_id` keeps
    the text as written so the caller can report it.
    """

    kind: str  # "traces" | "verifies" | "@req"
    line: int
    number: int | None = None
    raw_id: str = ""


@dataclass(frozen=True)
class AnnotatedId:
    """One requirement id written inside an annotation, and where its symbol sits.

    ``line`` is the line the *symbol* is on, which for a wrapped annotation is
    not the line the call opens on. ``start``/``end`` are absolute character
    offsets into the file, so a rewriter can replace exactly this id and nothing
    around it.
    """

    number: int
    raw_id: str
    line: int
    start: int
    end: int


@dataclass(frozen=True)
class Annotation:
    """One ``traces(...)``/``verifies(...)`` call, and every id it carries.

    :class:`Reference` answers "which requirements does this file claim"; this
    answers "what is written here, exactly". The difference is the whole reason
    it exists: a reference fans a multi-id annotation out into one record per id
    with no back-link, so a caller holding a reference cannot tell a lone id from
    one of five, nor where the call begins and ends. Measured over this
    repository, 2121 of 8522 annotation call sites carry more than one id and 53
    are wrapped over several lines — a rewriter working from references alone
    would corrupt every one of them.

    ``decorator`` is ``False`` for the call form — the decorator applied to a name
    as a statement — which this convention deliberately matches as well (see
    :class:`PythonConvention`). Removing one is deleting an executable statement
    rather than an annotation, and a caller is entitled to refuse that.
    """

    kind: str  # "traces" | "verifies"
    start_line: int
    end_line: int
    start: int
    end: int
    ids: tuple[AnnotatedId, ...] = ()
    decorator: bool = True

    def covers(self, line: int) -> bool:
        """Whether *line* falls anywhere inside this annotation."""
        return self.start_line <= line <= self.end_line

    def id_at(self, line: int, number: int) -> AnnotatedId | None:
        """The id numbered *number* written on *line*, when this annotation has one.

        Both are asked for because either alone is ambiguous: one line can carry
        two ids, and one id can appear in two annotations of the same file.
        """
        return next(
            (one for one in self.ids if one.number == number and one.line == line),
            None,
        )


@dataclass(frozen=True)
class TestFunction:
    """A collected test function and the line span its annotations may occupy."""

    __test__ = False  # a data record, not something pytest should collect

    qualname: str
    start_line: int
    end_line: int


class AnnotationConvention(Protocol):
    """How one language/stack writes requirement references."""

    #: Short identifier, e.g. "python".
    name: str

    def file_extensions(self) -> tuple[str, ...]:
        """File suffixes (including the dot) this convention claims."""

    def iter_references(self, text: str, legacy_aliases: Mapping[str, str]) -> list[Reference]:
        """Requirement references declared by `text`, in file order per kind."""

    def iter_annotations(self, text: str) -> list[Annotation]:
        """Annotation call sites in `text`, each with the ids it carries.

        The same scan :meth:`iter_references` reports from, at call granularity.
        A convention implements this once and gets both readings — which is what
        keeps a rewriter and the sweep from disagreeing about what an annotation
        is (SWR-3517).
        """

    def iter_test_functions(self, text: str) -> list[TestFunction]:
        """Test functions declared by `text` (empty when the file has none)."""

    def is_module_excused(self, relative_path: str) -> bool:
        """True for files that are structurally exempt from the orphan check."""


_CALL_RE = re.compile(r"\b(traces|verifies)\s*\(([^()]*)\)", re.S)
_SYMBOL_RE = re.compile(r"\bSWR_(\d+)\b")
_REQ_COMMENT_RE = re.compile(r"#\s*@req:\s*([A-Za-z0-9_,\s\-]+)")
_ID_RE = re.compile(r"\b((?:SWR|REQ|FR|NFR)(?:-[A-Za-z0-9]+)+)\b")
_SWR_ID_RE = re.compile(r"^SWR-(\d+)$")


class LineIndex:
    """Line numbers for many positions in one text, scanning it once.

    ``text.count("\\n", 0, pos)`` answers one position by counting from the start
    of the file, so a scan asking for every annotation's line — this repository
    has 29 639 of them across 992 files — re-counts the same newlines once per
    question. That was 0.35s of a 1.17s reference sweep, and the sweep is inside
    both `reqtocode check` and every board pass that reads evidence (SWR-3223).

    One list of line-start offsets and a bisect gives the identical answer:
    ``bisect_right`` over the starts is the count of line breaks before *pos*,
    plus the leading zero, which is the 1-based line. Asserted position by
    position against the counting form rather than argued.
    """

    __slots__ = ("_starts",)

    def __init__(self, text: str) -> None:
        starts = [0]
        offset = text.find("\n")
        while offset >= 0:
            starts.append(offset + 1)
            offset = text.find("\n", offset + 1)
        self._starts = starts

    def line(self, pos: int) -> int:
        """1-based line number of *pos*."""
        return bisect_right(self._starts, pos)


def line_of(text: str, pos: int) -> int:
    """1-based line number of `pos` within `text`.

    For a single question. Asking more than one of the same text costs a rescan
    each time — build a :class:`LineIndex` instead.
    """
    return text.count("\n", 0, pos) + 1


def _is_decorator(text: str, start: int) -> bool:
    """Whether the call beginning at *start* is written as a decorator.

    ``@`` immediately before it, with nothing else on the line. The alternative
    this separates out is real and lives in this very package: ``_self_annotate``
    blocks apply the decorator to a name as a plain statement, and that line is
    behaviour — deleting it removes what the module does, not what it claims.
    """
    line_start = text.rfind("\n", 0, start) + 1
    return text[line_start:start].strip() == "@"


def _span(node: ast.FunctionDef | ast.AsyncFunctionDef) -> tuple[int, int]:
    start = node.lineno
    for dec in node.decorator_list:
        start = min(start, dec.lineno)
    return start, node.end_lineno or node.lineno


class PythonConvention:
    """The original Rotaris convention: `traces()`/`verifies()` + `# @req:`.

    A deliberately textual scan, not an import: it matches call sites as well as
    decorators, so a module that self-annotates by calling the decorator on a
    function at its bottom is seen exactly like a decorated one.
    """

    name = "python"

    def file_extensions(self) -> tuple[str, ...]:
        return (".py",)

    def iter_references(self, text: str, legacy_aliases: Mapping[str, str]) -> list[Reference]:
        """Every id this file claims, one record each.

        Derived from :meth:`iter_annotations` rather than scanned again. There
        was one scan before this method had a second reader, and there is still
        one: a rewriter that parsed the grammar for itself would be free to
        disagree with the sweep about which ids a file declares, and the two
        would drift the first time either changed (SWR-3517).
        """
        refs: list[Reference] = [
            Reference(
                kind=annotation.kind,
                line=one.line,
                number=one.number,
                raw_id=one.raw_id,
            )
            for annotation in self.iter_annotations(text)
            for one in annotation.ids
        ]
        refs.extend(self._iter_req_comments(text, legacy_aliases))
        return refs

    def iter_annotations(self, text: str) -> list[Annotation]:
        """Every ``traces(...)``/``verifies(...)`` call, with its ids and its span."""
        lines = LineIndex(text)
        return [
            Annotation(
                kind=call.group(1),
                start_line=lines.line(call.start()),
                end_line=lines.line(call.end() - 1),
                start=call.start(),
                end=call.end(),
                ids=tuple(
                    AnnotatedId(
                        number=int(sym.group(1)),
                        raw_id=f"SWR-{sym.group(1)}",
                        line=lines.line(call.start(2) + sym.start()),
                        start=call.start(2) + sym.start(),
                        end=call.start(2) + sym.end(),
                    )
                    for sym in _SYMBOL_RE.finditer(call.group(2))
                ),
                decorator=_is_decorator(text, call.start()),
            )
            for call in _CALL_RE.finditer(text)
        ]

    @staticmethod
    def _iter_req_comments(text: str, legacy_aliases: Mapping[str, str]) -> list[Reference]:
        """Transitional `# @req: <id>` comments, resolving legacy ids."""
        refs: list[Reference] = []
        lines = LineIndex(text)
        for comment in _REQ_COMMENT_RE.finditer(text):
            line = lines.line(comment.start())
            for id_match in _ID_RE.finditer(comment.group(1)):
                raw_id = id_match.group(1).upper()
                canonical = raw_id if _SWR_ID_RE.match(raw_id) else legacy_aliases.get(raw_id)
                swr_match = _SWR_ID_RE.match(canonical) if canonical else None
                number = int(swr_match.group(1)) if swr_match else None
                refs.append(Reference(kind="@req", line=line, number=number, raw_id=raw_id))
        return refs

    def iter_test_functions(self, text: str) -> list[TestFunction]:
        """Collect `test_*` functions with the span their annotations may occupy.

        Walks module-level defs and one level of `class Test...` nesting (the repo
        prefers plain functions, but a handful of files still group); deeper
        nesting is a helper, not a collected test. `qualname` is `test_foo` at
        module level or `ClassName::test_foo` when nested — same-named methods on
        different classes must not collide in the orphan identifier.
        """
        try:
            tree = ast.parse(text)
        except SyntaxError:
            return []
        functions: list[TestFunction] = []
        def_types = (ast.FunctionDef, ast.AsyncFunctionDef)
        for node in tree.body:
            if isinstance(node, def_types) and node.name.startswith("test_"):
                functions.append(TestFunction(node.name, *_span(node)))
            elif isinstance(node, ast.ClassDef):
                for child in node.body:
                    if isinstance(child, def_types) and child.name.startswith("test_"):
                        functions.append(TestFunction(f"{node.name}::{child.name}", *_span(child)))
        return functions

    def is_module_excused(self, relative_path: str) -> bool:
        """`__init__.py` is a re-export shim, never an implementation site."""
        return Path(relative_path).name == "__init__.py"


class ConventionRegistry:
    """The set of conventions a check runs with, resolved by file extension."""

    def __init__(self, conventions: Sequence[AnnotationConvention] = ()) -> None:
        self._conventions: list[AnnotationConvention] = list(conventions)

    def register(self, convention: AnnotationConvention) -> None:
        """Add a convention; earlier registrations win a contested extension."""
        self._conventions.append(convention)

    @property
    def conventions(self) -> tuple[AnnotationConvention, ...]:
        return tuple(self._conventions)

    def extensions(self) -> tuple[str, ...]:
        """Every claimed extension, first-registration order, deduplicated."""
        seen: dict[str, None] = {}
        for convention in self._conventions:
            for ext in convention.file_extensions():
                seen.setdefault(ext, None)
        return tuple(seen)

    def for_path(self, path: str | Path) -> AnnotationConvention | None:
        """The convention claiming `path`'s extension, or None."""
        suffix = Path(path).suffix
        for convention in self._conventions:
            if suffix in convention.file_extensions():
                return convention
        return None

    def extended_with(self, conventions: Iterable[AnnotationConvention]) -> ConventionRegistry:
        """A new registry with `conventions` appended (this one is unchanged)."""
        return ConventionRegistry([*self._conventions, *conventions])


#: The default registry: Python only, reproducing the pre-seam behaviour.
DEFAULT_CONVENTIONS = ConventionRegistry([PythonConvention()])


def _self_annotate() -> None:
    # Bootstrap-safe (blueprint §11): tolerate a missing/stale generated module.
    try:
        from rotaris_core.reqtocode.declarations import traces
        from rotaris_core.reqtocode.swr import SWR

        traces(SWR.SWR_2337)(PythonConvention)
        traces(SWR.SWR_2337)(ConventionRegistry)
        traces(SWR.SWR_3517)(PythonConvention.iter_annotations)
        traces(SWR.SWR_3517)(Annotation)
        traces(SWR.SWR_3517)(AnnotatedId)
        traces(SWR.SWR_2334)(PythonConvention.iter_test_functions)
        traces(SWR.SWR_2333)(PythonConvention.is_module_excused)
    except (ImportError, AttributeError):  # pragma: no cover - bootstrap/stale swr.py
        return


_self_annotate()
