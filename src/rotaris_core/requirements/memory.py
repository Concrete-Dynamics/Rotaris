"""What the requirement registry has to remember between processes (SWR-3119).

A removal is a *difference*: an id the last read saw and this one does not. That
makes it the one fact about a requirement store that cannot be computed from the
store as it stands — and until this module existed, nothing carried it across a
process boundary.

The consequence was larger than it sounds, and it is worth stating plainly
because it is why SWR-3509 had no production path rather than merely lacking a
caller. :class:`~rotaris_core.requirements.registry.RequirementRegistry` folds
tombstones by comparing its previous snapshot to the new read, and both the log
and the snapshot lived only in the instance. Every shipped construction passed
neither. So the first refresh of every process compared against nothing,
``observe`` saw no "was there, is not now", **and no tombstone was ever minted to
persist** — a `rotaris-cli` invocation could not detect a removal at all, and a
desktop session only between two refreshes of one sitting.

Two halves, and persisting only the first would have looked wired and observed
nothing:

- the **tombstone log**, through the existing
  :class:`~rotaris_core.requirements.tombstones.TombstoneStore`; and
- the **baseline** each source left behind, which is what makes the next
  comparison possible at all.

**The baseline is a value this codebase already had.**
:class:`~rotaris_core.requirements.change.detection.RequirementBaseline` is "the
requirement set the last evaluation of one source saw" — identity, hashes,
lifecycle and provenance, no title and no description (SWR-3114). Inventing a
second one beside it would have been two answers to one question, which is the
defect this epic keeps naming. It also already draws the distinction that decides
whether a first open is a catastrophe: :attr:`RequirementBaseline.evaluated`
separates "never evaluated" from "evaluated and held nothing", and without it the
first refresh in a fresh workspace would read as every requirement having just
been removed.

Written atomically, and unreadable state degrades to "remember nothing" with a
warning rather than refusing to open the board — losing the record is bad, and
being unable to look at the project because of it is worse. The cost of
forgetting is bounded and honest: one refresh with nothing to compare against,
after which the baseline is whole again.
"""

from __future__ import annotations

import json
import logging
import os
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.change.detection import RequirementBaseline
from rotaris_core.requirements.tombstones import (
    TombstoneLog,
    TombstoneStore,
    requirements_state_dir,
)
from rotaris_core.requirements.writeback import atomic_write_text

if TYPE_CHECKING:
    from collections.abc import Mapping
    from pathlib import Path

    from rotaris_core.requirements.writeback import Replacer

__all__ = ["BaselineStore", "RegistryMemory"]

_log = logging.getLogger(__name__)


@traces(SWR.SWR_3119, SWR.SWR_3114)
class BaselineStore:
    """The per-source baselines on disk, under ``<workspace>/.rotaris/requirements/``.

    One file, one object keyed by source id, so a workspace with three sources
    does not accumulate three files whose timestamps invite the question of which
    one is current. Each value is a
    :class:`~rotaris_core.requirements.change.detection.RequirementBaseline`
    dumped by Pydantic, so the persisted shape is the model's own and cannot
    drift from it.
    """

    FILENAME = "baselines.json"
    SCHEMA_VERSION = 1

    def __init__(self, workspace: Path, *, replace: Replacer = os.replace) -> None:
        self._workspace = workspace
        self._replace = replace

    @property
    def path(self) -> Path:
        """The file the baselines are kept in."""
        return requirements_state_dir(self._workspace) / self.FILENAME

    def load(self) -> dict[str, RequirementBaseline]:
        """The persisted baselines, or nothing when there is nothing readable.

        An empty answer is a *safe* answer: the next refresh has nothing to
        compare against, reports no removals, and leaves a whole baseline behind.
        A corrupt file must not be able to invent removals.
        """
        path = self.path
        if not path.is_file():
            return {}
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            sources = payload["sources"]
            return {
                source_id: RequirementBaseline.model_validate(record)
                for source_id, record in sources.items()
            }
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            _log.warning("Unreadable requirement baselines at %s; remembering nothing", path)
            return {}

    def save(self, baselines: Mapping[str, RequirementBaseline]) -> None:
        """Persist *baselines*, replacing whatever was there."""
        payload = {
            "schema_version": self.SCHEMA_VERSION,
            "sources": {
                source_id: baseline.model_dump(mode="json")
                for source_id, baseline in sorted(baselines.items())
            },
        }
        atomic_write_text(
            self.path,
            json.dumps(payload, indent=2, sort_keys=True) + "\n",
            replace=self._replace,
        )


@traces(SWR.SWR_3119, SWR.SWR_3113)
class RegistryMemory:
    """Both halves of what a registry carries across a restart, as one collaborator.

    One object rather than two arguments, because the two are only ever useful
    together: a log without a baseline records nothing new, and a baseline
    without a log re-reports the same removal on every refresh.

    Injected rather than constructed inside the registry, so a test can supply
    an in-memory pair and the registry keeps its stated property that
    construction reads nothing — :meth:`load` is called on the first refresh, not
    in ``__init__``.
    """

    def __init__(self, workspace: Path, *, replace: Replacer = os.replace) -> None:
        self._tombstones = TombstoneStore(workspace, replace=replace)
        self._baselines = BaselineStore(workspace, replace=replace)

    def load(self) -> tuple[TombstoneLog, dict[str, RequirementBaseline]]:
        """What the last process left behind."""
        return self._tombstones.load(), self._baselines.load()

    def save(
        self,
        log: TombstoneLog,
        baselines: Mapping[str, RequirementBaseline],
    ) -> None:
        """Leave this refresh behind for the next process.

        The baseline is written *after* the log. A crash between the two leaves a
        log that already names the removal and a baseline that still holds the id
        — so the next refresh observes the same removal, finds the tombstone
        already active, and skips it. The other order would lose the removal
        entirely.
        """
        self._tombstones.save(log)
        self._baselines.save(baselines)
