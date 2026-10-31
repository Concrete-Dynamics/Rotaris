import { dirname, join } from 'node:path';
import type { ReportInput } from './notices.js';

/**
 * REQ-STARTUP-165 (c) — the one launch-preparation outcome the product reports, decided here and nowhere else
 * (`views/04-seams.md` §6). Pure but for the read it is handed: the marker's text in, the notice (or nothing) out, so a
 * test pins every word without an Electron process. Main reads the marker in its pre-window phase and raises the notice
 * from the post-show activation (`index.ts`).
 *
 * The channel is ADR-0054's, "How the application learns of it": the portable's launcher stub writes a marker into the
 * root of every tree it places (`apps/desktop/launcher/src/main.rs`, `marker_text`), and "the application reads it
 * relative to its own image" — deliberately not an environment variable (REQ-STARTUP-147's list is closed) and not a
 * launch argument (the product has none). The ordering is ADR-0055's phase −1: "the application reads that marker
 * relative to its own image during the pre-window phase, where it is one read of a file the fast path has already
 * touched, and holds the finding until after the show."
 *
 * Silence is the default and every doubt resolves to it: no marker beside the image (a source-tree launch, an installed
 * build, the AppImage), an unreadable one, another header or launcher format, and the outcome `prepared` — which covers
 * the preparing, reusing, superseding and redoing runs ADR-0054 says "stay silent under `REQ-STARTUP-150`" — all answer
 * nothing. Only `outcome run-scoped` is reported.
 */

/** The marker inside every tree the stub places (`MARKER` in `launcher/src/main.rs`). */
export const PREPARATION_MARKER = '.rotaris-preparation';
/** Its first line: the stub's `MARKER_HEADER` and `LAUNCHER_FORMAT`. Stub and application ship in one artifact, so one format. */
const MARKER_HEADER = 'rotaris-preparation';
const LAUNCHER_FORMAT = '1';
/** The stub's value for `unprepared-root` where it could resolve no per-user data directory at all (`run_scoped`). */
const NO_DATA_DIRECTORY = '(no per-user data directory)';
/**
 * The stub's preparation root is `<per-user data directory>/prepared` (`run` in `launcher/src/main.rs`). That last segment
 * is where within the directory a preparation goes — "the placement within it, which stays an implementation choice"
 * (REQ-STARTUP-165 (c)) — so the notice names the directory above it.
 */
const PREPARATION_ROOT = /^(.+?)[\\/]+prepared$/;

/** REQ-NOTIFY-224's once-per-key suppression: the notice is raised once per run however many windows are shown. */
export const PREPARATION_NOTICE_KEY = 'startup.preparation.run-scoped';

/** Which storage could not be prepared into, as the notice may name it. */
export type UnpreparedStorage =
  | { readonly kind: 'directory'; readonly path: string }
  /** The stub resolved no per-user data directory on this machine. */
  | { readonly kind: 'none' }
  /** A run-scoped marker that names no root; still warned about (REQ-STARTUP-150), with the storage unnamed. */
  | { readonly kind: 'unstated' };

/** A run that could make no preparation: the finding main holds from the pre-window phase until after the show. */
export interface PreparationFinding {
  readonly storage: UnpreparedStorage;
}

const ABSOLUTE = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/;

/** The per-user data directory the stub's preparation root sits in; a root of another shape is named as given. */
function dataDirectoryOf(root: string): string {
  const trimmed = root.replace(/[\\/]+$/, '');
  const match = PREPARATION_ROOT.exec(trimmed);
  return match ? match[1]! : trimmed;
}

/** Whether a root names a directory the notice can print. A bare `/` (or `\`) leaves nothing to name, which the stub never writes. */
function namesADirectory(root: string): boolean {
  return dataDirectoryOf(root) !== '';
}

/** The marker's text in, the finding to hold out; `undefined` for every outcome that stays silent and every malformed text. */
export function preparationFindingOf(text: string | undefined): PreparationFinding | undefined {
  if (text === undefined) return undefined;
  const headerEnd = text.indexOf('\n');
  const words = (headerEnd === -1 ? text : text.slice(0, headerEnd)).trim().split(/\s+/);
  if (words.length !== 2 || words[0] !== MARKER_HEADER || words[1] !== LAUNCHER_FORMAT) return undefined;
  let outcome: string | undefined;
  let root: string | undefined;
  // The stub writes one `file` line per payload file after `entry` (`marker_text`): on the order of 10,000 lines, on every
  // prepared launch, inside REQ-STARTUP-155's first-paint budget. `outcome` and `unprepared-root` precede `entry`, so the
  // walk ends there and the file list is never split.
  for (let end = headerEnd; end !== -1;) {
    const from = end + 1;
    end = text.indexOf('\n', from);
    const line = (end === -1 ? text.slice(from) : text.slice(from, end)).replace(/\r$/, '');
    const space = line.indexOf(' ');
    const field = space === -1 ? line : line.slice(0, space);
    const rest = space === -1 ? '' : line.slice(space + 1);
    if (field === 'entry') break;
    // Later lines win, as the stub's own `read_marker` reads them.
    if (field === 'outcome') outcome = rest.trim();
    else if (field === 'unprepared-root') root = rest.trim();
  }
  if (outcome !== 'run-scoped') return undefined;
  if (root === NO_DATA_DIRECTORY) return { storage: { kind: 'none' } };
  if (root !== undefined && ABSOLUTE.test(root) && namesADirectory(root)) return { storage: { kind: 'directory', path: dataDirectoryOf(root) } };
  return { storage: { kind: 'unstated' } };
}

/**
 * The read, relative to the application's own image: the marker sits beside the executable the launch runs, and
 * `execPath` is that executable, so its directory is the tree the stub placed. A read that fails is a launch with no
 * marker, which is every ordinary launch.
 */
export function readPreparationFinding(execPath: string, read: (path: string) => string): PreparationFinding | undefined {
  let text: string;
  try {
    text = read(join(dirname(execPath), PREPARATION_MARKER));
  } catch {
    return undefined;
  }
  return preparationFindingOf(text);
}

/**
 * The notice REQ-STARTUP-165 (c) requires, at warning severity on the persistent surface the update offer of
 * REQ-STARTUP-116 uses (`report`, never `update`). The three things it SHALL convey, sentence by sentence:
 *
 * - the title, (1): that the artifact could not prepare itself and is therefore starting the slow way;
 * - the message's first sentence, (2): which storage it could not prepare into, named as the per-user data directory of
 *   clause (a) and REQ-STARTUP-145 — never the placement within it, and never the run-scoped placement this run used;
 * - its second sentence, (3): that every launch will cost what this one cost until that storage accepts a preparation,
 *   closed by a clause saying the product otherwise works, so nothing states or implies the artifact cannot be used.
 *
 * Nothing in it is the vocabulary of REQ-STARTUP-166's workspace-storage warning, which lands on the same surface at the
 * same severity: no workspace, no shared or synchronised storage, no project (ADR-0054, "What must not happen on this
 * path"). The glossary's word is "preparation"; "extraction", "unpack" and "cache" are the words it avoids.
 */
export function preparationNotice(finding: PreparationFinding): ReportInput {
  const where = finding.storage.kind === 'directory'
    ? `It could not prepare itself in its per-user data directory, ${finding.storage.path}.`
    : finding.storage.kind === 'none'
      ? 'It found no per-user data directory on this machine to prepare itself in.'
      : 'It could not prepare itself in its per-user data directory.';
  const until = finding.storage.kind === 'none' ? 'until a per-user data directory accepts a preparation' : 'until that directory accepts a preparation';
  return {
    severity: 'warning',
    key: PREPARATION_NOTICE_KEY,
    title: 'Rotaris could not prepare itself, so it is starting the slow way',
    message: `${where} Every launch will take as long as this one ${until}; Rotaris otherwise works as usual.`,
  };
}
