## ensureBundle's build shows no progress, and fails past spawnSync's buffer

**Repaired 2026-10-20 by loc1 (`loc1-rename`).** `runBundleScript` (`apps/desktop/scripts/lib/code-intelligence-bundle.mjs`) now
runs the build streamed (`stream: true`, through `buildBundle`, `ensureBundle`'s default build): the child writes to the caller's
own standard output and error as it runs, so a first build's progress is visible and nothing is held to outgrow; a failed streamed
build's refusal says its output is above. The check (`--check`), whose short output a refusal quotes, is still read back whole,
now with a buffer it cannot outgrow (`maxBuffer: Number.MAX_SAFE_INTEGER`, as `main/sentinel.ts` gives the branch). **Pinned by**
three cases under "the bundle step's output" in `apps/desktop/scripts/lib/code-intelligence-bundle.test.ts`, red on the helper
before (a stand-in for `bundle.mjs` printing 2 MiB: the build runs to its end with its output written through and none held, the
check reads all 2 MiB back, and `ensureBundle` builds through the streamed step and says where a streamed failure's output went).
Not run here: a real first build from an empty cache through `ensureBundle` (this tree's bundle was already built by
`pnpm code-intel:bundle`, so every proof found it present).

Found by fin47's review of `accept1-1` (finding 1). fin47 (A4) made `code-intel-proof`, `init-proof` and `live-run` ask
`bundle.mjs --check` through `ensureBundle` and build the bundle through it when absent or stale. Its build ran
`spawnSync(process.execPath, [bundle.mjs], { encoding: 'utf8', … })` and read the output back, where the code it replaced in
`code-intel-proof` had run the step with `stdio: 'inherit'`. Two things followed:

- a first build from an empty cache — uv's download of the interpreter, its install of the distribution, up to the step's
  fifteen-minute bound — printed nothing at all until it ended, so a person or an agent watching the proof could not tell a slow
  build from a hung one;
- `spawnSync`'s default `maxBuffer` is 1 MiB, so a build printing more than that would have been ended with ENOBUFS and its status
  read as a failed build, the error naming the buffer rather than the step. Latent: the cold build of 2026-10-20 in this tree
  (`pnpm code-intel:bundle`, 29 s, uv's interpreter download and 76 packages installed) printed about 3 KB.

The same helper serves all three callers, so all three had both.

## Specs

None contradicted directly: a proof harness that hid a long step's progress and could fail a successful build on its own buffer.
It matters because the bundle is the precondition of `code-intel-proof` (ADR-0035's evidence), `init-proof`
(REQ-WORKSPACE-083/084) and the live run.

## Relevant files

- `apps/desktop/scripts/lib/code-intelligence-bundle.mjs` — `runBundleScript`, `buildBundle`, `ensureBundle`.
- `apps/desktop/scripts/lib/code-intelligence-bundle.test.ts` — the cases above.
- `apps/desktop/scripts/code-intel-proof.mjs`, `apps/desktop/scripts/init-proof.mjs`, `apps/desktop/scripts/live-run.mjs` — the
  three callers of `ensureBundle`.
