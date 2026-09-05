import { homedir } from 'node:os';
import { join } from 'node:path';
import { guardedRead, replaceDocument, replaceDocumentSync } from './document.js';

export const PREFERENCE_KEYS = {
  'appearance/theme': { type: 'string', default: undefined, owner: 'REQ-SHELL-128', coerce: (value: unknown) => typeof value === 'string' ? value : undefined },
  'interface/settingsTab': { type: 'string', default: 'models', owner: 'REQ-CONFIG-271', coerce: (value: unknown) => typeof value === 'string' ? value : 'models' },
  'ui/reduced_motion': { type: 'boolean', default: undefined, owner: 'REQ-SHELL-135', coerce: (value: unknown) => value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined },
  /** REQ-SHELL-069: the Overview's two-pane split — version 1, pane count 2, the sizes; anything else reads as nothing stored. */
  'panels/overview': { type: 'object', default: undefined, owner: 'REQ-SHELL-069', coerce: (value: unknown) => coercePaneLayout(value, 2) },
} as const;
export interface PaneLayout { readonly version: 1; readonly panes: number; readonly sizes: readonly number[] }
export function coercePaneLayout(value: unknown, panes: number): PaneLayout | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as { version?: unknown; panes?: unknown; sizes?: unknown };
  if (v.version !== 1 || v.panes !== panes || !Array.isArray(v.sizes) || v.sizes.length !== panes || !v.sizes.every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined;
  return { version: 1, panes, sizes: [...(v.sizes as number[])] };
}
export type PreferenceKey = keyof typeof PREFERENCE_KEYS;
export type PreferenceValue<K extends PreferenceKey> = ReturnType<(typeof PREFERENCE_KEYS)[K]['coerce']>;

export interface PreferenceRootEnv { readonly platform: NodeJS.Platform; readonly env: Readonly<Record<string, string | undefined>>; readonly home: string; }

/** ADR-0042: benchmark override, configuration home, then the platform's machine-local settings location. */
export function resolvePreferenceRoot(e: PreferenceRootEnv = { platform: process.platform, env: process.env, home: homedir() }): string {
  const overridden = e.env['ROTARIS_PREFERENCES_ROOT'];
  if (overridden) return overridden;
  const configHome = e.env['XDG_CONFIG_HOME'];
  if (configHome) return join(configHome, 'Rotaris', 'Rotaris');
  if (e.platform === 'win32') return join(e.env['LOCALAPPDATA'] ?? join(e.home, 'AppData', 'Local'), 'Rotaris', 'Rotaris');
  if (e.platform === 'darwin') return join(e.home, 'Library', 'Application Support', 'Rotaris', 'Rotaris');
  return join(e.home, '.config', 'Rotaris', 'Rotaris');
}

type DocumentShape = Partial<Record<PreferenceKey, unknown>>;
// Top-level keys sorted so two writes of the same state are byte-identical. NOT the replacer-array form: a key list
// handed to JSON.stringify filters every level, so the first nested value (a pane layout, REQ-SHELL-069) was written
// as `{}` and read back as nothing stored — found on ADR-0042's second execution.
const serialise = (document: DocumentShape): string => `${JSON.stringify(Object.fromEntries(Object.entries(document).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), null, 2)}\n`;

export class PreferenceStore {
  readonly file: string;
  constructor(readonly root: string) { this.file = join(root, 'preferences.json'); }

  private document(): DocumentShape {
    const read = guardedRead<DocumentShape>(this.file, (raw) => JSON.parse(raw) as DocumentShape);
    return read.state === 'readable' && read.value && typeof read.value === 'object' ? read.value : {};
  }

  read<K extends PreferenceKey>(key: K): PreferenceValue<K> {
    const entry = PREFERENCE_KEYS[key];
    return entry.coerce(this.document()[key]) as PreferenceValue<K>;
  }

  async write<K extends PreferenceKey>(key: K, value: PreferenceValue<K>): Promise<void> {
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
