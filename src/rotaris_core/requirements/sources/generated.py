"""A requirement store read through a generated parser (SWR-3123).

The shape no declarative configuration can express — one document declaring many
requirements, a table, an export — is read by a **parser**: a Python file that
belongs to the *user's repository*, committed and diffable like any other file
the project owns. Rotaris runs it under a fixed contract and treats its output
exactly as it treats any other source's read.

Everything in this module is the cost side of that trade, stated as code:

- **Admissibility is decided statically, before the parser is ever executed.**
  :func:`admit_parser` reads the parser's syntax tree and refuses anything
  outside a small permitted language — stdlib-only imports from an allowlist, no
  process, network, write, eval or clock reach — naming the construct and its
  line. This is what stands in for an OS sandbox where there is none (SWR-2507's
  backends probe unavailable on native Windows). It is deliberately *not* a
  sandbox dressed up as one: it is a smaller language, checked
  deterministically, rather than a boundary enforced at runtime.
- **The parser supplies content only.** Its stdout is read by
  :func:`read_parser_output` into plain content fields;
  :class:`~rotaris_core.requirements.model.CanonicalRequirement` computes
  ``current_hash`` from the normalised content and
  :class:`~rotaris_core.requirements.sources.base.SourceRead` stamps provenance,
  so a parser cannot forge identity and SWR-3107's hashes stay Rotaris' own
  answer.
- **It says what it did not read.** The contract's second output — ``unclaimed``
  — becomes :class:`SourceIssue`s on the read, so a store whose format drifted
  is visible as drift rather than as requirements that quietly ceased to exist.
  A silent partial read is the defect this whole area exists to prevent, and a
  parser is what makes it easy.
- **The pinned hash is checked before every run.** A parser whose bytes have
  moved since acceptance is refused until it is accepted again; review is of a
  file, and a changed file is a new review.

Running happens in :mod:`rotaris_core.requirements.sources.parser_host`, in a
separate OS process with a timeout — this module never executes parser text in
its own interpreter.
"""

from __future__ import annotations

import ast
import hashlib
import json
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.model import (
    CanonicalRequirement,
    RequirementLifecycle,
    RequirementType,
)
from rotaris_core.requirements.sources.base import (
    BaseRequirementSource,
    RequirementArtifact,
    SourceIssue,
    SourceRead,
)

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

__all__ = [
    "ALLOWED_IMPORTS",
    "DEFAULT_PARSER_FILENAME",
    "DEFAULT_TIMEOUT_SECONDS",
    "GeneratedParserConfig",
    "GeneratedParserSource",
    "ParserAdmission",
    "ParserRefusal",
    "ParserRunError",
    "admit_parser",
    "parser_digest",
    "read_parser_output",
]

#: Where a generated parser lives by default: the repository root, under a name
#: that says whose it is. Outside ``.rotaris/`` on purpose — the configuration
#: is per-workspace private state, the parser is project source (SWR-3123).
DEFAULT_PARSER_FILENAME = "rotaris_requirement_parser.py"

#: How long a parser may run before it is killed. A store of thousands of
#: documents parses in well under this; a parser that does not is looping.
DEFAULT_TIMEOUT_SECONDS = 30.0

#: The whole import surface a parser may use. Stdlib only, and not all of it:
#: reading text, matching patterns and walking a tree need nothing that can
#: reach a process, a socket, a clock or an environment. ``sys`` is here for
#: ``sys.argv``/``sys.stdout`` — the contract's own channel. Its dangerous reach
#: is refused by *attribute* name rather than by this list: ``modules`` is in
#: :data:`_BANNED_ATTRIBUTES`, so ``sys.modules[…]`` cannot fetch back a module
#: the allowlist left out.
ALLOWED_IMPORTS: frozenset[str] = frozenset(
    {
        "argparse",
        "collections",
        "dataclasses",
        "enum",
        "functools",
        "hashlib",
        "itertools",
        "json",
        "pathlib",
        "re",
        "string",
        "sys",
        "textwrap",
        "typing",
        "unicodedata",
    },
)

#: Names whose *use* is refused wherever it appears — call, attribute or bare
#: reference. The list is small because the import allowlist already removed
#: whole modules; what remains is the builtins that escape a static read, of two
#: kinds: those that execute text (``eval``, ``exec``, ``compile``,
#: ``__import__``) and those that reach an attribute this check cannot see
#: (``getattr`` and its siblings, ``locals``, ``globals``, ``vars``,
#: ``__builtins__``). Refusing a name *wherever* it appears is what makes
#: ``g = getattr`` no cheaper than ``getattr`` itself.
_BANNED_NAMES: frozenset[str] = frozenset(
    {
        "__import__",
        "breakpoint",
        "compile",
        "delattr",
        "eval",
        "exec",
        "getattr",
        "globals",
        "input",
        "locals",
        "memoryview",
        "setattr",
        "vars",
        "__builtins__",
    },
)

#: ``open`` is permitted read-only: a parser's whole job is reading files. Any
#: mode argument carrying one of these characters is a write and is refused.
_WRITE_MODE_CHARS = frozenset("wax+")

#: Method names that write to the filesystem, refused as attribute calls on any
#: receiver — the receiver expression is opaque to a static read, and a method
#: that writes is a write whoever holds it. Bare ``write`` is deliberately not
#: here: ``sys.stdout.write`` is the contract's own channel.
_WRITE_METHODS: frozenset[str] = frozenset(
    {
        "chmod",
        "hardlink_to",
        "link_to",
        "mkdir",
        "rename",
        "rmdir",
        "symlink_to",
        "touch",
        "unlink",
        "write_bytes",
        "write_text",
    },
)

#: Attributes whose *reach* is refused on any receiver. The receiver is opaque to
#: a static read, so the judgement is on the attribute name alone — the rule
#: :func:`_check_call` already applies to methods, erring the same way: ``x.modules``
#: on some innocent object is refused too. Each name here is a link in a known
#: escape chain. ``modules`` fetches back a module the import allowlist left out;
#: ``__mro__``/``__bases__``/``__subclasses__``/``mro`` walk the class hierarchy to
#: one without importing anything; ``__globals__``/``__code__``/``__closure__`` open
#: a function object. None of them has a place in reading files and emitting JSON.
#: ``__builtins__`` is in :data:`_BANNED_NAMES` as well — the bare name and the
#: attribute are different nodes and both are reachable.
_BANNED_ATTRIBUTES: frozenset[str] = frozenset(
    {
        "mro",
        "modules",
        "__bases__",
        "__builtins__",
        "__closure__",
        "__code__",
        "__globals__",
        "__mro__",
        "__subclasses__",
    },
)


class ParserRunError(RuntimeError):
    """A parser could not be run, or ran and answered outside the contract."""


@traces(SWR.SWR_3123)
class ParserRefusal(BaseModel):
    """One reason a parser is not admissible, located in its source."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    message: str
    line: int

    @property
    def sentence(self) -> str:
        """The refusal as one line a user reads."""
        return f"line {self.line}: {self.message}"


@traces(SWR.SWR_3123)
class ParserAdmission(BaseModel):
    """The static verdict on a parser, before it is ever executed.

    Derived from the refusals rather than stored beside them, so the two cannot
    disagree — the same rule :class:`ProposalValidation` follows.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    refusals: tuple[ParserRefusal, ...] = ()

    @property
    def admissible(self) -> bool:
        """Whether this parser may be executed at all."""
        return not self.refusals

    def describe(self) -> str:
        """The verdict, in the words the user is shown."""
        if self.admissible:
            return "Admissible: the parser stays inside the permitted language."
        lines = ["Refused before execution:"]
        lines.extend(f"  {refusal.sentence}" for refusal in self.refusals)
        return "\n".join(lines)


def _import_root(name: str) -> str:
    return name.split(".", 1)[0]


def _refuse(refusals: list[ParserRefusal], node: ast.AST, message: str) -> None:
    refusals.append(ParserRefusal(message=message, line=getattr(node, "lineno", 0)))


def _check_import(node: ast.Import | ast.ImportFrom, refusals: list[ParserRefusal]) -> None:
    if isinstance(node, ast.ImportFrom):
        if node.level:
            _refuse(refusals, node, "relative imports are outside the contract")
            return
        roots = [_import_root(node.module or "")]
    else:
        roots = [_import_root(alias.name) for alias in node.names]
    for root in roots:
        if root not in ALLOWED_IMPORTS:
            _refuse(
                refusals,
                node,
                f"import of {root!r} is outside the permitted standard library"
                f" (allowed: {', '.join(sorted(ALLOWED_IMPORTS))})",
            )


def _check_open_mode(node: ast.Call, refusals: list[ParserRefusal], *, method: bool) -> None:
    """Refuse ``open``/``.open`` in any mode that writes.

    A mode that is not a literal cannot be checked, and an uncheckable mode is a
    refusal, not a shrug: admissibility is the only wall there is.
    """
    mode: ast.expr | None = None
    # The builtin takes (file, mode); the ``Path.open`` method takes (mode) —
    # the file is the receiver. One index apart, and mixing them up would check
    # a filename instead of a mode.
    positional_index = 0 if method else 1
    if len(node.args) > positional_index:
        mode = node.args[positional_index]
    for keyword in node.keywords:
        if keyword.arg == "mode":
            mode = keyword.value
    if mode is None:
        return
    if not isinstance(mode, ast.Constant) or not isinstance(mode.value, str):
        _refuse(refusals, node, "a file mode that is not a string literal cannot be admitted")
        return
    if _WRITE_MODE_CHARS.intersection(mode.value):
        _refuse(refusals, node, f"opening a file for writing (mode {mode.value!r}) is refused")


def _check_call(node: ast.Call, refusals: list[ParserRefusal]) -> None:
    """Judge one call by the last name it reaches.

    The *receiver* of an attribute call is opaque to a static read —
    ``Path('x').open``, ``(a or b).unlink``, an aliased anything — so the
    judgement is on the attribute name alone, whoever holds it. That refuses
    some harmless spellings; a permitted language errs exactly that way.
    """
    func = node.func
    if isinstance(func, ast.Name):
        if func.id in _BANNED_NAMES:
            _refuse(refusals, node, f"call to {func.id!r} is refused")
        elif func.id == "open":
            _check_open_mode(node, refusals, method=False)
        return
    if isinstance(func, ast.Attribute):
        if func.attr in _BANNED_NAMES:
            _refuse(refusals, node, f"call to {func.attr!r} is refused")
        elif func.attr == "open":
            _check_open_mode(node, refusals, method=True)
        elif func.attr in _WRITE_METHODS:
            _refuse(refusals, node, f"call to {func.attr!r} writes to the filesystem")
        elif func.attr == "replace" and len(node.args) + len(node.keywords) < 2:
            # ``str.replace(old, new)`` — a parser's bread and butter — takes at
            # least two arguments; ``Path.replace(target)`` — a move — exactly
            # one. Arity is the only static difference, and one-argument
            # ``.replace`` is refused because the move is the one that writes.
            _refuse(refusals, node, "call to 'replace' with one argument moves a file")


@traces(SWR.SWR_3123)
def admit_parser(source: str) -> ParserAdmission:
    """Decide, from the syntax tree alone, whether *source* may be executed.

    The permitted language is small on purpose: stdlib-only imports from
    :data:`ALLOWED_IMPORTS`, no ``eval``/``exec``/``__import__``, no writing
    ``open``, and nothing that reaches a process, a socket or the environment —
    those all live in modules the allowlist already excludes. Every refusal
    names the construct and its line, because "your parser was refused" without
    a location is a verdict nobody can act on.

    What it refuses is the constructs a parser plausibly produces *and* the known
    cheap escapes from them — the reflective builtins, the module table, the class
    hierarchy. It does not become a sandbox by growing: a static check over a
    Turing-complete language cannot be complete, and the trust anchor is
    elsewhere — the parser is a reviewed, committed file of the project, pinned by
    content hash, and re-admitted by the very process that executes it.

    Static, deterministic, and executed nowhere: this is the check both sides of
    the process boundary run — the parent before spawning, the child before
    executing — so a parser cannot be smuggled past it by racing the file.
    """
    try:
        tree = ast.parse(source)
    except SyntaxError as error:
        return ParserAdmission(
            refusals=(
                ParserRefusal(
                    message=f"the parser is not valid Python ({error.msg})",
                    line=error.lineno or 0,
                ),
            ),
        )

    refusals: list[ParserRefusal] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            _check_import(node, refusals)
        elif isinstance(node, ast.Call):
            _check_call(node, refusals)
        elif isinstance(node, ast.Name) and node.id in _BANNED_NAMES:
            _refuse(refusals, node, f"reference to {node.id!r} is refused")
        elif isinstance(node, ast.Attribute) and node.attr in _BANNED_ATTRIBUTES:
            _refuse(refusals, node, f"reaching {node.attr!r} is refused")
    refusals.sort(key=lambda refusal: refusal.line)
    return ParserAdmission(refusals=tuple(refusals))


@traces(SWR.SWR_3123)
def parser_digest(source_bytes: bytes) -> str:
    """The content identity a configuration pins (SWR-3123).

    Over the exact bytes, not a normalisation: review is of a file, and any
    changed byte is a changed file and a new review.
    """
    return hashlib.sha256(source_bytes).hexdigest()


# --------------------------------------------------------------------------
# The output contract
# --------------------------------------------------------------------------


class _ParsedRequirement(BaseModel):
    """One requirement as a parser states it: content only, no provenance.

    ``extra="forbid"`` is contract enforcement: a parser inventing fields —
    provenance, hashes, capabilities — is answering outside the contract, and an
    answer outside the contract is an error, never a silently dropped field.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    title: str = ""
    description: str = ""
    lifecycle: RequirementLifecycle = RequirementLifecycle.DRAFT
    req_type: RequirementType = RequirementType.PRODUCT
    #: Repository-relative POSIX path of the artefact this was read from.
    source_path: str | None = None
    parent: str | None = None

    @field_validator("req_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("a parsed requirement carries a non-empty id")
        return cleaned

    @field_validator("source_path")
    @classmethod
    def _posix_relative(cls, value: str | None) -> str | None:
        """The OS-independence clause, enforced at the boundary (SWR-3123).

        A parser emitting host-flavoured paths reads one thing on the machine
        that generated it and another on a colleague's; refusing them here makes
        that a stated contract error instead of a quiet drift.
        """
        if value is None:
            return None
        if "\\" in value:
            raise ValueError(f"source_path {value!r} must use POSIX separators")
        if value.startswith("/") or (len(value) > 1 and value[1] == ":"):
            raise ValueError(f"source_path {value!r} must be repository-relative")
        return value


class _UnclaimedDocument(BaseModel):
    """One document the parser considered and did not claim (SWR-3123)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    path: str
    reason: str = ""


class _ParserOutput(BaseModel):
    """The whole contract: requirements out, and what was not claimed."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    requirements: tuple[_ParsedRequirement, ...] = ()
    unclaimed: tuple[_UnclaimedDocument, ...] = ()


@traces(SWR.SWR_3123)
def read_parser_output(
    stdout: str,
) -> tuple[tuple[_ParsedRequirement, ...], tuple[_UnclaimedDocument, ...]]:
    """*stdout* as the contract's two outputs, or a named contract error.

    Raises:
        ParserRunError: the output is not the contract's JSON object. The
            message carries the parse or validation error verbatim, because
            "your parser's output was rejected" without the reason is a verdict
            nobody can act on.
    """
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as error:
        raise ParserRunError(f"the parser's output is not JSON ({error})") from error
    try:
        output = _ParserOutput.model_validate(payload)
    except ValidationError as error:
        raise ParserRunError(f"the parser's output is outside the contract ({error})") from error
    return output.requirements, output.unclaimed


# --------------------------------------------------------------------------
# The configured source
# --------------------------------------------------------------------------


@traces(SWR.SWR_3123)
class GeneratedParserConfig(BaseModel):
    """A programmatic requirement source, described as data.

    What is persisted is *how to run* the project's own parser — its
    repository-relative path, the hash the user accepted, the files whose change
    means "read again" and the time budget. No requirement text and no parser
    text: the parser is project source, reviewed where project source is.
    """

    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    source_id: str = Field(default="generated", alias="source-id")
    #: Repository-relative path of the parser file. Outside ``.rotaris/`` so it
    #: is committable; the default name says whose it is.
    parser: str = DEFAULT_PARSER_FILENAME
    #: The accepted parser's :func:`parser_digest`. A file whose digest moved is
    #: not run until it is accepted again.
    sha256: str
    #: Repository-relative glob of the documents the parser reads. The revision
    #: is a digest over these, so "did anything change" is answerable without
    #: running the parser (SWR-3116).
    watch: str
    timeout_seconds: float = Field(default=DEFAULT_TIMEOUT_SECONDS, alias="timeout-seconds", gt=0)

    @field_validator("source_id", "sha256", "watch")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("a generated-parser source names an id, a hash and a watch glob")
        return cleaned

    @field_validator("parser", "watch")
    @classmethod
    def _stays_inside(cls, value: str) -> str:
        normalized = value.replace("\\", "/").strip()
        if not normalized:
            raise ValueError("a path inside the repository is required")
        if normalized.startswith("/") or ".." in normalized.split("/"):
            raise ValueError(f"{value!r} must be relative and stay inside the repository")
        return normalized

    def as_document(self) -> dict[str, object]:
        """The configuration as it is written, aliased and complete."""
        return {"kind": "programmatic", **self.model_dump(mode="json", by_alias=True)}


@traces(SWR.SWR_3123)
class GeneratedParserSource(BaseRequirementSource):
    """The store a generated parser reads, behind the ordinary source seam.

    Read-only by inheritance: :class:`BaseRequirementSource` refuses
    ``create``/``update``/``delete`` unless a capability is declared, and this
    source declares none (SWR-3105) — a parser is one-directional, and an edit
    the board offered against it would corrupt a document the parser only ever
    read.

    ``revision()`` never runs the parser: it digests the watched files, the
    parser file and the pinned hash, which is what keeps SWR-3116's incremental
    refresh alive — an unchanged tree costs no process at all, because
    ``read()`` caches on exactly this token.
    """

    def __init__(self, root: Path, config: GeneratedParserConfig) -> None:
        self._root = root
        self._config = config
        self._cache: tuple[str, SourceRead] | None = None
        #: path -> (size, mtime_ns, sha256 of the content read at that stamp).
        #: Consulted per file by :meth:`revision`: a stat that matches reuses the
        #: recorded hash, anything else re-reads and re-records. Bounded by the
        #: number of watched files, not by their size — 32 bytes each, which is
        #: the point: memoising the *content* would have kept a whole
        #: documentation tree in memory to avoid reading it.
        self._digests: dict[Path, tuple[int, int, bytes]] = {}

    @property
    def source_id(self) -> str:
        """Stable id of this configured source."""
        return self._config.source_id

    @property
    def config(self) -> GeneratedParserConfig:
        """The configuration this source runs under."""
        return self._config

    @property
    def parser_path(self) -> Path:
        """Where the parser lives, resolved against the repository root."""
        return self._root / self._config.parser

    def _watched(self) -> tuple[Path, ...]:
        return tuple(
            sorted(
                (path for path in self._root.glob(self._config.watch) if path.is_file()),
                key=lambda path: path.relative_to(self._root).as_posix(),
            ),
        )

    @traces(SWR.SWR_3116, SWR.SWR_3123)
    def revision(self) -> str:
        """A digest of the watched tree, the parser and the pin — no execution.

        The parser file and its pinned hash are part of the token on purpose: a
        changed parser must re-read even over an unchanged tree, and a re-pin
        after re-acceptance must do the same.

        A refresh over an unmoved tree stats each watched file instead of reading
        every byte of it, which matters because this source's watch glob can cover
        a whole documentation tree and `revision()` is asked on **every** refresh,
        before the parser is even considered (SWR-3116).

        **The token is a digest over the files' content hashes, not over their
        bytes.** That is a deliberate change of definition, and the reason is
        memory: memoising raw content would keep the entire watched tree resident
        in order to avoid reading it, which trades the cost this exists to remove
        for a worse one. Hashing per file bounds the memo at 32 bytes a file.

        What it costs, once: a baseline persisted by an older version records the
        old token (SWR-3119), so the first refresh after this change sees a
        revision it does not recognise and re-reads. That is precisely what a
        genuinely changed file does — one extra evaluation, self-healing, and no
        state is wrong in the meantime. The token's *meaning* is untouched: it
        still changes exactly when the watched content, the parser, or the pin
        changes, which is all SWR-3116 asks of it.

        The honest residual: an in-place edit preserving **both** the size and the
        modification time defeats the memo, and the token would then not move for
        a file that did. Editors and git checkouts bump the mtime, so this costs a
        contrived write. The memo lives on the instance and nowhere else, so a
        fresh session always reads once — and if the residual ever bites, the fix
        is deleting the memo, not adding a mode to work around it.
        """
        digest = hashlib.sha256()
        digest.update(self._config.sha256.encode("utf-8"))
        for path in (self.parser_path, *self._watched()):
            digest.update(path.relative_to(self._root).as_posix().encode("utf-8"))
            digest.update(b"\0")
            digest.update(self._content_digest(path))
            digest.update(b"\0")
        return digest.hexdigest()

    def _content_digest(self, path: Path) -> bytes:
        """*path*'s content hash, re-read only when its size or mtime moved.

        An unreadable file contributes its stated marker rather than raising,
        exactly as before: a watched document that vanished mid-refresh must move
        the token, not break the read.

        A vanished file's memo entry is deliberately *not* discarded. Dropping it
        would look prudent and defend against nothing: an entry is only ever
        reused when the path's size and modification time both match what was
        recorded, so a file that comes back changed re-reads anyway, and one that
        comes back with a forged identical stamp is the residual `revision()`
        already states. Verified as dead code before it was left out — a mutant
        that kept the entry passed every test in this file.
        """
        try:
            stat = path.stat()
            stamp = (stat.st_size, stat.st_mtime_ns)
            remembered = self._digests.get(path)
            if remembered is not None and remembered[:2] == stamp:
                return remembered[2]
            content = path.read_bytes()
        except OSError:
            return b"<unreadable>"
        content_digest = hashlib.sha256(content).digest()
        self._digests[path] = (*stamp, content_digest)
        return content_digest

    def discover(self) -> Sequence[RequirementArtifact]:
        """The watched documents, as the artefacts this source holds."""
        return tuple(
            RequirementArtifact(
                artifact_id=path.relative_to(self._root).as_posix(),
                location=path.relative_to(self._root).as_posix(),
            )
            for path in self._watched()
        )

    @traces(SWR.SWR_3123)
    def read(self) -> SourceRead:
        """Run the parser — pinned, admitted, in its own process — and read it.

        The order of the guards is the requirement's own: the pin first (a
        changed file is a new review), admissibility second (refused before
        execution), and only then a process. Every failure is raised as this
        source's named error; a parser that cannot run must never look like a
        project with no requirements.
        """
        revision = self.revision()
        if self._cache is not None and self._cache[0] == revision:
            return self._cache[1]

        parser = self.parser_path
        try:
            source_bytes = parser.read_bytes()
        except OSError as error:
            raise self.fail(
                f"the configured parser could not be read ({error})",
                location=self._config.parser,
            ) from error
        digest = parser_digest(source_bytes)
        if digest != self._config.sha256:
            raise self.fail(
                "the parser has changed since it was accepted"
                f" (accepted {self._config.sha256[:12]}…, found {digest[:12]}…);"
                " review and accept it again before it runs",
                location=self._config.parser,
            )
        admission = admit_parser(source_bytes.decode("utf-8", errors="replace"))
        if not admission.admissible:
            raise self.fail(
                f"the parser is outside the permitted language\n{admission.describe()}",
                location=self._config.parser,
            )

        from rotaris_core.requirements.sources.parser_host import run_parser

        try:
            stdout = run_parser(self._root, parser, timeout=self._config.timeout_seconds)
            parsed, unclaimed = read_parser_output(stdout)
        except ParserRunError as error:
            raise self.fail(str(error), location=self._config.parser) from error

        requirements = []
        issues = [
            SourceIssue(
                source_id=self.source_id,
                message=f"not claimed by the parser: {entry.reason or 'no reason stated'}",
                location=entry.path,
            )
            for entry in unclaimed
        ]
        seen: dict[str, str] = {}
        for entry in parsed:
            if entry.req_id in seen:
                # On the id alone, never on the path: a parser reading one
                # document can emit the same id twice from the same place, and
                # a duplicate that only counts across documents would let
                # exactly the single-document case through.
                issues.append(
                    SourceIssue(
                        source_id=self.source_id,
                        message=(
                            "duplicate requirement id, first declared in "
                            f"{seen[entry.req_id] or 'the same document'}"
                        ),
                        location=entry.source_path,
                        req_id=entry.req_id,
                    ),
                )
                continue
            seen[entry.req_id] = entry.source_path or ""
            requirements.append(
                CanonicalRequirement(
                    req_id=entry.req_id,
                    title=entry.title,
                    description=entry.description,
                    lifecycle=entry.lifecycle,
                    req_type=entry.req_type,
                    source_path=entry.source_path,
                    parent=entry.parent,
                    capabilities=self.capabilities,
                ),
            )
        read = SourceRead(
            source_id=self.source_id,
            revision=revision,
            requirements=tuple(requirements),
            issues=tuple(issues),
        )
        self._cache = (revision, read)
        return read

    def locate(self, req_id: str) -> str | None:
        """Where *req_id* was last read from, for naming refusals (SWR-3105)."""
        if self._cache is None:
            return None
        return next(
            (
                requirement.source_path
                for requirement in self._cache[1].requirements
                if requirement.req_id == req_id
            ),
            None,
        )
