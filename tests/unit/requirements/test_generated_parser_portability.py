"""Productive use: a team shares a repository whose requirements are read through a
generated parser, across Windows and POSIX checkouts, and every member's board shows
the same requirements with the same hashes.
Expected outcome: the same parser over the same content answers byte-identically under
CRLF and LF, locations are repository-relative POSIX paths on every host, two runs over
an unchanged tree agree byte for byte, and the ordering of the output is a property of
the content rather than of the filesystem the parser happened to walk."""

from __future__ import annotations

import textwrap
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.sources.generated import (
    GeneratedParserConfig,
    GeneratedParserSource,
    parser_digest,
)
from rotaris_core.requirements.sources.parser_host import run_parser

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


#: A parser over a *tree* of prose documents, written the way the contract asks:
#: line endings normalised, paths emitted as repository-relative POSIX, ordering
#: sorted explicitly rather than inherited from the filesystem.
TREE_PARSER = textwrap.dedent(
    '''\
    """One requirement per document; the id opens the first heading."""

    import json
    import re
    import sys
    from pathlib import Path

    root = Path(sys.argv[1])
    requirements = []
    unclaimed = []
    documents = sorted(root.glob("requirements/*.md"), key=lambda p: p.name)
    for document in documents:
        relative = document.relative_to(root).as_posix()
        text = document.read_text(encoding="utf-8").replace("\\r\\n", "\\n")
        match = re.match(r"# (?P<id>FR-\\d+) \\u2014 (?P<title>.+)", text)
        if match is None:
            unclaimed.append({"path": relative, "reason": "no id in the first heading"})
            continue
        requirements.append(
            {
                "req_id": match.group("id"),
                "title": match.group("title").strip(),
                "description": text.partition("\\n")[2].strip(),
                "source_path": relative,
            }
        )
    print(json.dumps({"requirements": requirements, "unclaimed": unclaimed}, sort_keys=True))
    '''
)


def _workspace(tmp_path: Path, *, newline: str) -> tuple[Path, Path]:
    """A store whose documents use *newline*, and the parser beside it."""
    store = tmp_path / "requirements"
    store.mkdir(parents=True)
    for number, title in ((1, "First thing"), (2, "Second thing")):
        body = f"# FR-{number} — {title}\n\nThe product does thing {number}.\n"
        (store / f"FR-{number}.md").write_bytes(body.replace("\n", newline).encode("utf-8"))
    (store / "NOTES.md").write_bytes(f"Prose only.{newline}".encode())
    parser = tmp_path / "rotaris_requirement_parser.py"
    parser.write_text(TREE_PARSER, encoding="utf-8")
    return tmp_path, parser


@verifies(SWR.SWR_3123)
def test_crlf_and_lf_checkouts_answer_byte_identically(tmp_path: Path) -> None:
    """The same content, however the checkout flavoured it, is the same answer.

    Byte-for-byte over the child's stdout — the strongest claim there is, and
    the one that keeps SWR-3107's hashes equal across a team.
    """
    lf_root, lf_parser = _workspace(tmp_path / "lf", newline="\n")
    crlf_root, crlf_parser = _workspace(tmp_path / "crlf", newline="\r\n")

    lf_output = run_parser(lf_root, lf_parser, timeout=30.0)
    crlf_output = run_parser(crlf_root, crlf_parser, timeout=30.0)

    assert lf_output == crlf_output


@verifies(SWR.SWR_3123)
def test_two_runs_over_an_unchanged_tree_agree_byte_for_byte(tmp_path: Path) -> None:
    """Non-determinism is the characteristic defect of generated code.

    Iteration order, dict ordering, a stray timestamp — all invisible in one
    run. This is the check phase 2's validation will run twice; the runtime
    proves here that a conforming parser passes it.
    """
    root, parser = _workspace(tmp_path, newline="\n")

    first = run_parser(root, parser, timeout=30.0)
    second = run_parser(root, parser, timeout=30.0)

    assert first == second


@verifies(SWR.SWR_3123)
def test_locations_are_posix_and_relative_on_every_host(tmp_path: Path) -> None:
    """What lands on the board names artefacts the whole team can resolve."""
    root, parser = _workspace(tmp_path, newline="\n")
    source = GeneratedParserSource(
        root,
        GeneratedParserConfig(
            sha256=parser_digest(parser.read_bytes()),
            watch="requirements/*.md",
        ),
    )

    read = source.read()

    assert [requirement.source_path for requirement in read.requirements] == [
        "requirements/FR-1.md",
        "requirements/FR-2.md",
    ]
    assert all("\\" not in (requirement.source_path or "") for requirement in read.requirements)
    (issue,) = read.issues
    assert issue.location == "requirements/NOTES.md"


@verifies(SWR.SWR_3123)
def test_a_host_flavoured_path_is_a_contract_error_not_a_quiet_drift() -> None:
    """The clause is enforced at the boundary, not hoped for in the parser."""
    from rotaris_core.requirements.sources.generated import ParserRunError, read_parser_output

    windows = '{"requirements": [{"req_id": "FR-1", "source_path": "docs\\\\spec.md"}]}'
    absolute = '{"requirements": [{"req_id": "FR-1", "source_path": "/tmp/spec.md"}]}'
    drive = '{"requirements": [{"req_id": "FR-1", "source_path": "C:/repo/spec.md"}]}'

    for payload in (windows, absolute, drive):
        with pytest.raises(ParserRunError, match="outside the contract"):
            read_parser_output(payload)


@verifies(SWR.SWR_3123)
def test_hashes_are_equal_across_checkout_flavours(tmp_path: Path) -> None:
    """The reason the byte-identity above matters: identity follows content."""
    lf_root, lf_parser = _workspace(tmp_path / "lf", newline="\n")
    crlf_root, crlf_parser = _workspace(tmp_path / "crlf", newline="\r\n")
    lf_read = GeneratedParserSource(
        lf_root,
        GeneratedParserConfig(
            sha256=parser_digest(lf_parser.read_bytes()),
            watch="requirements/*.md",
        ),
    ).read()
    crlf_read = GeneratedParserSource(
        crlf_root,
        GeneratedParserConfig(
            sha256=parser_digest(crlf_parser.read_bytes()),
            watch="requirements/*.md",
        ),
    ).read()

    assert [requirement.current_hash for requirement in lf_read.requirements] == [
        requirement.current_hash for requirement in crlf_read.requirements
    ]
