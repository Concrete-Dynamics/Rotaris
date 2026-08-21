"""Phase A.5 R3 regression: openhands-sdk's litellm binding point must stay stable.

The LiteLLM integration plan (Slice 3) mocks ``litellm.completion`` calls in
integration tests by monkey-patching::

    openhands.sdk.llm.llm.litellm_completion

This is the *exact* symbol the SDK rebinds from
``litellm.completion`` at import time (see openhands-sdk's
``llm.py`` around lines 44-49). If a future openhands-sdk release renames or
relocates that binding — e.g. moving it onto a class attribute, or importing
``litellm`` lazily inside a method — every Slice 3 integration test would
silently fall through to the real network call.

This test exists purely to fail loudly the moment the pinned binding point
shifts, so a maintainer notices before integration tests start hitting the
live API.

Pinned contract:

1. The module ``openhands.sdk.llm.llm`` exposes a module-level attribute
   named ``litellm_completion``.
2. That attribute is callable (it is a function, not a sentinel / None).
3. It is the same object as ``litellm.completion`` at import time — i.e. the
   SDK has not started wrapping it in some intermediate adapter that we would
   need to patch differently.
"""

from __future__ import annotations

from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_306, SWR.SWR_2107)
def test_openhands_sdk_exposes_litellm_completion_at_pinned_path() -> None:
    # Importing the SDK module here mirrors what the production loader does;
    # if this import fails the pin is already broken.
    import openhands.sdk.llm.llm as sdk_llm_module

    assert hasattr(sdk_llm_module, "litellm_completion"), (
        "openhands.sdk.llm.llm no longer exposes ``litellm_completion`` at module "
        "scope — Slice 3 integration tests can no longer mock LiteLLM via "
        "monkeypatch.setattr('openhands.sdk.llm.llm.litellm_completion', ...). "
        "Update the integration test mock targets before bumping openhands-sdk."
    )
    assert callable(sdk_llm_module.litellm_completion), (
        "openhands.sdk.llm.llm.litellm_completion exists but is not callable; "
        "the SDK's binding contract has changed."
    )


@verifies(SWR.SWR_2107)
def test_openhands_sdk_litellm_completion_is_the_real_litellm_completion() -> None:
    """The SDK must rebind ``litellm.completion`` directly, not a wrapper.

    If a wrapper is introduced, patching the SDK-side symbol still works for
    the SDK's own call site, but anything in the codebase that imports
    ``litellm.completion`` directly would bypass the mock. We assert identity
    here so the test author is forced to broaden the patch surface when this
    invariant changes.
    """
    import litellm
    import openhands.sdk.llm.llm as sdk_llm_module

    assert sdk_llm_module.litellm_completion is litellm.completion, (
        "openhands.sdk.llm.llm.litellm_completion is no longer the same object as "
        "litellm.completion. Slice 3 integration tests assume identity; if the SDK "
        "now wraps the function, mocks must be re-pointed accordingly."
    )


@verifies(SWR.SWR_306, SWR.SWR_2107)
def test_litellm_package_still_exposes_completion_top_level() -> None:
    """LiteLLM itself must keep ``litellm.completion`` as the canonical entry
    point. Slice 3 fallback meta-tests (``respx``-backed) patch this directly
    when the SDK indirection is not the right target.
    """
    import litellm

    assert hasattr(litellm, "completion"), (
        "litellm.completion is missing — the canonical completion entry point "
        "moved. Update the LiteLLM dependency pin and Slice 3 mocks together."
    )
    assert callable(litellm.completion)
