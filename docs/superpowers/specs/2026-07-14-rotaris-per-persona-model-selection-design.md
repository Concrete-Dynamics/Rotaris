# Rotaris — Per-Persona Model Selection (Design)

Date: 2026-07-14
Status: Approved (brainstorming)
Branch: rotaris-upgrade-ui

## Problem

The Rotaris Settings view renders personas in a read-only table (Persona, Role,
Model, Reasoning, Tools). Users cannot change which model or reasoning level a
persona uses from the UI — they must hand-edit `agents.yaml`. We want per-persona
model and reasoning selection directly in the Settings view, persisted durably,
with a global/workspace scope toggle.

## Goals

- Edit each persona's model and reasoning level from the Settings persona table.
- Model dropdown offers **both** model slots (`small_model` … `fallback_model`)
  and concrete models from the catalog. Selecting a slot keeps the persona
  following that slot; selecting a concrete model pins the persona to it.
- Reasoning dropdown offers levels valid for the selected model (derived like the
  model-slot thinking control), plus the "inherit/none" option.
- A scope pill (`Workspace | Global`) selects which config file edits write to.
  Workspace values override global at load time (existing loader behavior).
- Rows whose value comes from a workspace override expose an **Unset** button that
  removes the workspace key so the value falls back to global (or the built-in
  default).
- Each row indicates the origin of its current value (workspace / global /
  default).

## Non-Goals

- No per-persona editing of tools, role, MCP servers, or prompt in this change.
- No new session-time (composer) overrides — this is the durable config surface.
- Delegated-child vs entry-persona model resolution rules are unchanged.

## Background (current behavior)

- `models/state.py::PersonaSpec` — `name, role, model, reasoning, tools`.
- `models/store.py::WorkspaceStore`
  - `personas: list[PersonaSpec]`, `model_slots`, `model_catalog`,
    `model_thinking_choices`, `model_slot_thinking`.
  - `set_agent_model` / `set_agent_reasoning` operate on runtime `AgentNode`s, not
    personas. No `set_persona_*` exists.
  - Settings dirty tracking: `mark_settings_saved()` deepcopies
    `model_slots, model_slot_thinking, delegation, runtime` as the baseline;
    `discard_settings_changes()` restores from it. Personas are NOT in the baseline.
- `services/config_service.py`
  - `load()` fills personas via `_display_model_name(config, persona.model)`;
    reasoning from `str(persona.thinking or "medium")`.
  - `save()` writes only model slots + runtime + delegation to the **workspace**
    `<workspace>/.rotaris/agents.yaml` overlay. Persona model/reasoning is never
    written.
  - `build_run_config()` resolves slot indirection at run time.
- `views/settings.py` — persona table is a read-only `QTreeWidget`
  (`views/settings.py:337-352`). Model slots already use per-row `QComboBox`
  widgets with a thinking-strength combo (the pattern to mirror).
- Config layering: `src/rotaris_core/config/loader.py::load_config` merges
  `GLOBAL_CONFIG_DIR/agents.yaml` (`platformdirs.user_config_dir("rotaris")`)
  then `<workspace>/.rotaris/agents.yaml`; workspace wins.

## Design

### Data model — `models/state.py`

`PersonaSpec` gains two origin fields:

```python
@dataclass
class PersonaSpec:
    name: str
    role: str
    model: str
    reasoning: str
    tools: list[str] = field(default_factory=list)
    model_scope: str = "default"      # "workspace" | "global" | "default"
    reasoning_scope: str = "default"  # "workspace" | "global" | "default"
```

`*_scope` marks where the currently-resolved value originates, computed at load.

### Store — `models/store.py`

New state:

- `persona_edit_scope: str = "workspace"` — the scope pill selection; the target
  file for the next persona edit.

New methods:

- `set_persona_edit_scope(scope: str)` — set pill state, mark dirty only if changed.
- `set_persona_model(name: str, model: str)` — update that persona's `model`, set
  its `model_scope = persona_edit_scope`, mark dirty. No-op if unchanged.
- `set_persona_reasoning(name: str, level: str)` — same for `reasoning` /
  `reasoning_scope`.
- `unset_persona_override(name: str, field: str)` — mark that the persona's
  `field` ("model"|"reasoning") should have its **workspace** key removed on save;
  set the corresponding `*_scope` to `"global"` (best-effort display; real
  resolved value recomputed on next load). Mark dirty. Only valid when the current
  scope for that field is `"workspace"`.

Dirty baseline extended: `mark_settings_saved()` deepcopies `personas` and
`persona_edit_scope` in addition to the existing tuple; `discard_settings_changes()`
restores them.

### Config service — `services/config_service.py`

**Load.** After building `PersonaSpec`s, compute origin per persona field:

- New helper `_raw_scope_personas() -> tuple[dict, dict]` returns
  `(workspace_personas, global_personas)` — the raw `personas:` mappings read
  directly from `<workspace>/.rotaris/agents.yaml` and `GLOBAL_CONFIG_DIR/agents.yaml`
  (empty dict when file/section absent; tolerant of malformed YAML → empty).
- For each persona, `model_scope` = `"workspace"` if
  `workspace_personas[name]` defines `model`, else `"global"` if
  `global_personas[name]` defines `model`, else `"default"`. Same logic on the
  `thinking` key for `reasoning_scope`.

**Save.** After the existing slot/runtime/delegation write to the workspace file:

- Group persona edits by each persona's `model_scope` / `reasoning_scope`.
- For workspace-scoped fields: merge into the workspace `agents.yaml`
  `personas:` mapping (`payload.setdefault("personas", {})`), setting
  `personas[name]["model"]` / `["thinking"]`. Preserve other persona keys.
- For global-scoped fields: read/merge/write `GLOBAL_CONFIG_DIR/agents.yaml` the
  same way (atomic write, mkdir parents).
- Unset: remove the `model` / `thinking` key (and prune the persona sub-map / the
  `personas` section if it becomes empty) from the **workspace** file only.
- Model display names are mapped back to config model keys before writing. Slot
  names (`small_model` … `fallback_model`) are written verbatim (they are valid
  persona `model` values that the loader resolves). New helper
  `_persona_model_to_config_value(display: str) -> str`: if `display` is a slot
  name, return it unchanged; else reverse `_display_model_name` to the underlying
  model key (fall back to `display` when no reverse match).

`GLOBAL_CONFIG_DIR` imported from `rotaris_core.config.paths`.

### Settings view — `views/settings.py`

Persona `Card`:

1. Scope pill above the table:
   `SegmentedControl(["Workspace", "Global"])` bound to
   `store.set_persona_edit_scope` (map label ↔ lowercase value). Reflects
   `store.persona_edit_scope` on refresh.
2. Persona table columns: `Persona | Role | Model | Reasoning | Scope | Tools`.
   - **Model**: `QComboBox` via `setItemWidget`. Items = slot-name group
     (`small_model` … `fallback_model`) followed by `model_catalog`. Current =
     `persona.model` (added if absent). `currentTextChanged` →
     `store.set_persona_model(name, value)`.
   - **Reasoning**: `QComboBox`. Choices = `model_thinking_choices.get(model,
     [None])`; fall back to `[None, "auto", "low", "medium", "high", "max"]` when
     the model has no entry. Current = `persona.reasoning`.
     `currentTextChanged` → `store.set_persona_reasoning(...)`.
   - **Scope**: a small muted label showing the field origin (`workspace` /
     `global` / `default`), plus an **Unset** `QPushButton` enabled only when
     `persona_edit_scope == "workspace"` and the field's `*_scope == "workspace"`.
     Clicking → `store.unset_persona_override(name, field)`.
   - **Tools**: unchanged read-only text.
3. Table rebuilds on `store.settings_changed` (already connected via `refresh`).

Reuse existing helpers (`_label`, `_clear`) and the model-slot combo pattern
(guard against `findText < 0`, block signals while programmatically setting).

### Data flow

```
User edits Model combo (Settings)
  -> store.set_persona_model(name, value)   [tags model_scope = edit scope, dirty]
  -> settings_changed -> view.refresh (badge + unset button update)
Save button
  -> config_service.save()
       workspace-scoped fields -> <ws>/.rotaris/agents.yaml personas:
       global-scoped fields    -> GLOBAL_CONFIG_DIR/agents.yaml personas:
       unset fields            -> remove key from workspace file
  -> load_config re-read; store.mark_settings_saved (new baseline)
```

### Error handling

- Malformed scope YAML on load → treat that scope's personas as empty (no origin
  info; value shown as resolved, scope `"default"`); do not crash the view.
- `save()` raises `OSError`/`ValueError` as today; `_save_settings` surfaces the
  existing error toast + Retry.
- Demo mode (no `config_service`): persona combos still editable in-memory; Save is
  already disabled/read-only (existing "read-only in demo mode" toast).

## Testing

Store unit (`tests/unit` or `apps/rotaris/tests/unit`):
- `set_persona_model` / `set_persona_reasoning` update value + `*_scope`, mark dirty.
- `set_persona_edit_scope` switches target; edits tag the chosen scope.
- `unset_persona_override` flips scope to global, marks dirty.
- `mark_settings_saved` / `discard_settings_changes` round-trip personas +
  `persona_edit_scope`.

Config service:
- `load()` computes `model_scope`/`reasoning_scope` correctly for personas defined
  in workspace-only, global-only, both (workspace wins), and neither (default).
- `save()` writes workspace-scoped persona model/reasoning to the workspace
  `agents.yaml`; global-scoped to `GLOBAL_CONFIG_DIR/agents.yaml`; preserves other
  persona keys.
- Unset removes the workspace `model`/`thinking` key (and empty sections) without
  touching global.
- Slot-name value written verbatim; concrete display name reverse-maps to model key.

Settings view (pytest-qt, `make test-rotaris`):
- Scope pill switches `persona_edit_scope`.
- Editing a model/reasoning combo marks settings dirty.
- Unset button enabled only for workspace-origin rows in workspace scope; click
  clears the override.
- Full-workflow, alternative-workflow, random-interaction tests per
  `docs/textualize_testing_guide.md` conventions where applicable.

## Version

Bump `pyproject.toml` (and `apps/rotaris/pyproject.toml` if independently
versioned) per semver — minor feature.
