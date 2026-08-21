---
req-id: SWR-1186
status: approved
trace: required
test: required
type: technical
derived-from: SWR-1142
title: "File-based custom prompt slash commands"
epic: SWR-1100
date: 2026-07-23
---

# SWR-1186 — File-based custom prompt slash commands

`SWR-1142` provides the slash command registry infrastructure, but says nothing
about where commands come from. `src/rotaris_core/tui/prompt_commands.py` layers a
file-based command source on top of that registry: Markdown prompt files
(discovered from `~/.codex/prompts` and other prompt roots) become
`/prompts:<name>` slash commands. Each file's frontmatter documents an
argument hint, and its body supports placeholder expansion (`$1`, `$ARGUMENTS`,
named `KEY=` tokens, and a literal `$$`) so a single prompt template can be
parameterized per invocation.

## Acceptance criteria

- `discover_prompt_commands` finds prompt files under the configured prompt
  roots and derives a `prompts:<name>` command name and argument hint from each
  file's frontmatter.
- `parse_prompt_file` / `expand_prompt` substitute positional (`$1`), catch-all
  (`$ARGUMENTS`), and named (`KEY=value`) placeholders in the prompt body, and
  `$$` expands to a literal `$`.
- `register_prompt_commands` registers each discovered prompt as an executable
  slash command that sends the expanded prompt as a steering message.

Derived from: [SWR-1142 — Command registry implemented (infrastructure ready)](../1100-tui-input.md)

Epic: [TUI Input, Commands & Shortcuts](../1100-tui-input.md)
