import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';
import { pathKey } from './canonical.js';
import { localAppDataDirectory, xdgBaseDirectory } from './dirs.js';
import { guardedRead, replaceDocument, replaceDocumentSync } from './document.js';

export const PREFERENCE_KEYS = {
  'appearance/theme': { type: 'string', default: undefined, owner: 'REQ-SHELL-128', coerce: (value: unknown) => typeof value === 'string' ? value : undefined },
  'interface/settingsTab': { type: 'string', default: 'models', owner: 'REQ-CONFIG-271', coerce: (value: unknown) => typeof value === 'string' ? value : 'models' },
  'ui/reduced_motion': { type: 'boolean', default: undefined, owner: 'REQ-SHELL-135', coerce: (value: unknown) => value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined },
  /** REQ-SHELL-069: the Overview's two-pane split — version 1, pane count 2, the sizes; anything else reads as nothing stored. */
  'panels/overview': { type: 'object', default: undefined, owner: 'REQ-SHELL-069', coerce: (value: unknown) => coercePaneLayout(value, 2) },
  /** REQ-GIT-076/153: the Git view's two-column split, keyed `git` as REQ-SHELL-069 fixes; an unusable value restores the declared default. */
  'panels/git': { type: 'object', default: undefined, owner: 'REQ-SHELL-069', coerce: (value: unknown) => coercePaneLayout(value, 2) },
  /**
   * REQ-LIBRARY-106 / REQ-SHELL-069 (Part X): the Prompts tab's two-column split, keyed by the lower-cased view name.
   * No `{view}.{arrangement}` suffix — that form is for "a view carrying more than one independent multi-pane
   * arrangement", and the Library carries one: the other two tabs declare no divider.
   */
  'panels/library': { type: 'object', default: undefined, owner: 'REQ-SHELL-069', coerce: (value: unknown) => coercePaneLayout(value, 2) },
  /** REQ-SHELL-073 / REQ-MONITOR-072: "agent pop-out" — an ordinary agent click opens the persona window; default off; persists across windows and restarts. */
  'interface/agentPopOut': { type: 'boolean', default: false, owner: 'REQ-SHELL-073', coerce: (value: unknown) => value === true || value === 'true' },
  /**
   * REQ-CHAT-067 (Part Z): the tool-grouping display setting, default **ON** — the one member of REQ-CHAT-067's
   * pair whose default is on. A desktop preference written user-wide (REQ-CONFIG-405) and explicitly NOT part of
   * the YAML configuration surface, unlike REQ-CHAT-166's four caps, which are workspace configuration.
   * An absent or unusable value reads as ON, which is the declared default rather than a coercion accident.
   */
  'display/groupTools': { type: 'boolean', default: true, owner: 'REQ-CHAT-067', coerce: (value: unknown) => value !== false && value !== 'false' },
  /**
   * Part AA — REQ-CHAT-167 registers this key BY NAME ("stored in the desktop preference store under the
   * registered key `display/showReasoning`"), REQ-SHELL-006 being the registration this list is. Default **off**,
   * so reasoning rows summarize per REQ-CHAT-062 and reveal nothing until asked. Written user-wide like every
   * desktop preference (REQ-CONFIG-405) and not part of the YAML configuration surface.
   */
  'display/showReasoning': { type: 'boolean', default: false, owner: 'REQ-CHAT-167', coerce: (value: unknown) => value === true || value === 'true' },
  /** REQ-CHAT-067: auto-collapse all but the most recent tool-call/result pair; default **off**; a desktop preference, not YAML. */
  'display/autoCollapseTools': { type: 'boolean', default: false, owner: 'REQ-CHAT-067', coerce: (value: unknown) => value === true || value === 'true' },
  /**
   * REQ-CHAT-010 / REQ-SHELL-069 (Part AB): the Workspace view's transcript/composer divider, keyed by the
   * lower-cased view name with no `{view}.{arrangement}` suffix — the Workspace carries ONE multi-pane
   * arrangement, exactly as the Library does. Pane count 2, sizes `[transcript, composer]`; the declared
   * defaults are REQ-CHAT-010's own figures (composer 150 px, composer minimum 110 px, transcript minimum
   * 180 px) and anything else reads as nothing stored.
   */
  'panels/workspace': { type: 'object', default: undefined, owner: 'REQ-SHELL-069', coerce: (value: unknown) => coercePaneLayout(value, 2) },
  // Part AK2
  /**
   * Spec 08 §Persisted state (Part AK′; REQ-TRACE-301): the requirements board's PERSON-level keys — "a property of
   * the person" — registered here by name because REQ-SHELL-006 makes this table the only place a key exists. The
   * filter's six dimensions (REQ-TRACE-290), the sort order (287), the grouping axis (293) and whether blocked cards
   * gather into a column of their own (241) are all strings the board reads once at mount; a stored sort or axis
   * this build no longer offers is reverted by `ui-core`'s `sortOrderOf`/`axisOf` (REQ-TRACE-302), not here, so the
   * store stays a store. `requirements/blocked_column` reads as true for ANY value other than the string `false`,
   * case-insensitively (the table's own rule), and boolean reads tolerate however the backend spelled them.
   *
   * The last three are REQ-CONFIG-405's — the released-run elevation switch, its silenced disclosure and the
   * answer-wait budget (REQ-TRACE-467..474) — registered with this family because the plan reserves `requirements/*`
   * for this part; Part AP reads them and this part never does. Column folds are the one PER-WORKSPACE key of the
   * table and are the parametrised family below.
   */
  'requirements/filter/text': { type: 'string', default: '', owner: 'REQ-TRACE-290', coerce: (value: unknown) => (typeof value === 'string' ? value : '') },
  'requirements/filter/epic': { type: 'string', default: '', owner: 'REQ-TRACE-290', coerce: (value: unknown) => (typeof value === 'string' ? value : '') },
  'requirements/filter/source': { type: 'string', default: '', owner: 'REQ-TRACE-290', coerce: (value: unknown) => (typeof value === 'string' ? value : '') },
  'requirements/filter/lifecycle': { type: 'string', default: '', owner: 'REQ-TRACE-290', coerce: (value: unknown) => (typeof value === 'string' ? value : '') },
  'requirements/filter/health': { type: 'string', default: '', owner: 'REQ-TRACE-290', coerce: (value: unknown) => (typeof value === 'string' ? value : '') },
  'requirements/filter/priority': { type: 'string', default: '', owner: 'REQ-TRACE-290', coerce: (value: unknown) => (typeof value === 'string' ? value : '') },
  'requirements/sort': { type: 'string', default: 'priority', owner: 'REQ-TRACE-287', coerce: (value: unknown) => (typeof value === 'string' && value !== '' ? value : 'priority') },
  'requirements/blocked_column': { type: 'boolean', default: true, owner: 'REQ-TRACE-241', coerce: (value: unknown) => !(value === false || (typeof value === 'string' && value.trim().toLowerCase() === 'false')) },
  'requirements/axis': { type: 'string', default: 'delivery', owner: 'REQ-TRACE-293', coerce: (value: unknown) => (typeof value === 'string' && value !== '' ? value : 'delivery') },
  'requirements/fullPermissionRuns': { type: 'boolean', default: true, owner: 'REQ-CONFIG-405', coerce: (value: unknown) => !(value === false || (typeof value === 'string' && value.trim().toLowerCase() === 'false')) },
  'requirements/fullPermissionNoticeSuppressed': { type: 'boolean', default: false, owner: 'REQ-CONFIG-405', coerce: (value: unknown) => value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true') },
  'requirements/answerWaitSeconds': { type: 'number', default: 0, owner: 'REQ-CONFIG-405', coerce: (value: unknown) => { const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN; return Number.isFinite(n) && n >= 0 ? n : 0; } },
  /**
   * Part AL2 — REQ-SHELL-109: the terminal window's auto-open preference, default **off**, persisted user-wide like every
   * desktop preference (REQ-CONFIG-405) and never YAML. Written by the terminal window's own control through
   * `window.terminalAutoOpen` (main resolves the key, as it does for the composer draft) and read by main's frame
   * observer: a stream that changes while running and the window is closed opens it without taking focus.
   */
  'terminal/autoOpen': { type: 'boolean', default: false, owner: 'REQ-SHELL-109', coerce: (value: unknown) => value === true || value === 'true' },
  /**
   * Stage B — REQ-STARTUP-146 owns this key and REQ-SHELL-006 makes this table the only place it exists. It is
   * the one key here that decides what a launch OPENS (REQ-SHELL-010 (b)), and the reason REQ-SHELL-006 keeps
   * this store unreplicated: it holds a path that describes *this* machine.
   *
   * The default `undefined` means nothing has been opened yet, which is a different state from a remembered path
   * that no longer names a directory — REQ-WORKSPACE-007 forbids overwriting the latter, so that check belongs to
   * the resolution in main and NOT here. This coerce answers `undefined` only for a value that is not a usable
   * string at all; it never inspects the filesystem, because a store that reported "no workspace" for a folder on
   * a detached drive would silently lose the user's project.
   *
   * Written by MAIN alone: it is deliberately absent from `PREFERENCE_COMMAND_KEYS`, so no renderer can set it.
   */
  'workspace/lastOpened': { type: 'string', default: undefined, owner: 'REQ-STARTUP-146', coerce: (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value : undefined) },
  /**
   * REQ-STARTUP-146's second key, REQ-STARTUP-116/117's meaning (the updater, first-release-plan.md §4.6, 2026-09-28):
   * the ONE waved-off update version — a single version string, never a list. Written by main alone, when the update
   * offer naming that version is dismissed and before it is cleared; read at every check, where an offer of exactly
   * that version is silently ignored and any newer version notifies again. Absent means nothing was waved off.
   *
   * Like `workspace/lastOpened` it is deliberately absent from `PREFERENCE_COMMAND_KEYS`, so no renderer can read or
   * write it. Nothing in this store disables the check itself: REQ-STARTUP-111 forbids such a key, and this is not one.
   */
  'updates/dismissedVersion': { type: 'string', default: undefined, owner: 'REQ-STARTUP-146', coerce: (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value : undefined) },
} as const;

/**
 * Part AK2 — REQ-TRACE-312/313 (spec 08 §Persisted state): `workspaces/<key>/requirementColumnFolds`, the board's
 * column folds, "remembered per workspace, keyed by the workspace's resolved absolute path with a literal fallback
 * key when the board has no workspace". The SECOND parametrised family of this table, shaped exactly like the
 * composer draft's: `<key>` is `workspaceKey`'s digest of the path (a path carries both separators and REQ-SHELL-006's
 * keys are slash-namespaced), or the literal `default` when no workspace is open. The value is ONE JSON object string
 * mapping column key to boolean, keys sorted (REQ-TRACE-313), written whole so two windows resolve by last writer
 * wins; the default `{}` is the table's own. Reading never raises: a non-string reads as `{}`, and `ui-core`'s
 * `parseFolds` turns an unparseable string into no folds (REQ-TRACE-315).
 */
const REQUIREMENT_FOLDS = { type: 'string', default: '{}', owner: 'REQ-TRACE-312', coerce: (value: unknown) => (typeof value === 'string' ? value : '{}') } as const;
const REQUIREMENT_FOLDS_KEY = /^workspaces\/(?:[0-9a-f]{16}|default)\/requirementColumnFolds$/;
export type RequirementColumnFoldsKey = `workspaces/${string}/requirementColumnFolds`;
/** REQ-TRACE-312's "literal fallback key when the board has no workspace". */
export const REQUIREMENT_FOLDS_NO_WORKSPACE = 'default';
export function requirementColumnFoldsKey(workspacePath: string | undefined, platform: NodeJS.Platform = process.platform): RequirementColumnFoldsKey {
  return `workspaces/${workspacePath === undefined || workspacePath === '' ? REQUIREMENT_FOLDS_NO_WORKSPACE : workspaceKey(workspacePath, platform)}/requirementColumnFolds`;
}

/**
 * REQ-SHELL-159 / REQ-CHAT-015 / REQ-NOTIFY-066 (Part AB): the per-workspace composer draft. It is the FIRST
 * **parametrised** row of this table, and the distinction matters because REQ-SHELL-006 closes the key set.
 * What REQ-SHELL-159 registers is literally `workspaces/{workspace-key}/composerDraft` — a template — so what
 * is closed is the family and its shape, and the only way to mint a member is `composerDraftKey`, which takes
 * a workspace path. A caller cannot spell one by hand and reach `PreferenceStore`: `preferenceEntry` refuses
 * a key that is neither in the table above nor a member of this family, which keeps "a key that does not
 * appear in that table does not exist" true of a family as it is of a literal.
 *
 * The default is the empty string, REQ-SHELL-159's own. The 400 ms write debounce and its four flush points
 * are the CALLER's (ADR-0042's decision: "ordinary keys may be debounced; the composer draft uses the 400 ms
 * debounce with its four named flush points"), and are not this store's business — the store writes when it
 * is told to, whole or not at all.
 */
const COMPOSER_DRAFT = { type: 'string', default: '', owner: 'REQ-SHELL-159', coerce: (value: unknown) => (typeof value === 'string' ? value : '') } as const;
const COMPOSER_DRAFT_KEY = /^workspaces\/[0-9a-f]{16}\/composerDraft$/;
export type ComposerDraftKey = `workspaces/${string}/composerDraft`;

/**
 * REQ-SHELL-159 keys the draft "by workspace path"; REQ-SHELL-006 makes keys slash-namespaced. A workspace
 * path carries both separators and, on Windows, a colon, so embedding one would make the namespace ambiguous
 * and the key unparseable. The key is therefore a stable digest of `pathKey` — the identity spelling every other
 * per-workspace comparison in this product uses (W-27, ADR-0058 rule 6), case-folded on Windows — which is a
 * function of the path and so is "keyed by workspace path", while two different workspaces can never collide onto
 * one draft and two spellings of ONE workspace can never split it in two (REQ-CHAT-015).
 */
export function workspaceKey(workspacePath: string, platform: NodeJS.Platform = process.platform): string {
  return createHash('sha256').update(pathKey(workspacePath, platform)).digest('hex').slice(0, 16);
}
export function composerDraftKey(workspacePath: string, platform: NodeJS.Platform = process.platform): ComposerDraftKey {
  return `workspaces/${workspaceKey(workspacePath, platform)}/composerDraft`;
}

/** REQ-SHELL-006: the registry entry for a key, or a refusal — the runtime half of "an unregistered key does not exist". */
export function preferenceEntry(key: PreferenceKey): { readonly coerce: (value: unknown) => unknown } {
  if (key in PREFERENCE_KEYS) return PREFERENCE_KEYS[key as keyof typeof PREFERENCE_KEYS];
  if (COMPOSER_DRAFT_KEY.test(key)) return COMPOSER_DRAFT;
  if (REQUIREMENT_FOLDS_KEY.test(key)) return REQUIREMENT_FOLDS; // Part AK2 — the second family, registered above.
  throw new Error(`preference key ${key} is not registered (REQ-SHELL-006)`);
}
export interface PaneLayout { readonly version: 1; readonly panes: number; readonly sizes: readonly number[] }
export function coercePaneLayout(value: unknown, panes: number): PaneLayout | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as { version?: unknown; panes?: unknown; sizes?: unknown };
  if (v.version !== 1 || v.panes !== panes || !Array.isArray(v.sizes) || v.sizes.length !== panes || !v.sizes.every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined;
  return { version: 1, panes, sizes: [...(v.sizes as number[])] };
}
export type PreferenceKey = keyof typeof PREFERENCE_KEYS | ComposerDraftKey | RequirementColumnFoldsKey; // Part AK2: the folds family.
export type PreferenceValue<K extends PreferenceKey> = K extends keyof typeof PREFERENCE_KEYS ? ReturnType<(typeof PREFERENCE_KEYS)[K]['coerce']> : string;

export interface PreferenceRootEnv { readonly platform: NodeJS.Platform; readonly env: Readonly<Record<string, string | undefined>>; readonly home: string; }

/**
 * ADR-0042: benchmark override, configuration home, then the platform's machine-local settings location. The configuration
 * home (`XDG_CONFIG_HOME`, REQ-UIBENCH-039) is honoured on Linux alone, as OQ-33 was ruled (R-071): on Windows and macOS
 * the benchmark-private variable carries the same job. That is the branch `resolveUserDirs` reads it on, so the preference
 * store and the rest of the per-user state never part, and through the same reading (`xdgBaseDirectory`: an empty or relative
 * value takes the default; on Windows `localAppDataDirectory`, the same for `LOCALAPPDATA`; both are REQ-STARTUP-147's
 * platform-convention directory variables since its amendment of 2026-10-13, OQ-247). Until fin22 it was read before the platform branch, on every platform
 * (`docs/defects/fixed/the-preference-root-honours-xdg-config-home-on-every-platform.md`).
 */
export function resolvePreferenceRoot(e: PreferenceRootEnv = { platform: process.platform, env: process.env, home: homedir() }): string {
  // The platform is a PARAMETER, so the separator comes from IT and not from the host — the same rule
  // `canonicalPath` and `resolveUserDirs` follow, and for the same reason.
  const { join } = e.platform === 'win32' ? win32 : posix;
  const overridden = e.env['ROTARIS_PREFERENCES_ROOT'];
  if (overridden) return overridden;
  if (e.platform === 'win32') return join(localAppDataDirectory(e.env['LOCALAPPDATA'], join(e.home, 'AppData', 'Local')), 'Rotaris', 'Rotaris');
  if (e.platform === 'darwin') return join(e.home, 'Library', 'Application Support', 'Rotaris', 'Rotaris');
  return join(xdgBaseDirectory(e.env['XDG_CONFIG_HOME'], join(e.home, '.config')), 'Rotaris', 'Rotaris');
}

type DocumentShape = Partial<Record<PreferenceKey, unknown>>;
// Top-level keys sorted so two writes of the same state are byte-identical. NOT the replacer-array form: a key list
// handed to JSON.stringify filters every level, so the first nested value (a pane layout, REQ-SHELL-069) was written
// as `{}` and read back as nothing stored — found on ADR-0042's second execution.
const serialise = (document: DocumentShape): string => `${JSON.stringify(Object.fromEntries(Object.entries(document).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), null, 2)}\n`;

export class PreferenceStore {
  readonly file: string;
  /**
   * The platform decides the separator of the one path this store builds — the same rule
   * `resolveUserDirs` and `dataLayout` follow. In production it is always the host's own, so the
   * parameter is one callers pass only when asking for another platform's answer.
   */
  constructor(readonly root: string, platform: NodeJS.Platform = process.platform) {
    this.file = (platform === 'win32' ? win32 : posix).join(root, 'preferences.json');
  }

  private document(): DocumentShape {
    const read = guardedRead<DocumentShape>(this.file, (raw) => JSON.parse(raw) as DocumentShape);
    return read.state === 'readable' && read.value && typeof read.value === 'object' ? read.value : {};
  }

  read<K extends PreferenceKey>(key: K): PreferenceValue<K> {
    return preferenceEntry(key).coerce(this.document()[key]) as PreferenceValue<K>;
  }

  async write<K extends PreferenceKey>(key: K, value: PreferenceValue<K>): Promise<void> {
    preferenceEntry(key); // REQ-SHELL-006: the gate is the same on the way in as on the way out.
    const document = this.document();
    if (value === undefined) delete document[key]; else document[key] = value;
    const result = await replaceDocument(this.file, serialise(document), { createParent: true });
    if (!result.ok) throw new Error(`${result.error.headline}: ${result.error.detail ?? result.error.code}`);
  }

  writeThemeSync(value: string): void {
    const document = this.document();
    document['appearance/theme'] = value;
    const result = replaceDocumentSync(this.file, serialise(document), { createParent: true });
    if (!result.ok) throw new Error(`${result.error.headline}: ${result.error.detail ?? result.error.code}`);
  }
}
