"""Agent-assisted requirement source discovery (SWR-3106).

Pointing Rotaris at a repository whose requirement layout it has never seen
should not start with a blank configuration file. Discovery surveys the tree,
names the artefacts it believes hold requirements, and **proposes** a
declarative source configuration (SWR-3104) for them.

Three properties decide whether that is a feature or a liability, and all three
are structural here rather than a matter of care:

- **A proposal is data the user accepts.** :func:`discover_source` writes
  nothing. Persisting is a separate, explicit step (:func:`accept_proposal`)
  that takes the store to write into, and it refuses a proposal that did not
  validate. There is no path from "Rotaris had an idea" to "the workspace is
  configured" that does not pass through a decision.
- **A proposal is validated by loading it.** :func:`validate_proposal` builds the
  proposed source and reads it: the configuration must parse the files it claims
  and produce requirements with unique ids. A mapping that looks plausible and
  produces two ``SWR-1``s is rejected with the colliding id named — not adopted
  and discovered three weeks later as a board that lost half its cards.
- **The analysis is a seam, not a dependency.** :class:`SourceAnalyst` is the
  only place a judgement is made, and :class:`HeuristicAnalyst` — deterministic,
  file-name and frontmatter-key driven, no model — is the default. An
  LLM-backed analyst implements the same protocol and is injected; nothing in
  this module imports one, so discovery is testable, offline and repeatable.

**Once persisted, no analysis runs.** :func:`load_or_discover` reads the store
first and returns the configuration; the analyst is only consulted when there is
nothing configured. That is the difference between a configured source and a
per-start improvisation, and it is asserted rather than assumed (the test drives
it with an analyst that fails if it is called).

A programmatic adapter is proposed only with a stated reason: a
:class:`SourceProposal` of kind ``programmatic`` is rejected by its own validator
unless it carries the ``declarative_blocker`` that says which part of the source
a field mapping cannot express.
"""

from __future__ import annotations

import contextlib
import itertools
import json
import os
import tempfile
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.model import (
    RelationKind,
    RequirementLifecycle,
    requirement_sort_key,
)
from rotaris_core.requirements.sources.base import RequirementSourceError
from rotaris_core.requirements.sources.declarative import (
    DeclarativeSource,
    DeclarativeSourceConfig,
    NoMatchingArtifactsError,
    SourceDocument,
    read_document,
)
from rotaris_core.requirements.sources.generated import (
    GeneratedParserConfig,
    GeneratedParserSource,
)

#: What a proposal store holds: a field mapping, or the project's own parser
#: pinned by hash (SWR-3123). One file, one ``kind`` key, two shapes.
SourceConfiguration = DeclarativeSourceConfig | GeneratedParserConfig

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence
    from pathlib import Path

__all__ = [
    "AnalystAttempt",
    "ArtifactCandidate",
    "DiscoveryOutcome",
    "HeuristicAnalyst",
    "JsonProposalStore",
    "ProposalKind",
    "ProposalRejectedError",
    "ProposalStore",
    "ProposalValidation",
    "RepositorySurvey",
    "SourceAnalyst",
    "SourceConfiguration",
    "SourceLoad",
    "SourceProposal",
    "ValidationIssue",
    "ValidationIssueKind",
    "accept_proposal",
    "discover_source",
    "load_or_discover",
    "survey_repository",
    "validate_proposal",
]

#: Directory names never surveyed: build output, environments and version
#: control hold documents that look like specifications and are not.
DEFAULT_SKIP_DIRS: frozenset[str] = frozenset(
    {
        ".git",
        ".hg",
        ".svn",
        ".venv",
        "venv",
        "node_modules",
        "__pycache__",
        ".mypy_cache",
        ".pytest_cache",
        ".ruff_cache",
        "build",
        "dist",
        "site-packages",
        ".claude",
        ".rotaris",
    },
)

#: Frontmatter keys that plausibly carry a requirement id, most specific first.
ID_KEYS: tuple[str, ...] = (
    "req-id",
    "req_id",
    "requirement-id",
    "requirement_id",
    "id",
    "key",
    "identifier",
    "slug",
)

#: Keys that plausibly carry a lifecycle, a parent and a title.
LIFECYCLE_KEYS: tuple[str, ...] = ("status", "state", "lifecycle", "stage")
PARENT_KEYS: tuple[str, ...] = ("parent", "epic", "feature", "belongs-to")
TITLE_KEYS: tuple[str, ...] = ("title", "name", "summary")

#: Relation kinds a heuristic will map when the key is present, by frontmatter key.
RELATION_KEYS: tuple[tuple[RelationKind, tuple[str, ...]], ...] = (
    (RelationKind.DERIVED_FROM, ("derived-from", "derived_from")),
    (RelationKind.DEPENDS_ON, ("depends-on", "depends_on", "requires")),
    (RelationKind.SUPERSEDES, ("supersedes", "replaces")),
)

#: Files read per candidate while surveying. A survey must stay cheap on a large
#: repository; the count of matched files is exact, the key inventory is sampled.
SURVEY_READ_LIMIT = 40

#: Documents per candidate kept as prose, and how much of each (SWR-3121). A
#: frontmatter key inventory says nothing about a store that has no frontmatter,
#: and an agent asked to recognise prose has to be shown some. Bounded on both
#: axes because a survey travels into the desktop's state and into a prompt.
EXCERPT_DOCUMENTS = 3
EXCERPT_CHARS = 600


class ProposalKind(StrEnum):
    """Whether the proposal can be expressed as configuration."""

    DECLARATIVE = "declarative"
    PROGRAMMATIC = "programmatic"


class ValidationIssueKind(StrEnum):
    """Why a proposal must not be persisted."""

    NOT_DECLARATIVE = "not-declarative"
    UNREADABLE = "unreadable"
    DUPLICATE_ID = "duplicate-id"
    NO_REQUIREMENTS = "no-requirements"
    UNCLAIMED_ARTIFACT = "unclaimed-artifact"


class ProposalRejectedError(RuntimeError):
    """Raised when a proposal that did not validate is asked to be adopted."""


@traces(SWR.SWR_3106)
class ArtifactCandidate(BaseModel):
    """A directory that looks like it holds requirement documents.

    Reported with the evidence behind it — how many files, which frontmatter
    keys they carry, whether they have headings — because the user is asked to
    accept a mapping derived from exactly this, and a proposal whose grounds are
    invisible cannot be reviewed.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: The glob a declarative source would use for this candidate.
    glob: str
    #: Top-level directory, or ``""`` for documents at the repository root.
    directory: str
    file_count: int = 0
    #: How many of the sampled documents carried a frontmatter block.
    with_frontmatter: int = 0
    #: How many carried a Markdown heading.
    with_heading: int = 0
    #: Documents actually read (``<= file_count``, see :data:`SURVEY_READ_LIMIT`).
    sampled: int = 0
    #: Union of the frontmatter keys seen, sorted — the vocabulary a mapping can
    #: draw on.
    frontmatter_keys: tuple[str, ...] = ()
    #: A few paths, so the user recognises the tree being described. Display
    #: only: these are the first documents in survey order and carry no claim
    #: that a mapping reads any of them — see :meth:`samples_declaring`.
    sample_paths: tuple[str, ...] = ()
    #: Frontmatter keys per sampled document, in survey order. What separates
    #: "a path from this tree" from "a document this mapping can read", which
    #: :attr:`sample_paths` cannot express and a proposal's evidence needs.
    sampled_keys: tuple[tuple[str, tuple[str, ...]], ...] = ()
    #: ``(path, opening text)`` for the first few sampled documents (SWR-3121).
    #: The only part of a survey that describes a store with no frontmatter, and
    #: therefore the only thing an agent asked about one has to go on. Taken in
    #: survey order and truncated, so the same tree yields the same excerpts.
    excerpts: tuple[tuple[str, str], ...] = ()
    #: Documents whose frontmatter could not be parsed at all.
    unreadable: tuple[str, ...] = ()
    #: The lifecycle-ish key found, and the distinct values seen under it.
    #: Values matter as much as the key: a project whose statuses are ``open``
    #: and ``accepted`` needs a translation table, and proposing a mapping
    #: without one would produce a configuration that cannot be read.
    lifecycle_key: str = ""
    lifecycle_values: tuple[str, ...] = ()

    @property
    def looks_like_requirements(self) -> bool:
        """Whether a *frontmatter* heuristic has anything here to work with.

        Deliberately narrower than :attr:`holds_documents`: this is the question
        :class:`HeuristicAnalyst` asks, and its whole vocabulary is frontmatter
        keys.
        """
        return self.with_frontmatter > 0

    @property
    def holds_documents(self) -> bool:
        """Whether this directory holds structured documents at all (SWR-3121).

        The condition under which asking an agent is worth anything. A tree of
        plain Markdown scores zero on :attr:`looks_like_requirements` and is
        exactly the case an agent exists for; a directory with neither
        frontmatter nor headings is not a requirement store in any convention,
        and a model asked about one could only invent an answer.
        """
        return self.with_frontmatter > 0 or self.with_heading > 0

    def samples_declaring(self, key: str, limit: int = 3) -> tuple[str, ...]:
        """Sampled documents that actually carry *key*, at most *limit* of them.

        A proposal's ``evidence`` is checked by
        :func:`validate_proposal` against what the mapping really read, so it
        has to name documents the mapping can *claim*. Handing it
        :attr:`sample_paths` names whichever documents sort first — a
        ``CONVENTIONS.md`` beside the requirements is enough to refuse a mapping
        that reads every one of them correctly.
        """
        folded = key.casefold()
        matching = (
            path
            for path, keys in self.sampled_keys
            if any(candidate.casefold() == folded for candidate in keys)
        )
        return tuple(itertools.islice(matching, limit))


@traces(SWR.SWR_3106)
class RepositorySurvey(BaseModel):
    """What discovery found, before anyone judged what it means.

    Separated from the proposal on purpose: the survey is a fact about the
    repository, the proposal is an opinion about it. The seam between them is
    where an agent plugs in, and keeping the fact side pure is what lets the
    same survey be re-judged without touching the disk again.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    root: str
    scanned_files: int = 0
    #: Candidates in descending order of evidence, then by glob for stability.
    candidates: tuple[ArtifactCandidate, ...] = ()

    @property
    def best_candidate(self) -> ArtifactCandidate | None:
        """The candidate an analyst should look at first, if any."""
        return next(
            (candidate for candidate in self.candidates if candidate.looks_like_requirements),
            None,
        )

    @property
    def holds_documents(self) -> bool:
        """Whether anything here is worth asking an agent about (SWR-3121).

        False for a repository with no structured document in it. Asking a model
        about one cannot produce a finding, only an invention, and this runs on
        the path every workspace *without* a requirement store takes.
        """
        return any(candidate.holds_documents for candidate in self.candidates)

    def describe(self) -> str:
        """What was found, in the words the user is shown."""
        if not self.candidates:
            return f"No requirement-shaped documents found under {self.root}."
        lines = [f"Surveyed {self.scanned_files} document(s) under {self.root}:"]
        for candidate in self.candidates:
            keys = ", ".join(candidate.frontmatter_keys) or "none"
            lines.append(
                f"  {candidate.glob}: {candidate.file_count} file(s),"
                f" {candidate.with_frontmatter}/{candidate.sampled} with frontmatter"
                f" (keys: {keys})",
            )
        return "\n".join(lines)


@traces(SWR.SWR_3106)
class SourceProposal(BaseModel):
    """A configuration discovery suggests, with the grounds for it.

    ``programmatic`` exists so that "a field mapping cannot express this" is a
    statable answer rather than a bad declarative configuration. The validator
    below is what keeps it from becoming the easy way out: a programmatic
    proposal without a blocker is rejected where it is built.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: ProposalKind = ProposalKind.DECLARATIVE
    config: DeclarativeSourceConfig | None = None
    #: Why this mapping, in one or two sentences, for the confirmation screen.
    rationale: str = ""
    #: Files the proposal claims it can read. Validation checks every one of
    #: them actually produced a requirement.
    evidence: tuple[str, ...] = ()
    #: Required for a programmatic proposal: which part of the source a
    #: declarative mapping cannot express.
    declarative_blocker: str = ""

    @model_validator(mode="after")
    def _kind_and_payload_agree(self) -> Self:
        if self.kind is ProposalKind.DECLARATIVE:
            if self.config is None:
                raise ValueError("a declarative proposal carries the configuration it proposes")
            if self.declarative_blocker:
                raise ValueError(
                    "a declarative proposal cannot also state why a declarative"
                    " mapping is impossible",
                )
            return self
        if self.config is not None:
            raise ValueError("a programmatic proposal carries no declarative configuration")
        if not self.declarative_blocker.strip():
            raise ValueError(
                "a programmatic adapter is proposed only when the discovery states"
                " why a declarative mapping cannot express the source",
            )
        return self

    def describe(self) -> str:
        """What would be written, exactly as it would be written."""
        if self.config is None:
            return (
                f"Proposal: a programmatic adapter is needed.\n"
                f"  Reason: {self.declarative_blocker}\n"
                f"  {self.rationale}"
            )
        document = json.dumps(self.config.as_document(), indent=2, sort_keys=True)
        return f"Proposal: a declarative source.\n  {self.rationale}\n{document}"


@traces(SWR.SWR_3106)
class ValidationIssue(BaseModel):
    """One reason a proposal was not adopted, located in the tree."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: ValidationIssueKind
    message: str
    location: str | None = None
    req_id: str | None = None

    @property
    def line(self) -> str:
        """One line naming the fault and where it lives."""
        where = f" ({self.location})" if self.location else ""
        return f"{self.kind}: {self.message}{where}"


@traces(SWR.SWR_3106)
class ProposalValidation(BaseModel):
    """The result of loading a proposal against the real tree.

    A proposal is never trusted on inspection: it is *run*. Everything here is
    an observation of that run, which is why ``ok`` is derived from the issues
    rather than stored beside them — the two could not then disagree.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    requirement_ids: tuple[str, ...] = ()
    issues: tuple[ValidationIssue, ...] = ()
    #: Files the mapping matched but did not read as requirements, reported so a
    #: too-wide glob is visible before it is persisted.
    skipped: tuple[str, ...] = ()

    @property
    def ok(self) -> bool:
        """Whether this proposal may be persisted."""
        return not self.issues

    def describe(self) -> str:
        """The validation result, in the words the user is shown."""
        if self.ok:
            return f"Validated: {len(self.requirement_ids)} requirement(s), unique ids."
        lines = ["Rejected:"]
        lines.extend(f"  {issue.line}" for issue in self.issues)
        return "\n".join(lines)


@traces(SWR.SWR_3121)
class AnalystAttempt(BaseModel):
    """What one analyst was asked, and what came of it (SWR-3121).

    Failure is an answer. Without this, "no model is configured", "the model was
    unreachable", "the model answered nothing usable" and "the model was not
    worth asking here" are one silence, and a user looking at a repository
    Rotaris could not describe cannot tell which of them happened — or whether
    configuring a persona would change anything.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: How this analyst is named to a user — a persona and model, or a class.
    label: str
    #: False when the chain decided not to ask; :attr:`note` says why.
    consulted: bool = True
    #: Whether it answered with a proposal at all.
    proposed: bool = False
    #: Whether that proposal survived being loaded against the real tree.
    accepted: bool = False
    #: Why it was not asked, or why what it said did not stand.
    note: str = ""

    @property
    def line(self) -> str:
        """One line, in the words the user is shown."""
        if not self.consulted:
            return f"  {self.label}: not consulted — {self.note or 'not needed here'}"
        if not self.proposed:
            return f"  {self.label}: no proposal — {self.note or 'nothing could be said'}"
        verdict = "adopted" if self.accepted else "did not validate"
        return f"  {self.label}: proposed, {verdict}"


@traces(SWR.SWR_3106, SWR.SWR_3121)
class DiscoveryOutcome(BaseModel):
    """Survey, proposal and validation as one reviewable answer.

    This is what the user sees before anything is written — and it is all they
    need to see: what was found, who was asked, what would be written, and
    whether loading it actually worked.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    survey: RepositorySurvey
    proposal: SourceProposal | None = None
    validation: ProposalValidation | None = None
    #: Every analyst the chain ran, in the order it ran them (SWR-3121).
    attempts: tuple[AnalystAttempt, ...] = ()

    @property
    def is_acceptable(self) -> bool:
        """Whether there is a validated declarative configuration to adopt."""
        return (
            self.proposal is not None
            and self.proposal.config is not None
            and self.validation is not None
            and self.validation.ok
        )

    def summary(self) -> str:
        """Everything the confirmation step shows, in order."""
        parts = [self.survey.describe()]
        if self.attempts:
            parts.append(
                "\n".join(("Analysts:", *(attempt.line for attempt in self.attempts))),
            )
        if self.proposal is None:
            parts.append("Proposal: none — no analyst could describe this repository.")
        else:
            parts.append(self.proposal.describe())
        if self.validation is not None:
            parts.append(self.validation.describe())
        return "\n".join(parts)


@runtime_checkable
class SourceAnalyst(Protocol):
    """Whatever turns a survey into a proposal (SWR-3106).

    The single injection point for judgement. A deterministic heuristic and an
    LLM-backed analyst are the same shape here, so discovery can be exercised —
    and tested — without a model, and swapping one for the other costs no change
    in any caller.
    """

    def propose(self, survey: RepositorySurvey) -> SourceProposal | None:
        """A proposal for *survey*, or ``None`` when nothing can be said."""
        ...


# --------------------------------------------------------------------------
# Surveying (filesystem in, data out)
# --------------------------------------------------------------------------


def _candidate_glob(directory: str, extension: str) -> str:
    return f"*{extension}" if not directory else f"{directory}/**/*{extension}"


def _is_skipped(relative_parts: Sequence[str], skip_dirs: frozenset[str]) -> bool:
    return any(part in skip_dirs for part in relative_parts[:-1])


@traces(SWR.SWR_3106)
def survey_repository(
    root: Path,
    *,
    extensions: Iterable[str] = (".md",),
    skip_dirs: frozenset[str] = DEFAULT_SKIP_DIRS,
    max_samples: int = 3,
    read_limit: int = SURVEY_READ_LIMIT,
    excerpt_documents: int = EXCERPT_DOCUMENTS,
    excerpt_chars: int = EXCERPT_CHARS,
) -> RepositorySurvey:
    """Name the requirement-shaped artefacts under *root*.

    Groups documents by their top-level directory — the granularity a
    declarative glob works at — and reads a bounded sample of each group to learn
    its frontmatter vocabulary, and to keep a little of its prose (SWR-3121) for
    the stores that have no vocabulary to learn. Deterministic: paths are
    ordered, samples and excerpts are the first ones in that order, and nothing
    depends on directory iteration order.

    Reads files and nothing else: no model, no network, no writes.
    """
    if not root.is_dir():
        raise RequirementSourceError("discovery", "repository root not found", location=str(root))
    suffixes = tuple(extensions)
    grouped: dict[str, list[Path]] = {}
    scanned = 0
    for path in sorted(root.rglob("*"), key=lambda item: item.as_posix()):
        if not path.is_file() or path.suffix not in suffixes:
            continue
        relative = path.relative_to(root)
        if _is_skipped(relative.parts, skip_dirs):
            continue
        scanned += 1
        directory = relative.parts[0] if len(relative.parts) > 1 else ""
        grouped.setdefault(directory, []).append(path)

    candidates = [
        _candidate_for(
            root,
            directory,
            paths,
            suffixes[0],
            max_samples,
            read_limit,
            excerpt_documents,
            excerpt_chars,
        )
        for directory, paths in sorted(grouped.items())
    ]
    candidates.sort(key=lambda item: (-item.with_frontmatter, -item.file_count, item.glob))
    return RepositorySurvey(
        root=root.as_posix(),
        scanned_files=scanned,
        candidates=tuple(candidates),
    )


def _excerpt(document: SourceDocument, limit: int) -> str:
    """A document's opening text, normalised and bounded (SWR-3121).

    The heading and body rather than the raw file: an agent reading this is
    being asked what marks a requirement and where its id lives, and a
    frontmatter block it has already been told about in full would spend the
    budget saying it twice.
    """
    opening = "\n".join(part for part in (document.heading, document.body) if part).strip()
    if len(opening) <= limit:
        return opening
    return opening[:limit].rstrip() + "…"


def _candidate_for(
    root: Path,
    directory: str,
    paths: Sequence[Path],
    extension: str,
    max_samples: int,
    read_limit: int,
    excerpt_documents: int = EXCERPT_DOCUMENTS,
    excerpt_chars: int = EXCERPT_CHARS,
) -> ArtifactCandidate:
    relatives = [path.relative_to(root).as_posix() for path in paths]
    keys: set[str] = set()
    unreadable: list[str] = []
    statuses: dict[str, set[str]] = {}
    sampled_keys: list[tuple[str, tuple[str, ...]]] = []
    excerpts: list[tuple[str, str]] = []
    with_frontmatter = 0
    with_heading = 0
    sampled = 0
    for path, relative in list(zip(paths, relatives, strict=True))[:read_limit]:
        document = _survey_document(path, relative)
        sampled += 1
        if document is None:
            unreadable.append(relative)
            continue
        if document.has_frontmatter:
            with_frontmatter += 1
            keys.update(document.frontmatter)
            sampled_keys.append((relative, tuple(sorted(document.frontmatter))))
            _collect_statuses(document, statuses)
        if document.heading:
            with_heading += 1
        # Costs nothing to gather: the document has already been read in full.
        if len(excerpts) < excerpt_documents:
            excerpts.append((relative, _excerpt(document, excerpt_chars)))
    lifecycle_key = _first_present(LIFECYCLE_KEYS, sorted(keys))
    return ArtifactCandidate(
        glob=_candidate_glob(directory, extension),
        directory=directory,
        file_count=len(paths),
        with_frontmatter=with_frontmatter,
        with_heading=with_heading,
        sampled=sampled,
        frontmatter_keys=tuple(sorted(keys)),
        sample_paths=tuple(relatives[:max_samples]),
        sampled_keys=tuple(sampled_keys),
        excerpts=tuple(excerpts),
        unreadable=tuple(unreadable),
        lifecycle_key=lifecycle_key or "",
        lifecycle_values=tuple(sorted(statuses.get(lifecycle_key or "", set()))),
    )


def _collect_statuses(document: SourceDocument, statuses: dict[str, set[str]]) -> None:
    """Record the distinct values seen under each lifecycle-ish frontmatter key."""
    for key in LIFECYCLE_KEYS:
        value = document.frontmatter.get(key)
        if isinstance(value, str) and value.strip():
            statuses.setdefault(key, set()).add(value.strip())


def _survey_document(path: Path, relative: str) -> SourceDocument | None:
    """A document decomposed the same way the declarative source will do it.

    Reusing :func:`~rotaris_core.requirements.sources.declarative.read_document`
    is what makes a survey's evidence honest: what discovery saw and what the
    proposed source will see are the same reading of the same file.
    """
    try:
        return read_document(path, relative, source_id="discovery")
    except RequirementSourceError:
        return None


# --------------------------------------------------------------------------
# The default, model-free analyst
# --------------------------------------------------------------------------


def _first_present(keys: Iterable[str], available: Sequence[str]) -> str | None:
    lookup = {key.casefold() for key in available}
    return next((key for key in keys if key.casefold() in lookup), None)


@traces(SWR.SWR_3106)
class HeuristicAnalyst:
    """The default analyst: frontmatter keys in, a mapping out, no model.

    It knows the vocabulary requirement stores actually use (``req-id``, ``id``,
    ``status``, ``epic``) and nothing else. When the best candidate carries no
    key that could be an id, it says so as a ``programmatic`` proposal naming the
    keys it did find — which is the honest answer, and the one SWR-3106 requires
    before a programmatic adapter may be suggested.
    """

    def __init__(
        self,
        *,
        source_id: str = "discovered",
        id_keys: Sequence[str] = ID_KEYS,
    ) -> None:
        self._source_id = source_id
        self._id_keys = tuple(id_keys)

    def propose(self, survey: RepositorySurvey) -> SourceProposal | None:
        candidate = survey.best_candidate
        if candidate is None:
            return None
        id_key = _first_present(self._id_keys, candidate.frontmatter_keys)
        if id_key is None:
            found = ", ".join(candidate.frontmatter_keys) or "no frontmatter keys at all"
            return SourceProposal(
                kind=ProposalKind.PROGRAMMATIC,
                rationale=(
                    f"{candidate.file_count} document(s) under {candidate.glob} look like"
                    " specifications, but none of them names a requirement id in its"
                    " frontmatter."
                ),
                evidence=candidate.sample_paths,
                declarative_blocker=(
                    f"no frontmatter key in {candidate.glob} identifies a requirement"
                    f" (found: {found}); a field mapping has nothing to read an id from"
                ),
            )
        config = self._config_for(candidate, id_key)
        return SourceProposal(
            kind=ProposalKind.DECLARATIVE,
            config=config,
            rationale=(
                f"{candidate.file_count} document(s) under {candidate.glob} carry"
                f" frontmatter; {id_key!r} identifies each requirement."
                + self._lifecycle_note(candidate)
            ),
            # Documents that carry the id key, never merely the first paths in
            # the tree: evidence is a claim validation checks by reading, and a
            # glossary sorting ahead of the requirements would refuse a mapping
            # that reads all of them.
            evidence=candidate.samples_declaring(id_key),
        )

    @staticmethod
    def _maps_lifecycle(candidate: ArtifactCandidate) -> bool:
        """Whether the project's own status vocabulary is already canonical.

        A heuristic can recognise a status *key*; deciding that ``accepted``
        means ``approved`` is a judgement, and this analyst does not make it. An
        unknown vocabulary therefore leaves ``status`` unmapped — every
        requirement lands on ``draft`` and the user is told to add a
        ``status-values`` table — rather than producing a configuration that
        raises on the first document it reads.
        """
        if not candidate.lifecycle_key or not candidate.lifecycle_values:
            return False
        canonical = {str(item) for item in RequirementLifecycle}
        return all(value.casefold() in canonical for value in candidate.lifecycle_values)

    def _lifecycle_note(self, candidate: ArtifactCandidate) -> str:
        if not candidate.lifecycle_key or self._maps_lifecycle(candidate):
            return ""
        seen = ", ".join(candidate.lifecycle_values) or "no values"
        return (
            f" The {candidate.lifecycle_key!r} values ({seen}) are not Rotaris"
            " lifecycles; add a 'status-values' mapping to use them."
        )

    def _config_for(self, candidate: ArtifactCandidate, id_key: str) -> DeclarativeSourceConfig:
        keys = candidate.frontmatter_keys
        mapping: dict[str, object] = {
            "source-id": self._source_id,
            "type": "markdown",
            "glob": candidate.glob,
            "id": f"frontmatter.{id_key}",
            "title": self._title_expression(candidate, keys),
        }
        if self._maps_lifecycle(candidate):
            mapping["status"] = f"frontmatter.{candidate.lifecycle_key}"
        parent_key = _first_present(PARENT_KEYS, keys)
        if parent_key is not None:
            mapping["parent"] = f"frontmatter.{parent_key}"
        if candidate.with_heading:
            mapping["description"] = "body"
        relations = {
            str(kind): f"frontmatter.{key}"
            for kind, candidates in RELATION_KEYS
            if (key := _first_present(candidates, keys)) is not None
        }
        if relations:
            mapping["relations"] = relations
        return DeclarativeSourceConfig.model_validate(mapping)

    @staticmethod
    def _title_expression(candidate: ArtifactCandidate, keys: Sequence[str]) -> str:
        title_key = _first_present(TITLE_KEYS, keys)
        if candidate.with_heading >= candidate.with_frontmatter or title_key is None:
            return "heading"
        return f"frontmatter.{title_key}"


# --------------------------------------------------------------------------
# Validating, proposing, accepting
# --------------------------------------------------------------------------


@traces(SWR.SWR_3106)
def validate_proposal(root: Path, proposal: SourceProposal) -> ProposalValidation:
    """Load the proposal against the real tree and report what happened.

    Validation is a real read, not an inspection: the configuration has to parse
    the files it claims and produce unique ids, because those are exactly the
    two ways a plausible-looking mapping destroys a board — by dropping the
    documents it cannot read, and by collapsing several requirements onto one id.
    """
    if proposal.config is None:
        return ProposalValidation(
            issues=(
                ValidationIssue(
                    kind=ValidationIssueKind.NOT_DECLARATIVE,
                    message=(
                        "a programmatic adapter cannot be validated by loading it:"
                        f" {proposal.declarative_blocker}"
                    ),
                ),
            ),
        )

    source = DeclarativeSource(root, proposal.config)
    try:
        read = source.read()
    except NoMatchingArtifactsError as error:
        # The tree is readable and the glob is wrong — the commonest way a
        # proposal is plausible and useless at once.
        return ProposalValidation(
            issues=(
                ValidationIssue(
                    kind=ValidationIssueKind.NO_REQUIREMENTS,
                    message=str(error),
                    location=error.location,
                ),
            ),
        )
    except RequirementSourceError as error:
        return ProposalValidation(
            issues=(
                ValidationIssue(
                    kind=ValidationIssueKind.UNREADABLE,
                    message=str(error),
                    location=error.location,
                ),
            ),
        )

    issues: list[ValidationIssue] = []
    first_seen: dict[str, str] = {}
    for requirement in read.requirements:
        previous = first_seen.setdefault(requirement.req_id, requirement.source_path or "")
        if previous != (requirement.source_path or ""):
            issues.append(
                ValidationIssue(
                    kind=ValidationIssueKind.DUPLICATE_ID,
                    message=(
                        f"requirement id {requirement.req_id} is produced by two documents"
                        f" ({previous} and {requirement.source_path})"
                    ),
                    location=requirement.source_path,
                    req_id=requirement.req_id,
                ),
            )
    if not read.requirements:
        issues.append(
            ValidationIssue(
                kind=ValidationIssueKind.NO_REQUIREMENTS,
                message=f"the glob {proposal.config.glob!r} produced no requirements",
            ),
        )

    read_paths = {requirement.source_path for requirement in read.requirements}
    issues.extend(
        ValidationIssue(
            kind=ValidationIssueKind.UNCLAIMED_ARTIFACT,
            message="the proposal claims this document but the mapping reads no requirement from it",
            location=claimed,
        )
        for claimed in proposal.evidence
        if claimed not in read_paths
    )

    return ProposalValidation(
        requirement_ids=tuple(sorted(first_seen, key=requirement_sort_key)),
        issues=tuple(issues),
        skipped=tuple(issue.location for issue in read.issues if issue.location),
    )


def _analyst_label(analyst: SourceAnalyst) -> str:
    """How *analyst* is named to a user: its own label, else its class."""
    label = getattr(analyst, "label", "")
    return str(label) if label else type(analyst).__name__


def _wants_judgement(analyst: SourceAnalyst) -> bool:
    """Whether asking *analyst* costs a model call (SWR-3121).

    Analysts declare this about themselves rather than discovery guessing from
    their type, so a second model-backed analyst needs no change here — and the
    deterministic default is the safe one for anything that says nothing.
    """
    return bool(getattr(analyst, "consults_a_model", False))


def _better_refusal(
    current: tuple[SourceProposal, ProposalValidation] | None,
    candidate: tuple[SourceProposal, ProposalValidation],
) -> tuple[SourceProposal, ProposalValidation]:
    """The more informative of two proposals that both failed to validate.

    A chain that reported its *last* refusal would hide a mapping that read
    nine-tenths of the store behind one that read none. Ranked by what it
    actually produced, then by how little it got wrong — total over the pair, so
    the answer does not depend on the order they arrived in.
    """
    if current is None:
        return candidate

    def rank(pair: tuple[SourceProposal, ProposalValidation]) -> tuple[int, int]:
        return len(pair[1].requirement_ids), -len(pair[1].issues)

    return candidate if rank(candidate) > rank(current) else current


@traces(SWR.SWR_3106, SWR.SWR_3121)
def discover_source(
    root: Path,
    analyst: SourceAnalyst | Sequence[SourceAnalyst],
    *,
    survey: RepositorySurvey | None = None,
) -> DiscoveryOutcome:
    """Survey, propose, validate — and write nothing.

    The whole discovery run, returning what a confirmation step needs to show.
    Adopting the result is :func:`accept_proposal`, deliberately a second call
    with a second argument: nothing here can persist a configuration by accident.

    Given several analysts, they are tried **in order and each proposal is
    validated before the next is considered** (SWR-3121). That ordering is the
    whole escalation rule: the deterministic analyst goes first and costs
    nothing, and a model is reached only where determinism produced nothing a
    user could adopt. Deciding that needs the validation, which is why the chain
    lives here rather than inside an analyst — this is the only place that holds
    the tree the proposal has to load against.

    A model is not asked about a repository holding no structured document at
    all: it could only invent an answer, and this path is taken by every
    workspace *without* a requirement store.
    """
    resolved = survey if survey is not None else survey_repository(root)
    analysts: Sequence[SourceAnalyst] = (
        (analyst,) if isinstance(analyst, SourceAnalyst) else tuple(analyst)
    )
    attempts: list[AnalystAttempt] = []
    refusal: tuple[SourceProposal, ProposalValidation] | None = None

    for candidate in analysts:
        label = _analyst_label(candidate)
        if _wants_judgement(candidate) and not resolved.holds_documents:
            attempts.append(
                AnalystAttempt(
                    label=label,
                    consulted=False,
                    note="no document under this repository carries a heading or frontmatter",
                ),
            )
            continue
        proposal = candidate.propose(resolved)
        if proposal is None:
            attempts.append(
                AnalystAttempt(label=label, proposed=False, note=_no_proposal_note(candidate)),
            )
            continue
        validation = validate_proposal(root, proposal)
        attempts.append(
            AnalystAttempt(label=label, proposed=True, accepted=validation.ok),
        )
        if validation.ok:
            return DiscoveryOutcome(
                survey=resolved,
                proposal=proposal,
                validation=validation,
                attempts=tuple(attempts),
            )
        refusal = _better_refusal(refusal, (proposal, validation))

    if refusal is None:
        return DiscoveryOutcome(survey=resolved, attempts=tuple(attempts))
    return DiscoveryOutcome(
        survey=resolved,
        proposal=refusal[0],
        validation=refusal[1],
        attempts=tuple(attempts),
    )


def _no_proposal_note(analyst: SourceAnalyst) -> str:
    """Why an analyst that answered nothing answered nothing, if it says."""
    return str(getattr(analyst, "unavailable_reason", "") or "")


@runtime_checkable
class ProposalStore(Protocol):
    """Where an accepted configuration is persisted and read back."""

    def load(self) -> SourceConfiguration | None:
        """The configured source, or ``None`` when nothing is configured."""
        ...

    def save(self, config: SourceConfiguration) -> None:
        """Persist *config* as the workspace's requirement source."""
        ...


@traces(SWR.SWR_3106, SWR.SWR_3123)
class JsonProposalStore:
    """An accepted configuration as one JSON document.

    Written atomically (temporary file plus ``os.replace``) so an interrupted
    write cannot leave a workspace configured with half a mapping, and with
    sorted keys and LF endings so the file a user reviews is the file that lands
    — twice in a row, byte for byte.

    Holds configuration only. No requirement text is copied here (SWR-3114) and
    **no parser text either** (SWR-3123): what is stored is *how* to read the
    project's own store — a field mapping, or the path and pinned hash of the
    project's own parser — never a duplicate of either.

    The document's ``kind`` decides which configuration it is, and its absence
    means ``declarative``, so every file written before the key existed keeps
    loading unchanged.
    """

    def __init__(self, path: Path) -> None:
        self._path = path

    @property
    def path(self) -> Path:
        """Where the configuration is written."""
        return self._path

    def load(self) -> SourceConfiguration | None:
        if not self._path.is_file():
            return None
        try:
            data: object = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise RequirementSourceError(
                "discovery",
                f"persisted requirement source could not be read ({error})",
                location=str(self._path),
            ) from error
        kind = data.pop("kind", "declarative") if isinstance(data, dict) else "declarative"
        try:
            if kind == "programmatic":
                return GeneratedParserConfig.model_validate(data)
            if kind != "declarative":
                raise RequirementSourceError(
                    "discovery",
                    f"persisted requirement source declares unknown kind {kind!r}",
                    location=str(self._path),
                )
            return DeclarativeSourceConfig.model_validate(data)
        except ValidationError as error:
            raise RequirementSourceError(
                "discovery",
                f"persisted requirement source is not a valid configuration ({error})",
                location=str(self._path),
            ) from error

    def save(self, config: SourceConfiguration) -> None:
        payload = json.dumps(config.as_document(), indent=2, sort_keys=True) + "\n"
        self._path.parent.mkdir(parents=True, exist_ok=True)
        handle, name = tempfile.mkstemp(dir=str(self._path.parent), suffix=".tmp")
        try:
            with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
                stream.write(payload)
            os.replace(name, self._path)
        except BaseException:
            with contextlib.suppress(OSError):
                os.unlink(name)
            raise


@traces(SWR.SWR_3106)
def accept_proposal(outcome: DiscoveryOutcome, store: ProposalStore) -> DeclarativeSourceConfig:
    """Adopt a validated proposal — the only path from proposal to persistence.

    Raises :class:`ProposalRejectedError`, carrying the reasons, for anything that did
    not validate. That is the whole guarantee of SWR-3106: a mapping that
    produced duplicate ids or could not read the files it claimed cannot be
    persisted, however confident whatever produced it was.
    """
    if outcome.proposal is None or outcome.proposal.config is None or outcome.validation is None:
        raise ProposalRejectedError(
            "there is no validated declarative configuration to adopt:\n" + outcome.summary(),
        )
    if not outcome.validation.ok:
        raise ProposalRejectedError(
            "the proposed requirement source did not validate:\n" + outcome.validation.describe(),
        )
    store.save(outcome.proposal.config)
    return outcome.proposal.config


@traces(SWR.SWR_3106)
class SourceLoad(BaseModel):
    """How a workspace's requirement source was obtained on this start.

    ``analysed`` is the field that makes "once persisted, subsequent loads run
    no analysis" checkable from the outside instead of inferred from timings.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    config: SourceConfiguration | None = None
    #: True only when the analyst was consulted on this call.
    analysed: bool = False
    outcome: DiscoveryOutcome | None = Field(default=None)

    def source(self, root: Path) -> DeclarativeSource | GeneratedParserSource | None:
        """The configured source, or ``None`` when nothing is configured yet.

        Which adapter follows from which configuration was persisted (SWR-3123):
        a field mapping loads declaratively, a pinned parser loads through the
        parser host. Both answer the same :class:`RequirementSource` protocol,
        so nothing downstream cares which it got.
        """
        if self.config is None:
            return None
        if isinstance(self.config, GeneratedParserConfig):
            return GeneratedParserSource(root, self.config)
        return DeclarativeSource(root, self.config)


@traces(SWR.SWR_3106)
def load_or_discover(
    root: Path,
    store: ProposalStore,
    analyst: SourceAnalyst | Sequence[SourceAnalyst],
) -> SourceLoad:
    """The configured source if there is one, otherwise a proposal for one.

    The store is consulted *first*, and a hit returns without touching the
    analyst — an accepted configuration is the end of discovery for that
    workspace, not a hint to be re-derived on every start (SWR-3106) and not a
    place non-determinism can creep back in (SWR-3104).
    """
    configured = store.load()
    if configured is not None:
        return SourceLoad(config=configured, analysed=False)
    return SourceLoad(analysed=True, outcome=discover_source(root, analyst))
