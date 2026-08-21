from __future__ import annotations

from dataclasses import dataclass
from time import monotonic

from rotaris_core.reqtocode import SWR, traces


@dataclass
@traces(SWR.SWR_1072)
class RunTimer:
    run_started_at: float | None = None
    segment_started_at: float | None = None
    run_total_seconds: float | None = None

    def start_run(self) -> None:
        now = monotonic()
        self.run_started_at = now
        self.segment_started_at = now
        self.run_total_seconds = None

    def start_segment(self) -> None:
        self.segment_started_at = monotonic()

    def end_run(self) -> None:
        if self.run_started_at is not None:
            self.run_total_seconds = monotonic() - self.run_started_at
        self.run_started_at = None
        self.segment_started_at = None

    def is_active(self) -> bool:
        return self.run_started_at is not None

    def format_display(self) -> str | None:
        if self.run_total_seconds is not None:
            return _format_elapsed(self.run_total_seconds)
        if self.segment_started_at is not None:
            return _format_elapsed(monotonic() - self.segment_started_at)
        return None


def _format_elapsed(seconds: float) -> str:
    s = int(seconds)
    m, s = divmod(s, 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"
