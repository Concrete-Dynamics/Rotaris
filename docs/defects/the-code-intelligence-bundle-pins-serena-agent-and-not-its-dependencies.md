## The code-intelligence bundle pins serena-agent and not its dependencies

`pnpm code-intel:bundle` installs `serena-agent==<pin>` with `uv pip install` and nothing else constrains the
resolution, so every dependency below it is whatever release the index holds on the day of the build. Two bundles
built from the same commit (`a118d59b`) on 2026-10-23, one in the primary checkout and one in a fresh worktree, ship
different closures: `certifi` 2026.7.22 against 2026.10.19, `pillow` 12.3.0 against 13.0.0, `pycparser` 3.11 against
3.12, `pydantic_settings` 2.15.0 against 2.16.1, `soupsieve` 3.0.3 against 3.0.4. The bundle marker's hash covers the
pins only, so it does not tell the two trees apart.

Noticed while resolving the notices generator's reviewed exceptions: a reviewed exception names a version, so the
`certifi` review needed two exact entries to cover the two trees, and the next release of any runtime dependency that
carries no licence text fails `pnpm notices` again, on whichever machine resolves it first.

## Specs

REQ-STARTUP-143 asks that the maintainer-review table "can never disagree with the build it covers"; with the closure
resolved at build time, the same commit builds trees the table covers and trees it does not. ADR-0035 describes the
bundle as built "from committed pins"; only the interpreter, the distribution and uv are pinned. REQ-MCP-011 and
REQ-MCP-116 pin the distribution and its version, and say nothing of its dependencies — no requirement is contradicted
outright.

## Relevant files

- `apps/desktop/scripts/code-intelligence/bundle.mjs` — the `uv pip install … serena-agent==<pin>` call, and the marker
  whose hash input is the pins.
- `apps/desktop/scripts/code-intelligence/pins.json` — the pins: Python, serena-agent and uv, no dependency lock.
- `tools/notices/reviewed-exceptions.json` — the two `certifi` entries this forced.
