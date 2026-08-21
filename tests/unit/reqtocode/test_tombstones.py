"""Retired requirement ids (SWR-2318): a deleted id can never come back.

Driven through the real entry points — `regenerate_if_stale` and
`parse_requirements` over a synthetic repository on disk — because the property
under test is that *deleting a requirement* leaves a record, and only those
functions can see a deletion happen.

Marker tokens are assembled through the T/V constants so this file's own source
carries no scannable reference into the fixtures, exactly as the sibling layout
tests do: the repository-level sweep must not pick up a synthetic requirement.
"""

from __future__ import annotations

from pathlib import Path

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.generator import parse_requirements, regenerate_if_stale
from rotaris_core.reqtocode.layout import RepoLayout
from rotaris_core.reqtocode.tombstones import (
    Tombstone,
    detect_retirements,
    load_tombstones,
    merge_tombstones,
    parse_tombstones,
    previous_requirements,
    render_tombstones,
)

T = "traces"
V = "verifies"

#: A repository small enough to reason about: specs/, lib/, spec/.
LAYOUT = RepoLayout(
    generated_path=Path("lib") / "_swr.py",
    impl_roots=(Path("lib"),),
    test_roots=(Path("spec"),),
    excused_test_roots=(),
).with_requirements_dir("specs")

RETIRED_ON = "2026-08-15"


def _requirement(root: Path, number: int, title: str) -> Path:
    path = root / "specs" / f"SWR-{number}-demo.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f"---\nreq-id: SWR-{number}\nstatus: approved\ntrace: optional\ntest: optional\n"
        f'title: "{title}"\n---\n\nBody of {number}.\n',
        encoding="utf-8",
    )
    return path


def _generate(root: Path, on: str = RETIRED_ON) -> None:
    changed, errors = regenerate_if_stale(root, LAYOUT, lambda: on)
    assert errors == [], "\n".join(errors)
    del changed


@verifies(SWR.SWR_2318)
def test_deleting_a_requirement_leaves_a_tombstone_naming_it(tmp_path: Path) -> None:
    """Productive use: an author deletes a requirement that turned out to be wrong.
    Expected outcome: the id, its last known title and the removal date are
    recorded, so the id can never be handed to different work later."""
    _requirement(tmp_path, 101, "Kept")
    doomed = _requirement(tmp_path, 102, "Withdrawn after review")
    _generate(tmp_path)
    assert load_tombstones(tmp_path, LAYOUT) == {}, "nothing has been deleted yet"

    doomed.unlink()
    _generate(tmp_path)

    stones = load_tombstones(tmp_path, LAYOUT)
    assert set(stones) == {102}, "only the deleted id is tombstoned"
    assert stones[102] == Tombstone(
        number=102,
        req_id="SWR-102",
        retired_on=RETIRED_ON,
        title="Withdrawn after review",
    )
    # The record is next to the requirements it is about, and says what it is.
    log = (tmp_path / LAYOUT.tombstone_path).read_text(encoding="utf-8")
    assert "APPEND-ONLY" in log
    assert "SWR-102\t2026-08-15\tWithdrawn after review" in log


@verifies(SWR.SWR_2318)
def test_a_retired_id_cannot_be_claimed_by_new_work(tmp_path: Path) -> None:
    """Productive use: somebody writes a new requirement and picks a free-looking id.
    Expected outcome: the store is refused, naming what that id used to be —
    which is the whole reason the tombstone is kept."""
    _requirement(tmp_path, 101, "Kept")
    doomed = _requirement(tmp_path, 102, "Withdrawn after review")
    _generate(tmp_path)
    doomed.unlink()
    _generate(tmp_path)

    _requirement(tmp_path, 102, "Something entirely different")
    parsed = parse_requirements(tmp_path, LAYOUT)

    assert parsed.errors, "reusing a retired id must not be accepted"
    joined = "\n".join(parsed.errors)
    assert "SWR-102" in joined
    assert "retired 2026-08-15" in joined
    assert "Withdrawn after review" in joined, "the author's next question is what it was"
    # And the refusal reaches generation, not only the parse: a store that cannot
    # be parsed must not quietly produce a module.
    _, errors = regenerate_if_stale(tmp_path, LAYOUT, lambda: RETIRED_ON)
    assert errors, "generation proceeded over a reused id"


@verifies(SWR.SWR_2318)
def test_the_log_is_append_only_and_never_restates_a_date(tmp_path: Path) -> None:
    """Productive use: the tool runs again, days later, over the same deletion.
    Expected outcome: the original removal date stands. A log that rewrote itself
    every run would record when the tool last ran, not when the id was retired."""
    _requirement(tmp_path, 101, "Kept")
    doomed = _requirement(tmp_path, 102, "Withdrawn")
    _generate(tmp_path)
    doomed.unlink()
    _generate(tmp_path, on="2026-08-15")

    # A later run, with a later clock and a further deletion.
    also_doomed = _requirement(tmp_path, 103, "Also withdrawn")
    _generate(tmp_path, on="2026-09-01")
    also_doomed.unlink()
    _generate(tmp_path, on="2026-09-01")

    stones = load_tombstones(tmp_path, LAYOUT)
    assert stones[102].retired_on == "2026-08-15", "the first record of an id wins"
    assert stones[103].retired_on == "2026-09-01"
    assert set(stones) == {102, 103}


@verifies(SWR.SWR_2318)
def test_a_hand_mangled_line_costs_one_record_not_the_whole_run(tmp_path: Path) -> None:
    """Productive use: somebody edits the log by hand and breaks a line.
    Expected outcome: the readable records still bar their ids. The log's job is
    to prevent reuse, so losing one line must not stop the repository from being
    checked at all."""
    log = tmp_path / LAYOUT.tombstone_path
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(
        "# a comment\n"
        "\n"
        "not-a-requirement-id\tnonsense\n"
        "SWR-oops\t2026-01-01\tmalformed number\n"
        "SWR-102\t2026-08-15\tWithdrawn\n",
        encoding="utf-8",
    )

    stones = load_tombstones(tmp_path, LAYOUT)

    assert set(stones) == {102}
    assert stones[102].title == "Withdrawn"


@verifies(SWR.SWR_2318)
def test_a_requirement_that_still_exists_is_never_tombstoned(tmp_path: Path) -> None:
    """Productive use: a requirement is edited, renamed or re-titled, not deleted.
    Expected outcome: no tombstone. Only disappearance from the store is a
    deletion; everything else is an ordinary change."""
    kept = _requirement(tmp_path, 101, "First title")
    _generate(tmp_path)

    kept.write_text(
        "---\nreq-id: SWR-101\nstatus: approved\ntrace: optional\ntest: optional\n"
        'title: "Renamed, still here"\n---\n\nRewritten body.\n',
        encoding="utf-8",
    )
    _generate(tmp_path)

    assert load_tombstones(tmp_path, LAYOUT) == {}


@verifies(SWR.SWR_2318)
def test_the_previous_generation_is_read_even_when_a_title_carries_quotes() -> None:
    """Productive use: a requirement whose title contains an apostrophe is deleted.
    Expected outcome: its tombstone still names it. The generated module writes
    titles with repr(), so a pattern-matched reader would lose exactly these."""
    generated = (
        '"""doc"""\n'
        "from rotaris_core.reqtocode.declarations import ReqMeta, ReqStatus\n"
        "META: dict[int, ReqMeta] = {\n"
        "    101: ReqMeta('SWR-101', 101, ReqStatus.APPROVED, \"Rotaris' own board\","
        " 'specs/a.md', False, False, 'h', 'product', ()),\n"
        "    102: ReqMeta('SWR-102', 102, ReqStatus.APPROVED, 'Plain', "
        "'specs/b.md', False, False, 'h', 'product', ()),\n"
        "}\n"
    )

    previous = previous_requirements(generated)

    assert previous == {101: "Rotaris' own board", 102: "Plain"}
    # An unreadable module is not evidence of a deletion, so it invents nothing.
    assert previous_requirements("def broken(:\n") == {}
    assert previous_requirements(None) == {}


@verifies(SWR.SWR_2318)
def test_the_log_round_trips_and_merging_keeps_the_first_record() -> None:
    """Productive use: the tool reads its own log back after writing it.
    Expected outcome: identical records, in id order, and a re-detected id does
    not overwrite what was already recorded about it."""
    first = Tombstone(number=102, req_id="SWR-102", retired_on="2026-08-15", title="Withdrawn")
    second = Tombstone(number=101, req_id="SWR-101", retired_on="2026-09-01", title="Later")

    text = render_tombstones([second, first])

    assert parse_tombstones(text) == {101: second, 102: first}
    assert text.index("SWR-101") < text.index("SWR-102"), "ordered by id, so diffs stay small"

    restated = Tombstone(number=102, req_id="SWR-102", retired_on="2027-01-01", title="Rewritten")
    merged = merge_tombstones({102: first}, [restated, second])
    assert merged[102] is first, "the first record of an id wins"
    assert merged[101] == second


@verifies(SWR.SWR_2318)
def test_detection_reports_only_ids_that_left_and_are_not_already_recorded() -> None:
    """Productive use: the generator asks what this run deleted.
    Expected outcome: ids the previous generation carried and the store dropped,
    minus the ones already tombstoned."""

    class _Req:
        def __init__(self, number: int) -> None:
            self.number = number

    retired = detect_retirements(
        {101: "Kept", 102: "Gone", 103: "Also gone"},
        [_Req(101)],
        retired_on=RETIRED_ON,
        known={103: Tombstone(number=103, req_id="SWR-103", retired_on="2026-01-01", title="x")},
    )

    assert [stone.number for stone in retired] == [102]
    assert retired[0].title == "Gone"
