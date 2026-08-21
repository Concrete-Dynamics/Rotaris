"""A synthetic requirement store, and what one board pass costs over it (SWR-3317).

SWR-3317 asks the board to scale to a large store, and "large" for this product
is the number its own bridge names: **the fifteen hundred**
(``requirements_bridge.py``). Nothing measured that. The review's finding F6 said
the pass was probably too expensive and named `BoardProjector.inputs` as the
reason; this module exists so that the next such claim starts from a number.

Two pieces, deliberately in one file:

- :func:`build_store` writes a ReqToCode-shaped Markdown store of *n*
  requirements through the store's own template
  (:func:`~rotaris_core.requirements.writeback.render_requirement_document`), so
  the real adapter reads it and the real parser parses it. A fixture the engine
  would reject measures nothing.
- :func:`measure` times each stage of one pass separately, because a total tells
  you a pass is slow and nothing about which change would help.

**Relation density is the parameter that matters.** The projection asks the
relation graph what each requirement points at and what points back, once per
requirement per kind; a store with realistic `derived-from` links is what makes
that visible, and a store of isolated requirements would report a cost this
product does not have.

Run it directly for the table::

    uv run python -m tests.unit.requirements.board_scale --n 1500
    uv run python -m tests.unit.requirements.board_scale --repo .

The regression guards live beside it in ``test_board_scale.py`` and count
operations rather than seconds — a wall-clock budget in CI measures the runner,
not the code.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.requirements.model import RequirementType
from rotaris_core.requirements.writeback import (
    epic_index_row,
    render_requirement_document,
    requirement_filename,
)

if TYPE_CHECKING:
    from collections.abc import Iterator

#: Ids are laid out in the store's own blocks, exactly as `allocate_requirement_id`
#: issues them: epic ``SWR-<k*100>`` owns ``SWR-<k*100+1>`` … ``SWR-<k*100+99>``.
EPIC_BLOCK = 100

#: Every fourth requirement is technical and names the one before it as its
#: origin. Measured against this repository, where 1527 requirements carry 3054
#: authored edges — the density is what the graph queries pay for.
DERIVED_EVERY = 4

_EPIC_INDEX_HEAD = """---
req-id: SWR-{epic}
status: approved
trace: optional
test: optional
title: "Synthetic epic {epic}"
---

# SWR-{epic} — Synthetic epic {epic}

A generated epic, so the store has the nesting a real one has.

## Requirements

| ID | Title | Status |
| --- | --- | --- |
"""


def build_store(root: Path, *, n: int = 1500, first_epic: int = 1000) -> Path:
    """Write *n* requirements into a ReqToCode-shaped store under *root*.

    Returns the workspace root (the parent of ``docs/requirements``), which is
    what every engine entry point takes.

    The store is built file-by-file rather than through
    :class:`~rotaris_core.requirements.writeback.MarkdownStoreWriter`: that class
    re-reads every id on each create, so building 1500 of them would cost
    O(n²) before a single measurement ran. The *template* is the writer's own, so
    what lands is still what the product would have written.
    """
    store = root / "docs" / "requirements"
    store.mkdir(parents=True, exist_ok=True)
    per_epic = EPIC_BLOCK - 1
    epics = (n + per_epic - 1) // per_epic

    written = 0
    for index in range(epics):
        epic_number = first_epic + index * EPIC_BLOCK
        folder_name = f"{epic_number}-synthetic-epic-{index}"
        folder = store / folder_name
        folder.mkdir(exist_ok=True)
        rows: list[str] = []
        for offset in range(1, per_epic + 1):
            if written >= n:
                break
            req_number = epic_number + offset
            req_id = f"SWR-{req_number}"
            title = f"Synthetic requirement {req_number}"
            technical = offset % DERIVED_EVERY == 0 and offset > 1
            filename = requirement_filename(req_id, title)
            (folder / filename).write_text(
                render_requirement_document(
                    req_id=req_id,
                    title=title,
                    description=(
                        f"The user performs action {req_number} and the product "
                        "records what happened."
                    ),
                    date_text="2026-08-18",
                    epic_id=f"SWR-{epic_number}",
                    epic_link=f"[SWR-{epic_number}](../{folder_name}.md)",
                    derived_from=[f"SWR-{req_number - 1}"] if technical else [],
                    req_type=RequirementType.TECHNICAL if technical else RequirementType.PRODUCT,
                ),
                encoding="utf-8",
            )
            rows.append(
                epic_index_row(
                    req_id,
                    title,
                    lifecycle="approved",
                    relative_path=f"{folder_name}/{filename}",
                ),
            )
            written += 1
        (store / f"{folder_name}.md").write_text(
            _EPIC_INDEX_HEAD.format(epic=epic_number) + "\n".join(rows) + "\n",
            encoding="utf-8",
        )
    return root


@dataclass(frozen=True)
class Timing:
    """One stage's cost, and how many requirements it covered."""

    stage: str
    seconds: float
    count: int = 0

    @property
    def line(self) -> str:
        per = f"  ({self.seconds / self.count * 1e6:.1f} µs each)" if self.count else ""
        return f"{self.stage:<34}{self.seconds:8.3f}s{per}"


def measure(workspace: Path) -> list[Timing]:
    """Time every stage of one board pass over *workspace*, reading only.

    Deliberately not a single number. The stage that dominates is the only thing
    that decides which change is worth making, and a total hides it — the review
    guessed `inputs` and the answer was the projection.

    The registry is built without cross-session memory, so this writes nothing at
    all: a measurement that mutated the workspace it measured could not be run
    against a real repository, which is the case that matters most.
    """
    from rotaris_core.requirements.delivery.projection import (
        BoardProjector,
        WorkspaceEvidence,
        project_board,
    )
    from rotaris_core.requirements.delivery.store import DeliveryStore
    from rotaris_core.requirements.execution.reader import WorkspaceExecution
    from rotaris_core.requirements.registry import RequirementRegistry
    from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for

    source = reqtocode_source_for(workspace)
    if source is None:
        raise SystemExit(f"{workspace} keeps no ReqToCode requirement store")
    registry = RequirementRegistry([source])

    timings: list[Timing] = []

    with _timed("registry.refresh (cold)", timings):
        index = registry.refresh()
    n = len(index.requirements)
    with _timed("registry.refresh (warm)", timings):
        index = registry.refresh()

    store = DeliveryStore(workspace)
    with _timed("WorkspaceEvidence.for_repository", timings):
        evidence = WorkspaceEvidence.for_repository(workspace)
    execution = WorkspaceExecution(workspace, delivery=store, requirement_for=index.requirement)

    with _timed("  evidence_for (per requirement)", timings, count=n):
        for requirement in index.requirements:
            evidence.evidence_for(requirement)
    with _timed("  execution_for (per requirement)", timings, count=n):
        for requirement in index.requirements:
            execution.execution_for(requirement.req_id)

    projector = BoardProjector(
        index,
        store,
        evidence=evidence,
        execution=execution,
        clock=lambda: dt.datetime.now(dt.UTC),
    )
    with _timed("BoardProjector.inputs", timings):
        inputs = projector.inputs()
    with _timed("project_board", timings):
        project_board(inputs)

    total = sum(
        timing.seconds
        for timing in timings
        if timing.stage
        in {
            "registry.refresh (warm)",
            "WorkspaceEvidence.for_repository",
            "BoardProjector.inputs",
            "project_board",
        }
    )
    timings.append(Timing("warm pass total", total, count=n))
    return timings


@contextmanager
def _timed(stage: str, into: list[Timing], *, count: int = 0) -> Iterator[None]:
    """Record one stage's wall clock, so the measured body reads as itself."""
    start = time.perf_counter()
    yield
    into.append(Timing(stage, time.perf_counter() - start, count=count))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--n", type=int, default=1500, help="synthetic store size")
    parser.add_argument("--repo", type=Path, help="measure this workspace instead")
    parser.add_argument("--json", action="store_true", help="emit machine-readable timings")
    args = parser.parse_args(argv)

    if args.repo is not None:
        workspace = args.repo.resolve()
        label = str(workspace)
    else:
        import tempfile

        directory = tempfile.mkdtemp(prefix="rotaris-scale-")
        workspace = build_store(Path(directory), n=args.n)
        label = f"synthetic, n={args.n}"

    timings = measure(workspace)
    if args.json:
        print(json.dumps({timing.stage.strip(): timing.seconds for timing in timings}, indent=2))
    else:
        print(f"board pass over {label}\n")
        for timing in timings:
            print(timing.line)
    return 0


if __name__ == "__main__":  # pragma: no cover — a script, run by hand
    raise SystemExit(main())
