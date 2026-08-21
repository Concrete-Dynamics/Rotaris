"""Productive use: a user can tell, before trying, whether a requirement can be edited
in Rotaris at all — and is told which source refuses and where its artefact lives.
Expected outcome: capabilities travel with every requirement, an unsupported write is
refused by name and leaves the source byte-identical, and no capability is ever
inferred from a write that happened to fail."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements import (
    FULL_CAPABILITIES,
    READ_ONLY,
    CanonicalRequirement,
    SourceCapabilities,
    SourceCapability,
)
from rotaris_core.requirements.sources import (
    BaseRequirementSource,
    RequirementArtifact,
    RequirementEdit,
    SourceRead,
    UnsupportedOperation,
    WritableRequirementSource,
    refusal_for,
    require_capability,
    supports,
)

if TYPE_CHECKING:
    from pathlib import Path

DOCUMENT = "id: REQ-1\ntitle: Import a CSV\n\nThe user imports a CSV file.\n"


class ExportStore(BaseRequirementSource):
    """A legacy export: readable, never writable."""

    def __init__(self, path: Path, source_id: str = "legacy-export") -> None:
        self._path = path
        self._source_id = source_id

    @property
    def source_id(self) -> str:
        return self._source_id

    def discover(self) -> tuple[RequirementArtifact, ...]:
        return (RequirementArtifact(artifact_id="REQ-1", location=str(self._path)),)

    def read(self) -> SourceRead:
        return SourceRead(
            source_id=self.source_id,
            revision=self.revision(),
            requirements=(
                CanonicalRequirement(
                    req_id="REQ-1",
                    title="Import a CSV",
                    source_path=str(self._path),
                    capabilities=self.capabilities,
                ),
            ),
        )

    def revision(self) -> str:
        return str(self._path.stat().st_size)

    def locate(self, req_id: str) -> str | None:
        return str(self._path)


class WritableStore(ExportStore):
    """The same store, declared writable — capability added, interface unchanged."""

    capabilities = FULL_CAPABILITIES

    def update(self, req_id: str, edit: RequirementEdit) -> CanonicalRequirement:
        require_capability(self, SourceCapability.UPDATE, location=self.locate(req_id))
        raise OSError("disk is full")


@pytest.fixture
def export_path(tmp_path: Path) -> Path:
    path = tmp_path / "legacy" / "requirements.md"
    path.parent.mkdir(parents=True)
    path.write_text(DOCUMENT, encoding="utf-8")
    return path


@pytest.mark.unit
@verifies(SWR.SWR_3105)
def test_a_read_only_source_reports_read_only(export_path: Path) -> None:
    """What a source can do is a property of the source, declared up front."""
    source = ExportStore(export_path)

    assert source.capabilities.as_tuple() == (SourceCapability.READ,)
    assert source.capabilities.read_only
    assert not source.capabilities.writable
    assert supports(source, SourceCapability.READ)
    assert not supports(source, SourceCapability.UPDATE)


@pytest.mark.unit
@verifies(SWR.SWR_3105)
def test_a_requirement_carries_the_capabilities_of_its_source(export_path: Path) -> None:
    """A consumer holding a requirement can already tell whether "edit" is honest."""
    read_only = ExportStore(export_path).read().requirements[0]
    writable = WritableStore(export_path, source_id="house-store").read().requirements[0]

    assert read_only.capabilities.read_only
    assert not writable.capabilities.read_only
    assert writable.capabilities.can(SourceCapability.DELETE)
    # Capabilities are provenance, not content: the same requirement from two
    # sources is still the same requirement (SWR-3101).
    assert read_only.without_provenance() == writable.without_provenance()


@pytest.mark.unit
@verifies(SWR.SWR_3105)
def test_an_unsupported_write_is_refused_by_name_and_touches_nothing(
    export_path: Path,
) -> None:
    """The refusal names the source and the artefact, which is what the user needs."""
    source = ExportStore(export_path)
    before = export_path.read_bytes()

    # Asked in advance (the SWR-3111 write path), the answer is a stated refusal.
    refusal = refusal_for(source, SourceCapability.UPDATE, location=source.locate("REQ-1"))
    assert refusal is not None
    assert refusal.source_id == "legacy-export"
    assert "legacy-export" in refusal.message
    assert str(export_path) in refusal.message
    assert refusal_for(source, SourceCapability.READ) is None

    # Attempted anyway, the same fact arrives as an exception.
    with pytest.raises(UnsupportedOperation) as raised:
        source.update("REQ-1", RequirementEdit(description="Something else"))
    assert raised.value.refusal.message == refusal.message

    with pytest.raises(UnsupportedOperation):
        source.delete("REQ-1")

    assert export_path.read_bytes() == before


@pytest.mark.unit
@verifies(SWR.SWR_3105)
def test_capabilities_are_declared_and_never_inferred_from_a_failed_write(
    export_path: Path,
) -> None:
    """A source that failed once has not lost the capability it declared."""
    source = WritableStore(export_path, source_id="house-store")

    with pytest.raises(OSError, match="disk is full"):
        source.update("REQ-1", RequirementEdit(title="Import two CSVs"))

    assert supports(source, SourceCapability.UPDATE)
    assert refusal_for(source, SourceCapability.UPDATE) is None

    # Nor is capability inferable from the type: a read-only adapter has the
    # optional methods too — precisely so that they can refuse.
    read_only = ExportStore(export_path)
    assert isinstance(read_only, WritableRequirementSource)
    assert not supports(read_only, SourceCapability.UPDATE)


@pytest.mark.unit
@verifies(SWR.SWR_3105)
def test_capability_sets_are_explicit_and_always_readable() -> None:
    """``read`` is not optional: a source nobody can read is not a source."""
    assert READ_ONLY.as_tuple() == (SourceCapability.READ,)
    assert FULL_CAPABILITIES.as_tuple() == (
        SourceCapability.READ,
        SourceCapability.CREATE,
        SourceCapability.UPDATE,
        SourceCapability.DELETE,
    )
    # `of` implies read, so an adapter cannot accidentally declare write-only.
    assert SourceCapabilities.of(SourceCapability.UPDATE).can(SourceCapability.READ)

    with pytest.raises(ValidationError, match="read"):
        SourceCapabilities(supported=frozenset({SourceCapability.UPDATE}))


@pytest.mark.unit
@verifies(SWR.SWR_3105)
def test_a_write_path_can_ask_before_it_writes(export_path: Path) -> None:
    """SWR-3111's rule — consult the capability first — is one call, not a convention."""
    sources = [ExportStore(export_path), WritableStore(export_path, source_id="house-store")]

    refusals = [
        refusal_for(source, SourceCapability.CREATE, detail="requirement store is an export")
        for source in sources
    ]

    assert refusals[0] is not None
    assert "requirement store is an export" in refusals[0].message
    assert refusals[1] is None
