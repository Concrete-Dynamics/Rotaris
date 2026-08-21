"""Retired requirement ids — what a deletion leaves behind (SWR-2318).

An id must never be reassigned once its requirement is deleted. Nothing recorded
that a deleted id ever existed, though: it simply stopped appearing in ``META``,
and only the git history remembered. A repository that adopts ReqToCode later, or
somebody following a stale reference, could not tell *never existed* from
*retired* — and nothing stopped the next author from handing that id to different
work.

So a deletion appends a **tombstone** — the id, its last known title and the
removal date — to a retired-ids log beside the requirement store, and parsing
rejects any file that claims a tombstoned id.

Two properties are load-bearing:

- **Append-only.** The log *is* the memory. The three baseline files next to it
  are shrink-only ratchets over debt; this one never shrinks at all, because a
  retired id stays retired forever. :func:`merge_tombstones` keeps the first
  record of an id and ignores any later one, so a re-run cannot rewrite history.
- **Derived from the previous generation, not from a hand-maintained list.** The
  generated module is the record of what existed last time. An id that was in it
  and is no longer in the store was deleted — which is exactly the moment a
  tombstone is owed, and the only moment ReqToCode can see it. Nobody has to
  remember to file one.

Stdlib-only (``ast``, ``datetime``), like the rest of this package: the
pre-commit hook runs it without the project venv.
"""

from __future__ import annotations

import ast
import datetime as dt
from dataclasses import dataclass
from typing import TYPE_CHECKING

from rotaris_core.reqtocode.layout import DEFAULT_LAYOUT

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping
    from pathlib import Path

    from rotaris_core.reqtocode.declarations import ReqMeta
    from rotaris_core.reqtocode.layout import RepoLayout

__all__ = [
    "TOMBSTONE_HEADER",
    "Tombstone",
    "detect_retirements",
    "load_tombstones",
    "merge_tombstones",
    "parse_tombstones",
    "previous_requirements",
    "render_tombstones",
    "reuse_errors",
    "today_iso",
    "write_tombstones",
]

#: What the file says about itself. A reader who finds it without knowing the
#: tool should still learn what it is and why it never shrinks.
TOMBSTONE_HEADER = (
    "# Retired requirement ids (SWR-2318). APPEND-ONLY.\n"
    "#\n"
    "# A tombstone is the only record that a deleted requirement id ever existed.\n"
    "# Reusing a tombstoned id is rejected: ids are never reassigned.\n"
    "# Written by `python -m rotaris_core.reqtocode check --fix` (and `generate`)\n"
    "# when an id that the generated module carried is no longer in the store.\n"
    "#\n"
    "# <req-id>\\t<retired-on, ISO 8601>\\t<last known title>\n"
)

_FIELD_SEPARATOR = "\t"


@dataclass(frozen=True, order=True)
class Tombstone:
    """One retired id: what it was called, and when it stopped existing."""

    number: int
    req_id: str
    retired_on: str
    title: str

    def as_line(self) -> str:
        """The record as the log stores it — tab-separated, one line."""
        return _FIELD_SEPARATOR.join((self.req_id, self.retired_on, self.title))


def today_iso(clock: object = None) -> str:
    """Today's date as ISO 8601, or whatever *clock* answers.

    Injected rather than read at the call site so a test can pin the date the
    record carries; a tombstone whose date moved between runs would make the log
    non-deterministic and every diff of it noise.
    """
    if clock is None:
        return dt.datetime.now(dt.UTC).date().isoformat()
    if callable(clock):
        return str(clock())
    return str(clock)


def parse_tombstones(text: str) -> dict[int, Tombstone]:
    """Read a retired-ids log. Tolerant: unreadable lines are skipped, not fatal.

    A malformed line must not stop the tool from running — the log's job is to
    *prevent reuse*, and losing one record to a bad edit is far less harmful than
    a repository that cannot be checked at all. Nothing writes a malformed line;
    only a hand-edit can.
    """
    stones: dict[int, Tombstone] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(_FIELD_SEPARATOR)
        if len(parts) < 2:
            continue
        req_id = parts[0].strip()
        if not req_id.upper().startswith("SWR-"):
            continue
        digits = req_id[4:].strip()
        if not digits.isdigit():
            continue
        number = int(digits)
        title = parts[2].strip() if len(parts) > 2 else ""
        stones[number] = Tombstone(
            number=number,
            req_id=f"SWR-{number}",
            retired_on=parts[1].strip(),
            title=title,
        )
    return stones


def render_tombstones(stones: Iterable[Tombstone]) -> str:
    """The log as text — header, then one record per id, ordered by id."""
    ordered = sorted(stones, key=lambda stone: stone.number)
    return TOMBSTONE_HEADER + "".join(f"{stone.as_line()}\n" for stone in ordered)


def merge_tombstones(
    existing: Mapping[int, Tombstone],
    arriving: Iterable[Tombstone],
) -> dict[int, Tombstone]:
    """Add records for ids not yet tombstoned. The first record of an id wins.

    Append-only in the way that matters: a second run over the same deletion
    must not restate the date, or every run would rewrite the file and the log
    would stop being a record of *when* something was retired.
    """
    merged = dict(existing)
    for stone in arriving:
        merged.setdefault(stone.number, stone)
    return merged


def load_tombstones(repo_root: Path, layout: RepoLayout | None = None) -> dict[int, Tombstone]:
    """Every retired id this repository knows. Empty when nothing has been."""
    layout = layout if layout is not None else DEFAULT_LAYOUT
    path = repo_root / layout.tombstone_path
    if not path.is_file():
        return {}
    return parse_tombstones(path.read_text(encoding="utf-8", errors="replace"))


def write_tombstones(
    repo_root: Path,
    stones: Mapping[int, Tombstone],
    layout: RepoLayout | None = None,
) -> None:
    """Write the log, LF endings, UTF-8 — the convention of its neighbours."""
    layout = layout if layout is not None else DEFAULT_LAYOUT
    path = repo_root / layout.tombstone_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_tombstones(stones.values()), encoding="utf-8", newline="\n")


def previous_requirements(generated: str | None) -> dict[int, str]:
    """``{number: title}`` from a previously generated module's ``META``.

    Read with :mod:`ast` rather than a regular expression, because the generator
    writes titles with :func:`repr` and a title containing a quote would defeat
    any pattern. A file that cannot be parsed answers ``{}``: an unreadable
    previous generation is not evidence that anything was deleted, and inventing
    tombstones from it would be worse than filing none.
    """
    if not generated:
        return {}
    try:
        module = ast.parse(generated)
    except SyntaxError:
        return {}
    for node in module.body:
        if isinstance(node, ast.AnnAssign):
            targets: list[ast.expr] = [node.target]
        elif isinstance(node, ast.Assign):
            targets = list(node.targets)
        else:
            continue
        named = any(isinstance(target, ast.Name) and target.id == "META" for target in targets)
        if named and isinstance(node.value, ast.Dict):
            return _meta_titles(node.value)
    return {}


def _meta_titles(mapping: ast.Dict) -> dict[int, str]:
    titles: dict[int, str] = {}
    for key, value in zip(mapping.keys, mapping.values, strict=False):
        if not isinstance(value, ast.Call) or len(value.args) < 4:
            continue
        try:
            number = ast.literal_eval(key) if key is not None else None
            title = ast.literal_eval(value.args[3])
        except (ValueError, TypeError, SyntaxError):
            continue
        if isinstance(number, int) and isinstance(title, str):
            titles[number] = title
    return titles


def detect_retirements(
    previous: Mapping[int, str],
    current: Iterable[ReqMeta],
    *,
    retired_on: str,
    known: Mapping[int, Tombstone] | None = None,
) -> list[Tombstone]:
    """Ids the previous generation carried and the store no longer declares.

    That difference *is* a deletion — there is no other way for an id to leave
    the generated module — and this is the only moment the tool can observe it.
    Ids already tombstoned are not reported again.
    """
    live = {requirement.number for requirement in current}
    already = set(known or {})
    return sorted(
        Tombstone(
            number=number,
            req_id=f"SWR-{number}",
            retired_on=retired_on,
            title=title,
        )
        for number, title in previous.items()
        if number not in live and number not in already
    )


def reuse_errors(
    requirements: Iterable[ReqMeta],
    tombstones: Mapping[int, Tombstone],
) -> list[str]:
    """One error per requirement claiming a retired id (SWR-2318).

    The whole point of the log: an id is retired forever, so a store that hands
    a tombstoned id to new work is refused rather than silently accepted. The
    message names the date and the old title, because the author's next question
    is always "what *was* this?".
    """
    if not tombstones:
        return []
    errors: list[str] = []
    for requirement in sorted(requirements, key=lambda r: r.number):
        stone = tombstones.get(requirement.number)
        if stone is None:
            continue
        was = f" (retired {stone.retired_on}" + (f", was {stone.title!r})" if stone.title else ")")
        errors.append(
            f"{requirement.source_path} ({requirement.req_id}): reuses a retired id{was}."
            " Ids are never reassigned — claim the next free id instead."
        )
    return errors


def _self_annotate() -> None:
    # Bootstrap-safe (blueprint §11): the generated module may not exist yet.
    try:
        from rotaris_core.reqtocode.declarations import traces
        from rotaris_core.reqtocode.swr import SWR

        traces(SWR.SWR_2318)(Tombstone)
        traces(SWR.SWR_2318)(parse_tombstones)
        traces(SWR.SWR_2318)(render_tombstones)
        traces(SWR.SWR_2318)(merge_tombstones)
        traces(SWR.SWR_2318)(load_tombstones)
        traces(SWR.SWR_2318)(write_tombstones)
        traces(SWR.SWR_2318)(previous_requirements)
        traces(SWR.SWR_2318)(detect_retirements)
        traces(SWR.SWR_2318)(reuse_errors)
        traces(SWR.SWR_2335)(load_tombstones)
    except (ImportError, AttributeError):  # pragma: no cover - bootstrap/stale swr.py
        return


_self_annotate()
