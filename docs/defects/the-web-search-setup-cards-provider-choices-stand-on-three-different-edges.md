## The web-search setup card's provider choices stand on three different edges

Step 1 of the guided web-search card (Settings, MCP Servers, "Set up web search") lists the search providers as a radio
group, one `settings__action` row to a provider: the provider's name as a `seg-opt` button, a caption, and a "Get a key"
link (`packages/ui/src/settings/McpSettings.tsx:578`). The adopted `.seg-opt` is `flex: 1` and centres its text
(`docs/design/system/components.css`, `.seg-opt`), a rule written for the options of one `SegmentedControl` sharing a
line. Alone in a row beside a caption of its own length, the button takes whatever the caption leaves and centres the
name in it, so each name begins somewhere else: at 1440x900 "Tavily" begins near x 651, "Brave Search" near 611 and
"Your own SearXNG" near 646, and the three captions near 993, 953 and 1053 (read off the capture, to a few pixels; not
probed). The group has no left edge at all.

Read from a capture of the built app on `3927eda5`, 2026-11-10, while surveying Settings for
[R-097](../product/requests.md#r-097). Not repaired there: the card's arrangement was reviewed and measured on
2026-11-09 (`packages/ui/src/shell.css`, the `[data-mcp-websearch-setup]` rules), its rows sit in wrappers R-097's
Settings axis does not reach, and its tests pin its measures (`packages/ui/src/settings/web-search-measure.test.ts`).

## Specs

- No requirement fixes the card's arrangement. `docs/design/README/01-1-the-design-language.md` §1.5 and the review
  rubric's C3 (`.agents/skills/review-ui/references/critique-rubric.md`: "no two competing left edges") are what it
  meets; UIR-010 is the precedent for a form whose controls each began at the length of their own label.

## Relevant files

- `packages/ui/src/settings/McpSettings.tsx` — the provider rows (line 578 onward).
- `packages/ui/src/shell.css` — the `[data-mcp-websearch-setup]` rules, and `.seg-opt`'s local additions.
- `docs/design/system/components.css` — the adopted `.seg-opt { flex: 1; text-align: center }`.
- `docs/design/briefs/settings.md` — the Settings brief, whose axis this card is outside.
