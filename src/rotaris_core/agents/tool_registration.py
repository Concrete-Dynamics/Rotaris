"""Runtime-bound tool registration for personas.

Each ``_register_*_tool_factory`` binds runtime dependencies (workspace root,
config, child manager, artifact store) into an SDK tool registration. Extracted
from ``factory.py`` so persona/agent construction stays focused on assembling
agents rather than wiring tools.

The SDK *import* bootstrapping (``_ensure_*_registered``) and the MCP server
config resolution helpers deliberately remain in ``factory.py`` because their
module-level state is monkeypatched by tests against that module.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from dataclasses import dataclass
from threading import RLock
from typing import TYPE_CHECKING, Any, cast

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from openhands.sdk.conversation.state import ConversationState
    from openhands.sdk.tool.tool import ToolDefinition

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.orchestrator.delegate_tool import (
        RotarisDelegateAction,
        RotarisDelegateObservation,
    )

_log = logging.getLogger(__name__)

# Registration is unconditional and idempotent. Every factory below reads its
# run's state at *resolve* time from the binding key in ``Tool.params``, so
# re-registering installs an identical factory — and re-asserts Rotaris' claim
# on a name the SDK's own import may otherwise hold, which is the only ordering
# that reliably wins.
#
# There used to be a memoization key per registrar (workspace root, config
# identity), because the factories closed over those. That key was itself a way
# for one run to poison another: run B's registration was *skipped* when run A's
# key matched, leaving B's agents resolving A's factory (SWR-2426).
#: What a tool falls back to when its ``Tool`` spec has no live binding — a
#: conversation resumed after a restart, say.  Written by registration, read
#: only when an exact binding lookup finds nothing, and never used to decide
#: anything for an agent whose own binding is present.
_fallback_config: RotarisConfig | None = None
#: Split in two because the registrars know different halves: all three record
#: the workspace root they were called for, and only the file tools know which
#: extra roots may additionally be read. One combined value let whichever
#: registrar ran last erase the other's half.
_fallback_root: Any = None
_fallback_extra_read_roots: tuple[Any, ...] = ()

#: Engines are cached by the root they were built for, not by run: two runs
#: sharing a workspace share the read-before-write ledger and undo stacks they
#: always shared, and two runs in different worktrees no longer can.
_engines_lock = RLock()
_engines: dict[tuple[str, Any], Any] = {}

# Binding key used by agents created without child context (the entry agent).
ROOT_BINDING_KEY = "__root__"


@dataclass(frozen=True)
class RuntimeToolBinding:
    """Non-serialisable runtime dependencies for one agent's tools.

    The SDK tool registry is process-global and resolves a ``Tool`` spec only
    when its conversation initialises, which is long after the agent was built.
    Anything captured in a factory closure therefore belongs to whichever agent
    registered *last*, not to the agent that calls the tool.  Identity that is
    JSON-safe travels in ``Tool.params`` instead; everything here is looked up
    at resolve time via the ``binding_key`` carried in those same params.
    """

    artifact_store: Any = None
    child_manager: Any = None
    scheduler: Any = None
    agent_factory: Any = None
    todo_state_callback: Any = None
    #: ``(probe_executor, gate_write_executor)`` for a gate-authoring run
    #: (SWR-2614). Both are bound to one workspace, which is exactly why they
    #: travel here rather than in a factory closure: the registry is
    #: process-global, and a closure would hand the last run's workspace to
    #: whichever agent resolved next.
    gate_tools: Any = None
    #: The configuration this agent's run launched with.  Parallel runs share
    #: one process and one tool registry, so the last run to build an agent
    #: used to own ``terminal`` and ``fetch`` for *every* run — handing one
    #: run's sandbox spec (SWR-2507) and egress policy (SWR-2505) to another's
    #: commands.  Resolved per call instead, from the key in ``Tool.params``.
    config: Any = None
    #: Where ``ask_questions`` puts a question and how long it waits. Bound the
    #: same way and for the same reason: a barrier belongs to one run, and a
    #: closure would post one run's question to another run's user.
    user_prompt_barrier: Any = None
    on_questions_stored: Any = None
    response_timeout: float = 300.0
    #: The directory this run's file tools may reach, and the extra roots it may
    #: additionally read. A run isolated into an SWR-2404 worktree has a
    #: genuinely different root from one in the main checkout, so a factory that
    #: closed over this decided the file boundary by registration order.
    workspace_root: Any = None
    extra_read_roots: tuple[Any, ...] = ()


_bindings_lock = RLock()
_runtime_bindings: dict[str, RuntimeToolBinding] = {}
_last_runtime_binding: RuntimeToolBinding | None = None


@traces(SWR.SWR_2426)
def register_runtime_binding(key: str, binding: RuntimeToolBinding) -> None:
    """Publish one agent's runtime dependencies under its binding key."""
    global _last_runtime_binding  # noqa: PLW0603

    with _bindings_lock:
        _runtime_bindings[key] = binding
        _last_runtime_binding = binding


@traces(SWR.SWR_2426)
def resolve_runtime_binding(key: str | None) -> RuntimeToolBinding:
    """Return the binding for ``key``, falling back to the most recent one.

    A missing key means the ``Tool`` spec outlived its binding — a conversation
    resumed from disk after the process restarted, say.  Falling back to the
    most recent binding keeps that conversation alive instead of failing it over
    an attribution problem, but the fallback is only *unambiguous* while one run
    holds the process. With two live runs the most recent binding is a coin
    toss, so the lookup raises rather than guessing which user is waiting and
    which workspace is meant.
    """
    with _bindings_lock:
        if key is not None:
            binding = _runtime_bindings.get(key)
            if binding is not None:
                return binding
        live = len(_runtime_bindings)
        fallback = _last_runtime_binding
    if fallback is None:
        return RuntimeToolBinding()
    if live > 1:
        raise LookupError(
            f"No runtime tool binding for {key!r}, and {live} are live. Refusing to "
            "guess which run this tool call belongs to."
        )
    _log.warning(
        "No runtime tool binding for key %r; falling back to the most recent binding. "
        "Tool identity may be attributed to the wrong agent.",
        key,
    )
    return fallback


@traces(SWR.SWR_2426)
def lookup_runtime_binding(key: str | None) -> RuntimeToolBinding | None:
    """The binding for *key*, or ``None`` — never another agent's.

    :func:`resolve_runtime_binding` falls back to the most recently registered
    binding, which is right for a dependency that would otherwise be missing
    altogether. It is wrong for anything a *policy* is read from: handing a
    stale key the last run's sandbox spec is exactly the confusion this module
    exists to prevent, so those callers ask here and keep their own default.
    """
    if key is None:
        return None
    with _bindings_lock:
        return _runtime_bindings.get(key)


@traces(SWR.SWR_2426)
def discard_runtime_binding(key: str | None) -> None:
    """Drop a binding once its agent is done, so long runs do not accumulate them."""
    if key is None:
        return
    with _bindings_lock:
        _runtime_bindings.pop(key, None)


@traces(SWR.SWR_2426)
def build_binding_key(
    runtime_kwargs: dict[str, Any] | None,
    persona_name: str | None = None,
) -> str:
    """Derive a deterministic, JSON-safe binding key for one agent.

    Deterministic so that an agent rebuilt for the same child (fallback model,
    quota retry, resume) re-registers under the key its persisted ``Tool``
    specs already carry.

    Agents built without child context fall back to their persona name, so a
    parent's binding is neither clobbered nor inherited by a child created
    without runtime context (SWR-557).
    """
    canonical_name = (runtime_kwargs or {}).get("child_canonical_name")
    scope = canonical_name or persona_name or ROOT_BINDING_KEY
    session_id = (runtime_kwargs or {}).get("session_id")
    if session_id:
        return f"{session_id}/{scope}"
    return str(scope)


@traces(SWR.SWR_2426)
def identity_params(persona_name: str, runtime_kwargs: dict[str, Any] | None) -> dict[str, Any]:
    """Build the JSON-safe ``Tool.params`` payload identifying the calling agent.

    Only strings go in here: ``ConversationState.model_dump_json()`` walks the
    agent spec, so a live object in ``params`` would break persistence.
    """
    params: dict[str, Any] = {
        "persona": persona_name,
        "binding_key": build_binding_key(runtime_kwargs, persona_name),
    }
    if runtime_kwargs:
        canonical_name = runtime_kwargs.get("child_canonical_name")
        if canonical_name:
            params["canonical_name"] = str(canonical_name)
        task_id = runtime_kwargs.get("child_task_id")
        if task_id:
            params["task_id"] = str(task_id)
    return params


@contextmanager
def _suppress_registry_duplicate_log() -> Any:
    """Temporarily raise the SDK registry logger to ERROR to silence expected duplicate warnings."""
    import logging as _logging

    _reg_logger = _logging.getLogger("openhands.sdk.tool.registry")
    old_level = _reg_logger.level
    _reg_logger.setLevel(_logging.ERROR)
    try:
        yield
    finally:
        _reg_logger.setLevel(old_level)


def _register_tool_factory(name: str, factory: Any) -> None:
    """Register a runtime-bound factory through the SDK's ToolDefinition API."""
    from openhands.sdk.tool import register_tool
    from openhands.sdk.tool.tool import ToolDefinition

    class RuntimeToolSet(ToolDefinition[Any, Any]):
        @classmethod
        def create(
            cls,
            conv_state: object = None,
            **params: Any,
        ) -> Sequence[RuntimeToolSet]:
            del cls
            return cast("Sequence[RuntimeToolSet]", factory(conv_state=conv_state, **params))

    RuntimeToolSet.__name__ = f"{name.title().replace('_', '')}RuntimeToolSet"
    register_tool(name, RuntimeToolSet)


@traces(SWR.SWR_666, SWR.SWR_2426)
def _register_haet_tool_factories(workspace_root: Any) -> None:
    """Register HAET tool factories that inject HAETEngine.

    *workspace_root* is only the fallback for a spec with no live binding: the
    engine each call gets is built for the root of the run whose agent is
    resolving the tool, because a factory that closed over one root handed it to
    every run in the process (SWR-2426).
    """
    global _fallback_root  # noqa: PLW0603

    _fallback_root = workspace_root

    from rotaris_core.haet.engine import HAETEngine
    from rotaris_core.haet.tool import (
        _HAET_EDIT_DESCRIPTION,
        _HAET_READ_DESCRIPTION,
        HAETEditAction,
        HAETEditExecutor,
        HAETEditObservation,
        HAETEditTool,
        HAETReadAction,
        HAETReadExecutor,
        HAETReadObservation,
        HAETReadTool,
    )

    def _engine_for(binding_key: object) -> Any:
        root, _extra = _run_roots(binding_key)
        return _cached_engine("haet", str(root), lambda: HAETEngine(root))

    def _haet_read_factory(
        conv_state: object = None,
        **params: Any,
    ) -> Sequence[ToolDefinition[HAETReadAction, HAETReadObservation]]:
        del conv_state
        executor = HAETReadExecutor(_engine_for(params.get("binding_key")))
        return [
            HAETReadTool(
                description=_HAET_READ_DESCRIPTION,
                action_type=HAETReadAction,
                observation_type=HAETReadObservation,
                executor=executor,
            ),
        ]

    def _haet_edit_factory(
        conv_state: object = None,
        **params: Any,
    ) -> Sequence[ToolDefinition[HAETEditAction, HAETEditObservation]]:
        del conv_state
        executor = HAETEditExecutor(_engine_for(params.get("binding_key")))
        return [
            HAETEditTool(
                description=_HAET_EDIT_DESCRIPTION,
                action_type=HAETEditAction,
                observation_type=HAETEditObservation,
                executor=executor,
            ),
        ]

    _register_tool_factory("haet_read", _haet_read_factory)
    _register_tool_factory("read", _haet_read_factory)
    _register_tool_factory("haet_edit", _haet_edit_factory)


@traces(SWR.SWR_660)
def _register_file_tool_factories(
    workspace_root: Any,
    *,
    extra_read_roots: Sequence[Any] = (),
) -> None:
    """Register factories for ReadFileTool and WriteFileTool.

    Both tools share a single ``FileToolEngine`` per workspace root, so that the
    read-before-write ledger and undo stacks are consistent across calls.

    The roots here are the fallback for a spec with no live binding. Which tree
    a call may actually touch is resolved per call from the calling agent's
    binding, because two runs in one process can sit in different worktrees
    (SWR-2404) and a closure would give both of them whichever registered last.
    """
    global _fallback_root, _fallback_extra_read_roots  # noqa: PLW0603

    from pathlib import Path as _Path

    root_path = _Path(workspace_root).resolve()
    extra_root_paths = tuple(_Path(root).resolve() for root in extra_read_roots)
    _fallback_root = root_path
    _fallback_extra_read_roots = extra_root_paths

    from rotaris_core.tools.file_engine import FileToolEngine
    from rotaris_core.tools.file_read import (
        _READ_FILE_DESCRIPTION,
        ReadFileAction,
        ReadFileExecutor,
        ReadFileObservation,
        ReadFileTool,
    )
    from rotaris_core.tools.file_write import (
        _WRITE_FILE_DESCRIPTION,
        WriteFileAction,
        WriteFileExecutor,
        WriteFileObservation,
        WriteFileTool,
    )

    def _engine_for(binding_key: object) -> Any:
        root, extra = _run_roots(binding_key)
        resolved = _Path(root).resolve()
        resolved_extra = tuple(_Path(entry).resolve() for entry in extra)
        return _cached_engine(
            "file",
            (str(resolved), tuple(str(entry) for entry in resolved_extra)),
            lambda: FileToolEngine(resolved, extra_read_roots=resolved_extra),
        )

    def _read_file_factory(
        conv_state: object = None,
        **params: Any,
    ) -> Sequence[ToolDefinition[ReadFileAction, ReadFileObservation]]:
        del conv_state
        executor = ReadFileExecutor(_engine_for(params.get("binding_key")))
        return [
            ReadFileTool(
                description=_READ_FILE_DESCRIPTION,
                action_type=ReadFileAction,
                observation_type=ReadFileObservation,
                executor=executor,
            ),
        ]

    def _write_file_factory(
        conv_state: object = None,
        **params: Any,
    ) -> Sequence[ToolDefinition[WriteFileAction, WriteFileObservation]]:
        del conv_state
        executor = WriteFileExecutor(_engine_for(params.get("binding_key")))
        return [
            WriteFileTool(
                description=_WRITE_FILE_DESCRIPTION,
                action_type=WriteFileAction,
                observation_type=WriteFileObservation,
                executor=executor,
            ),
        ]

    _register_tool_factory("read_file", _read_file_factory)
    _register_tool_factory("write_file", _write_file_factory)


@traces(SWR.SWR_2426)
def _register_grep_glob_tool_factories(workspace_root: Any) -> None:
    """Register factories for GrepTool and GlobTool.

    The searched tree is resolved per call from the calling agent's binding, so
    one run cannot search another's worktree; *workspace_root* is the fallback
    for a spec whose binding is gone.
    """
    global _fallback_root  # noqa: PLW0603

    from pathlib import Path as _Path

    _fallback_root = _Path(workspace_root).resolve()

    from rotaris_core.tools.search import (
        GlobAction,
        GlobExecutor,
        GlobObservation,
        GlobTool,
        GrepAction,
        GrepExecutor,
        GrepObservation,
        GrepTool,
    )

    def _root_for(binding_key: object) -> Any:
        root, _extra = _run_roots(binding_key)
        return _Path(root).resolve()

    def _grep_factory(
        conv_state: object = None,
        **params: Any,
    ) -> Sequence[ToolDefinition[GrepAction, GrepObservation]]:
        del conv_state
        return [
            GrepTool(
                description=(
                    "Search file contents for a regular-expression pattern within the workspace. "
                    "Returns matching lines as 'file:line:content' entries. "
                    "Optionally restrict the search to specific paths or glob patterns "
                    "via 'paths'. "
                    "Default max_matches: 100."
                ),
                action_type=GrepAction,
                observation_type=GrepObservation,
                executor=GrepExecutor(_root_for(params.get("binding_key"))),
            ),
        ]

    def _glob_factory(
        conv_state: object = None,
        **params: Any,
    ) -> Sequence[ToolDefinition[GlobAction, GlobObservation]]:
        del conv_state
        return [
            GlobTool(
                description=(
                    "List workspace files matching a glob pattern (e.g. '**/*.py', 'src/**/*.ts'). "
                    "Optionally restrict to a subdirectory with 'base_path'. "
                    "Returns one relative file path per line, sorted alphabetically."
                ),
                action_type=GlobAction,
                observation_type=GlobObservation,
                executor=GlobExecutor(_root_for(params.get("binding_key"))),
            ),
        ]

    with _suppress_registry_duplicate_log():
        _register_tool_factory("grep", _grep_factory)
        _register_tool_factory("glob", _glob_factory)


# Suppress the benign "Duplicate tool name registered" warning the SDK registry
# emits when grep/glob are re-registered. Re-registration is now the norm rather
# than an accident — every agent build re-asserts these factories, and each one
# is identical because the searched root is resolved per call.
cast("Any", _register_grep_glob_tool_factories).__wrapped__ = _register_grep_glob_tool_factories


def _register_grep_glob_tool_factories_silenced(workspace_root: Any) -> None:
    """Silenced wrapper: same behaviour but suppresses SDK duplicate warnings."""
    with _suppress_registry_duplicate_log():
        _register_grep_glob_tool_factories(workspace_root)


@traces(SWR.SWR_3618)
def _split_binding_key(binding_key: object) -> tuple[str, str]:
    """Split ``"<session>/<scope>"`` back into its two halves.

    A binding key built without session context is just a scope, and a terminal
    with no session cannot be streamed anywhere — so that case yields an empty
    session id, which switches streaming off rather than guessing.
    """
    text = str(binding_key or "")
    if "/" not in text:
        return "", text
    session_id, _, scope = text.partition("/")
    return session_id, scope


@traces(SWR.SWR_2426)
def _run_config(binding_key: object) -> RotarisConfig:
    """The configuration of the run whose agent is resolving this tool.

    An *exact* binding or nothing: a key nobody registered must not be served
    another run's sandbox spec, which is what the general fallback would do.
    The registration-time config is kept only for a ``Tool`` spec that outlived
    its binding — a conversation resumed after a restart — because refusing to
    build the tool would fail that conversation over an attribution problem.
    """
    binding = lookup_runtime_binding(str(binding_key) if binding_key is not None else None)
    bound = binding.config if binding is not None else None
    if bound is not None:
        return cast("RotarisConfig", bound)
    if _fallback_config is None:
        raise LookupError(
            f"No runtime tool binding for {binding_key!r} and no configuration to fall "
            "back on; the tool cannot know which run it belongs to."
        )
    return _fallback_config


@traces(SWR.SWR_2426)
def _run_roots(binding_key: object) -> tuple[Any, tuple[Any, ...]]:
    """The workspace root and extra read roots of the calling agent's run.

    The file, HAET and search tools all answer "may this path be touched" from
    this pair, so it is the one piece of run state that must never come from a
    neighbour: with SWR-2404 isolation on, run A's root is a worktree run B
    cannot see, and swapping them is a silent escape rather than an error.
    """
    binding = lookup_runtime_binding(str(binding_key) if binding_key is not None else None)
    if binding is not None and binding.workspace_root is not None:
        return binding.workspace_root, tuple(binding.extra_read_roots)
    if _fallback_root is None:
        raise LookupError(
            f"No runtime tool binding for {binding_key!r} and no workspace root to fall "
            "back on; the tool cannot know which tree it may touch."
        )
    return _fallback_root, _fallback_extra_read_roots


def _cached_engine(kind: str, key: Any, build: Callable[[], Any]) -> Any:
    """One engine per (tool family, resolved root), built on first use.

    The read-before-write ledger and undo stacks have to survive across calls,
    which is why these are not rebuilt per resolve — and why they are keyed by
    the root rather than by the run: two runs in one workspace shared a ledger
    before this module resolved roots per call, and still should.
    """
    with _engines_lock:
        engine = _engines.get((kind, key))
        if engine is None:
            engine = build()
            _engines[(kind, key)] = engine
        return engine


@traces(SWR.SWR_2426, SWR.SWR_2507)
def _register_terminal_tool_factory(config: RotarisConfig) -> None:
    """Register a factory for the hardened terminal tool with runtime defaults.

    *config* is the fallback only. A ``Tool`` spec that still has its binding
    resolves its own run's configuration below, because the registry is
    process-global: with two runs in one process the closure here belongs to
    whichever run built an agent last, and a command would otherwise be
    sandboxed — or not — according to the wrong run's settings (SWR-2507).
    """
    global _fallback_config  # noqa: PLW0603

    _fallback_config = config

    from rotaris_core.tools.terminal import HardenedTerminalTool

    def _factory(conv_state: object = None, **params: Any) -> Sequence[ToolDefinition[Any, Any]]:
        if conv_state is None:
            raise ValueError("terminal tool factory requires conversation state")
        state = cast("ConversationState", conv_state)
        # The binding key already carries both halves the live terminal stream
        # needs (SWR-3618): which run to publish under, and which agent's
        # terminal this is, so two agents' commands never share one stream.
        binding_key = params.get("binding_key")
        stream_session_id, stream_key = _split_binding_key(binding_key)
        run_config = _run_config(binding_key)
        # Resolved here rather than at registration time so the writable root is
        # the directory this conversation actually runs in — the SWR-2404
        # worktree when isolation is on, the workspace itself otherwise.
        from rotaris_core.sandbox.session import ensure_sandbox_available, resolve_sandbox_spec

        spec = resolve_sandbox_spec(run_config, state.workspace.working_dir)
        # ``ensure_sandbox_available`` raises rather than returning a passthrough
        # backend, so a session that asked for a sandbox it cannot have fails to
        # start with the backend's own remediation instead of quietly running
        # its commands on the host (SWR-2507).
        backend = None if spec is None else ensure_sandbox_available(spec)
        runtime = run_config.runtime
        stream_hub = None
        if runtime.terminal_stream_enabled and stream_session_id:
            from rotaris_core.terminal_stream.hub import default_hub

            stream_hub = default_hub()
            stream_hub.set_buffer_bytes(runtime.terminal_stream_buffer_kb * 1024)

        return HardenedTerminalTool.create(
            conv_state=state,
            default_timeout_seconds=float(runtime.shell_timeout),
            max_background_sessions=runtime.shell_max_background_sessions,
            background_default_timeout=float(runtime.shell_background_timeout),
            sandbox_spec=spec,
            sandbox_backend=backend,
            stream_hub=stream_hub,
            stream_session_id=stream_session_id,
            stream_key=stream_key,
            stream_interval_s=runtime.terminal_stream_interval_ms / 1000.0,
        )

    with _suppress_registry_duplicate_log():
        _register_tool_factory("terminal", _factory)


def _register_fetch_tool_factory(config: RotarisConfig) -> None:
    """Register a factory for FetchTool with runtime defaults."""
    global _fallback_config  # noqa: PLW0603

    _fallback_config = config

    from rotaris_core.permissions.network import NetworkEgressPolicy
    from rotaris_core.tools.fetch import (
        _FETCH_TOOL_DESCRIPTION,
        FetchAction,
        FetchExecutor,
        FetchObservation,
        FetchTool,
    )

    def _factory(
        conv_state: object = None,
        **params: Any,
    ) -> Sequence[ToolDefinition[FetchAction, FetchObservation]]:
        del conv_state
        run_config = _run_config(params.get("binding_key"))
        # SWR-2505: without this the executor falls back to its permissive
        # default and the configured host lists are never enforced on a real
        # run. Built per call, from the calling run's own config: one process
        # can hold two runs, and an allow-list is not lent between them.
        egress_policy = NetworkEgressPolicy.from_runtime(run_config.runtime)
        return [
            FetchTool(
                description=_FETCH_TOOL_DESCRIPTION,
                action_type=FetchAction,
                observation_type=FetchObservation,
                executor=FetchExecutor(
                    timeout=float(run_config.runtime.tool_timeout),
                    egress_policy=egress_policy,
                ),
            ),
        ]

    with _suppress_registry_duplicate_log():
        _register_tool_factory("fetch", _factory)


@traces(SWR.SWR_2426)
def _register_ask_questions_tool_factory() -> None:
    """Register an AskQuestionsTool factory that finds its own run's barrier.

    A barrier belongs to one run and one waiting person. The registry does not:
    with two runs in a process, a closure here would post the second run's
    question to the first run's user, and wait on a barrier nobody is watching.
    """
    from rotaris_core.tools.ask_questions import (
        AskQuestionsAction,
        AskQuestionsObservation,
        AskQuestionsTool,
    )

    def _factory(
        conv_state: object = None,
        **params: Any,
    ) -> Sequence[ToolDefinition[AskQuestionsAction, AskQuestionsObservation]]:
        del conv_state
        binding = resolve_runtime_binding(params.get("binding_key"))
        return AskQuestionsTool.create(
            user_prompt_barrier=binding.user_prompt_barrier,
            on_questions_stored=binding.on_questions_stored,
            response_timeout=binding.response_timeout,
        )

    with _suppress_registry_duplicate_log():
        _register_tool_factory("ask_questions", _factory)


@traces(SWR.SWR_2614)
def register_gate_tool_factories() -> None:
    """Register the gatekeeper's two internal tools (SWR-2614).

    Called by the gate-authoring run rather than by persona construction, because
    these are the only tools no persona may *declare*: they are absent from
    ``TOOL_NAME_MAP``, so no configuration can reach them, and they are attached
    to one agent for the length of one authoring turn.

    The executors come from the resolving agent's binding, not from this closure,
    so two workspaces authoring at once cannot end up writing each other's gates.
    """
    from rotaris_core.tools.gate_tools import (
        GATE_WRITE_TOOL_NAME,
        PROBE_TOOL_NAME,
        VerifierGateWriteTool,
        VerifierProbeTool,
    )

    def _executors(params: dict[str, Any]) -> tuple[Any, Any]:
        binding = resolve_runtime_binding(params.get("binding_key"))
        pair = binding.gate_tools
        if not isinstance(pair, tuple) or len(pair) != 2:
            raise RuntimeError(
                "the gate tools resolved without their executors; a gate-authoring "
                "run must register them on its binding first (SWR-2614)",
            )
        return pair

    def _probe(conv_state: object = None, **params: Any) -> Sequence[Any]:
        del conv_state
        return VerifierProbeTool.create(executor=_executors(params)[0])

    def _write(conv_state: object = None, **params: Any) -> Sequence[Any]:
        del conv_state
        return VerifierGateWriteTool.create(executor=_executors(params)[1])

    with _suppress_registry_duplicate_log():
        _register_tool_factory(PROBE_TOOL_NAME, _probe)
        _register_tool_factory(GATE_WRITE_TOOL_NAME, _write)


@traces(SWR.SWR_2426)
def _register_todo_tool_factory() -> None:
    """Register a TodoTool factory that fires the resolving agent's callback.

    The callback is per-child (it captures that child's record), so it lives in
    the agent's :class:`RuntimeToolBinding` rather than in this closure — two
    siblings created in the same scheduler pass would otherwise both fire the
    last one's callback and report each other's todo state (SWR-2426).
    """
    from rotaris_core.tools.todo import (
        _TODO_TOOL_DESCRIPTION,
        TodoAction,
        TodoExecutor,
        TodoObservation,
        TodoTool,
    )

    def _factory(
        conv_state: object = None,
        **params: Any,
    ) -> Sequence[ToolDefinition[TodoAction, TodoObservation]]:
        del conv_state
        binding = resolve_runtime_binding(params.get("binding_key"))
        return [
            TodoTool(
                description=_TODO_TOOL_DESCRIPTION,
                action_type=TodoAction,
                observation_type=TodoObservation,
                executor=TodoExecutor(on_state_change=binding.todo_state_callback),
            ),
        ]

    with _suppress_registry_duplicate_log():
        _register_tool_factory("todo", _factory)


@traces(SWR.SWR_2426)
def _register_delegate_tool_factory() -> None:
    """Register a factory for RotarisDelegateTool.

    Runtime dependencies (child_manager, scheduler, agent_factory) and the
    delegating agent's own canonical name come from the resolving ``Tool``'s
    binding and params, not from a closure, so parallel agents cannot inherit
    each other's parentage (SWR-2426).  The ``Tool.params`` dict holds only
    strings so ``ConversationState.model_dump_json()`` never attempts to
    serialise non-JSON-safe objects.
    """
    from rotaris_core.orchestrator.delegate_tool import (
        _DELEGATE_TOOL_DESCRIPTION,
        RotarisDelegateAction,
        RotarisDelegateExecutor,
        RotarisDelegateObservation,
        RotarisDelegateTool,
    )

    def _factory(
        conv_state: object = None,
        **params: Any,
    ) -> Sequence[ToolDefinition[RotarisDelegateAction, RotarisDelegateObservation]]:
        del conv_state
        binding = resolve_runtime_binding(params.get("binding_key"))
        return [
            RotarisDelegateTool(
                description=_DELEGATE_TOOL_DESCRIPTION,
                action_type=RotarisDelegateAction,
                observation_type=RotarisDelegateObservation,
                executor=RotarisDelegateExecutor(
                    binding.child_manager,
                    binding.scheduler,
                    binding.agent_factory,
                    parent_canonical_name=params.get("canonical_name"),
                ),
            ),
        ]

    with _suppress_registry_duplicate_log():
        _register_tool_factory("delegate", _factory)


@traces(SWR.SWR_2426)
def _register_background_output_tool_factory() -> None:
    """Register the background_output tool bound to the resolving agent's child_manager."""
    from rotaris_core.tools.background_output import (
        _BACKGROUND_OUTPUT_TOOL_DESCRIPTION,
        BackgroundOutputAction,
        BackgroundOutputExecutor,
        BackgroundOutputObservation,
        BackgroundOutputTool,
    )

    def _factory(
        conv_state: object = None,
        **params: Any,
    ) -> Sequence[ToolDefinition[BackgroundOutputAction, BackgroundOutputObservation]]:
        del conv_state
        binding = resolve_runtime_binding(params.get("binding_key"))
        return [
            BackgroundOutputTool(
                description=_BACKGROUND_OUTPUT_TOOL_DESCRIPTION,
                action_type=BackgroundOutputAction,
                observation_type=BackgroundOutputObservation,
                executor=BackgroundOutputExecutor(
                    binding.child_manager,
                    parent_canonical_name=params.get("canonical_name") or params.get("persona"),
                ),
            ),
        ]

    with _suppress_registry_duplicate_log():
        _register_tool_factory("background_output", _factory)


@traces(SWR.SWR_2426)
def _register_wait_for_tasks_tool_factory() -> None:
    """Register the wait_for_tasks tool bound to the resolving agent's own task id.

    ``current_task_id`` is what keeps an agent from waiting on itself, so it has
    to be the caller's task id rather than the last-registered agent's
    (SWR-2426).
    """
    from rotaris_core.tools.wait_for_tasks import (
        _WAIT_FOR_TASKS_TOOL_DESCRIPTION,
        WaitForTasksAction,
        WaitForTasksExecutor,
        WaitForTasksObservation,
        WaitForTasksTool,
    )

    def _factory(
        conv_state: object = None,
        **params: Any,
    ) -> Sequence[ToolDefinition[WaitForTasksAction, WaitForTasksObservation]]:
        del conv_state
        binding = resolve_runtime_binding(params.get("binding_key"))
        return [
            WaitForTasksTool(
                description=_WAIT_FOR_TASKS_TOOL_DESCRIPTION,
                action_type=WaitForTasksAction,
                observation_type=WaitForTasksObservation,
                executor=WaitForTasksExecutor(
                    binding.child_manager,
                    current_task_id=params.get("task_id"),
                    parent_canonical_name=params.get("canonical_name") or params.get("persona"),
                ),
            ),
        ]

    with _suppress_registry_duplicate_log():
        _register_tool_factory("wait_for_tasks", _factory)


@traces(SWR.SWR_2426)
def _register_artifact_tool_factories() -> None:
    """Register artifact tool factories that resolve their agent from ``Tool.params``.

    The factories hold no per-agent state: identity comes from the resolving
    ``Tool``'s params and the store/child-manager from that agent's
    :class:`RuntimeToolBinding`.  Registering per-agent state here instead would
    hand every sibling the last-created agent's identity (SWR-2426).

    ``artifact_write`` is registered unconditionally; whether a persona may
    publish is decided when its tool spec list is built in ``agents/factory.py``.
    """
    from rotaris_core.tools.artifacts import (
        _ARTIFACT_LIST_DESCRIPTION,
        _ARTIFACT_READ_DESCRIPTION,
        _ARTIFACT_WRITE_DESCRIPTION,
        ArtifactListAction,
        ArtifactListExecutor,
        ArtifactListObservation,
        ArtifactListTool,
        ArtifactReadAction,
        ArtifactReadExecutor,
        ArtifactReadObservation,
        ArtifactReadTool,
        ArtifactWriteAction,
        ArtifactWriteExecutor,
        ArtifactWriteObservation,
        ArtifactWriteTool,
    )

    def _read_factory(
        conv_state: object = None,
        **params: Any,
    ) -> Sequence[ToolDefinition[ArtifactReadAction, ArtifactReadObservation]]:
        del conv_state
        binding = resolve_runtime_binding(params.get("binding_key"))
        return [
            ArtifactReadTool(
                description=_ARTIFACT_READ_DESCRIPTION,
                action_type=ArtifactReadAction,
                observation_type=ArtifactReadObservation,
                executor=ArtifactReadExecutor(binding.artifact_store, params.get("persona")),
            ),
        ]

    def _list_factory(
        conv_state: object = None,
        **params: Any,
    ) -> Sequence[ToolDefinition[ArtifactListAction, ArtifactListObservation]]:
        del conv_state
        binding = resolve_runtime_binding(params.get("binding_key"))
        return [
            ArtifactListTool(
                description=_ARTIFACT_LIST_DESCRIPTION,
                action_type=ArtifactListAction,
                observation_type=ArtifactListObservation,
                executor=ArtifactListExecutor(binding.artifact_store),
            ),
        ]

    def _write_factory(
        conv_state: object = None,
        **params: Any,
    ) -> Sequence[ToolDefinition[ArtifactWriteAction, ArtifactWriteObservation]]:
        del conv_state
        binding = resolve_runtime_binding(params.get("binding_key"))
        return [
            ArtifactWriteTool(
                description=_ARTIFACT_WRITE_DESCRIPTION,
                action_type=ArtifactWriteAction,
                observation_type=ArtifactWriteObservation,
                executor=ArtifactWriteExecutor(
                    binding.artifact_store,
                    params.get("persona") or "unknown",
                    child_manager=binding.child_manager,
                    canonical_name=params.get("canonical_name"),
                    task_id=params.get("task_id"),
                ),
            ),
        ]

    with _suppress_registry_duplicate_log():
        _register_tool_factory("artifact_read", _read_factory)
        _register_tool_factory("artifact_list", _list_factory)
        _register_tool_factory("artifact_write", _write_factory)
