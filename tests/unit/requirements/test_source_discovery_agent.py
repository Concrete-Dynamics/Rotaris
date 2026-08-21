"""Productive use: a user opens a project whose requirements are a folder of plain
Markdown — no frontmatter anywhere, the id in each file's name or first line — and
expects Rotaris to work out how to read them rather than report that the project
declares none.
Expected outcome: the deterministic analyst is tried first and costs nothing, an agent is
asked only where determinism produced nothing a user could adopt, its answer re-enters
the ordinary path as a proposal validated by loading it, no id is ever invented, and
every analyst the chain ran is reported — including the one that was not there.

No model runs here. Every agent answer is scripted, which is exactly what SWR-3121's
"the same repository, with the same agent answer" is about."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.sources.declarative import DeclarativeSourceConfig
from rotaris_core.requirements.sources.discovery import (
    HeuristicAnalyst,
    ProposalKind,
    RepositorySurvey,
    SourceProposal,
    discover_source,
    survey_repository,
)

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


class ScriptedAgent:
    """An agent whose judgement is written by the test, counting its calls.

    Carries ``consults_a_model`` so the chain treats it the way it treats the
    real one — the guard that keeps a repository with nothing in it from costing
    a model call is keyed on this and not on a class name.
    """

    consults_a_model = True

    def __init__(self, proposal: SourceProposal | None, *, label: str = "scripted agent") -> None:
        self._proposal = proposal
        self.label = label
        self.unavailable_reason = "" if proposal is not None else "the agent had nothing to say"
        self.calls = 0

    def propose(self, survey: RepositorySurvey) -> SourceProposal | None:
        self.calls += 1
        return self._proposal


def _prose_store(root: Path, count: int = 3) -> Path:
    """Requirements as plain Markdown: no frontmatter, ids in the file names."""
    store = root / "requirements"
    store.mkdir(parents=True)
    for number in range(1, count + 1):
        (store / f"FR-{number}-behaviour.md").write_text(
            f"# FR-{number} — Behaviour {number}\n\nThe product does behaviour {number}.\n",
            encoding="utf-8",
        )
    return root


def _prose_mapping(**overrides: object) -> DeclarativeSourceConfig:
    return DeclarativeSourceConfig.model_validate(
        {
            "source-id": "discovered",
            "type": "markdown",
            "glob": "requirements/**/*.md",
            "id": {"source": "stem", "pattern": "^(?P<value>FR-[0-9]+)"},
            "title": "heading",
            "description": "body",
            **overrides,
        },
    )


def _agent_proposal(
    config: DeclarativeSourceConfig | None = None, **kwargs: object
) -> SourceProposal:
    return SourceProposal(
        kind=ProposalKind.DECLARATIVE,
        config=config if config is not None else _prose_mapping(),
        rationale="the id is the leading token of each file name",
        **kwargs,  # type: ignore[arg-type]
    )


@verifies(SWR.SWR_3121)
def test_a_frontmatter_free_store_is_read_through_the_agents_mapping(tmp_path: Path) -> None:
    """The shape the agent exists for and was never asked about.

    A candidate counts as requirement-shaped to the heuristic only if some
    document carried frontmatter, so a tree of plain Markdown produced no
    candidate and the analyst answered ``None`` *before the seam was reached*.
    """
    _prose_store(tmp_path, count=3)
    agent = ScriptedAgent(_agent_proposal())

    outcome = discover_source(tmp_path, (HeuristicAnalyst(), agent))

    assert agent.calls == 1
    assert outcome.is_acceptable, outcome.summary()
    assert outcome.validation is not None
    assert outcome.validation.requirement_ids == ("FR-1", "FR-2", "FR-3")


@verifies(SWR.SWR_3121)
def test_the_same_answer_over_the_same_tree_yields_the_same_requirements(tmp_path: Path) -> None:
    """SWR-3121's determinism clause: the *answer* varies, the reading does not."""
    _prose_store(tmp_path, count=3)

    first = discover_source(tmp_path, (HeuristicAnalyst(), ScriptedAgent(_agent_proposal())))
    second = discover_source(tmp_path, (HeuristicAnalyst(), ScriptedAgent(_agent_proposal())))

    assert first.proposal is not None
    assert second.proposal is not None
    assert first.proposal.config == second.proposal.config
    assert first.validation is not None
    assert second.validation is not None
    assert first.validation.requirement_ids == second.validation.requirement_ids


@verifies(SWR.SWR_3121)
def test_the_agent_is_not_consulted_when_the_heuristic_already_maps_the_store(
    tmp_path: Path,
) -> None:
    """A repository the heuristic reads costs no model call at all."""
    store = tmp_path / "specs"
    store.mkdir()
    (store / "one.md").write_text("---\nid: REQ-1\n---\n\n# One\n\nText.\n", encoding="utf-8")
    agent = ScriptedAgent(_agent_proposal())

    outcome = discover_source(tmp_path, (HeuristicAnalyst(), agent))

    assert outcome.is_acceptable
    assert agent.calls == 0
    assert len(outcome.attempts) == 1, "the chain stopped at the answer it could adopt"


@verifies(SWR.SWR_3121)
def test_a_heuristic_mapping_that_cannot_load_escalates(tmp_path: Path) -> None:
    """Escalation is decided on the validation, not on the proposal's shape.

    The heuristic answers a *declarative* mapping here — before SWR-3121 that
    alone ended the chain — and the mapping cannot read the store it claims.
    """
    store = tmp_path / "specs"
    store.mkdir()
    # Frontmatter with an id-ish key on one document only: the heuristic maps
    # `id`, and the sibling that has none makes the mapping fail to load.
    (store / "one.md").write_text("---\nid: REQ-1\n---\n\n# One\n\nText.\n", encoding="utf-8")
    (store / "two.md").write_text("---\nowner: ada\n---\n\n# Two\n\nText.\n", encoding="utf-8")
    agent = ScriptedAgent(
        _agent_proposal(
            _prose_mapping(
                glob="specs/**/*.md",
                id={"source": "stem", "pattern": "^(?P<value>one|two)$"},
            ),
        ),
    )

    outcome = discover_source(tmp_path, (HeuristicAnalyst(), agent))

    assert agent.calls == 1, "the heuristic proposed, it did not validate, the chain went on"
    assert [attempt.accepted for attempt in outcome.attempts] == [False, True]
    assert outcome.is_acceptable


@verifies(SWR.SWR_3121)
def test_an_answer_naming_an_id_the_documents_do_not_carry_is_refused(tmp_path: Path) -> None:
    """Validated by loading it, and the artefact that defeated it is named."""
    _prose_store(tmp_path, count=3)
    # Reads the first two documents and cannot read the third: an id the mapping
    # claims is there and is not.
    agent = ScriptedAgent(
        _agent_proposal(_prose_mapping(id={"source": "stem", "pattern": "^(?P<value>FR-[12])"})),
    )

    outcome = discover_source(tmp_path, (HeuristicAnalyst(), agent))

    assert not outcome.is_acceptable
    assert outcome.validation is not None
    assert any(
        "requirements/FR-3-behaviour.md" in (issue.location or "")
        for issue in outcome.validation.issues
    ), outcome.validation.describe()


@verifies(SWR.SWR_3121)
def test_an_id_the_configuration_supplies_is_refused_outright(tmp_path: Path) -> None:
    """An id must be *found* in the artefact; a constant is not an answer.

    A duplicate-id check catches this only where the store holds more than one
    document. Refusing it in the configuration catches it everywhere, which is
    what "ids are stable forever" needs.
    """
    with pytest.raises(ValueError, match="must not be a literal"):
        _prose_mapping(id="literal:FR-1")


@verifies(SWR.SWR_3121)
def test_a_repository_with_no_documents_never_reaches_the_agent(tmp_path: Path) -> None:
    """A model asked about a repository holding nothing could only invent an answer."""
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "app.py").write_text("print('hi')\n", encoding="utf-8")
    agent = ScriptedAgent(_agent_proposal())

    outcome = discover_source(tmp_path, (HeuristicAnalyst(), agent))

    assert agent.calls == 0
    assert not outcome.attempts[-1].consulted
    assert "heading or frontmatter" in outcome.attempts[-1].note


@verifies(SWR.SWR_3121)
def test_an_agent_that_says_nothing_leaves_the_deterministic_result_standing(
    tmp_path: Path,
) -> None:
    """Failure is an answer, and it is reported rather than becoming silence."""
    store = tmp_path / "specs"
    store.mkdir()
    (store / "one.md").write_text("---\nowner: ada\n---\n\n# One\n\nText.\n", encoding="utf-8")
    agent = ScriptedAgent(None)

    outcome = discover_source(tmp_path, (HeuristicAnalyst(), agent))

    assert agent.calls == 1
    assert outcome.proposal is not None, "the heuristic's programmatic answer survives"
    assert outcome.proposal.kind is ProposalKind.PROGRAMMATIC
    assert outcome.attempts[-1].note == "the agent had nothing to say"
    assert "the agent had nothing to say" in outcome.summary()


@verifies(SWR.SWR_3121)
def test_the_most_informative_refusal_is_the_one_reported(tmp_path: Path) -> None:
    """A chain reporting its *last* refusal would hide the one that nearly worked."""
    _prose_store(tmp_path, count=3)
    # Reads every document, and collapses them onto one id — wrong, but it read
    # the store.
    partial = _agent_proposal(
        _prose_mapping(id={"source": "stem", "pattern": "^(?P<value>FR)"}),
    )
    # Matches nothing at all.
    useless = _agent_proposal(_prose_mapping(glob="nowhere/**/*.md"))

    outcome = discover_source(
        tmp_path,
        (ScriptedAgent(partial, label="first"), ScriptedAgent(useless, label="second")),
    )

    assert not outcome.is_acceptable
    assert outcome.validation is not None
    assert outcome.validation.requirement_ids == ("FR",), outcome.summary()
    assert outcome.proposal is not None
    assert outcome.proposal.config is not None
    assert outcome.proposal.config.glob == "requirements/**/*.md", "not the one that read nothing"


@verifies(SWR.SWR_3121)
def test_the_summary_names_every_analyst_the_chain_ran(tmp_path: Path) -> None:
    """What the board shows a user: who was asked, and what came of it."""
    _prose_store(tmp_path, count=2)
    agent = ScriptedAgent(_agent_proposal(), label="requirements-engineer (a-model)")

    summary = discover_source(tmp_path, (HeuristicAnalyst(), agent)).summary()

    assert "Analysts:" in summary
    assert "HeuristicAnalyst" in summary
    assert "requirements-engineer (a-model): proposed, adopted" in summary


@verifies(SWR.SWR_3121)
def test_a_single_analyst_is_still_accepted(tmp_path: Path) -> None:
    """The chain widened the parameter; it did not break the one-analyst call."""
    _prose_store(tmp_path, count=2)

    outcome = discover_source(tmp_path, ScriptedAgent(_agent_proposal()))

    assert outcome.is_acceptable
    assert len(outcome.attempts) == 1


@verifies(SWR.SWR_3121)
def test_excerpts_are_bounded_ordered_and_reproducible(tmp_path: Path) -> None:
    """The only part of a survey that describes a store with no frontmatter."""
    _prose_store(tmp_path, count=8)

    first = survey_repository(tmp_path, excerpt_documents=2, excerpt_chars=40)
    second = survey_repository(tmp_path, excerpt_documents=2, excerpt_chars=40)
    candidate = first.candidates[0]

    assert len(candidate.excerpts) == 2, "bounded by document count"
    assert [path for path, _ in candidate.excerpts] == [
        "requirements/FR-1-behaviour.md",
        "requirements/FR-2-behaviour.md",
    ], "the first in sorted order, not whatever the filesystem offered"
    assert all(len(text) <= 41 for _, text in candidate.excerpts), "bounded by length"
    assert candidate.excerpts == second.candidates[0].excerpts, "reproducible for a given tree"
