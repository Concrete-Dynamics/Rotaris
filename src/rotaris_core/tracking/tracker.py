from __future__ import annotations

import threading
from collections import Counter
from dataclasses import dataclass, field

from rotaris_core.cost import CostSnapshot
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tokens import TokenSnapshot


@dataclass
class AgentTrackingData:
    """Tracking data for a specific agent."""

    tokens: TokenSnapshot = field(default_factory=TokenSnapshot)
    cost: CostSnapshot = field(default_factory=CostSnapshot)
    tool_calls: Counter[str] = field(default_factory=Counter)
    compressions: int = 0
    last_prompt_tokens: int = 0

    def merge(self, other: AgentTrackingData) -> AgentTrackingData:
        """Merge another agent's tracking data into this one."""
        return AgentTrackingData(
            tokens=self.tokens.merge(other.tokens),
            cost=self.cost.merge(other.cost),
            tool_calls=self.tool_calls + other.tool_calls,
            compressions=self.compressions + other.compressions,
            last_prompt_tokens=max(self.last_prompt_tokens, other.last_prompt_tokens),
        )


@traces(SWR.SWR_1546)
class GlobalTracker:
    """A singleton tracker that maintains global and per-agent usage statistics.
    Thread-safe for concurrent updates.
    """

    _instance: GlobalTracker | None = None
    _lock = threading.Lock()
    _initialized: bool = False

    def __new__(cls) -> GlobalTracker:
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
            return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        self._lock = threading.Lock()
        self._global_tokens = TokenSnapshot()
        self._global_cost = CostSnapshot()
        self._global_tool_calls: Counter[str] = Counter()
        self._global_compressions = 0
        self._agent_data: dict[str, AgentTrackingData] = {}
        # Per-agent seen compression IDs for exact-once dedup (key: agent_name).
        self._seen_compression_ids: dict[str, set[str]] = {}

    def track_token_usage(self, agent_name: str | None, snapshot: TokenSnapshot) -> None:
        """Record token usage for an agent or globally."""
        with self._lock:
            self._global_tokens = self._global_tokens.merge(snapshot)
            if agent_name:
                if agent_name not in self._agent_data:
                    self._agent_data[agent_name] = AgentTrackingData()
                self._agent_data[agent_name].tokens = self._agent_data[agent_name].tokens.merge(
                    snapshot,
                )

    def set_agent_tokens(self, agent_name: str, snapshot: TokenSnapshot) -> None:
        """Replace the cumulative token snapshot for an agent.

        Use this when reading an accumulating metrics source (e.g. the OpenHands
        SDK ``LLM.metrics.accumulated_token_usage``) where each read already
        reflects the full running total for that agent. The global aggregate is
        recomputed from the sum of all per-agent snapshots so repeated calls do
        not double-count.
        """
        with self._lock:
            if agent_name not in self._agent_data:
                self._agent_data[agent_name] = AgentTrackingData()
            self._agent_data[agent_name].tokens = snapshot
            aggregate = TokenSnapshot()
            for data in self._agent_data.values():
                aggregate = aggregate.merge(data.tokens)
            self._global_tokens = aggregate

    @traces(SWR.SWR_835)
    def set_agent_cost(self, agent_name: str, snapshot: CostSnapshot) -> None:
        """Replace the cumulative usage-cost snapshot for an agent.

        Like :meth:`set_agent_tokens`, this replaces rather than merges:
        ``LLM.metrics.accumulated_cost`` is already a running total, so
        adding successive reads would double-count.
        """
        with self._lock:
            if agent_name not in self._agent_data:
                self._agent_data[agent_name] = AgentTrackingData()
            self._agent_data[agent_name].cost = snapshot
            aggregate = CostSnapshot()
            for data in self._agent_data.values():
                aggregate = aggregate.merge(data.cost)
            self._global_cost = aggregate

    def set_agent_last_prompt_tokens(self, agent_name: str, tokens: int) -> None:
        """Record the last known prompt-window size for an agent."""
        with self._lock:
            if agent_name not in self._agent_data:
                self._agent_data[agent_name] = AgentTrackingData()
            if tokens > self._agent_data[agent_name].last_prompt_tokens:
                self._agent_data[agent_name].last_prompt_tokens = tokens

    def track_tool_call(self, agent_name: str | None, tool_name: str) -> None:
        """Record a tool call for an agent or globally."""
        with self._lock:
            self._global_tool_calls[tool_name] += 1
            if agent_name:
                if agent_name not in self._agent_data:
                    self._agent_data[agent_name] = AgentTrackingData()
                self._agent_data[agent_name].tool_calls[tool_name] += 1

    def track_compression(self, agent_name: str | None) -> None:
        """Record a completed context compression for an agent or globally."""
        with self._lock:
            self._global_compressions += 1
            if agent_name:
                if agent_name not in self._agent_data:
                    self._agent_data[agent_name] = AgentTrackingData()
                self._agent_data[agent_name].compressions += 1

    def track_compression_completion(self, agent_name: str | None, completion_id: str) -> bool:
        """Record a completed context compression, deduplicating by completion_id.

        Returns True if this is a new (previously-unseen) compression, False if
        ``completion_id`` was already counted for ``agent_name`` (or globally when
        ``agent_name`` is None).  Callers may safely ignore the return value.
        """
        with self._lock:
            key = agent_name or ""
            seen = self._seen_compression_ids.setdefault(key, set())
            if completion_id in seen:
                return False
            seen.add(completion_id)
            self._global_compressions += 1
            if agent_name:
                if agent_name not in self._agent_data:
                    self._agent_data[agent_name] = AgentTrackingData()
                self._agent_data[agent_name].compressions += 1
            return True

    def get_global_tokens(self) -> TokenSnapshot:
        with self._lock:
            return self._global_tokens

    @traces(SWR.SWR_835)
    def get_global_cost(self) -> CostSnapshot:
        with self._lock:
            return self._global_cost

    def get_global_tool_calls(self) -> Counter[str]:
        with self._lock:
            return self._global_tool_calls.copy()

    def get_global_compressions(self) -> int:
        with self._lock:
            return self._global_compressions

    def get_seen_compression_ids(self) -> dict[str, set[str]]:
        """Return a copy of the per-agent (and anonymous-key "") seen compression ID sets."""
        with self._lock:
            return {k: set(v) for k, v in self._seen_compression_ids.items()}

    def get_agent_data(self, agent_name: str) -> AgentTrackingData | None:
        with self._lock:
            return self._agent_data.get(agent_name)

    def get_all_agent_names(self) -> list[str]:
        with self._lock:
            return list(self._agent_data.keys())

    def replace_state(
        self,
        *,
        global_tokens: TokenSnapshot | None = None,
        global_cost: CostSnapshot | None = None,
        global_tool_calls: Counter[str] | None = None,
        global_compressions: int = 0,
        agent_data: dict[str, AgentTrackingData] | None = None,
        seen_compression_ids: dict[str, set[str]] | None = None,
    ) -> None:
        """Replace the entire tracker state in one operation."""
        with self._lock:
            copied_agent_data: dict[str, AgentTrackingData] = {}
            for agent_name, data in (agent_data or {}).items():
                copied_agent_data[agent_name] = AgentTrackingData(
                    tokens=data.tokens.model_copy(),
                    cost=data.cost.model_copy(),
                    tool_calls=Counter(data.tool_calls),
                    compressions=data.compressions,
                    last_prompt_tokens=data.last_prompt_tokens,
                )

            self._agent_data = copied_agent_data
            self._global_tokens = (
                global_tokens.model_copy() if global_tokens is not None else TokenSnapshot()
            )
            self._global_cost = (
                global_cost.model_copy() if global_cost is not None else CostSnapshot()
            )
            self._global_tool_calls = Counter(global_tool_calls or {})
            self._global_compressions = global_compressions
            self._seen_compression_ids = (
                {k: set(v) for k, v in seen_compression_ids.items()}
                if seen_compression_ids is not None
                else {}
            )

    def has_activity(self) -> bool:
        with self._lock:
            return (
                self._global_tokens.total_tokens > 0
                or bool(self._global_tool_calls)
                or self._global_compressions > 0
                or bool(self._agent_data)
            )

    def reset(self) -> None:
        """Reset all tracking data."""
        with self._lock:
            self._global_tokens = TokenSnapshot()
            self._global_cost = CostSnapshot()
            self._global_tool_calls = Counter()
            self._global_compressions = 0
            self._agent_data = {}
            self._seen_compression_ids = {}
