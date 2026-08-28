"""Trace/coverage decorator behavior (blueprint §4)."""

from __future__ import annotations

from dataclasses import replace

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.declarations import (
    TRACES_ATTR,
    VERIFIES_ATTR,
    ReqStatus,
    traces,
)
from rotaris_core.reqtocode.swr import META


def _deprecated_member(monkeypatch: pytest.MonkeyPatch) -> SWR:
    """An approved member re-labelled deprecated for the duration of one test.

    The store carries no deprecated requirement to borrow — the 2026-08-28 sweep
    deleted the superseded ones and tombstoned their ids — and the warning must
    keep firing for a store that is mid-transition, so the deprecated metadata
    is supplied here instead of taken from `META`.
    """
    member = _approved_member()
    monkeypatch.setitem(META, int(member), replace(META[int(member)], status=ReqStatus.DEPRECATED))
    return member


def _approved_member() -> SWR:
    meta = next(m for m in META.values() if m.status is ReqStatus.APPROVED)
    return SWR(meta.number)


@verifies(SWR.SWR_2325)
def test_traces_attaches_requirement_numbers() -> None:
    member = _approved_member()

    @traces(member)
    def implementation() -> None: ...

    assert getattr(implementation, TRACES_ATTR) == (int(member),)
    assert not hasattr(implementation, VERIFIES_ATTR)


@verifies(SWR.SWR_2325)
def test_multiple_requirements_and_stacking_accumulate() -> None:
    first, second = SWR.SWR_2324, SWR.SWR_2325

    @traces(first)
    @traces(second)
    class Implementation: ...

    assert set(getattr(Implementation, TRACES_ATTR)) == {int(first), int(second)}


@verifies(SWR.SWR_2325)
def test_verifies_uses_separate_attribute() -> None:
    member = _approved_member()

    decorated = verifies(member)(lambda: None)
    assert getattr(decorated, VERIFIES_ATTR) == (int(member),)
    assert not hasattr(decorated, TRACES_ATTR)


@verifies(SWR.SWR_2325)
def test_deprecated_reference_emits_deprecation_warning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    member = _deprecated_member(monkeypatch)
    with pytest.warns(DeprecationWarning, match=META[int(member)].req_id):
        traces(member)(lambda: None)
    with pytest.warns(DeprecationWarning, match=META[int(member)].req_id):
        verifies(member)(lambda: None)


@verifies(SWR.SWR_2325)
def test_non_deprecated_reference_does_not_warn(recwarn: pytest.WarningsRecorder) -> None:
    traces(_approved_member())(lambda: None)
    assert not [w for w in recwarn if issubclass(w.category, DeprecationWarning)]
