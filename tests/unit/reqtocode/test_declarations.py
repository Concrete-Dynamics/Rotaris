"""Trace/coverage decorator behavior (blueprint §4)."""

from __future__ import annotations

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.declarations import (
    TRACES_ATTR,
    VERIFIES_ATTR,
    ReqStatus,
    traces,
)
from rotaris_core.reqtocode.swr import META


def _deprecated_member() -> SWR:
    meta = next(m for m in META.values() if m.status is ReqStatus.DEPRECATED)
    return SWR(meta.number)


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
def test_deprecated_reference_emits_deprecation_warning() -> None:
    member = _deprecated_member()
    with pytest.warns(DeprecationWarning, match=META[int(member)].req_id):
        traces(member)(lambda: None)
    with pytest.warns(DeprecationWarning, match=META[int(member)].req_id):
        verifies(member)(lambda: None)


@verifies(SWR.SWR_2325)
def test_non_deprecated_reference_does_not_warn(recwarn: pytest.WarningsRecorder) -> None:
    traces(_approved_member())(lambda: None)
    assert not [w for w in recwarn if issubclass(w.category, DeprecationWarning)]
