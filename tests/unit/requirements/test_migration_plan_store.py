"""The planned worklist, kept until somebody decides about it (SWR-3518).

The defect these cover: a plan produced by a board read was unrecoverable, so the
digest an approval signs could not be re-derived once that read had ended. Every
case here either crosses that boundary or says what happens when what is on the
far side is unusable — because a store that can invent a worklist is worse than
one that has none.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.migration_store import (
    MIGRATION_STORE_SCHEMA_VERSION,
    MigrationPlanStore,
)
from rotaris_core.requirements.change.superseding import (
    MigrationAction,
    MigrationEntry,
    MigrationInventory,
    MigrationPlan,
    MigrationRequest,
    MigrationSite,
    MigrationWorklist,
    SiteKind,
)

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

AT = dt.datetime(2026, 8, 16, 9, 0, tzinfo=dt.UTC)
NEW = "SWR-601"
OLD = "SWR-501"
PERSONA = "requirements-engineer"
MODEL = "test-model"


def sites() -> tuple[MigrationSite, ...]:
    return (
        MigrationSite(req_id=OLD, path="src/pkg/pay.py", line=4, kind=SiteKind.TRACE),
        MigrationSite(req_id=OLD, path="tests/test_pay.py", line=1, kind=SiteKind.TEST),
    )


def plan(*, action: MigrationAction = MigrationAction.RE_POINT) -> MigrationPlan:
    inventory = MigrationInventory(sites=sites())
    return MigrationPlan(
        request=MigrationRequest(
            superseding_id=NEW,
            superseded_ids=(OLD,),
            inventory=inventory,
        ),
        worklist=MigrationWorklist(
            entries=tuple(
                MigrationEntry(
                    site=site,
                    action=action,
                    reasoning="the behaviour moved to the replacement",
                    target=NEW,
                    decided_by=f"{PERSONA} ({MODEL})",
                )
                for site in inventory.sites
            ),
        ),
        at=AT,
        persona=PERSONA,
        model=MODEL,
    )


@verifies(SWR.SWR_3518)
def test_a_plan_written_by_one_process_is_loaded_by_another(tmp_path: Path) -> None:
    """Productive use: a user reads a worklist, closes Rotaris, and approves it tomorrow.
    Expected outcome: the same plan comes back, digest-identical — which is what lets the
    approval bind to the worklist that was actually shown."""
    original = plan()
    MigrationPlanStore(tmp_path).save(original)

    loaded = MigrationPlanStore(tmp_path).load(NEW)

    assert loaded is not None
    assert loaded.digest == original.digest
    assert [entry.key for entry in loaded.entries] == [entry.key for entry in original.entries]
    assert [entry.action for entry in loaded.entries] == [
        entry.action for entry in original.entries
    ]
    assert loaded.ready_for_approval is True


@verifies(SWR.SWR_3518, SWR.SWR_3114)
def test_the_persisted_plan_carries_no_requirement_text(tmp_path: Path) -> None:
    """Productive use: requirement prose stays in the project's own files.
    Expected outcome: what Rotaris keeps pending is addresses, actions and an argument
    about the requirements — never a second copy of them."""
    store = MigrationPlanStore(tmp_path)
    store.save(plan())

    written = store.path_for(NEW).read_text(encoding="utf-8")

    assert '"title"' not in written
    assert '"description"' not in written
    assert "src/pkg/pay.py" in written
    assert "re-point" in written


@verifies(SWR.SWR_3518)
def test_nothing_pending_and_nothing_readable_answer_the_same(tmp_path: Path) -> None:
    """Productive use: a plan file is truncated by a crash or a bad merge.
    Expected outcome: "nothing to approve" — the one answer a corrupt file must never be
    able to turn into "here is a worklist, apply it"."""
    store = MigrationPlanStore(tmp_path)

    assert store.load(NEW) is None, "a requirement that was never planned"

    store.path_for(NEW).parent.mkdir(parents=True, exist_ok=True)
    store.path_for(NEW).write_text("{ not json", encoding="utf-8")
    assert store.load(NEW) is None

    store.path_for(NEW).write_text(
        '{"req_id": "SWR-601", "plan": {"nonsense": 1}}', encoding="utf-8"
    )
    assert store.load(NEW) is None


@verifies(SWR.SWR_3518)
def test_a_payload_from_a_newer_build_is_not_guessed_at(tmp_path: Path) -> None:
    """Productive use: a workspace is opened by an older Rotaris than wrote its state.
    Expected outcome: nothing pending. Reading a shape this build does not know would be
    approving a worklist it cannot see all of."""
    store = MigrationPlanStore(tmp_path)
    store.save(plan())
    raw = store.path_for(NEW).read_text(encoding="utf-8")
    store.path_for(NEW).write_text(
        raw.replace(
            f'"schema_version": {MIGRATION_STORE_SCHEMA_VERSION}',
            f'"schema_version": {MIGRATION_STORE_SCHEMA_VERSION + 1}',
        ),
        encoding="utf-8",
    )

    assert store.load(NEW) is None


@verifies(SWR.SWR_3518)
def test_a_digest_that_disagrees_with_its_plan_is_refused(tmp_path: Path) -> None:
    """Productive use: the stored digest and the stored worklist are edited apart.
    Expected outcome: refused. A digest that labels a different worklist would let an
    approval sign one thing and execute another — the single failure this file guards."""
    store = MigrationPlanStore(tmp_path)
    store.save(plan())
    raw = store.path_for(NEW).read_text(encoding="utf-8")
    store.path_for(NEW).write_text(raw.replace(plan().digest, "0" * 16), encoding="utf-8")

    assert store.load(NEW) is None


@verifies(SWR.SWR_3518)
def test_a_plan_is_forgotten_once_it_is_decided(tmp_path: Path) -> None:
    """Productive use: an approved migration must not offer itself again on the next read.
    Expected outcome: discarding leaves nothing pending, and discarding twice is not an error."""
    store = MigrationPlanStore(tmp_path)
    store.save(plan())
    assert store.pending() == (NEW,)

    store.discard(NEW)
    store.discard(NEW)

    assert store.load(NEW) is None
    assert store.pending() == ()


# -- the approval rides on the same artefact -------------------------------


@verifies(SWR.SWR_3518, SWR.SWR_3507)
def test_an_approval_is_stored_beside_the_worklist_it_signs(tmp_path: Path) -> None:
    """Productive use: a named person approves a worklist, and the run that carries it out
    happens later, in another process.
    Expected outcome: one artefact whose state is readable — planned, then signed — so the
    work that runs is the work that was signed and not a worklist stored somewhere else."""
    from rotaris_core.requirements.change.superseding import approve_migration
    from rotaris_core.requirements.delivery.state import DeliveryActor

    store = MigrationPlanStore(tmp_path)
    store.save(plan())
    assert store.load_approved(NEW) is None, "planned is not approved"

    approved = approve_migration(plan(), approver=DeliveryActor.user("ada"), at=AT)
    store.approve(approved)

    reloaded = MigrationPlanStore(tmp_path).load_approved(NEW)
    assert reloaded is not None
    assert reloaded.approval.approver.name == "ada"
    assert reloaded.plan.digest == plan().digest
    assert [operation.site.key for operation in reloaded.operations]


@verifies(SWR.SWR_3518)
def test_a_signature_for_a_different_worklist_is_refused(tmp_path: Path) -> None:
    """Productive use: the stored plan and its approval are edited apart.
    Expected outcome: no approved migration comes back. A signature over one worklist must
    never authorise executing another."""
    import json

    from rotaris_core.requirements.change.superseding import approve_migration
    from rotaris_core.requirements.delivery.state import DeliveryActor

    store = MigrationPlanStore(tmp_path)
    store.approve(approve_migration(plan(), approver=DeliveryActor.user("ada"), at=AT))

    payload = json.loads(store.path_for(NEW).read_text(encoding="utf-8"))
    payload["approval"]["plan_digest"] = "0" * 16
    store.path_for(NEW).write_text(json.dumps(payload), encoding="utf-8")

    assert store.load_approved(NEW) is None
    assert store.load(NEW) is not None, "the plan itself is still readable and still pending"
