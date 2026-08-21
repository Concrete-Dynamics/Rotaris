"""Generator meta-tests (blueprint §9): deterministic, validating, idempotent."""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path
from rotaris_core.reqtocode.declarations import ReqStatus
from rotaris_core.reqtocode.generator import (
    GENERATED_PATH,
    generate,
    is_up_to_date,
    parse_requirements,
    regenerate_if_stale,
)


def _write_req(
    root: Path,
    number: int,
    status: str = "approved",
    trace: str = "required",
    test: str = "required",
    title: str | None = None,
    body: str = "Body.",
    legacy_id: str | None = None,
) -> Path:
    folder = root / "docs" / "requirements" / "100-demo"
    folder.mkdir(parents=True, exist_ok=True)
    title = title if title is not None else f"Demo {number}"
    legacy = f"legacy-id: {legacy_id}\n" if legacy_id else ""
    path = folder / f"SWR-{number}-demo.md"
    path.write_text(
        f"---\nreq-id: SWR-{number}\nstatus: {status}\ntrace: {trace}\n"
        f'test: {test}\ntitle: "{title}"\n{legacy}---\n\n# SWR-{number} - {title}\n\n{body}\n',
        encoding="utf-8",
    )
    return path


@verifies(SWR.SWR_2324)
def test_parse_reads_frontmatter_fields(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, status="approved", trace="optional", test="required")
    parsed = parse_requirements(tmp_path)
    assert parsed.errors == []
    (req,) = parsed.requirements
    assert req.req_id == "SWR-101"
    assert req.number == 101
    assert req.status is ReqStatus.APPROVED
    assert req.title == "Demo 101"
    assert req.trace_required is False
    assert req.test_required is True
    assert len(req.content_hash) == 16


@verifies(SWR.SWR_2324)
def test_parse_rejects_duplicate_ids(tmp_path: Path) -> None:
    _write_req(tmp_path, 101)
    other = tmp_path / "docs" / "requirements" / "100-demo" / "SWR-101-copy.md"
    other.write_text(
        "---\nreq-id: SWR-101\nstatus: draft\n---\n\n# SWR-101 - Copy\n", encoding="utf-8"
    )
    parsed = parse_requirements(tmp_path)
    assert any("duplicate req-id SWR-101" in e for e in parsed.errors)


@verifies(SWR.SWR_2324)
def test_parse_rejects_malformed_values(tmp_path: Path) -> None:
    folder = tmp_path / "docs" / "requirements"
    folder.mkdir(parents=True)
    (folder / "bad-id.md").write_text(
        "---\nreq-id: REQ-1\nstatus: approved\n---\n# x\n", encoding="utf-8"
    )
    (folder / "bad-status.md").write_text(
        "---\nreq-id: SWR-7\nstatus: wip\n---\n# x\n", encoding="utf-8"
    )
    (folder / "bad-flag.md").write_text(
        "---\nreq-id: SWR-8\nstatus: draft\ntrace: maybe\n---\n# x\n", encoding="utf-8"
    )
    parsed = parse_requirements(tmp_path)
    assert any("malformed req-id" in e for e in parsed.errors)
    assert any("unknown status" in e for e in parsed.errors)
    assert any("unknown trace value" in e for e in parsed.errors)
    assert parsed.requirements == []


@verifies(SWR.SWR_2324)
def test_parse_ignores_files_without_frontmatter(tmp_path: Path) -> None:
    folder = tmp_path / "docs" / "requirements"
    folder.mkdir(parents=True)
    (folder / "README.md").write_text("# Notes\nNo frontmatter here.\n", encoding="utf-8")
    parsed = parse_requirements(tmp_path)
    assert parsed.errors == []
    assert parsed.requirements == []


@verifies(SWR.SWR_2324)
def test_generate_is_deterministic(tmp_path: Path) -> None:
    _write_req(tmp_path, 102)
    _write_req(tmp_path, 101, status="deprecated")
    parsed = parse_requirements(tmp_path)
    first = generate(parsed.requirements)
    second = generate(list(reversed(parsed.requirements)))
    assert first == second
    # Fixed ordering by requirement number.
    assert first.index("SWR_101") < first.index("SWR_102")


@verifies(SWR.SWR_2324)
def test_generate_emits_deprecation_marker_only_for_deprecated(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, status="deprecated")
    _write_req(tmp_path, 102, status="approved")
    source = generate(parse_requirements(tmp_path).requirements)
    assert "SWR.SWR_101,\n" in source.split("DEPRECATED", 1)[1]
    assert '"""[DEPRECATED - do not add new references] Demo 101' in source
    assert '"""[approved] Demo 102' in source
    assert "SWR_102,\n" not in source.split("DEPRECATED", 1)[1].split("META", 1)[0]


@verifies(SWR.SWR_2324)
def test_generate_emits_trace_and_test_flags(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, trace="optional", test="required")
    source = generate(parse_requirements(tmp_path).requirements)
    assert "ReqStatus.APPROVED, 'Demo 101'" in source
    assert " False, True, " in source


@verifies(SWR.SWR_2324)
def test_removing_a_requirement_removes_its_symbol(tmp_path: Path) -> None:
    _write_req(tmp_path, 101)
    removable = _write_req(tmp_path, 102)
    with_both = generate(parse_requirements(tmp_path).requirements)
    assert "SWR_102 = 102" in with_both
    removable.unlink()
    without = generate(parse_requirements(tmp_path).requirements)
    assert "SWR_102" not in without


@verifies(SWR.SWR_2324)
def test_regenerate_is_idempotent(tmp_path: Path) -> None:
    _write_req(tmp_path, 101)
    changed, errors = regenerate_if_stale(tmp_path)
    assert (changed, errors) == (True, [])
    assert is_up_to_date(tmp_path)
    changed, errors = regenerate_if_stale(tmp_path)
    assert (changed, errors) == (False, [])


@verifies(SWR.SWR_2324)
def test_content_hash_tracks_requirement_text(tmp_path: Path) -> None:
    path = _write_req(tmp_path, 101, body="Original text.")
    regenerate_if_stale(tmp_path)
    before = (tmp_path / GENERATED_PATH).read_text(encoding="utf-8")
    _write_req(tmp_path, 101, body="Changed text.")
    del path
    changed, _ = regenerate_if_stale(tmp_path)
    assert changed is True
    after = (tmp_path / GENERATED_PATH).read_text(encoding="utf-8")
    assert before != after
    assert "SWR_101 = 101" in after


@verifies(SWR.SWR_2330)
def test_parse_reads_multi_id_spec_file(tmp_path: Path) -> None:
    folder = tmp_path / "docs" / "requirements" / "100-demo"
    folder.mkdir(parents=True)
    (folder / "SWR-101-102-spec.md").write_text(
        "---\n"
        "req-id: [SWR-101, SWR-102]\n"
        "status: draft\n"
        "trace: optional\n"
        "test: optional\n"
        "---\n\n"
        "# 100-demo spec\n\n"
        "## SWR-101 — First\n"
        "status: approved\n"
        "trace: required\n\n"
        "Body for 101.\n\n"
        "## SWR-102 — Second\n\n"
        "Body for 102, inherits frontmatter defaults.\n",
        encoding="utf-8",
    )
    parsed = parse_requirements(tmp_path)
    assert parsed.errors == []
    by_number = {r.number: r for r in parsed.requirements}
    assert set(by_number) == {101, 102}

    first = by_number[101]
    assert first.req_id == "SWR-101"
    assert first.title == "First"
    assert first.status is ReqStatus.APPROVED
    assert first.trace_required is True
    assert first.test_required is False  # falls back to frontmatter (optional)

    second = by_number[102]
    assert second.title == "Second"
    assert second.status is ReqStatus.DRAFT  # falls back to frontmatter
    assert second.trace_required is False
    assert second.content_hash == first.content_hash  # one file, one hash


@verifies(SWR.SWR_2330)
def test_parse_reads_multiline_reflowed_req_id_list(tmp_path: Path) -> None:
    """A `req-id` flow list reflowed across several lines (e.g. by a YAML
    formatter) still parses as one list, not an empty value."""
    folder = tmp_path / "docs" / "requirements" / "100-demo"
    folder.mkdir(parents=True)
    (folder / "SWR-101-102-spec.md").write_text(
        "---\n"
        "req-id:\n"
        "  [\n"
        "    SWR-101,\n"
        "    SWR-102,\n"
        "  ]\n"
        "status: approved\n"
        "trace: optional\n"
        "test: optional\n"
        "---\n\n"
        "## SWR-101 — First\n\nBody.\n\n"
        "## SWR-102 — Second\n\nBody.\n",
        encoding="utf-8",
    )
    parsed = parse_requirements(tmp_path)
    assert parsed.errors == []
    assert {r.number for r in parsed.requirements} == {101, 102}


@verifies(SWR.SWR_2330)
def test_parse_applies_body_overrides_after_blank_line(tmp_path: Path) -> None:
    """Per-id override lines separated from the heading by a blank line (normal
    Markdown spacing) are still applied, not ignored."""
    folder = tmp_path / "docs" / "requirements" / "100-demo"
    folder.mkdir(parents=True)
    (folder / "SWR-101-102-spec.md").write_text(
        "---\n"
        "req-id: [SWR-101, SWR-102]\n"
        "status: approved\n"
        "trace: required\n"
        "test: required\n"
        "---\n\n"
        "## SWR-101 — First\n\n"  # blank line before the override block
        "trace: optional\n"
        "test: optional\n\n"
        "Prose that must not be read as fields.\n\n"
        "## SWR-102 — Second\n\n"
        "Body inherits frontmatter defaults.\n",
        encoding="utf-8",
    )
    parsed = parse_requirements(tmp_path)
    assert parsed.errors == []
    by_number = {r.number: r for r in parsed.requirements}
    assert by_number[101].trace_required is False  # override applied through blank line
    assert by_number[101].test_required is False
    assert by_number[102].trace_required is True  # inherits frontmatter default


@verifies(SWR.SWR_2330)
def test_parse_multi_id_spec_requires_matching_body_section(tmp_path: Path) -> None:
    folder = tmp_path / "docs" / "requirements" / "100-demo"
    folder.mkdir(parents=True)
    (folder / "SWR-101-102-spec.md").write_text(
        "---\nreq-id: [SWR-101, SWR-102]\nstatus: draft\n---\n\n## SWR-101 — Only One\n\nBody.\n",
        encoding="utf-8",
    )
    parsed = parse_requirements(tmp_path)
    assert any("SWR-102" in e and "no matching" in e for e in parsed.errors)
    assert [r.number for r in parsed.requirements] == [101]


@verifies(SWR.SWR_2331)
def test_parse_reads_type_and_derived_from(tmp_path: Path) -> None:
    _write_req(tmp_path, 101)  # product origin (defaults)
    folder = tmp_path / "docs" / "requirements" / "100-demo"
    (folder / "SWR-102-tech.md").write_text(
        "---\nreq-id: SWR-102\nstatus: approved\ntrace: optional\ntest: optional\n"
        'type: technical\nderived-from: SWR-101\ntitle: "Tech"\n---\n\n# SWR-102 - Tech\n',
        encoding="utf-8",
    )
    parsed = parse_requirements(tmp_path)
    assert parsed.errors == []
    by_number = {r.number: r for r in parsed.requirements}
    assert by_number[101].req_type == "product"
    assert by_number[101].derived_from == ()
    assert by_number[102].req_type == "technical"
    assert by_number[102].derived_from == (101,)


@verifies(SWR.SWR_2331)
def test_parse_reads_derived_from_list(tmp_path: Path) -> None:
    folder = tmp_path / "docs" / "requirements" / "100-demo"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "SWR-103-tech.md").write_text(
        "---\nreq-id: SWR-103\nstatus: draft\ntype: technical\n"
        'derived-from: [SWR-101, SWR-102]\ntitle: "Tech"\n---\n\n# SWR-103 - Tech\n',
        encoding="utf-8",
    )
    (req,) = parse_requirements(tmp_path).requirements
    assert req.derived_from == (101, 102)


@verifies(SWR.SWR_2331)
def test_parse_rejects_bad_type_and_derived_from(tmp_path: Path) -> None:
    folder = tmp_path / "docs" / "requirements"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "bad-type.md").write_text(
        "---\nreq-id: SWR-7\nstatus: draft\ntype: internal\n---\n# x\n", encoding="utf-8"
    )
    (folder / "bad-derived.md").write_text(
        "---\nreq-id: SWR-8\nstatus: draft\ntype: technical\nderived-from: REQ-9\n---\n# x\n",
        encoding="utf-8",
    )
    parsed = parse_requirements(tmp_path)
    assert any("unknown type" in e for e in parsed.errors)
    assert any("malformed derived-from" in e for e in parsed.errors)


@verifies(SWR.SWR_2331)
def test_generate_emits_type_and_derived_from(tmp_path: Path) -> None:
    _write_req(tmp_path, 101)
    folder = tmp_path / "docs" / "requirements" / "100-demo"
    (folder / "SWR-102-tech.md").write_text(
        "---\nreq-id: SWR-102\nstatus: approved\ntype: technical\n"
        'derived-from: SWR-101\ntitle: "Tech"\n---\n\n# SWR-102 - Tech\n',
        encoding="utf-8",
    )
    source = generate(parse_requirements(tmp_path).requirements)
    assert "'technical', (101,))" in source
    assert "'product', ())" in source


@verifies(SWR.SWR_2331)
def test_derived_from_change_updates_global_hash(tmp_path: Path) -> None:
    _write_req(tmp_path, 101)
    tech = tmp_path / "docs" / "requirements" / "100-demo" / "SWR-102-tech.md"
    tech.write_text(
        "---\nreq-id: SWR-102\nstatus: draft\ntype: technical\nderived-from: SWR-101\n"
        'title: "Tech"\n---\n\n# SWR-102 - Tech\n',
        encoding="utf-8",
    )
    before = generate(parse_requirements(tmp_path).requirements)
    tech.write_text(
        "---\nreq-id: SWR-102\nstatus: draft\ntype: product\n"
        'title: "Tech"\n---\n\n# SWR-102 - Tech\n',
        encoding="utf-8",
    )
    after = generate(parse_requirements(tmp_path).requirements)
    assert before.split("GLOBAL-HASH:", 1)[1][:20] != after.split("GLOBAL-HASH:", 1)[1][:20]


@verifies(SWR.SWR_2324)
def test_parse_errors_abort_generation(tmp_path: Path) -> None:
    _write_req(tmp_path, 101)
    folder = tmp_path / "docs" / "requirements"
    (folder / "broken.md").write_text(
        "---\nreq-id: SWR-101\nstatus: draft\n---\n# dup\n", encoding="utf-8"
    )
    changed, errors = regenerate_if_stale(tmp_path)
    assert changed is False
    assert errors
    assert not (tmp_path / GENERATED_PATH).exists()
