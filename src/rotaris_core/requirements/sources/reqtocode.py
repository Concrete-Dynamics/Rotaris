"""The built-in ReqToCode requirement source (SWR-3103).

This repository already keeps a structured requirement store: stable ids, a
content hash per document, a lifecycle, product/technical typing and
``derived-from`` links. SWR-3103 makes that store the *reference* adapter rather
than a privileged special case — everything downstream reaches it through
:class:`~rotaris_core.requirements.sources.base.RequirementSource` and nothing
else, so the seam is proven by the source Rotaris itself depends on. Reference
implementation means complete: it reads, it writes, it says what a requirement
looked like before, and every one of those is exercised against a real store.

**One parser, not two.** All *metadata* comes from
:func:`rotaris_core.reqtocode.generator.parse_requirements` — ids, lifecycle,
type, flags, ``derived-from``, ``content_hash`` — mapped onto
:class:`~rotaris_core.requirements.model.CanonicalRequirement`. A second
frontmatter reader would be a second definition of "what this repository's
requirements are", and the two would drift the first time the store's format
moved: the exact failure SWR-3114 exists to prevent. What the adapter does read
from the document itself is the one thing ``ReqMeta`` does not carry: the
requirement's *prose*. It reads it through
:class:`~rotaris_core.requirements.writeback.MarkdownRequirementDocument` — the
same document model the write path edits through, so what Rotaris shows and what
Rotaris writes can never disagree about where a requirement's text lives.

Consequences of those choices, stated rather than discovered:

- **``description`` is the requirement's own prose**: for a single-id document
  the text between the ``# SWR-<n> — Title`` heading and the first ``##``
  section, and for a multi-id spec file (SWR-2330) the text of that id's own
  ``## SWR-<n>`` section. Without it no consumer could obtain requirement text
  through the canonical model — the detail view (SWR-3307), the agent context
  (SWR-3407) and impact analysis (SWR-3503) would each have to re-parse the
  Markdown, which is the second parse this module refuses.
- **``current_hash`` is the canonical hash** (SWR-3107): computed from the
  normalised canonical content, so reordering frontmatter or reformatting the
  file does not move it and editing a sentence does, and so two ids declared by
  one spec file get two different hashes. ReqToCode's own ``content_hash`` is
  carried verbatim beside it in
  :attr:`~rotaris_core.requirements.model.CanonicalRequirement.source_hash`,
  which is what keeps an existing baseline entry or a ``reqtocode diff`` result
  meaningful — the two answer different questions and neither can stand in for
  the other.
- **The prose read is cached on the store's own hash**, so a refresh in which a
  document did not move does not read that document again (SWR-3116), and
  :meth:`ReqToCodeSource.read_artifacts` reads only the artefacts it was asked
  for.

**The epic comes from the layout, not from a re-read.** ``epic:`` frontmatter is
not part of ``ReqMeta``, and the store's documented layout answers the same
question from data already in hand (``docs/requirements/README.md``):
``<block>-<slug>.md`` is the epic index and ``<block>-<slug>/`` holds its
requirements, so a requirement's epic is the lowest-numbered id declared by its
index file — which for a spec file is the file itself. Checked against this
repository's 250 ``epic:`` declarations, the rule reproduces every one of them
and leaves exactly the epic indexes parentless (see the integration test).

**Writes go through the store's own conventions.** ``create`` / ``update`` /
``delete`` are implemented on :mod:`rotaris_core.requirements.writeback`, so an
edit keeps unmodelled frontmatter, a created requirement passes ``reqtocode
check`` unedited and a deletion also removes the epic-index row. The capability
declaration (SWR-3105) is therefore a statement the adapter can honour rather
than a promise the first write would break.

**History comes from version control.** A ReqToCode store is a directory of
Markdown files in a git repository, so "what did SWR-3101 say at the revision we
last delivered against" is a question the *source* can answer and Rotaris must
not answer from a cache of its own (SWR-3114). :class:`GitArtifactHistory` is
the port that asks it; a store outside version control simply declares no
history and says so when asked (SWR-3503's stated fallback).
"""

from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path, PurePosixPath
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.reqtocode.generator import (
    global_hash,
    parse_requirements,
    probe_requirement_store,
)
from rotaris_core.reqtocode.layout import LayoutError, load_layout
from rotaris_core.requirements.model import (
    FULL_CAPABILITIES,
    CanonicalRequirement,
    Relation,
    RelationKind,
    RequirementLifecycle,
    RequirementType,
    SourceCapability,
)
from rotaris_core.requirements.sources.base import (
    BaseRequirementSource,
    RequirementArtifact,
    RequirementSourceError,
    SourceHistoryUnavailable,
    SourceIssue,
    SourceRead,
    require_capability,
)
from rotaris_core.requirements.writeback import (
    MarkdownRequirementDocument,
    MarkdownStoreLayout,
    MarkdownStoreWriter,
    RequirementCreation,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Collection, Mapping, Sequence

    from rotaris_core.reqtocode.declarations import ReqMeta
    from rotaris_core.reqtocode.generator import ParseResult
    from rotaris_core.reqtocode.layout import RepoLayout
    from rotaris_core.requirements.sources.base import RequirementDraft, RequirementEdit

__all__ = [
    "DEFAULT_SOURCE_ID",
    "ArtifactHistory",
    "GitArtifactHistory",
    "ReqToCodeSource",
    "epic_index_for",
    "reqtocode_source_for",
]

#: Id of the built-in source when the caller does not name one.
DEFAULT_SOURCE_ID = "reqtocode"

#: A parse error's leading ``<path>.md (SWR-<n>): <message>`` prefix. ReqToCode
#: reports errors as text; recovering the file and id from it is what turns a
#: parse error into a :class:`SourceIssue` a reader can act on.
_PARSE_ERROR_RE = re.compile(
    r"^(?P<location>\S+\.md)(?:\s+\((?P<req_id>SWR-\d+)\))?:\s*(?P<message>.+)$",
    re.DOTALL,
)

#: How long a git call may take before the source reports a failure instead of
#: hanging the refresh it was called from.
_GIT_TIMEOUT_SECONDS = 30.0


def _read_document_text(path: Path) -> str:
    """Read one requirement document. A function so a test can count the reads."""
    return path.read_text(encoding="utf-8")


@traces(SWR.SWR_3103)
def epic_index_for(source_path: str, requirements_dir: str) -> str:
    """The epic index document for the requirement file at *source_path*.

    The store's layout is ``<requirements_dir>/<block>-<slug>.md`` for an epic
    and ``<requirements_dir>/<block>-<slug>/…`` for its requirements, so the
    index of a nested file is its top-level directory plus ``.md``. A file
    sitting directly in the requirements directory is its own index: a multi-id
    spec file declares the epic and its requirements together.

    Pure — a path computation, no filesystem access.
    """
    root = PurePosixPath(requirements_dir)
    candidate = PurePosixPath(source_path)
    if not candidate.is_relative_to(root):
        return source_path
    relative = candidate.relative_to(root)
    if len(relative.parts) <= 1:
        return source_path
    return (root / f"{relative.parts[0]}.md").as_posix()


def _epic_by_index(requirements: Sequence[ReqMeta]) -> dict[str, str]:
    """Index document -> the id of the epic it declares (its lowest number)."""
    lowest: dict[str, ReqMeta] = {}
    for meta in requirements:
        current = lowest.get(meta.source_path)
        if current is None or meta.number < current.number:
            lowest[meta.source_path] = meta
    return {path: meta.req_id for path, meta in lowest.items()}


def _issue_from_error(source_id: str, error: str) -> SourceIssue:
    """Turn one ReqToCode parse error into a located, attributable issue."""
    match = _PARSE_ERROR_RE.match(error.strip())
    if match is None:
        return SourceIssue(source_id=source_id, message=error)
    return SourceIssue(
        source_id=source_id,
        message=match["message"],
        location=match["location"],
        req_id=match["req_id"],
    )


# --------------------------------------------------------------------------
# The history port (SWR-3102's fourth optional operation)
# --------------------------------------------------------------------------


@runtime_checkable
class ArtifactHistory(Protocol):
    """Reads a store's artefacts as they were at a past revision.

    A port, so the adapter stays testable without a repository and so a store
    kept in something other than git (an archive, a document management system)
    can be plugged in without touching the adapter.
    """

    def read_text_at(self, location: str, revision: str) -> str | None:
        """The artefact's text at *revision*, or ``None`` when it had none."""
        ...

    def locations_at(self, revision: str, prefix: str) -> tuple[str, ...]:
        """Every artefact path under *prefix* that existed at *revision*."""
        ...


@traces(SWR.SWR_3103)
class GitArtifactHistory:
    """A store's history, read out of the git repository that versions it.

    Every call is a read-only plumbing command against an explicit revision, so
    nothing about the working tree — a dirty file, a checked-out branch — can
    change what it answers. A revision git does not know is *not* an error here:
    it means "this artefact did not exist then", which is a real answer for a
    requirement that was added later.
    """

    def __init__(self, repo_root: Path, *, git: str = "git") -> None:
        self._repo_root = repo_root
        self._git = git

    @classmethod
    def for_repo(cls, repo_root: Path, *, git: str = "git") -> Self | None:
        """A history for *repo_root*, or ``None`` when it is not a git checkout.

        Checked on the ``.git`` entry rather than by running a command: it costs
        no subprocess, and it is true for a worktree (where ``.git`` is a file)
        as well as for a clone.
        """
        if not (repo_root / ".git").exists():
            return None
        return cls(repo_root, git=git)

    def _run(self, *args: str) -> subprocess.CompletedProcess[bytes]:
        try:
            return subprocess.run(  # noqa: S603 - fixed argv, no shell, explicit revision
                [self._git, "-C", str(self._repo_root), *args],
                capture_output=True,
                check=False,
                timeout=_GIT_TIMEOUT_SECONDS,
            )
        except (OSError, subprocess.SubprocessError) as error:
            raise RequirementSourceError(
                DEFAULT_SOURCE_ID,
                f"the store's history could not be read ({error})",
                location=str(self._repo_root),
            ) from error

    def read_text_at(self, location: str, revision: str) -> str | None:
        """``git show <revision>:<location>``, decoded as the store's UTF-8."""
        completed = self._run("show", f"{revision}:{location}")
        if completed.returncode != 0:
            return None
        return completed.stdout.decode("utf-8", errors="replace")

    def locations_at(self, revision: str, prefix: str) -> tuple[str, ...]:
        """The Markdown artefacts under *prefix* at *revision*, in path order."""
        completed = self._run("ls-tree", "-r", "--name-only", revision, "--", prefix)
        if completed.returncode != 0:
            return ()
        listed = completed.stdout.decode("utf-8", errors="replace").splitlines()
        return tuple(sorted(path for path in listed if path.endswith(".md")))


# --------------------------------------------------------------------------
# The adapter (SWR-3103)
# --------------------------------------------------------------------------


@traces(SWR.SWR_3103)
class ReqToCodeSource(BaseRequirementSource):
    """This repository's requirement store, read through the adapter seam.

    Constructed for a repository root and the layout that describes it
    (SWR-2335), so it works against any checkout whose store ReqToCode can
    parse — not only this one. Use :func:`reqtocode_source_for` to obtain one
    for a workspace, which answers ``None`` when there is no store to read.
    """

    #: The store can be created in, edited and retired from (SWR-3105), and each
    #: of the three is implemented here on the write path of SWR-3111/SWR-3112.
    capabilities = FULL_CAPABILITIES

    def __init__(
        self,
        repo_root: Path,
        *,
        layout: RepoLayout | None = None,
        source_id: str = DEFAULT_SOURCE_ID,
        history: ArtifactHistory | None = None,
        today: Callable[[], str] | None = None,
    ) -> None:
        from rotaris_core.reqtocode.layout import DEFAULT_LAYOUT

        self._repo_root = repo_root
        self._layout = layout if layout is not None else DEFAULT_LAYOUT
        self._source_id = source_id
        self._history = history
        self._today = today
        self._writer: MarkdownStoreWriter | None = None
        #: source path -> (the store's hash for it, its parsed document). Keyed on
        #: the hash, so a stale entry can never be served: a document that moved
        #: has a different hash and is read again (SWR-3116).
        self._documents: dict[str, tuple[str, MarkdownRequirementDocument]] = {}

    @property
    def source_id(self) -> str:
        return self._source_id

    @property
    def store_path(self) -> Path:
        """The requirement directory this source reads."""
        return self._repo_root / self._layout.requirements_dir

    @property
    def provides_history(self) -> bool:
        """Whether a past revision of this store can be reconstructed."""
        return self._history is not None

    # -- the three mandatory operations -------------------------------------

    def discover(self) -> tuple[RequirementArtifact, ...]:
        """One artefact per requirement document, with the ids it declares.

        The per-artefact revision is ReqToCode's own ``content_hash``, which is
        derived from the document text — so an incremental refresh (SWR-3116)
        can skip a file that did not move without re-reading it, and every id a
        spec file declares shares that one token because they share the file.
        """
        parsed = self._parse()
        by_file: dict[str, list[ReqMeta]] = {}
        for meta in parsed.requirements:
            by_file.setdefault(meta.source_path, []).append(meta)
        return tuple(
            RequirementArtifact(
                artifact_id=path,
                location=path,
                revision=metas[0].content_hash,
                requirement_ids=tuple(
                    meta.req_id for meta in sorted(metas, key=lambda meta: meta.number)
                ),
            )
            for path, metas in sorted(by_file.items())
        )

    def read(self) -> SourceRead:
        """Every declared id as a canonical requirement, once.

        Parse errors become :class:`SourceIssue` values rather than aborting:
        one malformed document must not turn a repository with 1500 requirements
        into a source that reports none. A store that cannot be reached at all is
        a different fact and raises (SWR-3102).
        """
        return self._read(self._parse(), wanted=None)

    def read_artifacts(self, artifact_ids: Sequence[str]) -> SourceRead:
        """Only the named documents, for an incremental refresh (SWR-3116).

        The store's metadata is parsed as one unit — that is ReqToCode's own
        contract, and it is what detects a duplicate id across two files — but
        the *documents* outside the request are neither opened nor re-hashed, and
        the requirements they declare are left out of the result for the registry
        to merge with what it already holds.
        """
        return self._read(self._parse(), wanted=set(artifact_ids))

    def revision(self) -> str:
        """ReqToCode's own global hash over the parsed store.

        Reused rather than reinvented so that "the store changed" means the same
        thing to the board as it does to ``reqtocode check`` — including a change
        that only moved a document's prose, since each requirement's
        ``content_hash`` covers the whole file and feeds this digest.
        """
        return global_hash(self._parse().requirements)

    def locate(self, req_id: str) -> str | None:
        """The document *req_id* is declared in, for refusals and detail views."""
        try:
            parsed = self._parse()
        except RequirementSourceError:
            return None
        for meta in parsed.requirements:
            if meta.req_id == req_id:
                return meta.source_path
        return None

    # -- writing (SWR-3111, SWR-3112) ---------------------------------------

    def update(self, req_id: str, edit: RequirementEdit) -> CanonicalRequirement:
        """Write *edit* into the document *req_id* was read from.

        Returns the requirement as the store now holds it, read back through the
        same path every other consumer reads through — never the value the edit
        described (SWR-3111).
        """
        location = self.locate(req_id)
        require_capability(self, SourceCapability.UPDATE, location=location)
        if location is None:
            raise self.fail(f"{req_id} is not declared in this store")
        self._store_writer().update(self._repo_root / location, edit)
        after = self.read().by_id().get(req_id)
        if after is None:
            raise self.fail(
                f"{req_id} disappeared from the store during the write", location=location
            )
        return after

    @property
    def previews_creation(self) -> bool:
        """This store's layout is readable, so a creation's location is knowable."""
        return True

    @traces(SWR.SWR_3606, SWR.SWR_3112)
    def preview_creation(
        self,
        draft: RequirementDraft,
        *,
        used_ids: Collection[str] | None = None,
    ) -> RequirementCreation:
        """Where *draft* would land, resolved by the writer that would land it.

        The same call :meth:`create` makes before its first write, which is what
        makes SWR-3606's "the user sees where the artefact will be written" a
        property of one rule rather than of two rules agreeing. The layout
        knowledge stays here, beside :attr:`store_path`, and no surface has to
        learn it.
        """
        require_capability(self, SourceCapability.CREATE, location=str(self.store_path))
        return self._store_writer().plan(draft, used_ids=used_ids)

    def create(self, draft: RequirementDraft) -> CanonicalRequirement:
        """Create a requirement under the store's own conventions (SWR-3112)."""
        require_capability(self, SourceCapability.CREATE, location=str(self.store_path))
        creation = self._store_writer().create(draft)
        after = self.read().by_id().get(creation.req_id)
        if after is None:
            raise self.fail(
                f"{creation.req_id} was written but the store does not declare it",
                location=creation.path,
            )
        return after

    def delete(self, req_id: str) -> None:
        """Remove *req_id*'s document and its epic-index row.

        The id itself is not forgotten: recording the tombstone is
        :mod:`rotaris_core.requirements.tombstones`' job (SWR-3113), and this
        returning successfully is what lets it record one.
        """
        location = self.locate(req_id)
        require_capability(self, SourceCapability.DELETE, location=location)
        if location is None:
            raise self.fail(f"{req_id} is not declared in this store")
        current = self.read().by_id().get(req_id)
        self._store_writer().delete(
            self._repo_root / location,
            req_id,
            epic_id=current.parent if current is not None else None,
        )
        self._documents.pop(location, None)

    # -- history (SWR-3102, for SWR-3501/SWR-3503) --------------------------

    def read_requirement_at(self, req_id: str, revision: str) -> CanonicalRequirement | None:
        """*req_id* as the store held it at *revision* (a git revision).

        The historical document is handed to ReqToCode's *own* parser — in a
        throwaway tree at the same relative path — rather than to a second
        reader written for this method, so a past version is mapped by exactly
        the rules a present one is. The epic comes from the current layout: which
        block a document belongs to is a property of where it sits, and resolving
        it from a one-file tree would report every historical requirement as a
        root and make every diff show a lost parent.

        ``None`` means the requirement did not exist at that revision, or its
        document could not be parsed then; a source with no history at all raises
        :class:`SourceHistoryUnavailable` instead.
        """
        history = self._history
        if history is None:
            raise SourceHistoryUnavailable(
                self._source_id,
                revision,
                detail=f"{self.store_path} is not under version control",
            )
        parsed = self._parse()
        location = next(
            (meta.source_path for meta in parsed.requirements if meta.req_id == req_id),
            None,
        ) or self._historical_location(history, req_id, revision)
        if location is None:
            return None
        text = history.read_text_at(location, revision)
        if text is None:
            return None

        meta = self._parse_historical(location, text, req_id)
        if meta is None:
            return None
        document = MarkdownRequirementDocument.parse(text)
        requirement = self._canonical(
            meta,
            description=_description_of(document, req_id),
            requirements_dir=self._layout.requirements_dir.as_posix(),
            epic_by_index=_epic_by_index(parsed.requirements),
        )
        return requirement.stamped(source_revision=revision)

    def _historical_location(
        self,
        history: ArtifactHistory,
        req_id: str,
        revision: str,
    ) -> str | None:
        """Where a requirement the store no longer declares lived at *revision*.

        The store names a requirement's file after its id (``SWR-3101-….md``,
        SWR-3112), which is what makes a removed requirement findable at all —
        and a candidate is only accepted once its text is parsed and really
        declares the id, so the convention is a search hint, never the answer.
        """
        prefix = self._layout.requirements_dir.as_posix()
        return next(
            (
                path
                for path in history.locations_at(revision, prefix)
                if PurePosixPath(path).name.startswith(f"{req_id}-")
            ),
            None,
        )

    def _parse_historical(self, location: str, text: str, req_id: str) -> ReqMeta | None:
        """Run ReqToCode's parser over one historical document, in isolation."""
        with tempfile.TemporaryDirectory(prefix="rotaris-requirements-") as scratch:
            target = Path(scratch) / location
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf-8")
            parsed = parse_requirements(Path(scratch), self._layout)
        return next((meta for meta in parsed.requirements if meta.req_id == req_id), None)

    # -- mapping ------------------------------------------------------------

    def _read(self, parsed: ParseResult, *, wanted: set[str] | None) -> SourceRead:
        """Turn one parse into a source read, optionally narrowed to artefacts."""
        requirements_dir = self._layout.requirements_dir.as_posix()
        epic_by_index = _epic_by_index(parsed.requirements)
        selected = [
            meta for meta in parsed.requirements if wanted is None or meta.source_path in wanted
        ]
        return SourceRead(
            source_id=self._source_id,
            revision=global_hash(parsed.requirements),
            requirements=tuple(
                self._canonical(
                    meta,
                    description=self._description(meta),
                    requirements_dir=requirements_dir,
                    epic_by_index=epic_by_index,
                )
                for meta in selected
            ),
            issues=tuple(_issue_from_error(self._source_id, error) for error in parsed.errors),
        )

    def _canonical(
        self,
        meta: ReqMeta,
        *,
        description: str,
        requirements_dir: str,
        epic_by_index: Mapping[str, str],
    ) -> CanonicalRequirement:
        """One ``ReqMeta`` plus its prose as the canonical model sees it (SWR-3101)."""
        epic = epic_by_index.get(epic_index_for(meta.source_path, requirements_dir))
        return CanonicalRequirement(
            req_id=meta.req_id,
            title=meta.title,
            description=description,
            lifecycle=RequirementLifecycle(meta.status.value),
            req_type=RequirementType(meta.req_type),
            source_id=self._source_id,
            source_path=meta.source_path,
            # The canonical hash is computed by the model from the content above;
            # the store's own token travels beside it (see the module docstring).
            source_hash=meta.content_hash,
            parent=epic if epic != meta.req_id else None,
            relations=tuple(
                Relation(kind=RelationKind.DERIVED_FROM, target=f"SWR-{number}")
                for number in meta.derived_from
            ),
            trace_required=meta.trace_required,
            test_required=meta.test_required,
            capabilities=self.capabilities,
        )

    def _description(self, meta: ReqMeta) -> str:
        """The requirement's prose, read once per document version."""
        return _description_of(self._document(meta.source_path, meta.content_hash), meta.req_id)

    def _document(self, source_path: str, content_hash: str) -> MarkdownRequirementDocument:
        """The parsed document, from the cache when the store's hash still matches."""
        cached = self._documents.get(source_path)
        if cached is not None and cached[0] == content_hash:
            return cached[1]
        document = MarkdownRequirementDocument.parse(
            _read_document_text(self._repo_root / source_path),
        )
        self._documents[source_path] = (content_hash, document)
        return document

    def _store_writer(self) -> MarkdownStoreWriter:
        """The writer for this store, built once and only when a write happens."""
        if self._writer is None:
            layout = MarkdownStoreLayout(root=self.store_path)
            self._writer = (
                MarkdownStoreWriter(layout)
                if self._today is None
                else MarkdownStoreWriter(layout, today=self._today)
            )
        return self._writer

    def _parse(self) -> ParseResult:
        """One parse of the store, or a named failure (never an empty result)."""
        if not self.store_path.is_dir():
            raise self.fail("requirement store not found", location=str(self.store_path))
        return parse_requirements(self._repo_root, self._layout)


def _description_of(document: MarkdownRequirementDocument, req_id: str) -> str:
    """The prose belonging to *req_id* in *document*.

    A multi-id spec file gives each id the text of its own ``## SWR-<n>``
    section; a single-id document gives its whole requirement prose. Getting this
    wrong in the other direction — the file's preamble for every id — is what
    made 91 unrelated requirements share one description and one hash.
    """
    section = document.section_description(req_id)
    return section if section is not None else document.description


@traces(SWR.SWR_3103, SWR.SWR_3120)
def reqtocode_source_for(
    repo_root: Path,
    *,
    layout: RepoLayout | None = None,
    source_id: str = DEFAULT_SOURCE_ID,
) -> ReqToCodeSource | None:
    """The built-in source for *repo_root*, or ``None`` when it has no store.

    This is the "selected automatically" half of SWR-3103: a workspace that
    carries a ReqToCode store gets its requirements with no configuration at
    all, and one that does not simply contributes no source — an absent store is
    not an error, it is a project that keeps its requirements elsewhere. A
    workspace that is also a git checkout gets its history seam wired up at the
    same time and for the same reason.

    **The store is confirmed by reading it, not by the directory existing**
    (SWR-3120). ``docs/requirements/`` is a path many projects use and few of
    them fill the way this parser reads; claiming one of those produced a bound
    source, an empty board and the sentence "the requirement store is readable
    but declares no requirement" — true of the mapping, false of the project,
    and it stood between the workspace and the discovery built for exactly that
    case (SWR-3106), because reaching discovery requires *no* source.

    So a directory holding specification documents none of which declares a
    ``req-id`` is **not** this source's store, and answering ``None`` hands the
    workspace on. A directory holding no such documents still is: an empty store
    and a foreign one are different facts, and only the first is an empty board.

    A ``.reqtocode.json`` that exists but cannot be understood *is* an error, and
    is raised as a named :class:`RequirementSourceError`: silently falling back
    to the default layout would read a different tree than the one configured.
    """
    if layout is None:
        try:
            layout = load_layout(repo_root)
        except LayoutError as error:
            raise RequirementSourceError(
                source_id,
                f"requirement store layout could not be read ({error})",
                location=str(repo_root),
            ) from error
    if not (repo_root / layout.requirements_dir).is_dir():
        return None
    probe = probe_requirement_store(repo_root, layout)
    if not probe.declares_requirements and probe.frontmatter_documents:
        return None
    return ReqToCodeSource(
        repo_root,
        layout=layout,
        source_id=source_id,
        history=GitArtifactHistory.for_repo(repo_root),
    )
