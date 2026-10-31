import { millis, type Millis, type Timers } from '@rotaris/kernel';

/**
 * REQ-SHELL-040: the status strip's workspace-path link opens the folder in the OS file manager, and neither failure is
 * silent — no handler for a folder, or a handler that cannot be launched. The platform's opener (Electron's
 * `shell.openPath`) answers an error string for a refusal it sees, but where the handler cannot be executed at all it can
 * leave its promise unsettled: measured 2026-10-02 on a Linux host with no `xdg-open` (`LaunchProcess: failed to execvp`),
 * the command never answered. So the opening is bounded: no answer within `bound` is the second failure, reported as such.
 */
export const OPEN_FOLDER_BOUND = millis(5_000);

export type OpenFolderOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * The same bounded opening for any path the platform's opener is handed, naming in the reason who did not answer. A file
 * opens through that opener too — REQ-SESSION-191's Open log and REQ-SHELL-142's third-party licence bundle — and met the
 * same unsettled promise unbounded until 2026-10-31
 * (`docs/defects/fixed/open-log-waits-on-the-platform-opener-without-a-bound.md`).
 */
export function openBounded(path: string, open: (path: string) => Promise<string>, timers: Timers, opener: string, bound: Millis = OPEN_FOLDER_BOUND): Promise<OpenFolderOutcome> {
  return new Promise((done) => {
    let settled = false;
    const finish = (outcome: OpenFolderOutcome) => { if (!settled) { settled = true; timer.cancel(); done(outcome); } };
    const timer = timers.after(bound, () => { finish({ ok: false, reason: `${opener} did not answer within ${bound / 1000} s` }); });
    open(path).then(
      (failed) => { finish(failed === '' ? { ok: true } : { ok: false, reason: failed }); },
      (cause: unknown) => { finish({ ok: false, reason: cause instanceof Error ? cause.message : String(cause) }); },
    );
  });
}

export function openFolder(path: string, open: (path: string) => Promise<string>, timers: Timers, bound: Millis = OPEN_FOLDER_BOUND): Promise<OpenFolderOutcome> {
  return openBounded(path, open, timers, 'the file manager', bound);
}

/** A file handed to the platform's opener (`shell.openPath`): the application the platform registers for it opens it. */
export function openFile(path: string, open: (path: string) => Promise<string>, timers: Timers, bound: Millis = OPEN_FOLDER_BOUND): Promise<OpenFolderOutcome> {
  return openBounded(path, open, timers, 'the platform opener', bound);
}
