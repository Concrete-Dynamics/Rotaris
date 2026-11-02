## The proof-isolation test passes only on a Windows host

Two tests in `apps/desktop/scripts/lib/proof-isolation.test.ts` fail on Linux:

- *names both variable pairs, and spells the POSIX pair the way a POSIX machine reads it*
- *a Linux launch opens its store under the profile and never under the operator*

The test file claims to be decidable "on any host, because both halves take the platform as a PARAMETER", but
`proofIsolationEnv` (`apps/desktop/scripts/lib/harness.mjs:145`) converts the profile path with
`local.split(sep)`, where `sep` is the **host's** separator. The test feeds it a Windows-spelled profile
(`D:\repo\.proof\...`). On a Windows host the backslashes are split and the POSIX pair comes out
POSIX-spelled. On a Linux host nothing is split, and `XDG_DATA_HOME` reads
`D:\repo\.proof\transcript-proof\profile\local/rotaris/data`.

Observed 2026-09-23 in a Linux container on Node 24.21.0, with `pnpm test` on an unmodified `main` (`0382a9e`).
On a real Linux launch the profile path is POSIX-spelled already, so the harness itself probably isolates
correctly there. The test, however, cannot show that from a Linux host, which is the one host the test was
written to speak for.

## Specs

None contradicted directly; `CLAUDE.md` makes `pnpm check` green the gate before a commit, and on a
non-Windows host this suite is red on an unmodified tree.

## Relevant files

- `apps/desktop/scripts/lib/harness.mjs`: `proofIsolationEnv`, splitting on the host `sep`.
- `apps/desktop/scripts/lib/proof-isolation.test.ts`: the Windows-spelled `PROFILE` fixture and the two assertions.

## Repaired — 2026-09-24

`harness.mjs` converts a path to POSIX spelling with `toPosix`, which splits on both separators, instead of on the
host's `sep`. `proofIsolationEnv`, `workspacesRootFor` and `tokensDirFor` all use it, so the answer no longer depends
on the host the harness runs on. On a POSIX path the conversion is the identity. Evidence: `apps/desktop/scripts/lib`,
59 tests passing on Linux, including the two this note named.
