"""Hand-written ReqToCode declarations (blueprint §4).

`ReqStatus` / `ReqMeta` are the metadata carried by the generated `swr.py`;
`traces` / `verifies` are the annotations placed on implementations and tests.
Stdlib-only: the pre-commit hook imports this without the project venv.
"""

from __future__ import annotations

import contextlib
import warnings
from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Callable

TRACES_ATTR = "__reqtocode_traces__"
VERIFIES_ATTR = "__reqtocode_verifies__"


class ReqStatus(StrEnum):
    """Requirement lifecycle (blueprint §5)."""

    DRAFT = "draft"
    APPROVED = "approved"
    DEPRECATED = "deprecated"


@dataclass(frozen=True)
class ReqMeta:
    """Metadata for one requirement, mirrored into the generated file."""

    req_id: str
    number: int
    status: ReqStatus
    title: str
    source_path: str
    trace_required: bool
    test_required: bool
    content_hash: str
    req_type: str = "product"
    derived_from: tuple[int, ...] = ()


def _warn_if_deprecated(reqs: tuple[int, ...], kind: str) -> None:
    # Lazy import: the generated module may not exist during bootstrap.
    try:
        from rotaris_core.reqtocode.swr import META
    except ImportError:
        return
    for req in reqs:
        meta = META.get(int(req))
        if meta is not None and meta.status is ReqStatus.DEPRECATED:
            warnings.warn(
                f"{kind} references deprecated requirement {meta.req_id}"
                f" ({meta.title!r}, {meta.source_path})",
                DeprecationWarning,
                stacklevel=4,
            )


def _annotate[T](obj: T, attr: str, reqs: tuple[int, ...]) -> T:
    existing: tuple[int, ...] = tuple(getattr(obj, attr, ()))
    # Slotted/builtin objects reject attributes: static scan still sees the reference.
    with contextlib.suppress(AttributeError, TypeError):
        setattr(obj, attr, existing + tuple(int(r) for r in reqs))
    return obj


def traces[T](*reqs: int) -> Callable[[T], T]:
    """Mark the decorated class/function as implementing the given requirements."""
    _warn_if_deprecated(reqs, "traces")

    def decorator(obj: T) -> T:
        return _annotate(obj, TRACES_ATTR, reqs)

    return decorator


def verifies[T](*reqs: int) -> Callable[[T], T]:
    """Mark the decorated test as covering the given requirements.

    Only occurrences inside test roots count as coverage (blueprint §4).
    """
    _warn_if_deprecated(reqs, "verifies")

    def decorator(obj: T) -> T:
        return _annotate(obj, VERIFIES_ATTR, reqs)

    return decorator


def _self_annotate() -> None:
    # Bootstrap-safe and cycle-safe: swr.py imports this module, so importing
    # it back here can hit a partially initialized module — skip in that case;
    # the static reference sweep still sees the traces() call below.
    try:
        from rotaris_core.reqtocode.swr import SWR

        traces(SWR.SWR_2325)(traces)
        traces(SWR.SWR_2325)(verifies)
    except (ImportError, AttributeError):  # pragma: no cover - bootstrap/stale swr.py
        return


_self_annotate()
