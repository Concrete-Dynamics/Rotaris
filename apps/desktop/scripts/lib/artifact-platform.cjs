'use strict';
/**
 * Platform-shaped naming keys, shared by the synchronous hook and the ESM naming authority. `keys` are the configuration
 * keys electron-builder reads the platform's first artifact's name from; `also` lists every further artifact the
 * platform's one electron-builder run makes, each with its own key, kind and extension (PD-STARTUP-013: the Debian
 * package beside the AppImage).
 */
/** @param {string} platform @returns {{ keys: string[], kind: 'appimage' | 'setup', ext: string, also: { keys: string[], kind: 'deb', ext: string }[] }} */
function artifactPlatform(platform = 'win32') {
  if (platform === 'linux') return { keys: ['linux', 'appImage'], kind: 'appimage', ext: 'AppImage', also: [{ keys: ['deb'], kind: 'deb', ext: 'deb' }] };
  if (platform === 'win32') return { keys: ['win', 'nsis'], kind: 'setup', ext: 'exe', also: [] };
  throw new Error(`No artifact naming for ${platform}`);
}
module.exports = { artifactPlatform };
