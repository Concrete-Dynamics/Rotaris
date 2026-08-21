from __future__ import annotations

import pytest
from fakes import FakeModelConfigService, FakeRunBridge
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models import sample_store
from rotaris.views.main_window import MainWindow

pytestmark = pytest.mark.integration

AUTH_ERROR = (
    "Conversation run failed for id=a1b5bbc8-f2b3-4e8c-9001-002fe36fb02f: "
    "litellm.AuthenticationError: AuthenticationError: DeepseekException - "
    "Authentication Fails (governor)"
)


def _window_with_failed_run(qtbot) -> tuple[MainWindow, FakeRunBridge, FakeModelConfigService]:
    store = sample_store()
    bridge = FakeRunBridge()
    config = FakeModelConfigService(store)
    window = MainWindow(store, config_service=config, run_bridge=bridge)
    qtbot.addWidget(window)
    window._submit_prompt("fix the auth bug")
    return window, bridge, config


def test_auth_failure_retries_once_with_fallback_model(qtbot) -> None:
    window, bridge, config = _window_with_failed_run(qtbot)

    bridge.run_failed.emit(AUTH_ERROR)

    assert bridge.prompts == ["fix the auth bug", "fix the auth bug"]
    assert window.store.session_model_override == config.fallback
    assert window._auth_dialog is None


def test_second_auth_failure_opens_recovery_dialog_with_other_providers(qtbot) -> None:
    window, bridge, _config = _window_with_failed_run(qtbot)

    bridge.run_failed.emit(AUTH_ERROR)  # fallback retry
    bridge.run_failed.emit(AUTH_ERROR)  # fallback also failed

    assert len(bridge.prompts) == 2  # no silent third retry
    dialog = window._auth_dialog
    assert dialog is not None
    models = [dialog.model_combo.itemData(i) for i in range(dialog.model_combo.count())]
    assert models == ["copilot/gpt-5"]  # only models from other providers


def test_recovery_dialog_model_selection_restarts_run(qtbot) -> None:
    window, bridge, _config = _window_with_failed_run(qtbot)
    bridge.run_failed.emit(AUTH_ERROR)
    bridge.run_failed.emit(AUTH_ERROR)
    dialog = window._auth_dialog

    dialog.retry_model_button.click()

    assert len(bridge.prompts) == 3
    assert window.store.session_model_override == "copilot/gpt-5"


@verifies(SWR.SWR_2043)
def test_recovery_dialog_api_key_reauth_saves_key_and_retries(qtbot) -> None:
    window, bridge, config = _window_with_failed_run(qtbot)
    bridge.run_failed.emit(AUTH_ERROR)
    bridge.run_failed.emit(AUTH_ERROR)
    dialog = window._auth_dialog

    assert dialog.api_key_input is not None  # deepseek is an api-key provider
    assert not dialog.reauth_button.isEnabled()
    dialog.api_key_input.setText("sk-new-key")
    assert dialog.reauth_button.isEnabled()
    dialog.reauth_button.click()

    assert config.saved_keys == [("deepseek", "sk-new-key")]
    assert len(bridge.prompts) == 3


def test_fallback_retry_opens_nonmodal_primary_reauth_prompt(qtbot) -> None:
    window, bridge, config = _window_with_failed_run(qtbot)

    bridge.run_failed.emit(AUTH_ERROR)

    prompt = window._reauth_prompt
    assert prompt is not None
    assert not prompt.isModal()  # the run keeps going on the fallback
    assert prompt.provider_id == "deepseek"
    assert prompt.api_key_input is not None  # deepseek is an api-key provider
    assert len(bridge.prompts) == 2  # fallback restart already fired


def test_primary_reauth_switches_running_flow_back_to_primary(qtbot) -> None:
    window, bridge, config = _window_with_failed_run(qtbot)
    bridge.run_failed.emit(AUTH_ERROR)
    prompt = window._reauth_prompt

    prompt.api_key_input.setText("sk-fresh-key")
    prompt.reauth_button.click()

    assert config.saved_keys == [("deepseek", "sk-fresh-key")]
    assert bridge.entry_model_switches == [config.primary]
    assert window.store.session_model_override == config.primary
    assert window._reauth_prompt is None
    assert window._auth_fallback_attempted is False
    assert len(bridge.prompts) == 2  # live switch, no extra restart


def test_primary_reauth_after_run_ended_sets_model_for_next_run(qtbot) -> None:
    window, bridge, config = _window_with_failed_run(qtbot)
    bridge.run_failed.emit(AUTH_ERROR)
    prompt = window._reauth_prompt
    bridge.running = False  # fallback run finished before the user reauthed

    prompt.api_key_input.setText("sk-fresh-key")
    prompt.reauth_button.click()

    assert bridge.entry_model_switches == []
    assert window.store.session_model_override == config.primary


def test_second_auth_failure_closes_background_reauth_prompt(qtbot) -> None:
    window, bridge, _config = _window_with_failed_run(qtbot)
    bridge.run_failed.emit(AUTH_ERROR)
    prompt = window._reauth_prompt
    assert prompt is not None

    bridge.run_failed.emit(AUTH_ERROR)  # fallback also failed → modal takes over

    assert window._reauth_prompt is None
    assert not prompt.isVisible()
    assert window._auth_dialog is not None


@verifies(SWR.SWR_2043)
def test_oauth_provider_reauth_prompt_offers_confirm_button(qtbot) -> None:
    window, bridge, config = _window_with_failed_run(qtbot)
    config.primary = "copilot/gpt-5"  # device_code flow provider
    window.store.session_model_override = ""

    bridge.run_failed.emit(AUTH_ERROR)

    prompt = window._reauth_prompt
    assert prompt is not None
    assert prompt.api_key_input is None
    prompt.reauth_button.click()

    assert config.saved_keys == []  # no key to store for OAuth flows
    assert bridge.entry_model_switches == ["copilot/gpt-5"]


def test_non_auth_failure_does_not_retry(qtbot) -> None:
    window, bridge, _config = _window_with_failed_run(qtbot)

    bridge.run_failed.emit("Run failed: 429 Too Many Requests")

    assert bridge.prompts == ["fix the auth bug"]
    assert window._auth_dialog is None
    assert window.store.session_status == "failed"
