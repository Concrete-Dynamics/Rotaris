"""ReqToCode generator (blueprint §3): parse / generate / is_up_to_date.

Deterministic (fixed ordering, LF, UTF-8), validating (bad ids, unknown
values, duplicates abort), idempotent (no write when content is unchanged).
Stdlib-only so the pre-commit hook can run it without the project venv.
"""

from __future__ import annotations

import contextlib
import hashlib
import os
import re
import tempfile
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from rotaris_core.reqtocode.declarations import ReqMeta, ReqStatus
from rotaris_core.reqtocode.layout import DEFAULT_LAYOUT, RepoLayout

if TYPE_CHECKING:
    from pathlib import Path

#: Backwards-compatible aliases of the default layout (blueprint §3 constants).
REQ_DIR = DEFAULT_LAYOUT.requirements_dir
GENERATED_PATH = DEFAULT_LAYOUT.generated_path

_REQ_ID_RE = re.compile(r"^SWR-(\d+)$")
_REQ_ID_LIST_RE = re.compile(r"^\[(.*)\]$")
_HEADING_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
_BLOCK_HEADING_RE = re.compile(r"^#{2,6}[ \t]+(SWR-\d+)", re.MULTILINE)
_BLOCK_FIELD_RE = re.compile(r"^([a-z][a-z-]*):(.*)$")
_VALID_STATUS = {s.value for s in ReqStatus}
_VALID_FLAG = {"required", "optional"}
_VALID_TYPE = {"product", "technical"}


@dataclass
class ParseResult:
    requirements: list[ReqMeta] = field(default_factory=list)
    legacy_aliases: dict[str, str] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class StoreProbe:
    """Whether a directory is a ReqToCode store, and what it holds if not.

    :func:`parse_requirements` skips a document without a ``req-id`` silently
    and correctly — READMEs, templates and analysis notes live in the store
    directory. That skip is invisible in its result, so "this repository keeps
    no requirements" and "this repository keeps its requirements another way"
    arrive as the same empty list. This is the difference, measured once.
    """

    #: Some document under the store declares a ``req-id``: this is our store.
    declares_requirements: bool = False
    #: Documents carrying frontmatter that is not a ``req-id`` block. Non-zero
    #: with :attr:`declares_requirements` false is the whole point: specification
    #: documents are here and this parser is not the one that can read them.
    frontmatter_documents: int = 0
    #: Documents looked at. Bounded only by the store's size.
    scanned: int = 0


def _normalize(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _content_hash(normalized_text: str) -> str:
    return hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()[:16]


def _assign_frontmatter_field(line: str | None, fields: dict[str, str]) -> None:
    """Parse one logical ``key: value`` frontmatter line into ``fields``."""
    if line is None:
        return
    match = re.match(r"^([A-Za-z][A-Za-z0-9_-]*):(.*)$", line)
    if not match:
        return
    value = match.group(2).strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    fields[match.group(1)] = value


def _split_frontmatter(text: str) -> dict[str, str] | None:
    """Return frontmatter fields, or None when the file has no frontmatter.

    A line that does not open a new ``key:`` field is a continuation of the
    previous value and is joined onto it, so a value that a YAML formatter has
    reflowed across several lines (e.g. a ``req-id: [SWR-a, SWR-b, ...]`` flow
    list wrapped onto multiple indented lines) still parses as one value.
    """
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return None
    fields: dict[str, str] = {}
    logical: str | None = None
    for line in lines[1:]:
        if line.strip() == "---":
            _assign_frontmatter_field(logical, fields)
            return fields
        if re.match(r"^[A-Za-z][A-Za-z0-9_-]*:", line):
            _assign_frontmatter_field(logical, fields)
            logical = line
        elif logical is not None:
            logical = f"{logical} {line.strip()}"
    return None  # unterminated frontmatter -> treat as no frontmatter


def _fallback_title(text: str) -> str:
    match = _HEADING_RE.search(text)
    return match.group(1) if match else ""


def _resolve_ids(req_id_raw: str) -> tuple[list[str], bool]:
    """A `req-id` frontmatter value is one id, or `[SWR-a, SWR-b, ...]` for a spec file."""
    list_match = _REQ_ID_LIST_RE.match(req_id_raw)
    if list_match is None:
        return [req_id_raw], False
    ids = [part.strip() for part in list_match.group(1).split(",") if part.strip()]
    return ids, True


def _resolve_derived_from(raw: str, rel: str, req_id: str, errors: list[str]) -> tuple[int, ...]:
    """Parse a `derived-from` value (`SWR-<n>` or `[SWR-a, SWR-b]`) into numbers."""
    tokens, _ = _resolve_ids(raw.strip())
    numbers: list[int] = []
    for token in tokens:
        match = _REQ_ID_RE.match(token)
        if not match:
            errors.append(
                f"{rel} ({req_id}): malformed derived-from id {token!r} (expected SWR-<number>)"
            )
            continue
        numbers.append(int(match.group(1)))
    return tuple(numbers)


def _read_override_fields(block: str) -> dict[str, str]:
    """Read the ``key: value`` metadata lines at the top of a body section.

    Leading blank lines between the heading and the metadata are skipped; the
    block ends at the first blank line after it starts or the first non-field
    line (so following prose is never consumed).
    """
    fields: dict[str, str] = {}
    started = False
    for line in block.split("\n"):
        stripped = line.strip()
        if not stripped:
            if started:
                break  # blank line after the metadata block ends it
            continue  # skip blank line(s) between heading and metadata
        field_match = _BLOCK_FIELD_RE.match(stripped)
        if not field_match:
            break
        started = True
        fields[field_match.group(1)] = field_match.group(2).strip()
    return fields


def _parse_body_overrides(text: str) -> dict[int, dict[str, str]]:
    """Per-id `## SWR-<n> — Title` sections that override metadata in a spec file."""
    overrides: dict[int, dict[str, str]] = {}
    matches = list(_BLOCK_HEADING_RE.finditer(text))
    for i, heading in enumerate(matches):
        number = int(heading.group(1).removeprefix("SWR-"))
        line_end = text.find("\n", heading.end())
        if line_end == -1:
            line_end = len(text)
        rest = text[heading.end() : line_end].strip().lstrip("-—:").strip()
        fields: dict[str, str] = {"title": rest} if rest else {}

        content_start = min(line_end + 1, len(text))
        block_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        fields.update(_read_override_fields(text[content_start:block_end]))
        overrides[number] = fields
    return overrides


def _build_requirement(
    rel: str,
    req_id: str,
    number: int,
    block: dict[str, str],
    fields: dict[str, str],
    text: str,
    content_hash: str,
    errors: list[str],
) -> ReqMeta | None:
    """Validate one id's effective metadata (block override, else file frontmatter)."""
    status_raw = block.get("status", fields.get("status", ""))
    if status_raw not in _VALID_STATUS:
        errors.append(
            f"{rel} ({req_id}): unknown status {status_raw!r}"
            f" (expected one of {sorted(_VALID_STATUS)})"
        )
        return None
    flags: dict[str, str] = {}
    for flag_name in ("trace", "test"):
        flag_raw = block.get(flag_name, fields.get(flag_name, "required"))
        if flag_raw not in _VALID_FLAG:
            errors.append(
                f"{rel} ({req_id}): unknown {flag_name} value {flag_raw!r}"
                f" (expected one of {sorted(_VALID_FLAG)})"
            )
            return None
        flags[flag_name] = flag_raw

    req_type = block.get("type", fields.get("type", "product")).strip() or "product"
    if req_type not in _VALID_TYPE:
        errors.append(
            f"{rel} ({req_id}): unknown type {req_type!r} (expected one of {sorted(_VALID_TYPE)})"
        )
        return None
    derived_raw = block.get("derived-from", fields.get("derived-from", "")).strip()
    derived_from = _resolve_derived_from(derived_raw, rel, req_id, errors) if derived_raw else ()

    title = (
        block.get("title", "").strip() or fields.get("title", "").strip() or _fallback_title(text)
    )
    return ReqMeta(
        req_id=req_id,
        number=number,
        status=ReqStatus(status_raw),
        title=title,
        source_path=rel,
        trace_required=flags["trace"] == "required",
        test_required=flags["test"] == "required",
        content_hash=content_hash,
        req_type=req_type,
        derived_from=derived_from,
    )


def _parse_one_id(
    req_id: str,
    *,
    rel: str,
    text: str,
    fields: dict[str, str],
    is_list: bool,
    overrides: dict[int, dict[str, str]],
    content_hash: str,
    seen: dict[int, str],
    legacy_seen: dict[str, list[str]],
    result: ParseResult,
) -> None:
    id_match = _REQ_ID_RE.match(req_id)
    if not id_match:
        result.errors.append(f"{rel}: malformed req-id {req_id!r} (expected SWR-<number>)")
        return
    number = int(id_match.group(1))
    if number in seen:
        result.errors.append(f"{rel}: duplicate req-id {req_id} (also in {seen[number]})")
        return
    block = overrides.get(number)
    if is_list and block is None:
        result.errors.append(
            f"{rel}: req-id list includes {req_id} but the body has no matching"
            f" '## {req_id} — <title>' section"
        )
        return

    requirement = _build_requirement(
        rel, req_id, number, block or {}, fields, text, content_hash, result.errors
    )
    if requirement is None:
        return
    seen[number] = rel
    result.requirements.append(requirement)

    default_legacy = "" if is_list else fields.get("legacy-id", "")
    legacy = (block or {}).get("legacy-id", default_legacy).strip()
    if legacy:
        legacy_seen.setdefault(legacy.upper(), []).append(req_id)


def _parse_requirement_file(
    rel: str,
    text: str,
    fields: dict[str, str],
    seen: dict[int, str],
    legacy_seen: dict[str, list[str]],
    result: ParseResult,
) -> None:
    ids, is_list = _resolve_ids(fields["req-id"])
    if not ids:
        result.errors.append(f"{rel}: empty req-id list")
        return
    overrides = _parse_body_overrides(text) if is_list else {}
    content_hash = _content_hash(text)

    for req_id in ids:
        _parse_one_id(
            req_id,
            rel=rel,
            text=text,
            fields=fields,
            is_list=is_list,
            overrides=overrides,
            content_hash=content_hash,
            seen=seen,
            legacy_seen=legacy_seen,
            result=result,
        )


def probe_requirement_store(repo_root: Path, layout: RepoLayout | None = None) -> StoreProbe:
    """Ask whether *repo_root* keeps a **ReqToCode** store, without parsing it.

    A directory named ``docs/requirements`` is not evidence: a project can keep
    its requirements exactly there in a convention this parser cannot read, and
    then :func:`parse_requirements` returns an empty list with no errors,
    because skipping a document without a ``req-id`` is what it is supposed to
    do. The distinction this makes — *no requirements* against *requirements we
    cannot read* — is what lets selection stand aside for the second case
    instead of claiming the workspace and reporting nothing (SWR-3120).

    Reads frontmatter and stops at the first ``req-id`` it finds, so the answer
    for a store that *is* ours costs one file. Reads nothing else: no parse, no
    hashing, no history.
    """
    layout = layout if layout is not None else DEFAULT_LAYOUT
    req_dir = repo_root / layout.requirements_dir
    if not req_dir.is_dir():
        return StoreProbe()
    frontmatter_documents = 0
    scanned = 0
    for path in sorted(req_dir.rglob("*.md"), key=lambda p: p.as_posix()):
        scanned += 1
        try:
            text = _normalize(path.read_text(encoding="utf-8", errors="replace"))
        except OSError:
            # An unreadable file is not evidence either way, and refusing to
            # answer because of one would be a worse answer than the count.
            continue
        fields = _split_frontmatter(text)
        if fields is None:
            continue
        if "req-id" in fields:
            return StoreProbe(
                declares_requirements=True,
                frontmatter_documents=frontmatter_documents,
                scanned=scanned,
            )
        frontmatter_documents += 1
    return StoreProbe(frontmatter_documents=frontmatter_documents, scanned=scanned)


def parse_requirements(repo_root: Path, layout: RepoLayout | None = None) -> ParseResult:
    """Parse every frontmatter-tagged file under the requirement store (blueprint §2)."""
    layout = layout if layout is not None else DEFAULT_LAYOUT
    result = ParseResult()
    req_dir = repo_root / layout.requirements_dir
    if not req_dir.is_dir():
        result.errors.append(f"requirements directory not found: {req_dir}")
        return result

    seen: dict[int, str] = {}
    legacy_seen: dict[str, list[str]] = {}
    for path in sorted(req_dir.rglob("*.md"), key=lambda p: p.as_posix()):
        rel = path.relative_to(repo_root).as_posix()
        text = _normalize(path.read_text(encoding="utf-8", errors="replace"))
        fields = _split_frontmatter(text)
        if fields is None or "req-id" not in fields:
            continue  # analysis notes, README, TEMPLATE live alongside
        _parse_requirement_file(rel, text, fields, seen, legacy_seen, result)

    result.requirements.sort(key=lambda r: r.number)
    # Only unambiguous legacy ids resolve (historical same-day id reuse is skipped).
    result.legacy_aliases = {legacy: ids[0] for legacy, ids in legacy_seen.items() if len(ids) == 1}
    # A retired id is retired forever (SWR-2318). Checked here rather than in one
    # entry point so `check`, `generate`, `diff` and the verifier all refuse it —
    # a reuse that only one command catches is a reuse that lands through another.
    from rotaris_core.reqtocode.tombstones import load_tombstones, reuse_errors

    result.errors.extend(reuse_errors(result.requirements, load_tombstones(repo_root, layout)))
    return result


def global_hash(requirements: list[ReqMeta]) -> str:
    payload = "\n".join(
        f"{r.req_id}|{r.status.value}|{int(r.trace_required)}|{int(r.test_required)}"
        f"|{r.title}|{r.source_path}|{r.content_hash}"
        f"|{r.req_type}|{','.join(str(n) for n in r.derived_from)}"
        for r in sorted(requirements, key=lambda r: r.number)
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def generate(requirements: list[ReqMeta], layout: RepoLayout | None = None) -> str:
    """Pure: requirement data -> generated source text (byte-deterministic)."""
    layout = layout if layout is not None else DEFAULT_LAYOUT
    reqs = sorted(requirements, key=lambda r: r.number)
    lines = [
        '"""Requirement traceables. AUTO-GENERATED - DO NOT EDIT BY HAND.',
        "",
        "Generated by rotaris_core.reqtocode.generator from"
        f" {layout.requirements_dir.as_posix()}/.",
        "Regenerate: `python -m rotaris_core.reqtocode generate` (or `check --fix`).",
        '"""',
        "",
        "# ruff: noqa",
        "# fmt: off",
        f"# GLOBAL-HASH: {global_hash(reqs)}",
        "",
        "from __future__ import annotations",
        "",
        "from enum import IntEnum",
        "",
        "from rotaris_core.reqtocode.declarations import ReqMeta, ReqStatus",
        "",
        "",
        "class SWR(IntEnum):",
        '    """One member per requirement in docs/requirements/ (SWR-<n> -> SWR_<n>)."""',
        "",
    ]
    for r in reqs:
        marker = f"[{r.status.value}]"
        if r.status is ReqStatus.DEPRECATED:
            marker = "[DEPRECATED - do not add new references]"
        lines.append(f"    SWR_{r.number} = {r.number}")
        lines.append(f'    """{marker} {_doc_safe(r.title)} - {r.source_path}"""')
        lines.append("")

    deprecated = [r for r in reqs if r.status is ReqStatus.DEPRECATED]
    lines.append("")
    if deprecated:
        lines.append("#: Members carrying the deprecation marker (blueprint §3/§5).")
        lines.append("DEPRECATED: frozenset[SWR] = frozenset({")
        for r in deprecated:
            lines.append(f"    SWR.SWR_{r.number},")
        lines.append("})")
    else:
        lines.append("DEPRECATED: frozenset[SWR] = frozenset()")
    lines.append("")
    lines.append("")
    lines.append("#: Requirement metadata keyed by member value.")
    lines.append("META: dict[int, ReqMeta] = {")
    for r in reqs:
        lines.append(
            f"    {r.number}: ReqMeta({r.req_id!r}, {r.number},"
            f" ReqStatus.{r.status.name}, {r.title!r}, {r.source_path!r},"
            f" {r.trace_required}, {r.test_required}, {r.content_hash!r},"
            f" {r.req_type!r}, {tuple(r.derived_from)!r}),"
        )
    lines.append("}")
    return "\n".join(lines) + "\n"


def _doc_safe(title: str) -> str:
    return title.replace('"""', "'''").replace("\\", "/")


def read_generated(repo_root: Path, layout: RepoLayout | None = None) -> str | None:
    layout = layout if layout is not None else DEFAULT_LAYOUT
    path = repo_root / layout.generated_path
    if not path.is_file():
        return None
    return _normalize(path.read_text(encoding="utf-8", errors="replace"))


def is_up_to_date(
    repo_root: Path, parsed: ParseResult | None = None, layout: RepoLayout | None = None
) -> bool:
    layout = layout if layout is not None else DEFAULT_LAYOUT
    parsed = parsed if parsed is not None else parse_requirements(repo_root, layout)
    if parsed.errors:
        return False
    return read_generated(repo_root, layout) == generate(parsed.requirements, layout)


def write_generated(repo_root: Path, content: str, layout: RepoLayout | None = None) -> None:
    """Atomic write (mkstemp + os.replace), LF endings, UTF-8."""
    layout = layout if layout is not None else DEFAULT_LAYOUT
    target = repo_root / layout.generated_path
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=str(target.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
        os.replace(tmp_name, target)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp_name)
        raise


def regenerate_if_stale(
    repo_root: Path,
    layout: RepoLayout | None = None,
    clock: object = None,
) -> tuple[bool, list[str]]:
    """Regenerate the traceables file when stale. Returns (changed, parse_errors).

    Parse errors abort generation (blueprint §3); the verifier surfaces them.

    This is also where a deletion is *seen* (SWR-2318). The module about to be
    replaced is the record of what existed last time, so an id it carries that
    the store no longer declares has been deleted — and there is no other moment
    at which ReqToCode can observe that. The tombstone is written before the new
    module, so a crash between the two leaves the id recorded rather than
    forgotten.
    """
    layout = layout if layout is not None else DEFAULT_LAYOUT
    parsed = parse_requirements(repo_root, layout)
    if parsed.errors:
        return False, parsed.errors
    content = generate(parsed.requirements, layout)
    previous = read_generated(repo_root, layout)
    if previous == content:
        return False, []
    _record_retirements(repo_root, previous, parsed.requirements, layout, clock)
    write_generated(repo_root, content, layout)
    return True, []


def _record_retirements(
    repo_root: Path,
    previous: str | None,
    current: list[ReqMeta],
    layout: RepoLayout,
    clock: object = None,
) -> list[str]:
    """Tombstone every id the previous generation had and the store dropped."""
    from rotaris_core.reqtocode.tombstones import (
        detect_retirements,
        load_tombstones,
        merge_tombstones,
        previous_requirements,
        today_iso,
        write_tombstones,
    )

    known = load_tombstones(repo_root, layout)
    retired = detect_retirements(
        previous_requirements(previous),
        current,
        retired_on=today_iso(clock),
        known=known,
    )
    if not retired:
        return []
    write_tombstones(repo_root, merge_tombstones(known, retired), layout)
    return [stone.req_id for stone in retired]


def _self_annotate() -> None:
    # Bootstrap-safe (blueprint §11): the generated module may not exist yet,
    # and this module must stay importable to regenerate it.
    try:
        from rotaris_core.reqtocode.declarations import traces
        from rotaris_core.reqtocode.swr import SWR

        traces(SWR.SWR_2324)(generate)
        traces(SWR.SWR_2324)(parse_requirements)
        traces(SWR.SWR_2335)(parse_requirements)
        traces(SWR.SWR_2324)(regenerate_if_stale)
        traces(SWR.SWR_2318)(_record_retirements)
        traces(SWR.SWR_2330)(_resolve_ids)
        traces(SWR.SWR_2330)(_parse_body_overrides)
        traces(SWR.SWR_2331)(_resolve_derived_from)
        traces(SWR.SWR_2331)(_build_requirement)
    except (ImportError, AttributeError):  # pragma: no cover - bootstrap/stale swr.py
        return


_self_annotate()
