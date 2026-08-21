"""Stand-ins for the services a Rotaris window talks to.

These live here rather than beside the first test that needed them because a
fake imported across test modules couples those modules: renaming a helper in
one file used to break collection in another, and two different classes both
called ``FakeRunBridge`` meant a reader could not tell which surface a test was
exercising.

Each fake records what the window asked it to do instead of doing it, so a test
can assert on the request — the prompt, the agent id, the model key — without a
live agent, a provider, or a thread. Anything that must behave rather than be
observed belongs in a real object, not here.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from PySide6.QtCore import QObject, Signal

from rotaris.models.requirements_state import RequirementsBoardState

if TYPE_CHECKING:
    from rotaris.models.requirements_state import RequirementDetail
    from rotaris.models.store import WorkspaceStore
    from rotaris.services.requirements_bridge import BoardDelta

__all__ = [
    "FakeCoordinatorBridge",
    "FakeModelConfigService",
    "FakeRequirementsBridge",
    "FakeRunBridge",
    "FakeRunConfigService",
]


class FakeRunBridge(QObject):
    """The single-run bridge MainWindow drives: records prompts and commands.

    Signals are real so a test can emit ``run_failed`` and watch the window's
    recovery path run for itself.
    """

    run_started = Signal(str)
    run_finished = Signal(str)
    run_failed = Signal(str)
    store_updated = Signal()

    def __init__(self) -> None:
        super().__init__()
        self.prompts: list[str] = []
        self.session_ids: list[str | None] = []
        self.steers: list[tuple[str, str]] = []
        self.queued: dict[str, str] = {}
        self.cancelled: list[str] = []
        self.paused: list[str] = []
        self.entry_model_switches: list[str] = []
        self.permission_modes: list[str] = []
        self.pause_result = True
        self.start_result = True
        self.shutdown_called = False
        self.running = False

    def start(self, prompt: str, session_id: str | None = None) -> bool:
        self.prompts.append(prompt)
        self.session_ids.append(session_id)
        self.running = self.start_result
        return self.start_result

    def switch_entry_model(self, model_key: str) -> bool:
        # A model switch only reaches a live run; a stopped one has nothing to
        # switch, and the window must handle that refusal.
        if not self.running:
            return False
        self.entry_model_switches.append(model_key)
        return True

    def set_permission_mode(self, mode: str) -> bool:
        # Like the model switch, a mode change only reaches a live run — but
        # unlike it, this one applies from the run's next tool call.
        if not self.running:
            return False
        self.permission_modes.append(mode)
        return True

    def steer(self, agent_id: str, text: str) -> bool:
        self.steers.append((agent_id, text))
        return True

    def queue_prompt(self, text: str) -> str:
        prompt_id = f"queued-{len(self.queued) + 1}"
        self.queued[prompt_id] = text
        return prompt_id

    def edit_queued_prompt(self, prompt_id: str, text: str) -> bool:
        if prompt_id not in self.queued:
            return False
        self.queued[prompt_id] = text
        return True

    def delete_queued_prompt(self, prompt_id: str) -> bool:
        return self.queued.pop(prompt_id, None) is not None

    def sync_queued_prompts(self) -> None:
        return None

    def cancel_agent(self, agent_id: str) -> bool:
        self.cancelled.append(agent_id)
        return True

    def pause_agent(self, agent_id: str) -> bool:
        self.paused.append(agent_id)
        return self.pause_result

    def shutdown(self) -> None:
        self.shutdown_called = True
        self.running = False


class FakeCoordinatorBridge(QObject):
    """One handle in RunCoordinator's pool: records what the coordinator routes.

    Distinct from `FakeRunBridge` because the coordinator holds several of these
    at once and starts them with isolation settings the window never passes.
    """

    run_started = Signal(str)
    run_finished = Signal(str)
    run_failed = Signal(str)
    refresh_failed = Signal(str)
    store_updated = Signal()
    compression_finished = Signal(int, str)
    session_summary = Signal(str, str, str)
    worktree_resolved = Signal(str, str)
    improvement_activity_changed = Signal(bool)

    def __init__(self) -> None:
        super().__init__()
        self.owns_improvement_indicator = True
        self.projection_enabled = True
        self.improvement_active = False
        self.running = False
        self.starts: list[tuple[str, str | None, Any, dict[str, Any]]] = []
        self.cancels = 0
        self.shutdowns = 0
        self.queued: list[str] = []
        self.synced = 0
        self.approvals: list[tuple[str, str]] = []
        self.permission_modes: list[str] = []
        #: Request ids this handle's run is actually blocked on; anything else
        #: is undeliverable here, exactly as in RunBridge.resolve_approval.
        self.pending_approval_ids: set[str] = set()

    def set_projection_enabled(self, enabled: bool) -> None:
        self.projection_enabled = enabled

    def start(
        self,
        prompt: str,
        session_id: str | None = None,
        isolation: Any | None = None,
        **kwargs: Any,
    ) -> bool:
        self.starts.append((prompt, session_id, isolation, kwargs))
        self.running = True
        return True

    def cancel(self) -> None:
        self.cancels += 1
        self.running = False

    def shutdown(self) -> None:
        self.shutdowns += 1
        self.running = False

    def queue_prompt(self, text: str) -> str:
        self.queued.append(text)
        return f"prompt-{len(self.queued)}"

    def sync_queued_prompts(self) -> None:
        self.synced += 1

    def pause(self) -> bool:
        self.running = False
        return True

    def resolve_approval(self, request_id: str, option: str) -> bool:
        self.approvals.append((request_id, option))
        return request_id in self.pending_approval_ids

    def set_permission_mode(self, mode: str) -> bool:
        self.permission_modes.append(mode)
        return self.running


class FakeRequirementsBridge(QObject):
    """The requirement-engine seam a `RequirementsController` is wired to.

    Records the evaluations the controller asked for and lets a test publish an
    answer — including a failure and an unavailable workspace — without a
    requirement store, a thread or a repository. The signal shapes are the real
    bridge's, so a controller that connects to the wrong one fails here.
    """

    evaluated = Signal(object, object)
    failed = Signal(str)
    unavailable = Signal(str)
    busy_changed = Signal(bool)
    analysing_changed = Signal(bool)
    detail_ready = Signal(object)
    detail_failed = Signal(str, str)

    def __init__(self) -> None:
        super().__init__()
        self.refreshes = 0
        #: What each refresh was allowed to cost (SWR-3319), in order.
        self.kinds: list[object] = []
        self.cancellations = 0
        self.analysing = False
        self.shutdowns = 0
        self.busy = False
        self.refresh_result = True
        self.state = RequirementsBoardState()
        self.details: dict[str, RequirementDetail] = {}
        #: What the deep read (SWR-3313) answers with, per requirement. Absent
        #: means this workspace has no deep half — the real bridge's
        #: ``open_detail`` returns ``False`` there too.
        self.deep_details: dict[str, RequirementDetail] = {}
        self.deep_reads: list[str] = []

    def refresh(self, kind: object | None = None) -> bool:
        self.refreshes += 1
        self.kinds.append(kind)
        return self.refresh_result

    def cancel_analysis(self) -> bool:
        """Record the stop and answer as the real bridge does (SWR-3319)."""
        self.cancellations += 1
        return self.analysing

    def detail_for(self, req_id: str) -> RequirementDetail | None:
        return self.details.get(req_id)

    def open_detail(self, req_id: str) -> bool:
        """Record the deep read and answer it at once — no thread in a fake."""
        self.deep_reads.append(req_id)
        deep = self.deep_details.get(req_id)
        if deep is None:
            return False
        self.detail_ready.emit(deep)
        return True

    def shutdown(self) -> None:
        self.shutdowns += 1

    def publish(self, state: RequirementsBoardState, delta: BoardDelta) -> None:
        """Answer an evaluation the way the real bridge answers one."""
        self.state = state
        self.evaluated.emit(state, delta)


class FakeModelConfigService:
    """Answers the model/provider questions the window asks during recovery.

    Two providers with a shared fallback, so a test can tell a same-provider
    retry apart from a genuine switch to another provider.
    """

    def __init__(self, store: WorkspaceStore) -> None:
        self.store = store
        self.primary = "deepseek/deepseek-chat"
        self.fallback = "deepseek/deepseek-reasoner"
        self.providers = {
            "deepseek/deepseek-chat": "deepseek",
            "deepseek/deepseek-reasoner": "deepseek",
            "copilot/gpt-5": "copilot",
        }
        self.saved_keys: list[tuple[str, str]] = []

    def entry_model(self) -> str:
        return self.store.session_model_override or self.primary

    def fallback_model(self) -> str:
        return self.fallback

    def model_provider(self, model_key: str) -> str:
        return self.providers.get(model_key, "")

    def model_providers(self) -> dict[str, str]:
        return dict(self.providers)

    def provider_flow_type(self, provider_id: str) -> str:
        return "api_key" if provider_id == "deepseek" else "device_code"

    def save_provider_api_key(self, provider_id: str, api_key: str) -> None:
        self.saved_keys.append((provider_id, api_key))


class FakeRunConfigService:
    """Hands the coordinator a fresh, identifiable run config per launch.

    Each snapshot differs, so a test can prove two parallel runs were handed
    their own configuration rather than sharing one object.
    """

    def __init__(self) -> None:
        self.config = object()
        self.loaded: list[str] = []
        self.run_configs = 0

    def build_run_config(self) -> Any:
        self.run_configs += 1
        return {"snapshot": self.run_configs}

    def load_session(self, session_id: str) -> None:
        self.loaded.append(session_id)
