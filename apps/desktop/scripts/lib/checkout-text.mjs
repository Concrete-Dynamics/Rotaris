/**
 * REQ-WORKSPACE-050: what `injection-proof`'s isolated launch expects the model to receive from a workspace instruction
 * file read in the run's worktree.
 *
 * The product reads the file the execution root holds, and that file is Git's checkout of the committed text. A
 * checkout may write the committed LF line endings as CRLF: Git for Windows installs `core.autocrlf=true` in its system
 * configuration, and the scratch workspace's repository inherits it. Until 2026-11-04 the proof compared the received
 * block with the committed LF text itself, so on such a host the isolated launch was red although the product had read
 * exactly what the worktree held
 * (`docs/archive/defects/injection-proofs-isolated-launch-compares-a-crlf-checkout-with-the-committed-lf-text.md`).
 *
 * The expectation is therefore the text the worktree holds, accepted only when it IS the committed text as a checkout
 * writes it: byte for byte, or with every line ending written as CRLF. Anything else (the base's working copy, a
 * stale tree, a half-converted file) is no checkout of the commit, and the proof fails on it as before.
 */

/**
 * The checked-out text when `onDisk` is `committed` as a Git checkout writes it, otherwise `null`.
 * @param {string} committed the text as committed, LF line endings
 * @param {string} onDisk the text the worktree holds
 * @returns {string | null}
 */
export function checkoutOf(committed, onDisk) {
  if (onDisk === committed) return onDisk;
  if (committed.includes('\r')) return null;
  return onDisk === committed.replace(/\n/g, '\r\n') ? onDisk : null;
}
