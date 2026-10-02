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

export function openFolder(path: string, open: (path: string) => Promise<string>, timers: Timers, bound: Millis = OPEN_FOLDER_BOUND): Promise<OpenFolderOutcome> {
  return new Promise((done) => {
    let settled = false;
    const finish = (outcome: OpenFolderOutcome) => { if (!settled) { settled = true; timer.cancel(); done(outcome); } };
    const timer = timers.after(bound, () => { finish({ ok: false, reason: `the file manager did not answer within ${bound / 1000} s` }); });
    open(path).then(
      (failed) => { finish(failed === '' ? { ok: true } : { ok: false, reason: failed }); },
      (cause: unknown) => { finish({ ok: false, reason: cause instanceof Error ? cause.message : String(cause) }); },
    );
  });
}
