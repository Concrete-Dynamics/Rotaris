"""Productive use: a user opens the requirements board of *this* repository and asks
about a real requirement — what does it owe, what actually covers it, is the covering
test the same one the completion verifier runs, and what happens to the card when a
colleague deletes that test.
Expected outcome: obligations resolved over the real store match the flags ReqToCode
enforces; the projection over the real coverage index agrees with the verifier's own
requirement evidence; the detail records name files that exist at the lines they claim;
deleting a test and editing a module in a git fixture yields exactly the two expected
staleness reasons and drives the requirement out of `Healthy`; and derived health follows
the projection for every requirement in the store.

Fixture sources are assembled from the T/V constants so this file's own text carries no
scannable annotation for the synthetic requirement it writes into a temporary directory.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.coverage import coverage_map
from rotaris_core.reqtocode.layout import RepoLayout
from rotaris_core.requirements.delivery.evidence import (
    EvidenceInputs,
    EvidenceState,
    project_evidence,
    site_address,
)
from rotaris_core.requirements.delivery.health import (
    HealthInputs,
    RequirementHealth,
    derive_health,
)
from rotaris_core.requirements.delivery.obligations import (
    EvidenceKind,
    ObligationLevel,
    ObligationPolicy,
    ObligationSet,
    resolve_obligations,
)
from rotaris_core.requirements.delivery.staleness import (
    FreshnessInputs,
    StalenessReason,
    VerifiedEvidence,
    evaluate_freshness,
)
from rotaris_core.requirements.delivery.state import DeliveryStatus, DeliveryView
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for
from rotaris_core.verifier.requirement_evidence import (
    CoveringTest,
    RequirementSite,
    build_iteration_evidence,
    executed_test_runners,
    execution_for,
)
from rotaris_core.verifier.runner import CheckResult

if TYPE_CHECKING:
    from rotaris_core.reqtocode.coverage import RequirementCoverage

pytestmark = pytest.mark.integration

REPO_ROOT = Path(__file__).resolve().parents[2]

#: A requirement of this repository that really carries traces and covering tests.
TRACED_REQ = 3201

#: Rotaris keeps no verification, execution or integration records yet, so a
#: projection over the bare store is asked only about the two obligations the
#: store can actually answer. Asking for the other three would make every card in
#: the repository report the same missing verification and prove nothing.
STORE_POLICY = ObligationPolicy(
    product=ObligationSet(
        verification=ObligationLevel.NOT_APPLICABLE,
        execution=ObligationLevel.NOT_APPLICABLE,
        integration=ObligationLevel.NOT_APPLICABLE,
    ),
    technical=ObligationSet(
        verification=ObligationLevel.NOT_APPLICABLE,
        execution=ObligationLevel.NOT_APPLICABLE,
        integration=ObligationLevel.NOT_APPLICABLE,
    ),
)

PASSING_SUITE = CheckResult(name="tests", command="uv run pytest", status="passed", exit_code=0)


@pytest.fixture(scope="module")
def store_requirements() -> tuple[CanonicalRequirement, ...]:
    """Every requirement of this repository, read through the real adapter."""
    source = reqtocode_source_for(REPO_ROOT)
    assert source is not None, "this repository carries a ReqToCode requirement store"
    return source.read().requirements


@pytest.fixture(scope="module")
def coverage() -> dict[int, RequirementCoverage]:
    """The real implementation and covering-test sites, one sweep for the module."""
    return coverage_map(REPO_ROOT)


def number_of(req_id: str) -> int:
    """``SWR-3201`` → ``3201``."""
    return int(req_id.rsplit("-", 1)[-1])


def inputs_for(
    requirement: CanonicalRequirement,
    coverage: dict[int, RequirementCoverage],
) -> EvidenceInputs:
    """Evidence inputs built from the repository's own coverage index.

    The covering tests are matched against a whole-suite ``pytest`` run through
    the completion verifier's own matcher (SWR-2606) rather than a second one, so
    "did this test run" means the same thing on the board as it does in the gate.
    """
    sites = coverage.get(number_of(requirement.req_id))
    runners = executed_test_runners([PASSING_SUITE])
    covering_tests: list[CoveringTest] = []
    for site in sites.tests if sites else ():
        executed = execution_for(site.path, runners)
        covering_tests.append(
            CoveringTest(
                path=site.path,
                line=site.line,
                executed=executed is not None,
                check_name=executed.name if executed is not None else None,
                check_status=str(executed.status) if executed is not None else None,
            ),
        )
    return EvidenceInputs(
        req_id=requirement.req_id,
        requirement_hash=requirement.current_hash,
        implementations=tuple(
            RequirementSite(path=site.path, line=site.line)
            for site in (sites.implementations if sites else ())
        ),
        covering_tests=tuple(covering_tests),
    )


# -- obligations over the real store (SWR-3206) ----------------------------


@verifies(SWR.SWR_3206)
def test_obligations_over_this_repository_match_the_flags_the_verifier_enforces(
    store_requirements: tuple[CanonicalRequirement, ...],
) -> None:
    """`trace:`/`test:` in the front matter is what the board reports as owed."""
    assert len(store_requirements) > 100

    optional_traces = 0
    for requirement in store_requirements:
        obligations = resolve_obligations(requirement)
        assert obligations.requires(EvidenceKind.IMPLEMENTATION) is requirement.trace_required
        assert obligations.requires(EvidenceKind.TEST) is requirement.test_required
        optional_traces += not requirement.trace_required

    # The store really does exercise both answers, so the agreement above is not
    # vacuous.
    assert optional_traces > 0
    assert optional_traces < len(store_requirements)


@verifies(SWR.SWR_3206)
def test_an_epics_obligations_over_the_real_store_come_from_its_children(
    store_requirements: tuple[CanonicalRequirement, ...],
) -> None:
    """A real epic of this repository asserts nothing of its own."""
    by_id = {requirement.req_id: requirement for requirement in store_requirements}
    epic_id = "SWR-3200"
    children = [r for r in store_requirements if r.parent == epic_id]
    assert children, f"{epic_id} has children in this repository's store"

    epic = resolve_obligations(
        by_id[epic_id],
        children=[resolve_obligations(child) for child in children],
    )

    assert epic.is_epic
    implementation = epic.obligation_for(EvidenceKind.IMPLEMENTATION)
    assert implementation.derived_from
    assert set(implementation.derived_from) <= {child.req_id for child in children}


# -- the projection agrees with the verifier's own evidence (SWR-3207) -----


@verifies(SWR.SWR_3207)
def test_the_projection_over_this_repository_agrees_with_the_verifiers_own_evidence(
    store_requirements: tuple[CanonicalRequirement, ...],
    coverage: dict[int, RequirementCoverage],
) -> None:
    """One requirement, two independent readers, the same answer."""
    requirement = next(r for r in store_requirements if number_of(r.req_id) == TRACED_REQ)
    sites = coverage[TRACED_REQ]
    assert sites.implementations and sites.tests

    projection = project_evidence(
        resolve_obligations(requirement, policy=STORE_POLICY),
        inputs_for(requirement, coverage),
    )

    evidence = build_iteration_evidence(
        REPO_ROOT,
        changed_files=[sites.implementations[0].path],
        checks=[PASSING_SUITE],
    )
    assert evidence is not None
    touched = next(req for req in evidence.requirements.requirements if req.number == TRACED_REQ)

    # The verifier says the covering tests ran and passed; so does the board.
    assert touched.coverage_state == "verified"
    assert projection.state_of(EvidenceKind.TEST) is EvidenceState.SATISFIED
    assert projection.state is EvidenceState.SATISFIED
    assert {test.path for test in touched.covering_tests} == {
        test.path for test in projection.for_kind(EvidenceKind.TEST).covering_tests
    }


@verifies(SWR.SWR_3207)
def test_a_requirement_of_this_repository_whose_suite_never_ran_projects_stale(
    store_requirements: tuple[CanonicalRequirement, ...],
    coverage: dict[int, RequirementCoverage],
) -> None:
    """The same real sites, no suite behind them: stale, not satisfied."""
    requirement = next(r for r in store_requirements if number_of(r.req_id) == TRACED_REQ)
    gathered = inputs_for(requirement, coverage)
    unrun = gathered.model_copy(
        update={
            "covering_tests": tuple(
                CoveringTest(path=test.path, line=test.line) for test in gathered.covering_tests
            ),
        },
    )
    projection = project_evidence(
        resolve_obligations(requirement, policy=STORE_POLICY),
        unrun,
    )
    assert projection.state_of(EvidenceKind.TEST) is EvidenceState.STALE
    assert projection.state is not EvidenceState.SATISFIED


# -- the detail records point at real places (SWR-3208) --------------------


@verifies(SWR.SWR_3208)
def test_detail_records_for_a_requirement_of_this_repository_name_its_real_sites(
    store_requirements: tuple[CanonicalRequirement, ...],
    coverage: dict[int, RequirementCoverage],
) -> None:
    """Every address opens something that is really there, at the line it claims."""
    requirement = next(r for r in store_requirements if number_of(r.req_id) == TRACED_REQ)
    projection = project_evidence(
        resolve_obligations(requirement, policy=STORE_POLICY),
        inputs_for(requirement, coverage),
    )

    addresses = (
        projection.for_kind(EvidenceKind.IMPLEMENTATION).addresses
        + projection.for_kind(EvidenceKind.TEST).addresses
    )
    assert addresses

    for address in addresses:
        relative, _, line_text = address.rpartition(":")
        path = REPO_ROOT / relative
        assert path.is_file(), f"{address} names a file that does not exist"
        lines = path.read_text(encoding="utf-8").splitlines()
        line = int(line_text)
        assert 1 <= line <= len(lines), f"{address} is past the end of the file"
        # The annotation really is at or just above the line the site records.
        window = "\n".join(lines[max(0, line - 3) : line + 1])
        assert str(TRACED_REQ) in window, f"{address} does not carry {TRACED_REQ}"

    implementation = projection.for_kind(EvidenceKind.IMPLEMENTATION)
    assert implementation.addresses == tuple(
        site_address(site) for site in implementation.implementations
    )


# -- freshness over a git fixture (SWR-3209) -------------------------------

T = "traces"
V = "verifies"
SYNTHETIC = 9001
MODULE = "src/widget.py"
TEST_FILE = "tests/test_widget.py"
SYNTHETIC_LAYOUT = RepoLayout(impl_roots=(Path("src"),), test_roots=(Path("tests"),))


def git(repo: Path, *args: str) -> str:
    """One git command in *repo*, with the ambient configuration kept out."""
    result = subprocess.run(
        ["git", "-c", "user.email=t@example.com", "-c", "user.name=Test", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


@pytest.fixture
def git_fixture(tmp_path: Path) -> Path:
    """A committed repository with one requirement, one trace and one covering test."""
    repo = tmp_path / "workspace"
    (repo / "docs" / "requirements").mkdir(parents=True)
    (repo / "src").mkdir()
    (repo / "tests").mkdir()
    (repo / "docs" / "requirements" / "9000-demo.md").write_text(
        "---\n"
        f"req-id: SWR-{SYNTHETIC}\n"
        "status: draft\n"
        "trace: required\n"
        "test: required\n"
        'title: "Demo requirement"\n'
        "---\n\n"
        f"# SWR-{SYNTHETIC} - Demo requirement\n\nThe widget widgets.\n",
        encoding="utf-8",
    )
    (repo / MODULE).write_text(
        f"@{T}(SWR.SWR_{SYNTHETIC})\ndef widget() -> None:\n    return None\n",
        encoding="utf-8",
    )
    (repo / TEST_FILE).write_text(
        f"@{V}(SWR.SWR_{SYNTHETIC})\ndef test_widget() -> None:\n    assert True\n",
        encoding="utf-8",
    )
    git(repo, "init", "-b", "main")
    git(repo, "add", "-A")
    git(repo, "commit", "-m", "the state the verification saw")
    return repo


def sites_of(repo: Path) -> tuple[tuple[RequirementSite, ...], tuple[RequirementSite, ...]]:
    """The synthetic requirement's implementation and test sites, right now."""
    found = coverage_map(repo, layout=SYNTHETIC_LAYOUT).get(SYNTHETIC)
    if found is None:
        return ((), ())
    return (
        tuple(RequirementSite(path=s.path, line=s.line) for s in found.implementations),
        tuple(RequirementSite(path=s.path, line=s.line) for s in found.tests),
    )


@verifies(SWR.SWR_3209)
def test_deleting_a_test_and_editing_a_module_yields_the_two_expected_reasons(
    git_fixture: Path,
) -> None:
    """A colleague's two edits, and the two facts they produce — no requirement change."""
    verified_impl, verified_tests = sites_of(git_fixture)
    assert verified_impl and verified_tests
    verified_commit = git(git_fixture, "rev-parse", "HEAD")

    (git_fixture / TEST_FILE).unlink()
    (git_fixture / MODULE).write_text(
        (git_fixture / MODULE).read_text(encoding="utf-8")
        + "\n\ndef helper() -> int:\n    return 1\n",
        encoding="utf-8",
    )
    changed = frozenset(git(git_fixture, "diff", "--name-only", "HEAD").splitlines())
    assert changed == {MODULE, TEST_FILE}

    current_impl, current_tests = sites_of(git_fixture)
    findings = evaluate_freshness(
        FreshnessInputs(
            req_id=f"SWR-{SYNTHETIC}",
            implementations=current_impl,
            covering_tests=current_tests,
            verified=VerifiedEvidence(
                commit=verified_commit,
                implementations=verified_impl,
                covering_tests=verified_tests,
            ),
            changed_paths=changed,
        ),
    )

    assert {finding.reason for finding in findings} == {
        StalenessReason.IMPLEMENTATION_CHANGED,
        StalenessReason.COVERING_TEST_DISAPPEARED,
    }
    assert {finding.subject for finding in findings} == {MODULE, TEST_FILE}
    assert current_tests == ()


@verifies(SWR.SWR_3209, SWR.SWR_3211)
def test_a_colleagues_deleted_test_takes_the_requirement_out_of_healthy(
    git_fixture: Path,
) -> None:
    """The user-visible half: the card was green, nobody touched the text, it is not green."""
    requirement = CanonicalRequirement(
        req_id=f"SWR-{SYNTHETIC}",
        title="Demo requirement",
        lifecycle=RequirementLifecycle.APPROVED,
    )
    obligations = resolve_obligations(requirement, policy=STORE_POLICY)

    def health_now(*, changed: frozenset[str] = frozenset()) -> RequirementHealth:
        implementations, tests = sites_of(git_fixture)
        findings = evaluate_freshness(
            FreshnessInputs(
                req_id=requirement.req_id,
                implementations=implementations,
                covering_tests=tests,
                verified=VerifiedEvidence(
                    commit="baseline",
                    implementations=verified_impl,
                    covering_tests=verified_tests,
                ),
                changed_paths=changed,
            ),
        )
        projection = project_evidence(
            obligations,
            EvidenceInputs(
                req_id=requirement.req_id,
                implementations=implementations,
                covering_tests=tuple(
                    CoveringTest(
                        path=site.path,
                        line=site.line,
                        executed=True,
                        check_name="pytest",
                        check_status="passed",
                    )
                    for site in tests
                ),
                staleness=findings,
            ),
        )
        return derive_health(
            HealthInputs.of(DeliveryView.of(requirement, DeliveryStatus()), projection),
        ).health

    verified_impl, verified_tests = sites_of(git_fixture)
    assert health_now() is RequirementHealth.HEALTHY

    (git_fixture / TEST_FILE).unlink()
    changed_paths = frozenset(git(git_fixture, "diff", "--name-only", "HEAD").splitlines())
    assert health_now(changed=changed_paths) is RequirementHealth.INCOMPLETE_TRACEABILITY


# -- health over the whole real store (SWR-3211) ---------------------------


@verifies(SWR.SWR_3211)
def test_health_over_this_repository_follows_the_projection_for_every_requirement(
    store_requirements: tuple[CanonicalRequirement, ...],
    coverage: dict[int, RequirementCoverage],
) -> None:
    """Requirement by requirement, the one word never contradicts the five obligations.

    The inputs say "no suite has run for this projection", so the expected answers
    are gaps and staleness rather than green; what is asserted is that the derived
    word follows the obligations underneath it, over the real store, every time.
    """
    counts: dict[RequirementHealth, int] = {}
    for requirement in store_requirements:
        obligations = resolve_obligations(requirement, policy=STORE_POLICY)
        gathered = inputs_for(requirement, coverage)
        unrun = gathered.model_copy(
            update={
                "covering_tests": tuple(
                    CoveringTest(path=test.path, line=test.line) for test in gathered.covering_tests
                ),
            },
        )
        projection = project_evidence(obligations, unrun)
        derived = derive_health(
            HealthInputs.of(DeliveryView.of(requirement, DeliveryStatus()), projection),
        )
        counts[derived.health] = counts.get(derived.health, 0) + 1

        gaps = tuple(
            obligation.kind
            for obligation in projection.obligations
            if obligation.state is EvidenceState.MISSING
            and obligation.level is ObligationLevel.REQUIRED
        )
        if requirement.lifecycle is RequirementLifecycle.DEPRECATED:
            expected = RequirementHealth.DEPRECATED
        elif gaps:
            expected = RequirementHealth.INCOMPLETE_TRACEABILITY
        elif projection.kinds_in(EvidenceState.STALE):
            expected = RequirementHealth.NEEDS_UPDATE
        else:
            expected = RequirementHealth.HEALTHY

        assert derived.health is expected, f"{requirement.req_id}: {derived.message}"
        assert derived.inputs.missing_kinds == gaps

    # Both branches really occur in this repository, so the agreement is not vacuous.
    assert counts.get(RequirementHealth.INCOMPLETE_TRACEABILITY, 0) > 0
    assert counts.get(RequirementHealth.NEEDS_UPDATE, 0) > 0
