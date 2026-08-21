"""Productive use: a team whose requirements live in an unfamiliar format can still
work with them in Rotaris.
Expected outcome: however a project writes its requirements down, Rotaris holds one
shape for them — the same ids, the same hashes, the same relations — and holds no
delivery state inside it."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements import (
    DELIVERY_FIELD_NAMES,
    FULL_CAPABILITIES,
    CanonicalRequirement,
    Relation,
    RelationKind,
    RequirementLifecycle,
    RequirementType,
    requirement_sort_key,
)

# --------------------------------------------------------------------------
# Two miniature adapters. They stand in for SWR-3103 and SWR-3104 (a later
# step): what is under test is the normalisation the *model* performs, so both
# mappers deliberately hand over their fields raw — different names, different
# order, different line endings.
# --------------------------------------------------------------------------

REQTOCODE_DOCUMENT = (
    "---\r\n"
    "req-id: SWR-4242\r\n"
    'title: "Board shows one card per requirement"\r\n'
    "status: approved\r\n"
    "type: product\r\n"
    "epic: SWR-4200\r\n"
    "derived-from: SWR-4100\r\n"
    "---\r\n"
    "\r\n"
    "The board renders one card for every requirement it knows about.   \r\n"
    "\r\n"
    "\r\n"
    "A card names the requirement and its state.\r\n"
)

YAML_MAPPING: dict[str, object] = {
    # Deliberately a different field order and different names.
    "state": "approved",
    "body": (
        "The board renders one card for every requirement it knows about.\n"
        "\nA card names the requirement and its state."
    ),
    "kind": "product",
    "links": [("derived-from", "SWR-4100")],
    "parent_id": "SWR-4200",
    "id": "SWR-4242",
    "name": "Board shows one card per requirement",
}


def _from_reqtocode_document(text: str, path: str) -> CanonicalRequirement:
    """Map a ReqToCode-shaped Markdown document onto the canonical model."""
    _, frontmatter, body = text.split("---", 2)
    fields: dict[str, str] = {}
    for line in frontmatter.splitlines():
        key, separator, value = line.partition(":")
        if separator:
            fields[key.strip()] = value.strip().strip('"')
    relations = [Relation(kind=RelationKind.DERIVED_FROM, target=fields["derived-from"])]
    return CanonicalRequirement(
        req_id=fields["req-id"],
        title=fields["title"],
        description=body,
        lifecycle=RequirementLifecycle(fields["status"]),
        req_type=RequirementType(fields["type"]),
        parent=fields["epic"],
        relations=tuple(relations),
        source_id="reqtocode",
        source_path=path,
        source_revision="git:abcdef",
        capabilities=FULL_CAPABILITIES,
    )


def _from_yaml_mapping(mapping: dict[str, object], path: str) -> CanonicalRequirement:
    """Map a house-format YAML requirement onto the canonical model."""
    links = [
        Relation(kind=RelationKind(kind), target=target)
        for kind, target in mapping["links"]  # type: ignore[attr-defined]
    ]
    return CanonicalRequirement(
        req_id=str(mapping["id"]),
        title=str(mapping["name"]),
        description=str(mapping["body"]),
        lifecycle=RequirementLifecycle(str(mapping["state"])),
        req_type=RequirementType(str(mapping["kind"])),
        # This source models the parent as a relation, not as a field.
        relations=(*links, Relation(kind=RelationKind.PARENT, target=str(mapping["parent_id"]))),
        source_id="house-yaml",
        source_path=path,
        source_revision="mtime:17",
    )


@pytest.mark.unit
@verifies(SWR.SWR_3101)
def test_two_sources_normalise_to_the_same_canonical_requirement() -> None:
    """A ReqToCode document and a YAML mapping of the same requirement agree."""
    from_markdown = _from_reqtocode_document(REQTOCODE_DOCUMENT, "docs/requirements/SWR-4242.md")
    from_yaml = _from_yaml_mapping(YAML_MAPPING, "specs/board.yaml")

    # Provenance differs — that is the only thing that may differ.
    assert from_markdown != from_yaml
    assert from_markdown.without_provenance() == from_yaml.without_provenance()

    # Content identity is source-independent (SWR-3107 relies on this).
    assert from_markdown.current_hash == from_yaml.current_hash

    # The parent arrived as a frontmatter field on one side and as a relation on
    # the other, and landed in the same place either way.
    assert from_markdown.parent == from_yaml.parent == "SWR-4200"
    assert from_markdown.relations == from_yaml.relations
    assert from_markdown.description == from_yaml.description
    assert "\r" not in from_markdown.description


@pytest.mark.unit
@verifies(SWR.SWR_3101)
def test_missing_lifecycle_defaults_to_draft_and_is_visible() -> None:
    """A source declaring no lifecycle yields ``draft`` as a value, not as a gap."""
    requirement = CanonicalRequirement(req_id="REQ-7", title="Import a CSV")

    assert requirement.lifecycle is RequirementLifecycle.DRAFT
    assert requirement.req_type is RequirementType.PRODUCT
    # Visible in the model: a consumer reading the dump sees "draft", never a
    # missing key it would have to interpret.
    assert requirement.model_dump(mode="json")["lifecycle"] == "draft"


@pytest.mark.unit
@verifies(SWR.SWR_3101)
def test_requirement_is_immutable_and_hashable() -> None:
    """Mutating a requirement means re-reading its source, not assigning to it."""
    requirement = CanonicalRequirement(req_id="SWR-4242", title="Board")
    twin = CanonicalRequirement(req_id="SWR-4242", title="Board")

    with pytest.raises(ValidationError):
        requirement.title = "Something else"  # type: ignore[misc]

    assert hash(requirement) == hash(twin)
    assert len({requirement, twin}) == 1


@pytest.mark.unit
@verifies(SWR.SWR_3101)
def test_no_delivery_or_execution_field_can_reach_the_model() -> None:
    """Delivery state is layered beside the requirement (SWR-3205), never inside it."""
    assert DELIVERY_FIELD_NAMES.isdisjoint(CanonicalRequirement.model_fields)

    with pytest.raises(ValidationError):
        CanonicalRequirement(req_id="SWR-4242", delivery_state="done")  # type: ignore[call-arg]


@pytest.mark.unit
@verifies(SWR.SWR_3101)
def test_relation_order_and_duplicates_do_not_change_the_value() -> None:
    """Two sources listing the same relations differently produce one value."""
    first = CanonicalRequirement(
        req_id="SWR-1",
        relations=(
            Relation(kind=RelationKind.DEPENDS_ON, target="SWR-3"),
            Relation(kind=RelationKind.SUPERSEDES, target="SWR-2"),
            Relation(kind=RelationKind.DEPENDS_ON, target="SWR-3"),
        ),
    )
    second = CanonicalRequirement(
        req_id="SWR-1",
        relations=(
            Relation(kind=RelationKind.SUPERSEDES, target="SWR-2"),
            Relation(kind=RelationKind.DEPENDS_ON, target="SWR-3"),
        ),
    )

    assert first == second
    assert first.relations == (
        Relation(kind=RelationKind.DEPENDS_ON, target="SWR-3"),
        Relation(kind=RelationKind.SUPERSEDES, target="SWR-2"),
    )


@pytest.mark.unit
@verifies(SWR.SWR_3101)
def test_two_different_parents_are_refused() -> None:
    """ "At most one parent" is enforced where the value is built, not where it is read."""
    with pytest.raises(ValidationError, match="at most one parent"):
        CanonicalRequirement(
            req_id="SWR-1",
            parent="SWR-100",
            relations=(Relation(kind=RelationKind.PARENT, target="SWR-200"),),
        )

    # The same parent stated twice is agreement, not a conflict.
    requirement = CanonicalRequirement(
        req_id="SWR-1",
        parent="SWR-100",
        relations=(Relation(kind=RelationKind.PARENT, target="SWR-100"),),
    )
    assert requirement.parent == "SWR-100"
    assert requirement.relations_of(RelationKind.PARENT) == (
        Relation(kind=RelationKind.PARENT, target="SWR-100"),
    )


@pytest.mark.unit
@verifies(SWR.SWR_3101)
def test_evolve_revalidates_while_stamping_leaves_content_alone() -> None:
    """Deriving a new value re-hashes; recording where it came from does not."""
    requirement = CanonicalRequirement(req_id="SWR-1", description="First wording.")

    edited = requirement.evolve(description="Second wording.")
    assert edited.description == "Second wording."
    assert edited.current_hash != requirement.current_hash
    assert requirement.description == "First wording."  # untouched

    stamped = requirement.stamped(
        source_id="reqtocode",
        source_path="docs/requirements/x.md",
        source_revision="git:1234",
    )
    assert stamped.current_hash == requirement.current_hash
    assert stamped.source_revision == "git:1234"
    assert stamped.without_provenance() == requirement.without_provenance()


@pytest.mark.unit
@verifies(SWR.SWR_3101)
def test_requirement_ids_sort_naturally() -> None:
    """Ordering is by number, so SWR-99 precedes SWR-100 wherever ids are listed."""
    ids = ["SWR-100", "SWR-99", "SWR-9", "REQ-2"]
    assert sorted(ids, key=requirement_sort_key) == ["REQ-2", "SWR-9", "SWR-99", "SWR-100"]
