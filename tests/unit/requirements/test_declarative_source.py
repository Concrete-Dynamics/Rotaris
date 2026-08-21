"""Productive use: a team whose requirements live in their own Markdown layout
describes that layout once, as data, and Rotaris reads it — no adapter code, no model
call, no per-start guessing.
Expected outcome: the same tree yields the same requirements every time; a mapping that
does not fit is a named error identifying the file and the field, and a document whose
id is missing is reported rather than auto-numbered."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.model import (
    RelationKind,
    RequirementLifecycle,
    RequirementType,
    SourceCapability,
)
from rotaris_core.requirements.sources.base import RequirementSourceError, supports
from rotaris_core.requirements.sources.declarative import (
    DeclarativeConfigError,
    DeclarativeSource,
    DeclarativeSourceConfig,
    FieldMapping,
    read_document,
    resolve_value,
)

if TYPE_CHECKING:
    from pathlib import Path

BASE_CONFIG: dict[str, object] = {
    "source-id": "specs",
    "type": "markdown",
    "glob": "specs/**/*.md",
    "id": "frontmatter.id",
    "title": "heading",
    "status": "frontmatter.state",
    "description": "body",
    "status-values": {"open": "draft", "accepted": "approved", "retired": "deprecated"},
}

EPIC = """---
id: REQ-1
state: accepted
---

# Authentication

Everything a user needs to get in.
"""

CHILD = """---
id: REQ-2
state: open
epic: REQ-1
kind: technical
blocked-by: [REQ-1, REQ-3]
meta:
  owner: alice
---

# Log in with a password

The user signs in with an email address and a password.
"""


def _write_specs(root: Path) -> Path:
    specs = root / "specs"
    (specs / "auth").mkdir(parents=True)
    (specs / "epic.md").write_text(EPIC, encoding="utf-8")
    (specs / "auth" / "login.md").write_text(CHILD, encoding="utf-8")
    return root


def _source(root: Path, **overrides: object) -> DeclarativeSource:
    config = DeclarativeSourceConfig.model_validate({**BASE_CONFIG, **overrides})
    return DeclarativeSource(root, config)


@pytest.mark.unit
@verifies(SWR.SWR_3104)
def test_field_mappings_resolve_frontmatter_heading_and_nested_paths(tmp_path: Path) -> None:
    """Everything a canonical requirement carries is reachable from the document."""
    source = _source(
        _write_specs(tmp_path),
        parent="frontmatter.epic",
        **{"req-type": "frontmatter.kind"},
        relations={"depends-on": "frontmatter.blocked-by"},
    )

    read = source.read()
    child = read.by_id()["REQ-2"]

    assert read.requirement_ids == ("REQ-2", "REQ-1"), "ordered by path, deterministically"
    assert child.title == "Log in with a password"
    assert child.description == "The user signs in with an email address and a password."
    assert child.lifecycle is RequirementLifecycle.DRAFT  # "open" through the value table
    assert child.req_type is RequirementType.TECHNICAL
    assert child.parent == "REQ-1"
    assert child.related_ids(RelationKind.DEPENDS_ON) == ("REQ-1", "REQ-3")
    assert child.source_path == "specs/auth/login.md"
    assert child.source_id == "specs"
    assert read.by_id()["REQ-1"].lifecycle is RequirementLifecycle.APPROVED

    # A nested frontmatter path resolves through the dotted expression.
    document = read_document(tmp_path / "specs" / "auth" / "login.md", "x.md", source_id="specs")
    nested = FieldMapping(source="frontmatter.meta.owner")
    assert resolve_value(document, nested, field="owner", source_id="specs") == "alice"

    # Writing is not offered, so nothing can quietly fail to happen (SWR-3105).
    assert not supports(source, SourceCapability.UPDATE)


@pytest.mark.unit
@verifies(SWR.SWR_3104)
def test_a_missing_or_malformed_id_is_reported_with_its_file(tmp_path: Path) -> None:
    """An invented id would be indistinguishable from a real one on the next read."""
    _write_specs(tmp_path)
    (tmp_path / "specs" / "auth" / "nameless.md").write_text(
        "---\nstate: open\n---\n\n# No id here\n",
        encoding="utf-8",
    )

    with pytest.raises(DeclarativeConfigError) as raised:
        _source(tmp_path).read()

    assert raised.value.field == "id"
    assert raised.value.location == "specs/auth/nameless.md"
    assert "resolved to nothing" in str(raised.value)

    # Blank is the same fact as missing, and is not filled in either.
    (tmp_path / "specs" / "auth" / "nameless.md").write_text(
        "---\nid: '   '\nstate: open\n---\n\n# Blank id\n",
        encoding="utf-8",
    )
    with pytest.raises(DeclarativeConfigError, match="resolved to nothing"):
        _source(tmp_path).read()


@pytest.mark.unit
@verifies(SWR.SWR_3104)
def test_the_id_mapping_may_never_carry_a_default(tmp_path: Path) -> None:
    """A default on the id *is* auto-numbering, so the configuration refuses it."""
    del tmp_path
    with pytest.raises(ValidationError, match="never auto-numbered"):
        DeclarativeSourceConfig.model_validate(
            {**BASE_CONFIG, "id": {"source": "frontmatter.id", "default": "REQ-0"}},
        )

    # An optional field may carry one: only identity is at stake.
    config = DeclarativeSourceConfig.model_validate(
        {**BASE_CONFIG, "status": {"source": "frontmatter.state", "default": "open"}},
    )
    assert config.lifecycle is not None
    assert config.lifecycle.default == "open"


@pytest.mark.unit
@verifies(SWR.SWR_3104)
def test_an_unresolvable_mapping_is_a_named_configuration_error(tmp_path: Path) -> None:
    """A typo in a mapping fails when the configuration is loaded, not later."""
    del tmp_path
    with pytest.raises(ValidationError, match="unknown expression"):
        DeclarativeSourceConfig.model_validate({**BASE_CONFIG, "title": "frontmater.title"})

    with pytest.raises(ValidationError, match="not a regular expression"):
        DeclarativeSourceConfig.model_validate(
            {**BASE_CONFIG, "id": {"source": "stem", "pattern": "(unclosed"}},
        )

    with pytest.raises(ValidationError, match="stay inside the source root"):
        DeclarativeSourceConfig.model_validate({**BASE_CONFIG, "glob": "../elsewhere/*.md"})


@pytest.mark.unit
@verifies(SWR.SWR_3104)
def test_a_value_that_fails_its_pattern_names_the_file_and_the_field(tmp_path: Path) -> None:
    """A pattern is how an id is lifted out of a file name — and how it is checked."""
    root = tmp_path
    specs = root / "specs"
    specs.mkdir(parents=True)
    (specs / "REQ-7-login.md").write_text("---\nstate: open\n---\n\n# Log in\n", encoding="utf-8")

    source = _source(root, id={"source": "stem", "pattern": r"^(?P<value>REQ-\d+)"})
    assert source.read().requirement_ids == ("REQ-7",)

    (specs / "notes.md").write_text("---\nstate: open\n---\n\n# Notes\n", encoding="utf-8")
    with pytest.raises(DeclarativeConfigError) as raised:
        source.read()

    assert raised.value.location == "specs/notes.md"
    assert raised.value.field == "id"
    assert "does not match pattern" in str(raised.value)


@pytest.mark.unit
@verifies(SWR.SWR_3104)
def test_an_unknown_lifecycle_is_named_and_a_value_table_resolves_it(tmp_path: Path) -> None:
    """A project's own vocabulary is translated by declaration, never by guess."""
    _write_specs(tmp_path)
    (tmp_path / "specs" / "auth" / "wip.md").write_text(
        "---\nid: REQ-9\nstate: brainstorming\n---\n\n# Something\n",
        encoding="utf-8",
    )

    with pytest.raises(DeclarativeConfigError) as raised:
        _source(tmp_path).read()

    assert raised.value.field == "status"
    assert raised.value.location == "specs/auth/wip.md"
    assert "brainstorming" in str(raised.value)

    resolved = _source(
        tmp_path,
        **{
            "status-values": {
                **{"open": "draft", "accepted": "approved"},
                "brainstorming": "draft",
            },
        },
    )
    assert resolved.read().by_id()["REQ-9"].lifecycle is RequirementLifecycle.DRAFT


@pytest.mark.unit
@verifies(SWR.SWR_3104)
def test_a_document_without_frontmatter_is_reported_and_skipped(tmp_path: Path) -> None:
    """A README beside the specs is not a broken requirement; it is not a requirement."""
    _write_specs(tmp_path)
    (tmp_path / "specs" / "README.md").write_text("Notes about this folder.\n", encoding="utf-8")

    read = _source(tmp_path).read()

    assert read.requirement_ids == ("REQ-2", "REQ-1")
    (issue,) = read.issues
    assert issue.location == "specs/README.md"
    assert "not a requirement document" in issue.message


@pytest.mark.unit
@verifies(SWR.SWR_3104)
def test_two_documents_claiming_one_id_are_reported(tmp_path: Path) -> None:
    """A collision is visible in the read, not resolved silently by ordering."""
    _write_specs(tmp_path)
    (tmp_path / "specs" / "auth" / "duplicate.md").write_text(
        "---\nid: REQ-1\nstate: open\n---\n\n# Also authentication\n",
        encoding="utf-8",
    )

    read = _source(tmp_path).read()

    collision = next(issue for issue in read.issues if issue.req_id == "REQ-1")
    assert collision.location == "specs/epic.md"
    assert "specs/auth/duplicate.md" in collision.message


@pytest.mark.unit
@verifies(SWR.SWR_3104)
def test_the_same_tree_reads_identically_twice_and_across_line_endings(tmp_path: Path) -> None:
    """Determinism is the whole point: stable ids need stable reads."""
    _write_specs(tmp_path)
    source = _source(tmp_path, parent="frontmatter.epic")

    first = source.read()
    second = source.read()
    assert first.model_dump_json() == second.model_dump_json()
    assert first.revision == second.revision

    # A CRLF checkout of the same tree is the same tree.
    crlf = tmp_path / "crlf"
    (crlf / "specs" / "auth").mkdir(parents=True)
    (crlf / "specs" / "epic.md").write_bytes(EPIC.replace("\n", "\r\n").encode("utf-8"))
    (crlf / "specs" / "auth" / "login.md").write_bytes(CHILD.replace("\n", "\r\n").encode("utf-8"))

    other = _source(crlf, parent="frontmatter.epic").read()
    assert [r.without_provenance() for r in other.requirements] == [
        r.without_provenance() for r in first.requirements
    ]
    assert other.revision == first.revision


@pytest.mark.unit
@verifies(SWR.SWR_3104)
def test_the_revision_follows_content_and_never_a_timestamp(tmp_path: Path) -> None:
    """An mtime-based token would report a change every time a file was touched."""
    _write_specs(tmp_path)
    source = _source(tmp_path)
    login = tmp_path / "specs" / "auth" / "login.md"

    first = source.revision()
    login.write_text(login.read_text(encoding="utf-8"), encoding="utf-8")
    assert source.revision() == first

    login.write_text(CHILD.replace("a password", "a passkey"), encoding="utf-8")
    assert source.revision() != first

    artifacts = {artifact.location: artifact for artifact in source.discover()}
    assert artifacts["specs/auth/login.md"].requirement_ids == ("REQ-2",)
    assert artifacts["specs/auth/login.md"].revision != artifacts["specs/epic.md"].revision


@pytest.mark.unit
@verifies(SWR.SWR_3104)
def test_a_scalar_field_mapped_to_a_list_is_an_error_not_a_silent_first_element(
    tmp_path: Path,
) -> None:
    """Taking the first of several parents would invent a hierarchy nobody wrote."""
    _write_specs(tmp_path)

    with pytest.raises(DeclarativeConfigError) as raised:
        _source(tmp_path, parent="frontmatter.blocked-by").read()

    assert raised.value.field == "parent"
    assert raised.value.location == "specs/auth/login.md"
    assert "but this field holds one" in str(raised.value)


@pytest.mark.unit
@verifies(SWR.SWR_3104)
def test_a_missing_source_root_is_named_rather_than_read_as_empty(tmp_path: Path) -> None:
    """ "No requirements" and "could not look" must not be the same answer."""
    with pytest.raises(RequirementSourceError, match="source root not found"):
        _source(tmp_path / "absent").read()


@pytest.mark.unit
@verifies(SWR.SWR_3102, SWR.SWR_3104)
def test_a_glob_that_matches_nothing_is_a_named_failure_not_an_empty_source(
    tmp_path: Path,
) -> None:
    """The root is there and the files are not — still "could not look", not "none".

    A renamed directory, a typo in the glob and a checkout without its
    specification tree all land here. Answering with an empty read would make the
    registry tombstone every id the source used to hold (SWR-3113) and would tell
    the user their project has no requirements.
    """
    _write_specs(tmp_path)
    source = _source(tmp_path)
    assert source.read().requirement_ids  # the tree is readable to begin with
    (tmp_path / "specs").rename(tmp_path / "specs-archived")

    for call in (source.read, source.revision, source.discover):
        with pytest.raises(RequirementSourceError) as raised:
            call()
        assert "no file matched 'specs/**/*.md'" in str(raised.value)
        assert raised.value.source_id == "specs"
