from __future__ import annotations

import re
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator

from rotaris_core.hooks.models import DEFAULT_HOOK_TIMEOUT_SECONDS, HOOK_EVENTS
from rotaris_core.init.classifier import DEFAULT_SOURCE_EXTENSIONS as _DEFAULT_SOURCE_EXTENSIONS
from rotaris_core.permissions.command_patterns import CommandPattern
from rotaris_core.permissions.engine import MalformedPolicyError
from rotaris_core.reqtocode import SWR, traces


class MCPToolInfo(BaseModel):
    name: str
    description: str = ""


@traces(SWR.SWR_1709)
class MCPServerConfig(BaseModel):
    type: Literal["stdio", "http", "sse"] = "stdio"
    command: str | None = None
    args: list[str] = Field(default_factory=list)
    env: dict[str, str] = Field(default_factory=dict)
    cwd: str | None = None
    url: str | None = None
    headers: dict[str, str] | None = None
    request_timeout: int | None = Field(
        default=None,
        description=(
            "Per-tool-call timeout in seconds for MCP tools from this server. "
            "Passed through to the underlying MCP client's ServerParams. "
            "Overrides the SDK default (300 s)."
        ),
    )
    tools: list[MCPToolInfo] = Field(default_factory=list)
    disabled_tools: list[str] = Field(
        default_factory=list,
        description=(
            "Optional MCP tool names to hide from agents for this server. "
            "Translated into FastMCP tool transforms with enabled=false. "
            "Uses original (server-reported) tool names."
        ),
    )
    tool_name_map: dict[str, str] = Field(
        default_factory=dict,
        description=(
            "Optional rename map for MCP tool names exposed to agents. "
            "Keys are original names reported by the server; values are the "
            "friendly names agents will see and call. "
            "Renamed tools are also renamed in the prompt's MCP section. "
            "Happens after disabled_tools filtering, so disable by original name."
        ),
    )

    @model_validator(mode="after")
    def _validate_transport_shape(self) -> MCPServerConfig:
        if self.type == "stdio" and self.command is None:
            raise ValueError("MCPServerConfig: 'command' is required for stdio transport")
        if self.type in ("http", "sse") and self.url is None:
            raise ValueError(f"MCPServerConfig: 'url' is required for {self.type} transport")
        return self


ThinkingLevel = Literal["auto", "low", "medium", "high", "max"]
PersonaThinkingLevel = Literal[
    "default", "provider_default", "auto", "low", "medium", "high", "max"
]
ModelTier = Literal["small_model", "medium_model", "large_model"]
SkillLoadMode = Literal["off", "name-only", "user-invocable-only", "on"]
SkillInvocationMode = Literal["default", "manual-only", "auto-only"]


@traces(SWR.SWR_2098)
class SkillSettings(BaseModel):
    """Workspace policy for how portable skills enter agent context."""

    enabled: bool = True
    overrides: dict[str, SkillLoadMode] = Field(default_factory=dict)
    invocation_overrides: dict[str, SkillInvocationMode] = Field(default_factory=dict)


@traces(SWR.SWR_505, SWR.SWR_837, SWR.SWR_2096, SWR.SWR_2811)
class ModelConfig(BaseModel):
    provider: str
    model_id: str
    api_key: SecretStr | None = None
    api_key_env: str | None = None
    base_url: str | None = None
    disable_streaming: bool = Field(
        default=False,
        description=(
            "Force non-streaming chat/completion requests for endpoints that reject "
            "``stream=true``. When false, callers may still opt into streaming."
        ),
    )
    max_input_tokens: int | None = None
    max_output_tokens: int | None = None
    context_compression_threshold: int | None = None
    thinking: ThinkingLevel | None = None
    auth_provider: Annotated[
        str | None,
        Field(
            default=None,
            description=(
                "Authentication provider ID. When set, credentials are resolved from the "
                "auth subsystem instead of static api_key/api_key_env."
            ),
        ),
    ] = None
    disable_responses_api: bool = Field(
        default=False,
        description=(
            "Force the SDK to use its chat-completions path instead of its own "
            "Responses API path. Automatically enabled for auth_provider='copilot': "
            "Rotaris routes Copilot through LiteLLM, which selects the endpoint per "
            "model (see ``api_mode``). Set explicitly for other proxies that don't "
            "support the Responses API endpoint."
        ),
    )
    api_mode: Annotated[
        Literal["chat", "responses"] | None,
        Field(
            default=None,
            description=(
                "Provider endpoint this model is dispatched to, for providers whose "
                "catalog is split across /chat/completions and /responses. Discovery "
                "fills this in from the provider's advertised endpoints; None means "
                "the provider default. Set explicitly to override a discovered route."
            ),
        ),
    ] = None
    timeout: int | None = Field(
        default=None,
        description=(
            "Per-model HTTP timeout in seconds for LLM requests. Overrides "
            "``runtime.model_timeout`` for this model only. Useful for slow "
            "reasoning models (e.g. GPT-5) where 120s is too aggressive. "
            "When None, the global ``runtime.model_timeout`` applies."
        ),
    )
    num_retries: int | None = Field(
        default=None,
        description=(
            "Per-model retry count for transient errors (timeouts, rate limits). "
            "Overrides the SDK default (5). When None, SDK default applies."
        ),
    )
    temperature: float | None = Field(
        default=None,
        description="Sampling temperature forwarded to the LLM. Provider default when None.",
    )
    top_p: float | None = Field(
        default=None,
        description="Nucleus sampling probability mass. Provider default when None.",
    )
    top_k: int | None = Field(
        default=None,
        description="Top-K sampling cutoff. Only honored by providers that support it.",
    )
    presence_penalty: float | None = Field(
        default=None,
        description=(
            "Presence penalty forwarded via the request body for providers that support it."
        ),
    )
    repetition_penalty: float | None = Field(
        default=None,
        description=(
            "Repetition penalty forwarded via the request body for providers that support it."
        ),
    )
    seed: int | None = Field(
        default=None,
        description="Deterministic sampling seed. Provider default when None.",
    )
    input_cost_per_token: float | None = Field(
        default=None,
        ge=0,
        description=(
            "Prompt-token price in USD for models LiteLLM cannot price on its own "
            "(custom or openai-compatible endpoints). Forwarded to the SDK, which "
            "hands it to LiteLLM as custom_cost_per_token — Rotaris never derives "
            "prices itself. Requires ``output_cost_per_token`` to take effect."
        ),
    )
    output_cost_per_token: float | None = Field(
        default=None,
        ge=0,
        description=(
            "Completion-token price in USD. Counterpart of ``input_cost_per_token``; "
            "both must be set for the SDK to apply configured pricing."
        ),
    )
    extra_body: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Additional provider-specific request body fields forwarded through LiteLLM "
            "extra_body. Useful for advanced sampling params not modeled explicitly."
        ),
    )
    reasoning_effort: str | None = Field(
        default=None,
        description=(
            "Explicit reasoning_effort for OpenAI-style reasoning models "
            "(e.g. 'low', 'medium', 'high'). When set, overrides the value "
            "derived from ``thinking``."
        ),
    )
    reasoning_effort_map: dict[ThinkingLevel, str] = Field(
        default_factory=dict,
        description=(
            "Optional per-model adapter from normalized thinking levels to a custom "
            "endpoint's reasoning-effort dialect (for example low: light). Native "
            "providers should rely on LiteLLM instead."
        ),
    )
    max_parallel: int | None = Field(
        default=None,
        ge=1,
        description=(
            "Maximum number of concurrent (non-terminal) child agents using this model. "
            "When set, the delegate tool rejects spawns that would exceed this cap with "
            "an actionable message. Defaults to 2 for the 'claude-code' provider "
            "(subscription usage is shared with the user's interactive Claude "
            "Code/Desktop sessions) and 3 for the 'deepseek' provider (which "
            "triggers governor-rate 401s under high concurrency); None (unlimited) for "
            "all other providers. Set explicitly to override."
        ),
    )

    @field_validator("thinking", mode="before")
    @classmethod
    def _coerce_thinking(cls, v: Any) -> Any:
        """Accept legacy boolean values: true → 'high', false → None."""
        if v is True:
            return "high"
        if v is False:
            return None
        return v

    @model_validator(mode="after")
    @traces(SWR.SWR_777, SWR.SWR_920)
    def _default_max_parallel(self) -> ModelConfig:
        """Default max_parallel for providers with shared-quota concurrency risks."""
        if self.max_parallel is None and "max_parallel" not in self.model_fields_set:
            if self.provider == "deepseek":
                self.max_parallel = 3
            elif self.provider == "claude-code":
                self.max_parallel = 2
        return self


@traces(SWR.SWR_2813)
class UnavailableModel(BaseModel):
    """A discovered model the provider lists but will not accept requests for.

    Deliberately *not* a ``ModelConfig``: nothing can be constructed from this, which
    is the point. It exists so the model pickers can keep the entry visible and say
    why instead of the catalog quietly coming up short (SWR-2812).
    """

    id: str
    display_name: str | None = None
    auth_provider: str | None = None
    reason_code: str
    reason: str = Field(
        description="One sentence the user can act on. Resolved at load time from "
        "``providers.model_availability`` so every surface says the same thing.",
    )
    detail: str | None = Field(
        default=None,
        description="The provider's own words about this model, when it supplied any.",
    )


@traces(
    SWR.SWR_302,
    SWR.SWR_304,
    SWR.SWR_342,
    SWR.SWR_350,
    SWR.SWR_357,
    SWR.SWR_2096,
    SWR.SWR_3008,
)
class PersonaConfig(BaseModel):
    name: str
    model: str
    purpose: str | None = Field(
        default=None,
        description="One-line description of what this persona does.",
    )
    summary_model: str | None = None
    system_prompt: str | None = None
    system_prompt_file: str | None = None
    tools: list[str] = Field(default_factory=list)
    delegates_to: list[str] = Field(default_factory=list)
    custom_tools: list[str] = Field(default_factory=list)
    mcp_servers: list[str] = Field(default_factory=list)
    mcp_tools: dict[str, list[str]] | None = Field(
        default=None,
        description=(
            "Optional per-server allow-list of MCP tools this persona may call. "
            "Keys are server names from ``mcp_servers``; values are original "
            "(server-reported) tool names. A server with no entry — or the whole "
            "field left unset — grants that server's entire tool surface, which "
            "is what every configuration written before per-persona grants did. "
            "The server's own ``disabled_tools`` still applies on top: a denial "
            "wins over a grant."
        ),
    )
    model_family_variants: dict[str, str] | None = Field(
        default=None,
        description=(
            "Model-family-specific prompt sections injected at runtime. "
            "Keys are model family prefixes (e.g., 'claude', 'gpt', 'gemini'). "
            "Values are additional prompt text appended to the system prompt "
            "when the resolved model matches the family prefix."
        ),
    )
    coordinator_only: bool = Field(
        default=False,
        description=(
            "If True, restrict this persona to orchestration-only tools. "
            "Coordinator personas may manage todo state and delegate work, "
            "but they may not directly read, edit, or execute against the workspace."
        ),
    )
    read_only: bool = Field(
        default=False,
        description=(
            "If True, restrict this persona to read-only tools only. "
            "Read-only tools: grep, glob, fetch, read_file, haet_read, "
            "artifact_read, artifact_list, artifact_write. "
            "Workspace write tools (write_file, shell, git_commit, "
            "haet_edit) are removed."
        ),
    )
    tool_restrictions: dict[str, list[str]] | None = Field(
        default=None,
        description=(
            "Optional tool restrictions per persona. "
            "Keys are persona names, values are lists of allowed tools. "
            "If a persona is not in this dict, all configured tools are allowed."
        ),
    )
    stall_timeout: int | None = Field(
        default=None,
        description=(
            "Per-persona stall threshold in seconds. When the child has not "
            "received an LLM event or token for this many seconds, the "
            "scheduler emits a STALLED status (visible in the TUI). Overrides "
            "``runtime.child_stall_timeout`` for this persona. Useful for "
            "slow reasoning models (e.g. GPT-5) that may legitimately go "
            "silent for several minutes while reasoning."
        ),
    )
    permission_mode: str | None = Field(
        default=None,
        description=(
            "Per-persona permission mode preset ('restricted', 'ask', or "
            "'autonomous'). Overrides ``runtime.permission_mode`` for this "
            "persona. An unrecognized name falls back to 'restricted'."
        ),
    )
    fallback_model: str | None = Field(
        default=None,
        description=(
            "Optional fallback model key (must exist in ``models``). When the "
            "child agent hits a hard child_timeout, the scheduler retries the "
            "task once with this model before giving up. Use to gracefully "
            "degrade from a slow primary model (e.g. copilot-gpt5) to a "
            "faster alternative on persistent provider latency."
        ),
    )
    thinking: PersonaThinkingLevel | None = Field(
        default=None,
        description=(
            "Thinking / reasoning effort level for this persona. "
            "When set, creates a synthetic model configuration that overrides "
            "the resolved model's thinking level. "
            "One of 'default' to inherit the selected model/slot setting, "
            "'provider_default' to clear any configured effort, 'auto', 'low', "
            "'medium', 'high', 'max', or None to inherit."
        ),
    )
    can_publish_artifacts: bool = Field(
        default=False,
        description=(
            "Whether this persona may call ``artifact_write`` to publish curated "
            "artifacts for downstream agents. Even when ``artifact_write`` is "
            "listed in ``tools``, it is only created when this flag is true."
        ),
    )
    skip_auto_sibling_context: bool = Field(
        default=False,
        description=(
            "When true, suppress the automatic ``PRIOR SIBLING SUMMARIES`` baseline "
            "block normally prepended to every spawned child's payload. Use for "
            "pure-execution children that should not be biased by prior research."
        ),
    )

    @field_validator("purpose", mode="before")
    @classmethod
    def _validate_purpose_single_line(cls, v: Any) -> Any:
        if isinstance(v, str) and "\n" in v:
            raise ValueError("purpose must be a single line (no newlines)")
        return v

    @field_validator("thinking", mode="before")
    @classmethod
    def _coerce_thinking(cls, v: Any) -> Any:
        """Accept legacy boolean values: true → 'high', false → None."""
        if v is True:
            return "high"
        if v is False:
            return None
        return v


class CompressorConfig(BaseModel):
    model: str = "gpt-4o-mini"
    timeout_seconds: int = 120
    default_threshold: int = 265_000
    threshold_percentage: int = Field(
        default=60,
        ge=1,
        le=100,
        description=(
            "Global context-compression trigger percentage. Runtime compression "
            "uses this percentage of the active model's bounded compression "
            "capacity, falling back to default_threshold when the active model "
            "context capacity is unknown."
        ),
    )
    auto_threshold_ratio: float = 0.35
    """Legacy auto-threshold setting retained for config compatibility.

    Runtime threshold resolution is controlled by ``threshold_percentage`` over
    the bounded compression capacity resolved in ``config.compression``.
    """
    chars_per_token: int = 4
    preserve_recent_turns: int = 4


@traces(
    SWR.SWR_202,
    SWR.SWR_203,
    SWR.SWR_205,
    SWR.SWR_206,
    SWR.SWR_218,
    SWR.SWR_219,
    SWR.SWR_223,
    SWR.SWR_227,
)
class CircuitBreakerConfig(BaseModel):
    model: str = "gpt-4o-mini"
    timeout_seconds: float = 20.0
    activation_mode: Literal["independent", "weighted"] = "independent"
    tool_call_threshold: int = Field(default=60, ge=1)
    message_count_threshold: int = Field(default=60, ge=1)
    tool_weight: float = Field(default=0.6, ge=0.0, le=1.0)
    message_weight: float = Field(default=0.4, ge=0.0, le=1.0)
    target_score: float = Field(default=1.0, gt=0.0)
    max_recent_events: int = Field(default=24, ge=4)
    max_transcript_chars: int = Field(default=8_000, ge=500)
    repetition_threshold: int = Field(default=4, ge=2)
    cycle_threshold: int = Field(default=3, ge=2)
    enabled: bool = Field(
        default=True,
        description="When False, the scheduler bypasses circuit-breaker evaluation entirely.",
    )


# Sandbox mode names accepted in ``runtime.sandbox_mode`` (SWR-2507). The
# canonical enum is ``rotaris_core.sandbox.spec.SandboxMode``; the literals are
# repeated here so the configuration schema does not depend on the sandbox
# package. The two are joined once the sandbox executor is wired in.
_SANDBOX_MODES: tuple[str, ...] = ("off", "workspace-write", "read-only")
# Dispositions accepted in ``runtime.network_egress_policy`` (SWR-2505).
_NETWORK_EGRESS_POLICIES: tuple[str, ...] = ("allow", "ask", "deny")


@traces(SWR.SWR_909)
class RuntimePolicy(BaseModel):
    # Security-relevant fields (sandbox mode, egress policy) are also set by
    # assignment — the settings UI writes straight onto the loaded policy — so
    # validators must run on assignment too, not only on construction.
    model_config = ConfigDict(validate_assignment=True)

    max_children: int = 20
    max_active_children: int = 6
    max_depth: int = 3
    max_iterations: int = 20
    child_timeout: int = 1200
    child_stall_timeout: int = 90
    llm_response_timeout: int = Field(
        default=120,
        ge=30,
        description=(
            "If the LLM produces no event (message, token, or tool call) within this "
            "many seconds, the scheduler considers the model unresponsive and triggers "
            "the persona-level fallback_model (when configured). This is distinct from "
            "child_timeout — the child keeps running after fallback activation."
        ),
    )
    session_log_level: str = Field(
        default="WARNING",
        description=(
            "Log level for the per-session evidence/debug.log file. "
            "One of DEBUG, INFO, WARNING, ERROR. Default: WARNING."
        ),
    )
    model_timeout: int = 120
    shell_timeout: int = 100
    shell_max_background_sessions: int = Field(
        default=20,
        ge=1,
        description=(
            "Maximum number of concurrent background terminal sessions "
            "(started via shell with background=True)."
        ),
    )
    shell_background_timeout: int = Field(
        default=3600,
        ge=1,
        description=(
            "Default hard wall-clock timeout in seconds for background terminal "
            "commands. The session is SIGTERM'd then SIGKILL'd after this period."
        ),
    )
    terminal_stream_enabled: bool = Field(
        default=True,
        description=(
            "Publish live terminal output while a command runs, so the desktop can "
            "show a streaming preview and an interactive terminal (SWR-2428). "
            "Disabling it costs the live view, not the command."
        ),
    )
    terminal_stream_interval_ms: int = Field(
        default=100,
        ge=20,
        le=2000,
        description=("How often a running terminal is sampled for live output, in milliseconds."),
    )
    terminal_stream_buffer_kb: int = Field(
        default=256,
        ge=0,
        le=8192,
        description=(
            "Per-stream replay buffer for live terminal output, in kibibytes. A display "
            "attaching mid-command replays this much; 0 disables replay."
        ),
    )
    tool_timeout: int = 30
    summary_timeout: int = 120
    improvement_collector_timeout: int = Field(
        default=60,
        ge=1,
        description=(
            "Maximum wall-clock seconds the post-run ImprovementCollector may run "
            "before falling back to an empty artifact (REQ-20260515-POSTRUN-IMPROVE-012)."
        ),
    )
    improvement_collector_enabled: bool = Field(
        default=True,
        description=(
            "When True, a dedicated ImprovementCollector runs once after each "
            "terminal task_run to author an ImprovementProposalArtifact. The "
            "collector never blocks or alters the run; failures fall back to an "
            "empty artifact."
        ),
    )
    claude_sdk_native_loop: bool = Field(
        default=True,
        description=(
            "When True, a child whose model routes through the claude-code provider "
            "runs on the Claude Agent SDK's own agent loop (SWR-778): one persistent "
            "session per child, with Rotaris's tools published to it as in-process "
            "MCP tools. Set False to fall back to the SWR-777 one-shot completion "
            "shim, which discards tools and streaming."
        ),
    )
    auto_retries_transient: int = 1
    auto_retries_validation: int = 0
    allow_outside_workspace: bool = False
    permission_mode: str = Field(
        default="ask",
        description=(
            "Default permission mode preset for the policy engine (SWR-2501/2503): "
            "'restricted' (deny mutating tools by default, ask on reads outside the "
            "workspace), 'ask' (ask on mutating tools, allow read-only tools), or "
            "'autonomous' (allow inside the workspace, ask outside it). Overridable "
            "per persona via ``PersonaConfig.permission_mode``. An unrecognized name "
            "falls back to 'restricted'."
        ),
    )
    allow_unsandboxed_autonomous: bool = Field(
        default=False,
        description=(
            "Opt-in for running an unattended session in a permissive permission "
            "mode ('autonomous') without the OS-level sandbox (SWR-2507/2508). "
            "False (default) downgrades such a run to 'ask', which a headless host "
            "resolves further via ``headless_approval_policy``. Setting this True "
            "grants an unsupervised agent unrestricted host shell access inside the "
            "workspace — set it per workspace, not globally."
        ),
    )
    headless_approval_policy: str = Field(
        default="deny",
        description=(
            "How an 'ask' decision resolves in a host without an approval UI "
            "(SWR-2504): 'deny' (default — refuse the single tool call and let the "
            "agent re-plan) or 'abort' (refuse it and stop the run). An "
            "unrecognized value behaves like 'deny'."
        ),
    )
    approval_timeout_seconds: float = Field(
        default=300.0,
        ge=0,
        description=(
            "How long a tool call may wait for an interactive approval (SWR-2504) "
            "before it is denied. Matches the ask_questions prompt budget. "
            "0 means wait without a limit (SWR-3625) — what a run released from "
            "the requirements board is given, since the surface that says it is "
            "waiting is the thing that brings the user back to it. A wait with "
            "no limit is still released by cancelling the run."
        ),
    )
    sandbox_mode: str = Field(
        default="off",
        description=(
            "OS-level sandbox applied to terminal commands (SWR-2507): 'off' "
            "(default — commands run directly on the host), 'workspace-write' "
            "(writes are confined to the workspace plus ``sandbox_writable_roots``) "
            "or 'read-only' (no writes at all). Sandboxing is opt-in and needs an "
            "OS sandbox backend — Apple Seatbelt on macOS, bubblewrap on "
            "Linux/WSL2; it is unavailable on native Windows. Values are matched "
            "case-insensitively; an unrecognized value is rejected."
        ),
    )
    sandbox_writable_roots: list[str] = Field(
        default_factory=list,
        description=(
            "Absolute paths that remain writable inside the sandbox in addition to "
            "the workspace itself (SWR-2507) — e.g. a shared build or package "
            "cache. Entries are stored verbatim (whitespace-stripped); a relative "
            "entry is rejected."
        ),
    )
    sandbox_allow_network: bool = Field(
        default=False,
        description=(
            "Whether processes inside the sandbox may reach the network "
            "(SWR-2507). False (default): the sandbox denies network access unless "
            "the egress policy explicitly allows it. Only meaningful when "
            "``sandbox_mode`` is not 'off'."
        ),
    )
    network_egress_policy: str = Field(
        default="ask",
        description=(
            "Disposition for an agent-initiated network target (the ``fetch`` tool) "
            "that matches neither ``network_allowed_hosts`` nor "
            "``network_denied_hosts`` (SWR-2505): 'allow', 'ask' (default — request "
            "approval) or 'deny'. Values are matched case-insensitively; an "
            "unrecognized value is rejected."
        ),
    )
    network_allowed_hosts: list[str] = Field(
        default_factory=list,
        description=(
            "Host patterns permitted for agent-initiated network access regardless "
            "of ``network_egress_policy`` (SWR-2505) — e.g. 'github.com' or "
            "'*.npmjs.org'. Patterns are stored verbatim apart from whitespace "
            "stripping and lower-casing (host names are case-insensitive); blank "
            "entries are dropped. Match semantics belong to the fetch policy check, "
            "not to this schema."
        ),
    )
    network_denied_hosts: list[str] = Field(
        default_factory=list,
        description=(
            "Host patterns refused for agent-initiated network access even when "
            "``network_allowed_hosts`` or a permissive ``network_egress_policy`` "
            "would otherwise permit them (SWR-2505). Normalized exactly like "
            "``network_allowed_hosts``."
        ),
    )
    validate_intent: bool = Field(
        default=False,
        description=(
            "Deprecated. Use classify_completion instead — it combines completion "
            "and alignment checking in a single LLM call using the small_model alias."
        ),
    )
    classify_completion: bool = Field(
        default=True,
        description=(
            "When True, after each successful iteration the loop runs a lightweight "
            "LLM call (using the small_model alias) to verify that the work is "
            "genuinely complete. If the classifier returns NEEDS_ITERATION the task "
            "is re-queued; UNCLEAR is treated as COMPLETE so a transient LLM failure "
            "never blocks the run."
        ),
    )
    relentless: bool = Field(
        default=False,
        description=(
            "Autonomous-completion mode (a.k.a. 'relentless'). When True, the Ralph "
            "loop does NOT stop after the planned todo list is exhausted. Instead it "
            "runs a final fulfillment check against the user's original request: if "
            "any acceptance criterion is unmet, a remediation task is appended and "
            "the loop continues. The loop only terminates when the original request "
            "is fully addressed or `relentless_max_cycles` is reached."
        ),
    )
    relentless_max_cycles: int = Field(
        default=3,
        ge=1,
        description=(
            "Maximum number of remediation cycles in relentless mode. Each cycle "
            "consists of a fulfillment check followed by (optionally) one or more "
            "additional iterations to address gaps. Hard cap to prevent infinite "
            "loops on intractable requests."
        ),
    )
    memory_diagnostics_enabled: bool = Field(
        default=False,
        description=(
            "When True, start tracemalloc and record memory snapshots at child "
            "agent boundaries. Snapshots are written to evidence/memory.jsonl "
            "and summarized in timeline/log output."
        ),
    )
    memory_diagnostics_top_frames: int = Field(
        default=8,
        ge=0,
        le=50,
        description=(
            "Number of top tracemalloc allocation sites to include in each "
            "memory diagnostic snapshot. Set to 0 for aggregate RSS/current/peak only."
        ),
    )
    graceful_pause_tool_deadline: float = Field(
        default=30.0,
        ge=5.0,
        le=120.0,
        description=(
            "Maximum seconds to wait for in-flight tool calls to finish before "
            "force-closing a conversation during graceful pause/shutdown. "
            "When a pause is requested while tools are running, the scheduler "
            "polls for tool completion up to this deadline; if tools don't "
            "finish, the conversation is force-closed instead."
        ),
    )
    shutdown_drain_timeout: float = Field(
        default=120.0,
        ge=0.0,
        description=(
            "When the Ralph loop concludes a run naturally (e.g. 'no pending "
            "tasks'), background children that are still running (e.g. an "
            "orchestrator's delegated codebase-analyst) are given up to this "
            "many seconds to finish before session teardown cancels them. "
            "Prevents in-flight delegated work from being silently discarded "
            "just because the top-level todo bookkeeping concluded first. "
            "Set to 0 to disable draining and cancel immediately (old behavior)."
        ),
    )
    message_limit: int | None = Field(default=None, ge=1)

    @field_validator("sandbox_mode", mode="before")
    @classmethod
    @traces(SWR.SWR_2507)
    def _validate_sandbox_mode(cls, v: Any) -> str:
        """Reject an unknown sandbox mode instead of silently running unsandboxed."""
        # A bare ``sandbox_mode: off`` is the boolean False under YAML 1.1; read
        # it as the 'off' mode instead of failing with a confusing type error.
        if v is False:
            return "off"
        normalized = v.strip().lower() if isinstance(v, str) else None
        if normalized is None or normalized not in _SANDBOX_MODES:
            raise ValueError(
                f"runtime.sandbox_mode {v!r} is not a valid sandbox mode; "
                f"expected one of: {', '.join(_SANDBOX_MODES)}"
            )
        return normalized

    @field_validator("sandbox_writable_roots")
    @classmethod
    @traces(SWR.SWR_2507)
    def _validate_sandbox_writable_roots(cls, v: list[str]) -> list[str]:
        """Reject relative writable roots — a sandbox mount set needs absolute paths.

        Both POSIX and Windows spellings count as absolute so a config file stays
        portable between the machines that share it.
        """
        roots: list[str] = []
        for raw in v:
            entry = raw.strip()
            if not (PurePosixPath(entry).is_absolute() or PureWindowsPath(entry).is_absolute()):
                raise ValueError(
                    f"runtime.sandbox_writable_roots entry {raw!r} must be an absolute path"
                )
            roots.append(entry)
        return roots

    @field_validator("network_egress_policy")
    @classmethod
    @traces(SWR.SWR_2505)
    def _validate_network_egress_policy(cls, v: str) -> str:
        """Reject an unknown egress disposition rather than guessing a default."""
        normalized = v.strip().lower()
        if normalized not in _NETWORK_EGRESS_POLICIES:
            raise ValueError(
                f"runtime.network_egress_policy {v!r} is not a valid egress policy; "
                f"expected one of: {', '.join(_NETWORK_EGRESS_POLICIES)}"
            )
        return normalized

    @field_validator("network_allowed_hosts", "network_denied_hosts")
    @classmethod
    @traces(SWR.SWR_2505)
    def _normalize_host_patterns(cls, v: list[str]) -> list[str]:
        """Lower-case and strip host patterns so the fetch check can compare cheaply."""
        return [stripped.lower() for pattern in v if (stripped := pattern.strip())]


class TranscriptUiConfig(BaseModel):
    """TUI transcript memory-management and rendering settings.

    Controls how many events are kept in RAM vs. evicted to a disk-backed
    JSONL archive, and the page size for archive reads during scroll-up
    loading.
    """

    max_in_memory_events: int = Field(
        default=100,
        ge=50,
        le=1000,
        description=(
            "Maximum transcript events held in RAM. When exceeded, oldest "
            "events are evicted to a JSONL archive and replaced with page "
            "sentinels for scroll-up loading."
        ),
    )
    archive_page_size: int = Field(
        default=50,
        ge=10,
        le=200,
        description="Number of events per page in the transcript archive JSONL file.",
    )


@traces(SWR.SWR_1083, SWR.SWR_1089)
class TuiDisplayConfig(BaseModel):
    """User-facing TUI display preferences persisted in workspace config."""

    show_tool_results: bool = Field(
        default=True,
        description="Show tool call results inline in the transcript.",
    )
    tool_result_max_lines: int = Field(
        default=10,
        ge=0,
        description=(
            "Maximum lines of tool result content to render in the transcript. "
            "Content beyond this limit is elided with a truncation indicator. "
            "Set to 0 for no limit. Full content remains in session transcript "
            "for model context."
        ),
    )
    show_tool_inputs: bool = Field(
        default=True,
        description="Show tool call inputs (commands/arguments) inline in the transcript.",
    )
    tool_input_max_lines: int = Field(
        default=2,
        ge=0,
        description=(
            "Maximum lines of tool input content (e.g., command, arguments) to render "
            "in the transcript. Content beyond this limit is elided with a truncation "
            "indicator. Set to 0 for no limit. Full content remains in session "
            "transcript for model context."
        ),
    )


_CTRL_LEADER_RE = re.compile(r"^ctrl\+[a-z]$")


def normalize_tui_leader(value: str) -> tuple[str, str | None]:
    raw = value.strip()
    lowered = raw.lower()
    if lowered in {"esc", "escape"}:
        return "Esc", None
    if _CTRL_LEADER_RE.fullmatch(lowered):
        return f"Ctrl+{lowered[-1].upper()}", None
    return "Ctrl+X", f"Invalid tui.keyboard.leader {value!r}; using Ctrl+X."


@traces(SWR.SWR_1167)
class TuiKeyboardConfig(BaseModel):
    leader: str = Field(default="Ctrl+X")
    leader_warning: str | None = Field(default=None, exclude=True)

    @model_validator(mode="after")
    def _normalize_leader(self) -> TuiKeyboardConfig:
        leader, warning = normalize_tui_leader(self.leader)
        self.leader = leader
        self.leader_warning = warning
        return self


class TuiConfig(BaseModel):
    keyboard: TuiKeyboardConfig = Field(default_factory=TuiKeyboardConfig)


@traces(SWR.SWR_2601)
class CheckConfig(BaseModel):
    """One entry of the completion verifier's check suite."""

    name: str
    command: str
    timeout: int = Field(
        default=600,
        ge=1,
        description="Hard wall-clock timeout in seconds for this check's command.",
    )
    severity: Literal["blocking", "advisory"] = Field(
        default="blocking",
        description=(
            "'blocking' checks gate completion classification; 'advisory' checks are "
            "reported but never block."
        ),
    )
    role: Literal["test", "typecheck", "lint", "other"] | None = Field(
        default=None,
        description=(
            "The semantic slot this check fills. Omitted means unstated, which is "
            "what a hand-written suite says: a workspace that spelled its checks "
            "out is stating exactly what it wants run, and a role would only be a "
            "guess about it. An authored gate (SWR-2614) always states roles, "
            "because the write path's authority rules are per role — 'do not "
            "remove a role's only check' has to know what a role is."
        ),
    )
    cwd: str | None = Field(
        default=None,
        description=(
            "Workspace-relative directory this check runs in, defaulting to the "
            "workspace root. One root gate can then cover a workspace holding "
            "several projects (SWR-2618): a sub-project's test command runs where "
            "it resolves, instead of running at the root and silently verifying "
            "the wrong tree. Must stay inside the workspace."
        ),
    )

    @model_validator(mode="after")
    def _validate_fields(self) -> CheckConfig:
        if not self.name.strip():
            raise ValueError("CheckConfig: 'name' must not be blank")
        if not self.command.strip():
            raise ValueError(f"CheckConfig {self.name!r}: 'command' must not be blank")
        if self.cwd is not None:
            _validate_check_cwd(self.name, self.cwd)
        return self


@traces(SWR.SWR_2618)
def _validate_check_cwd(name: str, cwd: str) -> None:
    """Refuse a working directory that is not inside the workspace.

    Rejected at *load* time rather than at run time, because a check pointed
    outside the workspace is a configuration mistake with a blast radius: the
    verifier runs commands, and a gate that verifies somebody else's tree while
    reporting on this one is worse than no gate. A directory that is inside the
    workspace and merely absent is a different fact — that is gate drift, and it
    is answered at run time (SWR-2616).
    """
    stripped = cwd.strip()
    if not stripped:
        raise ValueError(f"CheckConfig {name!r}: 'cwd' must not be blank; omit it for the root")
    candidate = PurePosixPath(stripped.replace("\\", "/"))
    if candidate.is_absolute() or PureWindowsPath(stripped).is_absolute():
        raise ValueError(
            f"CheckConfig {name!r}: 'cwd' must be workspace-relative, got {cwd!r}",
        )
    if ".." in candidate.parts:
        raise ValueError(
            f"CheckConfig {name!r}: 'cwd' must stay inside the workspace, got {cwd!r}",
        )


@traces(SWR.SWR_2601, SWR.SWR_2604, SWR.SWR_2605, SWR.SWR_2608)
class VerifierConfig(BaseModel):
    """Workspace-level configuration of the deterministic completion verifier.

    ``checks`` is deliberately three-valued: ``None`` means *unset* (fall back to
    auto-detection), while an explicit ``[]`` means *no verification* — a visible
    decision the resolver must never confuse with a failed detection.
    """

    checks: list[CheckConfig] | None = Field(
        default=None,
        description=(
            "Ordered check suite. Omit the key to auto-detect a suite from workspace "
            "markers; set it to an empty list to state explicitly that this workspace "
            "runs no verification."
        ),
    )
    gate_completion: bool = Field(
        default=True,
        description=(
            "When True, a blocking check that did not pass prevents an iteration that "
            "modified files from being classified complete — the task is re-queued "
            "regardless of what the LLM completion classifier concluded. Set to False "
            "to keep running and reporting the checks while letting the LLM verdict "
            "stand: the evidence still lands in the child report, it just no longer "
            "blocks. Iterations that changed no files are never gated either way."
        ),
    )
    suite_timeout: int | None = Field(
        default=900,
        ge=1,
        description=(
            "Wall-clock budget in seconds for one whole check-suite run. Each check's "
            "effective timeout is the lesser of its own timeout and the budget still "
            "remaining, and checks that have not started once the budget is spent are "
            "recorded as skipped rather than run — so verification can never cost more "
            "than this per iteration, however many checks the suite holds. Skipped "
            "checks never block completion. Set to null for no budget, in which case "
            "only the per-check timeouts apply."
        ),
    )
    author_gate: bool = Field(
        default=True,
        description=(
            "When True, the `gatekeeper` persona authors this workspace's check "
            "suite once its techstack settles (SWR-2615) and writes it to "
            "`verifier.checks`. Set to False to keep detection and probing while "
            "routing every write to an approval-gated proposal instead — the "
            "gate still adapts, a person just approves each change. Has no effect "
            "once `verifier.checks` is set: a stated suite is never re-authored."
        ),
    )
    probe_timeout: int = Field(
        default=30,
        ge=1,
        description=(
            "Seconds one calibration probe may take (SWR-2613). A probe is the "
            "cheapest invocation that proves a check's command resolves here and "
            "finds work — `pytest --collect-only`, `make -n <target>` — never the "
            "real suite. Deliberately independent of `suite_timeout`, which "
            "governs real runs: a collect-only pass that needs ten minutes is "
            "broken in a way no budget should accommodate."
        ),
    )
    max_repair_attempts: int = Field(
        default=2,
        ge=0,
        description=(
            "How many times a gated task may be re-queued so the agent can repair "
            "the failing checks. Each retry is given the failing checks' own output "
            "and re-runs the suite. When the budget is spent the task ends as "
            "failed-verification with the checks named, instead of retrying until "
            "the global iteration cap. Set to 0 to report the failure without ever "
            "retrying. Only applies while `gate_completion` is True."
        ),
    )

    @model_validator(mode="after")
    def _validate_unique_names(self) -> VerifierConfig:
        if self.checks is None:
            return self
        seen: set[str] = set()
        for check in self.checks:
            if check.name in seen:
                raise ValueError(f"VerifierConfig: duplicate check name {check.name!r}")
            seen.add(check.name)
        return self


@traces(SWR.SWR_2701)
class HookEntry(BaseModel):
    """One user-declared lifecycle hook: an event, an optional matcher, a command.

    Declared in the layered config under ``hooks:``; the loader stamps
    :attr:`source` so a workspace-authored hook stays distinguishable from a
    global one. Validation is deliberately strict and happens at load time —
    a typo'd event or an unreadable matcher is reported as a field-level config
    error (SWR-1827) rather than discovered when the hook silently never fires.
    """

    model_config = ConfigDict(validate_assignment=True)

    name: str = Field(
        default="",
        description=(
            "Optional human-readable label used in warnings and diagnostics. "
            "Left empty, the hook is reported by its generated stable id "
            "('<source>:<index>:<event>')."
        ),
    )
    event: str = Field(
        description=(
            "Lifecycle point this hook attaches to; one of "
            f"{', '.join(sorted(HOOK_EVENTS))}. Required — a hook with no event "
            "has nothing to fire on, so there is no default."
        ),
    )
    matcher: str = Field(
        default="",
        description=(
            "Which calls or occurrences the hook applies to. Empty (the default) "
            "means every one of them. For a tool call carrying a shell command "
            "this is an SWR-2502 command pattern matched per command segment "
            "(e.g. 'git push *'); otherwise it is a glob over the tool name."
        ),
    )
    command: str = Field(
        description=(
            "Shell command to run for this hook. Required and never blank: it "
            "runs on the host as user code, outside the agent's permission policy."
        ),
    )
    timeout_seconds: float = Field(
        default=DEFAULT_HOOK_TIMEOUT_SECONDS,
        gt=0,
        description=(
            "Wall-clock budget for the hook process. The default of "
            f"{DEFAULT_HOOK_TIMEOUT_SECONDS:g} s is a bound, not a target — on "
            "timeout the process is terminated (SWR-2704)."
        ),
    )
    required: bool = Field(
        default=False,
        description=(
            "When True, a 'pre_tool' hook that times out blocks the tool call "
            "instead of proceeding with a warning. Left False, a broken hook "
            "never stands between the agent and its work."
        ),
    )
    enabled: bool = Field(
        default=True,
        description=(
            "Set False to keep an entry in the config while switching it off. "
            "Disabled entries still hold their position, so the stable ids of "
            "neighbouring hooks do not shift."
        ),
    )
    source: str = Field(
        default="",
        description=(
            "Config scope this entry was read from ('global', 'workspace' or "
            "'default'). Stamped by the loader, never authored by hand; an "
            "empty value means the config was built in memory, and is read as "
            "'default'."
        ),
    )

    @field_validator("event")
    @classmethod
    @traces(SWR.SWR_2701)
    def _validate_event(cls, v: str) -> str:
        """Reject an unknown event rather than registering a hook that never fires."""
        normalized = v.strip()
        if normalized not in HOOK_EVENTS:
            raise ValueError(
                f"hook event {v!r} is not a known lifecycle hook event; "
                f"expected one of: {', '.join(sorted(HOOK_EVENTS))}"
            )
        return normalized

    @field_validator("matcher")
    @classmethod
    @traces(SWR.SWR_2701, SWR.SWR_2502)
    def _validate_matcher(cls, v: str) -> str:
        """Compile the matcher now, so a malformed pattern fails at load time."""
        normalized = v.strip()
        if not normalized:
            return ""
        try:
            CommandPattern.parse(normalized)
        except MalformedPolicyError as exc:
            raise ValueError(f"hook matcher {v!r} is not a usable command pattern: {exc}") from exc
        return normalized

    @field_validator("command")
    @classmethod
    @traces(SWR.SWR_2701)
    def _validate_command(cls, v: str) -> str:
        """A blank command is a config mistake, not a no-op hook."""
        if not v.strip():
            raise ValueError("hook 'command' must not be blank")
        return v


@traces(SWR.SWR_2701, SWR.SWR_2816)
class HookSettings(BaseModel):
    """The ``hooks:`` section of one config scope.

    Overlay semantics follow the rest of the layered config: a scope that
    declares ``entries`` replaces the list it inherited outright rather than
    appending to it, so a workspace can subtract a global hook. A scope that
    only sets ``enabled`` leaves the inherited list intact.
    """

    model_config = ConfigDict(validate_assignment=True)

    enabled: bool = Field(
        default=True,
        description=(
            "Master switch. Set False to run no hooks at all without deleting "
            "their declarations; the default True only matters once entries exist."
        ),
    )
    entries: list[HookEntry] = Field(
        default_factory=list,
        description=(
            "Declared hooks, in the order they run for a given event. Empty by "
            "default: Rotaris ships no hooks of its own."
        ),
    )
    superseded_entries: list[HookEntry] = Field(
        default_factory=list,
        description=(
            "The lower-scope hooks that `entries` replaced, kept so that an "
            "untrusted workspace list cannot silently switch off the user's own "
            "global hooks. Populated by the loader, never written by hand."
        ),
    )

    @model_validator(mode="before")
    @classmethod
    @traces(SWR.SWR_2701)
    def _accept_list_shorthand(cls, data: Any) -> Any:
        """Read ``hooks: [ … ]`` as ``hooks: {entries: [ … ]}``.

        The list form is what a user writes when they only ever want entries;
        normalising it here (before field validation) keeps both spellings
        producing the same model.
        """
        if data is None:
            return {}
        if isinstance(data, list):
            return {"entries": data}
        return data


@traces(SWR.SWR_2436)
class CheckpointConfig(BaseModel):
    """Automatic per-iteration git checkpoints (SWR-2436).

    ``enabled`` is three-valued on purpose: ``None`` means *unset*, which
    resolves to on for worktree-isolated sessions and off elsewhere, while an
    explicit ``false`` is a decision the resolver must never override.
    """

    model_config = ConfigDict(validate_assignment=True)

    enabled: bool | None = Field(
        default=None,
        description=(
            "Omit the key to take the per-session default: checkpointing is on "
            "in worktree-isolated sessions, where Rotaris owns the tree, and off "
            "elsewhere. Set true to checkpoint everywhere, false to never "
            "checkpoint — an explicit false is never re-enabled by isolation."
        ),
    )
    max_per_session: int = Field(
        default=50,
        ge=1,
        description=(
            "How many checkpoints one session retains; older ones are pruned so "
            "refs under refs/rotaris/ cannot grow without bound. The default of "
            "50 covers a long Ralph run without turning into ref clutter."
        ),
    )
    include_untracked: bool = Field(
        default=True,
        description=(
            "Whether untracked files are captured in a checkpoint. True by "
            "default because a newly created file is exactly the kind of agent "
            "edit a user wants to be able to undo (SWR-2437)."
        ),
    )


#: Extensions that mark a workspace as containing source code (SWR-2804).
#:
#: Re-exported from :mod:`rotaris_core.init.classifier`, which owns the single
#: definition — the classifier and this schema must never disagree about what
#: counts as source code. ``classifier`` is a leaf module (it imports only
#: :mod:`rotaris_core.reqtocode`, and ``pathspec`` lazily inside a function), so
#: importing it here costs nothing and introduces no cycle.
DEFAULT_SOURCE_EXTENSIONS = _DEFAULT_SOURCE_EXTENSIONS


@traces(SWR.SWR_2802, SWR.SWR_2806)
class InitializationState(BaseModel):
    """Which project-initialization tasks a workspace has already resolved.

    Persisted as the ``initialization:`` section of
    ``<workspace>/.rotaris/agents.yaml``.

    **"Never initialized" predicate** — a workspace counts as never initialized
    when :attr:`never_initialized` is true, i.e. when ``last_run is None`` *and*
    both task lists are empty.  This is the single documented way to tell
    "no ``initialization:`` section was ever written" apart from "initialization
    ran and resolved every task".  Writers therefore MUST stamp ``last_run``
    whenever they record an outcome — including the degenerate case where no
    task was applicable and both lists stay empty, which is exactly what marks
    such a workspace as initialized.
    """

    completed: list[str] = Field(
        default_factory=list,
        description="Initialization task ids that ran successfully.",
    )
    skipped: list[str] = Field(
        default_factory=list,
        description="Initialization task ids the user chose to defer.",
    )
    last_run: str | None = Field(
        default=None,
        description=(
            "ISO-8601 UTC timestamp of the last initialization run. ``None`` "
            "together with two empty task lists means 'never initialized'."
        ),
    )
    classification: str | None = Field(
        default=None,
        description=(
            "Project classification recorded by the initializer, ``'code'`` or "
            "``'non-code'`` (SWR-2804), so the UI can explain why code-oriented "
            "onboarding memories were or were not created. ``None`` when no "
            "classification has been performed yet."
        ),
    )

    @property
    def never_initialized(self) -> bool:
        """True when this workspace has no recorded initialization outcome."""
        return self.last_run is None and not self.completed and not self.skipped

    def is_resolved(self, task: str) -> bool:
        """True when *task* has already been completed or explicitly skipped."""
        return task in self.completed or task in self.skipped


@traces(SWR.SWR_2804, SWR.SWR_2806)
class ProjectInitConfig(BaseModel):
    """Workspace-tunable inputs to project initialization."""

    source_extensions: list[str] = Field(
        default_factory=lambda: list(DEFAULT_SOURCE_EXTENSIONS),
        description=(
            "File extensions that make a workspace count as a code project. A "
            "workspace whose files match none of these is classified 'non-code' "
            "and skips code-oriented onboarding (SWR-2804). Overriding this key "
            "replaces the default list rather than extending it."
        ),
    )


# ---------------------------------------------------------------------------
# Requirements board (epic SWR-3100 … SWR-3600) — one block, complete (SWR-3117)
# ---------------------------------------------------------------------------
#
# Everything the requirement feature has to be told is configuration: which
# sources exist, how they map, how often the index refreshes, which evidence a
# requirement owes, how execution names its branches, how many units may run at
# once, what the board shows first, and which decisions must reach a human.
#
# It lands here **once**, complete for the whole feature, rather than growing by
# one section per delivery slice. This file is 54 KB of validated schema and a
# merge magnet; six separate additions to it would be six conflicts at exactly
# the point where two slices run in parallel. Later slices *read* this block —
# none of them extends it (SWR-3117).
#
# Every field has a documented default, and a workspace that configures nothing
# gets the built-in ReqToCode source and manual scheduling: adopting the board
# must never require writing configuration first.


#: What kind of adapter a configured source is (SWR-3102, SWR-3104). Unknown
#: values are rejected at load time rather than producing a source that reads
#: nothing — a silently empty board is the failure this Literal exists to stop.
RequirementSourceType = Literal["reqtocode", "markdown", "yaml", "json"]

#: How strongly a requirement owes one kind of evidence (SWR-3206).
EvidenceObligation = Literal["required", "optional", "not-applicable"]

#: Board priority vocabulary (SWR-3309). ``none`` is the explicit "unprioritised"
#: bucket, which is what makes "sorts after Low rather than randomly" definable.
RequirementPriority = Literal["critical", "high", "normal", "low", "none"]

#: Repository events that can change what is true about a requirement (SWR-3210).
RequirementEvaluationTrigger = Literal[
    "commit",
    "merge",
    "source-edit",
    "branch-switch",
    "test-run",
    "run-completion",
    "worktree-integration",
    "manual",
]

#: Decisions with product meaning that an agent must not take alone (SWR-3512).
HumanDecisionTrigger = Literal[
    "contradictory-requirements",
    "unclear-scope",
    "competing-requirements",
    "breaking-change",
    "unclear-superseding",
    "risky-migration",
    "architectural-decision",
]

#: Every trigger of SWR-3210 — the default, and the complete vocabulary.
ALL_EVALUATION_TRIGGERS: tuple[RequirementEvaluationTrigger, ...] = (
    "commit",
    "merge",
    "source-edit",
    "branch-switch",
    "test-run",
    "run-completion",
    "worktree-integration",
    "manual",
)

#: Priorities in the order the queue works through them (SWR-3309, SWR-3412).
DEFAULT_PRIORITY_ORDER: tuple[RequirementPriority, ...] = (
    "critical",
    "high",
    "normal",
    "low",
    "none",
)

#: Every decision SWR-3512 sends to a human — the default, and the whole list.
ALL_HUMAN_DECISION_TRIGGERS: tuple[HumanDecisionTrigger, ...] = (
    "contradictory-requirements",
    "unclear-scope",
    "competing-requirements",
    "breaking-change",
    "unclear-superseding",
    "risky-migration",
    "architectural-decision",
)


@traces(SWR.SWR_3104, SWR.SWR_3117)
class RequirementFieldMap(BaseModel):
    """Where a declarative source finds each canonical field (SWR-3104).

    Values are field *paths* the declarative engine resolves — ``frontmatter.id``,
    ``heading``, ``body``, ``frontmatter.state``. ``None`` means "this source does
    not express that field", which lands on the canonical default rather than on
    a guess.
    """

    model_config = ConfigDict(extra="forbid")

    id: str = Field(
        default="frontmatter.id",
        description="Path to the requirement id. Required: an unmapped id is a "
        "configuration error, never an auto-numbered requirement (SWR-3104).",
    )
    title: str = Field(
        default="heading",
        description="Path to the title; 'heading' takes the document's first H1.",
    )
    description: str = Field(
        default="body",
        description="Path to the requirement prose; 'body' takes the document body.",
    )
    lifecycle: str | None = Field(
        default="frontmatter.status",
        description="Path to draft/approved/deprecated. Unset ⇒ every requirement "
        "is read as 'draft'.",
    )
    req_type: str | None = Field(
        default="frontmatter.type",
        description="Path to product/technical. Unset ⇒ 'product'.",
    )
    parent: str | None = Field(
        default="frontmatter.epic",
        description="Path to the parent/epic id (SWR-3108). Unset ⇒ a flat store.",
    )
    relations: dict[str, str] = Field(
        default_factory=dict,
        description="Relation kind → field path, e.g. {'derived-from': "
        "'frontmatter.derived-from'} (SWR-3109). Replaces, never merges.",
    )
    trace_required: str | None = Field(
        default=None,
        description="Path to the implementation-trace flag. Unset ⇒ required.",
    )
    test_required: str | None = Field(
        default=None,
        description="Path to the covering-test flag. Unset ⇒ required.",
    )


@traces(SWR.SWR_3102, SWR.SWR_3104, SWR.SWR_3115, SWR.SWR_3117)
class RequirementSourceConfig(BaseModel):
    """One configured requirement source (SWR-3115).

    A workspace may declare several: a Markdown store for product requirements
    and a tracker for customer requests is the normal case. ``id`` is what every
    requirement is attributed with and what a collision report names, so it is
    mandatory and must be unique across the block.
    """

    model_config = ConfigDict(extra="forbid")

    id: str = Field(
        description="Stable id of this source, used for attribution and in "
        "collision reports (SWR-3115). Unique within the block.",
    )
    type: RequirementSourceType = Field(
        default="reqtocode",
        description="Adapter kind. 'reqtocode' is the built-in store (SWR-3103); "
        "the others are declarative (SWR-3104). An unknown value is rejected.",
    )
    enabled: bool = Field(
        default=True,
        description="False keeps the declaration but stops reading it — the way "
        "to park a source without losing its mapping.",
    )
    root: str | None = Field(
        default=None,
        description="Workspace-relative root this source reads under. Unset ⇒ the "
        "adapter's own default (for 'reqtocode': the resolved repository layout).",
    )
    glob: str | None = Field(
        default=None,
        description="File glob for a declarative source, e.g. 'specs/**/*.md'. "
        "Required for every type but 'reqtocode' (SWR-3104).",
    )
    writable: bool | None = Field(
        default=None,
        description="Force the source read-only (False) or allow writes (True). "
        "Unset ⇒ whatever the adapter itself declares (SWR-3105).",
    )
    fields: RequirementFieldMap = Field(
        default_factory=RequirementFieldMap,
        description="Field mapping for a declarative source (SWR-3104). Ignored "
        "by the built-in source, which knows its own format.",
    )
    options: dict[str, str] = Field(
        default_factory=dict,
        description="Adapter-specific extras, passed through untouched. Replaces, never merges.",
    )

    @model_validator(mode="after")
    def _validate_shape(self) -> RequirementSourceConfig:
        if not self.id.strip():
            raise ValueError("RequirementSourceConfig: 'id' must not be blank")
        if self.type != "reqtocode" and not (self.glob or "").strip():
            raise ValueError(
                f"RequirementSourceConfig {self.id!r}: a {self.type!r} source needs a"
                " 'glob' naming the files it reads (SWR-3104)",
            )
        return self


@traces(SWR.SWR_3116, SWR.SWR_3117, SWR.SWR_3210)
class RequirementRefreshConfig(BaseModel):
    """How the requirement index keeps up with the repository (SWR-3116, SWR-3210)."""

    model_config = ConfigDict(extra="forbid")

    incremental: bool = Field(
        default=True,
        description="Re-read only artefacts whose own revision moved. False forces "
        "a full read every time — a diagnostic setting, not a normal one.",
    )
    debounce_ms: int = Field(
        default=400,
        ge=0,
        description="A burst of triggers within this window causes one evaluation "
        "(SWR-3210). 400 ms absorbs a rebase's event storm without feeling laggy.",
    )
    triggers: list[RequirementEvaluationTrigger] = Field(
        default_factory=lambda: list(ALL_EVALUATION_TRIGGERS),
        description="Repository events that re-evaluate requirements (SWR-3210). "
        "Replaces the default list rather than extending it.",
    )
    max_workers: int = Field(
        default=1,
        ge=1,
        description="Worker threads a refresh may use. One by default: refreshes "
        "are serialised so consumers never see a half-built index (SWR-3116).",
    )
    timeout_seconds: float = Field(
        default=120.0,
        gt=0,
        description="Wall-clock bound on one refresh; exceeding it fails the "
        "refresh and leaves the previous index in place.",
    )
    watch_filesystem: bool = Field(
        default=True,
        description="Watch requirement artefacts for edits. False ⇒ the index "
        "refreshes only on the remaining triggers and on explicit request.",
    )


@traces(SWR.SWR_3206, SWR.SWR_3117)
class RequirementObligationConfig(BaseModel):
    """Which evidence one kind of requirement owes (SWR-3206)."""

    model_config = ConfigDict(extra="forbid")

    implementation: EvidenceObligation = Field(
        default="required",
        description="An implementation trace (@traces) must exist.",
    )
    test: EvidenceObligation = Field(
        default="required",
        description="A covering test (@verifies) must exist and must have passed.",
    )
    verification: EvidenceObligation = Field(
        default="required",
        description="The completion gate (SWR-2604) must have passed for the delivering run.",
    )
    execution: EvidenceObligation = Field(
        default="optional",
        description="A recorded execution unit run. Optional: a requirement "
        "delivered by hand is still delivered.",
    )
    integration: EvidenceObligation = Field(
        default="optional",
        description="Multi-unit integration (SWR-3409). Not applicable to a "
        "single-unit requirement, so optional rather than required.",
    )


@traces(SWR.SWR_3206, SWR.SWR_3209, SWR.SWR_3117)
class RequirementEvidenceConfig(BaseModel):
    """Evidence obligations and freshness rules (SWR-3206, SWR-3209)."""

    model_config = ConfigDict(extra="forbid")

    follow_source_flags: bool = Field(
        default=True,
        description="Take the source's own flags first — ReqToCode's 'trace: "
        "optional' means no implementation obligation (SWR-3206). The per-type "
        "blocks below apply where the source says nothing.",
    )
    product: RequirementObligationConfig = Field(
        default_factory=RequirementObligationConfig,
        description="Obligations of a product requirement.",
    )
    technical: RequirementObligationConfig = Field(
        default_factory=lambda: RequirementObligationConfig(integration="not-applicable"),
        description="Obligations of a technical requirement: implementation and "
        "test, but no user-flow and no integration obligation (SWR-3206).",
    )
    epic: RequirementObligationConfig = Field(
        default_factory=lambda: RequirementObligationConfig(
            implementation="not-applicable",
            test="not-applicable",
            verification="not-applicable",
            execution="not-applicable",
            integration="not-applicable",
        ),
        description="An epic asserts nothing itself; its obligations are derived "
        "from its children (SWR-3206, SWR-3212).",
    )
    stale_on_lost_ancestor: bool = Field(
        default=True,
        description="A verification whose commit is no longer an ancestor of HEAD "
        "reports stale rather than failed (SWR-3209).",
    )
    stale_on_trace_move: bool = Field(
        default=True,
        description="A trace or covering test that moved or disappeared makes its "
        "evidence stale without any requirement edit (SWR-3209).",
    )


@traces(SWR.SWR_3113, SWR.SWR_3114, SWR.SWR_3205, SWR.SWR_3213, SWR.SWR_3117)
class RequirementDeliveryStoreConfig(BaseModel):
    """Where and how Rotaris' *own* requirement data is persisted (SWR-3205).

    Operational data only — delivery state, hashes, runs, evidence, audit.
    Requirement text is never written here: it stays in the project's store and
    is read from it (SWR-3114).
    """

    model_config = ConfigDict(extra="forbid")

    store_subpath: str = Field(
        default="requirements",
        description="Directory under '<workspace>/.rotaris/' holding delivery "
        "records, tombstones and audit entries (SWR-3205).",
    )
    schema_version: int = Field(
        default=1,
        ge=1,
        description="Version stamped on every written record. A record from a "
        "newer version is reported, never reinterpreted (SWR-3205).",
    )
    retain_tombstones: bool = Field(
        default=True,
        description="Keep the record of ids the sources no longer declare "
        "(SWR-3113). Turning this off re-enables id reuse and is never advisable.",
    )
    audit_trail: bool = Field(
        default=True,
        description="Record every state change with actor, time and reason (SWR-3213, SWR-3514).",
    )
    history_limit: int = Field(
        default=200,
        ge=1,
        description="Revision/run history entries retained per requirement "
        "(SWR-3214); older entries are pruned rather than growing without bound.",
    )


@traces(SWR.SWR_3404, SWR.SWR_3117)
class RequirementDecompositionConfig(BaseModel):
    """Whether and how a requirement is split into execution units (SWR-3404)."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool = Field(
        default=True,
        description="False ⇒ every requirement runs as exactly one unit.",
    )
    max_units: int = Field(
        default=6,
        ge=1,
        description="Upper bound on units one requirement may be split into; a "
        "plan exceeding it is rejected rather than silently truncated.",
    )
    require_confirmation: bool = Field(
        default=False,
        description="Show the plan and wait for a human before any unit runs. "
        "False by default: the plan is recorded and inspectable either way.",
    )


@traces(SWR.SWR_3405, SWR.SWR_3406, SWR.SWR_3410, SWR.SWR_3415, SWR.SWR_3117)
class RequirementExecutionConfig(BaseModel):
    """How a requirement's units are run, verified and integrated (SWR-3400)."""

    model_config = ConfigDict(extra="forbid")

    branch_template: str = Field(
        default="rotaris/req/{requirement_id}/{unit_id}",
        description="Branch name per execution unit (SWR-3405). Its own namespace, "
        "distinct from session branches ('rotaris/session/<id>'). Placeholders: "
        "{requirement_id}, {unit_id}, {slug}.",
    )
    integration_branch_template: str = Field(
        default="rotaris/req/{req}/integration/{id}",
        description="Branch of the integration worktree that merges a "
        "multi-unit requirement before it reaches the base (SWR-3409). "
        "Placeholders: {req}, {id}. It named {requirement_id} until the first "
        "code read it (SWR-3409's wiring) and found the engine formats {req} — "
        "the aliases {requirement_id} and {integration_id} are still accepted.",
    )
    worktree_subpath: str = Field(
        default="worktrees",
        description="Directory under '<workspace>/.rotaris/' for requirement "
        "worktrees — the same storage GitWorktreeService already owns (SWR-3405).",
    )
    target_branch: str | None = Field(
        default=None,
        description="Branch a verified requirement lands on. Unset ⇒ the branch "
        "the workspace was on when the run started (SWR-3409).",
    )
    run_check_suite: bool = Field(
        default=True,
        description="Run the workspace's check suite inside the unit's worktree "
        "(SWR-3410). A workspace with no suite yields 'not verified'.",
    )
    run_reqtocode_verification: bool = Field(
        default=True,
        description="Run ReqToCode verification in the unit's worktree and attach "
        "its coverage evidence to the run (SWR-3410, SWR-2606).",
    )
    retry_limit: int = Field(
        default=1,
        ge=0,
        description="Automatic retries per failed unit (SWR-3415). Exhausting "
        "them blocks the requirement naming the last failure; 0 disables retrying.",
    )
    keep_failed_worktrees: bool = Field(
        default=True,
        description="Keep a failed unit's worktree and branch for inspection "
        "(SWR-3415). The user removes it, never the scheduler.",
    )
    unit_timeout_minutes: int = Field(
        default=120,
        ge=1,
        description="Wall-clock bound on one unit run; exceeding it fails the "
        "unit with a stated reason instead of leaving it Running forever.",
    )
    decomposition: RequirementDecompositionConfig = Field(
        default_factory=RequirementDecompositionConfig,
        description="Automatic decomposition settings (SWR-3404).",
    )


@traces(SWR.SWR_3412, SWR.SWR_3510, SWR.SWR_3608, SWR.SWR_3117)
class RequirementSchedulingConfig(BaseModel):
    """What runs next, how much of it at once, and who decides (SWR-3412)."""

    model_config = ConfigDict(extra="forbid")

    mode: Literal["manual", "automatic"] = Field(
        default="manual",
        description="'manual' ⇒ a requirement runs when a user releases it. A "
        "workspace that configures nothing gets manual scheduling (SWR-3117).",
    )
    max_concurrent_units: int = Field(
        default=2,
        ge=1,
        description="Execution units running at once across all requirements "
        "(SWR-3406). Reaching it queues, never rejects.",
    )
    max_concurrent_requirements: int = Field(
        default=2,
        ge=1,
        description="Requirements in flight at once, independent of their unit count.",
    )
    avoid_file_conflicts: bool = Field(
        default=True,
        description="Hold back units likely to touch the same files rather than "
        "discovering the conflict at integration (SWR-3412).",
    )
    priority_order: list[RequirementPriority] = Field(
        default_factory=lambda: list(DEFAULT_PRIORITY_ORDER),
        description="Queue ordering by priority (SWR-3309). Priority orders the "
        "queue and never overrides a dependency (SWR-3412).",
    )
    auto_release_dependents: bool = Field(
        default=False,
        description="Start a requirement automatically once its dependencies are "
        "Done (SWR-3510). Off by default: an unblocked requirement becomes "
        "schedulable, and a human still chooses when it runs.",
    )
    queue_limit: int = Field(
        default=0,
        ge=0,
        description="Maximum queued candidates; 0 means unbounded.",
    )


@traces(SWR.SWR_3301, SWR.SWR_3309, SWR.SWR_3312, SWR.SWR_3117)
class RequirementBoardFilterConfig(BaseModel):
    """The filter a freshly opened board applies (SWR-3309).

    Every list is empty by default, i.e. no filter: a board that hid something on
    first open would be indistinguishable from a store that does not contain it.
    """

    model_config = ConfigDict(extra="forbid")

    epics: list[str] = Field(default_factory=list, description="Epic ids to show.")
    sources: list[str] = Field(default_factory=list, description="Source ids to show.")
    lifecycles: list[str] = Field(
        default_factory=list,
        description="Lifecycles to show ('draft', 'approved', 'deprecated').",
    )
    states: list[str] = Field(
        default_factory=list,
        description="Delivery states to show (SWR-3201).",
    )
    priorities: list[RequirementPriority] = Field(
        default_factory=list,
        description="Priorities to show.",
    )
    text: str = Field(
        default="",
        description="Free-text filter over id and title.",
    )


@traces(SWR.SWR_3301, SWR.SWR_3309, SWR.SWR_3312, SWR.SWR_3117)
class RequirementBoardConfig(BaseModel):
    """What the Requirements view shows before the user touches anything."""

    model_config = ConfigDict(extra="forbid")

    default_sort: Literal["priority", "id", "state", "health", "epic"] = Field(
        default="priority",
        description="Primary sort; id breaks every tie so the order is stable (SWR-3309).",
    )
    group_by: Literal["state", "epic", "source"] = Field(
        default="state",
        description="Board columns. 'state' is the Kanban view of SWR-3302.",
    )
    filters: RequirementBoardFilterConfig = Field(
        default_factory=RequirementBoardFilterConfig,
        description="Filter restored on open (SWR-3309); persisted across restarts.",
    )
    show_deprecated: bool = Field(
        default=False,
        description="Deprecated requirements are loaded and flagged either way; "
        "this decides whether the board shows them by default.",
    )
    live_updates: bool = Field(
        default=True,
        description="Update affected cards from evaluation results without a "
        "manual refresh (SWR-3312).",
    )
    card_limit: int = Field(
        default=0,
        ge=0,
        description="Cards rendered per column before paging; 0 means all.",
    )


@traces(SWR.SWR_3106, SWR.SWR_3404, SWR.SWR_3503, SWR.SWR_3507, SWR.SWR_3117)
class RequirementPersonaConfig(BaseModel):
    """Which persona does each agentic requirement job.

    Named here so the whole roster is one block; the persona definitions
    themselves live in ``config/defaults.py``. Every default names a persona that
    already exists — reusing ``requirements-engineer``, whose declared job is
    exactly "turns goals into traceable requirements", rather than inventing four
    personas nothing has been written for yet. A later slice that wants a
    dedicated one adds it in ``defaults.py`` and points the field at it; that is
    a change of default, not of schema (SWR-3117).

    A name that resolves to no configured persona falls back to the workspace's
    ``default_persona`` at resolution time rather than failing the load — an
    unknown persona must not make a workspace unopenable.
    """

    model_config = ConfigDict(extra="forbid")

    source_discovery: str = Field(
        default="requirements-engineer",
        description="Proposes a declarative source mapping for an unfamiliar "
        "repository (SWR-3106). Read-only work over the repository.",
    )
    decomposition: str = Field(
        default="requirements-engineer",
        description="Splits a requirement into execution units (SWR-3404).",
    )
    execution: str = Field(
        default="coding-agent",
        description="Implements an execution unit (SWR-3407).",
    )
    impact_analysis: str = Field(
        default="requirements-engineer",
        description="Classifies what a requirement change means for code and "
        "tests (SWR-3503). Never writes: the analysis is read-only.",
    )
    migration_analysis: str = Field(
        default="requirements-engineer",
        description="Builds the migration worklist for a superseding requirement (SWR-3507).",
    )


@traces(SWR.SWR_3215, SWR.SWR_3506, SWR.SWR_3512, SWR.SWR_3117)
class RequirementHumanInTheLoopConfig(BaseModel):
    """Which decisions come back to the user (SWR-3512).

    Enumerating them is what makes the autonomy trustworthy: the user knows
    exactly what will interrupt a run, and nothing outside this list does.
    """

    model_config = ConfigDict(extra="forbid")

    escalate: list[HumanDecisionTrigger] = Field(
        default_factory=lambda: list(ALL_HUMAN_DECISION_TRIGGERS),
        description="Decisions an agent must not take alone (SWR-3512). Replaces "
        "the default list rather than extending it.",
    )
    require_review_before_done: bool = Field(
        default=True,
        description="A completed requirement waits in Review for a human "
        "(SWR-3603). False lets a fully verified run close it itself.",
    )
    allow_force_done: bool = Field(
        default=False,
        description="Whether an override to Done exists at all (SWR-3215, "
        "SWR-3609). Off by default; when on, every use is recorded as an "
        "override with its actor and reason.",
    )
    confirm_migration_worklist: bool = Field(
        default=True,
        description="A planned superseding migration parks its requirement with "
        "an open question until a person answers it (SWR-3507). Off, the worklist "
        "is still planned and stored; it just does not interrupt the board. It "
        "cannot let an agent approve one — MigrationApproval refuses any actor "
        "that is not a named human, which is a property of the type rather than "
        "of this setting.",
    )
    confirm_source_writes: bool = Field(
        default=False,
        description="Confirm every write back into the requirement source "
        "(SWR-3111). Off by default: the write is already a user action.",
    )
    answer_timeout_minutes: int = Field(
        default=0,
        ge=0,
        description="How long a blocked requirement waits for an answer; 0 means "
        "indefinitely. A timeout never answers the question, it only reports it.",
    )


@traces(SWR.SWR_3501, SWR.SWR_3504, SWR.SWR_3509, SWR.SWR_3513, SWR.SWR_3117)
class RequirementChangeConfig(BaseModel):
    """What happens when a delivered requirement changes (SWR-3500)."""

    model_config = ConfigDict(extra="forbid")

    analyze_changes: bool = Field(
        default=True,
        description="Run impact analysis on a changed, already-delivered "
        "requirement (SWR-3503). Off ⇒ every change lands in Needs Update and "
        "waits for a human.",
    )
    adopt_hash_after_verification: bool = Field(
        default=True,
        description="A 'no behavioural impact' outcome adopts the new hash only "
        "after verification passed (SWR-3504) — never on the analysis alone.",
    )
    propagate_evidence_loss: bool = Field(
        default=True,
        description="A deleted test or removed trace takes its requirement out of "
        "Done without a text analysis (SWR-3513).",
    )
    gate_on_dependencies: bool = Field(
        default=True,
        description="Hold a requirement whose dependency is not Done (SWR-3510).",
    )
    report_dangling_dependents: bool = Field(
        default=True,
        description="Report the dependents of a removed requirement as dangling "
        "(SWR-3509). Nothing is ever deleted automatically.",
    )


@traces(SWR.SWR_3117)
class RequirementsConfig(BaseModel):
    """The whole requirements feature's configuration, in one block (SWR-3117).

    Complete for slices 1–6 at the point the source layer lands: later slices
    read fields from here and none of them adds one. Absent or partially
    specified, every field falls back to its documented default, and a workspace
    that configures nothing gets the built-in source and manual scheduling.
    """

    model_config = ConfigDict(validate_assignment=True, extra="forbid")

    enabled: bool = Field(
        default=True,
        description="Whether the requirements feature is active at all. False "
        "hides the board and stops every refresh and run.",
    )
    sources: list[RequirementSourceConfig] = Field(
        default_factory=list,
        description="Configured requirement sources (SWR-3115). Empty ⇒ the "
        "built-in ReqToCode source is used when the workspace has a store "
        "(SWR-3103). Replaces the inherited list rather than extending it.",
    )
    refresh: RequirementRefreshConfig = Field(default_factory=RequirementRefreshConfig)
    evidence: RequirementEvidenceConfig = Field(default_factory=RequirementEvidenceConfig)
    delivery: RequirementDeliveryStoreConfig = Field(
        default_factory=RequirementDeliveryStoreConfig,
    )
    execution: RequirementExecutionConfig = Field(default_factory=RequirementExecutionConfig)
    scheduling: RequirementSchedulingConfig = Field(default_factory=RequirementSchedulingConfig)
    board: RequirementBoardConfig = Field(default_factory=RequirementBoardConfig)
    personas: RequirementPersonaConfig = Field(default_factory=RequirementPersonaConfig)
    human_in_the_loop: RequirementHumanInTheLoopConfig = Field(
        default_factory=RequirementHumanInTheLoopConfig,
    )
    change: RequirementChangeConfig = Field(default_factory=RequirementChangeConfig)

    @model_validator(mode="after")
    def _validate_sources(self) -> RequirementsConfig:
        seen: set[str] = set()
        for source in self.sources:
            if source.id in seen:
                raise ValueError(
                    f"requirements.sources: duplicate source id {source.id!r};"
                    " attribution and collision reports need unique ids (SWR-3115)",
                )
            seen.add(source.id)
        return self

    @classmethod
    @traces(SWR.SWR_3117)
    def overlay(
        cls,
        base: dict[str, Any] | None,
        override: dict[str, Any] | None,
    ) -> RequirementsConfig:
        """Field-wise overlay of a workspace block over the user block.

        Rotaris' config precedence is ``~/.config/rotaris/`` <
        ``<workspace>/.rotaris/``, applied per field rather than by replacing
        whole sections. This carries that rule one level into the block, so a
        workspace that sets only ``scheduling.mode`` keeps the user's
        ``scheduling.max_concurrent_units`` instead of resetting it to the
        schema default. Genuine list and dict fields — ``sources``, ``triggers``,
        ``options`` — still *replace*, exactly as they do everywhere else.
        """
        merged: dict[str, Any] = dict(base or {})
        for key, value in (override or {}).items():
            current = merged.get(key)
            if isinstance(current, dict) and isinstance(value, dict):
                merged[key] = {**current, **value}
                continue
            merged[key] = value
        return cls.model_validate(merged)


class RotarisConfig(BaseModel):
    default_persona: str = "orchestrator"
    default_summary_model: str = "gpt-5-mini"
    default_summary_model_thinking: ThinkingLevel | None = None
    display: TuiDisplayConfig = Field(default_factory=TuiDisplayConfig)
    tui: TuiConfig = Field(default_factory=TuiConfig)
    transcript: TranscriptUiConfig = Field(default_factory=TranscriptUiConfig)
    improvement_collector_model: str | None = Field(
        default=None,
        description=(
            "Dedicated model for the post-run ImprovementCollector. When unset, "
            "falls back to ``medium_model``. Set this to use a different "
            "model for improvement analysis than the medium-tier default."
        ),
    )
    improvement_collector_model_thinking: ThinkingLevel | None = None
    gatekeeper_model: str | None = Field(
        default=None,
        description=(
            "Dedicated model for the `gatekeeper` persona, which authors this "
            "workspace's quality gate (SWR-2614). When unset it resolves through "
            "the existing chain — `small_model`, then `default_summary_model`, "
            "then `fallback_model`. Gate authoring is a short, cheap, "
            "once-per-techstack-change job, so it is configurable independently "
            "of the task personas rather than inheriting a large model from them."
        ),
    )
    gatekeeper_model_thinking: ThinkingLevel | None = None
    inject_agents_md: bool = Field(default=True)
    skills: SkillSettings = Field(default_factory=SkillSettings)
    small_model: str | None = Field(
        default=None,
        description=(
            "Alias for a lightweight/fast model. Any persona or sub-config field that "
            "references the literal string 'small_model' is resolved to this value at "
            "load time."
        ),
    )
    small_model_thinking: ThinkingLevel | None = None
    medium_model: str | None = Field(
        default=None,
        description="Alias for a balanced default model.",
    )
    medium_model_thinking: ThinkingLevel | None = None
    large_model: str | None = Field(
        default=None,
        description=(
            "Alias for a capable/expensive model. Any persona or sub-config field that "
            "references the literal string 'large_model' is resolved to this value at "
            "load time."
        ),
    )
    large_model_thinking: ThinkingLevel | None = None
    fallback_model: str | None = Field(
        default=None,
        description="Fallback model used when a primary model is unavailable.",
    )
    fallback_model_thinking: ThinkingLevel | None = None
    personas: dict[str, PersonaConfig] = Field(default_factory=dict)
    resolved_persona_model_tiers: dict[str, ModelTier] = Field(
        default_factory=dict,
        exclude=True,
        description=(
            "Runtime-only provenance for persona model references that were resolved "
            "from small_model, medium_model, or large_model startup slots."
        ),
    )
    models: dict[str, ModelConfig] = Field(default_factory=dict)
    unavailable_models: dict[str, UnavailableModel] = Field(
        default_factory=dict,
        description=(
            "Discovered models the provider will not accept, keyed the same way as "
            "``models``. Informational only — nothing is constructed from it. Kept "
            "separate so no code path can build a client for one by accident, while "
            "the model pickers can still list it with a reason (SWR-2812)."
        ),
    )
    mcp_servers: dict[str, MCPServerConfig] = Field(default_factory=dict)
    runtime: RuntimePolicy = Field(default_factory=RuntimePolicy)
    verifier: VerifierConfig = Field(default_factory=VerifierConfig)
    compressor: CompressorConfig = Field(default_factory=CompressorConfig)
    circuit_breaker: CircuitBreakerConfig = Field(default_factory=CircuitBreakerConfig)
    initialization: InitializationState = Field(default_factory=InitializationState)
    project_init: ProjectInitConfig = Field(default_factory=ProjectInitConfig)
    # The requirements board's entire configuration surface (SWR-3117). One
    # block, landed once, read by every later slice; see its definition above
    # for why it is not six separate additions to this file.
    requirements: RequirementsConfig = Field(default_factory=RequirementsConfig)
    hooks: HookSettings = Field(default_factory=HookSettings)
    checkpoints: CheckpointConfig = Field(default_factory=CheckpointConfig)
    workspace_root: Path = Field(default=Path())
    worktree_storage_subpath: str = Field(default="worktrees")
    # Session isolation may execute agents in a worktree while persistent
    # workspace metadata stays in the user-selected base workspace.
    metadata_workspace_root: Path | None = Field(default=None, exclude=True)
    mcp_server_sources: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _default_fallback_model(self) -> RotarisConfig:
        if self.fallback_model is None:
            self.fallback_model = self.small_model
        return self
