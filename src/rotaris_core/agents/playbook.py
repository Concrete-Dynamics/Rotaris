"""Playbook resolution: persona x intent x model tier -> injected prompt sections.

Design authority: ``docs/architecture/prompt-composition-matrix.md`` (SWR-2416).

A *cell* selects exactly one variant per injectable slot. ``matrix.yaml`` holds the
selections, ``variants.yaml`` holds the texts. Nothing here invents prompt text: a
cell may only name catalogued variants.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.config.schema import RuntimePolicy

_log = logging.getLogger(__name__)

PLAYBOOKS_DIR = Path(__file__).resolve().parent / "prompts" / "playbooks"
MATRIX_FILE = PLAYBOOKS_DIR / "matrix.yaml"
VARIANTS_FILE = PLAYBOOKS_DIR / "variants.yaml"

#: Override sub-directory name inside each config scope (global and workspace).
PLAYBOOK_OVERRIDE_DIR_NAME = "playbooks"

#: Injectable slots, in render order.
SLOTS: tuple[str, ...] = (
    "ROUTE",
    "AUTONOMY",
    "RESEARCH",
    "CHUNKING",
    "VERIFY",
    "ARTIFACT",
    "OUTPUT",
    "BUDGET",
)

#: Slots that describe the *consumer* of a persona's output rather than the persona
#: itself. For a producer whose artifact is executed by someone else (the ``planner``),
#: these follow the consumer's tier — how work is cut and how the report is shaped is
#: only useful at the capacity of whoever has to act on it (docs §2.3).
CONSUMER_SLOTS: frozenset[str] = frozenset({"CHUNKING", "OUTPUT"})

#: Tier used when a persona's configured tier cannot be resolved. Downgrade, never
#: upgrade, on uncertainty (docs §5).
FALLBACK_TIER = "medium_model"

#: Hard ceilings each ``BUDGET`` variant imposes on the runtime policy.
#:
#: The prompt text tells the agent what its budget is; this makes the budget real.
#: Values clamp — they never raise a configured limit, so a workspace that already
#: runs tighter than `wide` keeps its own numbers.
BUDGET_LIMITS: dict[str, dict[str, int]] = {
    "tight": {"max_active_children": 2, "max_children": 6, "max_depth": 2},
    "normal": {"max_active_children": 4, "max_children": 12, "max_depth": 3},
    "wide": {},
}

#: Run-level overrides (docs §5, layer 4). Applied on top of a resolved cell and
#: explicitly declared to win over it, so a host-selected delegation strategy does not
#: silently contradict the matrix.
RUN_OVERRIDES: dict[str, str] = {
    "swarm": (
        "**Run override — swarm:** the user selected maximum parallelism for this run. "
        "Fan out independent work early across available specialists and keep dependencies "
        "explicit, even where the playbook above would keep the team smaller. Overlapping "
        "ownership of the same slice remains forbidden."
    ),
    "single": (
        "**Run override — single agent:** the user selected single-agent execution for this "
        "run. Complete the task yourself without delegating to child agents, even where the "
        "playbook above would delegate."
    ),
}

_TIER_KEYS = ("small_model", "medium_model", "large_model")
_WILDCARD = "_all"
_DEFAULT_KEY = "_default"


@dataclass(frozen=True, slots=True)
class PlaybookCell:
    """A resolved playbook cell for one persona in one run."""

    persona: str
    intent: str
    tier: str
    variants: dict[str, str] = field(default_factory=dict)
    routed: bool = True
    tier_resolved: bool = True
    #: ``"own"`` for every persona but the orchestrator, which keys on the
    #: implementation owner's tier; then this holds that persona's name.
    tier_source: str = "own"
    #: Tier the :data:`CONSUMER_SLOTS` were taken from, set only when a consumer
    #: ranks below this persona and therefore actually re-sized them; empty otherwise.
    consumer_tier: str = ""
    #: Persona that consumes this cell's output, set alongside ``consumer_tier``.
    consumer_source: str = ""
    consumer_tier_resolved: bool = True

    def as_dict(self) -> dict[str, Any]:
        """Audit payload recorded into ``state/run_config.json``."""
        return {
            "persona": self.persona,
            "intent": self.intent,
            "tier": self.tier,
            "tier_resolved": self.tier_resolved,
            "tier_source": self.tier_source,
            "consumer_tier": self.consumer_tier,
            "consumer_source": self.consumer_source,
            "consumer_tier_resolved": self.consumer_tier_resolved,
            "routed": self.routed,
            "variants": dict(self.variants),
        }


def _load_yaml(path: Path) -> dict[str, Any]:
    import yaml

    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"Playbook file {path} must be a YAML mapping")
    return data


def _override_dirs(workspace_root: str | None) -> list[Path]:
    """Override scopes, lowest priority first — same layering as ``agents.yaml``."""
    from rotaris_core.config.paths import GLOBAL_CONFIG_DIR

    dirs = [Path(GLOBAL_CONFIG_DIR) / PLAYBOOK_OVERRIDE_DIR_NAME]
    if workspace_root:
        dirs.append(Path(workspace_root) / ".rotaris" / PLAYBOOK_OVERRIDE_DIR_NAME)
    return dirs


def _deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    """Field-wise overlay merge; a mapping recurses, anything else replaces."""
    merged = dict(base)
    for key, value in overlay.items():
        existing = merged.get(key)
        if isinstance(existing, dict) and isinstance(value, dict):
            merged[key] = _deep_merge(existing, value)
        else:
            merged[key] = value
    return merged


def _load_layered(filename: str, workspace_root: str | None) -> dict[str, Any]:
    merged = _load_yaml(PLAYBOOKS_DIR / filename)
    for scope in _override_dirs(workspace_root):
        path = scope / filename
        if not path.is_file():
            continue
        try:
            merged = _deep_merge(merged, _load_yaml(path))
        except Exception as exc:  # noqa: BLE001
            _log.warning("Playbook override %s is unreadable (%s); ignoring it", path, exc)
    return merged


@lru_cache(maxsize=8)
@traces(SWR.SWR_2416)
def load_matrix(workspace_root: str | None = None) -> dict[str, Any]:
    """Load ``matrix.yaml``, overlaid with the global and workspace override scopes."""
    return _load_layered("matrix.yaml", workspace_root)


@lru_cache(maxsize=8)
@traces(SWR.SWR_2416)
def load_variants(workspace_root: str | None = None) -> dict[str, Any]:
    """Load ``variants.yaml``, overlaid with the global and workspace override scopes.

    Overrides may re-word a catalogued variant but may not introduce a new variant id or
    a new slot: a cell must always resolve against the shipped catalogue, so an unknown
    id is dropped with a warning rather than silently widening the vocabulary.
    """
    base = _load_yaml(PLAYBOOKS_DIR / "variants.yaml")
    merged = _load_layered("variants.yaml", workspace_root)
    base_slots = base.get("slots") or {}
    for slot, entry in list((merged.get("slots") or {}).items()):
        if slot not in base_slots:
            _log.warning("Playbook override adds unknown slot '%s'; dropping it", slot)
            del merged["slots"][slot]
            continue
        known = (base_slots[slot].get("variants") or {}).keys()
        for variant in list((entry.get("variants") or {}).keys()):
            if variant not in known:
                _log.warning(
                    "Playbook override adds unknown variant '%s' to slot '%s'; dropping it "
                    "(overrides may re-word variants, not add them)",
                    variant,
                    slot,
                )
                del merged["slots"][slot]["variants"][variant]
    return merged


def reload_playbooks() -> None:
    """Drop the cached matrix/variants so the next resolve re-reads from disk."""
    load_matrix.cache_clear()
    load_variants.cache_clear()


@traces(SWR.SWR_2416)
def implementation_owner_for_intent(intent: str, workspace_root: str | None = None) -> str:
    """Return the persona whose tier keys the orchestrator's row for *intent*.

    The orchestrator does not key on its own tier: what matters to its route is how
    capable the agent that will actually do the work is (docs §2.3).
    """
    try:
        owners = load_matrix(workspace_root).get("owners", {})
    except Exception as exc:  # noqa: BLE001
        _log.warning("Playbook matrix unreadable (%s); defaulting owner to coding-agent", exc)
        return "coding-agent"
    owner = owners.get(intent) or owners.get(_DEFAULT_KEY)
    return str(owner) if owner else "coding-agent"


def _group_for_intent(matrix: dict[str, Any], intent: str) -> str | None:
    for group, members in (matrix.get("groups") or {}).items():
        if isinstance(members, list) and intent in members:
            return str(group)
    return None


def _lookup_intent_entry(
    matrix: dict[str, Any],
    persona_entry: dict[str, Any],
    intent: str,
) -> dict[str, Any] | None:
    """Resolve the intent key: concrete intent, then its group, then ``_default``."""
    intents = persona_entry.get("intents") or {}
    for key in (intent, _group_for_intent(matrix, intent), _DEFAULT_KEY):
        if key is None:
            continue
        entry = intents.get(key)
        if isinstance(entry, dict):
            return entry
    return None


def _lookup_tier_cell(intent_entry: dict[str, Any], tier: str) -> dict[str, Any] | None:
    for key in (tier, _WILDCARD):
        cell = intent_entry.get(key)
        if isinstance(cell, dict):
            return cell
    return None


def _tier_rank(tier: str) -> int:
    """Order a tier for comparison; an unknown tier ranks as :data:`FALLBACK_TIER`."""
    key = tier if tier in _TIER_KEYS else FALLBACK_TIER
    return _TIER_KEYS.index(key)


@traces(SWR.SWR_2416, SWR.SWR_2425)
def resolve_playbook_cell(
    persona: str,
    intent: str,
    tier: str | None,
    *,
    tier_source: str = "own",
    consumer_tier: str | None = None,
    consumer_source: str = "",
    workspace_root: str | None = None,
) -> PlaybookCell | None:
    """Resolve the cell for *persona* under *intent* at *tier*.

    Returns ``None`` when the persona has no matrix row at all (e.g.
    ``intent-classifier``, or a user-defined persona). An unresolved *tier*
    downgrades to :data:`FALLBACK_TIER` and is reported as unresolved rather than
    asserted as a real tier.

    *consumer_source* names the persona that executes what this one produces, and
    activates the consumer axis: when *consumer_tier* ranks below the persona's own
    tier, the :data:`CONSUMER_SLOTS` are re-read from the consumer's cell so the output
    is sized for whoever has to act on it. Only downgrades apply, never upgrades
    (docs §5), and an unresolved *consumer_tier* downgrades to :data:`FALLBACK_TIER`.
    """
    if not persona or not intent:
        return None
    try:
        matrix = load_matrix(workspace_root)
    except Exception as exc:  # noqa: BLE001
        _log.warning("Playbook matrix unreadable (%s); no playbook injected", exc)
        return None

    persona_entry = (matrix.get("personas") or {}).get(persona)
    if not isinstance(persona_entry, dict):
        return None

    tier_resolved = tier is not None and tier in _TIER_KEYS
    effective_tier = tier if tier_resolved and tier is not None else FALLBACK_TIER

    intent_entry = _lookup_intent_entry(matrix, persona_entry, intent)
    if intent_entry is None:
        return None
    cell = _lookup_tier_cell(intent_entry, effective_tier)
    if cell is None:
        return None

    if cell.get("not_routed"):
        return PlaybookCell(
            persona=persona,
            intent=intent,
            tier=effective_tier,
            routed=False,
            tier_resolved=tier_resolved,
            tier_source=tier_source,
        )

    defaults = persona_entry.get("defaults") or {}
    variants: dict[str, str] = {}
    for slot in SLOTS:
        selected = cell.get(slot, defaults.get(slot))
        if selected is not None:
            variants[slot] = str(selected)

    applied_consumer_tier, consumer_resolved = _apply_consumer_slots(
        variants,
        intent_entry,
        defaults,
        own_tier=effective_tier,
        consumer_tier=consumer_tier,
        consumer_source=consumer_source,
    )
    return PlaybookCell(
        persona=persona,
        intent=intent,
        tier=effective_tier,
        variants=variants,
        tier_resolved=tier_resolved,
        tier_source=tier_source,
        consumer_tier=applied_consumer_tier,
        consumer_source=consumer_source if applied_consumer_tier else "",
        consumer_tier_resolved=consumer_resolved,
    )


def _apply_consumer_slots(
    variants: dict[str, str],
    intent_entry: dict[str, Any],
    defaults: dict[str, Any],
    *,
    own_tier: str,
    consumer_tier: str | None,
    consumer_source: str,
) -> tuple[str, bool]:
    """Overwrite the :data:`CONSUMER_SLOTS` in *variants* from the consumer's cell.

    Returns the tier the slots were taken from and whether it was resolved; the tier is
    empty when the consumer axis is inactive or ranks at or above *own_tier*, in which
    case *variants* is left untouched. A ``not_routed`` consumer cell is ignored — the
    consumer's absence from the row says nothing about how to size the producer.
    """
    if not consumer_source and consumer_tier is None:
        return "", True
    resolved = consumer_tier is not None and consumer_tier in _TIER_KEYS
    effective = consumer_tier if resolved and consumer_tier is not None else FALLBACK_TIER
    if _tier_rank(effective) >= _tier_rank(own_tier):
        return "", True
    consumer_cell = _lookup_tier_cell(intent_entry, effective)
    if consumer_cell is None or consumer_cell.get("not_routed"):
        return "", True
    for slot in SLOTS:
        if slot not in CONSUMER_SLOTS:
            continue
        selected = consumer_cell.get(slot, defaults.get(slot))
        if selected is not None:
            variants[slot] = str(selected)
    return effective, resolved


def _variant_text(slot: str, variant: str, workspace_root: str | None = None) -> str | None:
    """Return the catalogued text for *variant*, or ``None`` if it renders nothing."""
    slots = load_variants(workspace_root).get("slots") or {}
    slot_entry = slots.get(slot)
    if not isinstance(slot_entry, dict):
        _log.warning("Playbook slot '%s' has no variant catalogue", slot)
        return None
    text = (slot_entry.get("variants") or {}).get(variant)
    if text is None:
        _log.warning("Playbook slot '%s' has no variant '%s'", slot, variant)
        return None
    text = str(text).strip()
    return text or None


def _slot_label(slot: str, workspace_root: str | None = None) -> str:
    slots = load_variants(workspace_root).get("slots") or {}
    entry = slots.get(slot)
    if isinstance(entry, dict) and entry.get("label"):
        return str(entry["label"])
    return slot.title()


@traces(SWR.SWR_2416, SWR.SWR_2425)
def render_playbook(
    cell: PlaybookCell | None,
    run_override: str | None = None,
    workspace_root: str | None = None,
) -> str:
    """Render *cell* as the Markdown block injected at ``[[ROTARIS:PLAYBOOK]]``.

    *run_override* names a host-selected delegation strategy from :data:`RUN_OVERRIDES`;
    it is rendered last and declared to win over the cell (docs §5, layer 4).
    """
    if cell is None:
        return _render_override_only(run_override)
    try:
        load_variants(workspace_root)
    except Exception as exc:  # noqa: BLE001
        _log.warning("Playbook variants unreadable (%s); no playbook injected", exc)
        return ""

    header = (
        f"## Active Playbook — intent `{cell.intent}` · model size `{cell.tier}`"
        if cell.tier_resolved
        else f"## Active Playbook — intent `{cell.intent}` · model size undetermined"
    )
    lines: list[str] = [header, ""]

    if cell.tier_source != "own":
        lines.append(
            f"The implementation owner for this intent is `{cell.tier_source}`; "
            "the sizing below follows its model size, not yours.",
        )
        lines.append("")
    if cell.consumer_tier:
        size = (
            f"model size `{cell.consumer_tier}`"
            if cell.consumer_tier_resolved
            else f"an undetermined model size, treated as `{cell.consumer_tier}`"
        )
        lines.append(
            f"The plan you produce is executed by `{cell.consumer_source}` at {size}; "
            "task sizing and report shape below follow its capacity, not yours.",
        )
        lines.append("")
    if not cell.tier_resolved:
        lines.append(
            f"The configured model size could not be determined; treating it as "
            f"`{FALLBACK_TIER}`. Do not assume a larger capacity than that.",
        )
        lines.append("")

    if not cell.routed:
        lines.append(
            "This persona is not part of the standard flow for this intent. You were "
            "delegated to anyway, so treat the assignment as narrow and explicitly "
            "bounded, and report back rather than expanding it.",
        )
        return _with_override("\n".join(lines).rstrip(), run_override)

    for slot in SLOTS:
        variant = cell.variants.get(slot)
        if variant is None:
            continue
        text = _variant_text(slot, variant, workspace_root)
        if text is None:
            continue
        lines.append(f"- **{_slot_label(slot, workspace_root)} ({variant}):** {text}")

    lines.append("")
    lines.append(
        "This playbook is authoritative for how you work. Where it conflicts with the "
        "generic guidance elsewhere in this prompt, follow the playbook. It never "
        "overrides the hard blocks below.",
    )
    return _with_override("\n".join(lines).rstrip(), run_override)


def _override_text(run_override: str | None) -> str:
    return RUN_OVERRIDES.get(run_override or "", "")


def _with_override(rendered: str, run_override: str | None) -> str:
    """Append the run override, declared last so it visibly wins over the cell."""
    text = _override_text(run_override)
    if not text:
        return rendered
    return f"{rendered}\n\n{text}"


def _render_override_only(run_override: str | None) -> str:
    """Render a run override for a persona that has no matrix row of its own."""
    return _override_text(run_override)


@traces(SWR.SWR_2416)
def clamp_policy_to_budget(policy: RuntimePolicy, cell: PlaybookCell | None) -> RuntimePolicy:
    """Return *policy* narrowed to the ceilings of *cell*'s ``BUDGET`` variant.

    Clamps only — a configured limit that is already tighter than the budget wins. Returns
    the original object when there is nothing to narrow, so callers can compare identity to
    tell whether a clamp happened.
    """
    if cell is None or not cell.routed:
        return policy
    limits = BUDGET_LIMITS.get(cell.variants.get("BUDGET", ""), {})
    narrowed = {
        field: limit
        for field, limit in limits.items()
        if isinstance(getattr(policy, field, None), int) and limit < getattr(policy, field)
    }
    if not narrowed:
        return policy
    _log.info(
        "Playbook budget '%s' clamps runtime policy: %s",
        cell.variants.get("BUDGET"),
        ", ".join(f"{k}={getattr(policy, k)}->{v}" for k, v in narrowed.items()),
    )
    return policy.model_copy(update=narrowed)
