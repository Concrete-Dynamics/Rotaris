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

## Outcome

Repaired 2026-10-07 (fin30, branch `fin30-platform-paths`; finacc3 round 2 finding A2-04). The claim no longer listens wherever
the data directory happens to be: `socketDirectoryCandidates` (`packages/platform/src/instance.ts`) orders `XDG_RUNTIME_DIR`, the
data directory, and a private `rotaris-<uid>` directory below the temporary directory and below `/tmp`, and keeps a candidate only
where it is absolute and the socket's whole path, measured in bytes with the launch's pid, fits the platform's address
(`socketPathLimit`: 107 bytes on Linux, 103 on macOS). The claim listens in the first candidate that exists or can be made and
takes a file; the private one is made `0700` and refused when another user owns it. And a listen that still fails no longer
rejects with nothing awaiting it: `listenOrRelease` gives the record back and the claim answers `refused` with the reason, which
main logs at `error` before exiting 2 (REQ-STARTUP-164's bounded end), so the next launch has no record to wait on. ADR-0055 is
corrected in place ("Corrected 2026-10-07 (fin30)").

Pinned by `packages/platform/src/instance.test.ts` ("the hand-over socket's directory"): "a data directory too deep for a unix
socket still claims, and a second launch is handed over to it" fails on the old claim with `listen EINVAL: invalid argument
…/instance-18548-cc0588b3.sock`; "a launch whose endpoint cannot listen anywhere is refused and gives its record back" fails on it
with an unhandled `listen ENOTDIR`; two pure cases hold the candidates' order and the byte limit per platform. Shown on the built
app by `pnpm workspace-proof`'s scenario 13b (Linux, 2026-10-07): launched from the proof's own profile, whose data directory is
111 bytes, with `XDG_RUNTIME_DIR` unset, the launch painted its window and its record named `/tmp/rotaris-0/instance-30270-….sock`
(43 bytes); a second launch was handed over through it (exit 0, one main window) and the ended launch left no socket behind. The same
scenario on the unrepaired base (`a68f121`, built in a throwaway worktree with only the proof file changed, load about 10 to 14
on 4 CPUs) failed it: the launch wrote no driver endpoint within 90 s and never painted. The whole proof with the repair: 57
passed, 0 failed, 2 skipped (load 7 to 10).

## Specs

REQ-STARTUP-164 (the single-instance record SHALL never leave the application unlaunchable, and a launch reaches an outcome
in bounded time) and REQ-STARTUP-155 (the main window painted within 5 seconds of launch): a launch whose claim cannot listen
neither paints nor reports.

## Relevant files

- `packages/platform/src/instance.ts` — `endpointFor` and `socketDirectoryFor`: the socket's directory, with no length check.
- `apps/desktop/src/main/index.ts` — `claimInstance`'s caller, where the listen failure surfaces as an unhandled rejection.
- `apps/desktop/scripts/lib/harness.mjs` — `proofIsolationEnv`, whose short `XDG_RUNTIME_DIR` is why no proof meets it.
