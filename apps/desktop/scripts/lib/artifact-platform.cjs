'use strict';
/** Platform-shaped naming keys, shared by the synchronous hook and the ESM naming authority. */
/** @param {string} platform @returns {{ keys: string[], kind: 'appimage' | 'setup', ext: string }} */
function artifactPlatform(platform = 'win32') {
  if (platform === 'linux') return { keys: ['linux', 'appImage'], kind: 'appimage', ext: 'AppImage' };
  if (platform === 'win32') return { keys: ['win', 'nsis'], kind: 'setup', ext: 'exe' };
  throw new Error(`No artifact naming for ${platform}`);
}
module.exports = { artifactPlatform };
