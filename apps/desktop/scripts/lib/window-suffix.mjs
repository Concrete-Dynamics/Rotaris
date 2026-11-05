/**
 * The name a proof gives `useWindow` for a main window: a suffix of its workspace path.
 *
 * The driver seam (`apps/desktop/src/main/index.ts`, `window`) picks the main window whose workspace path, as the
 * platform writes it, ends with the name, ignoring case. On Windows that path is written with backslashes, so a name
 * spelled with a forward slash never matches there. `part-j-proof`'s two-window launch named its windows
 * `'pair-b/workspace'` and `'pair-a/workspace'`, and on Windows it stopped at "no window matches" before the pair stage
 * took any reading (`docs/archive/defects/part-j-proofs-two-window-launch-names-a-window-by-a-forward-slash-suffix-that-never-matches-on-windows.md`).
 */

/**
 * The workspace-path suffix naming `segments`, joined with the separator `platform` writes paths with.
 * @param {readonly string[]} segments the trailing directories, outermost first
 * @param {NodeJS.Platform} [platform]
 * @returns {string}
 */
export function workspaceSuffix(segments, platform = process.platform) {
  return segments.join(platform === 'win32' ? '\\' : '/');
}
