"""Read and write the ``initialization:`` section of a workspace ``agents.yaml``.

The workspace config file is ``<workspace>/.rotaris/agents.yaml`` — the same
file the desktop app and the startup-model editor write to. Every write here
round-trips the *whole* YAML payload so unrelated top-level keys (``rotaris:``,
``personas:``, model slots) survive untouched, and lands via
:func:`rotaris_core.fs.atomic_write` so a crash mid-write can never truncate the
user's configuration.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Literal

import yaml

from rotaris_core.config.bootstrap import write_minimal_agents_yaml
from rotaris_core.config.schema import InitializationState
from rotaris_core.config.startup_models import agents_yaml_path
from rotaris_core.fs import atomic_write
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

INITIALIZATION_SECTION_KEY = "initialization"
"""Top-level key of the initialization state in ``agents.yaml``."""

TaskOutcome = Literal["completed", "skipped"]
"""How an initialization task was resolved: it ran, or the user deferred it."""

__all__ = [
    "INITIALIZATION_SECTION_KEY",
    "InitializationState",
    "TaskOutcome",
    "mark_task",
    "read_initialization_state",
    "utc_now_iso",
    "write_initialization_state",
]


def utc_now_iso() -> str:
    """Return the current UTC time as an ISO-8601 string for ``last_run``."""
    return datetime.now(UTC).isoformat()


@traces(SWR.SWR_2802, SWR.SWR_2806)
def read_initialization_state(workspace_root: Path) -> InitializationState:
    """Return the recorded initialization state for *workspace_root*.

    A missing file, a missing ``initialization:`` key, and a bare
    ``initialization:`` (which YAML parses as ``None``) all yield a default
    :class:`~rotaris_core.config.schema.InitializationState`, whose
    ``never_initialized`` property is then ``True``.
    """
    raw = _load_agents_yaml(agents_yaml_path(workspace_root))
    section = raw.get(INITIALIZATION_SECTION_KEY)
    if not isinstance(section, dict):
        return InitializationState()
    return InitializationState.model_validate(section)


@traces(SWR.SWR_2802, SWR.SWR_2806)
def write_initialization_state(workspace_root: Path, state: InitializationState) -> None:
    """Persist *state* into the workspace ``agents.yaml``, atomically.

    Bootstraps a minimal ``agents.yaml`` when the workspace has none. All other
    top-level keys in an existing file are preserved verbatim.
    """
    path = agents_yaml_path(workspace_root)
    if not path.exists():
        write_minimal_agents_yaml(path)

    data = _load_agents_yaml(path)
    data[INITIALIZATION_SECTION_KEY] = state.model_dump(mode="json", exclude_none=True)
    _atomic_write_yaml(path, data)


@traces(SWR.SWR_2802, SWR.SWR_2804, SWR.SWR_2806)
def mark_task(
    workspace_root: Path,
    task: str,
    *,
    outcome: TaskOutcome,
    classification: str | None = None,
) -> InitializationState:
    """Record *task* as completed or skipped and return the updated state.

    The task is moved rather than duplicated: re-running a previously skipped
    task drops it from ``skipped`` as it enters ``completed``. ``last_run`` is
    always stamped, which is what takes the workspace out of the
    "never initialized" state. ``classification`` (``'code'`` / ``'non-code'``,
    SWR-2804) overwrites the recorded value when given; passing ``None`` keeps
    whatever was recorded before.
    """
    current = read_initialization_state(workspace_root)

    completed = [entry for entry in current.completed if entry != task]
    skipped = [entry for entry in current.skipped if entry != task]
    if outcome == "completed":
        completed.append(task)
    else:
        skipped.append(task)

    updated = InitializationState(
        completed=completed,
        skipped=skipped,
        last_run=utc_now_iso(),
        classification=current.classification if classification is None else classification,
    )
    write_initialization_state(workspace_root, updated)
    return updated


def _load_agents_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}

    try:
        with path.open("r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle)
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid YAML in {path}: {exc}") from exc

    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ValueError(f"Invalid YAML in {path}: top-level content must be a mapping")
    return data


def _atomic_write_yaml(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write(path, yaml.safe_dump(data, sort_keys=False, allow_unicode=True))
