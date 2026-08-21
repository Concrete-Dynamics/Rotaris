"""Productive use: a user opens a project whose requirement layout Rotaris has never
seen, is shown what was found and what would be written, accepts it once — and from
then on the project's requirements are simply there.
Expected outcome: discovery produces a configuration document proved by loading it,
nothing is written before the user accepts, and every later start reads the persisted
configuration instead of analysing the repository again."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements import RelationKind, RequirementLifecycle, build_hierarchy
from rotaris_core.requirements.sources.declarative import DeclarativeSourceConfig
from rotaris_core.requirements.sources.discovery import (
    HeuristicAnalyst,
    JsonProposalStore,
    ProposalKind,
    ProposalRejectedError,
    RepositorySurvey,
    SourceProposal,
    ValidationIssueKind,
    accept_proposal,
    discover_source,
    load_or_discover,
    survey_repository,
)

if TYPE_CHECKING:
    from pathlib import Path

EPIC = """---
key: FEAT-100
lifecycle: approved
---

# Reporting

Everything the reporting area covers.
"""

CHILD = """---
key: FEAT-101
lifecycle: draft
parent: FEAT-100
requires: [FEAT-100]
---

# Export a report as CSV

The user exports the current report as a CSV file.
"""

SECOND = """---
key: FEAT-102
lifecycle: deprecated
parent: FEAT-100
---

# Export a report as XLS

The user exports the current report as an XLS file.
"""


class RecordingAnalyst:
    """The seam an LLM-backed analyst would occupy, driven by the test instead.

    Counts its calls, which is how "subsequent loads run no analysis" becomes an
    assertion rather than an assumption.
    """

    def __init__(self, inner: HeuristicAnalyst) -> None:
        self._inner = inner
        self.calls = 0

    def propose(self, survey: RepositorySurvey) -> SourceProposal | None:
        self.calls += 1
        return self._inner.propose(survey)


class ExplodingAnalyst:
    """An analyst that must never be reached once a configuration is persisted."""

    def propose(self, survey: RepositorySurvey) -> SourceProposal | None:
        raise AssertionError(f"a configured workspace must not be analysed again: {survey.root}")


def _write_repository(root: Path) -> Path:
    """A project with its own vocabulary: ``key``, ``lifecycle``, ``parent``."""
    requirements = root / "product"
    (requirements / "reporting").mkdir(parents=True)
    (requirements / "reporting.md").write_text(EPIC, encoding="utf-8")
    (requirements / "reporting" / "csv.md").write_text(CHILD, encoding="utf-8")
    (requirements / "reporting" / "xls.md").write_text(SECOND, encoding="utf-8")
    (root / "README.md").write_text("# The project\n", encoding="utf-8")
    return root


def _store(root: Path) -> JsonProposalStore:
    return JsonProposalStore(root / ".rotaris" / "requirement-source.json")


@pytest.mark.integration
@verifies(SWR.SWR_3106)
def test_discovery_proposes_validates_persists_and_then_stops_analysing(tmp_path: Path) -> None:
    """The whole arc, with the analyst counting how often it was consulted."""
    project = _write_repository(tmp_path / "project")
    store = _store(project)
    analyst = RecordingAnalyst(HeuristicAnalyst(source_id="product-specs"))

    first = load_or_discover(project, store, analyst)

    assert first.analysed is True
    assert analyst.calls == 1
    assert first.config is None, "nothing is configured until the user accepts"
    assert first.source(project) is None
    assert not store.path.exists()

    outcome = first.outcome
    assert outcome is not None
    assert outcome.is_acceptable
    assert outcome.proposal is not None
    assert outcome.proposal.kind is ProposalKind.DECLARATIVE
    config = outcome.proposal.config
    assert config is not None
    assert config.glob == "product/**/*.md"
    assert config.req_id.source == "frontmatter.key"
    assert config.lifecycle is not None and config.lifecycle.source == "frontmatter.lifecycle"
    assert outcome.validation is not None
    assert outcome.validation.requirement_ids == ("FEAT-100", "FEAT-101", "FEAT-102")

    accept_proposal(outcome, store)
    assert store.path.is_file()

    # Every later start reads the configuration; the analyst is never reached.
    second = load_or_discover(project, store, ExplodingAnalyst())
    assert second.analysed is False
    assert second.outcome is None
    assert second.config == config
    source = second.source(project)
    assert source is not None
    assert source.read().requirement_ids == ("FEAT-100", "FEAT-101", "FEAT-102")
    assert analyst.calls == 1


@pytest.mark.integration
@verifies(SWR.SWR_3106)
def test_a_proposal_that_fails_validation_names_the_file_and_is_not_persisted(
    tmp_path: Path,
) -> None:
    """A mapping is proved by loading it, and an unproved one never reaches disk."""
    project = _write_repository(tmp_path / "project")
    (project / "product" / "reporting" / "pdf.md").write_text(
        "---\nkey: FEAT-101\nlifecycle: draft\nparent: FEAT-100\n---\n\n# Export a report as PDF\n",
        encoding="utf-8",
    )
    store = _store(project)

    outcome = discover_source(project, HeuristicAnalyst())

    assert not outcome.is_acceptable
    assert outcome.validation is not None
    (issue,) = outcome.validation.issues
    assert issue.kind is ValidationIssueKind.DUPLICATE_ID
    assert issue.req_id == "FEAT-101"
    assert issue.location == "product/reporting/pdf.md"
    assert "product/reporting/csv.md" in issue.message

    with pytest.raises(ProposalRejectedError) as raised:
        accept_proposal(outcome, store)

    assert "FEAT-101" in str(raised.value)
    assert not store.path.exists(), "a rejected proposal is not persisted"
    assert store.load() is None


@pytest.mark.integration
@verifies(SWR.SWR_3106)
def test_the_survey_and_the_proposal_are_shown_before_anything_is_written(
    tmp_path: Path,
) -> None:
    """What was found and what will be written, both in the confirmation text."""
    project = _write_repository(tmp_path / "project")
    survey = survey_repository(project)

    outcome = discover_source(project, HeuristicAnalyst(), survey=survey)
    summary = outcome.summary()

    # What was found.
    assert "product/**/*.md" in summary
    assert "3 file(s)" in summary
    assert "key" in summary and "lifecycle" in summary
    # What would be written — the exact configuration document.
    assert '"glob": "product/**/*.md"' in summary
    assert '"source": "frontmatter.key"' in summary
    # And what happened when it was loaded.
    assert "Validated: 3 requirement(s)" in summary

    assert not _store(project).path.exists()


@pytest.mark.e2e
@verifies(SWR.SWR_3106)
def test_a_user_accepts_the_proposed_mapping_and_the_requirements_appear(
    tmp_path: Path,
) -> None:
    """The productive flow, end to end, with no model anywhere in it."""
    project = _write_repository(tmp_path / "project")
    (project / ".rotaris").mkdir()
    store = _store(project)

    # 1. Rotaris analyses the repository and offers a mapping.
    load = load_or_discover(project, store, HeuristicAnalyst(source_id="product-specs"))
    assert load.outcome is not None
    assert load.outcome.is_acceptable

    # 2. The user reads the summary and accepts it.
    assert "product/**/*.md" in load.outcome.summary()
    accepted = accept_proposal(load.outcome, store)
    assert accepted.source_id == "product-specs"

    # 3. The requirements are there, in the canonical shape every consumer reads.
    configured = load_or_discover(project, store, ExplodingAnalyst())
    source = configured.source(project)
    assert source is not None
    read = source.read()
    by_id = read.by_id()

    assert read.requirement_ids == ("FEAT-100", "FEAT-101", "FEAT-102")
    csv_export = by_id["FEAT-101"]
    assert csv_export.title == "Export a report as CSV"
    assert csv_export.description.startswith("The user exports")
    assert csv_export.lifecycle is RequirementLifecycle.DRAFT
    assert csv_export.parent == "FEAT-100"
    assert csv_export.related_ids(RelationKind.DEPENDS_ON) == ("FEAT-100",)
    assert by_id["FEAT-100"].lifecycle is RequirementLifecycle.APPROVED
    assert by_id["FEAT-102"].is_deprecated

    hierarchy = build_hierarchy(read.requirements)
    assert hierarchy.roots == ("FEAT-100",)
    assert hierarchy.children_of("FEAT-100") == ("FEAT-101", "FEAT-102")

    # 4. And the answer is the same on the next start, byte for byte.
    again = load_or_discover(project, store, ExplodingAnalyst()).source(project)
    assert again is not None
    assert again.read().model_dump_json() == read.model_dump_json()


@pytest.mark.e2e
@verifies(SWR.SWR_3106)
def test_a_repository_a_mapping_cannot_express_is_told_so_rather_than_mis_configured(
    tmp_path: Path,
) -> None:
    """The honest answer for a store that keeps its ids somewhere else entirely."""
    project = tmp_path / "project"
    (project / "specs").mkdir(parents=True)
    (project / "specs" / "one.md").write_text(
        "---\nowner: alice\nteam: growth\n---\n\n# Something we want\n",
        encoding="utf-8",
    )
    store = _store(project)

    outcome = discover_source(project, HeuristicAnalyst())

    assert outcome.proposal is not None
    assert outcome.proposal.kind is ProposalKind.PROGRAMMATIC
    assert outcome.proposal.config is None
    assert "identifies a requirement" in outcome.proposal.declarative_blocker
    assert "owner" in outcome.proposal.declarative_blocker
    assert outcome.validation is not None
    assert outcome.validation.issues[0].kind is ValidationIssueKind.NOT_DECLARATIVE

    with pytest.raises(ProposalRejectedError):
        accept_proposal(outcome, store)
    assert not store.path.exists()


# ── SWR-3120: a store at our path that is not ours ─────────────────────────

FOREIGN_REQUIREMENT = """---
id: SWR-FR-TRK-{index:03d}
title: Tracking behaviour {index}
status: approved
---

# SWR-FR-TRK-{index:03d} — Tracking behaviour {index}

What the product does.
"""


def _foreign_store_at_our_path(root: Path, count: int = 3) -> Path:
    """Requirements under `docs/requirements/`, in another project's convention."""
    store = root / "docs" / "requirements"
    store.mkdir(parents=True)
    (store / "CONVENTIONS.md").write_text(
        "# Conventions\n\nHow we write these.\n", encoding="utf-8"
    )
    for index in range(1, count + 1):
        (store / f"SWR-FR-TRK-{index:03d}.md").write_text(
            FOREIGN_REQUIREMENT.format(index=index),
            encoding="utf-8",
        )
    return root


@pytest.mark.integration
@verifies(SWR.SWR_3120)
def test_a_store_at_our_path_in_another_convention_reaches_discovery(tmp_path: Path) -> None:
    """The path SWR-3120 opens, from selection through to an adoptable mapping.

    The built-in source used to claim this workspace because the directory
    existed, read nothing, and leave the board reporting an empty store — with
    discovery unreachable, because reaching it required no source at all.
    """
    from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for

    root = _foreign_store_at_our_path(tmp_path, count=3)

    assert reqtocode_source_for(root) is None, "not ours: it declares no req-id"

    outcome = discover_source(root, HeuristicAnalyst())
    assert outcome.is_acceptable, outcome.summary()
    assert len(outcome.validation.requirement_ids) == 3

    store = JsonProposalStore(root / ".rotaris" / "requirement-source.json")
    accept_proposal(outcome, store)

    # And from here it is an ordinary configured source: read, and no analysis.
    load = load_or_discover(root, store, _RefusingAnalyst())
    assert load.analysed is False
    source = load.source(root)
    assert source is not None
    read = source.read()
    assert {requirement.req_id for requirement in read.requirements} == {
        f"SWR-FR-TRK-{index:03d}" for index in range(1, 4)
    }


@pytest.mark.integration
@verifies(SWR.SWR_3120)
def test_a_store_in_our_own_convention_is_still_claimed_without_discovery(
    tmp_path: Path,
) -> None:
    """The guard must not cost a workspace Rotaris already reads."""
    from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for

    store = tmp_path / "docs" / "requirements"
    store.mkdir(parents=True)
    (store / "README.md").write_text("# Requirements\n\nNo frontmatter here.\n", encoding="utf-8")
    (store / "SWR-4501-widget.md").write_text(
        '---\nreq-id: SWR-4501\nstatus: approved\ntrace: optional\ntest: optional\ntitle: "W"\n---\n'
        "\n# SWR-4501 — W\n\nThe widget renders.\n",
        encoding="utf-8",
    )

    source = reqtocode_source_for(tmp_path)

    assert source is not None
    assert [requirement.req_id for requirement in source.read().requirements] == ["SWR-4501"]


@pytest.mark.integration
@verifies(SWR.SWR_3120)
def test_an_empty_store_in_our_convention_stays_ours(tmp_path: Path) -> None:
    """An empty store is a project with no requirements yet, not a foreign one."""
    from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for

    (tmp_path / "docs" / "requirements").mkdir(parents=True)

    source = reqtocode_source_for(tmp_path)

    assert source is not None
    assert source.read().requirements == ()


class _RefusingAnalyst:
    """Fails the test if consulted: a configured source runs no analysis."""

    def propose(self, survey: RepositorySurvey) -> SourceProposal | None:
        raise AssertionError("a persisted configuration must not re-analyse the repository")


# ── SWR-3121: the store no heuristic can describe ──────────────────────────

PROSE_REQUIREMENT = """\
# FR-{index} — Behaviour {index}

The product does behaviour {index}, and says so in prose with no frontmatter
anywhere in the file.
"""


class _ScriptedAgent:
    """The analyst seam, filled by the test rather than by a model."""

    consults_a_model = True
    label = "requirements-engineer (scripted)"

    def __init__(self, proposal: SourceProposal | None) -> None:
        self._proposal = proposal
        self.calls = 0

    def propose(self, survey: RepositorySurvey) -> SourceProposal | None:
        self.calls += 1
        return self._proposal


def _prose_store(root: Path, count: int = 3) -> Path:
    """A folder of plain Markdown: ids in the file names, no frontmatter at all."""
    store = root / "requirements"
    store.mkdir(parents=True)
    for index in range(1, count + 1):
        (store / f"FR-{index}-behaviour.md").write_text(
            PROSE_REQUIREMENT.format(index=index),
            encoding="utf-8",
        )
    (root / "README.md").write_text("# The project\n", encoding="utf-8")
    return root


@pytest.mark.integration
@verifies(SWR.SWR_3121)
def test_a_prose_store_is_discovered_through_the_agent_and_then_read_without_one(
    tmp_path: Path,
) -> None:
    """The whole arc for the shape the heuristic cannot see at all.

    The deterministic analyst is tried first and produces nothing here — a tree
    of plain Markdown yields it no candidate — so the chain reaches the agent,
    whose answer is validated by loading it, persisted on acceptance, and then
    replayed on every later start with no analysis of any kind.
    """
    project = _prose_store(tmp_path / "project", count=3)
    store = _store(project)
    agent = _ScriptedAgent(
        SourceProposal(
            kind=ProposalKind.DECLARATIVE,
            config=DeclarativeSourceConfig.model_validate(
                {
                    "source-id": "discovered",
                    "type": "markdown",
                    "glob": "requirements/**/*.md",
                    "id": {"source": "stem", "pattern": "^(?P<value>FR-[0-9]+)"},
                    "title": "heading",
                    "description": "body",
                },
            ),
            rationale="every file name opens with the requirement's id",
        ),
    )

    outcome = discover_source(project, (HeuristicAnalyst(), agent))

    assert agent.calls == 1, "the heuristic had nothing adoptable and the chain escalated"
    assert outcome.is_acceptable, outcome.summary()
    assert outcome.validation is not None
    assert outcome.validation.requirement_ids == ("FR-1", "FR-2", "FR-3")
    assert [attempt.accepted for attempt in outcome.attempts] == [False, True]

    accept_proposal(outcome, store)

    later = load_or_discover(project, store, (_RefusingAnalyst(), _RefusingAnalyst()))
    assert later.analysed is False
    source = later.source(project)
    assert source is not None
    read = source.read()
    assert [requirement.req_id for requirement in read.requirements] == ["FR-1", "FR-2", "FR-3"]
    assert read.requirements[0].title == "FR-1 — Behaviour 1"
