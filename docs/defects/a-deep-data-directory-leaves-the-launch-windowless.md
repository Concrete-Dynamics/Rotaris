## A deep data directory leaves the launch windowless

Off Windows, with no `XDG_RUNTIME_DIR`, the single-instance claim listens on a unix socket in the per-user data directory
(`<data>/instance-<pid>-<nonce>.sock`, `endpointFor` in `packages/platform/src/instance.ts`). A unix socket path is capped at
108 bytes, and nothing checks the length or falls back to a shorter directory: a data directory longer than about 70
characters (a `HOME` of about 50 under the default `~/.local/share/rotaris`) makes the listen fail with `EINVAL`. Seen on the
built app (Linux, 2026-10-07): launched under `env -i` with a `HOME` in the session scratchpad and no `XDG_RUNTIME_DIR`, main
logged `UNHANDLED rejection in main: Error: listen EINVAL: invalid argument <home>/.local/share/rotaris/instance-1080-5798ab11.sock`
from `claimInstance`, never loaded a window and said nothing to the user until it was stopped 40 s later. The proofs avoid it
by setting a short `XDG_RUNTIME_DIR` (`proofIsolationEnv`, `apps/desktop/scripts/lib/harness.mjs`).

Noticed 2026-10-07 by the builder of finacc3's bundle `finacc3-accept1-12` while showing the empty-`XDG_CONFIG_HOME` repair
on the built app (`docs/defects/fixed/an-empty-xdg-config-home-puts-the-configuration-directory-at-a-relative-path.md`);
recorded, not repaired.

## Specs

REQ-STARTUP-164 (the single-instance record SHALL never leave the application unlaunchable, and a launch reaches an outcome
in bounded time) and REQ-STARTUP-155 (the main window painted within 5 seconds of launch): a launch whose claim cannot listen
neither paints nor reports.

## Relevant files

- `packages/platform/src/instance.ts` — `endpointFor` and `socketDirectoryFor`: the socket's directory, with no length check.
- `apps/desktop/src/main/index.ts` — `claimInstance`'s caller, where the listen failure surfaces as an unhandled rejection.
- `apps/desktop/scripts/lib/harness.mjs` — `proofIsolationEnv`, whose short `XDG_RUNTIME_DIR` is why no proof meets it.
