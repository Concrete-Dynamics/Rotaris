from __future__ import annotations

import logging
import os
import platform
import re
from contextlib import suppress
from copy import deepcopy
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast, override
from uuid import uuid4

import yaml
from tenacity import RetryCallState, retry, retry_if_exception, stop_after_attempt, wait_exponential

from rotaris_core.config.defaults import DEFAULT_CONFIG, LEGACY_PERSONA_ALIASES
from rotaris_core.config.mcp_discovery import discover_mcp_servers
from rotaris_core.config.paths import (
    GLOBAL_CONFIG_DIR,
    WORKSPACE_CONFIG_DIR_NAME,
    workspace_config_dir,
)
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.llm_errors import is_insufficient_quota_error, is_request_encoding_error
from rotaris_core.models.thinking_catalog import resolve_reasoning_control
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable

    from openhands.sdk import LLM

    from rotaris_core.config.project_snapshot import SnapshotModel
_log = logging.getLogger(__name__)
_REPLACE_TOP_LEVEL_KEYS = (
    "default_persona",
    "default_summary_model",
    "default_summary_model_thinking",
    "improvement_collector_model",
    "improvement_collector_model_thinking",
    "gatekeeper_model",
    "gatekeeper_model_thinking",
    "small_model",
    "small_model_thinking",
    "medium_model",
    "medium_model_thinking",
    "large_model",
    "large_model_thinking",
    "fallback_model",
    "fallback_model_thinking",
    "worktree_storage_subpath",
    "skills",
)
_NAMED_ENTRY_TOP_LEVEL_KEYS = ("personas", "models", "mcp_servers", "unavailable_models")
_STARTUP_MODEL_THINKING_FIELDS: dict[str, str] = {
    "default_summary_model": "default_summary_model_thinking",
    "improvement_collector_model": "improvement_collector_model_thinking",
    "gatekeeper_model": "gatekeeper_model_thinking",
    "small_model": "small_model_thinking",
    "medium_model": "medium_model_thinking",
    "large_model": "large_model_thinking",
    "fallback_model": "fallback_model_thinking",
}
_PERSONA_THINKING_PREFIX = "__persona__:"
_SYNTHETIC_STARTUP_MODEL_PREFIX = "__startup_slot__:"


def _canonicalize_persona_name(name: str) -> str:
    return LEGACY_PERSONA_ALIASES.get(name, name)


_FIELD_MERGE_TOP_LEVEL_KEYS = (
    "runtime",
    "verifier",
    "compressor",
    "circuit_breaker",
    "tui",
    "transcript",
    "initialization",
    "project_init",
    # The requirements board's block (SWR-3117). Per field, like every other
    # nested block: a workspace that sets only its concurrency limit must keep
    # the sources and the evaluation triggers it inherited (SWR-3608).
    "requirements",
    # ``hooks`` and ``checkpoints`` merge per field, which is what gives hooks
    # their overlay semantics: ``entries`` is a single field, so a scope that
    # declares it replaces the inherited list wholesale instead of appending,
    # while a scope that only flips ``enabled`` leaves the list alone (SWR-2701).
    "hooks",
    "checkpoints",
)
_PROGRAMMATIC_KEYS: frozenset[str] = frozenset(
    {
        "workspace_root",
        "metadata_workspace_root",
        "mcp_server_sources",
        "resolved_persona_model_tiers",
    }
)
_USAGE_ID_SEGMENT_RE = re.compile(r"[^a-z0-9]+")
_OPENAI_PLATFORM_BASE_URL = "https://api.openai.com/v1"
_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex"
_CODEX_UNSUPPORTED_RESPONSE_FIELDS: dict[str, Any] = {
    "temperature": None,
    "max_output_tokens": None,
    "prompt_cache_retention": None,
}
_CODEX_BASE_HEADERS = {
    "originator": "codex_cli_rs",
    "OpenAI-Beta": "responses=experimental",
    "User-Agent": f"rotaris ({platform.system()}; {platform.machine()})",
}


def _llm_retryable_exception(
    exc: BaseException,
    retry_exceptions: tuple[type[BaseException], ...],
) -> bool:
    return (
        isinstance(exc, retry_exceptions)
        and (not isinstance(exc, Exception) or not is_insufficient_quota_error(exc))
        and (not isinstance(exc, Exception) or not is_request_encoding_error(exc))
    )


def _quota_aware_before_sleep(
    llm: Any,
    retry_state: RetryCallState,
    *,
    num_retries: int,
    retry_listener: Callable[[int, int, BaseException | None], None] | None,
) -> None:
    llm.log_retry_attempt(retry_state)

    if retry_listener is not None:
        exc = retry_state.outcome.exception() if retry_state.outcome is not None else None
        retry_listener(retry_state.attempt_number, num_retries, exc)

    if retry_state.outcome is None:
        return
    exc = retry_state.outcome.exception()
    if exc is None:
        return

    from openhands.sdk.llm.exceptions import LLMNoResponseError

    if isinstance(exc, LLMNoResponseError):
        if getattr(llm, "base_url", None) == _CODEX_BASE_URL:
            # The ChatGPT Codex backend rejects ``temperature`` outright (it is
            # scrubbed from the LLM at load time via
            # ``_CODEX_UNSUPPORTED_RESPONSE_FIELDS``); injecting it here would
            # turn a retryable empty response into a fatal BadRequestError.
            return
        kwargs = getattr(retry_state, "kwargs", None)
        if isinstance(kwargs, dict):
            current_temp = kwargs.get("temperature", 0)
            if current_temp == 0:
                kwargs["temperature"] = 1.0
                _log.warning(
                    "LLMNoResponseError with temperature=0, setting "
                    "temperature to 1.0 for next attempt.",
                )
            else:
                _log.warning(
                    "LLMNoResponseError with temperature=%s, keeping original temperature",
                    current_temp,
                )


def _build_quota_aware_llm_class(base_cls: type[LLM], *, force_chat_completions: bool) -> type[LLM]:
    class _QuotaAwareLLM(base_cls):  # type: ignore[valid-type,misc]
        def retry_decorator(
            self,
            num_retries: int = 5,
            retry_exceptions: tuple[type[BaseException], ...] = (),
            retry_min_wait: int = 8,
            retry_max_wait: int = 64,
            retry_multiplier: float = 2.0,
            retry_listener: Callable[[int, int, BaseException | None], None] | None = None,
        ) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
            return retry(
                before_sleep=lambda retry_state: _quota_aware_before_sleep(
                    self,
                    retry_state,
                    num_retries=num_retries,
                    retry_listener=retry_listener,
                ),
                stop=stop_after_attempt(num_retries),
                reraise=True,
                retry=retry_if_exception(
                    lambda exc: _llm_retryable_exception(exc, retry_exceptions),
                ),
                wait=wait_exponential(
                    multiplier=retry_multiplier,
                    min=retry_min_wait,
                    max=retry_max_wait,
                ),
            )

        if force_chat_completions:

            @override
            def uses_responses_api(self) -> bool:
                return False

    return _QuotaAwareLLM


def _looks_like_literal_secret(value: str) -> bool:
    return len(value) >= 24 and "_" not in value and any(ch.islower() for ch in value)


def _resolve_model_api_key(model_name: str, model_cfg: Any) -> str | None:
    if model_cfg.api_key is not None:
        return cast("str", model_cfg.api_key.get_secret_value())

    if model_cfg.api_key_env is None:
        return None

    env_value = os.environ.get(model_cfg.api_key_env)
    if env_value is not None:
        return env_value

    if _looks_like_literal_secret(model_cfg.api_key_env):
        _log.warning(
            "Model '%s' appears to store a literal API key in api_key_env; "
            "treating it as api_key. Update the config to use api_key instead.",
            model_name,
        )

        return cast("str", model_cfg.api_key_env)

    return None


def _resolve_auth_provider_token(
    model_name: str,
    model_cfg: Any,
    *,
    workspace_root: Path | None = None,
) -> str | None:
    """Resolve token via OAuth auth provider (non-interactive, stored tokens only).

    Reading the status is a local judgement (:meth:`AuthManager.peek_status`), so
    the usable-token case costs one file read and no event loop — which matters
    because hosts build LLMs from inside a running loop and every hop out of it
    needs a thread. Only a refresh is real I/O, and by the time a run reaches
    here ``session_auth.prime_auth_providers`` has usually already done it.
    """
    auth_provider_id = getattr(model_cfg, "auth_provider", None)
    if auth_provider_id is None:
        return None

    from rotaris_core.auth.storage import TokenStorage

    storage = TokenStorage()
    token_set = storage.load(auth_provider_id)
    if token_set is None:
        _log.debug(
            "Model '%s' uses auth_provider '%s' but no stored tokens found",
            model_name,
            auth_provider_id,
        )
        return None

    from rotaris_core.auth.manager import AuthManager, run_auth_coro
    from rotaris_core.auth.provider import AuthStatus

    manager = AuthManager(storage=storage, workspace_root=workspace_root)
    status = manager.peek_status(auth_provider_id)
    if status == AuthStatus.AUTHENTICATED:
        return token_set.access_token

    if status == AuthStatus.EXPIRED:
        _log.debug("Stored token for '%s' is expired, attempting refresh", auth_provider_id)
        return run_auth_coro(manager.get_token(auth_provider_id))

    _log.debug(
        "Stored token for '%s' is not usable; interactive authentication is required",
        auth_provider_id,
    )
    return None


def _resolve_litellm_model_name(model_cfg: Any) -> str:
    provider = cast("str", model_cfg.provider)
    model_id = cast("str", model_cfg.model_id)
    if model_id.startswith(f"{provider}/"):
        return model_id
    return f"{provider}/{model_id}"


_LLM_CONSTRUCTOR_REASONING_EFFORTS = frozenset({"low", "medium", "high", "xhigh", "none"})


@traces(SWR.SWR_754, SWR.SWR_857)
def _resolve_thinking_kwargs(model_cfg: Any) -> dict[str, Any]:
    """Return LLM constructor kwargs for the configured thinking level, if any."""
    level = model_cfg.thinking
    if level in (None, "auto"):
        if level == "auto":
            _log.warning(
                "Legacy thinking level 'auto' for %r now means provider default; "
                "use an explicit level for deterministic effort.",
                _resolve_litellm_model_name(model_cfg),
            )
        # OpenHands SDK 1.34 defaults reasoning_effort to "high". Passing None
        # explicitly is required for a truthful provider default.
        return {"reasoning_effort": None}
    model_name = _resolve_litellm_model_name(model_cfg)
    resolved = resolve_reasoning_control(
        model_name=model_name,
        provider=cast("str", model_cfg.provider),
        level=level,
    )
    effort_map = getattr(model_cfg, "reasoning_effort_map", {})
    effort = effort_map.get(level, resolved.effort)
    return {"reasoning_effort": effort}


def _sanitize_usage_id_segment(value: str) -> str:
    normalized = _USAGE_ID_SEGMENT_RE.sub("-", value.lower()).strip("-")
    return normalized or "slot"


def build_llm_usage_id(
    role: str,
    *,
    model_name: str | None = None,
    scope: str | None = None,
) -> str:
    parts = [_sanitize_usage_id_segment(role)]
    if model_name:
        parts.append(_sanitize_usage_id_segment(model_name))
    if scope:
        parts.append(_sanitize_usage_id_segment(scope))
    parts.append(uuid4().hex[:8])
    return "-".join(parts)


def _load_yaml_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle)
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid YAML in {path}: {exc}") from exc
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ValueError(f"Invalid YAML in {path}: top-level content must be a mapping")
    return data


def _merge_entry_fields(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    result = dict(base)
    result.update(override)
    return result


def _merge_named_entries(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    result = dict(base)
    for key, override_value in override.items():
        base_value = result.get(key)
        if isinstance(base_value, dict) and isinstance(override_value, dict):
            result[key] = _merge_entry_fields(base_value, override_value)
            continue
        result[key] = override_value
    return result


def _normalize_tool_restrictions(raw_tool_restrictions: object) -> object:
    if not isinstance(raw_tool_restrictions, dict):
        return raw_tool_restrictions
    return {
        _canonicalize_persona_name(name) if isinstance(name, str) else name: tools
        for name, tools in raw_tool_restrictions.items()
    }


def _normalize_persona_entry(raw_persona: object) -> object:
    if not isinstance(raw_persona, dict):
        return raw_persona

    normalized_persona = dict(raw_persona)
    persona_name = normalized_persona.get("name")
    if isinstance(persona_name, str):
        normalized_persona["name"] = _canonicalize_persona_name(persona_name)

    delegates_to = normalized_persona.get("delegates_to")
    if isinstance(delegates_to, list):
        normalized_persona["delegates_to"] = [
            _canonicalize_persona_name(name) if isinstance(name, str) else name
            for name in delegates_to
        ]

    normalized_persona["tool_restrictions"] = _normalize_tool_restrictions(
        normalized_persona.get("tool_restrictions"),
    )
    return normalized_persona


def _normalize_legacy_persona_names(data: dict[str, Any]) -> dict[str, Any]:
    result = dict(data)

    default_persona = result.get("default_persona")
    if isinstance(default_persona, str):
        result["default_persona"] = _canonicalize_persona_name(default_persona)

    personas = result.get("personas")
    if not isinstance(personas, dict):
        return result

    normalized_personas: dict[str, Any] = {}
    for raw_name, raw_persona in personas.items():
        if not isinstance(raw_name, str):
            normalized_personas[raw_name] = raw_persona
            continue

        canonical_name = _canonicalize_persona_name(raw_name)
        normalized_persona = _normalize_persona_entry(raw_persona)

        existing = normalized_personas.get(canonical_name)
        if isinstance(existing, dict) and isinstance(normalized_persona, dict):
            normalized_personas[canonical_name] = _merge_entry_fields(existing, normalized_persona)
        else:
            normalized_personas[canonical_name] = normalized_persona

    result["personas"] = normalized_personas
    return result


@traces(SWR.SWR_2701)
def _normalize_hook_section(raw: object) -> dict[str, Any]:
    """Read a scope's ``hooks:`` block into the shape :class:`HookSettings` expects.

    Two spellings are accepted — the mapping form (``hooks: {enabled:, entries:}``)
    and the list shorthand (``hooks: [ … ]``) — and both a bare ``hooks:`` and a
    bare ``entries:`` key parse as ``None``, which means *unset*, not *empty*.
    Normalising here, before validation and before the scopes are merged, is what
    keeps the list shorthand from reaching pydantic as a type error.
    """
    if raw is None:
        return {}
    if isinstance(raw, list):
        section: dict[str, Any] = {"entries": list(raw)}
    elif isinstance(raw, dict):
        section = dict(raw)
    else:
        raise ValueError(
            "Invalid 'hooks' section: expected a mapping or a list of hook "
            f"entries, got {type(raw).__name__}"
        )
    if section.get("entries") is None:
        section.pop("entries", None)
    return section


@traces(SWR.SWR_2701)
def _stamp_hook_sources(scope_data: dict[str, Any], *, source: str) -> dict[str, Any]:
    """Record which scope each hook entry came from, while that is still knowable.

    Provenance has to be stamped during load: once the scopes are merged the
    losing layer's list is simply gone, and a workspace-authored hook — the one
    that travels with a cloned repository and must be treated as untrusted — can
    no longer be told apart from a global one.
    """
    section = scope_data.get("hooks")
    if not isinstance(section, dict):
        return scope_data
    entries = section.get("entries")
    if not isinstance(entries, list):
        return scope_data
    stamped = [
        {**entry, "source": source} if isinstance(entry, dict) else entry for entry in entries
    ]
    scope_data["hooks"] = {**section, "entries": stamped}
    return scope_data


@traces(SWR.SWR_2701, SWR.SWR_2816)
def _preserve_superseded_hooks(
    merged_data: dict[str, Any],
    scope_data: dict[str, Any],
) -> dict[str, Any]:
    """Carry the hooks *scope_data* is about to replace into ``superseded_entries``.

    A workspace hook list replaces the inherited list outright (SWR-2701), which
    on its own hands a cloned repository a way to disable the user's *own*
    guardrail hooks: declare any list, decline the trust prompt, and the global
    hooks are gone with it — no execution, but no protection either. Keeping the
    replaced entries lets the trust gate fall back to them instead of to nothing.

    Nothing here decides trust; it only stops the information being thrown away
    while it is still knowable which scope each entry came from.
    """
    section = scope_data.get("hooks")
    if not isinstance(section, dict) or not isinstance(section.get("entries"), list):
        return scope_data
    inherited = merged_data.get("hooks")
    if not isinstance(inherited, dict):
        return scope_data
    carried = [
        *(e for e in inherited.get("superseded_entries") or [] if isinstance(e, dict)),
        *(e for e in inherited.get("entries") or [] if isinstance(e, dict)),
    ]
    if not carried:
        return scope_data
    return {**scope_data, "hooks": {**section, "superseded_entries": carried}}


@traces(SWR.SWR_2098, SWR.SWR_2407, SWR.SWR_2601, SWR.SWR_2701, SWR.SWR_2806)
def _load_scope(config_dir: Path) -> dict[str, Any]:
    agents_config = _load_yaml_file(config_dir / "agents.yaml")
    models_config = _load_yaml_file(config_dir / "models.yml")
    return _normalize_legacy_persona_names(
        {
            "default_persona": agents_config.get("default_persona"),
            "default_summary_model": agents_config.get("default_summary_model"),
            "default_summary_model_thinking": agents_config.get("default_summary_model_thinking"),
            "improvement_collector_model": agents_config.get("improvement_collector_model"),
            "improvement_collector_model_thinking": agents_config.get(
                "improvement_collector_model_thinking",
            ),
            "gatekeeper_model": agents_config.get("gatekeeper_model"),
            "gatekeeper_model_thinking": agents_config.get("gatekeeper_model_thinking"),
            "small_model": agents_config.get("small_model"),
            "small_model_thinking": agents_config.get("small_model_thinking"),
            "medium_model": agents_config.get("medium_model"),
            "medium_model_thinking": agents_config.get("medium_model_thinking"),
            "large_model": agents_config.get("large_model"),
            "large_model_thinking": agents_config.get("large_model_thinking"),
            "fallback_model": agents_config.get("fallback_model"),
            "fallback_model_thinking": agents_config.get("fallback_model_thinking"),
            "worktree_storage_subpath": agents_config.get("worktree_storage_subpath"),
            "personas": _merge_named_entries({}, agents_config.get("personas", {})),
            "models": _merge_named_entries(
                agents_config.get("models", {}),
                models_config.get("models", {}),
            ),
            "mcp_servers": _merge_named_entries({}, agents_config.get("mcp_servers", {})),
            "runtime": _merge_entry_fields({}, agents_config.get("runtime", {})),
            # A bare ``verifier:`` key parses as None; treat it as "unset" rather
            # than crashing the whole config load.
            "verifier": _merge_entry_fields({}, agents_config.get("verifier") or {}),
            "hooks": _normalize_hook_section(agents_config.get("hooks")),
            "checkpoints": _merge_entry_fields({}, agents_config.get("checkpoints") or {}),
            "compressor": _merge_entry_fields({}, agents_config.get("compressor", {})),
            "circuit_breaker": _merge_entry_fields({}, agents_config.get("circuit_breaker", {})),
            "transcript": _merge_entry_fields({}, agents_config.get("transcript", {})),
            # Both project-initialization sections are routinely present but
            # empty (``initialization:`` with nothing under it), which YAML
            # parses as None — same treatment as ``verifier`` above.
            "initialization": _merge_entry_fields({}, agents_config.get("initialization") or {}),
            "project_init": _merge_entry_fields({}, agents_config.get("project_init") or {}),
            "skills": agents_config.get("skills"),
        },
    )


def _merge_config_data(
    base_data: dict[str, Any],
    override_data: dict[str, Any],
) -> dict[str, Any]:
    merged_data = dict(base_data)

    if "hooks" in override_data:
        # An override that never went through ``_load_scope`` — the CLI's
        # ``--config`` file, say — can still carry the list shorthand, which the
        # field merge below would try to ``dict.update`` from.
        override_data = {
            **override_data,
            "hooks": _normalize_hook_section(override_data["hooks"]),
        }

    for key in _REPLACE_TOP_LEVEL_KEYS:
        if override_data.get(key) is not None:
            merged_data[key] = override_data[key]

    for key in _NAMED_ENTRY_TOP_LEVEL_KEYS:
        merged_data[key] = _merge_named_entries(merged_data[key], override_data.get(key, {}))

    for key in _FIELD_MERGE_TOP_LEVEL_KEYS:
        merged_data[key] = _merge_entry_fields(merged_data.get(key, {}), override_data.get(key, {}))

    return merged_data


_MODEL_ALIAS_NAMES: frozenset[str] = frozenset({"small_model", "medium_model", "large_model"})


def _synthetic_startup_model_name(slot_name: str) -> str:
    return f"{_SYNTHETIC_STARTUP_MODEL_PREFIX}{slot_name}"


def _synthetic_persona_model_name(persona_name: str) -> str:
    return f"{_PERSONA_THINKING_PREFIX}{persona_name}"


def _resolve_startup_slot_model_name(
    data: dict[str, Any],
    slot_name: str,
    *,
    trail: tuple[str, ...] = (),
) -> str | None:
    value = data.get(slot_name)
    if not isinstance(value, str):
        return None
    if value not in _STARTUP_MODEL_THINKING_FIELDS:
        return value
    if value in trail:
        _log.warning(
            "Ignoring circular startup-model alias chain: %s -> %s", " -> ".join(trail), value
        )
        return None
    return _resolve_startup_slot_model_name(data, value, trail=(*trail, value))


def _inject_startup_slot_thinking_models(data: dict[str, Any]) -> dict[str, Any]:
    models = data.get("models")
    if not isinstance(models, dict):
        return data

    updated = dict(data)
    updated_models = dict(models)
    changed = False

    for slot_name, thinking_field in _STARTUP_MODEL_THINKING_FIELDS.items():
        thinking = updated.get(thinking_field)
        if thinking is None:
            continue

        resolved_model_name = _resolve_startup_slot_model_name(updated, slot_name)
        if resolved_model_name is None:
            _log.warning(
                "Startup thinking override for %s ignored: model is unconfigured.",
                slot_name,
            )
            continue

        base_model = updated_models.get(resolved_model_name)
        if not isinstance(base_model, dict):
            _log.warning(
                "Startup thinking override for %s ignored: base model %r was not found.",
                slot_name,
                resolved_model_name,
            )
            continue

        synthetic_name = _synthetic_startup_model_name(slot_name)
        synthetic_model = deepcopy(base_model)
        synthetic_model["thinking"] = thinking
        updated_models[synthetic_name] = synthetic_model
        updated[slot_name] = synthetic_name
        changed = True

    if changed:
        updated["models"] = updated_models
    return updated


@traces(SWR.SWR_2096)
def _inject_persona_thinking_models(data: dict[str, Any]) -> dict[str, Any]:
    """Create synthetic models for personas with per-persona thinking overrides.

    For each persona where ``thinking`` is set, this function deep-copies the
    persona's resolved model config (which may already be a synthetic slot
    model), sets the thinking level from the persona, registers the copy as a
    synthetic ``__persona__:{name}`` model, and rewrites the persona's model
    reference to point to the synthetic.
    """
    models = data.get("models")
    if not isinstance(models, dict):
        return data

    personas = data.get("personas")
    if not isinstance(personas, dict):
        return data

    updated = dict(data)
    updated_models = dict(models)
    updated_personas = dict(personas)
    changed = False

    for persona_name, persona in updated_personas.items():
        if not isinstance(persona, dict):
            continue
        thinking = persona.get("thinking")
        if thinking in (None, "default"):
            if thinking == "default":
                updated_personas[persona_name] = {**persona, "thinking": None}
                changed = True
            continue

        resolved_model_name = persona.get("model")
        if not isinstance(resolved_model_name, str):
            _log.warning(
                "Persona thinking override for %r ignored: no model configured.",
                persona_name,
            )
            continue

        base_model = updated_models.get(resolved_model_name)
        if not isinstance(base_model, dict):
            _log.warning(
                "Persona thinking override for %r ignored: base model %r was not found.",
                persona_name,
                resolved_model_name,
            )
            continue

        synthetic_name = _synthetic_persona_model_name(persona_name)
        synthetic_model = deepcopy(base_model)
        synthetic_model["thinking"] = None if thinking == "provider_default" else thinking
        updated_models[synthetic_name] = synthetic_model
        updated_personas[persona_name] = {**persona, "model": synthetic_name}
        if thinking == "provider_default":
            updated_personas[persona_name]["thinking"] = None
        changed = True

    if changed:
        updated["models"] = updated_models
        updated["personas"] = updated_personas
    return updated


@traces(SWR.SWR_386)
def _resolve_model_aliases(data: dict[str, Any]) -> dict[str, Any]:
    """Replace 'small_model'/'large_model' placeholders with their configured model names.

    Scans all model-reference fields (persona model/summary_model/fallback_model,
    compressor/circuit_breaker model, default_summary_model) and substitutes
        the alias string with the resolved value from the configured tier fields.
    """
    aliases: dict[str, str] = {}
    for alias in _MODEL_ALIAS_NAMES:
        value = data.get(alias)
        # Only register an alias when the value is itself not another alias (no circular refs)
        if isinstance(value, str) and value not in _MODEL_ALIAS_NAMES:
            aliases[alias] = value

    if not aliases:
        return data

    def _r(v: Any) -> Any:
        return aliases.get(v, v) if isinstance(v, str) else v

    result = dict(data)

    for field in (
        "default_summary_model",
        "improvement_collector_model",
        "gatekeeper_model",
        "fallback_model",
    ):
        if field in result:
            result[field] = _r(result[field])

    personas = result.get("personas")
    if isinstance(personas, dict):
        new_personas: dict[str, Any] = {}
        resolved_persona_model_tiers: dict[str, str] = {}
        for name, persona in personas.items():
            if isinstance(persona, dict):
                p = dict(persona)
                model_reference = p.get("model")
                if isinstance(model_reference, str) and model_reference in _MODEL_ALIAS_NAMES:
                    resolved_persona_model_tiers[name] = model_reference
                for field in ("model", "summary_model", "fallback_model"):
                    if field in p:
                        p[field] = _r(p[field])
                new_personas[name] = p
            else:
                new_personas[name] = persona
        result["personas"] = new_personas
        result["resolved_persona_model_tiers"] = resolved_persona_model_tiers

    for section in ("compressor", "circuit_breaker"):
        sec = result.get(section)
        if isinstance(sec, dict) and "model" in sec:
            result[section] = {**sec, "model": _r(sec["model"])}

    return result


def _known_limit_provider_ids(model_cfg: Any) -> tuple[str, ...]:
    provider_ids: list[str] = []
    for attribute_name in ("auth_provider", "provider"):
        provider_id = cast("str | None", getattr(model_cfg, attribute_name, None))
        if provider_id is not None and provider_id not in provider_ids:
            provider_ids.append(provider_id)
    return tuple(provider_ids)


def _canonical_limit_provider_id(provider_id: str) -> str:
    return "openai" if provider_id in {"codex", "copilot"} else provider_id


def _known_limit_model_ids(model_id: str, provider_ids: tuple[str, ...]) -> list[str]:
    model_id_candidates = [model_id]
    for provider_id in provider_ids:
        for prefix in (
            f"{provider_id}/",
            f"{_canonical_limit_provider_id(provider_id)}/",
        ):
            if not model_id.startswith(prefix):
                continue
            stripped = model_id[len(prefix) :]
            if stripped and stripped not in model_id_candidates:
                model_id_candidates.append(stripped)
    return model_id_candidates


def _known_limit_lookup_candidates(model_name: str, model_cfg: Any) -> list[str]:
    candidates: list[str] = []
    if "/" in model_name:
        candidates.append(model_name)

    model_id = cast("str", getattr(model_cfg, "model_id", ""))
    if not model_id:
        return candidates

    provider_ids = _known_limit_provider_ids(model_cfg)
    model_id_candidates = _known_limit_model_ids(model_id, provider_ids)

    for provider_id in provider_ids:
        for candidate_model_id in model_id_candidates:
            qualified_id = f"{provider_id}/{candidate_model_id}"
            if qualified_id not in candidates:
                candidates.append(qualified_id)

    return candidates


def _apply_known_model_limits(config: RotarisConfig) -> None:
    from rotaris_core.providers.limits import resolve_known_token_limits

    for model_name, model_cfg in config.models.items():
        known_input, known_output = resolve_known_token_limits(
            *_known_limit_lookup_candidates(model_name, model_cfg),
        )
        if model_cfg.max_input_tokens is None and known_input is not None:
            model_cfg.max_input_tokens = known_input
        if model_cfg.max_output_tokens is None and known_output is not None:
            model_cfg.max_output_tokens = known_output


@traces(SWR.SWR_2813)
def _withheld_model_entry(
    model: SnapshotModel,
    *,
    provider_id: str,
) -> dict[str, Any] | None:
    """Describe why ``model`` cannot be used, or ``None`` when it can be.

    The classification is made once, at discovery, and rides along on the model's
    capabilities through the snapshot. This turns it back into the shape
    ``RotarisConfig.unavailable_models`` validates.
    """
    from rotaris_core.providers.model_availability import availability_reason, is_available

    code = model.capabilities.get("availability")
    if not isinstance(code, str) or is_available(code):
        return None
    raw_detail = model.capabilities.get("unavailable_detail")
    detail = raw_detail.strip() if isinstance(raw_detail, str) and raw_detail.strip() else None
    return {
        "id": model.id,
        "display_name": model.display_name,
        "auth_provider": provider_id,
        "reason_code": code,
        "reason": availability_reason(code, detail=detail),
        "detail": detail,
    }


@traces(
    SWR.SWR_303,
    SWR.SWR_313,
    SWR.SWR_314,
    SWR.SWR_315,
    SWR.SWR_316,
    SWR.SWR_317,
    SWR.SWR_318,
    SWR.SWR_356,
    SWR.SWR_1701,
    SWR.SWR_1825,
    SWR.SWR_2811,
    SWR.SWR_2813,
)
def load_config(workspace_root: Path | None = None) -> RotarisConfig:
    root = Path(workspace_root) if workspace_root is not None else Path.cwd()
    global_config = _stamp_hook_sources(_load_scope(GLOBAL_CONFIG_DIR), source="global")
    # Adopts a pre-rename `.geraet-ai/` dir once, so every other `.rotaris`
    # path literal downstream resolves against the migrated directory.
    workspace_config = _stamp_hook_sources(
        _load_scope(workspace_config_dir(root)),
        source="workspace",
    )

    def _add_missing_tier_models(cfg_dict: dict[str, Any], cfg_dir: Path) -> None:
        yaml_data = _load_yaml_file(cfg_dir / "agents.yaml")
        if "medium_model" in yaml_data:
            cfg_dict["medium_model"] = yaml_data["medium_model"]
        if "medium_model_thinking" in yaml_data:
            cfg_dict["medium_model_thinking"] = yaml_data["medium_model_thinking"]
        if "fallback_model" in yaml_data:
            cfg_dict["fallback_model"] = yaml_data["fallback_model"]
        if "fallback_model_thinking" in yaml_data:
            cfg_dict["fallback_model_thinking"] = yaml_data["fallback_model_thinking"]
        if "improvement_collector_model" in yaml_data:
            cfg_dict["improvement_collector_model"] = yaml_data["improvement_collector_model"]
        if "improvement_collector_model_thinking" in yaml_data:
            cfg_dict["improvement_collector_model_thinking"] = yaml_data[
                "improvement_collector_model_thinking"
            ]
        if "gatekeeper_model" in yaml_data:
            cfg_dict["gatekeeper_model"] = yaml_data["gatekeeper_model"]
        if "gatekeeper_model_thinking" in yaml_data:
            cfg_dict["gatekeeper_model_thinking"] = yaml_data["gatekeeper_model_thinking"]
        if "default_summary_model_thinking" in yaml_data:
            cfg_dict["default_summary_model_thinking"] = yaml_data["default_summary_model_thinking"]
        if "small_model_thinking" in yaml_data:
            cfg_dict["small_model_thinking"] = yaml_data["small_model_thinking"]
        if "large_model_thinking" in yaml_data:
            cfg_dict["large_model_thinking"] = yaml_data["large_model_thinking"]

    _add_missing_tier_models(global_config, GLOBAL_CONFIG_DIR)
    _add_missing_tier_models(workspace_config, root / WORKSPACE_CONFIG_DIR_NAME)

    discovered_servers, discovered_source_map = discover_mcp_servers(root)

    default_config = deepcopy(DEFAULT_CONFIG)
    merged_data = _stamp_hook_sources(default_config.model_dump(mode="python"), source="default")

    if discovered_servers:
        discovered_scope: dict[str, Any] = {
            "mcp_servers": {
                name: cfg.model_dump(mode="python") for name, cfg in discovered_servers.items()
            },
        }
        merged_data = _merge_config_data(merged_data, discovered_scope)

    from rotaris_core.config.project_snapshot import read_snapshot

    try:
        snapshot = read_snapshot(GLOBAL_CONFIG_DIR)
    except ValueError as exc:
        _log.warning("Ignoring project settings snapshot: %s", exc)
        snapshot = None

    yaml_model_names: set[str] = set()
    merged_yaml_models: dict[str, Any] = {}
    yaml_mcp_names: set[str] = set()
    for scope in (global_config, workspace_config):
        scope_models = scope.get("models") or {}
        if isinstance(scope_models, dict):
            yaml_model_names.update(scope_models.keys())
            merged_yaml_models = _merge_named_entries(merged_yaml_models, scope_models)

        scope_mcp = scope.get("mcp_servers") or {}
        if isinstance(scope_mcp, dict):
            yaml_mcp_names.update(scope_mcp.keys())

    if snapshot is not None:
        snapshot_scope: dict[str, Any] = {"models": {}, "unavailable_models": {}}
        for provider in snapshot.providers.values():
            if not provider.authenticated:
                continue

            if provider.large_model is not None:
                snapshot_scope["large_model"] = provider.large_model
            if provider.medium_model is not None:
                snapshot_scope["medium_model"] = provider.medium_model
            if provider.small_model is not None:
                snapshot_scope["small_model"] = provider.small_model
            if provider.fallback_model is not None:
                snapshot_scope["fallback_model"] = provider.fallback_model
            if provider.default_summary_model is not None:
                snapshot_scope["default_summary_model"] = provider.default_summary_model

            for model in provider.models:
                qualified_id = model.id
                yaml_model = merged_yaml_models.get(qualified_id)
                if (
                    qualified_id in yaml_model_names
                    and isinstance(yaml_model, dict)
                    and yaml_model.get("provider") is not None
                    and yaml_model.get("model_id") is not None
                ):
                    # User provided a complete override for this model.
                    continue

                withheld = _withheld_model_entry(model, provider_id=provider.id)
                if withheld is not None and qualified_id not in yaml_model_names:
                    # The provider lists it but will not accept it. Keep it out of
                    # `models:` so nothing can construct a client for it, and record
                    # why so the pickers can still show it (SWR-2812). A model the
                    # user mentioned in YAML at all stays a configured model.
                    snapshot_scope["unavailable_models"][qualified_id] = withheld
                    continue

                local_model_id = (
                    model.id[len(provider.id) + 1 :]
                    if model.id.startswith(f"{provider.id}/")
                    else model.id
                )
                from rotaris_core.providers.catalog import get_provider as _get_catalog_provider
                from rotaris_core.providers.limits import extract_token_limits

                max_input_tokens, max_output_tokens = extract_token_limits(model.limits)

                resolved_base_url: str | None = provider.base_url
                if resolved_base_url is None:
                    with suppress(KeyError):
                        resolved_base_url = _get_catalog_provider(provider.id).default_base_url

                if provider.id in ("deepseek", "claude-code"):
                    snapshot_provider_name = provider.id
                else:
                    snapshot_provider_name = "openai"

                # Discovery records which endpoint the provider will accept this
                # model on; carry it through so the loader can route accordingly.
                discovered_api_mode = model.capabilities.get("api_mode")
                if discovered_api_mode not in ("chat", "responses"):
                    discovered_api_mode = None

                snapshot_scope["models"][qualified_id] = {
                    "provider": snapshot_provider_name,
                    "model_id": local_model_id,
                    "auth_provider": provider.id,
                    "base_url": resolved_base_url,
                    "max_input_tokens": max_input_tokens,
                    "max_output_tokens": max_output_tokens,
                    "api_key": None,
                    "api_key_env": None,
                    "api_mode": discovered_api_mode,
                    "input_cost_per_token": model.pricing.get("input_cost_per_token"),
                    "output_cost_per_token": model.pricing.get("output_cost_per_token"),
                }

        merged_data = _merge_config_data(merged_data, snapshot_scope)

    for scope in (global_config, workspace_config):
        scope = _preserve_superseded_hooks(merged_data, scope)
        merged_data = _merge_config_data(merged_data, scope)

    merged_data["workspace_root"] = root
    merged_data = _inject_startup_slot_thinking_models(merged_data)
    merged_data = _resolve_model_aliases(merged_data)
    merged_data = _inject_persona_thinking_models(merged_data)

    config = RotarisConfig.model_validate(merged_data)
    _apply_known_model_limits(config)

    final_source_map: dict[str, str] = {}
    for name in config.mcp_servers:
        if name in yaml_mcp_names:
            final_source_map[name] = "yaml"
        elif name in discovered_source_map:
            final_source_map[name] = discovered_source_map[name]
        else:
            final_source_map[name] = "default"
    config.mcp_server_sources = final_source_map

    # Resolve env vars for each MCP server: expand ${VAR} placeholders from the
    # shell environment, then overlay with any stored secrets (secrets win).
    from rotaris_core.config.secrets import (
        ensure_gitignore_excludes_config,
        load_merged_secrets,
        resolve_server_env,
    )

    # Best-effort: keep .rotaris/ (and thus secrets.yaml) out of version control.
    ensure_gitignore_excludes_config(root)

    merged_secrets = load_merged_secrets(root)
    for name, server_cfg in config.mcp_servers.items():
        resolved = resolve_server_env(name, server_cfg.env, merged_secrets)
        if resolved != server_cfg.env:
            server_cfg.env = resolved
        # Resolve ${VAR} placeholders in the URL field for HTTP/SSE transports.
        if server_cfg.url is not None:
            server_cfg.url = _resolve_url_placeholders(server_cfg.url, merged_secrets.get(name, {}))

    return config


_URL_PLACEHOLDER_RE = re.compile(r"\$\{([^}]+)\}")


def _resolve_url_placeholders(url: str, secrets: dict[str, str]) -> str:
    """Expand ``${VAR_NAME}`` placeholders in an MCP server URL.

    Resolution order (later overrides earlier):
    1. Shell environment (``os.environ``)
    2. Stored secrets (``secrets`` dict)
    """

    def _replacer(m: re.Match[str]) -> str:
        var_name = m.group(1)
        # Secrets win over shell environment
        if var_name in secrets:
            return secrets[var_name]
        env_value = os.environ.get(var_name)
        if env_value is not None:
            return env_value
        _log.warning(
            "MCP server URL placeholder ${%s} could not be resolved; leaving literal in URL.",
            var_name,
        )
        return m.group(0)  # Keep literal ${VAR} if unresolvable

    return _URL_PLACEHOLDER_RE.sub(_replacer, url)


def _should_disable_responses_api(model_cfg: Any) -> bool:
    """Determine if the SDK's own Responses API path should be disabled.

    When the SDK detects a GPT-5 family model it takes its Responses path by
    default, keyed off the model name alone. That is wrong for GitHub Copilot,
    whose catalog is split across both endpoints per model: Rotaris keeps the
    SDK on chat completions and lets LiteLLM pick the endpoint from the model's
    registered mode (see ``ModelConfig.api_mode`` and SWR-2810).
    """
    if getattr(model_cfg, "disable_responses_api", False):
        return True
    return getattr(model_cfg, "auth_provider", None) == "copilot"


def _resolve_model_base_url(model_cfg: Any) -> str | None:
    auth_provider = getattr(model_cfg, "auth_provider", None)
    base_url = cast("str | None", getattr(model_cfg, "base_url", None))

    if auth_provider == "copilot":
        # LiteLLM's github_copilot/ provider resolves the tenant-specific
        # endpoint per-call from the bridged ``api-key.json["endpoints"]["api"]``
        # (see rotaris_core.auth.copilot_bridge). We only override when the user
        # explicitly pinned a base_url in their config.
        return base_url

    if auth_provider == "codex":
        if base_url is None:
            return _CODEX_BASE_URL
        normalized_base_url = base_url.rstrip("/")
        if normalized_base_url == _OPENAI_PLATFORM_BASE_URL:
            return _CODEX_BASE_URL

    if auth_provider == "concrete-cloud":
        if base_url is not None:
            return base_url

        from rotaris_core.auth.storage import TokenStorage

        token_set = TokenStorage().load("concrete-cloud")
        if token_set is not None:
            stored_api_base = token_set.extra.get("api_base")
            if isinstance(stored_api_base, str) and stored_api_base:
                return stored_api_base

    return base_url


def _resolve_codex_headers(model_cfg: Any) -> dict[str, str]:
    from rotaris_core.auth.storage import TokenStorage

    headers = dict(_CODEX_BASE_HEADERS)
    auth_provider = getattr(model_cfg, "auth_provider", None)
    if auth_provider != "codex":
        return headers

    token_set = TokenStorage().load("codex")
    if token_set is not None and token_set.account_id:
        headers["chatgpt-account-id"] = token_set.account_id
    return headers


def _should_request_stream_usage(model_cfg: Any, *, base_url: str | None, stream: bool) -> bool:
    """Return whether Rotaris should inject stream usage for this LLM.

    We only add ``stream_options.include_usage`` for streamed OpenAI-compatible
    endpoints where LiteLLM otherwise omits usage in streaming responses.
    OpenAI's ChatGPT Codex subscription backend rejects that field, and
    OpenHands' subscription path already handles the Codex-specific request
    shape upstream. Copilot is excluded too: it reports usage on both of its
    endpoints, and ``stream_options`` is a chat-completions-only field that
    would leak into a responses-routed request (SWR-2811).
    """
    if not stream:
        return False

    auth_provider = getattr(model_cfg, "auth_provider", None)
    if auth_provider in ("codex", "copilot"):
        return False

    provider = getattr(model_cfg, "provider", None)
    return provider in ("openai", "deepseek") and (base_url is not None or provider == "deepseek")


def _finalize_llm_for_auth_provider(llm: LLM, model_cfg: Any) -> LLM:
    if getattr(model_cfg, "auth_provider", None) == "codex":
        from rotaris_core.auth.codex_bridge import (
            build_openhands_oauth_credentials,
            stage_openhands_oauth_credentials,
        )
        from rotaris_core.auth.storage import TokenStorage

        # Mirror OpenHands subscription-mode transport for the ChatGPT Codex backend.
        # The OAuth Codex backend accepts a narrower request surface than the
        # regular OpenAI Responses API, so clear unsupported top-level params
        # here instead of chasing them one-by-one at failure sites.
        llm.auth_type = "subscription"
        llm.subscription_vendor = "openai"
        llm._is_subscription = True
        for field_name, value in _CODEX_UNSUPPORTED_RESPONSE_FIELDS.items():
            setattr(llm, field_name, value)
        llm.litellm_extra_body = {"store": False, **(llm.litellm_extra_body or {})}
        token_set = TokenStorage().load("codex")
        if token_set is not None:
            llm._subscription_credentials = build_openhands_oauth_credentials(token_set)
            try:
                stage_openhands_oauth_credentials(token_set)
            except Exception as exc:  # noqa: BLE001 — best-effort self-healing
                _log.warning(
                    "Failed to stage Codex OpenHands credentials during LLM load: %s",
                    exc,
                )
    return llm


def _ensure_copilot_litellm_tokens(workspace_root: Path) -> None:
    """Stage stored Copilot credentials into LiteLLM's workspace token cache."""
    from rotaris_core.auth.copilot_bridge import (
        ensure_litellm_env,
        litellm_copilot_token_dir,
        stage_copilot_tokens,
    )
    from rotaris_core.auth.manager import AuthManager, run_auth_coro
    from rotaris_core.auth.provider import AuthStatus
    from rotaris_core.auth.storage import TokenStorage

    token_dir = litellm_copilot_token_dir(workspace_root)
    ensure_litellm_env(token_dir)

    storage = TokenStorage()
    token_set = storage.load("copilot")
    if token_set is None:
        return

    manager = AuthManager(storage=storage, workspace_root=workspace_root)
    status = manager.peek_status("copilot")
    if status == AuthStatus.AUTHENTICATED:
        stage_copilot_tokens(token_set, token_dir=token_dir)
    elif status == AuthStatus.EXPIRED:
        # ``get_token`` re-stages the bridge files itself once the refresh lands.
        run_auth_coro(manager.get_token("copilot"))


@traces(SWR.SWR_306, SWR.SWR_308, SWR.SWR_310, SWR.SWR_311, SWR.SWR_1704)
@traces(SWR.SWR_756, SWR.SWR_777, SWR.SWR_837, SWR.SWR_2810, SWR.SWR_2811, SWR.SWR_2813)
def load_llm_for_model(
    config: RotarisConfig,
    model_name: str,
    *,
    stream: bool = False,
    usage_id: str | None = None,
) -> LLM:
    from rotaris_core.providers.litellm_runtime import configure_litellm_runtime

    configure_litellm_runtime()

    from openhands.sdk.llm.llm import LLM as _LLM

    quota_aware_llm_cls = _build_quota_aware_llm_class(_LLM, force_chat_completions=False)
    resolved_usage_id = usage_id or build_llm_usage_id("llm", model_name=model_name)
    model_cfg = config.models.get(model_name)
    if model_cfg is None:
        withheld = config.unavailable_models.get(model_name)
        if withheld is not None:
            # Discovery already learned why this one fails. Saying so here beats
            # handing the name to LiteLLM and letting the provider answer with an
            # opaque 400 several layers later (SWR-2812).
            raise ValueError(f"Model {model_name!r} is unavailable. {withheld.reason}")

        # Unknown model → hand the bare name to LiteLLM directly. This preserves
        # the legacy fallback used by circuit-breaker, compressor, and summary
        # agents when their configured model isn't declared under `models:`.
        from rotaris_core.model_input import wrap_llm_completion

        return wrap_llm_completion(
            quota_aware_llm_cls(model=model_name, stream=stream, usage_id=resolved_usage_id),
        )

    auth_provider = getattr(model_cfg, "auth_provider", None)

    if auth_provider == "claude-code":
        # Distinct execution path (SWR-777): requests run through the Claude
        # Agent SDK's local runtime against the subscription OAuth token —
        # never through LiteLLM or a base_url override.
        from rotaris_core.model_input import wrap_llm_completion
        from rotaris_core.providers.claude_code_runtime import (
            build_claude_code_llm,
            ensure_sdk_available,
        )

        ensure_sdk_available()
        return wrap_llm_completion(
            build_claude_code_llm(
                base_cls=_LLM,
                model_id=model_cfg.model_id,
                max_parallel=model_cfg.max_parallel,
                usage_id=resolved_usage_id,
                workspace_root=str(config.workspace_root),
            ),
        )

    extra_headers: dict[str, str] | None = None
    if auth_provider == "copilot":
        # Rotaris owns the device flow + session-token exchange. The bridged
        # access-token / api-key.json files under
        # ``<workspace>/.rotaris/litellm_cache/`` carry the live bearer +
        # tenant endpoint; LiteLLM's github_copilot/ provider reads them per
        # call. Make sure those files exist and the env-vars point at them
        # before we hand control to LiteLLM.
        from rotaris_core.auth.copilot_token import COPILOT_INTEGRATION_HEADERS

        _ensure_copilot_litellm_tokens(config.workspace_root)

        api_key: str | None = None
        extra_headers = dict(COPILOT_INTEGRATION_HEADERS)
        # Copilot's catalog is split across two endpoints and LiteLLM — not the
        # SDK — picks between them per model, so the SDK always takes its
        # chat-completions path. Models discovery flagged as responses-only are
        # registered with LiteLLM first, which then bridges the call to
        # /responses (SWR-2810).
        if getattr(model_cfg, "api_mode", None) == "responses":
            from rotaris_core.providers.copilot_model_registry import (
                register_copilot_responses_model,
            )

            register_copilot_responses_model(
                model_cfg.model_id,
                max_input_tokens=model_cfg.max_input_tokens,
                max_output_tokens=model_cfg.max_output_tokens,
            )

        llm_cls = _build_quota_aware_llm_class(_LLM, force_chat_completions=True)
    else:
        api_key = _resolve_auth_provider_token(
            model_name,
            model_cfg,
            workspace_root=config.workspace_root,
        ) or _resolve_model_api_key(model_name, model_cfg)
        if api_key is not None:
            from rotaris_core.auth.api_key import api_key_validation_error

            validation_error = api_key_validation_error(api_key)
            if validation_error is not None:
                raise ValueError(f"Invalid API key for model '{model_name}': {validation_error}")
        if auth_provider == "codex" and api_key:
            extra_headers = _resolve_codex_headers(model_cfg)

        if _should_disable_responses_api(model_cfg):
            llm_cls = _build_quota_aware_llm_class(_LLM, force_chat_completions=True)
        else:
            llm_cls = quota_aware_llm_cls

    base_url = _resolve_model_base_url(model_cfg)

    resolved_timeout = (
        model_cfg.timeout if model_cfg.timeout is not None else config.runtime.model_timeout
    )
    extra_llm_kwargs: dict[str, Any] = {}
    if model_cfg.num_retries is not None:
        extra_llm_kwargs["num_retries"] = model_cfg.num_retries
    if model_cfg.temperature is not None:
        extra_llm_kwargs["temperature"] = model_cfg.temperature
    if model_cfg.top_p is not None:
        extra_llm_kwargs["top_p"] = model_cfg.top_p
    if model_cfg.top_k is not None:
        extra_llm_kwargs["top_k"] = model_cfg.top_k
    if model_cfg.seed is not None:
        extra_llm_kwargs["seed"] = model_cfg.seed
    # Configured pricing for models LiteLLM cannot price. The SDK forwards
    # both values as custom_cost_per_token; Rotaris does no arithmetic.
    if model_cfg.input_cost_per_token is not None:
        extra_llm_kwargs["input_cost_per_token"] = model_cfg.input_cost_per_token
    if model_cfg.output_cost_per_token is not None:
        extra_llm_kwargs["output_cost_per_token"] = model_cfg.output_cost_per_token

    extra_body = dict(model_cfg.extra_body)
    if model_cfg.presence_penalty is not None:
        extra_body["presence_penalty"] = model_cfg.presence_penalty
    if model_cfg.repetition_penalty is not None:
        extra_body["repetition_penalty"] = model_cfg.repetition_penalty

    thinking_kwargs = _resolve_thinking_kwargs(model_cfg)
    thinking_extra_body = thinking_kwargs.pop("litellm_extra_body", None)
    if isinstance(thinking_extra_body, dict):
        extra_body = {**thinking_extra_body, **extra_body}
    if extra_body:
        extra_llm_kwargs["litellm_extra_body"] = extra_body

    if model_cfg.reasoning_effort is not None:
        thinking_kwargs["reasoning_effort"] = model_cfg.reasoning_effort
    post_init_reasoning_effort: str | None = None
    requested_reasoning_effort = thinking_kwargs.get("reasoning_effort")
    if (
        isinstance(requested_reasoning_effort, str)
        and requested_reasoning_effort not in _LLM_CONSTRUCTOR_REASONING_EFFORTS
    ):
        post_init_reasoning_effort = requested_reasoning_effort
        thinking_kwargs["reasoning_effort"] = None
    if auth_provider == "copilot" and getattr(model_cfg, "api_mode", None) != "responses":
        # OpenHands defaults reasoning_effort="high" for GPT-5-family models.
        # Copilot's chat-completions endpoint rejects function tools when that
        # parameter is present, so strip it there. The Responses endpoint
        # accepts it — and the models that route there are exactly the ones it
        # steers (SWR-2810).
        thinking_kwargs["reasoning_effort"] = None
        post_init_reasoning_effort = None

    if auth_provider == "copilot":
        # LiteLLM dispatches to its native GitHub Copilot provider when the
        # model string starts with ``github_copilot/``. The bare model_id
        # (e.g. ``gpt-5-mini``, ``claude-sonnet-4``) is what LiteLLM forwards
        # to Copilot, on whichever endpoint that model is registered for.
        litellm_model_name = f"github_copilot/{model_cfg.model_id}"
    else:
        litellm_model_name = _resolve_litellm_model_name(model_cfg)

    effective_stream = stream and not getattr(model_cfg, "disable_streaming", False)

    llm = llm_cls(
        model=litellm_model_name,
        api_key=api_key,
        base_url=base_url,
        timeout=resolved_timeout,
        max_input_tokens=model_cfg.max_input_tokens,
        max_output_tokens=model_cfg.max_output_tokens,
        extra_headers=extra_headers,
        stream=effective_stream,
        usage_id=resolved_usage_id,
        **extra_llm_kwargs,
        **thinking_kwargs,
    )
    if auth_provider == "copilot":
        llm.prompt_cache_retention = None
    if post_init_reasoning_effort is not None:
        llm.reasoning_effort = cast("Any", post_init_reasoning_effort)
    # For streaming openai-compatible endpoints that are not api.openai.com,
    # litellm does not automatically add stream_options.include_usage.  Without
    # this the endpoint omits prompt_tokens from streaming responses, making
    # the context-size estimate in RotarisCondenser always 0 and preventing
    # compression from ever firing.
    if _should_request_stream_usage(model_cfg, base_url=base_url, stream=effective_stream):
        llm.litellm_extra_body = {
            "stream_options": {"include_usage": True},
            **(llm.litellm_extra_body or {}),
        }
    from rotaris_core.model_input import wrap_llm_completion

    wrapped = wrap_llm_completion(_finalize_llm_for_auth_provider(llm, model_cfg))

    return wrapped
