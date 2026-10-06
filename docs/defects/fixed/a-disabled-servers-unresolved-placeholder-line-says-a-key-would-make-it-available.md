## A disabled server's unresolved-placeholder line says a key would make it available

Observed 2026-10-06 by the orchestrator's final default live run at origin/main `27a5127` (pack
`2026-10-06T01-30-08-282Z` of the `wt-live` worktree, git-ignored; the autopsy's "Unverified" observation of a disabled
server's placeholder, confirmed here). Every launch's first configuration load logs, at `info`:

```
mcp web_search: the placeholder ${ROTARIS_SEARCH_API_KEY} in its url could not be resolved from a stored secret or the
environment; the server is configured but unavailable until it is (REQ-MCP-088, REQ-CONFIG-225)
```

and every run of that launch then logs "MCP server 'web_search' is disabled by its configured 'enabled: false'
(REQ-CONFIG-465); skipped (REQ-MCP-040)" (for example `edit/app.log`, `shell/app.log`, `requirements/app.log`). The shipped
`web_search` entry is `enabled: false`. The first line's last clause says the server is unavailable *until the placeholder
is resolved*; a resolved key would leave it exactly as unavailable, because it is switched off. The level and the
once-per-process key are right (`docs/defects/fixed/a-disabled-mcp-server-warns-about-a-key-nobody-asked-for.md`); the
sentence is not.

## Specs

- **REQ-CONFIG-465** — an entry with `enabled: false` is present and observable, "no connection to it is attempted, and
  none of its tools enter the tool registry". Its unavailability is the switch's, not the placeholder's.
- **REQ-MCP-088** / **REQ-CONFIG-225** — an unresolvable placeholder stays literal and is reported; an entry whose URL
  still carries one is marked unavailable. Both still hold for an enabled entry; for a disabled one the reason it is
  unavailable is REQ-CONFIG-465's.
- **REQ-MCP-040** — turning a server off is a choice, not a fault: the line stays informational.

## Relevant files

- `packages/config/src/mcp/environment.ts` — `resolveRemoteUrl` writes one sentence for both an enabled and a disabled
  entry and changes only its severity, scope and channel.
- `packages/config/src/mcp/mcp.test.ts` — "a remote url substitutes substrings, secret before environment, and warns on
  an unresolved one", which pins the disabled entry's severity and key but not its words.

Noticed 2026-10-06 by the autopsy of the default live run at `27a5127`; confirmed by fin18 (bundle
`fin18-rail-label-and-observations`).

## Repaired — 2026-10-06

`resolveRemoteUrl` (`packages/config/src/mcp/environment.ts`) now chooses the sentence's consequence by the entry's
`enabled`, as it already chose the severity: an enabled entry still reads "the server is configured but unavailable until
it is"; a disabled one reads "the server is disabled by its configured 'enabled: false' (REQ-CONFIG-465), so nothing
connects to it, and enabling it will also need the placeholder resolved". Severity, scope, channel and key are unchanged,
so the line stays informational and once per process.

Pinned by `packages/config/src/mcp/mcp.test.ts`, "a remote url substitutes substrings, secret before environment, and
warns on an unresolved one": the disabled entry's message names the switch and does not say "unavailable until", and the
enabled entry's keeps "unavailable until it is" (red before the repair: the message did not contain "disabled by its
configured 'enabled: false'"). The next default live run shows it in any scenario's `app.log`.
