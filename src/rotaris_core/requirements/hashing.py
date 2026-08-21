"""Requirement content hashing (SWR-3107).

Everything downstream in the requirements board rests on being able to name
*which version* of a requirement is meant: ``satisfied_hash`` (SWR-3204), change
detection (SWR-3501) and run snapshots (SWR-3402) all compare a stored hash
against a freshly read one. A hash that moves when a file is reformatted makes
every one of them cry wolf; a hash that stays put when a sentence of the
specification changes makes all three lie.

**Why this is not ``reqtocode``'s hash.** ``rotaris_core.reqtocode.generator``
hashes the *raw file text* of a requirement document (``sha256`` truncated to 16
hex characters), which is exactly right for its job: it detects that a
requirement document changed at all, so the generated ``swr.py`` and the
traceability baselines can be regenerated. It is the wrong input here, because
it is stable against nothing but line endings — reordering frontmatter keys, or
adding a link line, moves it — and because it only exists for sources that are
Markdown files in this repository's layout. This module therefore **restates**
the hash over the *canonical content* (SWR-3101's fields) and deliberately keeps
``reqtocode``'s algorithm and digest length, so the two are comparable in shape
and a built-in requirement may carry ReqToCode's own ``content_hash`` verbatim
where baseline continuity matters (see :mod:`rotaris_core.requirements.model`).

The hash input is the requirement's *meaning*, normalised:

- line endings (CRLF, CR, LF) collapse to LF, so a Windows checkout and a POSIX
  checkout of the same file agree;
- trailing whitespace on every line is dropped, and runs of blank lines collapse
  to one, so a formatter cannot move the hash;
- single-line fields (id, title) collapse internal whitespace runs to one space;
- fields are serialised in a fixed order with explicit names, so the order they
  were authored or parsed in cannot reach the digest;
- relations are sorted and de-duplicated, and the parent is folded in as a
  ``parent`` relation, so a source modelling the parent as a field and one
  modelling it as an edge hash identically.

Records are joined with ASCII unit/record separators rather than newlines, so no
value can impersonate a field boundary: moving text out of the title and into
the description changes the digest, which is the property a hash used for change
detection has to have.

Pure by construction: no filesystem, no clock, no source access.
"""

from __future__ import annotations

import hashlib
import re
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Iterable

#: Hex characters kept from the digest. Matches ``reqtocode``'s ``content_hash``
#: so a canonical hash and a built-in source's native hash are the same shape.
HASH_LENGTH = 16

#: Named for the record, so a stored hash can be re-derived years later.
HASH_ALGORITHM = "sha256"

#: Field name / value separator inside one record (ASCII unit separator).
_FIELD_SEP = "\x1f"

#: Record separator between fields (ASCII record separator).
_RECORD_SEP = "\x1e"

_WHITESPACE_RUN = re.compile(r"\s+")
_TRAILING_SPACE = re.compile(r"[ \t]+$", re.MULTILINE)
_BLANK_RUN = re.compile(r"\n{3,}")


def normalize_line_endings(text: str) -> str:
    """CRLF and lone CR become LF; nothing else changes."""
    return text.replace("\r\n", "\n").replace("\r", "\n")


@traces(SWR.SWR_3107)
def normalize_block(text: str) -> str:
    """Normalise a multi-line field (a description) for hashing.

    Line endings collapse to LF, trailing whitespace on each line is dropped,
    runs of blank lines collapse to a single blank line, and leading/trailing
    whitespace is stripped. Interior blank lines survive as paragraph breaks —
    they are formatting, but removing them would let two genuinely different
    layouts of the same words collide with prose that reads differently.
    """
    normalized = normalize_line_endings(text)
    normalized = _TRAILING_SPACE.sub("", normalized)
    normalized = _BLANK_RUN.sub("\n\n", normalized)
    return normalized.strip()


@traces(SWR.SWR_3107)
def normalize_inline(text: str) -> str:
    """Normalise a single-line field (an id, a title, a relation target)."""
    return _WHITESPACE_RUN.sub(" ", normalize_line_endings(text)).strip()


def _normalize_relations(
    relations: Iterable[tuple[str, str]],
    parent: str | None,
) -> tuple[tuple[str, str], ...]:
    """Sorted, de-duplicated ``(kind, target)`` pairs including the parent edge."""
    pairs = {
        (normalize_inline(kind), normalize_inline(target))
        for kind, target in relations
        if normalize_inline(kind) and normalize_inline(target)
    }
    if parent is not None and normalize_inline(parent):
        pairs.add(("parent", normalize_inline(parent)))
    return tuple(sorted(pairs))


@traces(SWR.SWR_3107)
def canonical_payload(
    *,
    req_id: str,
    title: str = "",
    description: str = "",
    lifecycle: str = "draft",
    req_type: str = "product",
    relations: Iterable[tuple[str, str]] = (),
    parent: str | None = None,
) -> str:
    """The exact string :func:`requirement_hash` digests.

    Exposed rather than hidden so a hash mismatch can be *explained* — a caller
    that sees two hashes disagree can diff the two payloads and read which field
    moved, instead of bisecting requirement files.
    """
    records = [
        f"id{_FIELD_SEP}{normalize_inline(req_id)}",
        f"title{_FIELD_SEP}{normalize_inline(title)}",
        f"lifecycle{_FIELD_SEP}{normalize_inline(lifecycle).lower()}",
        f"type{_FIELD_SEP}{normalize_inline(req_type).lower()}",
    ]
    records.extend(
        f"relation{_FIELD_SEP}{kind}{_FIELD_SEP}{target}"
        for kind, target in _normalize_relations(relations, parent)
    )
    records.append(f"description{_FIELD_SEP}{normalize_block(description)}")
    return _RECORD_SEP.join(records)


@traces(SWR.SWR_3107)
def content_hash(payload: str) -> str:
    """Digest an already-canonical payload."""
    return hashlib.new(HASH_ALGORITHM, payload.encode("utf-8")).hexdigest()[:HASH_LENGTH]


@traces(SWR.SWR_3107)
def requirement_hash(
    *,
    req_id: str,
    title: str = "",
    description: str = "",
    lifecycle: str = "draft",
    req_type: str = "product",
    relations: Iterable[tuple[str, str]] = (),
    parent: str | None = None,
) -> str:
    """``current_hash`` for one requirement's canonical content.

    Takes primitives rather than a
    :class:`~rotaris_core.requirements.model.CanonicalRequirement` so the model
    can depend on the hash and not the other way round, and so an adapter can
    compute a hash while it is still assembling fields.
    """
    return content_hash(
        canonical_payload(
            req_id=req_id,
            title=title,
            description=description,
            lifecycle=lifecycle,
            req_type=req_type,
            relations=relations,
            parent=parent,
        ),
    )
