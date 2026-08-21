from __future__ import annotations

import xxhash

from rotaris_core.reqtocode import SWR, traces

BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
ANCHOR_LENGTH = 4

# Sentinel context-hash values for file boundaries (no neighbor line).
BOF_SENTINEL = "BOF"
EOF_SENTINEL = "EOF"


@traces(SWR.SWR_1814)
def line_hash(line_content: str) -> str:
    """Return the stable per-line anchor (base62, length ANCHOR_LENGTH).

    Trailing CR/LF are stripped before hashing; leading whitespace is hashed.
    """
    normalized = line_content.rstrip("\r\n")
    digest = xxhash.xxh32(normalized.encode("utf-8")).intdigest()
    value = digest
    chars = []
    for _ in range(ANCHOR_LENGTH):
        chars.append(BASE62_CHARS[value % len(BASE62_CHARS)])
        value //= len(BASE62_CHARS)
    return "".join(chars)


def file_hashes(lines: list[str]) -> list[str]:
    return [line_hash(line) for line in lines]


def snapshot_id(raw_bytes: bytes) -> str:
    """Stable content-derived snapshot identifier for a file.

    xxh64 hex of the raw bytes; ``"empty"`` for an empty file. The id is used
    by ``haet_edit`` to detect stale reads — any change to the file flips the
    id, so the engine can refuse edits whose snapshot has gone stale.
    """
    if not raw_bytes:
        return "empty"
    return xxhash.xxh64(raw_bytes).hexdigest()


def context_hash_for_position(lines: list[str], index: int, *, side: str) -> str:
    """Compute the context hash for the neighbor line at ``index``.

    ``side`` is ``"before"`` or ``"after"``; when ``index`` falls outside the
    file the corresponding boundary sentinel is returned. Otherwise returns
    the first 16 hex chars of xxh64 over the line (trailing CR/LF stripped).
    """
    if side not in ("before", "after"):
        raise ValueError(f"side must be 'before' or 'after', got {side!r}")
    if index < 0:
        return BOF_SENTINEL
    if index >= len(lines):
        return EOF_SENTINEL
    normalized = lines[index].rstrip("\r\n")
    return xxhash.xxh64(normalized.encode("utf-8")).hexdigest()[:16]
