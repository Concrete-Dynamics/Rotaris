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

## Outcome — repaired 2026-10-02 (fin10, bundle `fin10-strip-notices-and-listing`)

Both roots are now platform paths, `fileURLToPath(new URL(…, import.meta.url))`, as `tools/check-directive-register.mjs`
builds its own, so the server resolves absolute paths on Linux, macOS and Windows alike. The traversal guard now compares
the joined path against the root **with its trailing separator**, so neither a climb out of a root nor a sibling folder
sharing a root's prefix is read. The module exports its handler and a `serve(port)`, and listens only when run directly.

Confirmed before the repair from the repository root (`MOCKUP_PORT=8795 node tools/mockup.mjs`; `curl localhost:8795/`):
`not found: /`, status 404. Pinned by `tools/mockup.test.ts`, started with the repository as the working directory: both
roots absolute; `GET /` answers 200 with the mockup and the injected shim; `/icons/regular/style.css` 200; `/../package.json`,
`/icons/../../../../package.json` and `/%2e%2e/package.json` refused with 403. With the two roots put back in their old
form the first three cases fail (`expected false to be true`, `expected 404 to be 200` twice). Shown after the repair by
`pnpm mockup` from the repository root: `GET http://localhost:8791/` answered 200 (359,125 bytes) and
`/icons/regular/style.css` 200.
