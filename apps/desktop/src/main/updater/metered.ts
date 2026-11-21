/**
 * UD-1 of PD-STARTUP-008 (the owner, 2026-11-21, R-117; REQ-STARTUP-169): where the platform reports the connection as
 * metered, the download does not start on its own and the offer is presented with `Update now` (REQ-STARTUP-116). A
 * connection whose cost the platform does not report is treated as not metered, and no preference key is added
 * (REQ-STARTUP-146).
 *
 * The answer the updater asks for (`UpdaterDeps.connectionCost`); `electron.ts` reads it from the platform, and a test
 * fakes it. Only `metered` holds the download back.
 */
export type ConnectionCost = 'metered' | 'not-metered' | 'unknown';

/**
 * Linux: NetworkManager's `Metered` property of its root object (`org.freedesktop.NetworkManager`), an `NMMetered` value —
 * 0 unknown, 1 yes, 2 no, 3 guess-yes, 4 guess-no (NetworkManager's D-Bus API reference). Read with
 * `gdbus call --system … org.freedesktop.DBus.Properties.Get org.freedesktop.NetworkManager Metered`, which prints the
 * variant as `(<uint32 4>,)`. Yes and guess-yes are metered; no and guess-no are not; anything else — 0, an output this
 * build does not recognise, no NetworkManager — is unknown, which UD-1 reads as not metered.
 */
export const NM_METERED_ARGS: readonly string[] = Object.freeze([
  'call', '--system',
  '--dest', 'org.freedesktop.NetworkManager',
  '--object-path', '/org/freedesktop/NetworkManager',
  '--method', 'org.freedesktop.DBus.Properties.Get',
  'org.freedesktop.NetworkManager', 'Metered',
]);

/** How long the platform's answer is waited for before the cost is read as unknown; the check never waits on it longer. */
export const METERED_QUERY_TIMEOUT_MS = 2_000;

export function parseNetworkManagerMetered(stdout: string): ConnectionCost {
  const match = /uint32\s+(\d+)/.exec(stdout);
  if (match === null) return 'unknown';
  switch (Number(match[1])) {
    case 1:
    case 3:
      return 'metered';
    case 2:
    case 4:
      return 'not-metered';
    default:
      return 'unknown';
  }
}
