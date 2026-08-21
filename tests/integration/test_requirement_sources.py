"""Productive use: a user opens a project in Rotaris and its requirements are there —
this repository's own ReqToCode store with no configuration at all, and a project with
its own Markdown layout after declaring the mapping once.
Expected outcome: every declared id becomes exactly one canonical requirement carrying
the store's own content hash, the epic structure resolves, and a declarative source
returns byte-identical results on every run without touching a model or the network."""

from __future__ import annotations

import shutil
import socket
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING

import pytest
import yaml
from pydantic import ValidationError

from rotaris_core.config.schema import RequirementsConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.generator import parse_requirements
from rotaris_core.reqtocode.swr import META
from rotaris_core.requirements import (
    DELIVERY_FIELD_NAMES,
    CanonicalRequirement,
    RelationKind,
    RequirementLifecycle,
    ReverseRelationKind,
    build_hierarchy,
    build_relation_graph,
)
from rotaris_core.requirements.registry import Availability, RequirementRegistry
from rotaris_core.requirements.sources.base import (
    RequirementEdit,
    SourceCapability,
    SourceRead,
    UnsupportedOperation,
    refusal_for,
)
from rotaris_core.requirements.sources.declarative import (
    DeclarativeSource,
    DeclarativeSourceConfig,
)
from rotaris_core.requirements.sources.reqtocode import epic_index_for, reqtocode_source_for

if TYPE_CHECKING:
    from collections.abc import Sequence

    from rotaris_core.requirements.sources.base import RequirementSource

REPO_ROOT = Path(__file__).resolve().parents[2]
REQUIREMENTS_DIR = "docs/requirements"

#: The mapping a workspace would carry in its ``requirements:`` configuration
#: block (SWR-3117) for a project keeping specifications in ``specs/``.
SPEC_SOURCE_CONFIG: dict[str, object] = {
    "source-id": "specs",
    "type": "markdown",
    "glob": "specs/**/*.md",
    "id": "frontmatter.id",
    "title": "heading",
    "status": "frontmatter.state",
    "description": "body",
    "parent": "frontmatter.epic",
    "relations": {"depends-on": "frontmatter.blocked-by"},
    "status-values": {"open": "draft", "accepted": "approved", "retired": "deprecated"},
}


def requirement_ids(source: RequirementSource) -> tuple[str, ...]:
    """A consumer written against the adapter interface and nothing else."""
    return source.read().requirement_ids


def _write_project(root: Path) -> Path:
    """A project whose requirements are Markdown with its own frontmatter."""
    specs = root / "specs"
    (specs / "auth").mkdir(parents=True)
    (specs / "auth.md").write_text(
        "---\nid: PROD-1\nstate: accepted\n---\n\n# Authentication\n\nGetting people in.\n",
        encoding="utf-8",
    )
    (specs / "auth" / "login.md").write_text(
        "---\nid: PROD-2\nstate: open\nepic: PROD-1\nblocked-by: [PROD-1]\n---\n"
        "\n# Log in with a password\n\nThe user signs in with an email and a password.\n",
        encoding="utf-8",
    )
    (specs / "auth" / "logout.md").write_text(
        "---\nid: PROD-3\nstate: retired\nepic: PROD-1\n---\n\n# Log out\n\nThe user signs out.\n",
        encoding="utf-8",
    )
    (specs / "README.md").write_text("How this folder is organised.\n", encoding="utf-8")
    return root


def _write_reqtocode_workspace(root: Path) -> Path:
    """A workspace that has adopted ReqToCode, in its documented layout."""
    store = root / "docs" / "requirements"
    (store / "500-checkout").mkdir(parents=True)
    (store / "500-checkout.md").write_text(
        "---\nreq-id: SWR-500\nstatus: approved\ntrace: optional\ntest: optional\n"
        'title: "Checkout"\n---\n\n# 500 — Checkout\n',
        encoding="utf-8",
    )
    (store / "500-checkout" / "SWR-501-basket.md").write_text(
        '---\nreq-id: SWR-501\nstatus: approved\ntitle: "A basket can be paid for"\n'
        "epic: SWR-500\n---\n\n# SWR-501 — A basket can be paid for\n\n"
        "The user pays for the basket and receives a receipt.\n",
        encoding="utf-8",
    )
    return root


# --------------------------------------------------------------------------
# The built-in source over this repository's real store (SWR-3103)
# --------------------------------------------------------------------------


@pytest.mark.integration
@verifies(SWR.SWR_3103)
def test_this_repositorys_store_loads_completely_through_the_built_in_adapter() -> None:
    """Every declared id, once, with the hash ReqToCode recorded for it."""
    source = reqtocode_source_for(REPO_ROOT)
    assert source is not None, "this repository has a ReqToCode store"

    read = source.read()
    parsed = parse_requirements(REPO_ROOT)
    assert not parsed.errors, f"the store itself must parse: {parsed.errors[:3]}"
    assert not read.issues

    ids = read.requirement_ids
    assert len(ids) == len(set(ids)), "one canonical requirement per declared id"
    assert set(ids) == {meta.req_id for meta in parsed.requirements}
    assert len(ids) == len(META), "every id in the generated swr.py is present"

    by_id = read.by_id()
    mismatched = [
        meta.req_id for meta in META.values() if by_id[meta.req_id].source_hash != meta.content_hash
    ]
    assert not mismatched, f"the store's own hashes must be carried through: {mismatched[:5]}"

    # Every requirement written in its own document arrives with its text.
    # Without it the detail view (SWR-3307), the agent context (SWR-3407) and
    # impact analysis (SWR-3503) would each have to re-read the Markdown
    # themselves — the second parse SWR-3114 exists to prevent. (A historical
    # spec-file id may state itself entirely in its heading and legitimately have
    # no prose below it; those are excluded, not ignored.)
    own_document = [
        one
        for one in read.requirements
        if one.source_path is not None
        and epic_index_for(one.source_path, REQUIREMENTS_DIR) != one.source_path
    ]
    assert len(own_document) > 100, "this store keeps most requirements one per document"
    textless = [one.req_id for one in own_document if not one.description]
    assert not textless, f"requirements with no description: {textless[:5]}"

    sample = META[SWR.SWR_3103.value]
    requirement = by_id[sample.req_id]
    assert requirement.title == sample.title
    assert requirement.source_path == sample.source_path
    assert str(requirement.lifecycle) == str(sample.status.value)
    assert requirement.trace_required == sample.trace_required
    assert requirement.test_required == sample.test_required
    assert requirement.source_id == "reqtocode"
    assert requirement.source_revision == read.revision


@pytest.mark.integration
@verifies(SWR.SWR_3103)
def test_a_multi_id_spec_file_in_the_real_store_yields_one_requirement_per_id() -> None:
    """The store's largest documents declare dozens of ids; none may be lost."""
    source = reqtocode_source_for(REPO_ROOT)
    assert source is not None
    read = source.read()

    spec_path = "docs/requirements/2300-traceability.md"
    declared = tuple(
        meta.req_id
        for meta in sorted(META.values(), key=lambda meta: meta.number)
        if meta.source_path == spec_path
    )
    assert len(declared) > 1, "SWR-2300 is a multi-id spec file (SWR-2330)"

    by_id = read.by_id()
    assert all(req_id in by_id for req_id in declared)
    # One document, one store hash — but one content hash *per requirement*: the
    # ids in this file say different things, and an edit to one of them must not
    # look like a change to the other thirty-seven (SWR-3107).
    assert len({by_id[req_id].source_hash for req_id in declared}) == 1
    assert len({by_id[req_id].current_hash for req_id in declared}) == len(declared)
    assert len({by_id[req_id].description for req_id in declared}) == len(declared)

    artifacts = {artifact.location: artifact for artifact in source.discover()}
    assert artifacts[spec_path].requirement_ids == declared

    # The epic of a spec file is the block id it declares, and it is a root.
    assert by_id["SWR-2300"].parent is None
    assert by_id[declared[1]].parent == "SWR-2300"


@pytest.mark.integration
@verifies(SWR.SWR_3103)
def test_the_real_stores_hierarchy_and_relations_resolve_completely() -> None:
    """A requirement whose epic did not resolve would be a card with no column."""
    source = reqtocode_source_for(REPO_ROOT)
    assert source is not None
    requirements = source.read().requirements

    hierarchy = build_hierarchy(requirements)
    assert not hierarchy.issues, [issue.message for issue in hierarchy.issues[:5]]
    assert hierarchy.children_of("SWR-3100")[:3] == ("SWR-3101", "SWR-3102", "SWR-3103")
    assert hierarchy.parent_of("SWR-3103") == "SWR-3100"
    assert "SWR-3100" in hierarchy.roots

    graph = build_relation_graph(requirements)
    assert not graph.issues, [issue.message for issue in graph.issues[:5]]

    derived = [
        requirement
        for requirement in requirements
        if requirement.related_ids(RelationKind.DERIVED_FROM)
    ]
    assert derived, "the store carries derived-from links"
    assert all(
        target in hierarchy.requirements
        for requirement in derived
        for target in requirement.related_ids(RelationKind.DERIVED_FROM)
    )


@pytest.mark.e2e
@verifies(SWR.SWR_3103)
def test_a_user_opens_a_workspace_with_a_reqtocode_store_and_sees_its_requirements(
    tmp_path: Path,
) -> None:
    """No configuration step: the store is recognised from the workspace itself."""
    workspace = _write_reqtocode_workspace(tmp_path / "project")
    (workspace / ".rotaris").mkdir()

    source = reqtocode_source_for(workspace)

    assert source is not None
    assert requirement_ids(source) == ("SWR-500", "SWR-501")
    requirement = source.read().by_id()["SWR-501"]
    assert requirement.title == "A basket can be paid for"
    assert requirement.lifecycle is RequirementLifecycle.APPROVED
    assert requirement.parent == "SWR-500"

    # A workspace that keeps its requirements elsewhere contributes no source,
    # and that is not an error the user has to dismiss.
    plain = tmp_path / "other"
    (plain / ".rotaris").mkdir(parents=True)
    assert reqtocode_source_for(plain) is None


# --------------------------------------------------------------------------
# The declarative source over a project's own layout (SWR-3104)
# --------------------------------------------------------------------------


@pytest.mark.integration
@verifies(SWR.SWR_3104)
def test_a_configured_declarative_source_reloads_byte_identically(tmp_path: Path) -> None:
    """Determinism, asserted: ordering, dict iteration and mtime cannot leak in."""
    project = _write_project(tmp_path / "project")
    config = DeclarativeSourceConfig.model_validate(SPEC_SOURCE_CONFIG)

    first = DeclarativeSource(project, config).read()
    second = DeclarativeSource(project, config).read()

    assert first.model_dump_json() == second.model_dump_json()
    assert first.revision == second.revision

    # Re-reading after touching every file — same content, new timestamps.
    for path in sorted((project / "specs").rglob("*.md")):
        path.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    third = DeclarativeSource(project, config).read()
    assert third.model_dump_json() == first.model_dump_json()

    # A configuration that survived persistence produces the same read again.
    round_tripped = DeclarativeSourceConfig.model_validate(config.as_document())
    assert round_tripped == config
    assert DeclarativeSource(project, round_tripped).read().model_dump_json() == (
        first.model_dump_json()
    )


@pytest.mark.integration
@verifies(SWR.SWR_3104)
def test_loading_a_declarative_source_touches_no_network(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A requirement set that depended on a service would not be reproducible."""
    project = _write_project(tmp_path / "project")

    def forbidden(*args: object, **kwargs: object) -> object:
        raise AssertionError("a declarative load must not reach the network")

    monkeypatch.setattr(socket, "socket", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    monkeypatch.setattr(socket, "getaddrinfo", forbidden)

    source = DeclarativeSource(project, DeclarativeSourceConfig.model_validate(SPEC_SOURCE_CONFIG))

    assert requirement_ids(source) == ("PROD-1", "PROD-2", "PROD-3")
    assert source.discover()
    assert source.revision()


@pytest.mark.e2e
@verifies(SWR.SWR_3103, SWR.SWR_3104)
def test_a_user_declares_a_mapping_once_and_sees_their_requirements(tmp_path: Path) -> None:
    """The productive flow: one configuration document, then the requirements."""
    project = _write_project(tmp_path / "project")

    source = DeclarativeSource(project, DeclarativeSourceConfig.model_validate(SPEC_SOURCE_CONFIG))
    read = source.read()
    by_id = read.by_id()

    assert read.requirement_ids == ("PROD-1", "PROD-2", "PROD-3")
    login = by_id["PROD-2"]
    assert login.title == "Log in with a password"
    assert login.description.startswith("The user signs in")
    assert login.lifecycle is RequirementLifecycle.DRAFT
    assert login.parent == "PROD-1"
    assert login.related_ids(RelationKind.DEPENDS_ON) == ("PROD-1",)
    assert by_id["PROD-1"].lifecycle is RequirementLifecycle.APPROVED
    # A deprecated requirement stays loaded and is flagged, never dropped.
    assert by_id["PROD-3"].is_deprecated

    # The epic structure a board would draw comes out of the same read.
    hierarchy = build_hierarchy(read.requirements)
    assert hierarchy.roots == ("PROD-1",)
    assert hierarchy.children_of("PROD-1") == ("PROD-2", "PROD-3")
    assert not hierarchy.issues

    # The document that is not a requirement is reported, not silently dropped.
    assert [issue.location for issue in read.issues] == ["specs/README.md"]


@pytest.mark.e2e
@verifies(SWR.SWR_3103, SWR.SWR_3104)
def test_one_consumer_reads_both_sources_without_knowing_which(tmp_path: Path) -> None:
    """The point of the seam: adding a source costs no edit in consuming code."""
    built_in = reqtocode_source_for(_write_reqtocode_workspace(tmp_path / "adopted"))
    declared = DeclarativeSource(
        _write_project(tmp_path / "foreign"),
        DeclarativeSourceConfig.model_validate(SPEC_SOURCE_CONFIG),
    )
    assert built_in is not None

    sources: list[RequirementSource] = [built_in, declared]
    assert [requirement_ids(source) for source in sources] == [
        ("SWR-500", "SWR-501"),
        ("PROD-1", "PROD-2", "PROD-3"),
    ]

    # Both produce the same *shape*: a requirement is a requirement, whatever
    # format it was written in.
    everything: list[CanonicalRequirement] = [
        requirement for source in sources for requirement in source.read().requirements
    ]
    hierarchy = build_hierarchy(everything)
    assert hierarchy.roots == ("PROD-1", "SWR-500")
    assert hierarchy.children_of("SWR-500") == ("SWR-501",)
    assert hierarchy.children_of("PROD-1") == ("PROD-2", "PROD-3")
    assert {requirement.source_id for requirement in everything} == {"reqtocode", "specs"}


# --------------------------------------------------------------------------
# The canonical model over the real store (SWR-3101)
# --------------------------------------------------------------------------


@pytest.mark.integration
@verifies(SWR.SWR_3101)
def test_the_real_store_loads_into_canonical_requirements_with_stable_identity() -> None:
    """A read projection: rebuilt every time, equal every time, owning no state."""
    source = reqtocode_source_for(REPO_ROOT)
    assert source is not None

    first = source.read().requirements
    second = source.read().requirements

    assert first == second, "re-reading an unchanged store must rebuild equal values"
    assert len(first) > 400, "this repository's store is the load this model carries"

    # Immutable and hashable over the whole real store: a set of every
    # requirement is possible, and none of them can be edited in place.
    assert len(set(first)) == len(first)
    with pytest.raises(ValidationError):
        first[0].title = "edited in place"  # type: ignore[misc]

    # Lifecycle is a value, never a missing field, for every requirement there is.
    assert all(isinstance(one.lifecycle, RequirementLifecycle) for one in first)
    assert {str(one.lifecycle) for one in first} <= {"draft", "approved", "deprecated"}

    # No delivery or execution field exists on the model — asserted, not assumed.
    assert DELIVERY_FIELD_NAMES.isdisjoint(CanonicalRequirement.model_fields)
    with pytest.raises(ValidationError):
        CanonicalRequirement(req_id="SWR-1", delivery_state="done")  # type: ignore[call-arg]

    # Deriving a value re-validates and re-hashes rather than editing.
    original = first[0]
    reworded = original.evolve(description="A different thing entirely.")
    assert reworded.current_hash != original.current_hash
    assert original.description != reworded.description


@pytest.mark.integration
@verifies(SWR.SWR_3101)
def test_two_different_sources_yield_equal_canonical_requirements(tmp_path: Path) -> None:
    """SWR-3101's central claim, over the two real adapters rather than in the abstract.

    The same logical requirement — one written in this repository's ReqToCode
    format, one in a project's own frontmatter — must differ only in where it
    came from. If normalisation lived in the adapters instead of in the model,
    these two would drift and every hash comparison downstream would be a
    comparison of formats.
    """
    adopted = _write_reqtocode_workspace(tmp_path / "adopted")
    foreign = tmp_path / "foreign"
    (foreign / "specs").mkdir(parents=True)
    (foreign / "specs" / "basket.md").write_text(
        "---\nid: SWR-501\nstate: accepted\nepic: SWR-500\n---\r\n"
        "\r\n# A basket can be paid for   \r\n"
        "\r\nThe user pays for the basket and receives a receipt.   \r\n",
        encoding="utf-8",
    )

    built_in = reqtocode_source_for(adopted)
    assert built_in is not None
    declared = DeclarativeSource(
        foreign,
        DeclarativeSourceConfig.model_validate(
            {
                "source-id": "house",
                "type": "markdown",
                "glob": "specs/**/*.md",
                "id": "frontmatter.id",
                "title": "heading",
                "description": "body",
                "status": "frontmatter.state",
                "parent": "frontmatter.epic",
                "status-values": {"accepted": "approved"},
            },
        ),
    )

    left = built_in.read().by_id()["SWR-501"]
    right = declared.read().by_id()["SWR-501"]

    # The claim is only worth making if both sides carry text: two empty
    # descriptions would agree for the wrong reason, and the axis SWR-3101 is
    # about — the same words, two formats, one value — would go untested.
    assert left.description == "The user pays for the basket and receives a receipt."
    assert left.description == right.description

    # Provenance differs, and it is the *only* thing that differs.
    assert (left.source_id, left.source_path) != (right.source_id, right.source_path)
    assert left.source_hash is not None and right.source_hash is None
    assert left.without_provenance() == right.without_provenance()
    assert left.canonical_hash == right.canonical_hash
    # Both adapters hash the *content*, so the same requirement in two formats
    # carries the same identity without either of them normalising anything.
    assert left.hash_is_canonical
    assert right.hash_is_canonical
    assert left.current_hash == right.current_hash


# --------------------------------------------------------------------------
# The adapter seam itself (SWR-3102, SWR-3105)
# --------------------------------------------------------------------------


@pytest.mark.integration
@verifies(SWR.SWR_3102)
def test_two_adapters_registered_at_once_are_discovered_and_read_together(
    tmp_path: Path,
) -> None:
    """Registering an adapter costs no edit in consuming code — the registry proves it."""
    adopted = _write_reqtocode_workspace(tmp_path / "adopted")
    foreign = _write_project(tmp_path / "foreign")
    built_in = reqtocode_source_for(adopted)
    assert built_in is not None
    declared = DeclarativeSource(
        foreign,
        DeclarativeSourceConfig.model_validate(SPEC_SOURCE_CONFIG),
    )

    registry = RequirementRegistry([built_in, declared])
    index = registry.refresh()

    assert index.ids == ("PROD-1", "PROD-2", "PROD-3", "SWR-500", "SWR-501")
    assert not index.failures
    # Both adapters answered `discover()` in the same shape.
    assert {artifact.location for artifact in built_in.discover()} == {
        "docs/requirements/500-checkout.md",
        "docs/requirements/500-checkout/SWR-501-basket.md",
    }
    assert {artifact.location for artifact in declared.discover()} >= {
        "specs/auth.md",
        "specs/auth/login.md",
    }

    # `revision()` is stable across repeated reads of unchanged content …
    before = (built_in.revision(), declared.revision())
    assert before == (built_in.revision(), declared.revision())
    # … and differs after any content change, in exactly the source that changed.
    (foreign / "specs" / "auth" / "login.md").write_text(
        "---\nid: PROD-2\nstate: open\nepic: PROD-1\n---\n\n# Log in with a passkey\n\nNo password.\n",
        encoding="utf-8",
    )
    assert built_in.revision() == before[0]
    assert declared.revision() != before[1]


@pytest.mark.integration
@verifies(SWR.SWR_3102)
def test_an_unreadable_source_is_a_named_failure_and_never_an_empty_set(
    tmp_path: Path,
) -> None:
    """The failure mode this seam exists to prevent: "this project has no requirements"."""
    adopted = _write_reqtocode_workspace(tmp_path / "adopted")
    foreign = _write_project(tmp_path / "foreign")
    built_in = reqtocode_source_for(adopted)
    assert built_in is not None
    declared = DeclarativeSource(
        foreign,
        DeclarativeSourceConfig.model_validate(SPEC_SOURCE_CONFIG),
    )
    registry = RequirementRegistry([built_in, declared])
    registry.refresh()

    # The project's specification tree is moved away underneath Rotaris.
    (foreign / "specs").rename(foreign / "specs-archived")
    index = registry.refresh()

    assert [failure.source_id for failure in index.failures] == ["specs"]
    assert "no file matched 'specs/**/*.md'" in index.failures[0].message
    # The other source still loads, and the lost ids are named, not forgotten.
    assert index.ids == ("SWR-500", "SWR-501")
    assert index.availability("PROD-2") is Availability.SOURCE_UNAVAILABLE
    assert "its source 'specs' could not be read" in index.unavailable_reason("PROD-2")


@pytest.mark.integration
@verifies(SWR.SWR_3105)
def test_the_built_in_source_reports_full_capability_and_a_declarative_one_read_only(
    tmp_path: Path,
) -> None:
    """Whether a requirement can be edited is a property of its source, and travels with it."""
    adopted = _write_reqtocode_workspace(tmp_path / "adopted")
    foreign = _write_project(tmp_path / "foreign")
    built_in = reqtocode_source_for(adopted)
    assert built_in is not None
    declared = DeclarativeSource(
        foreign,
        DeclarativeSourceConfig.model_validate(SPEC_SOURCE_CONFIG),
    )
    registry = RequirementRegistry([built_in, declared])
    index = registry.refresh()

    assert built_in.capabilities.as_tuple() == ("read", "create", "update", "delete")
    assert declared.capabilities.read_only

    # The capability travels *with* the requirement, so a consumer holding one
    # already knows whether offering "edit" would be honest.
    writable = index.requirement("SWR-501")
    read_only = index.requirement("PROD-2")
    assert writable is not None
    assert read_only is not None
    assert writable.capabilities.can(SourceCapability.UPDATE)
    assert not read_only.capabilities.can(SourceCapability.UPDATE)

    # Asking first names the source and the artefact …
    assert refusal_for(built_in, SourceCapability.UPDATE) is None
    refusal = refusal_for(
        declared,
        SourceCapability.UPDATE,
        location=declared.locate("PROD-2"),
    )
    assert refusal is not None
    assert refusal.source_id == "specs"
    assert refusal.location == "specs/auth/login.md"
    assert "does not support 'update'" in refusal.message

    # … and attempting it anyway refuses identically, leaving the file untouched.
    before = (foreign / "specs" / "auth" / "login.md").read_bytes()
    with pytest.raises(UnsupportedOperation) as raised:
        declared.update("PROD-2", RequirementEdit(description="Never written"))
    assert raised.value.refusal.source_id == "specs"
    assert raised.value.refusal.location == "specs/auth/login.md"
    assert (foreign / "specs" / "auth" / "login.md").read_bytes() == before


# --------------------------------------------------------------------------
# Identity: hash and revision over the real store (SWR-3107)
# --------------------------------------------------------------------------


@pytest.mark.integration
@verifies(SWR.SWR_3107)
def test_every_requirement_carries_both_its_content_hash_and_the_stores_own() -> None:
    """`satisfied_hash`, snapshots and change detection all rest on these two.

    They answer different questions and neither can stand in for the other:
    `current_hash` says whether this requirement's *meaning* moved, `source_hash`
    is ReqToCode's own token for the artefact it was read from, so an existing
    baseline entry and a `reqtocode diff` result keep their meaning.
    """
    source = reqtocode_source_for(REPO_ROOT)
    assert source is not None

    read = source.read()
    by_id = read.by_id()

    assert set(by_id) == {meta.req_id for meta in META.values()}
    assert all(by_id[meta.req_id].source_hash == meta.content_hash for meta in META.values())
    # Every hash in this repository is the canonical one, so none of them can move
    # for a reason that is not a change of meaning.
    assert all(one.hash_is_canonical for one in read.requirements)
    assert len({one.current_hash for one in read.requirements}) == len(read.requirements)

    # The revision of the read is recorded on every requirement it produced, so a
    # snapshot can name the state of the source it saw (SWR-3107).
    assert read.revision
    assert {one.source_revision for one in read.requirements} == {read.revision}
    assert source.revision() == read.revision


@pytest.mark.integration
@verifies(SWR.SWR_3107)
def test_reformatting_a_real_requirement_document_does_not_move_its_hash(tmp_path: Path) -> None:
    """The failure this guards against costs agent runs in slices 4 and 5.

    A `ruff format`-style pass over the store, or an edit to one requirement in a
    multi-id spec file, must not drop delivered requirements into `Needs Update`.
    Asserted over a *copy of this repository's own store* through the built-in
    adapter, because that is the path all 1500 of them are read by.
    """
    store = tmp_path / "docs" / "requirements"
    shutil.copytree(REPO_ROOT / REQUIREMENTS_DIR, store)
    source = reqtocode_source_for(tmp_path)
    assert source is not None
    before = source.read().by_id()

    document = store / "3100-requirement-sources" / "SWR-3101-canonical-requirement-model.md"
    text = document.read_text(encoding="utf-8")
    reordered = text.replace(
        "epic: SWR-3100\ndate: 2026-08-14\n",
        "date: 2026-08-14\nepic: SWR-3100\n",
    ).replace(
        "# SWR-3101 — Canonical requirement model\n",
        "# SWR-3101 — Canonical requirement model   \n",
    )
    assert reordered != text, "the fixture must actually reformat the document"
    document.write_text(reordered, encoding="utf-8")

    after = reqtocode_source_for(tmp_path)
    assert after is not None
    reread = after.read().by_id()

    assert reread["SWR-3101"].current_hash == before["SWR-3101"].current_hash
    assert reread["SWR-3101"].source_hash != before["SWR-3101"].source_hash
    assert {one: reread[one].current_hash for one in reread} == {
        one: before[one].current_hash for one in before
    }


@pytest.mark.integration
@verifies(SWR.SWR_3107)
def test_line_endings_and_field_order_do_not_move_a_hash_but_meaning_does(
    tmp_path: Path,
) -> None:
    """Normalisation stability, asserted through a real adapter over real files."""
    config = DeclarativeSourceConfig.model_validate(
        {
            "source-id": "specs",
            "type": "markdown",
            "glob": "specs/**/*.md",
            "id": "frontmatter.id",
            "title": "heading",
            "description": "body",
            "status": "frontmatter.state",
        },
    )

    def hash_of(root: Path, text: str) -> str:
        (root / "specs").mkdir(parents=True)
        (root / "specs" / "one.md").write_text(text, encoding="utf-8", newline="")
        return DeclarativeSource(root, config).read().by_id()["PROD-1"].current_hash

    posix = hash_of(
        tmp_path / "posix",
        "---\nid: PROD-1\nstate: draft\n---\n\n# Log in\n\nThe user signs in.\n",
    )
    windows = hash_of(
        tmp_path / "windows",
        "---\r\nid: PROD-1\r\nstate: draft\r\n---\r\n\r\n# Log in\r\n\r\nThe user signs in.   \r\n",
    )
    reordered = hash_of(
        tmp_path / "reordered",
        "---\nstate: draft\nid: PROD-1\n---\n\n# Log in\n\nThe user signs in.\n",
    )
    reworded = hash_of(
        tmp_path / "reworded",
        "---\nid: PROD-1\nstate: draft\n---\n\n# Log in\n\nThe user signs in with a passkey.\n",
    )

    assert posix == windows == reordered
    assert reworded != posix


# --------------------------------------------------------------------------
# Hierarchy and relations over the real store (SWR-3108, SWR-3109)
# --------------------------------------------------------------------------


@pytest.mark.integration
@verifies(SWR.SWR_3108)
def test_every_epic_reports_exactly_the_requirements_its_own_folder_declares() -> None:
    """A requirement whose epic did not resolve would be a card with no column."""
    source = reqtocode_source_for(REPO_ROOT)
    assert source is not None
    hierarchy = build_hierarchy(source.read().requirements)

    #: index document -> the ids declared under it, lowest number (the epic) first.
    declared: dict[str, list[str]] = {}
    for meta in sorted(META.values(), key=lambda meta: meta.number):
        declared.setdefault(epic_index_for(meta.source_path, REQUIREMENTS_DIR), []).append(
            meta.req_id,
        )

    assert len(declared) > 20, "this repository has many epics; the sweep must cover them"
    for index_path, ids in declared.items():
        epic_id, children = ids[0], tuple(ids[1:])
        assert hierarchy.parent_of(epic_id) is None, index_path
        assert epic_id in hierarchy.roots, index_path
        assert hierarchy.children_of(epic_id) == children, index_path
        assert hierarchy.depth(epic_id) == 0
        assert all(hierarchy.depth(child) == 1 for child in children), index_path

    # Nothing dangled and nothing looped over more than four hundred requirements.
    assert not hierarchy.issues, [issue.message for issue in hierarchy.issues[:5]]
    # The sweep reaches the *end* of a long epic rather than stopping early. Read
    # from the epic's own index rather than named here: pinning the last id makes
    # this test fail every time somebody adds a requirement to that epic, which
    # says nothing about the sweep.
    last_declared = next(ids[-1] for ids in declared.values() if ids[0] == "SWR-3100")
    assert hierarchy.children_of("SWR-3100")[-1] == last_declared


@pytest.mark.integration
@verifies(SWR.SWR_3109)
def test_derived_from_links_become_relations_with_the_origins_the_verifier_enforces() -> None:
    """The store's own derivation edges, queryable in both directions (SWR-3110)."""
    source = reqtocode_source_for(REPO_ROOT)
    assert source is not None
    requirements = source.read().requirements
    graph = build_relation_graph(requirements)

    expected = {
        meta.req_id: {f"SWR-{number}" for number in meta.derived_from}
        for meta in META.values()
        if meta.derived_from
    }
    assert len(expected) > 20, "the store carries derivation edges; this asserts all of them"

    for req_id, origins in expected.items():
        assert set(graph.targets(req_id, RelationKind.DERIVED_FROM)) == origins, req_id
        for origin in origins:
            reverse = graph.sources(origin, ReverseRelationKind.DERIVED_REQUIREMENTS)
            assert req_id in reverse, f"{origin} must know {req_id} derives from it"

    # Every forward edge yields exactly one reverse edge, and nothing dangles.
    assert len(graph.reverse_edges) == len(graph.edges)
    assert not graph.dangling
    # The parent edge of a requirement is queryable as a relation as well.
    assert graph.targets("SWR-3117", RelationKind.PARENT) == ("SWR-3100",)
    assert "SWR-3117" in graph.sources("SWR-3100", ReverseRelationKind.CHILDREN)


# --------------------------------------------------------------------------
# No second requirement repository (SWR-3114)
# --------------------------------------------------------------------------


@pytest.mark.integration
@verifies(SWR.SWR_3114)
def test_deleting_the_source_reports_unavailable_instead_of_serving_the_old_text(
    tmp_path: Path,
) -> None:
    """With the project's own store gone, Rotaris has nothing to say — and says so."""
    project = _write_project(tmp_path / "project")
    source = DeclarativeSource(
        project,
        DeclarativeSourceConfig.model_validate(SPEC_SOURCE_CONFIG),
    )
    registry = RequirementRegistry([source])
    loaded = registry.refresh()
    assert loaded.requirement("PROD-2") is not None

    shutil.rmtree(project / "specs")
    index = registry.refresh()

    assert index.requirement("PROD-2") is None
    assert index.availability("PROD-2") is Availability.SOURCE_UNAVAILABLE
    # Not one word of the requirement survives anywhere in what Rotaris holds.
    dumped = index.model_dump_json()
    assert "Log in with a password" not in dumped
    assert "The user signs in with an email" not in dumped
    assert "PROD-2" in dumped

    # And when the project restores its store, the text comes back from *there*.
    _write_project(project)
    restored = registry.refresh()
    requirement = restored.requirement("PROD-2")
    assert requirement is not None
    assert requirement.title == "Log in with a password"
    assert restored.availability("PROD-2") is Availability.AVAILABLE


# --------------------------------------------------------------------------
# Removed requirements leave a tombstone (SWR-3113)
# --------------------------------------------------------------------------


@pytest.mark.integration
@verifies(SWR.SWR_3113)
def test_deleting_a_requirement_file_tombstones_its_id_and_a_restore_revives_it(
    tmp_path: Path,
) -> None:
    """An id that ever meant something must never mean something else.

    The other half of SWR-3113 — that the id's delivery record survives the
    removal — needs the delivery store of SWR-3205 and is asserted in slice 2's
    ``tests/integration/test_requirement_removal.py``. What is assertable here is
    the half that decides it: the registry sees the file leave, and the id is
    tombstoned rather than forgotten.
    """
    project = _write_project(tmp_path / "project")
    login = project / "specs" / "auth" / "login.md"
    source = DeclarativeSource(
        project,
        DeclarativeSourceConfig.model_validate(SPEC_SOURCE_CONFIG),
    )
    registry = RequirementRegistry([source])
    before = registry.refresh()
    assert "PROD-2" in before.ids
    assert before.tombstone("PROD-2") is None

    text = login.read_text(encoding="utf-8")
    login.unlink()
    index = registry.refresh()

    assert index.ids == ("PROD-1", "PROD-3")
    assert index.availability("PROD-2") is Availability.REMOVED
    tombstone = index.tombstone("PROD-2")
    assert tombstone is not None
    assert tombstone.active
    assert tombstone.source_id == "specs"
    assert tombstone.source_path == "specs/auth/login.md"
    assert tombstone.last_hash == before.by_id()["PROD-2"].current_hash
    # A removal is not an outage: the source read fine, so nothing is "unavailable".
    assert not index.failures
    assert not index.unavailable

    # The project restores the file, and the id resolves to a live requirement
    # again without losing the record that it was once gone.
    login.write_text(text, encoding="utf-8")
    restored = registry.refresh()

    assert restored.availability("PROD-2") is Availability.AVAILABLE
    revived = restored.tombstone("PROD-2")
    assert revived is not None
    assert not revived.active
    assert revived.restored_at is not None


# --------------------------------------------------------------------------
# Several sources in one workspace (SWR-3115)
# --------------------------------------------------------------------------


@pytest.mark.integration
@verifies(SWR.SWR_3115)
def test_a_workspace_with_two_sources_attributes_every_requirement(tmp_path: Path) -> None:
    """One merged set, per-requirement attribution, and a collision that names both."""
    adopted = _write_reqtocode_workspace(tmp_path / "adopted")
    foreign = _write_project(tmp_path / "foreign")
    built_in = reqtocode_source_for(adopted)
    assert built_in is not None
    declared = DeclarativeSource(
        foreign,
        DeclarativeSourceConfig.model_validate(SPEC_SOURCE_CONFIG),
    )

    index = RequirementRegistry([built_in, declared]).refresh()

    assert [one.req_id for one in index.of_source("reqtocode")] == ["SWR-500", "SWR-501"]
    assert [one.req_id for one in index.of_source("specs")] == ["PROD-1", "PROD-2", "PROD-3"]
    assert index.source_of("PROD-2") == "specs"
    assert not index.collisions

    # A second store that declares an id the first one already has is a reported
    # collision naming both sources and both artefacts — never a silent shadow.
    duplicate = tmp_path / "duplicate"
    (duplicate / "specs").mkdir(parents=True)
    (duplicate / "specs" / "shadow.md").write_text(
        "---\nid: PROD-2\nstate: accepted\n---\n\n# A different requirement\n",
        encoding="utf-8",
    )
    shadow = DeclarativeSource(
        duplicate,
        DeclarativeSourceConfig.model_validate({**SPEC_SOURCE_CONFIG, "source-id": "tracker"}),
    )
    collided = RequirementRegistry([built_in, declared, shadow]).refresh()

    assert [one.req_id for one in collided.collisions] == ["PROD-2"]
    collision = collided.collisions[0]
    assert [claim.source_id for claim in collision.claims] == ["specs", "tracker"]
    assert [claim.location for claim in collision.claims] == [
        "specs/auth/login.md",
        "specs/shadow.md",
    ]
    # The first configured source wins deterministically, and the board still works.
    assert collision.winner == "specs"
    winner = collided.requirement("PROD-2")
    assert winner is not None
    assert winner.title == "Log in with a password"


@pytest.mark.e2e
@verifies(SWR.SWR_3115)
def test_a_user_with_requirements_in_two_places_sees_one_board(tmp_path: Path) -> None:
    """The productive flow: one board, and every card knows where it came from."""
    adopted = _write_reqtocode_workspace(tmp_path / "adopted")
    foreign = _write_project(tmp_path / "foreign")
    # The teams cross-reference each other: a relation may span sources.
    (adopted / "docs" / "requirements" / "500-checkout" / "SWR-502-guest.md").write_text(
        '---\nreq-id: SWR-502\nstatus: draft\ntitle: "Guest checkout"\n'
        "epic: SWR-500\n---\n\n# SWR-502 — Guest checkout\n",
        encoding="utf-8",
    )
    built_in = reqtocode_source_for(adopted)
    assert built_in is not None
    declared = DeclarativeSource(
        foreign,
        DeclarativeSourceConfig.model_validate(SPEC_SOURCE_CONFIG),
    )

    board = RequirementRegistry([built_in, declared]).refresh()

    assert board.ids == ("PROD-1", "PROD-2", "PROD-3", "SWR-500", "SWR-501", "SWR-502")
    assert {one.req_id: board.source_of(one.req_id) for one in board.requirements} == {
        "PROD-1": "specs",
        "PROD-2": "specs",
        "PROD-3": "specs",
        "SWR-500": "reqtocode",
        "SWR-501": "reqtocode",
        "SWR-502": "reqtocode",
    }
    # Two epics, each with its own children, in one hierarchy.
    hierarchy = board.hierarchy()
    assert hierarchy.roots == ("PROD-1", "SWR-500")
    assert hierarchy.children_of("SWR-500") == ("SWR-501", "SWR-502")
    assert not board.failures
    assert not board.collisions


@pytest.mark.integration
@verifies(SWR.SWR_3115)
def test_a_relation_that_crosses_sources_is_dangling_not_a_missing_source(
    tmp_path: Path,
) -> None:
    """An unresolved cross-source target is a relation problem, reported as one."""
    foreign = _write_project(tmp_path / "foreign")
    (foreign / "specs" / "auth" / "billing.md").write_text(
        "---\nid: PROD-4\nstate: open\nepic: PROD-1\nblocked-by: [SWR-999]\n---\n"
        "\n# Charge the card\n\nThe user is charged.\n",
        encoding="utf-8",
    )
    source = DeclarativeSource(
        foreign,
        DeclarativeSourceConfig.model_validate(SPEC_SOURCE_CONFIG),
    )

    index = RequirementRegistry([source]).refresh()
    graph = index.relation_graph()

    assert not index.failures, "a dangling target is not a broken source"
    assert index.requirement("PROD-4") is not None
    dangling = graph.dangling
    assert [(issue.req_id, issue.target) for issue in dangling] == [("PROD-4", "SWR-999")]
    assert str(dangling[0].relation_kind) == "depends-on"


# --------------------------------------------------------------------------
# Incremental refresh over a real store (SWR-3116)
# --------------------------------------------------------------------------


class CountingDeclarativeSource(DeclarativeSource):
    """A declarative source that can re-read single files, and counts every read.

    "Incremental" is asserted by counting reads rather than by timing anything,
    which is why the source has to be able to say what it was asked for.
    """

    def __init__(self, root: Path, config: DeclarativeSourceConfig) -> None:
        super().__init__(root, config)
        self.full_reads = 0
        self.artifact_reads: list[str] = []

    def read(self) -> SourceRead:
        self.full_reads += 1
        return super().read()

    def read_artifacts(self, artifact_ids: Sequence[str]) -> SourceRead:
        self.artifact_reads.extend(artifact_ids)
        wanted = set(artifact_ids)
        whole = super().read()
        return SourceRead(
            source_id=whole.source_id,
            revision=whole.revision,
            requirements=tuple(one for one in whole.requirements if one.source_path in wanted),
        )


@pytest.mark.integration
@verifies(SWR.SWR_3116)
def test_repeated_refreshes_re_read_only_the_artefact_that_moved(tmp_path: Path) -> None:
    """Every trigger of SWR-3210 causes a refresh; most of them must cost nothing."""
    project = tmp_path / "project"
    (project / "specs" / "auth").mkdir(parents=True)
    (project / "specs" / "auth.md").write_text(
        "---\nid: PROD-1\nstate: accepted\n---\n\n# Authentication\n\nGetting people in.\n",
        encoding="utf-8",
    )
    (project / "specs" / "auth" / "login.md").write_text(
        "---\nid: PROD-2\nstate: open\nepic: PROD-1\n---\n\n# Log in\n\nWith a password.\n",
        encoding="utf-8",
    )
    source = CountingDeclarativeSource(
        project,
        DeclarativeSourceConfig.model_validate(
            {
                "source-id": "specs",
                "type": "markdown",
                "glob": "specs/**/*.md",
                "id": "frontmatter.id",
                "title": "heading",
                "description": "body",
                "status": "frontmatter.state",
                "parent": "frontmatter.epic",
                "status-values": {"open": "draft", "accepted": "approved"},
            },
        ),
    )
    registry = RequirementRegistry([source])

    first = registry.refresh()
    assert first.ids == ("PROD-1", "PROD-2")
    assert source.full_reads == 1

    # An unchanged store costs one `revision()` call and nothing else.
    for _ in range(3):
        registry.refresh()
    assert source.full_reads == 1
    assert source.artifact_reads == []
    reused = registry.last_refresh.of_source("specs")
    assert reused is not None
    assert reused.reused

    # One file changes: one file is read, and the other is carried over.
    (project / "specs" / "auth" / "login.md").write_text(
        "---\nid: PROD-2\nstate: open\nepic: PROD-1\n---\n\n# Log in\n\nWith a passkey.\n",
        encoding="utf-8",
    )
    updated = registry.refresh()

    assert source.full_reads == 1, "a one-file change must not re-read the store"
    assert source.artifact_reads == ["specs/auth/login.md"]
    incremental = registry.last_refresh.of_source("specs")
    assert incremental is not None
    assert incremental.incremental
    assert incremental.artifacts_read == ("specs/auth/login.md",)

    changed = updated.requirement("PROD-2")
    carried = updated.requirement("PROD-1")
    assert changed is not None
    assert carried is not None
    assert changed.description == "With a passkey."
    assert carried.description == "Getting people in."
    # Both name the revision they were observed at, carried or freshly read.
    assert changed.source_revision == carried.source_revision == source.revision()

    # A refresh that fails publishes nothing: the previous index still stands.
    (project / "specs").rename(project / "specs-archived")
    broken = registry.refresh()
    assert broken.failures
    (project / "specs-archived").rename(project / "specs")
    assert registry.refresh().ids == ("PROD-1", "PROD-2")


# --------------------------------------------------------------------------
# The configuration block that names the sources (SWR-3117)
# --------------------------------------------------------------------------


USER_REQUIREMENTS_YAML = """
requirements:
  scheduling:
    mode: manual
    max_concurrent_units: 8
  board:
    default_sort: state
"""

WORKSPACE_REQUIREMENTS_YAML = """
requirements:
  sources:
    - id: specs
      type: markdown
      glob: "specs/**/*.md"
      fields:
        id: frontmatter.id
        title: heading
        lifecycle: frontmatter.state
        parent: frontmatter.epic
  scheduling:
    mode: automatic
"""


@pytest.mark.integration
@verifies(SWR.SWR_3117)
def test_a_configuration_document_on_disk_carrying_the_block_drives_a_real_source(
    tmp_path: Path,
) -> None:
    """The block as a user writes it: two files on disk, overlaid, then read from.

    Both scopes Rotaris supports are present — the user's
    ``~/.config/rotaris/agents.yaml`` and the workspace's
    ``<workspace>/.rotaris/agents.yaml`` — because the value of one complete
    block is that a workspace can set one field without resetting the rest.
    """
    workspace = _write_project(tmp_path / "project")
    user_dir = tmp_path / "user-config"
    workspace_dir = workspace / ".rotaris"
    user_dir.mkdir()
    workspace_dir.mkdir()
    (user_dir / "agents.yaml").write_text(USER_REQUIREMENTS_YAML, encoding="utf-8")
    (workspace_dir / "agents.yaml").write_text(WORKSPACE_REQUIREMENTS_YAML, encoding="utf-8")

    def block_of(path: Path) -> dict[str, object]:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
        section = document["requirements"]
        assert isinstance(section, dict)
        return section

    block = RequirementsConfig.overlay(
        block_of(user_dir / "agents.yaml"),
        block_of(workspace_dir / "agents.yaml"),
    )

    assert [one.id for one in block.sources] == ["specs"]
    declared = block.sources[0]
    assert declared.type == "markdown"
    assert declared.glob == "specs/**/*.md"
    assert declared.fields.lifecycle == "frontmatter.state"
    # The workspace's field wins, the user's neighbour in the same section
    # survives, and everything neither scope named keeps its documented default —
    # which is what lets slices 2-6 read this block without extending it.
    assert block.scheduling.mode == "automatic"
    assert block.scheduling.max_concurrent_units == 8
    assert block.board.default_sort == "state"
    assert block.refresh.incremental
    assert block.delivery.store_subpath == "requirements"
    assert not block.human_in_the_loop.allow_force_done
    # The whole block survives the round trip a written-back config would make.
    assert RequirementsConfig.model_validate(block.model_dump()) == block

    # And the persisted declaration really describes a source that reads.
    source = DeclarativeSource(
        workspace,
        DeclarativeSourceConfig.model_validate(
            {
                "source-id": declared.id,
                "type": declared.type,
                "glob": declared.glob,
                "id": declared.fields.id,
                "title": declared.fields.title,
                "status": declared.fields.lifecycle,
                "parent": declared.fields.parent,
                "status-values": {"open": "draft", "accepted": "approved", "retired": "deprecated"},
            },
        ),
    )
    index = RequirementRegistry([source]).refresh()

    assert index.ids == ("PROD-1", "PROD-2", "PROD-3")
    assert index.source_of("PROD-2") == "specs"
    assert index.hierarchy().children_of("PROD-1") == ("PROD-2", "PROD-3")


# --------------------------------------------------------------------------
# Reading a requirement as it was (SWR-3102, the input for SWR-3503)
# --------------------------------------------------------------------------


def _git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-c", "user.email=t@example.com", "-c", "user.name=Test", *args],
        cwd=repo,
        check=True,
        capture_output=True,
    )


@pytest.mark.integration
@verifies(SWR.SWR_3102)
def test_the_built_in_source_reconstructs_a_requirement_from_the_stores_history(
    tmp_path: Path,
) -> None:
    """Slice 5's stated input, obtained end to end from a real store's own history.

    Change detection can say that SWR-501 moved; deciding whether the move costs
    an agent run needs the sentence that changed (SWR-3503). Rotaris may not keep
    that sentence (SWR-3114), so the source is asked — here a genuine git
    checkout, at a genuine commit.
    """
    workspace = _write_reqtocode_workspace(tmp_path / "project")
    _git(workspace, "init", "-q")
    _git(workspace, "add", "-A")
    _git(workspace, "commit", "-q", "-m", "the store as delivered")
    delivered = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=workspace,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()

    document = workspace / "docs" / "requirements" / "500-checkout" / "SWR-501-basket.md"
    document.write_text(
        document.read_text(encoding="utf-8").replace(
            "The user pays for the basket and receives a receipt.",
            "The user pays for the basket and receives a receipt by email.",
        ),
        encoding="utf-8",
    )

    source = reqtocode_source_for(workspace)
    assert source is not None
    assert source.provides_history

    now = source.read().by_id()["SWR-501"]
    before = source.read_requirement_at("SWR-501", delivered)

    assert before is not None
    assert before.description == "The user pays for the basket and receives a receipt."
    assert now.description.endswith("by email.")
    # The two versions differ in content and say so through the hash the whole
    # delivery state is keyed on — and agree on everything that did not change.
    assert before.current_hash != now.current_hash
    assert (before.req_id, before.title, before.parent) == (now.req_id, now.title, now.parent)
    assert before.source_revision == delivered

    # A requirement that did not exist at that revision is a real answer.
    assert source.read_requirement_at("SWR-999", delivered) is None


# ── SWR-3123: a store read through the project's own parser ────────────────

_TABLE_PARSER = '''\
"""Reads a requirement table — the shape no field mapping expresses."""

import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
text = (root / "TRACEABILITY.md").read_text(encoding="utf-8").replace("\\r\\n", "\\n")
requirements = []
unclaimed = []
for line in text.splitlines():
    if not line.startswith("|") or line.startswith("| ---") or line.startswith("| ID"):
        continue
    cells = [cell.strip() for cell in line.strip("|").split("|")]
    if len(cells) < 3 or not re.match(r"REQ-\\d+$", cells[0]):
        unclaimed.append({"path": "TRACEABILITY.md", "reason": f"not a requirement row: {line!r}"})
        continue
    requirements.append(
        {
            "req_id": cells[0],
            "title": cells[1],
            "description": cells[2],
            "lifecycle": "approved" if cells[-1] == "yes" else "draft",
            "source_path": "TRACEABILITY.md",
        }
    )
requirements.sort(key=lambda entry: entry["req_id"])
print(json.dumps({"requirements": requirements, "unclaimed": unclaimed}, sort_keys=True))
'''

_TABLE_STORE = """\
# Traceability

| ID | Title | Statement | Done |
| --- | --- | --- | --- |
| REQ-2 | Export | The user exports the report. | no |
| REQ-1 | Sign in | The user signs in. | yes |
| (planned) | Import | Not yet specified. | no |
"""


def _parser_workspace(root: Path) -> Path:
    """A project whose requirements live in one Markdown table."""
    root.mkdir(parents=True, exist_ok=True)
    (root / "TRACEABILITY.md").write_text(_TABLE_STORE, encoding="utf-8")
    (root / "rotaris_requirement_parser.py").write_text(_TABLE_PARSER, encoding="utf-8")
    return root


@pytest.mark.integration
@verifies(SWR.SWR_3123)
def test_a_parser_configured_workspace_reads_through_the_registry(tmp_path: Path) -> None:
    """The whole runtime half of SWR-3123, through the ordinary seams.

    A table — several requirements in one document, no frontmatter — is the
    exact shape no declarative mapping expresses. The parser is a committable
    file of the workspace, the configuration pins its hash, and the registry
    reads it like any other source: unclaimed rows become issues, the second
    refresh answers from the revision without a process, and the source offers
    no write it cannot perform.
    """
    from rotaris_core.requirements.model import SourceCapability
    from rotaris_core.requirements.sources.discovery import JsonProposalStore
    from rotaris_core.requirements.sources.generated import (
        GeneratedParserConfig,
        GeneratedParserSource,
        parser_digest,
    )

    workspace = _parser_workspace(tmp_path / "project")
    config = GeneratedParserConfig(
        sha256=parser_digest((workspace / "rotaris_requirement_parser.py").read_bytes()),
        watch="TRACEABILITY.md",
    )
    # The configuration persists and loads through the same store the
    # declarative kind uses — one file, one `kind` key, two shapes.
    store = JsonProposalStore(workspace / ".rotaris" / "requirement-source.json")
    store.save(config)
    loaded = store.load()
    assert loaded == config

    source = GeneratedParserSource(workspace, loaded)
    registry = RequirementRegistry([source])
    index = registry.refresh()

    assert [requirement.req_id for requirement in index.requirements] == ["REQ-1", "REQ-2"]
    by_id = {requirement.req_id: requirement for requirement in index.requirements}
    assert by_id["REQ-1"].lifecycle is RequirementLifecycle.APPROVED
    assert by_id["REQ-2"].lifecycle is RequirementLifecycle.DRAFT
    assert by_id["REQ-1"].source_path == "TRACEABILITY.md"
    assert not by_id["REQ-1"].capabilities.can(SourceCapability.UPDATE)

    read = source.read()
    assert any("not a requirement row" in issue.message for issue in read.issues)

    # An unchanged tree answers from the revision: no second process.
    assert source.read() is read

    # And an edited store is re-read on the next refresh (SWR-3116).
    (workspace / "TRACEABILITY.md").write_text(
        _TABLE_STORE + "| REQ-3 | Import | The user imports a backup. | yes |\n",
        encoding="utf-8",
    )
    refreshed = registry.refresh()
    assert [requirement.req_id for requirement in refreshed.requirements] == [
        "REQ-1",
        "REQ-2",
        "REQ-3",
    ]
