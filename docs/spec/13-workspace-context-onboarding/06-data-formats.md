# Workspace Handling, Context Injection, and Project Onboarding — Persisted application settings

Part 6 of 7 of [domain 13](../13-workspace-context-onboarding.md), which indexes every part.

## Data & Formats

All formats below are externally observable: they are files a user (or test) can read and write, payloads delivered to agents, or persisted OS-level settings.

### Persisted application settings

- `workspace/lastOpened` — a key of the per-user preference store whose registry REQ-SHELL-006 closes; this appendix holds no copy of the store's shape or of the key's default, and contributes only when this domain writes it: on explicit open and on a successful switch, read at startup, and not cleaned up when stale.

### Workspace state directory `<workspace>/.rotaris/`

- `agents.yaml` — workspace-scope configuration. Known behavioral sections: `default_persona`, model slots, `inject_agents_md` (bool, default true), `skills:` (`enabled`, `overrides`, `invocation_overrides` keyed by normalized skill name), `project_init.source_extensions`, `hooks:` (whose section and entry schema are REQ-HOOKS-007 and REQ-HOOKS-008), and:

  ```yaml
  initialization:
    completed: [code-intelligence-setup]
    skipped: []
    last_run: "2026-08-29T12:00:00+00:00"   # ISO-8601 UTC
    classification: code                     # code | non-code | null
  ```

  Unknown top-level keys survive every save round-trip. There is no legacy state directory to adopt (REQ-WORKSPACE-035).
- `models.yml` — per-scope model definitions (also read in the global scope directory).
- `hook-trust.json` — the hook trust decision file, whose path, keys and serialization are fixed by REQ-HOOKS-096 and whose reading is fixed by REQ-HOOKS-094; this appendix holds no copy of them and contributes only that the file lives in this directory.

### Hook digest payload

Not a format this domain defines. The canonical document the digest is taken over, the fields it carries, the resolved-value rule, and what does and does not change the digest are REQ-HOOKS-091's, which this domain cites (REQ-WORKSPACE-117) and does not restate.

### Merged workspace context (AGENTS.md)

```
<!-- source: C:\path\to\workspace\AGENTS.md -->
{file content, possibly truncated at a line boundary}
```

Blocks separated by one blank line; total ≤ 131,072 bytes; per file ≤ 32,768 bytes (UTF-8 byte counts); deterministic.

### SKILL.md

YAML frontmatter delimited by `---` lines; required `name`, `description`; canonical trigger `trigger: {type: keyword, keywords: [..]}` (legacy `type:`/`triggers:` aliases normalized); optional `user-invocable: false` and `disable-model-invocation: true`; unknown fields preserved. Directory layouts searched: `<dir>/.agents/skills/<name>/SKILL.md`, `<dir>/.opencode/skills/<name>/SKILL.md` per project directory up to the repository root; user-scope roots `~/.agents/skills`, `~/.config/opencode/skills`, `~/.openhands/skills/installed`, `/etc/codex/skills`; disable manifest `~/.openhands/skills/.installed.json` (three accepted shapes, see REQ-WORKSPACE-052).

### Model-facing skill catalog block

Opening statement conveying the three facts of REQ-WORKSPACE-061, followed by one line per skill:

```
- {name}: {description} (SKILL.md: {absolute path})
```

Lines ordered by normalized name. A force-loaded body block carries the activation statement described in REQ-WORKSPACE-062, followed by the skill body with its frontmatter stripped.

### Skill listing and force-loaded body

There is no text-mode listing format and no steering-payload format. The discovered catalog is read in the Settings Skills tab (REQ-WORKSPACE-067), whose columns are Skill, Source, Path, Trigger, Load, Description; a skill loaded by hand for the session (REQ-WORKSPACE-151) carries the scope label `manual`. Invoking a skill's slash command force-loads its body for the session (REQ-WORKSPACE-073), and a force-loaded body reaches the model in the block shape of REQ-WORKSPACE-062 — an activation statement naming the skill, followed by the skill body with its frontmatter stripped — not in a listing format of its own.

### `.mcp.json`

Not a format this domain defines. The locations, the accepted shape and keys, and the parsing rules are REQ-MCP-017 and the requirements it names; this domain contributes only the workspace root the project-level file is located against and the layer discovery occupies in configuration assembly (REQ-WORKSPACE-037, REQ-WORKSPACE-036).

### Code-intelligence artifacts

- The code-intelligence runtime's per-project marker file beneath the workspace root — presence marks the project-configuration stage as already done (idempotence marker, REQ-WORKSPACE-091). Its name is read from the binding manifest (REQ-MCP-116) and is not written out here.
- Default MCP server entry: name `code_intelligence`, `stdio`, reserved command token `builtin:code-intelligence` (REQ-MCP-033), with its arguments, its pinned version and its per-run project binding fixed by REQ-MCP-010, REQ-MCP-011, REQ-MCP-034 and REQ-CONFIG-181. Exactly one such entry ships (REQ-WORKSPACE-097).

### Machine setup state

The per-user data directory named below is the one REQ-STARTUP-145 fixes, which is where that requirement settles which per-user location is meant on a platform offering more than one; this appendix holds no copy of that property and states none of its own. The layout itself is REQ-STARTUP-070's.

- `<per-user-data-dir>/setup/state.json` — atomic JSON outcome record (`complete` | `degraded` | `cancelled` | `already-running`, plus manifest fingerprint).
- `<per-user-data-dir>/tools/…` — managed tool installs; `setup.lock` stale after 900 s.

### Minimal bootstrap `agents.yaml`

Hand-authored content: the three-fact comment header of REQ-WORKSPACE-038, `default_persona: orchestrator`, and the twelve explicitly-null model-slot and thinking keys of REQ-CONFIG-025; mode 0o644; atomic write.

### Provider snapshot

`project_settings.yaml` in the per-user configuration directory — the fourth configuration layer of REQ-WORKSPACE-036. Its document shape, atomic write, file mode, and merge into the effective configuration belong to the model-providers specification (REQ-PROVIDER-084, REQ-PROVIDER-085, REQ-PROVIDER-091) and are not restated here.
