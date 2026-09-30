## slice-proof and code-intel-proof spell the Windows data directory on every platform

Two more scripts compose a sub-location of the product's data directory from the literal
`join(local, 'rotaris', 'data', …)`. That is the Windows answer only. On Linux the product's data directory is
`$XDG_DATA_HOME/rotaris`, which is `<local>/rotaris/data/rotaris` under the harness. On macOS it is
`<home>/Library/Application Support/rotaris/data`. The mistake is the same one `sessions-proof` made with the machine
identifier ([`sessions-proof-reads-the-machine-identifier-at-the-windows-path-on-every-platform.md`](sessions-proof-reads-the-machine-identifier-at-the-windows-path-on-every-platform.md)).
This note was found by reading while that one was being repaired. **Neither script was run for this note**:
`slice-proof` needs a real key and spends money.

- **`slice-proof.mjs`**: `tokensFile = join(local, 'rotaris', 'data', 'tokens', …)`. Off Windows, the first launch waits
  `KEY_WAIT_MS` on `ROTARIS_CAPTURE_WAIT=file:<tokensFile>` for a file the product never writes there. After the paste,
  the script may report "The key was not pasted within the wait" and exit 2, or it may carry on with a replayed
  credential. Two checks have no power off Windows. The strays check reads a directory that does not exist. The
  sign-out check, "the credential file survived the sign-out" (`existsSync(tokensFile)`), passes whether or not the
  product removed the credential. `harness.mjs` already has `tokensDirFor`, which the live run was repaired to use
  (2026-09-24).
- **`code-intel-proof.mjs`**: `runtimeHome = join(local, 'rotaris', 'data', 'code-intelligence')`. The product's runtime
  home is `join(resolveUserDirs().data, 'code-intelligence')` (`apps/desktop/src/main/sentinel.ts`). Off Windows, the
  proof keeps a directory the product never uses across runs, and it wipes, with the rest of the output, the directory
  the product does use. Each run then provisions the language servers again. That costs time and measures nothing
  false.

## Specs

The harness contradicts no requirement of the product. The `slice-proof` sign-out check stands for REQ-PROVIDER-014's
`tokens/` credential store and the sign-out removing the credential. Off Windows it cannot fail.

## Relevant files

- `apps/desktop/scripts/slice-proof.mjs`: `tokensFile`, and the first-launch wait, the strays check and the sign-out
  check that read it.
- `apps/desktop/scripts/code-intel-proof.mjs`: `runtimeHome` and the `mkdirSync(join(local, 'rotaris', 'data'))` beside it.
- `apps/desktop/scripts/lib/harness.mjs`: `tokensDirFor`, and the data-directory rule the two scripts should use.
- `apps/desktop/src/main/sentinel.ts`: the product's code-intelligence home.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. `harness.mjs` gains `dataDirFor`. It is the product's `resolveUserDirs().data` below
`local`, by the copied rule the other directory helpers follow: `local\rotaris\data` on Windows,
`<home>/Library/Application Support/rotaris/data` on macOS, and `<XDG_DATA_HOME>/rotaris` elsewhere. `dataSubdirFor`,
which `tokensDirFor`, `workspacesRootFor` and `machineIdFileFor` share, is now composed from it.

- `slice-proof` reads its credential file at `join(tokensDirFor(local), '<id>.json')`. The first launch's wait, the
  strays check and the sign-out check now read the directory the product writes on every platform.
- `code-intel-proof` keeps the runtime's home at `join(dataDirFor(local), 'code-intelligence')`, as
  `main/sentinel.ts` joins it, and creates `dataDirFor(local)` where it created the Windows spelling.

Pinned by two tests. `lib/proof-isolation.test.ts`'s parity case asserts `dataDirFor` equals `resolveUserDirs().data`
on all three platforms, and on macOS for a caller's own home; without the change it failed with `dataDirFor is not a
function`. `lib/launch-sites.test.ts`'s case "no script but the harness spells the data directory itself" failed on
the scripts before the change, naming `code-intel-proof.mjs` and `slice-proof.mjs`, and passes after it.

**Measured**, as root under Xvfb on Linux with Node 24, on the built app of this branch: `code-intel-proof`, run twice,
passed both times. It needed the bundle built first, with `pnpm code-intel:bundle` in this worktree. After the first run
the runtime's home stood at `profile/local/rotaris/data/rotaris/code-intelligence` (26 MB: `language_servers`,
`memories`, `serena_config.yml`), and nothing stood at the Windows spelling. The second run kept it. Section 4's real
call logged **5** provisioning lines on the first run and **0** on the second. The call took about 242 s both times,
so the time the note said re-provisioning costs was not what that call spent. Another workflow was loading the host
during the second run: load average 20.7 at its end.

**Not measured:** `slice-proof` was not run. It needs a real key pasted by the owner and spends money, and the live run
authorised for this round is `pnpm live-run`, not this proof. Its change is pinned only by the two tests above.
