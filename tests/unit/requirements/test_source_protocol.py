"""Productive use: a project whose requirements Rotaris has never seen before can be
read by writing one small adapter, and nothing in Rotaris has to change to accept it.
Expected outcome: an adapter implementing only ``discover`` / ``read`` / ``revision``
drives the whole pipeline; an unreadable source says so by name instead of quietly
reporting that the project has no requirements."""

from __future__ import annotations

import hashlib
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements import (
    FULL_CAPABILITIES,
    CanonicalRequirement,
    RequirementLifecycle,
)
from rotaris_core.requirements.sources import (
    BaseRequirementSource,
    RequirementArtifact,
    RequirementEdit,
    RequirementSource,
    RequirementSourceError,
    SourceCapabilities,
    SourceCapability,
    SourceFailure,
    SourceIssue,
    SourceRead,
    UnsupportedOperation,
)

if TYPE_CHECKING:
    from pathlib import Path


class MarkdownStore(BaseRequirementSource):
    """A read-only adapter over a directory of ``key: value`` Markdown files.

    Implements the three mandatory operations and declares nothing else — the
    "legacy export" case SWR-3102 says must be a first-class adapter.
    """

    def __init__(self, root: Path, source_id: str = "specs") -> None:
        self._root = root
        self._source_id = source_id

    @property
    def source_id(self) -> str:
        return self._source_id

    def _files(self) -> list[Path]:
        if not self._root.is_dir():
            raise self.fail("requirement directory not found", location=str(self._root))
        return sorted(self._root.glob("*.md"))

    def discover(self) -> tuple[RequirementArtifact, ...]:
        artifacts: list[RequirementArtifact] = []
        for path in self._files():
            text = path.read_text(encoding="utf-8")
            artifacts.append(
                RequirementArtifact(
                    artifact_id=path.name,
                    location=path.name,
                    revision=hashlib.sha256(text.encode("utf-8")).hexdigest()[:16],
                    requirement_ids=(_parse(text, path.name)[0]["id"],),
                ),
            )
        return tuple(artifacts)

    def read(self) -> SourceRead:
        requirements: list[CanonicalRequirement] = []
        issues: list[SourceIssue] = []
        for path in self._files():
            fields, description = _parse(path.read_text(encoding="utf-8"), path.name)
            if not fields.get("title"):
                issues.append(
                    SourceIssue(
                        source_id=self.source_id,
                        message="requirement has no title",
                        location=path.name,
                        req_id=fields["id"],
                    ),
                )
            requirements.append(
                CanonicalRequirement(
                    req_id=fields["id"],
                    title=fields.get("title", ""),
                    description=description,
                    lifecycle=RequirementLifecycle(fields.get("status", "draft")),
                    source_path=path.name,
                    capabilities=self.capabilities,
                ),
            )
        return SourceRead(
            source_id=self.source_id,
            revision=self.revision(),
            requirements=tuple(requirements),
            issues=tuple(issues),
        )

    def revision(self) -> str:
        digest = hashlib.sha256()
        for path in self._files():
            digest.update(path.name.encode("utf-8"))
            digest.update(path.read_bytes())
        return digest.hexdigest()[:16]

    def locate(self, req_id: str) -> str | None:
        return f"{req_id}.md"


class InMemoryTracker:
    """An adapter implementing the Protocol directly, sharing no base class.

    Nothing about it resembles :class:`MarkdownStore` — no files, no parsing,
    write capability declared — and every consumer takes both.
    """

    source_id = "tracker"
    capabilities = FULL_CAPABILITIES

    def __init__(self) -> None:
        self._issues: dict[str, str] = {"TRK-1": "Export a report"}
        self._version = 1

    def discover(self) -> tuple[RequirementArtifact, ...]:
        return tuple(
            RequirementArtifact(artifact_id=key, location=f"tracker://{key}")
            for key in sorted(self._issues)
        )

    def read(self) -> SourceRead:
        return SourceRead(
            source_id=self.source_id,
            revision=self.revision(),
            requirements=tuple(
                CanonicalRequirement(
                    req_id=key,
                    title=title,
                    source_path=f"tracker://{key}",
                    capabilities=self.capabilities,
                )
                for key, title in sorted(self._issues.items())
            ),
        )

    def revision(self) -> str:
        return f"v{self._version}"

    def add(self, req_id: str, title: str) -> None:
        self._issues[req_id] = title
        self._version += 1


def _parse(text: str, name: str) -> tuple[dict[str, str], str]:
    header, _, body = text.partition("\n\n")
    fields: dict[str, str] = {}
    for line in header.splitlines():
        key, separator, value = line.partition(":")
        if separator:
            fields[key.strip()] = value.strip()
    if "id" not in fields:
        raise RequirementSourceError("specs", "requirement has no id", location=name)
    return fields, body


def _write_store(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    (root / "one.md").write_text(
        "id: REQ-1\ntitle: Import a CSV\nstatus: approved\n\nThe user imports a CSV file.\n",
        encoding="utf-8",
    )
    (root / "two.md").write_text(
        "id: REQ-2\ntitle: Export a report\n\nThe user exports a report.\n",
        encoding="utf-8",
    )
    return root


def _requirement_ids(source: RequirementSource) -> tuple[str, ...]:
    """A consumer written against the interface and nothing else."""
    return source.read().requirement_ids


@pytest.mark.unit
@verifies(SWR.SWR_3102)
def test_a_read_only_adapter_is_a_complete_adapter(tmp_path: Path) -> None:
    """Three mandatory operations are enough to drive everything downstream."""
    source = MarkdownStore(_write_store(tmp_path / "specs"))

    assert isinstance(source, RequirementSource)

    read = source.read()
    assert read.requirement_ids == ("REQ-1", "REQ-2")
    assert read.by_id()["REQ-1"].lifecycle is RequirementLifecycle.APPROVED
    assert read.by_id()["REQ-1"].description == "The user imports a CSV file."
    # Every requirement knows the read it came from (SWR-3107).
    assert {r.source_revision for r in read.requirements} == {read.revision}
    assert {r.source_id for r in read.requirements} == {"specs"}

    artifacts = source.discover()
    assert [artifact.location for artifact in artifacts] == ["one.md", "two.md"]
    assert artifacts[0].requirement_ids == ("REQ-1",)


@pytest.mark.unit
@verifies(SWR.SWR_3102)
def test_revision_is_stable_until_the_content_changes(tmp_path: Path) -> None:
    """The token change detection keys on moves for content, and only for content."""
    root = _write_store(tmp_path / "specs")
    source = MarkdownStore(root)

    first = source.revision()
    assert source.revision() == first
    assert source.read().revision == first

    # Re-reading unchanged content, even after touching the file, keeps the token.
    (root / "one.md").write_text(
        (root / "one.md").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    assert source.revision() == first

    (root / "one.md").write_text(
        "id: REQ-1\ntitle: Import a CSV\nstatus: approved\n\nThe user imports a CSV export.\n",
        encoding="utf-8",
    )
    assert source.revision() != first
    assert source.read().by_id()["REQ-1"].description.endswith("CSV export.")


@pytest.mark.unit
@verifies(SWR.SWR_3102)
def test_an_undeclared_operation_raises_instead_of_degrading(tmp_path: Path) -> None:
    """A write that quietly did nothing would be worse than one that refused."""
    source = MarkdownStore(_write_store(tmp_path / "specs"))

    with pytest.raises(UnsupportedOperation) as raised:
        source.update("REQ-1", RequirementEdit(title="Import two CSVs"))

    assert raised.value.refusal.source_id == "specs"
    assert raised.value.refusal.operation is SourceCapability.UPDATE
    assert raised.value.refusal.location == "REQ-1.md"
    # The store is untouched: the refusal happened before any write.
    assert "Import a CSV" in (tmp_path / "specs" / "one.md").read_text(encoding="utf-8")


@pytest.mark.unit
@verifies(SWR.SWR_3102)
def test_an_adapter_error_is_named_and_never_an_empty_requirement_set(
    tmp_path: Path,
) -> None:
    """ "No requirements" and "could not read them" are different facts."""
    source = MarkdownStore(tmp_path / "missing")

    with pytest.raises(RequirementSourceError) as raised:
        source.read()

    assert raised.value.source_id == "specs"
    assert "missing" in str(raised.value)

    failure = SourceFailure.from_error("specs", raised.value)
    assert failure.source_id == "specs"
    assert failure.error_type == "RequirementSourceError"
    assert "requirement directory not found" in failure.message

    broken = tmp_path / "broken"
    broken.mkdir()
    (broken / "nameless.md").write_text("title: no id here\n\nBody.\n", encoding="utf-8")
    with pytest.raises(RequirementSourceError, match="no id"):
        MarkdownStore(broken).read()


@pytest.mark.unit
@verifies(SWR.SWR_3102)
def test_a_consumer_takes_any_adapter_without_knowing_which(tmp_path: Path) -> None:
    """Registering an adapter costs no edit in consuming code."""
    file_backed = MarkdownStore(_write_store(tmp_path / "specs"))
    tracker = InMemoryTracker()

    assert isinstance(tracker, RequirementSource)
    assert _requirement_ids(file_backed) == ("REQ-1", "REQ-2")
    assert _requirement_ids(tracker) == ("TRK-1",)

    before = tracker.revision()
    tracker.add("TRK-2", "Print a summary")
    assert tracker.revision() != before
    assert _requirement_ids(tracker) == ("TRK-1", "TRK-2")


@pytest.mark.unit
@verifies(SWR.SWR_3102)
def test_a_read_carries_its_own_revision_and_refuses_a_mismatched_one() -> None:
    """Requirements and the revision they were read at cannot drift apart."""
    requirement = CanonicalRequirement(req_id="REQ-1", source_revision="v1")

    with pytest.raises(ValueError, match="does not match"):
        SourceRead(source_id="tracker", revision="v2", requirements=(requirement,))

    consistent = SourceRead(source_id="tracker", revision="v1", requirements=(requirement,))
    assert consistent.requirements[0].source_revision == "v1"

    with pytest.raises(ValueError, match="revision token"):
        SourceRead(source_id="tracker", revision="  ")


@pytest.mark.unit
@verifies(SWR.SWR_3102)
def test_a_declared_but_unimplemented_write_is_a_programming_error(tmp_path: Path) -> None:
    """Declaring a capability without implementing it must not look like a refusal."""

    class Liar(MarkdownStore):
        capabilities = SourceCapabilities.of(SourceCapability.UPDATE)

    source = Liar(_write_store(tmp_path / "specs"))

    with pytest.raises(NotImplementedError, match="declares 'update'"):
        source.update("REQ-1", RequirementEdit(title="x"))
