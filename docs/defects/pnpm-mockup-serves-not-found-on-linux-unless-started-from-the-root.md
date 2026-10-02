## pnpm mockup serves "not found" on Linux unless started from the filesystem root

`tools/mockup.mjs` turns its two roots into paths with `new URL(…, import.meta.url).pathname.replace(/^\//, '')`. The
strip of the leading slash makes a Windows path (`/D:/…` → `D:/…`) usable, but on Linux and macOS it makes the absolute
path relative (`/home/user/…` → `home/user/…`), which `readFile` then resolves against the working directory. Started
with `pnpm mockup` from the repository, as `CLAUDE.md` and `docs/design/README.md` §7 say to, every request answers
`not found: /`, so the design material the consult-before-drawing obligation names cannot be looked at. Started from `/`
(`cd / && node <repo>/tools/mockup.mjs`) it serves the mockup. Noticed 2026-10-02 (fin8, bundle `fin8-noticed-gaps-4`)
while consulting the mockup before drawing the quota-wait chooser's annotation; not repaired (outside that task).

## Specs

None contradicted: a tool of the process (`docs/design/README.md` §7, "Consult before drawing", names `pnpm mockup`).

## Relevant files

- `tools/mockup.mjs` — `design` and `icons`, the two roots built with the leading-slash strip; the `startsWith` guard
  compares against them.
