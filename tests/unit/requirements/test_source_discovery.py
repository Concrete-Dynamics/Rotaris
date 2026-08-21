"""Productive use: a user opens a repository whose requirement layout Rotaris does not
recognise and is offered a mapping for it instead of a blank configuration file.
Expected outcome: the offer is a configuration document that was proved by loading it —
a mapping producing duplicate ids is rejected with the colliding id named — and nothing
reaches the workspace until the user accepts it."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.sources.base import RequirementSourceError
from rotaris_core.requirements.sources.declarative import DeclarativeSourceConfig
from rotaris_core.requirements.sources.discovery import (
    DiscoveryOutcome,
    HeuristicAnalyst,
    JsonProposalStore,
    ProposalKind,
    ProposalRejectedError,
    RepositorySurvey,
    SourceAnalyst,
    SourceProposal,
    ValidationIssueKind,
    accept_proposal,
    discover_source,
    survey_repository,
    validate_proposal,
)

if TYPE_CHECKING:
    from pathlib import Path


class ScriptedAnalyst:
    """An analyst whose judgement is written by the test, not by a model."""

    def __init__(self, proposal: SourceProposal | None) -> None:
        self._proposal = proposal
        self.surveys: list[RepositorySurvey] = []

    def propose(self, survey: RepositorySurvey) -> SourceProposal | None:
        self.surveys.append(survey)
        return self._proposal


def _write_specs(root: Path, *, duplicate: bool = False) -> Path:
    specs = root / "specs"
    (specs / "auth").mkdir(parents=True)
    (specs / "epic.md").write_text(
        "---\nid: REQ-1\nstate: draft\n---\n\n# Authentication\n\nGetting in.\n",
        encoding="utf-8",
    )
    (specs / "auth" / "login.md").write_text(
        f"---\nid: {'REQ-1' if duplicate else 'REQ-2'}\nstate: draft\nepic: REQ-1\n---\n"
        "\n# Log in\n\nThe user logs in.\n",
        encoding="utf-8",
    )
    return root


def _config(**overrides: object) -> DeclarativeSourceConfig:
    return DeclarativeSourceConfig.model_validate(
        {
            "source-id": "discovered",
            "type": "markdown",
            "glob": "specs/**/*.md",
            "id": "frontmatter.id",
            "title": "heading",
            "status": "frontmatter.state",
            **overrides,
        },
    )


@pytest.mark.unit
@verifies(SWR.SWR_3106)
def test_a_proposal_producing_duplicate_ids_is_rejected_with_the_id_named(
    tmp_path: Path,
) -> None:
    """The failure mode a plausible-looking mapping actually has."""
    _write_specs(tmp_path, duplicate=True)
    proposal = SourceProposal(
        config=_config(),
        rationale="every document carries an 'id'",
        evidence=("specs/epic.md", "specs/auth/login.md"),
    )

    validation = validate_proposal(tmp_path, proposal)

    assert not validation.ok
    (issue,) = validation.issues
    assert issue.kind is ValidationIssueKind.DUPLICATE_ID
    assert issue.req_id == "REQ-1"
    # Both documents are named: the one that claimed the id first, and the one
    # that collided with it.
    assert "specs/auth/login.md" in issue.message
    assert issue.location == "specs/epic.md"
    assert "REQ-1" in validation.describe()


@pytest.mark.unit
@verifies(SWR.SWR_3106)
def test_a_rejected_proposal_cannot_be_adopted_and_nothing_is_written(tmp_path: Path) -> None:
    """Persisting is a decision, and a failed validation is not one."""
    _write_specs(tmp_path, duplicate=True)
    analyst = ScriptedAnalyst(SourceProposal(config=_config(), rationale="ids in frontmatter"))
    store = JsonProposalStore(tmp_path / ".rotaris" / "requirement-source.json")

    outcome = discover_source(tmp_path, analyst)

    assert not outcome.is_acceptable
    assert not store.path.exists(), "discovery writes nothing"

    with pytest.raises(ProposalRejectedError, match="did not validate"):
        accept_proposal(outcome, store)

    assert not store.path.exists()
    assert store.load() is None


@pytest.mark.unit
@verifies(SWR.SWR_3106)
def test_a_validated_proposal_is_adopted_only_by_an_explicit_step(tmp_path: Path) -> None:
    """The one path from "Rotaris had an idea" to "the workspace is configured"."""
    _write_specs(tmp_path)
    analyst = ScriptedAnalyst(
        SourceProposal(
            config=_config(), rationale="ids in frontmatter", evidence=("specs/epic.md",)
        ),
    )
    store = JsonProposalStore(tmp_path / ".rotaris" / "requirement-source.json")

    outcome = discover_source(tmp_path, analyst)

    assert outcome.is_acceptable
    assert outcome.validation is not None
    assert outcome.validation.requirement_ids == ("REQ-1", "REQ-2")
    assert not store.path.exists()

    adopted = accept_proposal(outcome, store)

    assert store.path.is_file()
    assert store.load() == adopted
    assert store.load() == _config()


@pytest.mark.unit
@verifies(SWR.SWR_3106)
def test_a_proposal_claiming_a_document_it_cannot_read_is_rejected(tmp_path: Path) -> None:
    """A mapping that quietly drops half a tree must not reach a workspace."""
    _write_specs(tmp_path)
    (tmp_path / "specs" / "auth" / "notes.md").write_text("Loose notes.\n", encoding="utf-8")
    proposal = SourceProposal(
        config=_config(),
        rationale="all markdown under specs/",
        evidence=("specs/auth/notes.md",),
    )

    validation = validate_proposal(tmp_path, proposal)

    assert not validation.ok
    (issue,) = validation.issues
    assert issue.kind is ValidationIssueKind.UNCLAIMED_ARTIFACT
    assert issue.location == "specs/auth/notes.md"
    assert validation.skipped == ("specs/auth/notes.md",)


@pytest.mark.unit
@verifies(SWR.SWR_3106)
def test_a_mapping_that_cannot_read_its_files_is_reported_with_the_failing_file(
    tmp_path: Path,
) -> None:
    """The proposal must parse the files it claims, and say which one it could not."""
    _write_specs(tmp_path)
    (tmp_path / "specs" / "auth" / "broken.md").write_text(
        "---\nid: REQ-3\nstate: halfway\n---\n\n# Halfway\n",
        encoding="utf-8",
    )
    proposal = SourceProposal(config=_config(), rationale="ids in frontmatter")

    validation = validate_proposal(tmp_path, proposal)

    assert not validation.ok
    (issue,) = validation.issues
    assert issue.kind is ValidationIssueKind.UNREADABLE
    assert issue.location == "specs/auth/broken.md"
    assert "halfway" in issue.message


@pytest.mark.unit
@verifies(SWR.SWR_3106)
def test_an_empty_result_is_a_rejection_not_a_configured_empty_board(tmp_path: Path) -> None:
    """A glob that matches nothing is a wrong glob, not a project with no requirements."""
    _write_specs(tmp_path)
    proposal = SourceProposal(config=_config(glob="requirements/**/*.md"), rationale="guess")

    validation = validate_proposal(tmp_path, proposal)

    assert not validation.ok
    assert validation.issues[0].kind is ValidationIssueKind.NO_REQUIREMENTS


@pytest.mark.unit
@verifies(SWR.SWR_3106)
def test_a_programmatic_adapter_needs_a_stated_reason(tmp_path: Path) -> None:
    """Otherwise "write code for it" becomes the easy way out of a hard mapping."""
    with pytest.raises(ValidationError, match="states"):
        SourceProposal(kind=ProposalKind.PROGRAMMATIC, rationale="looks complicated")

    with pytest.raises(ValidationError, match="carries no declarative configuration"):
        SourceProposal(
            kind=ProposalKind.PROGRAMMATIC,
            config=_config(),
            declarative_blocker="ids live in a database",
        )

    stated = SourceProposal(
        kind=ProposalKind.PROGRAMMATIC,
        rationale="the ids come from an external tracker",
        declarative_blocker="requirement ids are not present in any file",
    )
    assert "not present in any file" in stated.describe()

    # And it is not something that can be adopted as a declarative configuration.
    outcome = DiscoveryOutcome(
        survey=RepositorySurvey(root=tmp_path.as_posix()),
        proposal=stated,
        validation=validate_proposal(tmp_path, stated),
    )
    assert outcome.validation is not None
    assert outcome.validation.issues[0].kind is ValidationIssueKind.NOT_DECLARATIVE
    assert not outcome.is_acceptable


@pytest.mark.unit
@verifies(SWR.SWR_3106)
def test_the_survey_names_what_it_found_deterministically(tmp_path: Path) -> None:
    """The evidence a proposal rests on, so a user can review the grounds."""
    _write_specs(tmp_path)
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "guide.md").write_text("# Guide\n", encoding="utf-8")
    (tmp_path / ".venv").mkdir()
    (tmp_path / ".venv" / "readme.md").write_text("---\nid: X\n---\n# Nope\n", encoding="utf-8")

    survey = survey_repository(tmp_path)

    assert survey == survey_repository(tmp_path), "the same tree surveys identically"
    globs = [candidate.glob for candidate in survey.candidates]
    assert globs[0] == "specs/**/*.md", "the strongest candidate leads"
    assert "docs/**/*.md" in globs
    assert all(".venv" not in glob for glob in globs), "environments are not specifications"

    best = survey.best_candidate
    assert best is not None
    assert best.file_count == 2
    assert best.with_frontmatter == 2
    assert best.frontmatter_keys == ("epic", "id", "state")
    assert best.lifecycle_key == "state"
    assert best.lifecycle_values == ("draft",)
    assert best.sample_paths == ("specs/auth/login.md", "specs/epic.md")
    assert "specs/**/*.md" in survey.describe()


@pytest.mark.unit
@verifies(SWR.SWR_3106)
def test_the_default_analyst_proposes_configuration_not_a_parser(tmp_path: Path) -> None:
    """Discovery output is a document a user can read and edit, never code."""
    _write_specs(tmp_path)

    outcome = discover_source(tmp_path, HeuristicAnalyst())

    assert outcome.proposal is not None
    assert outcome.proposal.kind is ProposalKind.DECLARATIVE
    config = outcome.proposal.config
    assert config is not None
    assert config.glob == "specs/**/*.md"
    assert config.req_id.source == "frontmatter.id"
    assert config.parent is not None
    assert config.parent.source == "frontmatter.epic"
    assert outcome.is_acceptable
    assert outcome.validation is not None
    assert outcome.validation.requirement_ids == ("REQ-1", "REQ-2")

    # What was found and what would be written are both in the confirmation text.
    summary = outcome.summary()
    assert "specs/**/*.md" in summary
    assert '"id": {' in summary
    assert "Validated: 2 requirement(s)" in summary


@pytest.mark.unit
@verifies(SWR.SWR_3106)
def test_the_default_analyst_leaves_an_unknown_status_vocabulary_unmapped(
    tmp_path: Path,
) -> None:
    """Deciding that "accepted" means "approved" is a judgement, not a heuristic."""
    specs = tmp_path / "specs"
    specs.mkdir()
    (specs / "one.md").write_text("---\nid: REQ-1\nstate: accepted\n---\n\n# One\n", "utf-8")

    outcome = discover_source(tmp_path, HeuristicAnalyst())

    assert outcome.proposal is not None
    assert outcome.proposal.config is not None
    assert outcome.proposal.config.lifecycle is None
    assert "status-values" in outcome.proposal.rationale
    # And what it does propose loads, rather than failing on the first document.
    assert outcome.is_acceptable


@pytest.mark.unit
@verifies(SWR.SWR_3106)
def test_a_repository_with_no_id_anywhere_gets_a_stated_programmatic_answer(
    tmp_path: Path,
) -> None:
    """ "A mapping cannot express this" must be sayable, with the reason attached."""
    specs = tmp_path / "specs"
    specs.mkdir()
    (specs / "one.md").write_text("---\nowner: alice\n---\n\n# One\n", encoding="utf-8")

    outcome = discover_source(tmp_path, HeuristicAnalyst())

    assert outcome.proposal is not None
    assert outcome.proposal.kind is ProposalKind.PROGRAMMATIC
    assert "identifies a requirement" in outcome.proposal.declarative_blocker
    assert "owner" in outcome.proposal.declarative_blocker
    assert not outcome.is_acceptable


@pytest.mark.unit
@verifies(SWR.SWR_3106)
def test_the_analyst_is_a_seam_any_implementation_drives_discovery(tmp_path: Path) -> None:
    """A model-backed analyst plugs in exactly where the fake did, and no deeper."""
    _write_specs(tmp_path)
    analyst = ScriptedAnalyst(SourceProposal(config=_config(**{"source-id": "from-agent"})))

    assert isinstance(analyst, SourceAnalyst)
    assert isinstance(HeuristicAnalyst(), SourceAnalyst)

    outcome = discover_source(tmp_path, analyst)

    assert len(analyst.surveys) == 1, "the analyst sees the survey, not the repository"
    assert analyst.surveys[0].best_candidate is not None
    assert outcome.is_acceptable
    assert outcome.proposal is not None
    assert outcome.proposal.config is not None
    assert outcome.proposal.config.source_id == "from-agent"

    # An analyst with nothing to say leaves an outcome that cannot be adopted.
    silent = discover_source(tmp_path, ScriptedAnalyst(None))
    assert silent.proposal is None
    assert not silent.is_acceptable
    assert "no analyst could describe" in silent.summary()


@pytest.mark.unit
@verifies(SWR.SWR_3106)
def test_a_persisted_configuration_round_trips_and_a_broken_one_is_named(
    tmp_path: Path,
) -> None:
    """What the user reviewed is what lands, and a corrupted file says so."""
    store = JsonProposalStore(tmp_path / ".rotaris" / "requirement-source.json")
    assert store.load() is None

    store.save(_config())
    written = store.path.read_text(encoding="utf-8")
    store.save(_config())
    assert store.path.read_text(encoding="utf-8") == written, "byte-identical on rewrite"
    assert '"glob": "specs/**/*.md"' in written
    assert store.load() == _config()

    store.path.write_text('{"glob": "specs/**/*.md"}', encoding="utf-8")
    with pytest.raises(RequirementSourceError, match="not a valid configuration"):
        store.load()

    store.path.write_text("{not json", encoding="utf-8")
    with pytest.raises(RequirementSourceError, match="could not be read"):
        store.load()


@pytest.mark.unit
@verifies(SWR.SWR_3123)
def test_the_store_holds_either_kind_and_a_kindless_file_stays_declarative(
    tmp_path: Path,
) -> None:
    """One file, one ``kind`` key, two configurations — and no migration.

    Every ``requirement-source.json`` written before the key existed carries no
    ``kind`` and must keep loading as the declarative mapping it always was.
    """
    import json as json_module

    from rotaris_core.requirements.sources.discovery import SourceLoad
    from rotaris_core.requirements.sources.generated import (
        GeneratedParserConfig,
        GeneratedParserSource,
    )

    store = JsonProposalStore(tmp_path / ".rotaris" / "requirement-source.json")

    # A pre-union document: exactly what accept_proposal has always written.
    store.save(_config())
    assert '"kind"' not in store.path.read_text(encoding="utf-8")
    assert isinstance(store.load(), DeclarativeSourceConfig)

    programmatic = GeneratedParserConfig(sha256="abc123", watch="docs/**/*.md")
    store.save(programmatic)
    document = json_module.loads(store.path.read_text(encoding="utf-8"))
    assert document["kind"] == "programmatic"
    loaded = store.load()
    assert loaded == programmatic

    # And the load builds the matching adapter, behind the same protocol.
    source = SourceLoad(config=loaded).source(tmp_path)
    assert isinstance(source, GeneratedParserSource)

    store.path.write_text('{"kind": "interpretive-dance"}', encoding="utf-8")
    with pytest.raises(RequirementSourceError, match="unknown kind"):
        store.load()


@pytest.mark.unit
@verifies(SWR.SWR_3106)
def test_evidence_names_documents_the_mapping_reads_not_the_first_in_the_tree(
    tmp_path: Path,
) -> None:
    """A glossary beside the requirements must not refuse a working mapping.

    ``evidence`` is a claim :func:`validate_proposal` checks by reading, and the
    heuristic used to fill it with whatever sorted first. On a real store that
    was `CONVENTIONS.md`, `DECISIONS.md`, `GLOSSARY.md` — prose, unclaimable by
    any id mapping — so every one of them came back as an `unclaimed-artifact`
    and a mapping that read sixty-two requirements correctly was refused.
    """
    _write_specs(tmp_path)
    # Prose beside the requirements, sorting ahead of every one of them. This is
    # the real shape: a store's CONVENTIONS/DECISIONS/GLOSSARY carry no
    # frontmatter, so the reader skips them and any evidence claiming them is a
    # promise the mapping cannot keep.
    (tmp_path / "specs" / "CONVENTIONS.md").write_text(
        "# Conventions\n\nHow we write these.\n",
        encoding="utf-8",
    )

    outcome = discover_source(tmp_path, HeuristicAnalyst())

    assert outcome.proposal is not None
    assert outcome.proposal.kind is ProposalKind.DECLARATIVE
    assert outcome.survey.best_candidate is not None
    # The naive choice — and what the heuristic used to hand over as evidence.
    assert "specs/CONVENTIONS.md" in outcome.survey.best_candidate.sample_paths
    assert "specs/CONVENTIONS.md" not in outcome.proposal.evidence
    assert outcome.validation is not None
    assert outcome.validation.ok, outcome.validation.describe()
    assert outcome.is_acceptable
    # Still *reported*: it matched the glob and produced no requirement, and a
    # too-wide glob has to stay visible (SWR-3106).
    assert "specs/CONVENTIONS.md" in outcome.validation.skipped


@pytest.mark.unit
@verifies(SWR.SWR_3106)
def test_a_survey_records_which_sampled_document_carries_which_key(tmp_path: Path) -> None:
    """The evidence fix rests on this: sample paths alone cannot express it."""
    _write_specs(tmp_path)
    (tmp_path / "specs" / "CONVENTIONS.md").write_text(
        "# Conventions\n\nHow we write these.\n",
        encoding="utf-8",
    )

    candidate = survey_repository(tmp_path).best_candidate

    assert candidate is not None
    assert "specs/CONVENTIONS.md" not in dict(candidate.sampled_keys)
    assert candidate.samples_declaring("id") == ("specs/auth/login.md", "specs/epic.md")
    assert candidate.samples_declaring("id", limit=1) == ("specs/auth/login.md",)
    assert candidate.samples_declaring("nothing-declares-this") == ()
