"""The one path that writes a workspace's quality gate (SWR-2614).

Detection, deterministic in-run repair (SWR-2616), greenfield authoring
(SWR-2615) and an approved improvement proposal (SWR-2617) all change the gate
for different reasons and by different routes. They reach the file through here,
so the same constraints and the same audit trail hold whoever initiated the
change.

Two properties make that worth insisting on:

**The authority rule is structural, not advisory.** :func:`authorize_gate_write`
refuses to weaken a gate, and it is the same function whether a persona, a repair
loop, or a detection sweep asked. A rule enforced in a prompt is a rule the
prompt's author can lose; this one is enforced where the write happens, and the
tool a persona holds calls it before it calls anything else.

  Automatic:  adding a check; replacing a command inside the same role at the
              same severity — a probed equivalent for one that stopped resolving.
  Refused:    removing a role's only check; lowering a check from ``blocking`` to
              ``advisory``; emptying the suite.

  Everything refused is not forbidden — it is *routed*, to an approval-gated
  proposal (SWR-2617). That is what makes the automatic paths safe to trust.

**A write replaces the ``verifier:`` section and nothing else.** The whole YAML
document is round-tripped, so models, personas, MCP servers and their comments
survive untouched, and it lands through :func:`~rotaris_core.fs.atomic_write` so
an interrupted write cannot leave a workspace half-configured. Git is the audit
trail; where git does not track the file, a ``.rotaris/agents.yaml.bak`` copy is
written first, so an unversioned workspace still has a way back.

One thing deliberately does **not** come through here: SWR-2613's demotion of a
check that collects nothing. That is a probe verdict recorded in
``.rotaris/verifier.state.json``, not an edit to the user's suite — it expires
with the fingerprint and is promoted back by the next probe that finds work.
Routing it through the authority rule would read as the gatekeeper lowering a
severity, which is exactly the thing the rule forbids.
"""

from __future__ import annotations

import logging
import os
import subprocess
from typing import TYPE_CHECKING, Any, NamedTuple

import yaml

from rotaris_core.config.schema import CheckConfig
from rotaris_core.fs import atomic_write
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

_log = logging.getLogger(__name__)

__all__ = [
    "VERIFIER_SECTION_KEY",
    "GateAuthority",
    "GateWrite",
    "authorize_gate_write",
    "read_verifier_section",
    "write_verifier_section",
]

VERIFIER_SECTION_KEY = "verifier"
"""Top-level key of the gate in ``<workspace>/.rotaris/agents.yaml``."""

#: How long git is given to answer whether it tracks a file. Short: the answer is
#: a convenience and the fallback is safe.
_GIT_TIMEOUT_S = 5.0


@traces(SWR.SWR_2614)
class GateAuthority(NamedTuple):
    """Whether a proposed gate may be written automatically, and why not."""

    allowed: bool
    #: The single sentence a refusal is reported and proposed with.
    reason: str = ""

    @property
    def needs_approval(self) -> bool:
        """Whether this change has to become an approval-gated proposal (SWR-2617)."""
        return not self.allowed


@traces(SWR.SWR_2614)
class GateWrite(NamedTuple):
    """What one attempted write did, or refused to do."""

    written: bool
    before: tuple[CheckConfig, ...] = ()
    after: tuple[CheckConfig, ...] = ()
    #: Where the backup went, when git does not track the configuration.
    backup: str = ""
    #: Why the gate changed. Travels onto the timeline event and the report.
    reason: str = ""
    #: Set when nothing was written: the authority refusal, or the I/O error.
    refusal: str = ""

    def describe(self) -> str:
        """One line, in the words a user is shown."""
        if not self.written:
            return f"the gate was not changed: {self.refusal}"
        names = ", ".join(check.name for check in self.after) or "nothing"
        return f"the gate is now {names} — {self.reason}"


def _bucket(check: CheckConfig) -> str:
    """The slot a check occupies for the purpose of "is this the only one".

    A stated role is the slot. A check that states none is its own slot, keyed by
    name: a hand-written suite is stating exactly what it wants run, and treating
    two unrelated unstated checks as interchangeable would let one silently
    replace the other.
    """
    return check.role or f"name:{check.name}"


@traces(SWR.SWR_2614)
def authorize_gate_write(
    current: Sequence[CheckConfig],
    proposed: Sequence[CheckConfig],
) -> GateAuthority:
    """Whether *proposed* may replace *current* without a person approving it.

    The whole automatic authority, in one function, because a second copy of it
    would be a second answer. Called by the persona's write tool before anything
    else, by the deterministic repair path, and by the improvement executor — so
    a refusal is the same refusal however the change arrived.

    A workspace that currently has no gate is unconstrained: there is nothing to
    weaken, and refusing to author a first gate would make SWR-2615 impossible.
    """
    if not current:
        return GateAuthority(allowed=True)

    if not proposed:
        return GateAuthority(
            allowed=False,
            reason=(
                "emptying the check suite is outside the automatic write path's "
                "authority: it is how a workspace stops being verified, and that "
                "has to be a decision somebody makes"
            ),
        )

    proposed_by_bucket: dict[str, list[CheckConfig]] = {}
    for check in proposed:
        proposed_by_bucket.setdefault(_bucket(check), []).append(check)

    for check in current:
        slot = _bucket(check)
        replacements = proposed_by_bucket.get(slot, [])
        if not replacements:
            what = check.role or check.name
            return GateAuthority(
                allowed=False,
                reason=(
                    f"removing the only {what!r} check is outside the automatic "
                    "write path's authority: nothing would verify that role, and "
                    "a gate quietly losing a role is indistinguishable from one "
                    "that never had it"
                ),
            )
        if check.severity == "blocking" and not any(
            replacement.severity == "blocking" for replacement in replacements
        ):
            return GateAuthority(
                allowed=False,
                reason=(
                    f"lowering {check.name!r} from blocking to advisory is outside "
                    "the automatic write path's authority: an advisory check is "
                    "reported and never gates, so this turns a gate off without "
                    "removing it"
                ),
            )

    return GateAuthority(allowed=True)


@traces(SWR.SWR_2614)
def read_verifier_section(workspace_root: Path) -> tuple[CheckConfig, ...] | None:
    """The gate as configured, or ``None`` when the workspace states none.

    ``None`` and ``()`` are different answers and stay different all the way
    down: unset means *detect a suite*, and an explicit empty list means *this
    workspace runs no verification* (SWR-2601).
    """
    raw = _load(_config_path(workspace_root))
    section = raw.get(VERIFIER_SECTION_KEY)
    if not isinstance(section, dict):
        return None
    checks = section.get("checks")
    if checks is None:
        return None
    if not isinstance(checks, list):
        return None
    parsed: list[CheckConfig] = []
    for entry in checks:
        if not isinstance(entry, dict):
            continue
        try:
            parsed.append(CheckConfig.model_validate(entry))
        except ValueError:
            _log.warning("Ignoring an unreadable check in %s", _config_path(workspace_root))
    return tuple(parsed)


@traces(SWR.SWR_2614)
def write_verifier_section(
    workspace_root: Path,
    checks: Sequence[CheckConfig],
    *,
    reason: str,
    authorize: bool = True,
) -> GateWrite:
    """Replace ``verifier.checks`` with *checks*, and nothing else in the file.

    Refuses anything that would weaken the gate unless *authorize* is ``False``,
    which is reserved for the one caller that has already obtained a person's
    approval (SWR-2617). The refusal is returned, never raised: every caller here
    turns it into a proposal or a report, and an exception would only make that
    harder.

    Never raises on I/O either. A workspace that cannot be written keeps the gate
    it had, which is the invariant the whole lane rests on.
    """
    before = read_verifier_section(workspace_root) or ()
    proposed = tuple(checks)

    if authorize:
        authority = authorize_gate_write(before, proposed)
        if not authority.allowed:
            return GateWrite(written=False, before=before, refusal=authority.reason)

    path = _config_path(workspace_root)
    backup = ""
    try:
        if not path.exists():
            from rotaris_core.config.bootstrap import write_minimal_agents_yaml  # noqa: PLC0415

            path.parent.mkdir(parents=True, exist_ok=True)
            write_minimal_agents_yaml(path)
        elif not _tracked_by_git(path):
            # Git is the audit trail everywhere else. Where there is none, a copy
            # is the difference between "your gate changed" and "your gate changed
            # and you cannot see what it was".
            backup = _write_backup(path)

        document = _load(path)
        section = document.get(VERIFIER_SECTION_KEY)
        if not isinstance(section, dict):
            section = {}
        section["checks"] = [
            check.model_dump(mode="json", exclude_none=True, exclude_defaults=False)
            for check in proposed
        ]
        document[VERIFIER_SECTION_KEY] = section
        atomic_write(path, yaml.safe_dump(document, sort_keys=False, allow_unicode=True))
    except (OSError, ValueError) as error:
        _log.warning("Could not write the gate to %s: %s", path, error)
        return GateWrite(
            written=False,
            before=before,
            refusal=f"the configuration could not be written ({error})",
        )

    return GateWrite(
        written=True,
        before=before,
        after=proposed,
        backup=backup,
        reason=reason,
    )


def _config_path(workspace_root: Path) -> Path:
    from rotaris_core.config.startup_models import agents_yaml_path  # noqa: PLC0415

    return agents_yaml_path(workspace_root)


def _load(path: Path) -> dict[str, Any]:
    """The whole YAML document, so everything outside ``verifier:`` survives."""
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle)
    except (OSError, yaml.YAMLError) as error:
        raise ValueError(f"invalid YAML in {path}: {error}") from error
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ValueError(f"invalid YAML in {path}: top-level content must be a mapping")
    return data


def _write_backup(path: Path) -> str:
    backup = path.with_suffix(path.suffix + ".bak")
    backup.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    return str(backup)


def _tracked_by_git(path: Path) -> bool:
    """Whether git has this file, so a change to it is already recoverable.

    Degrades toward ``False`` — write the backup — for every uncertainty: no git,
    a slow git, a workspace that is not a repository. The cost of a needless
    backup is one file; the cost of a missing one is a gate nobody can restore.
    """
    environment = dict(os.environ)
    environment["GIT_OPTIONAL_LOCKS"] = "0"
    try:
        result = subprocess.run(  # noqa: S603
            ["git", "ls-files", "--error-unmatch", "--", path.name],  # noqa: S607
            cwd=path.parent,
            capture_output=True,
            text=True,
            timeout=_GIT_TIMEOUT_S,
            env=environment,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0
