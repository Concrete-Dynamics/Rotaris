## Open log waits on the platform opener without a bound

REQ-SESSION-191's "Open log" (`session.openLog`, `apps/desktop/src/main/commands/library.ts`) answers only once
`shell.openPath(r.files.log)` settles, with no bound. The status strip's open-folder (REQ-SHELL-040) faced the same opener and
was bounded for it: `apps/desktop/src/main/open-folder.ts` records that on a Linux host with no `xdg-open` the opener's promise
never settled (measured 2026-10-02), and wraps it in `OPEN_FOLDER_BOUND` (5 s) so that failure is reported rather than silent.
Open log has no such wrapper, so on a host where the opener cannot be launched its command would wait for good and the
person would see nothing.

Found by reading during the Windows ARM64 session's D2, not by a failure: on Windows (Windows 11 ARM64 (build 26200.9457),
Electron 44.1.1 arm64, dev tree, built at `dbf6a514`) Open log answered `ok` in 469 and 767 ms on two launches, and Reveal files
(`shell.showItemInFolder`, which returns nothing) opened Explorer on the session's directory. The unbounded wait was not
reproduced; it needs a host whose opener cannot run.

## Specs

REQ-SESSION-191 (the log opened for reading, a missing file reported, never faked) and REQ-SHELL-040's sibling rule that
neither failure of the opener is silent; Open log meets the first failure (an error string) and not the second (no answer).

## Relevant files

- `apps/desktop/src/main/commands/library.ts` — `onSessionOpenLog`, `await shell.openPath(r.files.log)`.
- `apps/desktop/src/main/open-folder.ts` — `openFolder` and `OPEN_FOLDER_BOUND`, the bounded form the strip uses.
