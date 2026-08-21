"""The declarative requirement source (SWR-3104).

A project whose requirements do not follow this repository's convention has to be
readable *without writing code*, and the reason is not convenience: a mapping
improvised per start would produce a different requirement set on every run, and
a system whose whole value rests on stable ids and stable hashes cannot survive
that. So a source is described as data — a file glob and one field mapping per
canonical field — and the description is persisted (SWR-3117) rather than
re-derived.

```json
{ "type": "markdown", "glob": "specs/**/*.md",
  "id": "frontmatter.id", "title": "heading", "status": "frontmatter.state" }
```

**Determinism is a property of the code, not a hope.** Four things could leak
non-determinism into a read, and each is closed here rather than left to luck:
files are ordered by their repository-relative posix path (never by directory
order); the revision token is derived from file *content*, never from an mtime
or a size; every canonical field is resolved from a named expression in a fixed
order, so frontmatter dict iteration cannot reach the output; and line endings
are normalised before anything is read out of a document, so a CRLF checkout and
an LF one produce byte-identical results. The integration test asserts exactly
that — two reads in a row, compared as serialised bytes.

**Nothing is guessed.** An expression that names a part of a document the
configuration cannot resolve, a value that does not match its declared pattern,
a missing or blank id — each is a :class:`DeclarativeConfigError` naming the file
*and* the field. A requirement is never auto-numbered to keep a read going: an
invented id would be indistinguishable from a real one the next time the store
was read, and every hash comparison built on it would be meaningless.

A file the glob matched that carries no frontmatter at all, while the mapping
reads from frontmatter, is a different case: it is not a broken requirement, it
is not a requirement — a ``README.md`` living beside the specs. It is skipped and
reported as a :class:`SourceIssue`, so the read stays complete and the skip stays
visible.

Pure of the network by construction: this module reads files and parses YAML.
There is no model call anywhere in a load, which is what makes the same tree
produce the same requirements on the hundredth run as on the first.
"""

from __future__ import annotations

import hashlib
import re
from enum import StrEnum
from typing import TYPE_CHECKING, Self

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.hashing import normalize_line_endings
from rotaris_core.requirements.model import (
    READ_ONLY,
    CanonicalRequirement,
    Relation,
    RelationKind,
    RequirementLifecycle,
    RequirementType,
)
from rotaris_core.requirements.sources.base import (
    BaseRequirementSource,
    RequirementArtifact,
    RequirementSourceError,
    SourceIssue,
    SourceRead,
)

if TYPE_CHECKING:
    from collections.abc import Iterable
    from pathlib import Path

__all__ = [
    "DeclarativeConfigError",
    "DeclarativeSource",
    "DeclarativeSourceConfig",
    "FieldMapping",
    "NoMatchingArtifactsError",
    "SourceDocument",
    "SourceFormat",
    "read_document",
    "require_value",
    "resolve_value",
    "resolve_values",
]


class SourceFormat(StrEnum):
    """Document format a declarative source can read.

    One member today. It exists as an enum rather than a free string so that a
    configuration naming a format Rotaris cannot read fails when it is loaded,
    with the supported values in the message — not when the first file is opened.
    """

    MARKDOWN = "markdown"


#: Expression roots a field mapping may name. ``frontmatter`` additionally takes
#: a dotted path into the parsed YAML (``frontmatter.meta.id``); ``literal:`` is
#: followed by the constant itself.
_SCALAR_ROOTS: frozenset[str] = frozenset({"heading", "body", "text", "filename", "stem", "path"})
_FRONTMATTER_ROOT = "frontmatter"
_LITERAL_PREFIX = "literal:"

_FRONTMATTER_RE = re.compile(r"\A---[ \t]*\n(?P<block>.*?)\n---[ \t]*(?:\n|\Z)", re.DOTALL)
_HEADING_RE = re.compile(r"^#{1,6}[ \t]+(?P<title>.+?)[ \t]*$", re.MULTILINE)
#: Separators a scalar may use to carry several ids (``depends-on: A, B``).
_ID_SEPARATOR_RE = re.compile(r"[,\s]+")


class DeclarativeConfigError(RequirementSourceError):
    """A mapping that could not be resolved, named down to file and field.

    Raised rather than reported-and-skipped: a mapping that does not fit the
    tree is a configuration fault, and a source that quietly returned the
    requirements it *could* read would hide it behind a plausible-looking board.
    The registry (SWR-3115) turns this into a named
    :class:`~rotaris_core.requirements.sources.base.SourceFailure`, so one broken
    source never empties the others.
    """

    def __init__(
        self,
        source_id: str,
        field: str,
        message: str,
        *,
        location: str | None = None,
    ) -> None:
        self.field = field
        super().__init__(source_id, f"field {field!r}: {message}", location=location)


class NoMatchingArtifactsError(RequirementSourceError):
    """The source's glob matched no file at all (SWR-3102).

    Its own type rather than a plain failure because the two callers need to
    tell it apart from every other read failure: the registry reports it as a
    source outage — never as a removal, which would tombstone every id the
    source used to hold (SWR-3113) — and discovery reports it as the wrong glob
    it almost always is (SWR-3106), not as an unreadable tree.
    """

    def __init__(self, source_id: str, glob: str, *, location: str | None = None) -> None:
        self.glob = glob
        super().__init__(
            source_id,
            f"no file matched {glob!r}; the source is configured but its artefacts are not there",
            location=location,
        )


@traces(SWR.SWR_3104)
class FieldMapping(BaseModel):
    """Where one canonical field is read from, as data.

    Accepts the shorthand the configuration example uses — a bare string is the
    expression — because ``"title": "heading"`` is the common case and forcing
    ``{"source": "heading"}`` on every field would make a configuration document
    unreadable. ``pattern`` covers the equally common case of an id embedded in
    a file name (``SWR-3104-declarative.md``), which no plain expression can
    reach; ``default`` covers a field a source only sometimes carries.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: ``frontmatter[.key…]``, ``heading``, ``body``, ``text``, ``filename``,
    #: ``stem``, ``path`` or ``literal:<value>``.
    source: str
    #: Optional regular expression applied to the resolved text. The ``value``
    #: named group wins, else the first group, else the whole match. A value
    #: that does not match is an error, never a silently dropped field.
    pattern: str | None = None
    #: Used when the expression resolves to nothing. Never used to invent an id
    #: for a document that has none — that is what ``default`` on ``req_id``
    #: would mean, and :class:`DeclarativeSourceConfig` refuses it.
    default: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _accept_shorthand(cls, data: object) -> object:
        if isinstance(data, str):
            return {"source": data}
        return data

    @field_validator("source")
    @classmethod
    def _known_root(cls, value: str) -> str:
        expression = value.strip()
        if not expression:
            raise ValueError("a field mapping names an expression")
        if expression.startswith(_LITERAL_PREFIX):
            return expression
        root = expression.split(".", 1)[0]
        if root != _FRONTMATTER_ROOT and root not in _SCALAR_ROOTS:
            known = sorted({_FRONTMATTER_ROOT, *_SCALAR_ROOTS, "literal:<value>"})
            raise ValueError(f"unknown expression {expression!r}; expected one of {known}")
        return expression

    @field_validator("pattern")
    @classmethod
    def _compiles(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            re.compile(value)
        except re.error as error:
            raise ValueError(f"pattern {value!r} is not a regular expression ({error})") from error
        return value

    @property
    def reads_frontmatter(self) -> bool:
        """Whether resolving this mapping needs a frontmatter block."""
        return self.source == _FRONTMATTER_ROOT or self.source.startswith(f"{_FRONTMATTER_ROOT}.")


@traces(SWR.SWR_3104)
class DeclarativeSourceConfig(BaseModel):
    """A complete requirement source, described as data (SWR-3104, SWR-3117).

    Serialises with the key names the configuration document uses (``type``,
    ``id``, ``status``), so what a user writes, what discovery proposes
    (SWR-3106) and what is persisted are the same document.
    """

    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    #: Attribution for everything this source produces (SWR-3115).
    source_id: str = Field(default="declarative", alias="source-id")
    source_format: SourceFormat = Field(default=SourceFormat.MARKDOWN, alias="type")
    #: Repository-relative glob, e.g. ``specs/**/*.md``.
    glob: str
    req_id: FieldMapping = Field(alias="id")
    title: FieldMapping | None = None
    description: FieldMapping | None = None
    lifecycle: FieldMapping | None = Field(default=None, alias="status")
    req_type: FieldMapping | None = Field(default=None, alias="req-type")
    parent: FieldMapping | None = None
    relations: dict[RelationKind, FieldMapping] = Field(default_factory=dict)
    #: The project's own status vocabulary mapped onto the canonical lifecycle
    #: (``{"open": "draft", "accepted": "approved"}``). Keys are matched
    #: case-insensitively. Without an entry a value must already be one of the
    #: canonical three, and anything else is a named error rather than a guess.
    lifecycle_values: dict[str, RequirementLifecycle] = Field(
        default_factory=dict,
        alias="status-values",
    )
    trace_required: bool = Field(default=True, alias="trace-required")
    test_required: bool = Field(default=True, alias="test-required")

    @field_validator("source_id", "glob")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("a declarative source names an id and a file glob")
        return cleaned

    @field_validator("glob")
    @classmethod
    def _stays_inside(cls, value: str) -> str:
        normalized = value.replace("\\", "/")
        if normalized.startswith("/") or ".." in normalized.split("/"):
            raise ValueError(f"glob {value!r} must be relative and stay inside the source root")
        return normalized

    @field_validator("lifecycle_values")
    @classmethod
    def _casefolded(
        cls,
        value: dict[str, RequirementLifecycle],
    ) -> dict[str, RequirementLifecycle]:
        return {key.strip().casefold(): lifecycle for key, lifecycle in value.items()}

    @model_validator(mode="after")
    def _id_is_never_invented(self) -> Self:
        """An id is read out of the artefact, never supplied by the mapping.

        A default would auto-number requirements, which SWR-3104 forbids. A
        ``literal:`` expression is the same act stated differently — it gives
        every matched document the *same* id, and where a store holds one
        document the duplicate-id check has nothing to compare and would let it
        through. Requirement ids are stable forever and every hash, delivery
        record and trace hangs off them, so an id the mapping made up is not a
        worse answer but a corrupt store (SWR-3121).

        ``stem``, ``heading``, ``path`` and ``frontmatter.*`` — with a regex
        ``pattern`` where the id is embedded — all read the artefact and are
        unaffected.
        """
        if self.req_id.default is not None:
            raise ValueError(
                "the 'id' mapping must not carry a default: a requirement whose id"
                " is missing is reported, never auto-numbered",
            )
        if self.req_id.source.startswith(_LITERAL_PREFIX):
            raise ValueError(
                "the 'id' mapping must not be a literal: a requirement's id is found"
                " in the artefact, never supplied by the configuration",
            )
        return self

    @property
    def reads_frontmatter(self) -> bool:
        """Whether any mapping needs a frontmatter block to resolve."""
        return any(mapping.reads_frontmatter for mapping in self._mappings())

    def _mappings(self) -> tuple[FieldMapping, ...]:
        optional = (self.title, self.description, self.lifecycle, self.req_type, self.parent)
        return (
            self.req_id,
            *(mapping for mapping in optional if mapping is not None),
            *self.relations.values(),
        )

    def as_document(self) -> dict[str, object]:
        """The configuration as it is written and persisted (aliased keys).

        Every field that says something, defaults included: this document is what
        a discovery proposal shows the user before it is written (SWR-3106), and
        a mapping the reader cannot see is a mapping they cannot review. Only
        empty tables are dropped — ``"relations": {}`` is noise, not information.
        """
        document = self.model_dump(mode="json", by_alias=True, exclude_none=True)
        return {
            key: value
            for key, value in document.items()
            if not (isinstance(value, dict) and not value)
        }


@traces(SWR.SWR_3104)
class SourceDocument(BaseModel):
    """One matched file, decomposed once so every field reads from the same view.

    Parsed a single time per read: resolving six mappings against a document
    must not cost six frontmatter parses, and — more importantly — must not risk
    six *different* answers.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: Source-root-relative posix path; the ordering key and the location shown
    #: in every error this document can cause.
    path: str
    filename: str
    stem: str
    frontmatter: dict[str, object] = Field(default_factory=dict)
    has_frontmatter: bool = False
    heading: str = ""
    body: str = ""
    text: str = ""
    #: Content digest of the file as read — the per-artefact revision, and the
    #: reason two reads of an untouched tree agree byte for byte.
    revision: str = ""


@traces(SWR.SWR_3104)
def read_document(path: Path, relative_path: str, *, source_id: str) -> SourceDocument:
    """Decompose one file into the parts a field mapping can name.

    Line endings are normalised first, so a CRLF checkout and an LF checkout of
    the same tree produce identical documents, identical requirements and
    identical hashes.
    """
    try:
        raw = path.read_bytes()
    except OSError as error:
        raise DeclarativeConfigError(
            source_id,
            "glob",
            f"file could not be read ({error})",
            location=relative_path,
        ) from error
    text = normalize_line_endings(raw.decode("utf-8", errors="replace"))
    revision = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]

    match = _FRONTMATTER_RE.match(text)
    frontmatter: dict[str, object] = {}
    has_frontmatter = False
    remainder = text
    if match is not None:
        has_frontmatter = True
        remainder = text[match.end() :]
        frontmatter = _parse_frontmatter(match["block"], relative_path, source_id)

    heading_match = _HEADING_RE.search(remainder)
    heading = heading_match["title"].strip() if heading_match is not None else ""
    body = remainder[heading_match.end() :] if heading_match is not None else remainder
    return SourceDocument(
        path=relative_path,
        filename=path.name,
        stem=path.stem,
        frontmatter=frontmatter,
        has_frontmatter=has_frontmatter,
        heading=heading,
        body=body.strip(),
        text=remainder.strip(),
        revision=revision,
    )


def _parse_frontmatter(block: str, location: str, source_id: str) -> dict[str, object]:
    try:
        loaded: object = yaml.safe_load(block)
    except yaml.YAMLError as error:
        raise DeclarativeConfigError(
            source_id,
            "frontmatter",
            f"frontmatter is not valid YAML ({error})",
            location=location,
        ) from error
    if loaded is None:
        return {}
    if not isinstance(loaded, dict):
        raise DeclarativeConfigError(
            source_id,
            "frontmatter",
            f"frontmatter must be a mapping, got {type(loaded).__name__}",
            location=location,
        )
    return {str(key): value for key, value in loaded.items()}


def _scalar_part(document: SourceDocument, name: str) -> str:
    """One named part of a document. Explicit rather than ``getattr``: the set of
    readable parts is the expression grammar, and it must not drift with the
    model's fields."""
    if name == "heading":
        return document.heading
    if name == "body":
        return document.body
    if name == "text":
        return document.text
    if name == "filename":
        return document.filename
    if name == "stem":
        return document.stem
    return document.path


def _raw_value(document: SourceDocument, expression: str) -> object:
    """The value an expression names, or ``None`` when the document has none."""
    if expression.startswith(_LITERAL_PREFIX):
        return expression[len(_LITERAL_PREFIX) :]
    if expression in _SCALAR_ROOTS:
        return _scalar_part(document, expression)
    root, _, dotted = expression.partition(".")
    if root != _FRONTMATTER_ROOT:  # pragma: no cover - the validator rejects these
        return None
    if not dotted:
        return document.frontmatter
    current: object = document.frontmatter
    for key in dotted.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(key)
        if current is None:
            return None
    return current


def _as_text(value: object) -> str | None:
    """One scalar as text, or ``None`` when the value is empty or a container."""
    if value is None:
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, int | float):
        return str(value)
    return None


def _flatten(value: object) -> tuple[str, ...]:
    """Every id a value carries: a YAML list, or a separated scalar."""
    if isinstance(value, list | tuple):
        return tuple(text for item in value for text in _flatten(item))
    text = _as_text(value)
    if text is None:
        return ()
    return tuple(part for part in _ID_SEPARATOR_RE.split(text) if part)


def _apply_pattern(
    text: str,
    mapping: FieldMapping,
    *,
    field: str,
    document: SourceDocument,
    source_id: str,
) -> str:
    if mapping.pattern is None:
        return text
    match = re.search(mapping.pattern, text)
    if match is None:
        raise DeclarativeConfigError(
            source_id,
            field,
            f"value {text!r} does not match pattern {mapping.pattern!r}",
            location=document.path,
        )
    if "value" in match.groupdict():
        matched = match["value"]
    elif match.groups():
        matched = match.group(1)
    else:
        matched = match.group(0)
    if matched is None or not matched.strip():
        raise DeclarativeConfigError(
            source_id,
            field,
            f"pattern {mapping.pattern!r} matched nothing in {text!r}",
            location=document.path,
        )
    return matched.strip()


@traces(SWR.SWR_3104)
def resolve_value(
    document: SourceDocument,
    mapping: FieldMapping,
    *,
    field: str,
    source_id: str,
) -> str | None:
    """One scalar field, resolved from *document* — or a named error.

    ``None`` means "this document does not carry the field", which is a legal
    answer for every field except the id. It is never a fallback for a mapping
    that pointed somewhere unreadable: a value that fails its pattern, or a list
    where a scalar was declared, raises and names the file and the field —
    because a requirement silently missing its parent looks exactly like a
    requirement that never had one.
    """
    raw = _raw_value(document, mapping.source)
    if isinstance(raw, list | tuple):
        values = _flatten(raw)
        if len(values) > 1:
            raise DeclarativeConfigError(
                source_id,
                field,
                f"expression {mapping.source!r} resolved to {len(values)} values,"
                " but this field holds one",
                location=document.path,
            )
        text = values[0] if values else None
    else:
        text = _as_text(raw)
    if text is None:
        text = mapping.default
    if text is None or not text.strip():
        return None
    return _apply_pattern(
        text.strip(),
        mapping,
        field=field,
        document=document,
        source_id=source_id,
    )


@traces(SWR.SWR_3104)
def require_value(
    document: SourceDocument,
    mapping: FieldMapping,
    *,
    field: str,
    source_id: str,
) -> str:
    """The same, for a field a requirement cannot exist without.

    The id path. A blank or absent id is reported here, with the file that
    carries it — never replaced by a generated one (SWR-3104): an invented id is
    indistinguishable from a real one on the next read, and every hash
    comparison keyed on it would silently mean nothing.
    """
    value = resolve_value(document, mapping, field=field, source_id=source_id)
    if value is None:
        raise DeclarativeConfigError(
            source_id,
            field,
            f"expression {mapping.source!r} resolved to nothing",
            location=document.path,
        )
    return value


@traces(SWR.SWR_3104)
def resolve_values(
    document: SourceDocument,
    mapping: FieldMapping,
    *,
    field: str,
    source_id: str,
) -> tuple[str, ...]:
    """Every id a relation mapping names, in the order the document lists them."""
    raw = _raw_value(document, mapping.source)
    values = _flatten(raw)
    if not values and mapping.default is not None:
        values = _flatten(mapping.default)
    return tuple(
        _apply_pattern(value, mapping, field=field, document=document, source_id=source_id)
        for value in values
    )


@traces(SWR.SWR_3104)
class DeclarativeSource(BaseRequirementSource):
    """A requirement source that exists only as configuration.

    Read-only: writing a requirement back into an arbitrary project's format is
    SWR-3111's problem and needs more than a field mapping to be safe, so the
    capability is not declared (SWR-3105) and a write is refused by name rather
    than attempted and lost.
    """

    capabilities = READ_ONLY

    def __init__(self, root: Path, config: DeclarativeSourceConfig) -> None:
        self._root = root
        self._config = config

    @property
    def source_id(self) -> str:
        return self._config.source_id

    @property
    def config(self) -> DeclarativeSourceConfig:
        """The configuration this source was built from."""
        return self._config

    # -- the three mandatory operations -------------------------------------

    def discover(self) -> tuple[RequirementArtifact, ...]:
        """One artefact per matched file, in repository order."""
        artifacts: list[RequirementArtifact] = []
        for document in self._documents():
            req_id = (
                None
                if self._is_skipped(document)
                else require_value(
                    document,
                    self._config.req_id,
                    field="id",
                    source_id=self.source_id,
                )
            )
            artifacts.append(
                RequirementArtifact(
                    artifact_id=document.path,
                    location=document.path,
                    revision=document.revision,
                    requirement_ids=() if req_id is None else (req_id,),
                ),
            )
        return tuple(artifacts)

    def read(self) -> SourceRead:
        """The configured requirements, deterministically ordered."""
        documents = self._documents()
        requirements: list[CanonicalRequirement] = []
        issues: list[SourceIssue] = []
        seen: dict[str, str] = {}
        for document in documents:
            if self._is_skipped(document):
                issues.append(
                    SourceIssue(
                        source_id=self.source_id,
                        message="no frontmatter block; not a requirement document",
                        location=document.path,
                    ),
                )
                continue
            requirement = self._canonical(document)
            first = seen.setdefault(requirement.req_id, document.path)
            if first != document.path:
                issues.append(
                    SourceIssue(
                        source_id=self.source_id,
                        message=f"duplicate requirement id, first declared in {first}",
                        location=document.path,
                        req_id=requirement.req_id,
                    ),
                )
            requirements.append(requirement)
        return SourceRead(
            source_id=self.source_id,
            revision=self._revision_of(documents),
            requirements=tuple(requirements),
            issues=tuple(issues),
        )

    def revision(self) -> str:
        """A digest of every matched file's path and content — never an mtime."""
        return self._revision_of(self._documents())

    def locate(self, req_id: str) -> str | None:
        for artifact in self.discover():
            if req_id in artifact.requirement_ids:
                return artifact.location
        return None

    # -- internals ----------------------------------------------------------

    def _documents(self) -> tuple[SourceDocument, ...]:
        if not self._root.is_dir():
            raise self.fail("source root not found", location=str(self._root))
        paths = {
            path.relative_to(self._root).as_posix(): path
            for path in self._root.glob(self._config.glob)
            if path.is_file()
        }
        if not paths:
            # A configured source whose glob matches nothing is a broken source,
            # not a project with zero requirements. Returning an empty read here
            # would be indistinguishable from "this project has no requirements"
            # — the exact degradation SWR-3102 forbids — and would make the
            # registry tombstone every id the source used to hold (SWR-3113)
            # because a directory was renamed.
            raise NoMatchingArtifactsError(
                self.source_id,
                self._config.glob,
                location=str(self._root),
            )
        return tuple(
            read_document(paths[relative], relative, source_id=self.source_id)
            for relative in sorted(paths)
        )

    def _revision_of(self, documents: Iterable[SourceDocument]) -> str:
        digest = hashlib.sha256()
        for document in documents:
            digest.update(document.path.encode("utf-8"))
            digest.update(b"\x00")
            digest.update(document.revision.encode("utf-8"))
            digest.update(b"\x1e")
        return digest.hexdigest()[:16]

    def _is_skipped(self, document: SourceDocument) -> bool:
        """A file the glob matched that is not a requirement document at all."""
        return self._config.reads_frontmatter and not document.has_frontmatter

    def _canonical(self, document: SourceDocument) -> CanonicalRequirement:
        config = self._config
        return CanonicalRequirement(
            req_id=require_value(document, config.req_id, field="id", source_id=self.source_id),
            title=self._scalar(document, config.title, "title") or "",
            description=self._scalar(document, config.description, "description") or "",
            lifecycle=self._lifecycle(document),
            req_type=self._req_type(document),
            source_id=self.source_id,
            source_path=document.path,
            parent=self._scalar(document, config.parent, "parent"),
            relations=self._relations(document),
            trace_required=config.trace_required,
            test_required=config.test_required,
            capabilities=self.capabilities,
        )

    def _scalar(
        self,
        document: SourceDocument,
        mapping: FieldMapping | None,
        field: str,
    ) -> str | None:
        if mapping is None:
            return None
        return resolve_value(document, mapping, field=field, source_id=self.source_id)

    def _lifecycle(self, document: SourceDocument) -> RequirementLifecycle:
        value = self._scalar(document, self._config.lifecycle, "status")
        if value is None:
            return RequirementLifecycle.DRAFT
        key = value.casefold()
        mapped = self._config.lifecycle_values.get(key)
        if mapped is not None:
            return mapped
        try:
            return RequirementLifecycle(key)
        except ValueError as error:
            known = sorted(str(item) for item in RequirementLifecycle)
            raise DeclarativeConfigError(
                self.source_id,
                "status",
                f"unknown lifecycle {value!r}; expected one of {known} or a"
                " 'status-values' entry mapping it",
                location=document.path,
            ) from error

    def _req_type(self, document: SourceDocument) -> RequirementType:
        value = self._scalar(document, self._config.req_type, "req-type")
        if value is None:
            return RequirementType.PRODUCT
        try:
            return RequirementType(value.casefold())
        except ValueError as error:
            known = sorted(str(item) for item in RequirementType)
            raise DeclarativeConfigError(
                self.source_id,
                "req-type",
                f"unknown requirement type {value!r}; expected one of {known}",
                location=document.path,
            ) from error

    def _relations(self, document: SourceDocument) -> tuple[Relation, ...]:
        relations: list[Relation] = []
        for kind, mapping in self._config.relations.items():
            field = str(kind)
            for target in resolve_values(
                document,
                mapping,
                field=field,
                source_id=self.source_id,
            ):
                relations.append(Relation(kind=kind, target=target))
        return tuple(relations)
