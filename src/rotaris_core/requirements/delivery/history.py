"""The revision history of a requirement, assembled on read (SWR-3214).

Rotaris must not keep a second history of requirement text. Git already has one,
and so does whichever source the requirement came from; copying it would be a
store of requirement content (SWR-3114) that starts drifting the day someone
edits a file outside Rotaris. What Rotaris *can* do — and what nothing else can —
is **join** the two histories it sits between:

```text
the source's own history   →  which text existed when, in which commit
Rotaris' recorded hashes   →  which version Rotaris saw and acted on
the satisfied log          →  which run delivered which version, at which commit
```

The result is one ordered list answering the question a reviewer actually asks:
*this sentence changed in March — was it ever implemented, by which run, and does
the code still match it?*

**Distinct from the audit trail, deliberately.**
:mod:`~rotaris_core.requirements.delivery.audit` records what *Rotaris did* —
state moves, runs, verifications — each event append-only and owned by Rotaris.
This module records what the *requirement was* — versions of the project's own
text, owned by the project and read from it. They are separate because their
owners are separate: an audit entry is a fact about Rotaris that must never be
recomputed, while a revision entry is a projection that must always be recomputed
so it cannot go stale against the store. The audit trail is an input here, never
the other way round.

**Assembled, never stored.** :func:`build_revision_history` is pure: it takes
revisions, recorded hashes and deliveries as values and returns the joined list.
The one impure part — asking git what touched a file — lives in
:class:`GitArtifactRevisions`, behind :class:`ArtifactRevisions`, so the join is
testable without a repository and a store kept somewhere other than git can be
plugged in.

**What is missing stays visible.** A revision that was never delivered appears
with no run and no commit rather than being dropped, because "this version was
never implemented" is the most important thing this list can say. A repository
with no history at all yields the hashes Rotaris recorded and states that source
history is unavailable, rather than pretending the requirement has always looked
the way it looks now.
"""

from __future__ import annotations

import datetime as dt
import logging
import subprocess
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict, field_validator

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Sequence
    from pathlib import Path

    from rotaris_core.requirements.delivery.audit import AuditTrail
    from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery

_log = logging.getLogger(__name__)

__all__ = [
    "GIT_LOG_FORMAT",
    "ArtifactRevision",
    "ArtifactRevisions",
    "GitArtifactRevisions",
    "RecordedHash",
    "RevisionEntry",
    "RevisionHistory",
    "RevisionOrigin",
    "RevisionOutcome",
    "build_revision_history",
    "recorded_hashes",
    "resolve_hashes",
    "revisions_from_log",
]

#: How long a history read may take before it is abandoned. A history that hangs
#: must not hang the board.
_GIT_TIMEOUT_S = 20.0

#: Field separator for ``git log --format``: a unit separator cannot occur in a
#: commit subject, which a tab or a pipe can.
_FIELD_SEP = "\x1f"

#: The ``git log --format`` this module asks for, published because
#: :func:`revisions_from_log` is only meaningful against output shaped like it.
GIT_LOG_FORMAT = f"%H{_FIELD_SEP}%cI{_FIELD_SEP}%an{_FIELD_SEP}%s"

#: Sorting sentinel for an entry whose time is unknown. Such an entry sorts
#: *last* — an unknown time is most plausibly the working tree's, and putting it
#: first would claim the current text predates every commit.
_UNDATED = dt.datetime.max.replace(tzinfo=dt.UTC)


class RevisionOrigin(StrEnum):
    """Where a revision entry came from."""

    #: The source's own history — a git commit that touched the artefact.
    ARTEFACT_REVISION = "artefact-revision"
    #: A hash Rotaris recorded itself, for a version the source's history did not
    #: yield (an unversioned store, a squashed branch, a tracker without history).
    RECORDED_HASH = "recorded-hash"
    #: The text as it is now, in no revision Rotaris knows — most often an edit
    #: that has not been committed yet.
    WORKING_TREE = "working-tree"


class RevisionOutcome(StrEnum):
    """What became of one revision of the requirement."""

    DELIVERED = "delivered"
    #: No run ever recorded this version as delivered. Kept in the list rather
    #: than omitted: an undelivered revision is the interesting one (SWR-3214).
    NOT_DELIVERED = "not-delivered"


@traces(SWR.SWR_3214)
class ArtifactRevision(BaseModel):
    """One revision of the requirement's artefact, as its source reports it.

    ``requirement_hash`` is empty when the caller did not resolve the text at
    that revision. That is a real state and not an error: reading every historic
    version costs a parse per commit, and a caller may reasonably decide to
    resolve only the ones it needs (see :func:`resolve_hashes`).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: The source's revision token — a git commit sha, a tracker revision.
    revision: str
    at: dt.datetime | None = None
    author: str = ""
    #: The revision's own one-line description, from the source. Never persisted
    #: by Rotaris — this whole model is built on read (SWR-3114).
    subject: str = ""
    requirement_hash: str = ""

    @field_validator("at")
    @classmethod
    def _aware(cls, value: dt.datetime | None) -> dt.datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("a revision timestamp is aware, never naive")
        return value


@traces(SWR.SWR_3214)
class RecordedHash(BaseModel):
    """A requirement version Rotaris itself saw, and when it saw it.

    Read out of the audit trail (SWR-3213) and the satisfied log (SWR-3204) by
    :func:`recorded_hashes`. These are what a store without git history has to
    offer, and they are why such a store still gets a usable history.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    requirement_hash: str
    at: dt.datetime
    source_revision: str | None = None

    @field_validator("requirement_hash")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("a recorded hash names the version it recorded")
        return cleaned

    @field_validator("at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise ValueError("a recorded hash carries an aware timestamp, never a naive one")
        return value


@traces(SWR.SWR_3214)
class RevisionEntry(BaseModel):
    """One version of a requirement, and what became of it.

    Two commits, and they answer different questions: :attr:`artefact_commit` is
    where the *text* of this version came from, :attr:`implementing_commit` is
    where its *implementation* was verified. Merging them would make an edited
    requirement look implemented by the commit that edited it.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: The version's content hash (SWR-3107). Empty when the source reported a
    #: revision whose text Rotaris did not resolve.
    requirement_hash: str = ""
    #: When this version came into being, as far as anything knows. ``None`` for
    #: a version nobody dated — an uncommitted edit, most often.
    at: dt.datetime | None = None
    origin: RevisionOrigin = RevisionOrigin.RECORDED_HASH
    #: The source revision that introduced this version.
    artefact_commit: str | None = None
    source_revision: str | None = None
    author: str = ""
    subject: str = ""
    #: The run that delivered this version, or ``None`` when none did.
    run_id: str | None = None
    #: The commit whose verification passed for that run (SWR-3410).
    implementing_commit: str | None = None
    delivered_at: dt.datetime | None = None
    #: Whether this is the version the specification currently holds.
    current: bool = False

    @property
    def outcome(self) -> RevisionOutcome:
        """Whether a run ever delivered this version."""
        return RevisionOutcome.DELIVERED if self.run_id else RevisionOutcome.NOT_DELIVERED

    @property
    def delivered(self) -> bool:
        """Shorthand for ``outcome is DELIVERED``."""
        return self.run_id is not None

    @property
    def summary(self) -> str:
        """One line for the history panel (SWR-3313)."""
        when = self.at.date().isoformat() if self.at is not None else "undated"
        version = self.requirement_hash or (self.artefact_commit or "unknown version")
        delivery = (
            f"delivered by run {self.run_id}"
            + (f" at {self.implementing_commit}" if self.implementing_commit else "")
            if self.run_id
            else "never delivered"
        )
        current = " (current)" if self.current else ""
        return f"{when} {version}: {delivery}{current}"


@traces(SWR.SWR_3214)
class RevisionHistory(BaseModel):
    """Every known version of one requirement, oldest first.

    :attr:`source_history_available` is part of the answer rather than an
    exception: a workspace whose store is not under version control still gets
    the versions Rotaris recorded, and is told plainly that the rest is missing
    instead of being shown a one-entry history that looks complete.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    entries: tuple[RevisionEntry, ...] = ()
    source_history_available: bool = True
    #: Why the source's history is missing, when it is.
    unavailable_reason: str = ""

    @property
    def current(self) -> RevisionEntry | None:
        """The entry for the version the specification currently holds."""
        return next((entry for entry in self.entries if entry.current), None)

    @property
    def hashes(self) -> tuple[str, ...]:
        """Every known version hash, oldest first, blanks omitted."""
        return tuple(entry.requirement_hash for entry in self.entries if entry.requirement_hash)

    @property
    def delivered(self) -> tuple[RevisionEntry, ...]:
        """The versions a run delivered."""
        return tuple(entry for entry in self.entries if entry.delivered)

    @property
    def undelivered(self) -> tuple[RevisionEntry, ...]:
        """The versions no run ever delivered — the ones worth looking at."""
        return tuple(entry for entry in self.entries if not entry.delivered)

    def entry_for(self, requirement_hash: str) -> RevisionEntry | None:
        """The entry for one version, or ``None``."""
        wanted = requirement_hash.strip()
        return next(
            (entry for entry in self.entries if entry.requirement_hash == wanted),
            None,
        )

    @property
    def summary(self) -> str:
        """One line: how many versions, how many delivered, and what is missing."""
        missing = "" if self.source_history_available else "; source history unavailable"
        return (
            f"{self.req_id}: {len(self.entries)} revision(s),"
            f" {len(self.delivered)} delivered{missing}"
        )


def _sort_key(entry: RevisionEntry) -> tuple[dt.datetime, str]:
    return (entry.at or _UNDATED, entry.requirement_hash)


class _Draft:
    """A revision under assembly, keyed by hash or — lacking one — by revision."""

    def __init__(self, key: str) -> None:
        self.key = key
        self.requirement_hash = ""
        self.at: dt.datetime | None = None
        self.origin = RevisionOrigin.RECORDED_HASH
        self.artefact_commit: str | None = None
        self.source_revision: str | None = None
        self.author = ""
        self.subject = ""
        self.run_id: str | None = None
        self.implementing_commit: str | None = None
        self.delivered_at: dt.datetime | None = None

    def saw(self, at: dt.datetime | None) -> None:
        """Record the earliest moment this version is known to have existed."""
        if at is not None and (self.at is None or at < self.at):
            self.at = at

    def entry(self, *, current: bool) -> RevisionEntry:
        return RevisionEntry(
            requirement_hash=self.requirement_hash,
            at=self.at,
            origin=self.origin,
            artefact_commit=self.artefact_commit,
            source_revision=self.source_revision,
            author=self.author,
            subject=self.subject,
            run_id=self.run_id,
            implementing_commit=self.implementing_commit,
            delivered_at=self.delivered_at,
            current=current,
        )


@traces(SWR.SWR_3214)
def build_revision_history(
    req_id: str,
    *,
    current_hash: str = "",
    revisions: Sequence[ArtifactRevision] = (),
    recorded: Sequence[RecordedHash] = (),
    deliveries: Sequence[SatisfiedDelivery] = (),
    source_history_available: bool = True,
    unavailable_reason: str = "",
    current_at: dt.datetime | None = None,
) -> RevisionHistory:
    """Join the source's revisions, Rotaris' hashes and its deliveries.

    Pure: no git, no store, no clock. Entries are keyed by requirement hash where
    one is known, so a version that appears in a commit *and* in the audit trail
    *and* in the satisfied log is one entry carrying all three facts. A revision
    whose text was never resolved keeps its own entry — the artefact moved, and
    saying nothing about it would be a gap the user cannot see.

    The current version is always represented: when ``current_hash`` matches no
    assembled entry, one is appended for it, dated ``current_at`` (which may be
    ``None``, and then sorts last). That is what an uncommitted edit looks like,
    and it is the state in which the board most needs to say "this version was
    never delivered".
    """
    drafts: dict[str, _Draft] = {}

    def draft_for(key: str) -> _Draft:
        return drafts.setdefault(key, _Draft(key))

    for revision in sorted(revisions, key=lambda item: (item.at or _UNDATED, item.revision)):
        key = revision.requirement_hash.strip() or f"revision:{revision.revision}"
        draft = draft_for(key)
        draft.origin = RevisionOrigin.ARTEFACT_REVISION
        if revision.requirement_hash.strip():
            draft.requirement_hash = revision.requirement_hash.strip()
        draft.saw(revision.at)
        if draft.artefact_commit is None:
            # The *first* revision carrying this version is the one that
            # introduced it; a later commit that left the text unchanged did not.
            draft.artefact_commit = revision.revision
            draft.author = revision.author
            draft.subject = revision.subject
        if draft.source_revision is None:
            draft.source_revision = revision.revision

    for entry in recorded:
        draft = draft_for(entry.requirement_hash)
        draft.requirement_hash = entry.requirement_hash
        draft.saw(entry.at)
        if entry.source_revision and draft.source_revision is None:
            draft.source_revision = entry.source_revision

    for delivery in deliveries:
        draft = draft_for(delivery.satisfied_hash)
        draft.requirement_hash = delivery.satisfied_hash
        draft.saw(delivery.satisfied_at)
        draft.run_id = delivery.run_id
        draft.delivered_at = delivery.satisfied_at
        draft.implementing_commit = delivery.verified_commit
        if delivery.source_revision and draft.source_revision is None:
            draft.source_revision = delivery.source_revision

    wanted = current_hash.strip()
    if wanted and wanted not in drafts:
        current_draft = draft_for(wanted)
        current_draft.requirement_hash = wanted
        current_draft.origin = RevisionOrigin.WORKING_TREE
        current_draft.saw(current_at)

    entries = sorted(
        (
            draft.entry(current=bool(wanted) and draft.requirement_hash == wanted)
            for draft in drafts.values()
        ),
        key=_sort_key,
    )
    return RevisionHistory(
        req_id=req_id,
        entries=tuple(entries),
        source_history_available=source_history_available,
        unavailable_reason=unavailable_reason,
    )


@traces(SWR.SWR_3214, SWR.SWR_3213)
def recorded_hashes(
    trail: AuditTrail | None = None,
    deliveries: Sequence[SatisfiedDelivery] = (),
) -> tuple[RecordedHash, ...]:
    """Every requirement version Rotaris itself recorded, oldest first.

    The audit trail's entries carry the hash the requirement had when something
    happened to it (SWR-3213), and the satisfied log carries the hash each run
    delivered (SWR-3204). Together they are the history a store without version
    control still has — which is precisely the case SWR-3214 refuses to answer
    with an empty list.
    """
    found: dict[str, RecordedHash] = {}

    def remember(requirement_hash: str, at: dt.datetime, revision: str | None) -> None:
        cleaned = requirement_hash.strip()
        if not cleaned:
            return
        previous = found.get(cleaned)
        if previous is None or at < previous.at:
            found[cleaned] = RecordedHash(
                requirement_hash=cleaned,
                at=at,
                source_revision=revision or (previous.source_revision if previous else None),
            )

    for event in trail.events if trail is not None else ():
        remember(event.requirement_hash, event.at, None)
        if event.satisfied_hash:
            remember(event.satisfied_hash, event.at, None)
    for delivery in deliveries:
        remember(delivery.satisfied_hash, delivery.satisfied_at, delivery.source_revision)
    return tuple(sorted(found.values(), key=lambda item: (item.at, item.requirement_hash)))


@traces(SWR.SWR_3214)
def resolve_hashes(
    revisions: Iterable[ArtifactRevision],
    read_hash_at: Callable[[str], str | None],
) -> tuple[ArtifactRevision, ...]:
    """Fill in each revision's requirement hash using an injected reader.

    The reader is the source's own "read this requirement as it was" operation
    (SWR-3102). Injected rather than imported so this module never depends on a
    particular source, and so a caller can resolve a handful of revisions instead
    of every one. A revision the reader cannot answer for keeps its empty hash —
    the requirement did not exist then, or its document could not be parsed, and
    both are answers worth keeping.
    """
    resolved: list[ArtifactRevision] = []
    for revision in revisions:
        if revision.requirement_hash:
            resolved.append(revision)
            continue
        found = read_hash_at(revision.revision)
        resolved.append(
            revision.model_copy(update={"requirement_hash": found}) if found else revision,
        )
    return tuple(resolved)


@runtime_checkable
class ArtifactRevisions(Protocol):
    """Lists the revisions in which one artefact changed.

    A port, so the assembler stays pure and a store kept outside git — an
    archive, a tracker with its own revision list — can supply the same answer.
    """

    def revisions_for(self, location: str) -> tuple[ArtifactRevision, ...]:
        """Every revision that touched *location*, oldest first."""
        ...


@traces(SWR.SWR_3214)
class GitArtifactRevisions:
    """The revisions of an artefact, read out of the git repository holding it.

    One read-only plumbing call per artefact, with an explicit timeout, and every
    failure answers "no revisions" rather than raising: a requirement whose file
    is untracked, a repository with no commits and a git that is not installed
    are all "the source has no history for this", and none of them is a reason
    for a history panel to fail to open.
    """

    def __init__(self, repo_root: Path, *, git: str = "git") -> None:
        self._repo_root = repo_root
        self._git = git

    @classmethod
    def for_repo(cls, repo_root: Path, *, git: str = "git") -> Self | None:
        """A reader for *repo_root*, or ``None`` when it is not a git checkout.

        Checked on the ``.git`` entry, which is a file in a worktree and a
        directory in a clone, so a worktree is not mistaken for an unversioned
        project.
        """
        if not (repo_root / ".git").exists():
            return None
        return cls(repo_root, git=git)

    def revisions_for(self, location: str) -> tuple[ArtifactRevision, ...]:
        """``git log --follow`` over one artefact, oldest first.

        ``--follow`` is what makes a renamed requirement keep its history — and a
        requirement's file *is* renamed, because the store names it after the
        requirement's title (SWR-3112).
        """
        try:
            completed = subprocess.run(  # noqa: S603 - fixed argv, no shell, explicit path
                [
                    self._git,
                    "-C",
                    str(self._repo_root),
                    "log",
                    "--follow",
                    f"--format={GIT_LOG_FORMAT}",
                    "--",
                    location,
                ],
                capture_output=True,
                check=False,
                timeout=_GIT_TIMEOUT_S,
            )
        except (OSError, subprocess.SubprocessError) as error:
            _log.warning("Could not read the history of %s: %s", location, error)
            return ()
        if completed.returncode != 0:
            return ()
        return revisions_from_log(completed.stdout.decode("utf-8", errors="replace").splitlines())


@traces(SWR.SWR_3214)
def revisions_from_log(lines: Iterable[str]) -> tuple[ArtifactRevision, ...]:
    """Parse ``git log --format=%H…%cI…%an…%s`` output into revisions, oldest first.

    Separated from the subprocess call so the parsing — which is where the
    interesting failures live: an unparsable date, a subject containing the
    separator, a line git wrote for something else — is testable against crafted
    output rather than against a repository.
    """
    parsed = [revision for revision in map(_revision_from_line, lines) if revision is not None]
    parsed.reverse()  # git answers newest first; a history reads forwards.
    return tuple(parsed)


def _revision_from_line(line: str) -> ArtifactRevision | None:
    parts = line.split(_FIELD_SEP)
    if len(parts) < 4 or not parts[0].strip():
        return None
    commit, when, author, subject = parts[0], parts[1], parts[2], _FIELD_SEP.join(parts[3:])
    try:
        at = dt.datetime.fromisoformat(when)
    except ValueError:
        at = None
    return ArtifactRevision(
        revision=commit.strip(),
        at=at if at is None or at.tzinfo is not None else at.replace(tzinfo=dt.UTC),
        author=author,
        subject=subject,
    )
