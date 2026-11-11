## Three sentences on the MCP Servers category draw Markdown backticks as written

Found on 2026-11-11 while repairing the same defect on the Requirements board's empty states (UIR-310 of that day's
critique, [the requirements-board brief](../design/briefs/requirements-board.md)); not repaired here, since the round
was bounded to the surfaces the critique named. Read in the source, not driven.

Three sentences of Settings › MCP Servers hold a name between Markdown backticks and are drawn as plain text, so the
backticks reach the screen around a name set in the body face:

- the Configured servers card's statement, "… writes `enabled: true` to the configuration file";
- the secrets card's statement, "… is built on the `Set up web search` …";
- `WEB_SEARCH_NO_ENTRY`, "No `web_search` entry is configured. Declare one under `mcp_servers` …".

The Requirements board's repair names each such part on its own and draws it in the mono face (`Phrase` and `phrase`,
`packages/ui/src/requirements/model.ts` and `RequirementsView.tsx`); the Start session dialog writes `<code>`.

## Specs

None states the form. The design language sets identifiers, paths and keys in the mono face
(`docs/design/README/01-1-the-design-language.md`, §1.4), and no surface of the product renders Markdown outside the
transcript's one renderer (`.claude/rules/ui-surfaces.md`).

## Relevant files

- `packages/ui/src/settings/McpSettings.tsx` — the two card statements.
- `packages/ui/src/settings/web-search-setup.ts` — `WEB_SEARCH_NO_ENTRY`.
