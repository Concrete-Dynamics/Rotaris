## Seven unit cases pin a POSIX or case-sensitive host and go red on Windows

**Repaired 2026-10-15** (the owner's ruling for the Windows ARM64 session that day: repair the test-side defects, baseline
the product and host reds). Each case was red in both full runs at `b9e30052` and alone, and is green after on the same host
under pwsh 7.6.6 arm64, with the units unchanged: (1) the expectation joins `Crashpad` with the host's `path.join`; (2)
`fileURLToPath`; (3) and (4) the expectation keyed on the host, `ENOENT` admitted on Windows and step 9's `EPERM` there;
(5) the filesystem's case sensitivity is probed with a name of its own and `A.ts` written only where it is a second file;
(6) **skipped on Windows, not passed**: Git for Windows 2.55.0 refuses `1:x.md` in the index by every route tried
(`update-index --cacheinfo` with and without `core.protectNTFS=false`, and `mktree` then `read-tree`), so no Windows
repository can hold the entry the case reads; (7a) the staged script's path matched with `[\\/]1\.sh`; (7b) the `Count` and
`Property` rows matched with any padding.

Found 2026-10-15 by the full suite on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev
tree, pwsh 7.6.7 launching it, at `b9e30052` (A1 of the Windows ARM64 session): red in both full runs and alone. In each the
product does what it should on this host, and the case's expectation is written for another one. Since 2026-09-16 the suite
has run only on Linux, and these were written or changed there.

1. `apps/desktop/src/main/chromium-profile.test.ts`, "Linux: below the data directory …": asks for a Linux profile on a Windows
   host and expects `crashDumps` to start with `${profile}/`. `placeChromiumProfile` joins `Crashpad` with the host's
   `path.join` (right in production, where the profile is always the host's), so it reads `…/chromium\Crashpad`.
2. `packages/agent-tools/src/manifest.test.ts`: `new URL('.', import.meta.url).pathname` is `/C:/dev/…` on Windows, and
   `readdirSync` reads it as `C:\C:\dev\…` (ENOENT). `fileURLToPath` is the portable spelling.
3. `packages/platform/src/platform.test.ts`, the two replace forms "for the target f/doc under a regular file f without parent
   creation": the right code is answered (`document.stage`, `document.replace.sync`), but its detail is Windows' `ENOENT`
   where the expectation allows only `EEXIST|ENOTDIR`.
4. `packages/store/src/store.test.ts`, OQ-265's "a delete that fails is listed in leftovers …": the sentence is right and
   names the code the host reported, `EPERM`, where the expectation spells Linux's `ENOTEMPTY`.
5. `packages/agent-tools/src/tools/tools.test.ts`, "a named file is searched alone: its own case only …": on a
   case-insensitive filesystem (NTFS here, APFS by default on macOS) writing `src/A.ts` overwrites `src/a.ts`, and the
   unconditional expectation of `a.ts`'s two lines cannot hold; only the line after it is guarded by `caseSensitive`.
6. `tools/check-conflict-markers.test.ts`, "reads a staged path whose name begins with a digit and a colon …": Git for Windows
   refuses `1:x.md` (`error: Invalid path '1:x.md'`, `core.protectNTFS`), so the case cannot build its precondition.
7. `packages/agent-tools/src/terminal/terminal.test.ts`: (a) the pure case "REQ-TOOLS-096 (live-run M1): a POSIX command too
   long for one PTY line is staged …" matches the staged script's path with `/1\.sh`, and on a Windows host the script sits
   under a backslash-spelled temporary directory; (b) the real-PTY case "the capture is the emulated screen" pins pwsh 7's
   `Format-List` width (`Count             : 2`), which Windows PowerShell 5.1 prints as `Count    : 2` (the suite ran under
   5.1 here: [the alias note](the-terminal-never-finds-a-pwsh-installed-as-an-app-execution-alias.md)).

## Specs

None: each is a test whose expectation is spelled for one host. They matter because they keep `pnpm check` red on every
Windows host, which hides a red that is the product's (three on this run).

## Relevant files

The seven test files above; `apps/desktop/src/main/chromium-profile.ts` and `packages/agent-tools/src/terminal/foreground.ts`
(`posixCommand`'s staging) are the units they read, unchanged.
