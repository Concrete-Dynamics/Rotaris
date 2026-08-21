"""Productive use: a user is told a requirement changed exactly when its meaning
changed, and is not told so when a file was merely reformatted.
Expected outcome: reformatting, a Windows checkout or a reordered frontmatter block
leave ``current_hash`` where it was; an edit to what the requirement says moves it."""

from __future__ import annotations

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements import (
    HASH_LENGTH,
    CanonicalRequirement,
    Relation,
    RelationKind,
    canonical_payload,
    requirement_hash,
)

BASELINE: dict[str, object] = {
    "req_id": "SWR-4242",
    "title": "Board shows one card per requirement",
    "description": "The board renders one card for every requirement.\n\nA card names it.",
    "lifecycle": "approved",
    "req_type": "product",
    "relations": [("derived-from", "SWR-4100")],
    "parent": "SWR-4200",
}


def _hash(**overrides: object) -> str:
    fields = {**BASELINE, **overrides}
    return requirement_hash(**fields)  # type: ignore[arg-type]


@pytest.mark.unit
@verifies(SWR.SWR_3107)
def test_line_endings_do_not_change_the_hash() -> None:
    """The same requirement hashes identically on Windows and POSIX checkouts."""
    posix = _hash(description="One line.\n\nAnother line.\n")
    windows = _hash(description="One line.\r\n\r\nAnother line.\r\n")
    old_mac = _hash(description="One line.\r\rAnother line.\r")

    assert posix == windows == old_mac


@pytest.mark.unit
@verifies(SWR.SWR_3107)
def test_formatting_noise_does_not_change_the_hash() -> None:
    """Trailing whitespace, extra blank lines and stray indentation are formatting."""
    clean = _hash(description="One line.\n\nAnother line.", title="A title")
    noisy = _hash(
        description="  One line.   \n\n\n\n\nAnother line.\t\n\n",
        title="  A   title  ",
    )

    assert clean == noisy


@pytest.mark.unit
@verifies(SWR.SWR_3107)
def test_field_and_relation_order_do_not_change_the_hash() -> None:
    """Reordering frontmatter fields, or relations, is not a change of meaning."""
    reordered_fields = requirement_hash(
        parent="SWR-4200",
        relations=[("derived-from", "SWR-4100")],
        req_type="product",
        lifecycle="approved",
        description=str(BASELINE["description"]),
        title=str(BASELINE["title"]),
        req_id=str(BASELINE["req_id"]),
    )
    reordered_relations = _hash(
        relations=[("depends-on", "SWR-3"), ("derived-from", "SWR-4100")],
    )
    other_order = _hash(
        relations=[("derived-from", "SWR-4100"), ("depends-on", "SWR-3")],
    )

    assert reordered_fields == _hash()
    assert reordered_relations == other_order


@pytest.mark.unit
@verifies(SWR.SWR_3107)
def test_parent_hashes_the_same_whether_field_or_relation() -> None:
    """A source modelling the parent as an edge agrees with one using a field."""
    as_field = _hash(parent="SWR-4200", relations=[("derived-from", "SWR-4100")])
    as_relation = _hash(
        parent=None,
        relations=[("derived-from", "SWR-4100"), ("parent", "SWR-4200")],
    )

    assert as_field == as_relation


@pytest.mark.unit
@verifies(SWR.SWR_3107)
@pytest.mark.parametrize(
    "change",
    [
        {"description": "The board renders one card for every requirement. And a count."},
        {"title": "Board shows one row per requirement"},
        {"lifecycle": "draft"},
        {"req_type": "technical"},
        {"parent": "SWR-4300"},
        {"parent": None},
        {"relations": [("derived-from", "SWR-4101")]},
        {"relations": [("depends-on", "SWR-4100")]},
        {"relations": []},
        {"req_id": "SWR-4243"},
    ],
    ids=[
        "description",
        "title",
        "lifecycle",
        "type",
        "other-parent",
        "no-parent",
        "other-target",
        "other-kind",
        "no-relations",
        "other-id",
    ],
)
def test_any_change_of_meaning_changes_the_hash(change: dict[str, object]) -> None:
    """Every field the requirement's meaning is made of reaches the digest."""
    assert _hash(**change) != _hash()


@pytest.mark.unit
@verifies(SWR.SWR_3107)
def test_content_cannot_be_shifted_between_fields_unnoticed() -> None:
    """Moving words from the title into the description is a change, not a shuffle."""
    split = _hash(title="Board shows one card", description="per requirement")
    joined = _hash(title="Board shows one card per requirement", description="")

    assert split != joined


@pytest.mark.unit
@verifies(SWR.SWR_3107)
def test_the_digest_is_deterministic_and_reqtocode_shaped() -> None:
    """Same shape as ReqToCode's ``content_hash``, so the two are comparable."""
    digest = _hash()

    assert digest == _hash()
    assert len(digest) == HASH_LENGTH
    assert all(character in "0123456789abcdef" for character in digest)
    # The payload is exposed so a mismatch can be explained rather than bisected.
    assert "id\x1fSWR-4242" in canonical_payload(**BASELINE)  # type: ignore[arg-type]


@pytest.mark.unit
@verifies(SWR.SWR_3107)
def test_the_model_carries_the_hash_of_its_own_content() -> None:
    """``current_hash`` on a canonical requirement is the canonical hash."""
    requirement = CanonicalRequirement(
        req_id="SWR-4242",
        title=str(BASELINE["title"]),
        description=str(BASELINE["description"]),
        lifecycle="approved",
        parent="SWR-4200",
        relations=(Relation(kind=RelationKind.DERIVED_FROM, target="SWR-4100"),),
    )

    assert requirement.current_hash == _hash()
    assert requirement.hash_is_canonical


@pytest.mark.unit
@verifies(SWR.SWR_3107)
def test_a_source_supplied_hash_survives_and_stays_comparable() -> None:
    """The built-in source hands over ReqToCode's own hash, so baselines keep meaning."""
    requirement = CanonicalRequirement(
        req_id="SWR-4242",
        title=str(BASELINE["title"]),
        current_hash="0123456789abcdef",
        source_id="reqtocode",
    )

    assert requirement.current_hash == "0123456789abcdef"
    assert not requirement.hash_is_canonical
    # Still comparable across sources: the canonical hash is always computable.
    assert requirement.canonical_hash == requirement.without_provenance().current_hash
    # And an edit derived through the model returns to the canonical hash.
    assert requirement.evolve(title="Changed").hash_is_canonical


@pytest.mark.unit
@verifies(SWR.SWR_3107)
def test_the_read_records_the_source_revision_per_requirement() -> None:
    """A requirement names the state of the source it was read from."""
    requirement = CanonicalRequirement(req_id="SWR-4242").stamped(
        source_id="reqtocode",
        source_revision="git:9f1c2d",
    )

    assert requirement.source_revision == "git:9f1c2d"
    # Provenance is not hash input: recording where a read came from must not
    # look like a content change to SWR-3501's change detection.
    assert requirement.current_hash == CanonicalRequirement(req_id="SWR-4242").current_hash
