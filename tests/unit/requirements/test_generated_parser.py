"""Productive use: a project whose requirements no field mapping can express — one
document declaring many, a table, an export — is read through a parser that belongs to
the project's own repository, and the user who accepted that parser can trust what
bounds it.
Expected outcome: a parser outside the permitted language is refused before it is ever
executed with the construct and line named, a parser whose bytes moved since acceptance
is refused until it is accepted again, a looping parser is killed at its budget and
reported, output outside the contract is a named error, and what the parser did not
claim is reported rather than dropped."""

from __future__ import annotations

import json
import pathlib
import textwrap
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.model import RequirementLifecycle
from rotaris_core.requirements.sources.base import RequirementSourceError
from rotaris_core.requirements.sources.generated import (
    GeneratedParserConfig,
    GeneratedParserSource,
    ParserRunError,
    admit_parser,
    parser_digest,
    read_parser_output,
)
from rotaris_core.requirements.sources.parser_host import run_parser

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


#: A complete, admissible parser: one requirement per ``## <ID> — <title>``
#: section of one document — the exact shape no declarative mapping expresses.
SECTION_PARSER = textwrap.dedent(
    '''\
    """Reads REQUIREMENTS.md: one requirement per `## FR-n — title` section."""

    import json
    import re
    import sys
    from pathlib import Path

    root = Path(sys.argv[1])
    text = (root / "REQUIREMENTS.md").read_text(encoding="utf-8").replace("\\r\\n", "\\n")
    requirements = []
    unclaimed = []
    for section in sorted(re.split(r"^## ", text, flags=re.MULTILINE)[1:]):
        heading, _, body = section.partition("\\n")
        match = re.match(r"(?P<id>FR-\\d+)\\s+\\u2014\\s+(?P<title>.+)", heading.strip())
        if match is None:
            unclaimed.append({"path": "REQUIREMENTS.md", "reason": f"no id in {heading.strip()!r}"})
            continue
        requirements.append(
            {
                "req_id": match.group("id"),
                "title": match.group("title"),
                "description": body.strip(),
                "lifecycle": "approved",
                "source_path": "REQUIREMENTS.md",
            }
        )
    print(json.dumps({"requirements": requirements, "unclaimed": unclaimed}, sort_keys=True))
    '''
)

STORE = textwrap.dedent(
    """\
    # Requirements

    ## FR-2 — Second thing

    The product does the second thing.

    ## FR-1 — First thing

    The product does the first thing.

    ## Notes for the team

    Not a requirement at all.
    """
)


def _workspace(tmp_path: Path, parser_source: str = SECTION_PARSER) -> tuple[Path, Path]:
    (tmp_path / "REQUIREMENTS.md").write_text(STORE, encoding="utf-8")
    parser = tmp_path / "rotaris_requirement_parser.py"
    parser.write_text(parser_source, encoding="utf-8")
    return tmp_path, parser


def _source(root: Path, parser: Path, **overrides: object) -> GeneratedParserSource:
    config = GeneratedParserConfig.model_validate(
        {
            "sha256": parser_digest(parser.read_bytes()),
            "watch": "REQUIREMENTS.md",
            **overrides,
        },
    )
    return GeneratedParserSource(root, config)


# --------------------------------------------------------------------------
# Admissibility: refused before execution, with the construct and line named
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3123)
@pytest.mark.parametrize(
    ("snippet", "named"),
    [
        ("import subprocess\n", "subprocess"),
        ("import socket\n", "socket"),
        ("import os\n", "os"),
        ("import requests\n", "requests"),
        ("from urllib.request import urlopen\n", "urllib"),
        ("from . import sibling\n", "relative"),
        ("eval('1 + 1')\n", "eval"),
        ("exec('pass')\n", "exec"),
        ("__import__('os')\n", "__import__"),
        ("compile('pass', '<s>', 'exec')\n", "compile"),
        ("input('? ')\n", "input"),
        ("breakpoint()\n", "breakpoint"),
        ("open('x', 'w')\n", "mode 'w'"),
        ("open('x', mode='a')\n", "mode 'a'"),
        ("from pathlib import Path\nPath('x').open('r+')\n", "mode 'r+'"),
        ("from pathlib import Path\nPath('x').write_text('y')\n", "write_text"),
        ("from pathlib import Path\nPath('x').unlink()\n", "unlink"),
        ("def f():\n    return f.__globals__\n", "__globals__"),
        # Reflection: a name that reaches an attribute this check cannot see.
        # The write is real — `getattr(p, "write_text")("x")` writes — and the
        # outer call's func is a Call node, which the call check never inspects;
        # refusing the *name* is what closes it, aliases included.
        ("from pathlib import Path\ngetattr(Path('x'), 'write_text')('y')\n", "getattr"),
        ("g = getattr\n", "getattr"),
        ("def f():\n    return getattr(f, '__globals__')\n", "getattr"),
        ("setattr(json, 'x', 1)\n", "setattr"),
        ("delattr(json, 'x')\n", "delattr"),
        ("locals()\n", "locals"),
        # `exec` injects real builtins into the parser's globals, so the bare
        # name is reachable even though nothing imports it.
        ("print(__builtins__)\n", "__builtins__"),
        # The module table fetches back what the import allowlist left out; `os`
        # is already imported in the child before the parser runs.
        ("import sys\nsys.modules['os'].system('x')\n", "modules"),
        # Refused on any receiver, harmless ones included — the permitted
        # language errs that way on purpose.
        ("print(json.modules)\n", "modules"),
        # The class hierarchy reaches `os` without importing anything.
        # `__class__` alone is common and stays legal; these links do not.
        ("print(().__class__.__mro__)\n", "__mro__"),
        ("print(type(1).mro())\n", "mro"),
        ("print(().__class__.__bases__)\n", "__bases__"),
        ("print(object.__subclasses__())\n", "__subclasses__"),
        ("def f():\n    return f.__code__\n", "__code__"),
        ("def f():\n    return f.__closure__\n", "__closure__"),
    ],
)
def test_each_forbidden_construct_is_refused_with_its_line(snippet: str, named: str) -> None:
    """The permitted language is the whole wall; every breach is located."""
    source = "import json\n" + snippet

    admission = admit_parser(source)

    assert not admission.admissible
    refusal = admission.refusals[0]
    assert named.lower() in refusal.message.lower(), admission.describe()
    assert refusal.line >= 2, "the refusal points at the construct, not the file"


@verifies(SWR.SWR_3123)
def test_the_allowed_standard_library_is_admitted(tmp_path: Path) -> None:
    """A parser inside the contract passes, including a read-only open."""
    admission = admit_parser(SECTION_PARSER)

    assert admission.admissible, admission.describe()
    assert "Admissible" in admission.describe()


#: Every spelling that sits *next to* a refusal without being one. Each line is
#: here because a coarser wall would have taken it: a variable called ``modules``
#: is a name and not a reach, ``sys.stdout.write`` is the contract's own channel,
#: ``open`` without a mode reads, two-argument ``replace`` is the string method,
#: and ``__class__``/``type`` are reflection that leads nowhere the banned sets
#: do not already cut.
ADJACENT_PARSER = textwrap.dedent(
    '''\
    """Every spelling that sits next to a refusal without being one."""

    import json
    import re
    import sys
    from pathlib import Path

    root = Path(sys.argv[1])
    modules = []
    for path in sorted(root.rglob("*.md")):
        text = path.read_text(encoding="utf-8").replace("\\r\\n", "\\n")
        with open(path, encoding="utf-8") as handle:
            first = handle.readline()
        modules.append(
            {
                "req_id": path.stem,
                "title": re.sub(r"^#\\s*", "", first).strip(),
                "description": text.strip(),
                "lifecycle": "approved",
                "source_path": path.name,
                "kind": type(text).__name__,
                "shape": text.__class__.__name__,
            }
        )
    sys.stdout.write(json.dumps({"requirements": modules, "unclaimed": []}, sort_keys=True))
    '''
)


@verifies(SWR.SWR_3123)
def test_the_spellings_next_to_the_refusals_stay_admissible() -> None:
    """A wall that refuses the language it exists to permit is a wall in the way.

    The bypass corpus above only proves the check is strict enough; this proves
    it is not strict by accident, and names each near-miss so a future widening
    fails here rather than in somebody's repository.
    """
    admission = admit_parser(ADJACENT_PARSER)

    assert admission.admissible, admission.describe()


@verifies(SWR.SWR_3123)
def test_an_uncheckable_file_mode_is_refused_not_shrugged_at() -> None:
    """Admissibility is the only wall; what it cannot read, it refuses."""
    admission = admit_parser("mode = 'w'\nopen('x', mode)\n")

    assert not admission.admissible
    assert "not a string literal" in admission.refusals[0].message


@verifies(SWR.SWR_3123)
def test_a_file_that_is_not_python_is_refused_as_exactly_that() -> None:
    admission = admit_parser("this is not python (")

    assert not admission.admissible
    assert "not valid Python" in admission.refusals[0].message


# --------------------------------------------------------------------------
# The pin, the budget, and the contract
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3123)
def test_a_parser_whose_bytes_moved_is_refused_until_accepted_again(tmp_path: Path) -> None:
    """Review is of a file; a changed file is a new review."""
    root, parser = _workspace(tmp_path)
    source = _source(root, parser)
    assert len(source.read().requirements) == 2

    parser.write_text(SECTION_PARSER + "\n# tampered\n", encoding="utf-8")

    with pytest.raises(RequirementSourceError, match="changed since it was accepted"):
        source.read()


@verifies(SWR.SWR_3123)
@pytest.mark.parametrize(
    "hostile",
    [
        'from pathlib import Path\nPath("ran.marker").write_text("ran")\n',
        # The same write, reached through a name the check cannot follow. The
        # outer call's func is a Call node, so judging calls alone never sees
        # the write; the refusal has to land on `getattr` itself.
        'from pathlib import Path\ngetattr(Path("ran.marker"), "write_text")("ran")\n',
    ],
    ids=["written directly", "reached through getattr"],
)
def test_an_inadmissible_parser_is_never_executed(tmp_path: Path, hostile: str) -> None:
    """The pin passes — the file is the accepted one — and admission still refuses.

    Marker-file proof: the parser would write a file if it ran, and the refusal
    happens in the parent, so nothing can have. This is the criterion itself
    ("refused *before execution*"), not the verdict that stands in for it —
    naming a construct and never running it are different promises.
    """
    root = tmp_path
    (root / "REQUIREMENTS.md").write_text(STORE, encoding="utf-8")
    parser = root / "rotaris_requirement_parser.py"
    parser.write_text(hostile, encoding="utf-8")
    source = _source(root, parser)

    with pytest.raises(RequirementSourceError, match="outside the permitted language"):
        source.read()
    assert not (root / "ran.marker").exists()


@verifies(SWR.SWR_3123)
def test_a_looping_parser_is_killed_at_its_budget_and_reported(tmp_path: Path) -> None:
    """ "Bounded by a timeout and killed on it" — the clause, executed."""
    root = tmp_path
    (root / "REQUIREMENTS.md").write_text(STORE, encoding="utf-8")
    parser = root / "rotaris_requirement_parser.py"
    parser.write_text("while True:\n    pass\n", encoding="utf-8")

    with pytest.raises(ParserRunError, match="budget and was killed"):
        run_parser(root, parser, timeout=3.0)


@verifies(SWR.SWR_3123)
def test_a_crashing_parser_reports_its_own_traceback_line(tmp_path: Path) -> None:
    root = tmp_path
    (root / "REQUIREMENTS.md").write_text(STORE, encoding="utf-8")
    parser = root / "rotaris_requirement_parser.py"
    parser.write_text('raise ValueError("the store surprised me")\n', encoding="utf-8")

    with pytest.raises(ParserRunError, match="the store surprised me"):
        run_parser(root, parser, timeout=30.0)


@verifies(SWR.SWR_3123)
def test_output_that_is_not_json_is_a_named_contract_error() -> None:
    with pytest.raises(ParserRunError, match="not JSON"):
        read_parser_output("here are your requirements: FR-1, FR-2")


@verifies(SWR.SWR_3123)
def test_output_outside_the_contract_is_a_named_contract_error() -> None:
    """A parser inventing fields is answering outside the contract."""
    payload = json.dumps(
        {"requirements": [{"req_id": "FR-1", "current_hash": "forged"}], "unclaimed": []},
    )

    with pytest.raises(ParserRunError, match="outside the contract"):
        read_parser_output(payload)


@verifies(SWR.SWR_3123)
def test_a_parser_cannot_forge_identity_or_provenance(tmp_path: Path) -> None:
    """Content in, identity out of Rotaris' own hands (SWR-3107)."""
    root, parser = _workspace(tmp_path)
    source = _source(root, parser)

    read = source.read()

    first = read.requirements[0]
    assert first.source_id == "generated", "stamped by the read, not stated by the parser"
    assert first.source_revision == read.revision
    assert first.current_hash, "computed from normalised content by the canonical model"
    assert first.lifecycle is RequirementLifecycle.APPROVED


# --------------------------------------------------------------------------
# The read: unclaimed documents, duplicates, caching
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3123)
def test_what_the_parser_did_not_claim_is_reported_never_dropped(tmp_path: Path) -> None:
    """The silent partial read is the defect this area exists to prevent."""
    root, parser = _workspace(tmp_path)

    read = _source(root, parser).read()

    assert [requirement.req_id for requirement in read.requirements] == ["FR-1", "FR-2"]
    (issue,) = read.issues
    assert "not claimed" in issue.message
    assert "Notes for the team" in issue.message
    assert issue.location == "REQUIREMENTS.md"


@verifies(SWR.SWR_3123)
def test_a_duplicate_id_is_an_issue_and_one_requirement(tmp_path: Path) -> None:
    duplicating = SECTION_PARSER.replace(
        'match.group("id")',
        '"FR-1"',
    )
    root = tmp_path
    (root / "REQUIREMENTS.md").write_text(STORE, encoding="utf-8")
    parser = root / "rotaris_requirement_parser.py"
    parser.write_text(duplicating, encoding="utf-8")

    read = _source(root, parser).read()

    assert [requirement.req_id for requirement in read.requirements] == ["FR-1"]
    assert any("duplicate requirement id" in issue.message for issue in read.issues)


@verifies(SWR.SWR_3116, SWR.SWR_3123)
def test_an_unchanged_tree_costs_no_process_at_all(tmp_path: Path) -> None:
    """``revision()`` never runs the parser, and ``read()`` caches on it."""
    root, parser = _workspace(tmp_path)
    source = _source(root, parser)

    first = source.read()
    second = source.read()
    assert second is first, "the second read answered from the revision cache"

    (root / "REQUIREMENTS.md").write_text(
        STORE + "\n## FR-3 — Third thing\n\nAlso.\n",
        encoding="utf-8",
    )
    third = source.read()
    assert third is not first
    assert [requirement.req_id for requirement in third.requirements] == ["FR-1", "FR-2", "FR-3"]


@verifies(SWR.SWR_3223, SWR.SWR_3116)
def test_an_unchanged_tree_is_stated_not_re_read(tmp_path: Path, monkeypatch) -> None:
    """Productive use: a board refresh asks every source whether anything moved, and this
    source watches a documentation tree that did not.
    Expected outcome: it answers by stat, reading no file content at all — the answer
    to "did anything change" must not cost the whole tree.

    Counted rather than timed, by making `read_bytes` say how often it was called: the
    property is "zero reads", and zero is the kind of assertion a loaded CI runner
    cannot turn into a flake.
    """
    root, parser = _workspace(tmp_path)
    source = _source(root, parser)

    first = source.revision()

    reads: list[str] = []
    original = pathlib.Path.read_bytes

    def counted(self: Path) -> bytes:
        reads.append(self.name)
        return original(self)

    monkeypatch.setattr(pathlib.Path, "read_bytes", counted)

    assert source.revision() == first, "the token moved over a tree that did not"
    assert reads == [], f"an unchanged tree was re-read: {reads}"


@verifies(SWR.SWR_3223, SWR.SWR_3116)
def test_every_way_a_watched_file_can_move_still_moves_the_token(tmp_path: Path) -> None:
    """Productive use: someone edits a watched document, adds one, removes one, or
    replaces the parser.
    Expected outcome: the token moves for each — the memo is an optimisation of *how*
    the answer is found, never of what it is.

    Each step is asserted against the step before it rather than against every token
    ever seen, because a token that returned to an earlier value would be *correct*:
    it is a digest of content, so putting the tree back puts the token back. The last
    two assertions pin exactly that, since a memo keyed on a stat is the one thing
    that could get a round trip wrong.

    The residual this cannot cover — a write preserving size *and* mtime — is stated
    in `revision()`'s own docstring rather than pretended away here.
    """
    root, parser = _workspace(tmp_path)
    source = _source(root, parser, watch="*.md")
    previous = source.revision()

    def moved(what: str) -> str:
        nonlocal previous
        token = source.revision()
        assert token != previous, f"{what} did not move the token"
        previous = token
        return token

    document = root / "REQUIREMENTS.md"
    document.write_text(document.read_text(encoding="utf-8") + "\n## FR-3 — Third\n\nA.\n")
    without_extra_file = moved("an edited document")

    (root / "MORE.md").write_text("## FR-4 — Fourth\n\nB.\n", encoding="utf-8")
    moved("an added document")

    (root / "MORE.md").unlink()
    assert moved("a removed document") == without_extra_file, (
        "removing the added file left a token the same tree did not have before it"
    )

    parser.write_text(parser.read_text(encoding="utf-8") + "\n# a comment\n", encoding="utf-8")
    moved("an edited parser")


@verifies(SWR.SWR_3223, SWR.SWR_3116)
def test_a_file_that_leaves_and_returns_is_read_again_rather_than_remembered(
    tmp_path: Path,
) -> None:
    """Productive use: a watched document is deleted and a different one takes its name.
    Expected outcome: the token reflects the new content, not the departed file's.

    The memo entry has to go when the file does, or a path that comes back answers
    from before it left — the one way a per-path memo can be actively wrong rather
    than merely stale.
    """
    root, parser = _workspace(tmp_path)
    source = _source(root, parser, watch="*.md")
    document = root / "REQUIREMENTS.md"
    original_text = document.read_text(encoding="utf-8")

    before = source.revision()
    document.unlink()
    source.revision()
    document.write_text(original_text.replace("FR-2", "FR-9"), encoding="utf-8")

    assert source.revision() != before, "the returning file answered from the old memo"

    document.write_text(original_text, encoding="utf-8")
    assert source.revision() == before, "restoring the content did not restore the token"


@verifies(SWR.SWR_3123)
def test_the_source_is_read_only_by_construction(tmp_path: Path) -> None:
    """A parser is one-directional; the board must be offered no edit (SWR-3105)."""
    from rotaris_core.requirements.model import SourceCapability
    from rotaris_core.requirements.sources.base import UnsupportedOperation

    root, parser = _workspace(tmp_path)
    source = _source(root, parser)
    source.read()

    assert not source.capabilities.can(SourceCapability.UPDATE)
    with pytest.raises(UnsupportedOperation):
        source.delete("FR-1")
    assert source.locate("FR-1") == "REQUIREMENTS.md"


# --------------------------------------------------------------------------
# The configuration
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3123)
def test_the_configuration_refuses_paths_that_leave_the_repository() -> None:
    with pytest.raises(ValueError, match="stay inside the repository"):
        GeneratedParserConfig(sha256="abc", watch="docs/**/*.md", parser="../elsewhere.py")
    with pytest.raises(ValueError, match="stay inside the repository"):
        GeneratedParserConfig(sha256="abc", watch="/etc/**")


@verifies(SWR.SWR_3123)
def test_the_configuration_document_names_its_kind() -> None:
    document = GeneratedParserConfig(sha256="abc", watch="docs/**/*.md").as_document()

    assert document["kind"] == "programmatic"
    assert document["parser"] == "rotaris_requirement_parser.py"
    assert document["sha256"] == "abc"
