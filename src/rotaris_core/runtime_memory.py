"""Optional runtime memory diagnostics.

The hot path should not pay for ``tracemalloc`` unless the user explicitly
enables it.  This module keeps the scheduler-facing API tiny and JSON-friendly.
"""

from __future__ import annotations

import os
import tracemalloc
from dataclasses import dataclass, field
from typing import Any

from rotaris_core.reqtocode import SWR, traces


@dataclass(frozen=True, slots=True)
class MemorySnapshot:
    label: str
    rss_bytes: int | None
    traced_current_bytes: int | None
    traced_peak_bytes: int | None
    top_allocations: list[dict[str, Any]] = field(default_factory=list)

    def model_dump(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "rss_bytes": self.rss_bytes,
            "traced_current_bytes": self.traced_current_bytes,
            "traced_peak_bytes": self.traced_peak_bytes,
            "top_allocations": self.top_allocations,
        }


@traces(SWR.SWR_2068, SWR.SWR_2069, SWR.SWR_2071)
def ensure_tracemalloc_started(*, enabled: bool, frames: int = 25) -> bool:
    """Start ``tracemalloc`` when diagnostics are enabled.

    Returns True when tracing is active after the call.  ``frames`` is clamped
    because very deep tracebacks can noticeably increase memory overhead.
    """
    if not enabled:
        return tracemalloc.is_tracing()
    if not tracemalloc.is_tracing():
        tracemalloc.start(max(1, min(int(frames), 50)))
    return True


def capture_memory_snapshot(label: str, *, top_frames: int = 8) -> MemorySnapshot:
    rss_bytes = _current_rss_bytes()
    traced_current: int | None = None
    traced_peak: int | None = None
    top_allocations: list[dict[str, Any]] = []

    if tracemalloc.is_tracing():
        traced_current, traced_peak = tracemalloc.get_traced_memory()
        if top_frames > 0:
            snapshot = tracemalloc.take_snapshot()
            for stat in snapshot.statistics("lineno")[:top_frames]:
                frame = stat.traceback[0]
                top_allocations.append(
                    {
                        "file": frame.filename,
                        "line": frame.lineno,
                        "size_bytes": stat.size,
                        "count": stat.count,
                    },
                )

    return MemorySnapshot(
        label=label,
        rss_bytes=rss_bytes,
        traced_current_bytes=traced_current,
        traced_peak_bytes=traced_peak,
        top_allocations=top_allocations,
    )


def _current_rss_bytes() -> int | None:
    """Return current resident memory on Linux, falling back to ``None``."""
    status_path = "/proc/self/status"
    try:
        with open(status_path, encoding="utf-8") as handle:
            for line in handle:
                if not line.startswith("VmRSS:"):
                    continue
                parts = line.split()
                if len(parts) >= 2:
                    return int(parts[1]) * 1024
    except OSError:
        return None

    try:
        import resource

        getrusage = getattr(resource, "getrusage", None)
        usage_self = getattr(resource, "RUSAGE_SELF", None)
        if getrusage is None or usage_self is None:
            return None
        peak_kib = getrusage(usage_self).ru_maxrss
    except (OSError, ImportError, AttributeError):
        return None

    if os.name == "posix":
        return int(peak_kib) * 1024
    return int(peak_kib)
