"""Fixtures for the one test that spends money (SWR-1828, SWR-2454).

Everything else in this suite fakes the provider, which is the right trade for
6000 tests and the wrong one for the question this directory exists to answer:
*does a real model, with real latency and real non-determinism, actually drive a
Rotaris run end to end?* A faked provider answers every prompt the way the test
author expected it to be answered, so no amount of it can catch a prompt the
model reads differently, a tool schema it declines to fill in, or a delegation
it silently refuses to make.

So this suite is real, and therefore it is opt-in twice over:

1. **It must be asked for by name.** Selecting `tests/live`, passing `-m live`
   or matching `live` with `-k` counts; being swept up by `pytest` or by
   `testpaths` does not. Without that, every test here is skipped at collection.
2. **A key must be readable**, from the environment or from `.env.live` at the
   repository root (gitignored; `.env.live.example` is the template).

A key that is present but rejected is a *failure*, not a skip. Unreachable is
different from unauthorized: the first is the network's fault and the second is
ours, and a suite that skips on both tells you nothing on the day it matters.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING

import pytest
import yaml

if TYPE_CHECKING:
    from collections.abc import Iterator

    from rotaris_core.config.schema import RotarisConfig

#: Where `.env.live` lives: the repository root, four levels up from this file.
_REPO_ROOT = Path(__file__).resolve().parents[2]
_ENV_FILE = _REPO_ROOT / ".env.live"

#: The environment variable the model config points at.
API_KEY_VAR = "DEEPSEEK_API_KEY"

#: The provider id (SWR-750) and the model every persona in the run uses.
#: One model for all of them on purpose — the run is a delegation and a file
#: read, so a tiered setup would only add ways for the test to fail that have
#: nothing to do with what it is asking.
PROVIDER_ID = "deepseek"
MODEL_ID = os.environ.get("ROTARIS_LIVE_MODEL_ID", "deepseek-v4-flash")

#: What the config calls the single model. Deliberately not the model id: the
#: assertions are about *a* live model, and naming the entry after its tier
#: keeps a later provider swap to one line of YAML.
MODEL_NAME = "live-flash"


def _read_env_file(path: Path) -> dict[str, str]:
    """Parse `KEY=value` lines. Blank lines and `#` comments are ignored.

    Deliberately not python-dotenv: a five-line parser is cheaper than a
    dependency the shipped package would then carry for a test.
    """
    if not path.is_file():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip("\"'")
    return values


def _resolve_api_key() -> str:
    """The key, from the environment first so CI can pass one without a file."""
    from_env = os.environ.get(API_KEY_VAR, "").strip()
    if from_env:
        return from_env
    return _read_env_file(_ENV_FILE).get(API_KEY_VAR, "").strip()


def _explicitly_selected(config: pytest.Config, live_dir: Path) -> bool:
    """Whether this run *asked* for the live suite, rather than swept it up."""
    markexpr = (config.getoption("markexpr") or "").strip()
    if "live" in markexpr:
        return True

    keyword = (config.getoption("keyword") or "").lower()
    if "live" in keyword:
        return True

    # `testpaths` supplies `tests` when nothing is named, which is exactly the
    # case that must not count. Only an argument naming this directory does.
    return any(
        "live" in str(argument) or str(live_dir) in str(argument) for argument in config.args
    )


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    live_dir = Path(__file__).parent
    live_items = [
        item for item in items if item.path is not None and item.path.is_relative_to(live_dir)
    ]
    if not live_items:
        return

    for item in live_items:
        item.add_marker(pytest.mark.live)

    if not _explicitly_selected(config, live_dir):
        skip = pytest.mark.skip(
            reason="Live provider test: select it by name (`pytest tests/live -m live`).",
        )
        for item in live_items:
            item.add_marker(skip)
        return

    if not _resolve_api_key():
        skip = pytest.mark.skip(
            reason=(
                f"No {API_KEY_VAR}: set it in the environment or in "
                f"{_ENV_FILE.name} (see {_ENV_FILE.name}.example)."
            ),
        )
        for item in live_items:
            item.add_marker(skip)


@pytest.fixture
def live_api_key(monkeypatch: pytest.MonkeyPatch) -> str:
    """Put the key in the environment, where the loader's `api_key_env` reads it."""
    key = _resolve_api_key()
    if not key:  # pragma: no cover - collection already skipped this case
        pytest.skip(f"No {API_KEY_VAR} available.")
    monkeypatch.setenv(API_KEY_VAR, key)
    return key


@pytest.fixture
def live_workspace(tmp_path: Path) -> Path:
    """A throwaway workspace, because the run is autonomous and unattended.

    Not the checkout: an `autonomous` permission mode is what lets the
    orchestrator delegate without an approval UI to answer it (SWR-2504), and
    handing that to a live model pointed at real source would make this test a
    risk rather than a check.
    """
    workspace = tmp_path / "workspace"
    (workspace / ".rotaris" / "sessions").mkdir(parents=True)
    return workspace


@pytest.fixture
def live_config(
    live_api_key: str,
    live_workspace: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[RotarisConfig]:
    """The run's real config, built by the real loader from a real `agents.yaml`.

    Written as YAML and loaded rather than assembled in Python, so the live run
    exercises the same merge, alias resolution and validation a user's workspace
    gets. The developer's own `~/.config/rotaris/` is pointed elsewhere for the
    duration: whether they happen to have logged into a provider must not change
    which models this run uses.
    """
    del live_api_key  # Ordering only: the key has to be set before the loader reads it.

    from rotaris_core.config import loader
    from rotaris_core.config.validation import validate_config
    from rotaris_core.providers.catalog import get_provider

    global_dir = tmp_path / "global-config"
    global_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    monkeypatch.setattr("rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR", global_dir)

    agents_yaml = {
        "default_persona": "orchestrator",
        # One model in every slot. `_resolve_model_aliases` pushes these three
        # into every persona that names a tier, which is all of them.
        "small_model": MODEL_NAME,
        "medium_model": MODEL_NAME,
        "large_model": MODEL_NAME,
        "fallback_model": MODEL_NAME,
        "default_summary_model": MODEL_NAME,
        "improvement_collector_model": MODEL_NAME,
        "gatekeeper_model": MODEL_NAME,
        "models": {
            MODEL_NAME: {
                "provider": PROVIDER_ID,
                "model_id": MODEL_ID,
                "api_key_env": API_KEY_VAR,
                "base_url": get_provider(PROVIDER_ID).default_base_url,
            },
        },
        "personas": {
            # Both entries are field merges over the shipped personas
            # (`_merge_named_entries`), so each keeps its own prompt, purpose
            # and tool policy. Only what would make this run slow, expensive or
            # non-deterministic is overridden.
            "orchestrator": {
                # No `read_file`, no `terminal`, no `write_file`: the one thing
                # this test asks is whether the orchestrator *delegates*, and a
                # coordinator that can read the file itself may reasonably
                # decide not to. Leaving it only `delegate` and `todo` makes the
                # assertion about the model's behaviour rather than about which
                # shortcut it happened to take.
                "tools": ["delegate", "todo"],
                "delegates_to": ["codebase-analyst"],
                "mcp_servers": [],
                "mcp_tools": {},
            },
            "codebase-analyst": {
                # Serena and the git server would each cost a `uvx` cold start
                # to answer a question `read_file` answers.
                "mcp_servers": [],
                "mcp_tools": {},
            },
        },
        "runtime": {
            # An unattended run has no approval UI, so anything that resolves to
            # `ask` resolves to deny (SWR-2504) — including `delegate`, which
            # would leave the orchestrator unable to do the one thing it is
            # here to do. Safe because the workspace is a throwaway directory
            # and the two personas in play hold no mutating tools between them.
            "permission_mode": "autonomous",
            "allow_unsandboxed_autonomous": True,
            "max_iterations": 3,
            "max_children": 2,
            "max_depth": 2,
            "child_timeout": 300,
            "model_timeout": 180,
            # A second live model call to analyse a run this short would double
            # the test's cost to tell us nothing.
            "improvement_collector_enabled": False,
        },
        # Explicitly empty, not unset: an unset suite is auto-detected from
        # workspace markers, and a temporary directory with one Markdown file in
        # it should not be probed for a test runner.
        "verifier": {"checks": [], "gate_completion": False},
        # The workspace is not a git repository.
        "checkpoints": {"enabled": False},
    }
    config_path = live_workspace / ".rotaris" / "agents.yaml"
    config_path.write_text(yaml.safe_dump(agents_yaml, sort_keys=False), encoding="utf-8")

    config = loader.load_config(live_workspace)

    errors = validate_config(config)
    assert not errors, "The live run's own config is invalid:\n" + "\n".join(errors)

    yield config
