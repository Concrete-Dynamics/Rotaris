## `skills-proof` writes its global policy where only Windows reads it, so the policy launch fails on Linux

`skills-proof`'s policy launch (launch 2) needs a skill policy stated at the **global** scope, so that REQ-CONFIG-258's
"write the baseline out explicitly" case is reachable at all. It writes that file at
`join(scratch.local, 'rotaris', 'config', 'agents.yaml')`, and its own comment says why: "The path is
`resolveUserDirs().config`, which on Windows is `%LOCALAPPDATA%/rotaris/config`".

That is the Windows answer only. `proofIsolationEnv` sets `XDG_CONFIG_HOME` to `<local>/rotaris/config`, and on Linux
`packages/platform/src/dirs.ts` resolves the global configuration directory as `$XDG_CONFIG_HOME/rotaris` —
`<local>/rotaris/config/rotaris`. The run host therefore never reads the proof's `agents.yaml`, no global override
exists, Save correctly writes nothing for `home-skill`, and the proof fails at "the baseline over a global override was
not written explicitly". The launches after it (reopen, run, rescan, disabled) never run on Linux.

Seen 2026-09-27 on a Linux container: the failure was recorded on unmodified `main` (56801df) before the `/skills`
listing was built, and reproduced at the same check with it built, with
`.proof/skills-proof/scratch/local/rotaris/config/agents.yaml` present and no `config/rotaris/` directory beside it.
The cause is confirmed: a temporary, uncommitted copy of the proof with only that path spelled for Linux
(`<local>/rotaris/config/rotaris/agents.yaml`) passed end to end — 10 checks over 9 launches, exit 0, the policy
launch writing `home-skill: name-only` explicitly — and was deleted after the run. Noticed while building
`/skills`, whose two new launches were placed before launch 2 for exactly this reason. **Not repaired here** — the
proof's other launches are outside that change — and the product is not implicated: it reads the directory its
platform names.

The repair is in the proof: take the global directory from the same rule the product uses for the host platform (the
Windows pair on win32, `$XDG_CONFIG_HOME/rotaris` on Linux, `~/Library/Application Support/rotaris` on macOS), or ask
the app where it is, rather than spelling one platform's answer.

## Specs

None contradicted by the product. The proof cannot reach REQ-CONFIG-258's global-scope case on Linux, so that
requirement and the launches after it (REQ-WORKSPACE-058/060/062/064/069/151 in the built app) are unproven there.

## Relevant files

- `apps/desktop/scripts/skills-proof.mjs` — launch 2's `globalAgents` path and the comment that states the Windows rule.
- `apps/desktop/scripts/lib/harness.mjs` — `proofIsolationEnv`, which sets `XDG_CONFIG_HOME` to `<local>/rotaris/config`.
- `packages/platform/src/dirs.ts` — `resolveUserDirs`, whose Linux branch appends the product name to `XDG_CONFIG_HOME`.
