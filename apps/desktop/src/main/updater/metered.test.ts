import { describe, expect, it } from 'vitest';
import { NM_METERED_ARGS, parseNetworkManagerMetered } from './metered.js';

/** UD-1 (PD-STARTUP-008, R-117): NetworkManager's `Metered` property read as the updater's connection cost. */
describe('the connection cost from NetworkManager — UD-1', () => {
  it('reads yes and guess-yes as metered, no and guess-no as not, and everything else as unknown (not metered)', () => {
    expect(parseNetworkManagerMetered('(<uint32 1>,)\n')).toBe('metered');
    expect(parseNetworkManagerMetered('(<uint32 3>,)\n')).toBe('metered');
    expect(parseNetworkManagerMetered('(<uint32 2>,)\n')).toBe('not-metered');
    // Measured on the Linux agent host, 2026-11-21.
    expect(parseNetworkManagerMetered('(<uint32 4>,)\n')).toBe('not-metered');
    expect(parseNetworkManagerMetered('(<uint32 0>,)\n')).toBe('unknown');
    expect(parseNetworkManagerMetered('(<uint32 9>,)')).toBe('unknown');
    expect(parseNetworkManagerMetered('')).toBe('unknown');
    expect(parseNetworkManagerMetered('Error: GDBus.Error:org.freedesktop.DBus.Error.ServiceUnknown')).toBe('unknown');
  });

  it('asks the system bus for the property of NetworkManager\'s root object, and nothing else', () => {
    expect(NM_METERED_ARGS).toEqual(['call', '--system', '--dest', 'org.freedesktop.NetworkManager', '--object-path', '/org/freedesktop/NetworkManager', '--method', 'org.freedesktop.DBus.Properties.Get', 'org.freedesktop.NetworkManager', 'Metered']);
  });
});
