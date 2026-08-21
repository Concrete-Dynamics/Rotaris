from __future__ import annotations

from rotaris_core.providers.model_availability import (
    AVAILABLE,
    NO_SUPPORTED_ROUTE,
    POLICY_DISABLED,
    availability_reason,
    is_available,
)
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_2813)
def test_models_without_a_recorded_classification_stay_usable() -> None:
    """Productive use: a catalog discovered before availability was recorded still works.
    Expected outcome: an absent or empty code reads as available."""
    assert is_available(None)
    assert is_available("")
    assert is_available(AVAILABLE)
    assert not is_available(POLICY_DISABLED)
    assert not is_available(NO_SUPPORTED_ROUTE)


@verifies(SWR.SWR_2812, SWR.SWR_2813)
def test_each_cause_gets_its_own_actionable_sentence() -> None:
    """Productive use: a user reads the picker and learns which problem they have.
    Expected outcome: a policy block and a missing route do not collapse into one message."""
    policy = availability_reason(POLICY_DISABLED)
    route = availability_reason(NO_SUPPORTED_ROUTE)

    assert policy != route
    assert "settings" in policy
    assert "endpoint" in route
    assert availability_reason(AVAILABLE) == ""


@verifies(SWR.SWR_2813)
def test_provider_detail_is_appended_not_substituted() -> None:
    """Productive use: the provider's own wording adds specificity without costing the
    user the actionable part. Expected outcome: both sentences survive, punctuated."""
    reason = availability_reason(POLICY_DISABLED, detail="Ask your admin to enable it")

    assert reason.startswith(availability_reason(POLICY_DISABLED))
    assert reason.endswith("Ask your admin to enable it.")


@verifies(SWR.SWR_2813)
def test_an_unrecognised_cause_still_says_something_true() -> None:
    """Productive use: a provider grows a rejection Rotaris does not model yet.
    Expected outcome: the picker gets a sentence rather than an empty tooltip."""
    assert availability_reason("quota_exhausted_forever") != ""
