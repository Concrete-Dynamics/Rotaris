"""The planned worklist, kept until somebody decides about it (SWR-3518).

SWR-3507 says the worklist "is presented before execution". Presented to a person
means produced by one read, looked at, and acted on afterwards — after a pause,
often in another process. Nothing carried it that far.

A board read plans a migration and files an
:class:`~rotaris_core.requirements.change.records.AnalysisRecord`, which flattens
the worklist into one prose line per row. Nothing reads it back. So
``MigrationPlan.digest`` — the value an approval signs, and the value
``ApprovedMigration`` re-checks to refuse a plan that changed underneath — cannot
be re-derived once the read that produced it has ended. Re-planning instead is a
model call *and* a different answer, which would invalidate the user's own
approval against a worklist they never saw.

**Two artefacts, two questions.** The analysis record says what was concluded,
when, by which persona and model; it is history and it is append-only. This store
holds one thing: the worklist currently awaiting a decision. The pass's existing
digest de-duplication keeps them in step — a plan is re-made only when the sites
it addresses actually moved, and that same movement replaces what is stored here.

Shaped like :class:`~rotaris_core.requirements.execution.store.UnitStore`, and
for the same reasons: one file per requirement, written whole and atomically, and
**reading never raises**. A requirement whose plan file this build cannot parse
has nothing pending — which is the same answer as a requirement that was never
planned, and a great deal better than a board that will not open.

No requirement text is persisted. The plan carries site addresses, actions,
targets and the analyst's argument *about* the requirements — never their prose,
which is read from the source (SWR-3114) and checked here rather than promised.
"""

from __future__ import annotations

import json
import os
from typing import TYPE_CHECKING

from pydantic import JsonValue, ValidationError

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.change.superseding import (
    ApprovedMigration,
    MigrationApproval,
    MigrationApprovalError,
    MigrationPlan,
)
from rotaris_core.requirements.delivery.store import (
    assert_no_requirement_content,
    record_filename,
)
from rotaris_core.requirements.tombstones import requirements_state_dir
from rotaris_core.requirements.writeback import atomic_write_text

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.requirements.writeback import Replacer

__all__ = ["MIGRATION_STORE_SCHEMA_VERSION", "MIGRATION_STORE_SUBDIRNAME", "MigrationPlanStore"]

#: Directory under ``<workspace>/.rotaris/requirements/`` holding planned worklists.
MIGRATION_STORE_SUBDIRNAME = "migrations"

MIGRATION_STORE_SCHEMA_VERSION = 1


@traces(SWR.SWR_3518, SWR.SWR_3507)
class MigrationPlanStore:
    """One requirement's pending migration worklist on disk."""

    def __init__(self, workspace: Path, *, replace: Replacer = os.replace) -> None:
        self._workspace = workspace
        self._replace = replace

    @property
    def directory(self) -> Path:
        """``<workspace>/.rotaris/requirements/migrations/``."""
        return requirements_state_dir(self._workspace) / MIGRATION_STORE_SUBDIRNAME

    def path_for(self, req_id: str) -> Path:
        """The file *req_id*'s pending plan lives in."""
        return self.directory / record_filename(req_id)

    @traces(SWR.SWR_3518)
    def save(self, plan: MigrationPlan) -> Path:
        """Persist *plan*, replacing whatever was pending for that requirement.

        Filed under the requirement the plan is *about* — the superseding id, or
        the removed one when there is no superseder — which is the same key the
        analysis record uses, so the two are found together.
        """
        return self._write(plan, approval=None)

    @traces(SWR.SWR_3518, SWR.SWR_3507)
    def approve(self, approved: ApprovedMigration) -> Path:
        """Replace the pending plan with the same plan, signed.

        One artefact, whose state is readable rather than inferred: a migration is
        either waiting for a decision or carrying one, and both readings come from
        the same file. Keeping the approval somewhere else would let a worklist be
        executed against a signature for a different one.
        """
        return self._write(approved.plan, approval=approved)

    def _write(self, plan: MigrationPlan, *, approval: ApprovedMigration | None) -> Path:
        payload: dict[str, JsonValue] = {
            "schema_version": MIGRATION_STORE_SCHEMA_VERSION,
            "req_id": _key_of(plan),
            "digest": plan.digest,
            "plan": plan.model_dump(mode="json"),
            "approval": (
                approval.approval.model_dump(mode="json") if approval is not None else None
            ),
        }
        assert_no_requirement_content(payload, where=f"migration plan {_key_of(plan)}")
        path = self.path_for(_key_of(plan))
        atomic_write_text(
            path,
            json.dumps(payload, indent=2, sort_keys=True) + "\n",
            replace=self._replace,
        )
        return path

    @traces(SWR.SWR_3518, SWR.SWR_3507)
    def load_approved(self, req_id: str) -> ApprovedMigration | None:
        """*req_id*'s approved migration, or ``None`` while it is still only planned.

        The approval is re-validated against the plan it is stored beside rather
        than trusted, so a file edited apart cannot produce a signature for a
        worklist nobody signed — ``ApprovedMigration`` refuses a digest that does
        not match, and that refusal is the point of asking it again here.
        """
        plan = self.load(req_id)
        if plan is None:
            return None
        payload = self._payload(req_id)
        signature = payload.get("approval") if payload is not None else None
        if not isinstance(signature, dict):
            return None
        try:
            return ApprovedMigration(
                plan=plan,
                approval=MigrationApproval.model_validate(signature),
            )
        except (ValidationError, MigrationApprovalError):
            return None

    @traces(SWR.SWR_3518)
    def load(self, req_id: str) -> MigrationPlan | None:
        """*req_id*'s pending plan, or ``None`` when there is nothing readable.

        Every failure answers ``None``: an absent file, an unreadable one, a
        payload from a newer build, one that does not parse back into a plan. A
        requirement with no pending worklist and a requirement whose worklist this
        build cannot read are the same thing to a caller — there is nothing to
        approve — and only one of them is worth failing a board over, which is
        neither.
        """
        payload = self._payload(req_id)
        if payload is None:
            return None
        try:
            plan = MigrationPlan.model_validate(payload.get("plan"))
        except ValidationError:
            return None
        # The digest travels beside the plan and is recomputed on load rather
        # than trusted: a stored digest that disagrees with the plan it labels
        # would let an approval sign one worklist and execute another.
        if payload.get("digest") != plan.digest:
            return None
        return plan

    def _payload(self, req_id: str) -> dict[str, JsonValue] | None:
        """*req_id*'s stored record, or ``None`` when there is nothing readable."""
        try:
            raw = self.path_for(req_id).read_text(encoding="utf-8")
        except OSError:
            return None
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(payload, dict) or payload.get("req_id") != req_id:
            return None
        version = payload.get("schema_version")
        if isinstance(version, int) and version > MIGRATION_STORE_SCHEMA_VERSION:
            return None
        return payload

    @traces(SWR.SWR_3518)
    def discard(self, req_id: str) -> None:
        """Forget *req_id*'s pending plan, once it has been approved or replaced."""
        try:
            self.path_for(req_id).unlink()
        except OSError:
            return

    def pending(self) -> tuple[str, ...]:
        """Every requirement with a plan waiting, in id order."""
        directory = self.directory
        if not directory.is_dir():
            return ()
        found: list[str] = []
        for path in sorted(directory.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            req_id = payload.get("req_id") if isinstance(payload, dict) else None
            if isinstance(req_id, str) and req_id:
                found.append(req_id)
        return tuple(found)


def _key_of(plan: MigrationPlan) -> str:
    """The requirement a plan is filed under — the superseder, or the removed id."""
    return plan.request.superseding_id or plan.request.superseded_ids[0]
