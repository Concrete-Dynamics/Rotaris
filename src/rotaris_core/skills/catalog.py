from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import yaml

from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

SkillSourceScope = Literal["project", "user", "manual"]
SkillLoadMode = Literal["off", "name-only", "user-invocable-only", "on"]
SkillInvocationMode = Literal["default", "manual-only", "auto-only"]

_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*(?:\n|\Z)", re.DOTALL)
_NORMALIZE_RE = re.compile(r"[^a-z0-9]+")
_CATALOG_CACHE: dict[str, SkillCatalog] = {}

# Machine-wide Codex skills. Named here rather than inlined below because it is
# the one user-scope root that is not relative to the home directory, so a test
# cannot neutralise it by pointing `Path.home()` somewhere harmless.
SYSTEM_SKILL_ROOT = Path("/etc/codex/skills")


@dataclass(frozen=True, slots=True)
class SkillMeta:
    normalized_name: str
    name: str
    description: str
    skill_file: Path
    skill_dir: Path
    source_scope: SkillSourceScope
    trigger_keywords: tuple[str, ...] = ()
    raw_metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def invocation_mode(self) -> SkillInvocationMode:
        if self.raw_metadata.get("user-invocable") is False:
            return "auto-only"
        if self.raw_metadata.get("disable-model-invocation") is True:
            return "manual-only"
        return "default"


@dataclass(slots=True)
@traces(SWR.SWR_418, SWR.SWR_419, SWR.SWR_420, SWR.SWR_421, SWR.SWR_430, SWR.SWR_435)
class SkillCatalog:
    skills: dict[str, SkillMeta] = field(default_factory=dict)
    in_context: set[str] = field(default_factory=set)
    shadowed: dict[str, list[SkillMeta]] = field(default_factory=dict)

    def ordered_skills(self) -> list[SkillMeta]:
        return [self.skills[name] for name in sorted(self.skills)]

    def add(self, meta: SkillMeta, *, replace: bool = True) -> bool:
        existing = self.skills.get(meta.normalized_name)
        if existing is not None and not replace:
            self.shadowed.setdefault(meta.normalized_name, []).append(meta)
            _log.debug(
                "Discarding skill %s from %s because %s from %s already won.",
                meta.normalized_name,
                meta.skill_file,
                existing.normalized_name,
                existing.skill_file,
            )
            return False
        if existing is not None:
            _log.debug(
                "Replacing skill %s from %s with %s.",
                meta.normalized_name,
                existing.skill_file,
                meta.skill_file,
            )
        self.skills[meta.normalized_name] = meta
        return True

    def mark_in_context(self, normalized_name: str) -> None:
        if normalized_name in self.skills:
            self.in_context.add(normalized_name)

    def extra_read_roots(self) -> tuple[Path, ...]:
        roots = {meta.skill_dir.resolve() for meta in self.skills.values()}
        return tuple(sorted(roots, key=str))


def clear_skill_catalog_cache() -> None:
    _CATALOG_CACHE.clear()


def get_skill_catalog(workspace_root: Path) -> SkillCatalog:
    cache_key = str(workspace_root.resolve())
    cached = _CATALOG_CACHE.get(cache_key)
    if cached is not None:
        return cached

    catalog = discover_skill_catalog(workspace_root)
    _CATALOG_CACHE[cache_key] = catalog
    return catalog


@traces(SWR.SWR_432, SWR.SWR_433)
def add_manual_skill(workspace_root: Path, raw_path: str | Path) -> SkillMeta:
    catalog = get_skill_catalog(workspace_root)
    skill_file = _resolve_manual_skill_file(raw_path, base_dir=workspace_root)
    meta = parse_skill_file(skill_file, source_scope="manual")
    catalog.add(meta, replace=True)
    return meta


@traces(SWR.SWR_418, SWR.SWR_419, SWR.SWR_434, SWR.SWR_436)
def discover_skill_catalog(workspace_root: Path) -> SkillCatalog:
    root = workspace_root.resolve()
    catalog = SkillCatalog()
    for skill_file, scope in _discover_skill_files(root):
        try:
            meta = parse_skill_file(skill_file, source_scope=scope)
        except ValueError as exc:
            _log.warning("Skipping invalid SKILL.md file %s: %s", skill_file, exc)
            continue
        catalog.add(meta, replace=False)
    return catalog


@traces(SWR.SWR_425, SWR.SWR_426)
def format_skill_catalog(
    catalog: SkillCatalog,
    *,
    enabled: bool = True,
    overrides: dict[str, SkillLoadMode] | None = None,
    invocation_overrides: dict[str, SkillInvocationMode] | None = None,
) -> str:
    """Render only skills that agents may discover automatically."""
    skills = [
        meta
        for meta in catalog.ordered_skills()
        if _is_model_invocable(
            meta,
            enabled=enabled,
            overrides=overrides,
            invocation_overrides=invocation_overrides,
        )
    ]
    if not skills:
        return ""

    lines = [
        "Portable SKILL.md catalog. These are available on disk; read a listed SKILL.md",
        "only when it is relevant to the current task. Do not assume the body is already",
        "in context.",
        "",
    ]
    for meta in skills:
        lines.append(f"- {meta.name}: {meta.description} (SKILL.md: {meta.skill_file})")
    return "\n".join(lines)


@traces(SWR.SWR_2098)
def is_skill_user_invocable(
    meta: SkillMeta,
    *,
    enabled: bool = True,
    overrides: dict[str, SkillLoadMode] | None = None,
    invocation_overrides: dict[str, SkillInvocationMode] | None = None,
) -> bool:
    if not enabled or _load_mode(meta, overrides) == "off":
        return False
    return _invocation_mode(meta, invocation_overrides) != "auto-only"


@traces(SWR.SWR_2098)
def always_loaded_skills(
    catalog: SkillCatalog,
    *,
    enabled: bool = True,
    overrides: dict[str, SkillLoadMode] | None = None,
) -> list[SkillMeta]:
    if not enabled:
        return []
    return [meta for meta in catalog.ordered_skills() if _load_mode(meta, overrides) == "on"]


@traces(SWR.SWR_2098)
def read_always_loaded_skill_body(skill_file: Path) -> str:
    """Read a force-loaded skill's body, stripped of its YAML frontmatter.

    The frontmatter `description` field is written for the catalog/progressive-
    disclosure case ("read this when X applies") and is misleading once the
    body is unconditionally in context, so it is dropped rather than shown
    to the model alongside the always-active body.
    """
    raw = skill_file.read_text(encoding="utf-8")
    match = _FRONTMATTER_RE.match(raw)
    return raw[match.end() :] if match else raw


def _is_model_invocable(
    meta: SkillMeta,
    *,
    enabled: bool,
    overrides: dict[str, SkillLoadMode] | None,
    invocation_overrides: dict[str, SkillInvocationMode] | None,
) -> bool:
    # "on" skills already have their full body force-loaded elsewhere (see
    # always_loaded_skills); listing them here too would duplicate them under
    # a "read on demand, not yet in context" framing that contradicts the
    # always-loaded copy and confuses the model about whether it's active.
    if not enabled or _load_mode(meta, overrides) in {"off", "user-invocable-only", "on"}:
        return False
    return _invocation_mode(meta, invocation_overrides) != "manual-only"


def _load_mode(meta: SkillMeta, overrides: dict[str, SkillLoadMode] | None) -> SkillLoadMode:
    return (overrides or {}).get(meta.normalized_name, "name-only")


def _invocation_mode(
    meta: SkillMeta, invocation_overrides: dict[str, SkillInvocationMode] | None
) -> SkillInvocationMode:
    return (invocation_overrides or {}).get(meta.normalized_name, meta.invocation_mode)


@traces(SWR.SWR_422, SWR.SWR_423, SWR.SWR_424)
def parse_skill_file(skill_file: Path, *, source_scope: SkillSourceScope) -> SkillMeta:
    resolved = skill_file.resolve()
    try:
        raw = resolved.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ValueError(f"unreadable file: {exc}") from exc

    match = _FRONTMATTER_RE.match(raw)
    if match is None:
        raise ValueError("missing YAML frontmatter")

    frontmatter = match.group(1)
    try:
        loaded = yaml.safe_load(frontmatter) or {}
    except yaml.YAMLError as exc:
        raise ValueError(f"malformed YAML frontmatter: {exc}") from exc

    if not isinstance(loaded, dict):
        raise ValueError("frontmatter must be a mapping")

    name = str(loaded.get("name") or "").strip()
    if not name:
        raise ValueError("missing required frontmatter field 'name'")
    description = str(loaded.get("description") or "").strip()
    if not description:
        raise ValueError("missing required frontmatter field 'description'")

    normalized_name = normalize_skill_name(name)
    if not normalized_name:
        raise ValueError("skill name normalizes to an empty identifier")

    trigger_keywords = _normalize_trigger_keywords(loaded)
    return SkillMeta(
        normalized_name=normalized_name,
        name=name,
        description=" ".join(description.split()),
        skill_file=resolved,
        skill_dir=resolved.parent,
        source_scope=source_scope,
        trigger_keywords=trigger_keywords,
        raw_metadata=dict(loaded),
    )


@traces(SWR.SWR_421)
def normalize_skill_name(name: str) -> str:
    normalized = _NORMALIZE_RE.sub("-", name.strip().lower()).strip("-")
    return normalized


def _normalize_trigger_keywords(metadata: dict[str, Any]) -> tuple[str, ...]:
    trigger = metadata.get("trigger")
    if trigger is None and ("type" in metadata or "triggers" in metadata):
        trigger = {"type": metadata.get("type"), "keywords": metadata.get("triggers")}
    if trigger is None:
        return ()

    if not isinstance(trigger, dict):
        raise ValueError("unsupported trigger shape: trigger must be a mapping")

    trigger_type = str(trigger.get("type") or "").strip().lower()
    if trigger_type != "keyword":
        raise ValueError("unsupported trigger type: only 'keyword' is supported")

    raw_keywords = trigger.get("keywords")
    if raw_keywords is None:
        raw_keywords = trigger.get("triggers")
    if raw_keywords is None:
        return ()
    if not isinstance(raw_keywords, list) or not all(
        isinstance(item, str) for item in raw_keywords
    ):
        raise ValueError("unsupported trigger shape: keywords must be a list of strings")

    result: list[str] = []
    seen: set[str] = set()
    for keyword in raw_keywords:
        stripped = keyword.strip()
        if not stripped or stripped in seen:
            continue
        seen.add(stripped)
        result.append(stripped)
    return tuple(result)


def _discover_skill_files(workspace_root: Path) -> list[tuple[Path, SkillSourceScope]]:
    home = Path.home()
    discovered: list[tuple[Path, SkillSourceScope]] = []
    skill_roots: list[tuple[Path, SkillSourceScope]] = []
    for project_root in _project_skill_roots(workspace_root):
        skill_roots.extend(
            [
                (project_root / ".agents" / "skills", "project"),
                (project_root / ".opencode" / "skills", "project"),
            ],
        )
    skill_roots.extend(
        [
            (home / ".agents" / "skills", "user"),
            (home / ".config" / "opencode" / "skills", "user"),
            (home / ".openhands" / "skills" / "installed", "user"),
            (SYSTEM_SKILL_ROOT, "user"),
        ],
    )
    for base, scope in skill_roots:
        disabled = (
            _load_disabled_openhands_installed(base)
            if base == home / ".openhands" / "skills" / "installed"
            else set()
        )
        discovered.extend(_discover_under_base(base, scope, disabled_names=disabled))
    return discovered


def _project_skill_roots(workspace_root: Path) -> tuple[Path, ...]:
    root = workspace_root.resolve()
    repo_root = root
    for candidate in (root, *root.parents):
        if (candidate / ".git").exists():
            repo_root = candidate
            break
    roots: list[Path] = []
    current = root
    while True:
        roots.append(current)
        if current == repo_root or current.parent == current:
            break
        current = current.parent
    return tuple(roots)


def _discover_under_base(
    base: Path,
    scope: SkillSourceScope,
    *,
    disabled_names: set[str],
) -> list[tuple[Path, SkillSourceScope]]:
    if not base.is_dir():
        return []

    result: list[tuple[Path, SkillSourceScope]] = []
    try:
        children = sorted(
            (child for child in base.iterdir() if child.is_dir()), key=lambda p: p.name
        )
    except OSError as exc:
        _log.warning("Skipping unreadable skill directory %s: %s", base, exc)
        return []

    for child in children:
        if child.name in disabled_names or normalize_skill_name(child.name) in disabled_names:
            _log.debug("Skipping disabled OpenHands skill directory %s", child)
            continue
        skill_file = child / "SKILL.md"
        if skill_file.is_file():
            result.append((skill_file, scope))
    return result


def _load_disabled_openhands_installed(installed_base: Path) -> set[str]:
    manifest = installed_base.parent / ".installed.json"
    if not manifest.is_file():
        return set()
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        _log.warning("Skipping unreadable OpenHands skills manifest %s: %s", manifest, exc)
        return set()

    disabled: set[str] = set()

    def add_disabled(value: Any) -> None:
        if isinstance(value, str):
            disabled.add(value)
            disabled.add(normalize_skill_name(value))

    if isinstance(data, dict):
        disabled_value = data.get("disabled")
        if isinstance(disabled_value, list):
            for item in disabled_value:
                add_disabled(item)
        for key, value in data.items():
            if isinstance(value, dict) and value.get("disabled") is True:
                add_disabled(key)
                add_disabled(value.get("name"))
                add_disabled(value.get("path"))
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and item.get("disabled") is True:
                add_disabled(item.get("name"))
                add_disabled(item.get("path"))

    return {item for item in disabled if item}


def _resolve_manual_skill_file(raw_path: str | Path, *, base_dir: Path) -> Path:
    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        path = base_dir / path
    if path.is_dir():
        path = path / "SKILL.md"
    if not path.is_file():
        raise ValueError(f"SKILL.md not found: {raw_path}")
    if path.name != "SKILL.md":
        raise ValueError(f"manual skill path must be a SKILL.md file or directory: {raw_path}")
    return path
