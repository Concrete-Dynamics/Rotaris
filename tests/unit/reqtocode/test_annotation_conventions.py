"""Annotation convention seam (SWR-2337): recognition is pluggable, not inlined.

Marker tokens (traces/verifies/@req) are assembled through the T/V/RQ constants
so this file's own source never contains scannable reference tokens — the
repo-level sweep must not pick up synthetic fixtures.
"""

from __future__ import annotations

import re
from pathlib import Path

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.conventions import (
    DEFAULT_CONVENTIONS,
    ConventionRegistry,
    PythonConvention,
    Reference,
    TestFunction,
)
from rotaris_core.reqtocode.layout import RepoLayout
from rotaris_core.reqtocode.verifier import (
    find_orphan_modules,
    find_orphan_tests,
    sweep_references,
)

T = "traces"
V = "verifies"
RQ = "# @req"

_REF_RE = re.compile(r"@(impl|covers)\s+SWR-(\d+)")


class MarkdownConvention:
    """A deliberately different convention: `@impl SWR-<n>` / `@covers SWR-<n>` in .md."""

    name = "markdown"

    def file_extensions(self) -> tuple[str, ...]:
        return (".md",)

    def iter_references(self, text: str, legacy_aliases: dict[str, str]) -> list[Reference]:
        del legacy_aliases
        kinds = {"impl": "traces", "covers": "verifies"}
        return [
            Reference(
                kind=kinds[match.group(1)],
                line=text.count("\n", 0, match.start()) + 1,
                number=int(match.group(2)),
                raw_id=f"SWR-{match.group(2)}",
            )
            for match in _REF_RE.finditer(text)
        ]

    def iter_test_functions(self, text: str) -> list[TestFunction]:
        return [
            TestFunction(qualname=f"test_{line.strip()[2:].strip()}", start_line=i, end_line=i)
            for i, line in enumerate(text.split("\n"), start=1)
            if line.strip().startswith("# ")
        ]

    def is_module_excused(self, relative_path: str) -> bool:
        return Path(relative_path).name == "README.md"


MARKDOWN_LAYOUT = RepoLayout(
    generated_path=Path("lib") / "_swr.py",
    impl_roots=(Path("lib"),),
    test_roots=(Path("spec"),),
    excused_test_roots=(),
).with_requirements_dir("specs")

MARKDOWN_ONLY = ConventionRegistry([MarkdownConvention()])


def _write_markdown_repo(root: Path, impl: str, spec: str) -> None:
    (root / "lib").mkdir(parents=True, exist_ok=True)
    (root / "lib" / "feature.md").write_text(impl, encoding="utf-8")
    (root / "spec").mkdir(parents=True, exist_ok=True)
    (root / "spec" / "feature.md").write_text(spec, encoding="utf-8")


@verifies(SWR.SWR_2337)
def test_a_foreign_convention_yields_references_from_a_non_python_file(tmp_path: Path) -> None:
    _write_markdown_repo(tmp_path, "intro\n@impl SWR-101\n", "# behaviour\n@covers SWR-101\n")

    sweep = sweep_references(tmp_path, {}, MARKDOWN_LAYOUT, MARKDOWN_ONLY)

    assert [(o.file, o.line, o.kind) for o in sweep.impl_traces[101]] == [
        ("lib/feature.md", 2, "traces")
    ]
    assert [(o.file, o.line, o.kind) for o in sweep.test_coverage[101]] == [
        ("spec/feature.md", 2, "verifies")
    ]
    assert sweep.traced_files == {"lib/feature.md"}


@verifies(SWR.SWR_2337)
def test_python_files_are_invisible_to_a_registry_that_does_not_claim_them(
    tmp_path: Path,
) -> None:
    _write_markdown_repo(tmp_path, "intro\n", "# behaviour\n")
    (tmp_path / "lib" / "feature.py").write_text(
        f"@{T}(SWR.SWR_101)\ndef feature() -> None: ...\n", encoding="utf-8"
    )

    sweep = sweep_references(tmp_path, {}, MARKDOWN_LAYOUT, MARKDOWN_ONLY)

    assert sweep.impl_traces == {}


@verifies(SWR.SWR_2333, SWR.SWR_2337)
def test_reverse_orphan_checks_consult_the_same_convention(tmp_path: Path) -> None:
    _write_markdown_repo(tmp_path, "intro\n", "# behaviour\n")
    (tmp_path / "lib" / "README.md").write_text("shim\n", encoding="utf-8")

    sweep = sweep_references(tmp_path, {}, MARKDOWN_LAYOUT, MARKDOWN_ONLY)

    # The convention's own shim rule excuses README.md; feature.md stays an orphan.
    assert find_orphan_modules(tmp_path, sweep, MARKDOWN_LAYOUT, MARKDOWN_ONLY) == [
        "lib/feature.md"
    ]


@verifies(SWR.SWR_2334, SWR.SWR_2337)
def test_orphan_test_check_uses_the_conventions_test_functions(tmp_path: Path) -> None:
    _write_markdown_repo(tmp_path, "intro\n@impl SWR-101\n", "# behaviour\n# other\n")

    sweep = sweep_references(tmp_path, {}, MARKDOWN_LAYOUT, MARKDOWN_ONLY)

    assert find_orphan_tests(tmp_path, sweep, MARKDOWN_LAYOUT, MARKDOWN_ONLY) == [
        "spec/feature.md::test_behaviour",
        "spec/feature.md::test_other",
    ]


@verifies(SWR.SWR_2337)
def test_python_convention_recognises_decorators_direct_calls_and_req_comments() -> None:
    convention = PythonConvention()
    text = f"@{T}(SWR.SWR_101)\ndef impl() -> None: ...\n\n{T}(SWR.SWR_102)(impl)\n{RQ}: SWR-103\n"

    refs = convention.iter_references(text, {})

    assert [(r.kind, r.number, r.line) for r in refs] == [
        ("traces", 101, 1),
        ("traces", 102, 4),
        ("@req", 103, 5),
    ]


@verifies(SWR.SWR_2337)
def test_python_convention_resolves_and_reports_legacy_ids() -> None:
    convention = PythonConvention()

    resolved = convention.iter_references(f"{RQ}: FR-7\n", {"FR-7": "SWR-104"})
    assert [(r.kind, r.number) for r in resolved] == [("@req", 104)]

    unresolved = convention.iter_references(f"{RQ}: FR-9\n", {})
    assert [(r.kind, r.number, r.raw_id) for r in unresolved] == [("@req", None, "FR-9")]


@verifies(SWR.SWR_2337)
def test_python_convention_collects_module_level_and_nested_test_functions() -> None:
    convention = PythonConvention()
    text = (
        "def test_top() -> None: ...\n\nclass TestGroup:\n    def test_inner(self) -> None: ...\n"
    )

    assert [fn.qualname for fn in convention.iter_test_functions(text)] == [
        "test_top",
        "TestGroup::test_inner",
    ]
    assert convention.iter_test_functions("def broken(:\n") == []


@verifies(SWR.SWR_2337)
def test_registry_resolves_by_extension_and_defaults_to_python() -> None:
    registry = ConventionRegistry([PythonConvention(), MarkdownConvention()])

    assert registry.extensions() == (".py", ".md")
    assert isinstance(registry.for_path("a/b.py"), PythonConvention)
    assert isinstance(registry.for_path("a/b.md"), MarkdownConvention)
    assert registry.for_path("a/b.rs") is None
    assert [c.name for c in DEFAULT_CONVENTIONS.conventions] == ["python"]


@verifies(SWR.SWR_2337)
def test_registry_extension_can_be_added_without_mutating_the_default() -> None:
    extended = DEFAULT_CONVENTIONS.extended_with([MarkdownConvention()])

    assert extended.extensions() == (".py", ".md")
    assert DEFAULT_CONVENTIONS.extensions() == (".py",)


# -- the call-level reading (SWR-3517) -------------------------------------


#: Assembled from the token constants, never written literally — this file's own
#: source must stay unscannable, and a fixture naming SWR-101 in a form the sweep
#: recognises would attribute a real requirement to a test that does not cover it.
SYM = "SWR.SWR_"
ANNOTATED = (
    f"@{T}({SYM}101, {SYM}102)\n"
    "def one() -> None: ...\n"
    "\n"
    "\n"
    f"@{T}(\n"
    f"    {SYM}103,\n"
    f"    {SYM}104,\n"
    ")\n"
    "def two() -> None: ...\n"
    "\n"
    "\n"
    f"@{V}({SYM}105)\n"
    "def a_covering_test() -> None: ...\n"
    "\n"
    "\n"
    f"{T}({SYM}106)(one)\n"
)


@verifies(SWR.SWR_3517)
def test_an_annotation_carries_every_id_it_holds() -> None:
    """Productive use: a rewriter has to know whether an id is alone in its annotation.
    Expected outcome: the call is the unit, so dropping one id from a pair is expressible —
    which a reference, fanned out one per id with no back-link, can never say."""
    annotations = PythonConvention().iter_annotations(ANNOTATED)

    assert [one.kind for one in annotations] == ["traces", "traces", "verifies", "traces"]
    assert [[held.raw_id for held in one.ids] for one in annotations] == [
        ["SWR-101", "SWR-102"],
        ["SWR-103", "SWR-104"],
        ["SWR-105"],
        ["SWR-106"],
    ]


@verifies(SWR.SWR_3517)
def test_a_wrapped_annotation_reports_the_span_it_really_occupies() -> None:
    """Productive use: an annotation written over several lines is rewritten as a whole.
    Expected outcome: the span is the call's, not the line one of its symbols sits on —
    the difference between removing an annotation and orphaning an open bracket."""
    wrapped = PythonConvention().iter_annotations(ANNOTATED)[1]

    assert (wrapped.start_line, wrapped.end_line) == (5, 8)
    # Each id still reports its own line, which is what the sweep reads.
    assert [held.line for held in wrapped.ids] == [6, 7]
    assert wrapped.covers(6) and wrapped.covers(8)
    assert not wrapped.covers(9)
    assert wrapped.id_at(6, 103) is not None
    assert wrapped.id_at(7, 103) is None, "an id is found at its own line, not anywhere in the span"


@verifies(SWR.SWR_3517)
def test_the_call_form_is_distinguishable_from_a_decorator() -> None:
    """Productive use: this package annotates itself by applying the decorator to a name.
    Expected outcome: that line is behaviour, and a caller can tell — deleting it would
    remove what a module does rather than what it claims."""
    annotations = PythonConvention().iter_annotations(ANNOTATED)

    assert [one.decorator for one in annotations] == [True, True, True, False]


@verifies(SWR.SWR_3517)
def test_both_readings_agree_on_every_id() -> None:
    """Productive use: the sweep and a rewriter must not disagree about what a file claims.
    Expected outcome: one scan, two readings — the references are derived from the
    annotations rather than parsed a second time."""
    convention = PythonConvention()

    references = [ref for ref in convention.iter_references(ANNOTATED, {}) if ref.number]
    from_annotations = [
        (annotation.kind, held.number, held.line, held.raw_id)
        for annotation in convention.iter_annotations(ANNOTATED)
        for held in annotation.ids
    ]

    assert [(ref.kind, ref.number, ref.line, ref.raw_id) for ref in references] == from_annotations


@verifies(SWR.SWR_3517)
def test_an_id_span_addresses_exactly_the_symbol() -> None:
    """Productive use: a re-point replaces one id and leaves everything around it alone.
    Expected outcome: the span covers the symbol and nothing else, so the edit cannot
    spill into a neighbouring id or the call itself."""
    first = PythonConvention().iter_annotations(ANNOTATED)[0]

    held = first.ids[1]
    assert ANNOTATED[held.start : held.end] == "SWR_102"
    rewritten = ANNOTATED[: held.start] + "SWR_999" + ANNOTATED[held.end :]
    assert rewritten.splitlines()[0] == f"@{T}({SYM}101, {SYM}999)"


@verifies(SWR.SWR_3223, SWR.SWR_2337)
def test_a_line_index_answers_every_position_the_way_counting_newlines_does() -> None:
    """Productive use: the sweep asks for the line of each of tens of thousands of
    annotations across a repository's source.
    Expected outcome: the same line number the counting form gives — at the start of
    a file, on a newline character itself, on the first character after one, at the
    last position and past the end.

    Exhaustive over the awkward shapes rather than sampled, because the whole class
    of bug here is an off-by-one at a boundary, and a boundary is exactly what a
    sampled test steps over. The repository-scale version of this assertion ran over
    1.25 million positions in 120 real source files before the change shipped; what
    is kept here is every text where a boundary can hide, at every position in it.
    """
    from rotaris_core.reqtocode.conventions import LineIndex, line_of

    texts = (
        "",
        "\n",
        "\n\n\n",
        "a",
        "a\n",
        "\na",
        "a\nb\nc",
        "a\n\nb",
        "line one\r\nline two\r\n",
        "no newline at all, just a long single line",
    )
    for text in texts:
        index = LineIndex(text)
        for pos in range(len(text) + 3):
            assert index.line(pos) == line_of(text, pos), (repr(text), pos)


@verifies(SWR.SWR_3223, SWR.SWR_2337)
def test_the_sweep_reports_the_same_lines_however_the_line_numbers_are_found(
    tmp_path: Path,
) -> None:
    """Productive use: a violation names the file and line a developer must open.
    Expected outcome: the line is the annotation's own — the single-line form, each
    id of a multi-line one, and a transitional comment.

    This pins the *integration*: that the sweep reports through the line index at
    all, and reports the id's own line rather than its call's. It is not the guard
    for the index's arithmetic — measured against two deliberate off-by-ones, this
    survived both and the exhaustive test above caught both, because annotations sit
    at line starts, where an off-by-one cancels. Two tests, two jobs.
    """
    source = "\n".join(
        [
            "'''A module.'''",
            "",
            f"@{T}(SWR.SWR_1)",
            "def first() -> None:",
            "    pass",
            "",
            "",
            f"@{T}(",
            "    SWR.SWR_2,",
            "    SWR.SWR_3,",
            ")",
            "def second() -> None:",
            f"    {RQ}: SWR-4",
            "    pass",
        ],
    )

    references = PythonConvention().iter_references(source, {})

    assert [(one.raw_id, one.line) for one in references] == [
        ("SWR-1", 3),
        ("SWR-2", 9),
        ("SWR-3", 10),
        ("SWR-4", 13),
    ]
