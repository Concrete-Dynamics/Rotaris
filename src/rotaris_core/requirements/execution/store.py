"""Where a requirement's units and integrations live between processes.

The rest of this package computes: :mod:`.units` derives a unit set,
:mod:`.integration` merges branches, :mod:`.flow` drives both. None of that
survives the process that ran it, and two consumers need it to.

- **A restart has to find the work again.** Unit ids are derived rather than
  drawn (SWR-3401), so a re-planned set has the same ids — but not the same
  *states*: which unit finished, which failed and why, how many retries it has
  spent are facts only the previous process saw.
- **The board reads, it does not run** (SWR-3311, SWR-3216). The desktop never
  starts a flow, so everything it shows about execution has to be on disk before
  it looks. :class:`~rotaris_core.requirements.execution.reader.WorkspaceExecution`
  reads exactly these two stores plus the run history.

Both follow the shape the rest of Rotaris' requirement data already uses:

```text
<workspace>/.rotaris/requirements/units/SWR-3401.json          one file, replaced atomically
<workspace>/.rotaris/requirements/integrations/SWR-3401.jsonl  append-only, one line per attempt
```

Units are a *set* that is rewritten as a whole — a unit's state changes and the
old state is of no interest — so one atomically replaced file per requirement.
The set *grows* rather than turns over when a requirement is delivered a second
time: the previous cycle's units are retired into the same file (SWR-3417), so
rewriting the whole file never costs a run. That is why the caller opens the new
cycle on the set this store loaded, and never on a plan built from nothing.
Integrations are *attempts*, and a failed one is the interesting one (SWR-3409),
so they append the way the run history does and two integrations finishing at
once cannot lose each other.

Neither store persists requirement prose. A unit's own title is written under
``unit_title`` rather than ``title`` precisely because the deny-list of SWR-3114
is checked against every payload before it is written: the guard would otherwise
have to be weakened to admit a field that is not requirement content but is
spelled like one.
"""

from __future__ import annotations

import json
import os
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.store import (
    assert_no_requirement_content,
    record_filename,
)
from rotaris_core.requirements.execution.integration import IntegrationOutcome
from rotaris_core.requirements.execution.units import ExecutionUnit, RequirementUnits, UnitError
from rotaris_core.requirements.tombstones import requirements_state_dir
from rotaris_core.requirements.writeback import Replacer, atomic_write_text

if TYPE_CHECKING:
    from collections.abc import Mapping
    from pathlib import Path

    from pydantic import JsonValue

__all__ = [
    "INTEGRATION_LOG_SUBDIRNAME",
    "UNIT_STORE_SCHEMA_VERSION",
    "UNIT_STORE_SUBDIRNAME",
    "IntegrationLog",
    "UnitStore",
    "unit_from_payload",
    "unit_payload",
]

#: Stamped on every file this build writes. A file written by a newer build is
#: skipped rather than reinterpreted — the delivery store's rule (SWR-3205).
#:
#: ``2`` because SWR-3417 changed what a unit file may *contain*, not merely what
#: it carries: version 1 could not hold two units with one id, version 2 holds
#: one per delivery cycle. A version-1 build reading a version-2 file would drop
#: the ``cycle`` of every unit, collapse both cycles onto the same ids and refuse
#: the set as incoherent — so it is told to skip the file instead of discovering
#: that by accident. The other direction is untouched: a version-1 file has no
#: ``cycle`` anywhere, every unit defaults to cycle 0, and that is exactly true —
#: everything written before this change was the requirement's first delivery.
UNIT_STORE_SCHEMA_VERSION = 2

#: Sub-directory of ``<workspace>/.rotaris/requirements/`` holding unit sets.
UNIT_STORE_SUBDIRNAME = "units"

#: Sub-directory of ``<workspace>/.rotaris/requirements/`` holding integrations.
INTEGRATION_LOG_SUBDIRNAME = "integrations"


@traces(SWR.SWR_3401, SWR.SWR_3114)
def unit_payload(unit: ExecutionUnit) -> dict[str, JsonValue]:
    """One unit as it is persisted — identity, graph, state, and nothing else.

    ``title`` becomes ``unit_title``: the unit's title is Rotaris' own label for
    a slice of work, never the requirement's, and writing it under the name
    SWR-3114 reserves for requirement prose would make the guard below
    unenforceable for everything else in the file.
    """
    return {
        "unit_id": unit.unit_id,
        "req_id": unit.req_id,
        "cycle": unit.cycle,
        "unit_title": unit.title,
        "scope": unit.scope,
        "depends_on": list(unit.depends_on),
        "state": str(unit.state),
        "run_ids": list(unit.run_ids),
        "retries": unit.retries,
        "retry_limit": unit.retry_limit,
        "failure_reason": unit.failure_reason,
        "agent": unit.agent,
    }


@traces(SWR.SWR_3401)
def unit_from_payload(payload: Mapping[str, JsonValue]) -> ExecutionUnit:
    """The unit *payload* describes. Raises :class:`UnitError` when it does not.

    A payload with no ``cycle`` is a file written before SWR-3417 and reads back
    as cycle 0, which is what it is: everything recorded then was the
    requirement's first delivery.
    """
    try:
        return ExecutionUnit.model_validate(
            {
                "unit_id": payload.get("unit_id"),
                "req_id": payload.get("req_id"),
                "cycle": payload.get("cycle", 0),
                "title": payload.get("unit_title", ""),
                "scope": payload.get("scope", ""),
                "depends_on": tuple(_strings(payload.get("depends_on"))),
                "state": payload.get("state", "pending"),
                "run_ids": tuple(_strings(payload.get("run_ids"))),
                "retries": payload.get("retries", 0),
                "retry_limit": payload.get("retry_limit"),
                "failure_reason": payload.get("failure_reason", ""),
                "agent": payload.get("agent", ""),
            },
        )
    except ValueError as exc:
        raise UnitError(f"unreadable execution unit: {exc}") from exc


def _whole(value: object) -> int:
    """*value* as a delivery cycle number — anything unreadable is cycle 0."""
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def _strings(value: JsonValue) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    return tuple(str(item) for item in value if isinstance(item, str))


@traces(SWR.SWR_3401, SWR.SWR_3114)
class UnitStore:
    """One requirement's execution units on disk, rewritten as a whole.

    Outside every worktree by construction, like the run history (SWR-3414): the
    path comes from the *workspace*, so removing a unit's tree cannot reach the
    record of the unit.

    Reading never raises. A file this build cannot read costs that requirement's
    unit set and nothing else, and the honest answer for a requirement with no
    readable file is the same as for one that never had units — a blank set. A
    board that refused to render because one file was corrupt would be worse than
    one that says "no units yet".
    """

    def __init__(self, workspace: Path, *, replace: Replacer = os.replace) -> None:
        self._workspace = workspace
        self._replace = replace

    @property
    def directory(self) -> Path:
        """``<workspace>/.rotaris/requirements/units/`` — where unit sets live."""
        return requirements_state_dir(self._workspace) / UNIT_STORE_SUBDIRNAME

    def path_for(self, req_id: str) -> Path:
        """The file *req_id*'s units live in."""
        return self.directory / record_filename(req_id)

    @traces(SWR.SWR_3401)
    def save(self, units: RequirementUnits) -> Path:
        """Persist *units*, atomically. Returns where they landed.

        The whole set, live and retired, in one write: a discarded unit still
        owns its id (SWR-3401), and a file that dropped it would let the next
        plan of that cycle hand the id to different work. The same write is what
        carries a finished delivery cycle forward (SWR-3417) — the caller opens
        the next cycle *on* the loaded set, so this replacement adds to the
        history rather than replacing it.
        """
        payload: dict[str, JsonValue] = {
            "schema_version": UNIT_STORE_SCHEMA_VERSION,
            "req_id": units.req_id,
            "cycle": units.cycle,
            "units": [unit_payload(unit) for unit in units.units],
            "discarded": [unit_payload(unit) for unit in units.discarded],
        }
        assert_no_requirement_content(payload, where=f"unit set {units.req_id}")
        path = self.path_for(units.req_id)
        atomic_write_text(
            path,
            json.dumps(payload, indent=2, sort_keys=True) + "\n",
            replace=self._replace,
        )
        return path

    @traces(SWR.SWR_3401)
    def load(self, req_id: str) -> RequirementUnits:
        """*req_id*'s units, or a blank set when none were ever written."""
        blank = RequirementUnits.blank(req_id)
        path = self.path_for(req_id)
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError:
            return blank
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return blank
        if not isinstance(payload, dict) or payload.get("req_id") != req_id:
            return blank
        version = payload.get("schema_version")
        if isinstance(version, int) and version > UNIT_STORE_SCHEMA_VERSION:
            return blank
        try:
            units = self._units(payload.get("units"))
            discarded = self._units(payload.get("discarded"))
            return RequirementUnits(
                req_id=req_id,
                # Never below what the units themselves claim. A version-1 file
                # has no header cycle at all and every unit in it is cycle 0; a
                # version-2 file whose header disagreed with its units would
                # otherwise be refused outright rather than read as what it
                # plainly is (SWR-3417).
                cycle=max(
                    _whole(payload.get("cycle")),
                    max((unit.cycle for unit in (*units, *discarded)), default=0),
                ),
                units=units,
                discarded=discarded,
            )
        except (UnitError, ValueError):
            return blank

    @staticmethod
    def _units(value: object) -> tuple[ExecutionUnit, ...]:
        if not isinstance(value, list):
            return ()
        return tuple(unit_from_payload(item) for item in value if isinstance(item, dict))

    def req_ids(self) -> tuple[str, ...]:
        """Every requirement this store holds units for, sorted.

        Read from inside each file rather than from its name: a slugged file name
        cannot be turned back into the id it came from (SWR-3205), and guessing
        would attribute a unit to the wrong requirement.
        """
        try:
            files = sorted(path for path in self.directory.glob("*.json") if path.is_file())
        except OSError:
            return ()
        found: set[str] = set()
        for path in files:
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if isinstance(payload, dict) and isinstance(payload.get("req_id"), str):
                found.add(str(payload["req_id"]))
        return tuple(sorted(found))

    def clear(self, req_id: str) -> None:
        """Forget one requirement's units. Never touches its history (SWR-3414)."""
        try:
            self.path_for(req_id).unlink()
        except OSError:
            return


@traces(SWR.SWR_3409)
class IntegrationLog:
    """Every integration attempt of one requirement, the failures included.

    Append-only for the reason SWR-3409 gives: an integration that did not land
    is the one a user has to act on, and it names the units that collided. A
    store that kept only the last attempt would erase the conflict as soon as a
    retry succeeded, which is exactly the record somebody looking at the branch
    needs.
    """

    def __init__(self, workspace: Path) -> None:
        self._workspace = workspace

    @property
    def directory(self) -> Path:
        """``<workspace>/.rotaris/requirements/integrations/``."""
        return requirements_state_dir(self._workspace) / INTEGRATION_LOG_SUBDIRNAME

    def path_for(self, req_id: str) -> Path:
        """The file *req_id*'s integrations are appended to."""
        return self.directory / (record_filename(req_id).removesuffix(".json") + ".jsonl")

    @traces(SWR.SWR_3409)
    def append(self, outcome: IntegrationOutcome) -> IntegrationOutcome:
        """Record one integration attempt. The only write this log performs."""
        path = self.path_for(outcome.req_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(outcome.model_dump(mode="json"), sort_keys=True)
        with path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(line + "\n")
        return outcome

    @traces(SWR.SWR_3409)
    def load(self, req_id: str) -> tuple[IntegrationOutcome, ...]:
        """Every recorded attempt, oldest first, degrading unreadable lines."""
        try:
            text = self.path_for(req_id).read_text(encoding="utf-8")
        except OSError:
            return ()
        found: list[IntegrationOutcome] = []
        for raw in text.splitlines():
            if not raw.strip():
                continue
            try:
                payload = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(payload, dict):
                continue
            try:
                found.append(IntegrationOutcome.model_validate(payload))
            except ValueError:
                continue
        return tuple(found)
