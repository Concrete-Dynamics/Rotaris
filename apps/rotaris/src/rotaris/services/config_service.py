"""Map rotaris-cli configuration and persisted sessions into the desktop store."""

from __future__ import annotations

import datetime as dt
from importlib.metadata import PackageNotFoundError, version
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

from rotaris.models.state import (
    AgentNode,
    AgentState,
    ArtifactInfo,
    ImprovementProposal,
    McpServer,
    ModelOption,
    PersonaSpec,
    ProjectInitState,
    ProviderInfo,
    SessionInfo,
    SkillInfo,
    SubscriptionLimit,
    TodoItem,
    TranscriptDelta,
    TranscriptEvent,
)

ROTARIS_CLOUD_PROVIDER_ID = "concrete-cloud"
ROTARIS_CLOUD_QUICK_START_URL = "https://concrete-dynamics.com/rotaris"

#: The sandbox (SWR-2507) and network egress (SWR-2505) policy fields the
#: desktop edits. The store mirrors ``RuntimePolicy`` name for name, so one
#: tuple drives loading, run-config assignment, and the saved YAML.
SECURITY_POLICY_FIELDS: tuple[str, ...] = (
    "sandbox_mode",
    "sandbox_writable_roots",
    "sandbox_allow_network",
    "network_egress_policy",
    "network_allowed_hosts",
    "network_denied_hosts",
)

#: Providers whose plan usage Rotaris can read back for the limits card.
_USAGE_PROVIDERS = frozenset({"codex", "copilot", "claude-code"})

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris.models.store import WorkspaceStore
    from rotaris.services.session_projection import (
        SessionProjection,
        SessionProjectionContext,
    )
    from rotaris.services.todo_editing import TodoEditOperation


@traces(
    SWR.SWR_2074,
    SWR.SWR_2075,
    SWR.SWR_2076,
    SWR.SWR_2096,
    SWR.SWR_2098,
    SWR.SWR_2123,
    SWR.SWR_2402,
    SWR.SWR_2403,
    SWR.SWR_2406,
    SWR.SWR_2807,
    SWR.SWR_3724,
)
class ConfigService:
    def __init__(self, workspace: Path, store: WorkspaceStore) -> None:
        from rotaris.services.session_projection import TranscriptProjector

        self.workspace = workspace
        self.store = store
        self.config: Any | None = None
        self.session_manager: Any | None = None
        self.diagnostics: Any | None = None
        # The transcript's incremental half (SWR-2454). ``_transcript_is_live``
        # says which of the two paths currently owns the transcript, so the
        # reconciling read and the delta feed never write it in the same breath.
        self._transcript_projector = TranscriptProjector()
        self._transcript_is_live = False
        #: How many of the store's transcript rows came from the projector. The
        #: rest are the trailer, which always sits after them.
        self._projected_len = 0
        self._trailer: tuple[TranscriptEvent, ...] = ()
        #: Set while the focused session is executing in *another* process, where
        #: there is no run to report its transcript and the event store is the
        #: only channel across the boundary (SWR-2454 § Reach).
        self._follower: Any | None = None
        # Hydrated SessionArtifactStore cache, keyed by (session_id, index mtime)
        # so the 750ms poll tick only re-reads artifact files when they changed.
        self._artifact_store: Any | None = None
        self._artifact_cache_key: tuple[str, int] | None = None

    def load(self) -> None:
        from rotaris_core.config.loader import load_config
        from rotaris_core.session.manager import SessionManager

        self.config = load_config(self.workspace)
        self.session_manager = SessionManager(self.workspace)
        s = self.store
        s.workspace_path = str(self.workspace)
        try:
            s.app_version = version("rotaris")
        except PackageNotFoundError:
            s.app_version = "dev"
        s.model_options = _model_options(self.config)
        from rotaris_core.config.startup_models import read_startup_model_preferences

        preferences = read_startup_model_preferences(self.workspace, self.config)
        s.model_slots = [
            ("small_model", preferences.slots["small_model"] or ""),
            ("medium_model", preferences.slots["medium_model"] or ""),
            ("large_model", preferences.slots["large_model"] or ""),
            (
                "default_summary_model",
                preferences.slots["default_summary_model"] or "",
            ),
            ("fallback_model", preferences.slots["fallback_model"] or ""),
        ]
        s.model_slot_thinking = {
            slot: preferences.slot_thinking[slot] for slot, _model in s.model_slots
        }
        s.model_thinking_choices = _model_thinking_choices(self.config)
        default = self.config.personas.get(self.config.default_persona)
        active_model = default.model if default else self.config.large_model
        s.active_model = _display_model_name(self.config, active_model)
        s.session_model_override = ""
        self._load_personas()
        s.delegation.depth_cap = self.config.runtime.max_depth
        s.delegation.fanout_limit = self.config.runtime.max_active_children
        s.runtime.iteration_cap = self.config.runtime.max_iterations
        s.runtime.circuit_breaker = self.config.circuit_breaker.enabled
        s.runtime.allow_outside_workspace = self.config.runtime.allow_outside_workspace
        s.runtime.permission_mode = self.config.runtime.permission_mode
        s.runtime.improvement_loop = self.config.runtime.improvement_collector_enabled
        s.runtime.compression_threshold_pct = self.config.compressor.threshold_percentage
        self._load_security_policy()
        s.skills_enabled = self.config.skills.enabled
        self._load_rotaris_settings()
        s.mcp_servers = [
            McpServer(
                name=name,
                type=server.type,
                description=server.url or " ".join([server.command or "", *server.args]).strip(),
                source=self.config.mcp_server_sources.get(name, "yaml"),
                available=self._mcp_available(name, server),
            )
            for name, server in self.config.mcp_servers.items()
        ]
        s.set_initialization(self._project_init_state())
        s.providers = self._providers()
        s.subscription_limits = self._subscription_limits()
        s.skills = self._skills()
        self.refresh_sessions()
        self.refresh_improvement_proposals()
        s.settings_changed.emit()
        s.library_changed.emit()
        s.status_changed.emit()

    @traces(SWR.SWR_2505, SWR.SWR_2507)
    def _load_security_policy(self) -> None:
        """Project the six sandbox and egress fields into the store.

        Lists are copied: the settings editors replace them wholesale, and a
        shared list would let a desktop edit reach the loaded config without
        going through the store's change signal.
        """
        if self.config is None:
            return
        for name in SECURITY_POLICY_FIELDS:
            value = getattr(self.config.runtime, name)
            setattr(self.store.runtime, name, list(value) if isinstance(value, list) else value)

    @traces(SWR.SWR_2505, SWR.SWR_2507)
    def _apply_security_policy(self, runtime: Any) -> None:
        """Push the six store values onto a ``RuntimePolicy`` by assignment.

        ``RuntimePolicy`` sets ``validate_assignment``, so a value the schema
        rejects raises right here rather than at the next load — with the file
        already written, in the case of :meth:`save`. The ``ValidationError`` is
        re-raised as a plain ``ValueError`` carrying the schema's own message so
        the desktop reports it to the user instead of crashing.
        """
        from pydantic import ValidationError

        for name in SECURITY_POLICY_FIELDS:
            value = getattr(self.store.runtime, name)
            try:
                setattr(runtime, name, list(value) if isinstance(value, list) else value)
            except ValidationError as exc:
                raise ValueError(_validation_message(exc)) from exc

    def refresh_improvement_proposals(self) -> None:
        """Reload every workspace improvement artifact's proposals into the store."""
        from rotaris_core.improvement.persistence import list_improvement_artifacts

        try:
            artifacts = list_improvement_artifacts(self.workspace)
        except OSError:
            artifacts = []
        proposals = [
            ImprovementProposal(
                id=proposal.id,
                artifact_id=artifact.artifact_id,
                category=proposal.category.value,
                summary=proposal.summary,
                recommended_action=proposal.recommended_action,
                risk=proposal.risk.value,
                status=proposal.status.value,
                created_label=_relative_time(proposal.created_at),
            )
            for artifact in artifacts
            for proposal in artifact.proposals
        ]
        self.store.set_improvement_proposals(proposals)

    def set_proposal_status(self, artifact_id: str, proposal_id: str, status: str) -> None:
        """Approve/reject/defer a proposal on disk, then refresh the store.

        Raises ``KeyError`` if ``proposal_id`` is not in the artifact.
        """
        from rotaris_core.improvement.approval import set_proposal_status as _set_proposal_status
        from rotaris_core.improvement.proposals import ApprovalStatus

        _set_proposal_status(self.workspace, artifact_id, proposal_id, ApprovalStatus(status))
        self.refresh_improvement_proposals()

    def update_proposal(
        self, artifact_id: str, proposal_id: str, *, summary: str, recommended_action: str
    ) -> None:
        """Edit a proposal's summary/recommended action on disk, then refresh the store.

        Raises ``KeyError`` if ``proposal_id`` is not in the artifact, ``ValueError``
        if the edited text fails validation (e.g. blank).
        """
        from rotaris_core.improvement.approval import update_proposal as _update_proposal

        _update_proposal(
            self.workspace,
            artifact_id,
            proposal_id,
            summary=summary,
            recommended_action=recommended_action,
        )
        self.refresh_improvement_proposals()

    def delete_proposal(self, artifact_id: str, proposal_id: str) -> None:
        """Remove a proposal from its artifact on disk, then refresh the store.

        Raises ``KeyError`` if ``proposal_id`` is not in the artifact.
        """
        from rotaris_core.improvement.approval import delete_proposal as _delete_proposal

        _delete_proposal(self.workspace, artifact_id, proposal_id)
        self.refresh_improvement_proposals()

    @traces(SWR.SWR_2907, SWR.SWR_3612)
    def refresh_sessions(self) -> None:
        if self.session_manager is None:
            return
        # A just-launched run is labeled from its prompt before any snapshot
        # exists (SWR-2907). Keep that label when the metadata on disk has no
        # title yet, or a refresh would relabel the row back to its id.
        known_names = {
            session.id: session.name
            for session in self.store.sessions
            if session.name and session.name != session.id
        }
        # The same rule for what a run was started for (SWR-3612): the launcher
        # knew the requirement before the first metadata write did, and a refresh
        # that raced it must not strip the attribution off the row.
        known_attribution = {
            session.id: (session.requirement_id, session.unit_id)
            for session in self.store.sessions
            if session.requirement_id
        }
        sessions: list[SessionInfo] = []
        for item in self.session_manager.list_sessions():
            updated = dt.datetime.fromisoformat(item["updated_at"])
            worktree = item.get("worktree") or {}
            branch = str(worktree.get("branch", "")) if isinstance(worktree, dict) else ""
            detail = ""
            if isinstance(worktree, dict):
                detail = str(worktree.get("path", ""))
            # Both default to "": a session directory written before requirement
            # runs existed carries neither key, and a KeyError here would cost
            # the user the whole session list.
            remembered = known_attribution.get(item["session_id"], ("", ""))
            requirement_id = str(item.get("requirement_id") or "") or remembered[0]
            unit_id = str(item.get("unit_id") or "") or (
                remembered[1] if requirement_id == remembered[0] else ""
            )
            sessions.append(
                SessionInfo(
                    id=item["session_id"],
                    # Task wording as the visible label (SWR-2907); metadata
                    # written before titles existed falls back to the id.
                    name=str(item.get("task_title") or "")
                    or known_names.get(item["session_id"], "")
                    or item["session_id"],
                    status=str(item.get("execution_status", "idle")),
                    branch=branch or "—",
                    duration_label=_relative_time(updated),
                    detail=detail,
                    requirement_id=requirement_id,
                    unit_id=unit_id,
                    # Absent on session directories written before a run could
                    # say it was waiting; those simply are not (SWR-3625).
                    awaiting_input=bool(item.get("awaiting_input", False)),
                )
            )
        self.store.set_sessions(sessions)

    @traces(SWR.SWR_226, SWR.SWR_2509)
    def build_run_config(self) -> Any:
        """Return an isolated backend config with current desktop overrides."""
        if self.config is None:
            raise RuntimeError("Configuration has not been loaded.")
        config = self.config.model_copy(deep=True)
        old_slots = {
            "small_model": config.small_model,
            "medium_model": config.medium_model,
            "large_model": config.large_model,
            "default_summary_model": config.default_summary_model,
            "fallback_model": config.fallback_model,
        }
        new_slots = dict(self.store.model_slots)
        resolved_new_slots: dict[str, str] = {}
        for name, value in new_slots.items():
            if name in old_slots and value:
                resolved_value = value
                thinking = self.store.model_slot_thinking.get(name)
                base_model = config.models.get(value)
                if thinking is not None and base_model is not None:
                    resolved_value = f"__startup_slot__:{name}"
                    thinking_model = base_model.model_copy(deep=True)
                    thinking_model.thinking = thinking
                    config.models[resolved_value] = thinking_model
                resolved_new_slots[name] = resolved_value
                setattr(config, name, resolved_value)
        # Composer persona chip: the selected persona is the entry point the
        # run starts with (the session-wide model/reasoning overrides below
        # then target it as the default persona).
        if self.store.session_persona_override in config.personas:
            config.default_persona = self.store.session_persona_override
        for persona_name, persona in config.personas.items():
            for slot, old_value in old_slots.items():
                if persona.model in {slot, old_value} and resolved_new_slots.get(slot):
                    persona.model = resolved_new_slots[slot]
                    break
            # The workspace model dropdown is a session-wide override for the
            # default/top-level persona only — delegated children always run
            # on their own configured model (mirrors the TUI's active_model_key
            # rule; see rotaris_core/tui/view_model.py REQ-20260413-204058-022).
            if self.store.session_model_override and persona_name == config.default_persona:
                persona.model = self.store.session_model_override
            if self.store.delegation.strategy == "single":
                persona.tools = [tool for tool in persona.tools if tool != "delegate"]

        if self.store.session_reasoning_override:
            entry_persona = config.personas.get(config.default_persona)
            if entry_persona is not None:
                entry_persona.thinking = self.store.session_reasoning_override

        enabled_mcp = {
            server.name for server in self.store.mcp_servers if server.enabled and server.available
        }
        config.mcp_servers = {
            name: server for name, server in config.mcp_servers.items() if name in enabled_mcp
        }
        for persona in config.personas.values():
            persona.mcp_servers = [name for name in persona.mcp_servers if name in enabled_mcp]
        config.runtime.max_depth = self.store.delegation.depth_cap
        config.runtime.max_active_children = self.store.delegation.fanout_limit
        config.runtime.max_iterations = self.store.runtime.iteration_cap
        config.circuit_breaker.enabled = self.store.runtime.circuit_breaker
        config.runtime.allow_outside_workspace = self.store.runtime.allow_outside_workspace
        # Composer permission-mode chip (SWR-2509). Persona-level pins are left
        # alone: they are deliberate configuration the chip must not widen.
        config.runtime.permission_mode = self.store.runtime.permission_mode
        config.runtime.improvement_collector_enabled = self.store.runtime.improvement_loop
        config.compressor.threshold_percentage = self.store.runtime.compression_threshold_pct
        # Sandbox (SWR-2507) and network egress (SWR-2505): the run has to see
        # the values the user is looking at in Settings, not the last saved ones.
        self._apply_security_policy(config.runtime)
        return config

    # ── auth-failure recovery helpers ─────────────────────────────────────

    def entry_model(self) -> str:
        """Model key the next run's entry persona resolves to (mirrors build_run_config)."""
        if self.store.session_model_override:
            return self.store.session_model_override
        if self.config is None:
            return ""
        persona_name = (
            self.store.session_persona_override
            if self.store.session_persona_override in self.config.personas
            else self.config.default_persona
        )
        persona = self.config.personas.get(persona_name)
        model = persona.model if persona is not None else (self.config.large_model or "")
        slots = dict(self.store.model_slots)
        return slots.get(model, model)

    def fallback_model(self) -> str:
        """Configured fallback model, resolved through the desktop slot overrides."""
        slots = dict(self.store.model_slots)
        fallback = slots.get("fallback_model") or (
            (self.config.fallback_model or "") if self.config is not None else ""
        )
        return slots.get(fallback, fallback)

    def model_provider(self, model_key: str) -> str:
        """Auth provider id backing a model key ('' when unknown)."""
        model = self.config.models.get(model_key) if self.config is not None else None
        if model is None:
            return ""
        return str(model.auth_provider or model.provider or "")

    def model_providers(self) -> dict[str, str]:
        """Every configured model key mapped to its auth provider id."""
        if self.config is None:
            return {}
        return {
            key: model.auth_provider or model.provider for key, model in self.config.models.items()
        }

    def provider_flow_type(self, provider_id: str) -> str:
        """'api_key' | 'device_code' | 'pkce' | '' for a provider id."""
        if not provider_id:
            return ""
        from rotaris_core.auth.manager import get_provider_flow_type

        flow = get_provider_flow_type(provider_id)
        return flow.value if flow is not None else ""

    def save_provider_api_key(self, provider_id: str, api_key: str) -> None:
        """Store a replacement API key for an api-key-flow provider."""
        from rotaris_core.auth.api_key import api_key_validation_error
        from rotaris_core.auth.provider import TokenSet
        from rotaris_core.auth.storage import TokenStorage

        validation_error = api_key_validation_error(api_key)
        if validation_error is not None:
            raise ValueError(validation_error)
        storage = TokenStorage()
        existing = storage.load(provider_id)
        storage.save(
            provider_id,
            TokenSet(
                access_token=api_key,
                refresh_token="",
                extra=dict(existing.extra) if existing is not None else {},
            ),
        )

    def check_provider_health(self, provider_id: str) -> ProviderInfo:
        """Verify stored credentials and make a provider-specific free catalog call."""
        from rotaris_core.auth.manager import AuthManager, run_auth_coro
        from rotaris_core.auth.provider import AuthStatus
        from rotaris_core.auth.provider_settings import get_provider_settings, validate_provider

        settings = get_provider_settings(provider_id)
        flow = settings.auth_flow.value

        def provider_info(
            connected: bool, detail: str, status_name: str, auth_flow: str
        ) -> ProviderInfo:
            return ProviderInfo(
                provider_id,
                settings.display_name,
                connected,
                detail,
                status_name,
                auth_flow,
                user_defined=provider_id.startswith("openai-compatible--"),
                has_credentials=getattr(settings, "authenticated", connected),
            )

        if not flow:
            return provider_info(
                False,
                "Authentication is managed by model configuration.",
                "warning",
                "",
            )
        status = run_auth_coro(
            AuthManager(workspace_root=self.workspace).check_status(provider_id),
        )
        if status is AuthStatus.UNAUTHENTICATED:
            return provider_info(
                False,
                "Not authenticated.",
                "unauthenticated",
                flow,
            )
        if status is AuthStatus.EXPIRED:
            return provider_info(
                False,
                "Authentication expired; re-authentication required.",
                "warning",
                flow,
            )

        try:
            result = validate_provider(provider_id)
        except (KeyError, OSError, RuntimeError, TypeError, ValueError) as exc:
            return provider_info(
                False,
                f"Health check failed: {exc}",
                "warning",
                flow,
            )
        if result.success:
            self.refresh_provider_catalog(provider_id)
            return provider_info(
                True,
                result.message,
                "healthy",
                flow,
            )
        invalid_auth = "authentication failed" in result.message.lower()
        return provider_info(
            False,
            result.message,
            "error" if invalid_auth else "warning",
            flow,
        )

    def authenticate_provider(
        self,
        provider_id: str,
        *,
        api_key: str = "",
        reauth: bool = False,
        on_prompt: Any | None = None,
        cancel_event: Any | None = None,
    ) -> ProviderInfo:
        """Authenticate and discover models, matching the useful part of CLI login.

        ``cancel_event`` (``threading.Event``), when set by the caller mid-flow,
        aborts an in-progress PKCE/device-code wait early instead of blocking for
        its full multi-minute timeout.
        """
        import asyncio

        from rotaris_core.auth.manager import AuthManager
        from rotaris_core.auth.provider import AuthFlowType
        from rotaris_core.auth.provider_settings import (
            get_provider_settings,
            update_api_key,
            validate_provider,
        )

        settings = get_provider_settings(provider_id)
        if settings.auth_flow is AuthFlowType.API_KEY:
            api_key_result = update_api_key(provider_id, api_key, validate=True)
            if not api_key_result.success:
                return ProviderInfo(
                    provider_id,
                    settings.display_name,
                    False,
                    api_key_result.message,
                    "error",
                    settings.auth_flow.value,
                )
            return self.check_provider_health(provider_id)

        auth = AuthManager(workspace_root=self.workspace)
        if reauth:
            auth.logout(provider_id)

        async def prompt_callback(prompt: object) -> None:
            if on_prompt is not None:
                on_prompt(prompt)

        auth_result = asyncio.run(
            auth.authenticate(provider_id, on_prompt=prompt_callback, cancel_event=cancel_event)
        )
        if not auth_result.success:
            return ProviderInfo(
                provider_id,
                settings.display_name,
                False,
                auth_result.error or "Authentication failed.",
                "error",
                settings.auth_flow.value,
            )
        discovery = validate_provider(provider_id)
        if not discovery.success:
            return ProviderInfo(
                provider_id,
                settings.display_name,
                False,
                discovery.message,
                "warning",
                settings.auth_flow.value,
            )
        return self.check_provider_health(provider_id)

    @traces(SWR.SWR_2095)
    def refresh_subscription_limits(self) -> list[SubscriptionLimit]:
        """Recompute Codex/Copilot usage windows for the Overview dashboard.

        Performs blocking network I/O; call off the GUI thread (see ProviderTask)
        and apply the result to store.subscription_limits + emit settings_changed
        from the caller, matching authenticate_provider/check_provider_health.
        """
        return self._subscription_limits()

    @traces(SWR.SWR_3013)
    def uses_rotaris_cloud(self) -> bool:
        """Whether a run here would be billed to the Rotaris Cloud account.

        The three tier slots, not only the active model: a run delegates, and a
        child on a cloud model spends the same balance the parent does.
        """
        config = self.config
        if config is None:
            return False
        models = getattr(config, "models", None) or {}
        candidates = {
            getattr(config, "small_model", None),
            getattr(config, "medium_model", None),
            getattr(config, "large_model", None),
            self.store.active_model,
            self.store.session_model_override,
        }
        return any(
            getattr(models.get(name), "auth_provider", None) == ROTARIS_CLOUD_PROVIDER_ID
            for name in candidates
            if name
        )

    def logout_provider(self, provider_id: str) -> ProviderInfo:
        """Remove provider credentials using the same backend as CLI logout."""
        from rotaris_core.auth.logout import logout_provider
        from rotaris_core.auth.provider_settings import get_provider_settings

        settings = get_provider_settings(provider_id)
        result = logout_provider(provider_id)
        return ProviderInfo(
            provider_id,
            settings.display_name,
            False,
            result.message,
            "unauthenticated",
            settings.auth_flow.value,
            user_defined=provider_id.startswith("openai-compatible--"),
            has_credentials=False,
        )

    def register_openai_compatible_provider(self, label: str, base_url: str, api_key: str) -> Any:
        from rotaris_core.auth.provider_settings import register_openai_compatible_provider

        return register_openai_compatible_provider(label, base_url, api_key)

    def delete_openai_compatible_provider(self, provider_id: str) -> Any:
        from rotaris_core.auth.provider_settings import delete_openai_compatible_provider

        return delete_openai_compatible_provider(provider_id)

    def refresh_provider_catalog(self, provider_id: str | None = None) -> None:
        """Reload model catalog, and providers unless refreshing one provider's health."""
        from rotaris_core.config.loader import load_config

        self.config = load_config(self.workspace)
        self.store.model_options = _model_options(self.config)
        if provider_id is None:
            self.store.providers = self._providers()
        self.store.settings_changed.emit()

    @traces(SWR.SWR_2509)
    def save(self) -> None:
        """Persist editable desktop settings to their selected config scope."""
        import yaml
        from rotaris_core.config.loader import load_config
        from rotaris_core.config.startup_models import STARTUP_MODEL_THINKING_FIELDS
        from rotaris_core.fs import atomic_write

        self.store.ensure_persona_scope_values()

        # Validate the security-relevant settings against the real schema before
        # anything is written: assigning them onto a throwaway copy runs the same
        # validators the next load would, so a rejected sandbox root or egress
        # disposition raises a readable ValueError instead of leaving a file on
        # disk that the workspace can no longer load.
        if self.config is not None:
            self._apply_security_policy(self.config.runtime.model_copy(deep=True))

        path = self.workspace / ".rotaris" / "agents.yaml"
        if path.exists():
            loaded = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            if not isinstance(loaded, dict):
                raise ValueError("Workspace agents.yaml must contain a mapping.")
            payload: dict[str, Any] = loaded
        else:
            payload = {}
        slots = dict(self.store.model_slots)
        for name in (
            "small_model",
            "medium_model",
            "large_model",
            "default_summary_model",
            "fallback_model",
        ):
            if slots.get(name):
                payload[name] = slots[name]
            thinking_field = STARTUP_MODEL_THINKING_FIELDS[name]
            thinking = self.store.model_slot_thinking.get(name)
            if thinking is None:
                payload.pop(thinking_field, None)
            else:
                payload[thinking_field] = thinking
        runtime = payload.setdefault("runtime", {})
        if not isinstance(runtime, dict):
            runtime = {}
            payload["runtime"] = runtime
        runtime.update(
            {
                "max_depth": self.store.delegation.depth_cap,
                "max_active_children": self.store.delegation.fanout_limit,
                "max_iterations": self.store.runtime.iteration_cap,
                "allow_outside_workspace": self.store.runtime.allow_outside_workspace,
                "permission_mode": self.store.runtime.permission_mode,
                "improvement_collector_enabled": self.store.runtime.improvement_loop,
            }
        )
        for name in SECURITY_POLICY_FIELDS:
            value = getattr(self.store.runtime, name)
            runtime[name] = list(value) if isinstance(value, list) else value
        circuit_breaker = payload.setdefault("circuit_breaker", {})
        if not isinstance(circuit_breaker, dict):
            circuit_breaker = {}
            payload["circuit_breaker"] = circuit_breaker
        circuit_breaker["enabled"] = self.store.runtime.circuit_breaker
        compressor = payload.setdefault("compressor", {})
        if not isinstance(compressor, dict):
            compressor = {}
            payload["compressor"] = compressor
        compressor["threshold_percentage"] = self.store.runtime.compression_threshold_pct
        rotaris = payload.setdefault("rotaris", {})
        if not isinstance(rotaris, dict):
            rotaris = {}
            payload["rotaris"] = rotaris
        rotaris["delegation_strategy"] = self.store.delegation.strategy
        skills = payload.setdefault("skills", {})
        if not isinstance(skills, dict):
            skills = {}
            payload["skills"] = skills
        skills["enabled"] = self.store.skills_enabled
        from rotaris_core.skills.catalog import normalize_skill_name

        skills["overrides"] = {
            normalize_skill_name(skill.name): skill.load_mode
            for skill in self.store.skills
            if skill.load_mode != "name-only"
        }
        skills["invocation_overrides"] = {
            normalize_skill_name(skill.name): skill.invocation_mode
            for skill in self.store.skills
            if skill.invocation_mode != "default"
        }

        self._apply_persona_values(payload, "workspace")
        self._apply_persona_unsets(payload, "workspace")
        rendered = yaml.safe_dump(payload, sort_keys=False, allow_unicode=True)
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write(path, rendered)

        if any(
            scope == "global" for _name, _field, scope in self.store.persona_scope_values
        ) or any(scope == "global" for _name, _field, scope in self.store._persona_unsets):
            global_path = _global_config_dir() / "agents.yaml"
            global_payload = _load_yaml_mapping(global_path, "Global")
            self._apply_persona_values(global_payload, "global")
            self._apply_persona_unsets(global_payload, "global")
            global_path.parent.mkdir(parents=True, exist_ok=True)
            atomic_write(
                global_path,
                yaml.safe_dump(global_payload, sort_keys=False, allow_unicode=True),
            )
        self.config = load_config(self.workspace)
        self.store._persona_unsets.clear()
        if hasattr(self.config, "skills"):
            self.store.skills_enabled = self.config.skills.enabled
            self.store.skills = self._skills()
        if hasattr(self.config, "personas"):
            self._load_personas()
            self.store.settings_changed.emit()
        self.store.library_changed.emit()

    def _load_personas(self) -> None:
        """Project resolved personas into the store with per-field origin data."""
        if self.config is None:
            return
        from rotaris_core.config.defaults import DEFAULT_CONFIG

        workspace_personas, global_personas = self._raw_scope_personas()
        personas: list[PersonaSpec] = []
        scope_values: dict[tuple[str, str, str], str] = {}
        for name, persona in self.config.personas.items():
            default_persona = DEFAULT_CONFIG.personas.get(name)
            scope_values[(name, "model", "default")] = _display_model_name(
                self.config, default_persona.model if default_persona is not None else None
            )
            scope_values[(name, "reasoning", "default")] = _persona_reasoning_display(
                default_persona.thinking if default_persona is not None else None,
                "medium",
            )
            for scope, raw_personas in (
                ("global", global_personas),
                ("workspace", workspace_personas),
            ):
                raw = raw_personas.get(name)
                if not isinstance(raw, dict):
                    continue
                if "model" in raw:
                    scope_values[(name, "model", scope)] = _display_model_name(
                        self.config, str(raw["model"] or "")
                    )
                if "thinking" in raw:
                    scope_values[(name, "reasoning", scope)] = _persona_reasoning_display(
                        raw["thinking"]
                    )
            personas.append(
                PersonaSpec(
                    name=name,
                    role=persona.purpose or "",
                    model=_display_model_name(self.config, persona.model),
                    reasoning=_persona_reasoning_display(persona.thinking, "medium"),
                    tools=list(persona.tools),
                    model_scope=_persona_field_scope(
                        name, "model", workspace_personas, global_personas
                    ),
                    reasoning_scope=_persona_field_scope(
                        name, "thinking", workspace_personas, global_personas
                    ),
                )
            )
        self.store.personas = personas
        self.store.persona_scope_values = scope_values

    def _raw_scope_personas(self) -> tuple[dict[str, Any], dict[str, Any]]:
        return (
            _read_raw_personas(self.workspace / ".rotaris" / "agents.yaml"),
            _read_raw_personas(_global_config_dir() / "agents.yaml"),
        )

    def _apply_persona_values(self, payload: dict[str, Any], scope: str) -> None:
        matching_names = {
            name
            for name, _field, value_scope in self.store.persona_scope_values
            if value_scope == scope
        }
        if not matching_names:
            return
        personas = payload.setdefault("personas", {})
        if not isinstance(personas, dict):
            raise ValueError("agents.yaml personas must contain a mapping.")
        for name in matching_names:
            raw = personas.setdefault(name, {})
            if not isinstance(raw, dict):
                raw = {}
                personas[name] = raw
            model_key = (name, "model", scope)
            if (
                model_key in self.store.persona_scope_values
                and model_key not in self.store._persona_unsets
            ):
                raw["model"] = self._persona_model_to_config_value(
                    self.store.persona_scope_values[model_key]
                )
            reasoning_key = (name, "reasoning", scope)
            if (
                reasoning_key in self.store.persona_scope_values
                and reasoning_key not in self.store._persona_unsets
            ):
                raw["thinking"] = self.store.persona_scope_values[reasoning_key] or None

    def _apply_persona_unsets(self, payload: dict[str, Any], scope: str) -> None:
        personas = payload.get("personas")
        if not isinstance(personas, dict):
            return
        for name, field, value_scope in self.store._persona_unsets:
            if value_scope != scope:
                continue
            raw = personas.get(name)
            if not isinstance(raw, dict):
                continue
            raw.pop("model" if field == "model" else "thinking", None)
            if not raw:
                personas.pop(name, None)
        if not personas:
            payload.pop("personas", None)

    def _persona_model_to_config_value(self, display: str) -> str:
        slot_names = {name for name, _model in self.store.model_slots}
        if display in slot_names:
            return display
        if self.config is not None:
            for model_name in self.config.models:
                if _display_model_name(self.config, model_name) == display:
                    return str(model_name)
        return display

    def _load_rotaris_settings(self) -> None:
        import yaml

        path = self.workspace / ".rotaris" / "agents.yaml"
        if not path.exists():
            return
        try:
            payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            strategy = payload.get("rotaris", {}).get("delegation_strategy")
        except (AttributeError, OSError, yaml.YAMLError):
            return
        if strategy in {"orchestrator", "swarm", "single"}:
            self.store.delegation.strategy = strategy

    def load_session(self, session_id: str) -> None:
        if self.session_manager is None:
            return
        from rotaris.diagnostics import NoopDiagnostics

        diagnostics = self.diagnostics or NoopDiagnostics()
        with diagnostics.span("session.load"):
            state = self._read_session_snapshot(session_id)
        with diagnostics.span("session.projection"):
            self.apply_session(state)

    def _read_session_snapshot(self, session_id: str) -> Any:
        if self.session_manager is None:
            raise RuntimeError("Session manager is unavailable")
        reader = getattr(self.session_manager, "read_session_snapshot", None)
        if reader is None:
            # Small compatibility seam for test doubles and older embedders.
            reader = self.session_manager.load_session
        return reader(session_id)

    def clear_session_transcript(self, session_id: str) -> None:
        """Clear a non-running persisted session transcript atomically."""
        if self.session_manager is None:
            raise RuntimeError("Session manager is unavailable")
        state = self._read_session_snapshot(session_id)
        state.transcript_events.clear()
        self.session_manager.persister.flush_sync(state)
        self.apply_session(state)

    def edit_session_todo(
        self,
        session_id: str,
        operation: TodoEditOperation,
        target_id: str,
        text: str = "",
    ) -> bool:
        """Edit todos for a paused or completed persisted session."""
        if self.session_manager is None:
            return False
        from rotaris_core.tools.todo_state import TodoList

        from rotaris.services.todo_editing import edit_todo_list

        state = self._read_session_snapshot(session_id)
        field = "agent_todo_state" if state.agent_todo_state is not None else "todo_state"
        raw = getattr(state, field)
        if raw is None:
            return False
        todo = TodoList.model_validate(raw)
        if not edit_todo_list(todo, operation, target_id, text):
            return False
        setattr(state, field, todo.model_dump(mode="json"))
        self.session_manager.persister.flush_sync(state)
        self.apply_session(state)
        return True

    def apply_session(self, state: Any) -> None:
        projection = self.build_session_projection(state)
        self.apply_session_projection(projection)

    def projection_context(self) -> SessionProjectionContext:
        from rotaris.services.session_projection import SessionProjectionContext

        s = self.store
        return SessionProjectionContext(
            session_model_override=s.session_model_override,
            session_reasoning_override=s.session_reasoning_override,
            files_touched=s.kpis.files_touched,
            uncommitted=s.kpis.uncommitted,
        )

    def build_session_projection(
        self,
        state: Any,
        *,
        context: SessionProjectionContext | None = None,
        artifacts: list[ArtifactInfo] | None = None,
    ) -> SessionProjection:
        from rotaris.services.session_projection import build_session_projection

        return build_session_projection(
            state,
            self.config,
            context or self.projection_context(),
            self._artifact_infos(state.session_id) if artifacts is None else artifacts,
        )

    @traces(SWR.SWR_2454)
    def apply_transcript_delta(self, delta: TranscriptDelta) -> None:
        """Apply what a live run changed in its transcript. Qt/UI thread only.

        The counterpart of :meth:`apply_session_projection` for the one surface
        whose cost grows with the session. A delta from row zero re-seats the
        projector — that is a run reporting its transcript for the first time,
        or a cleared transcript — and anything else is folded into what is
        already on screen.

        A delta the projector cannot place answers ``None``; nothing is applied
        and the reconciling read repairs it. That path is why a missed or
        malformed delta costs latency and never content.
        """
        rows = list(delta.rows)
        if delta.first == 0:
            events = list(
                self._transcript_projector.reseat(rows, list(delta.new_diffs), delta.personas)
            )
            self._transcript_is_live = True
            self._projected_len = len(events)
            self.store.set_transcript(events + list(self._trailer))
            return
        applied = self._transcript_projector.apply(
            delta.first,
            rows,
            list(delta.new_diffs),
            delta.personas,
        )
        if applied is None:
            self._transcript_is_live = False
            return
        first, tail = applied
        self._transcript_is_live = True
        self._projected_len = first + len(tail)
        # The trailer goes back on the end. It is not part of what the run
        # recorded — it says the run is *waiting* — so the projector never sees
        # it and every write of the transcript has to re-append it.
        self.store.apply_transcript_delta(first, list(tail) + list(self._trailer))

    @traces(SWR.SWR_2130, SWR.SWR_2454)
    def apply_session_facts(self, facts: Any) -> None:
        """Apply everything a live run changed except its transcript. Qt thread only.

        *facts* is the session record with its unbounded lists emptied, so this
        runs the ordinary projection over it and applies every surface the
        transcript does not own. Reusing :func:`build_session_projection` rather
        than deriving these surfaces a second way is the point: a live view and
        a reloaded one have to agree, and two derivations eventually will not.

        Artifacts are not re-read here. They live on disk behind an mtime cache
        and change on their own schedule; the reconciling read still owns them,
        and the ones already on screen are carried across untouched.
        """
        from rotaris.services.session_projection import build_session_projection

        projection = build_session_projection(
            facts,
            self.config,
            self.projection_context(),
            list(self.store.artifacts),
        )
        s = self.store
        s.session_name = projection.session_name
        s.set_session_runtime_label(projection.worktree_branch)
        s.set_session_status(projection.session_status)
        if projection.active_model:
            s.active_model = projection.active_model
            s.session_model_override = projection.active_model
        s.set_run_summary(projection.run)
        s.set_agents(list(projection.agents))
        s.set_todos(list(projection.todos))
        s.set_kpis(projection.kpis)
        s.set_pending_questions(projection.pending_questions)
        s.set_pending_approvals(projection.pending_approvals)
        s.set_verifier(projection.verifier)
        self._refresh_transcript_trailer(projection.pending_questions, projection.pending_approvals)

    @traces(SWR.SWR_2504, SWR.SWR_2454)
    def _refresh_transcript_trailer(
        self,
        pending_questions: dict[str, Any] | None,
        pending_approvals: tuple[dict[str, Any], ...],
    ) -> None:
        """Put the waiting-on-someone rows at the end of a live transcript.

        Only while the delta feed owns the transcript: otherwise the whole-state
        read already built them in, and rewriting them here would append a
        second copy.
        """
        from rotaris.services.session_projection import transcript_trailer

        trailer = transcript_trailer(pending_questions, pending_approvals)
        if trailer == self._trailer:
            return
        self._trailer = trailer
        if not self._transcript_is_live:
            return
        self.store.apply_transcript_delta(self._projected_len, list(trailer))

    @traces(SWR.SWR_2454)
    def release_transcript_delta_feed(self) -> None:
        """Hand the transcript back to the reconciling read.

        Called when the run this handle was watching ends, and when the user
        looks at a different session: in both cases the next whole-state read is
        the authority again, and it has to be allowed to write the transcript.
        """
        self._transcript_is_live = False
        self._projected_len = 0
        self._trailer = ()
        self._transcript_projector.reset()
        self._follower = None

    @traces(SWR.SWR_2454)
    def follow_session(self, session_id: str) -> bool:
        """Start following a session this process is not running.

        Its rows come from its event store rather than from a run reporting them
        (SWR-2454 § Reach), which is the only channel there is across a process
        boundary. Answers ``False`` when there is no session manager to resolve
        the directory with — the caller then has the whole-state read it always
        had, which is correct and merely slower.
        """
        self._follower = None
        if self.session_manager is None or not session_id:
            return False
        session_dir = getattr(self.session_manager, "session_dir", None)
        if session_dir is None:
            return False
        from rotaris.services.session_follower import SessionFollower

        self._follower = SessionFollower(session_dir(session_id))
        return True

    @traces(SWR.SWR_2454)
    def poll_followed_session(self) -> bool:
        """Apply whatever the followed session added. ``True`` when something did.

        Costs what the run wrote since the last look, not what it has written in
        total — which is the property that makes watching a long foreign session
        no worse than watching a short one.
        """
        follower = self._follower
        if follower is None:
            return False
        delta = follower.poll()
        if delta is None:
            return False
        self.apply_transcript_delta(delta)
        return True

    def apply_session_projection(self, projection: SessionProjection) -> None:
        """Apply a prebuilt projection; must run on the Qt/UI thread."""
        s = self.store
        s.session_name = projection.session_name
        s.set_session_runtime_label(projection.worktree_branch)
        s.set_session_status(projection.session_status)
        if projection.active_model:
            s.active_model = projection.active_model
            s.session_model_override = projection.active_model
        if not self._transcript_is_live:
            # While a live run is feeding deltas, this read is the *reconciler*
            # for every other surface and must not fight it for the transcript:
            # rewriting the whole list here is the O(session) work SWR-2454
            # exists to remove, and it would do it behind a view that is already
            # current.
            s.set_transcript(list(projection.transcript))
        s.set_run_summary(projection.run)
        s.set_agents(list(projection.agents))
        s.set_artifacts(list(projection.artifacts))
        s.set_todos(list(projection.todos))
        s.set_kpis(projection.kpis)

        s.set_pending_questions(projection.pending_questions)
        s.set_pending_approvals(projection.pending_approvals)
        s.set_verifier(projection.verifier)
        # Last, and after the two ``set_pending_*`` calls it depends on. When the
        # transcript is live this read did not write it, so the rows saying the
        # run is waiting on someone (SWR-2504, SWR-2423) have to be put on the
        # end here — otherwise an approval raised mid-run would never appear in
        # the transcript at all.
        self._refresh_transcript_trailer(projection.pending_questions, projection.pending_approvals)

    # ── artifacts ─────────────────────────────────────────────────────────

    def _artifact_store_for(self, session_id: str) -> Any | None:
        if self.session_manager is None or not session_id:
            return None
        from rotaris_core.orchestrator.artifacts import SessionArtifactStore

        session_dir = self.session_manager.session_dir(session_id)
        index_path = session_dir / "artifacts" / SessionArtifactStore.INDEX_FILENAME
        try:
            mtime = index_path.stat().st_mtime_ns
        except OSError:
            mtime = 0
        key = (session_id, mtime)
        if self._artifact_store is not None and self._artifact_cache_key == key:
            return self._artifact_store
        store = SessionArtifactStore(session_dir)
        store.hydrate()
        self._artifact_store = store
        self._artifact_cache_key = key
        return store

    def _artifact_infos(self, session_id: str) -> list[ArtifactInfo]:
        store = self._artifact_store_for(session_id)
        if store is None:
            return []
        return [
            ArtifactInfo(
                id=record.id,
                slug=record.slug,
                title=record.title,
                kind=record.kind,
                status=record.status,
                persona=record.source_persona or "",
                producer=record.canonical_name or record.created_by or "",
                summary=record.summary,
                created_label=_relative_time(record.created_at),
                edited=record.edited_at is not None,
            )
            for record in store.list(include_superseded=False)
        ]

    def artifact_body(self, artifact_id: str) -> str:
        """Return the editable Markdown body of a session artifact."""
        from rotaris_core.orchestrator.artifacts import render_markdown

        store = self._artifact_store_for(self.store.session_name)
        record = store.get(artifact_id) if store is not None else None
        if record is None:
            raise ValueError(f"Unknown artifact: {artifact_id!r}")
        return record.body_markdown or render_markdown(record)

    def save_artifact(self, artifact_id: str, body_markdown: str) -> None:
        """Persist an edited artifact body (mirrors the TUI artifact editor)."""
        store = self._artifact_store_for(self.store.session_name)
        if store is None:
            raise RuntimeError("No session loaded — artifacts unavailable.")
        store.update_body(artifact_id, body_markdown)
        # Index changed on disk; refresh the UI list from the same store.
        self._artifact_cache_key = None
        self.store.set_artifacts(self._artifact_infos(self.store.session_name))

    @traces(SWR.SWR_3721)
    def _transparency_for(
        self, provider_id: str, settings: Any
    ) -> tuple[str, str | None, str | None, str | None]:
        """Connection mode, destination, operator and privacy URL from the runtime
        catalog (SWR-3721). User-defined endpoints take their configured base URL."""
        from rotaris_core.providers import get_provider
        from rotaris_core.providers.types import ConnectionMode

        try:
            descriptor = get_provider(provider_id)
        except KeyError:
            if provider_id.startswith("openai-compatible--"):
                return (
                    ConnectionMode.CUSTOM.value,
                    getattr(settings, "base_url", None),
                    None,
                    None,
                )
            return "", None, None, None
        return (
            descriptor.connection_mode.value,
            descriptor.destination_host(),
            descriptor.operator_name,
            descriptor.privacy_url,
        )

    @traces(SWR.SWR_2125, SWR.SWR_3721)
    def _providers(self) -> list[ProviderInfo]:
        from rotaris_core.auth.provider_settings import (
            get_provider_settings,
            list_provider_settings,
        )

        cloud_settings = get_provider_settings(ROTARIS_CLOUD_PROVIDER_ID)
        connection_mode, destination, operator_name, privacy_url = self._transparency_for(
            ROTARIS_CLOUD_PROVIDER_ID, cloud_settings
        )
        providers: dict[str, ProviderInfo] = {
            ROTARIS_CLOUD_PROVIDER_ID: ProviderInfo(
                ROTARIS_CLOUD_PROVIDER_ID,
                cloud_settings.display_name,
                cloud_settings.authenticated,
                "Managed inference platform.",
                "healthy" if cloud_settings.authenticated else "warning",
                self.provider_flow_type(ROTARIS_CLOUD_PROVIDER_ID),
                user_defined=False,
                has_credentials=cloud_settings.authenticated,
                quick_start_url=ROTARIS_CLOUD_QUICK_START_URL,
                connection_mode=connection_mode,
                destination=destination,
                operator_name=operator_name,
                privacy_url=privacy_url,
            )
        }
        if self.config is None:
            return list(providers.values())

        # Only authenticated providers surface here — an unauthenticated builtin
        # or a model referencing a since-deleted custom endpoint must not
        # resurrect a settings row with nothing the user can act on.
        for settings in list_provider_settings():
            if settings.provider_id == ROTARIS_CLOUD_PROVIDER_ID or not settings.authenticated:
                continue
            provider_id = settings.provider_id
            flow = self.provider_flow_type(provider_id)
            connection_mode, destination, operator_name, privacy_url = self._transparency_for(
                provider_id, settings
            )
            providers.setdefault(
                provider_id,
                ProviderInfo(
                    provider_id,
                    settings.display_name,
                    settings.authenticated,
                    "Checking provider health…" if flow else "Authentication is model-configured.",
                    "checking" if flow else "warning",
                    flow,
                    user_defined=provider_id.startswith("openai-compatible--"),
                    has_credentials=settings.authenticated,
                    connection_mode=connection_mode,
                    destination=destination,
                    operator_name=operator_name,
                    privacy_url=privacy_url,
                ),
            )
        return list(providers.values())

    def addable_builtin_providers(self) -> list[tuple[str, str, str]]:
        """Builtin providers with no stored credentials yet: (id, display_name, auth_flow).

        Rotaris Cloud is excluded — it always has its own quick-start row in
        ``_providers()`` — as is the generic 'openai-compatible' catalog entry, which
        the "Add endpoint" custom-URL form already covers.
        """
        from rotaris_core.auth.provider_settings import list_provider_settings
        from rotaris_core.providers.catalog import BUILTIN_PROVIDERS
        from rotaris_core.providers.instances import OPENAI_COMPATIBLE_PROVIDER_ID

        excluded = {ROTARIS_CLOUD_PROVIDER_ID, OPENAI_COMPATIBLE_PROVIDER_ID}
        return [
            (settings.provider_id, settings.display_name, settings.auth_flow.value)
            for settings in list_provider_settings()
            if settings.provider_id in BUILTIN_PROVIDERS
            and settings.provider_id not in excluded
            and not settings.authenticated
        ]

    def _subscription_limits(self) -> list[SubscriptionLimit]:
        """Return live subscription windows exposed by configured providers."""
        if self.config is None:
            return []
        from concurrent.futures import ThreadPoolExecutor

        from rotaris_core.auth.storage import TokenStorage
        from rotaris_core.providers.subscription_usage import fetch_provider_subscription_limits

        provider_ids = sorted(
            {
                model.auth_provider or model.provider
                for model in self.config.models.values()
                if (model.auth_provider or model.provider) in _USAGE_PROVIDERS
            }
        )
        if not provider_ids:
            return []

        storage = TokenStorage()
        limits: list[SubscriptionLimit] = []
        tokens_by_provider = {
            provider_id: storage.load(provider_id) for provider_id in provider_ids
        }
        authenticated = {
            provider_id: tokens
            for provider_id, tokens in tokens_by_provider.items()
            if tokens is not None
        }
        fetched: dict[str, Any] = {}
        if authenticated:
            # Keep application startup bounded by one provider timeout rather
            # than waiting serially when both Codex and Copilot are configured.
            with ThreadPoolExecutor(max_workers=len(authenticated)) as executor:
                futures = {
                    provider_id: executor.submit(
                        fetch_provider_subscription_limits,
                        provider_id,
                        tokens,
                    )
                    for provider_id, tokens in authenticated.items()
                }
                for provider_id, future in futures.items():
                    try:
                        fetched[provider_id] = future.result()
                    except Exception:  # noqa: BLE001 - optional provider telemetry
                        fetched[provider_id] = None

        for provider_id in provider_ids:
            provider_limits = fetched.get(provider_id)
            if provider_limits:
                mapped = [
                    SubscriptionLimit(
                        item.label,
                        item.used_label,
                        item.percent_used,
                        item.detail,
                    )
                    for item in provider_limits
                ]
                limits.extend(mapped)
            else:
                limits.extend(_unavailable_subscription_limits(provider_id))
        return limits

    def _skills(self) -> list[SkillInfo]:
        from rotaris_core.skills import get_skill_catalog

        if self.config is None:
            return []
        catalog = get_skill_catalog(self.workspace)
        settings = self.config.skills
        return [
            SkillInfo(
                meta.name,
                meta.source_scope,
                meta.description,
                ", ".join(meta.trigger_keywords),
                str(meta.skill_file),
                in_context=meta.normalized_name in catalog.in_context,
                load_mode=settings.overrides.get(meta.normalized_name, "name-only"),
                invocation_mode=settings.invocation_overrides.get(
                    meta.normalized_name, meta.invocation_mode
                ),
                shadowed_paths=tuple(
                    str(candidate.skill_file)
                    for candidate in catalog.shadowed.get(meta.normalized_name, [])
                ),
            )
            for meta in catalog.ordered_skills()
        ]

    @traces(SWR.SWR_2802, SWR.SWR_2805)
    def refresh_initialization(self, *, running: bool = False, last_error: str = "") -> None:
        """Re-publish the initialization status from what is on disk right now.

        :meth:`load` projects ``self.config``, which is a snapshot taken when the
        workspace was opened. Once an initialization run has recorded its
        outcome, that snapshot is stale, so this re-reads the persisted section
        instead of the loaded config — the whole config reload costs 5–18 s and
        buys nothing here.

        `running` and `last_error` are the two transient flags the projection
        cannot know: they belong to whoever drives the run, and are passed
        through so the store lands in one guarded write rather than three.
        """
        if self.config is None:
            return
        from rotaris_core.config.project_init_state import read_initialization_state

        self.store.set_initialization(
            self._project_init_state(
                read_initialization_state(self.workspace),
                running=running,
                last_error=last_error,
            )
        )

    @traces(SWR.SWR_2802, SWR.SWR_2805)
    def _project_init_state(
        self,
        recorded: Any | None = None,
        *,
        running: bool = False,
        last_error: str = "",
    ) -> ProjectInitState:
        """Project an ``initialization:`` section for the UI.

        The single projection site: the registry decides *which* tasks apply and
        the recorded state says which are resolved; this only renders that into
        the frozen model the views bind to. `recorded` defaults to the loaded
        config's section, which is what :meth:`load` wants.
        """
        if self.config is None:
            return ProjectInitState()
        if recorded is None:
            recorded = self.config.initialization
        applicable = self._applicable_init_tasks()
        pending = tuple(task for task in applicable if not recorded.is_resolved(task))
        return ProjectInitState(
            pending=pending,
            pending_consent=tuple(task for task in pending if self._init_task_needs_consent(task)),
            completed=tuple(recorded.completed),
            skipped=tuple(recorded.skipped),
            classification=recorded.classification or "",
            never_initialized=recorded.never_initialized,
            last_run=recorded.last_run or "",
            running=running,
            last_error=last_error,
        )

    @traces(SWR.SWR_2802)
    def _applicable_init_tasks(self) -> tuple[str, ...]:
        """Initialization task ids whose prerequisites this workspace meets.

        Delegated to :func:`rotaris_core.init.registry.applicable_tasks` rather than
        re-derived: the registry owns what "this task can run here" means, and a
        second opinion in the desktop layer would drift from the one the run
        itself uses — offering a task the run then refuses, or hiding one it
        would have executed.
        """
        if self.config is None:
            return ()
        from rotaris_core.init import registry

        return tuple(task.id for task in registry.applicable_tasks(self.config, self.workspace))

    @staticmethod
    @traces(SWR.SWR_2821)
    def _init_task_needs_consent(task_id: str) -> bool:
        """Whether *task_id* is one the user has to answer for (SWR-2821).

        Read off the registered descriptor, so the desktop layer never decides
        for itself which tasks deserve a modal. A task id the registry no longer
        knows — one recorded by an older build — needs no consent, because there
        is nothing left to run for it.
        """
        from rotaris_core.init import registry

        task = registry.get_task(task_id)
        return bool(task is not None and task.requires_consent)

    @staticmethod
    def _mcp_available(name: str, server: Any) -> bool:
        from rotaris_core.config.mcp_resolution import mcp_server_is_available

        return mcp_server_is_available(name, server)


def _unavailable_subscription_limits(provider_id: str) -> list[SubscriptionLimit]:
    """Keep provider windows visible when auth or the optional endpoint fails."""
    if provider_id == "codex":
        return [
            SubscriptionLimit(
                "Codex usage",
                "Usage unavailable",
                0,
                "Sign in to Codex or retry when OpenAI usage data is available.",
            ),
        ]
    if provider_id == "copilot":
        return [
            SubscriptionLimit(
                "Copilot plan allowance",
                "Usage unavailable",
                0,
                "Sign in to Copilot or retry when GitHub usage data is available.",
            )
        ]
    if provider_id == "claude-code":
        return [
            SubscriptionLimit(
                "Claude Code usage",
                "Usage unavailable",
                0,
                "Run 'claude setup-token' and sign in again, or retry when "
                "Anthropic usage data is available.",
            )
        ]
    return []


@traces(SWR.SWR_2433, SWR.SWR_3010)
def _agent_from_dict(raw: dict[str, Any], state: Any, config: Any) -> AgentNode:
    name = str(raw.get("canonical_name") or raw.get("name") or raw.get("task_id") or "agent")
    persona = str(raw.get("persona") or "agent")
    state_name = str(raw.get("state", "queued")).lower()
    mapped = {
        "succeeded": AgentState.DONE,
        "running": AgentState.RUNNING,
        "summarizing": AgentState.RUNNING,
        "waiting_on_dependencies": AgentState.WAITING,
        "waiting_on_model_slot": AgentState.WAITING,
        "failed": AgentState.FAILED,
        "cancelled": AgentState.CANCELLED,
        "blocked": AgentState.FAILED,
    }.get(state_name, AgentState.QUEUED)
    metrics = state.agent_metrics.get(name)
    persona_config = config.personas.get(persona) if config is not None else None
    runtime_model = str(raw.get("model_key") or (persona_config.model if persona_config else ""))
    ctx_used = metrics.last_prompt_tokens if metrics else 0
    model_config = config.models.get(runtime_model) if config is not None else None
    ctx_limit = (
        model_config.max_input_tokens if model_config and model_config.max_input_tokens else 128_000
    )
    return AgentNode(
        id=name,
        name=name,
        persona=persona,
        state=mapped,
        parent_id=raw.get("parent_agent_id"),
        depends_on=list(raw.get("depends_on") or []),
        activity=str(raw.get("task_payload") or "")[:180],
        category=str(raw.get("category") or ""),
        run_in_background=bool(raw.get("run_in_background", False)),
        delegation_task=str(raw.get("task_payload") or ""),
        delegation_session_id=str(raw.get("session_id") or ""),
        inherited_context=[str(i) for i in raw.get("inherited_context") or []],
        model=_display_model_name(config, runtime_model),
        reasoning=str(getattr(persona_config, "thinking", None) or "medium"),
        ctx_used=ctx_used,
        ctx_limit=ctx_limit,
        tool_calls=metrics.tool_call_count if metrics else 0,
        tools=_resolved_tool_names(raw, persona_config),
        mcp_tools={
            str(server): [str(tool) for tool in tools or []]
            for server, tools in (raw.get("granted_mcp_tools") or {}).items()
        },
        called_tools=list(metrics.tool_calls) if metrics else [],
        active_tools=list(raw.get("active_tools") or []),
        produced_artifact_ids=[str(i) for i in raw.get("produced_artifact_ids") or []],
        received_artifact_ids=[str(i) for i in raw.get("received_artifact_ids") or []],
    )


@traces(SWR.SWR_3010)
def _resolved_tool_names(raw: dict[str, Any], persona_config: Any) -> list[str]:
    """The agent's own native tools, falling back to the persona's declaration.

    The persona's ``tools:`` list is a template, not a fact: ``coordinator_only``
    and ``read_only`` strip from it before the agent is built, so showing it made
    the inspector claim the orchestrator holds ``write_file``. The run records what
    it resolved; a snapshot written before it did, or a persona with no live agent,
    has nothing better than the declaration.
    """
    granted = raw.get("granted_tools")
    if granted:
        return [str(tool) for tool in granted]
    return list(persona_config.tools) if persona_config else []


def _display_model_name(config: Any, model_name: str | None) -> str:
    """Return a user-facing model key, never an internal synthetic config key."""
    if not model_name or config is None:
        return model_name or ""

    from rotaris_core.config.startup_models import _unwrap_synthetic_model_name

    return _unwrap_synthetic_model_name(config, model_name) or model_name


@traces(SWR.SWR_2812, SWR.SWR_2814)
def _model_options(config: Any) -> list[ModelOption]:
    """Every model a picker should offer, usable or not.

    Models the provider will not accept are listed alongside the usable ones,
    carrying the reason discovery recorded, so a user whose account has a model
    switched off reads that rather than watching it vanish from the list.
    """
    options: list[ModelOption] = []
    seen: set[str] = set()
    for model_name in config.models:
        name = _display_model_name(config, model_name)
        if name in seen:
            continue
        seen.add(name)
        options.append(ModelOption(name))
    for model_name, entry in config.unavailable_models.items():
        name = _display_model_name(config, model_name)
        if name in seen:
            continue
        seen.add(name)
        options.append(ModelOption(name, available=False, reason=entry.reason))
    return options


def _read_raw_personas(path: Path) -> dict[str, Any]:
    """Read persona declarations for origin display without disrupting config load."""
    import yaml

    if not path.exists():
        return {}
    try:
        payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        personas = payload.get("personas", {})
    except (AttributeError, OSError, yaml.YAMLError):
        return {}
    return personas if isinstance(personas, dict) else {}


@traces(SWR.SWR_2505, SWR.SWR_2507)
def _validation_message(error: Any) -> str:
    """The first schema complaint in a ``ValidationError``, as a user sentence.

    Pydantic prefixes a raised ``ValueError`` with ``"Value error, "`` and wraps
    the whole thing in a multi-line report naming the model. The settings
    surface has room for one sentence, and the schema already writes one.
    """
    try:
        errors = error.errors()
    except (AttributeError, TypeError):  # pragma: no cover - defensive
        return str(error)
    if not errors:  # pragma: no cover - pydantic always reports at least one
        return str(error)
    message = str(errors[0].get("msg", "")).strip() or str(error)
    return message.removeprefix("Value error, ")


def _global_config_dir() -> Path:
    from rotaris_core.config.paths import GLOBAL_CONFIG_DIR

    return GLOBAL_CONFIG_DIR


def _load_yaml_mapping(path: Path, label: str) -> dict[str, Any]:
    import yaml

    if not path.exists():
        return {}
    payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(payload, dict):
        raise ValueError(f"{label} agents.yaml must contain a mapping.")
    return payload


def _persona_field_scope(
    name: str,
    field: str,
    workspace_personas: dict[str, Any],
    global_personas: dict[str, Any],
) -> str:
    workspace = workspace_personas.get(name)
    if isinstance(workspace, dict) and field in workspace:
        return "workspace"
    global_value = global_personas.get(name)
    if isinstance(global_value, dict) and field in global_value:
        return "global"
    return "default"


def _model_thinking_choices(config: Any) -> dict[str, list[str | None]]:
    """Return LiteLLM-backed thinking choices keyed by user-facing model name."""
    from rotaris_core.models.thinking_catalog import supported_reasoning_levels

    choices: dict[str, list[str | None]] = {}
    for model_name, model in config.models.items():
        display_name = _display_model_name(config, model_name)
        model_id = str(model.model_id)
        provider = str(model.provider)
        qualified_name = (
            model_id if model_id.startswith(f"{provider}/") else f"{provider}/{model_id}"
        )
        choices[display_name] = [
            None,
            *supported_reasoning_levels(qualified_name, provider),
        ]
    return choices


def _persona_reasoning_display(value: Any, fallback: str = "") -> str:
    if value == "auto":
        return "provider_default"
    return str(value or fallback)


def _artifact_tuples(
    agent: AgentNode, infos_by_id: dict[str, ArtifactInfo]
) -> list[tuple[str, str, bool]]:
    """Display tuples (title, producer, ready) for one agent's artifact scope."""
    tuples: list[tuple[str, str, bool]] = []
    seen: set[str] = set()
    for artifact_id in (*agent.produced_artifact_ids, *agent.received_artifact_ids):
        info = infos_by_id.get(artifact_id)
        if info is None or artifact_id in seen:
            continue
        seen.add(artifact_id)
        tuples.append((info.title, info.producer or info.persona, info.ready))
    return tuples


@traces(SWR.SWR_2421, SWR.SWR_2444, SWR.SWR_2446)
def _event_from_dict(raw: dict[str, Any], persona: str = "") -> TranscriptEvent:
    role_key = str(raw.get("role") or "system")
    kind = {
        "user": "user",
        "system": "system",
        "tool": "tool",
        "thinking": "thinking",
        "verifier": "verifier",
    }.get(role_key, "message")
    role = "you" if kind == "user" else str(raw.get("name") or role_key)
    # The live run bridge stamps each row with the emitting agent's persona; that
    # is authoritative. The caller's map is the fallback for rows persisted before
    # the stamp existed, or written by paths that do not carry it.
    return TranscriptEvent(
        str(raw.get("ts") or ""),
        role,
        str(raw.get("content") or ""),
        kind=kind,
        tool=str(raw.get("tool") or ""),
        detail=str(raw.get("detail") or ""),
        full_text=str(raw.get("full_text") or ""),
        full_detail=str(raw.get("full_detail") or ""),
        persona=str(raw.get("persona") or "") or persona,
        event_key=str(raw.get("tool_event_key") or ""),
        status=str(raw.get("status") or ""),
        duration=float(raw.get("duration") or 0.0),
        started_at=float(raw.get("started_at") or 0.0),
        char_count=int(raw.get("chars") or 0),
        stream_id=str(raw.get("stream_id") or ""),
    )


def _todos_from_state(raw: dict[str, Any] | None) -> list[TodoItem]:
    todos: list[TodoItem] = []
    for phase_index, phase in enumerate((raw or {}).get("phases", [])):
        phase_name = str(phase.get("name") or f"Phase {phase_index + 1}")
        phase_id = str(phase.get("id") or phase_name)
        for task_index, task in enumerate(phase.get("tasks", [])):
            status = str(task.get("status", "PENDING")).upper()
            ui_status = {"COMPLETED": "done", "IN_PROGRESS": "active"}.get(status, "open")
            todos.append(
                TodoItem(
                    id=str(task.get("id") or f"{phase_id}-task-{task_index + 1}"),
                    phase_id=phase_id,
                    status=ui_status,
                    text=str(task.get("name") or "task"),
                    phase_name=phase_name,
                )
            )
    return todos


def _relative_time(value: dt.datetime) -> str:
    now = dt.datetime.now(value.tzinfo or dt.UTC)
    seconds = max(0, int((now - value).total_seconds()))
    if seconds < 60:
        return "now"
    if seconds < 3600:
        return f"{seconds // 60}m"
    if seconds < 86400:
        return f"{seconds // 3600}h"
    return f"{seconds // 86400}d"
