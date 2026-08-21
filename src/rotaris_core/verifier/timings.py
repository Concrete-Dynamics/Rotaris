"""What a check costs in this workspace, remembered between runs (SWR-2621).

`verifier.suite_timeout` and a check's own timeout are constants chosen without
knowing the project. A project that outgrows them has its suite killed on every
run — permanently, and with no signal separating "this project is slow" from
"this run hung". SWR-2606 makes the *consequence* honest, in that a killed run
now accuses no test; it cannot make the gate finish.

So the budget learns. A check that succeeded in 430 s is given room for 430 s
next time, without anybody editing a configuration file.

Three properties keep that from becoming a way to hide a hang:

- **Only a success is remembered.** A failed or killed run is not evidence of
  what the check costs — it is evidence of how long we were willing to wait — and
  feeding it back would let a budget ratchet upwards off its own timeouts.
- **The configured timeout is a floor, never a ceiling.** The memory can only
  grant more time than configuration asked for. A project that wants a hard cap
  states it and gets it, because a smaller learned number is never used.
- **The memory is keyed by command, not only by name.** A check whose command
  changed is a different measurement; inheriting the old number would budget a
  parallel run by the cost of the serial one it replaced.

The store is a small JSON file under the workspace's own state directory, and
every read is defensive: an unreadable or malformed memory is *no* memory, which
degrades exactly to the configured constants.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.verifier.runner import CheckResult
    from rotaris_core.verifier.suite import ResolvedCheck

__all__ = [
    "CheckTimings",
    "effective_check_timeout",
    "effective_suite_timeout",
]

_log = logging.getLogger(__name__)

#: How much room a check gets over what it last cost. Wide enough to absorb an
#: ordinary slow day — a loaded machine, a cold cache, a few new tests — and not
#: so wide that a genuine hang waits several times longer than it needs to.
HEADROOM = 2.0

#: Where the memory lives, under the workspace's own state directory.
TIMINGS_FILE = ".rotaris/verifier/check-timings.json"


def _key(check: ResolvedCheck) -> str:
    """A check's identity for the memory: its name *and* its command.

    Hashed rather than stored verbatim so a command carrying a path, a token or a
    machine-specific flag does not end up written into a file that travels.
    """
    digest = hashlib.sha256(check.command.encode("utf-8")).hexdigest()[:16]
    return f"{check.name}:{digest}"


@traces(SWR.SWR_2621)
class CheckTimings:
    """Last successful duration per check, for one workspace.

    Load, ask, record, save. Nothing here raises: a memory that cannot be read is
    an empty one, and a memory that cannot be written is a warning — a verifier
    that failed a run because it could not write a performance hint would be
    worse than one that simply forgets.
    """

    def __init__(self, durations: dict[str, float] | None = None) -> None:
        self._durations = dict(durations or {})

    @classmethod
    def load(cls, workspace_root: Path) -> CheckTimings:
        """Read the memory for *workspace_root*, or an empty one."""
        path = workspace_root / TIMINGS_FILE
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return cls()
        if not isinstance(payload, dict):
            return cls()
        durations = {
            str(key): float(value)
            for key, value in payload.items()
            if isinstance(value, (int, float)) and float(value) > 0
        }
        return cls(durations)

    def save(self, workspace_root: Path) -> None:
        """Persist the memory, best effort."""
        path = workspace_root / TIMINGS_FILE
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(
                json.dumps(self._durations, indent=2, sort_keys=True),
                encoding="utf-8",
            )
        except OSError:
            _log.warning("Could not record check timings under %s", path, exc_info=True)

    def duration_of(self, check: ResolvedCheck) -> float | None:
        """What *check* last cost when it succeeded, or ``None``."""
        return self._durations.get(_key(check))

    def record(self, check: ResolvedCheck, result: CheckResult) -> None:
        """Remember *result*'s duration, if it is worth remembering.

        Only a pass counts. A failure tells us how long the check ran before
        giving up and a timeout tells us only what the budget was, so neither is a
        measurement of what the check costs.
        """
        if str(result.status) != "passed" or result.duration_s <= 0:
            return
        self._durations[_key(check)] = round(float(result.duration_s), 3)

    def as_dict(self) -> dict[str, float]:
        """The memory as plain data, for a test or a report."""
        return dict(self._durations)


@traces(SWR.SWR_2621)
def effective_check_timeout(check: ResolvedCheck, timings: CheckTimings) -> int:
    """How long *check* may take, given what it has cost here before.

    The configured timeout is a floor: a workspace that raised it keeps the raise,
    and one that never touched it gets whatever its own history justifies.
    """
    last = timings.duration_of(check)
    if last is None:
        return check.timeout
    return max(check.timeout, int(last * HEADROOM) + 1)


@traces(SWR.SWR_2621)
def effective_suite_timeout(
    checks: list[ResolvedCheck],
    configured: int | None,
    timings: CheckTimings,
) -> int | None:
    """The whole run's budget, raised by exactly what learning added beneath it.

    Raising one check's ceiling achieves nothing if the suite budget still cuts
    the run off at the old number — each check's effective timeout is the lesser
    of its own and the budget remaining (SWR-2608) — so the two move together.

    They move by the *excess*, not to the sum. Growing the budget to the sum of
    the per-check timeouts would make ``suite_timeout`` meaningless: it would
    always be at least large enough for every check to run to its own limit, which
    is precisely the unbounded run SWR-2608 exists to prevent. With nothing
    learned the excess is zero and the configured budget stands untouched.

    ``None`` stays ``None``: a workspace that asked for no suite budget is not
    given one.
    """
    if configured is None:
        return None
    learned = sum(effective_check_timeout(check, timings) - check.timeout for check in checks)
    return configured + max(0, learned)
