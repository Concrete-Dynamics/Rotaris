import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PANE_LAYOUT_PANES, PANE_LAYOUT_VIEWS, PREFERENCE_KEYS, PreferenceStore, paneLayoutKeys } from './index.js';

/**
 * REQ-SHELL-006: the per-user preference store table is the store's one complete registry ("a key that does not appear in
 * that table does not exist"; OQ-302, ruled under R-072). Until 2026-10-14 three preferences were stored under keys it does not
 * list — the agent pop-out as `interface/agentPopOut`, the terminal auto-open as `terminal/autoOpen`, and each pane layout as
 * one object under `panels/<view>` — where the table registers `interface/agentPopout`, `interface/terminalPopout`,
 * `panels/version` and `panels/{view-key}/state` / `panels/{view-key}/panes`
 * (docs/defects/fixed/the-agent-pop-out-terminal-auto-open-and-pane-layout-preferences-are-stored-under-unregistered-keys.md).
 */
const SPEC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/spec/12-desktop-shell-windows.md');
/** The domain's parts, in order: since 2026-10-26 its file is an index (docs/README.md, "The document budget"). */
const SPEC_PARTS = SPEC.replace(/\.md$/, '');
/** REQ-SHELL-069's per-view key strings, the values `{view-key}` takes. */
const VIEW_KEYS = ['overview', 'workspace', 'mission', 'requirements', 'git', 'library', 'settings'];

/** Every literal key the table's rows name, braces expanded and `{view-key}` taken over REQ-SHELL-069's views. */
function registeredKeys(): Set<string> {
  const parts = readdirSync(SPEC_PARTS).filter((name) => name.endsWith('.md')).sort();
  const text = [SPEC, ...parts.map((name) => join(SPEC_PARTS, name))].map((file) => readFileSync(file, 'utf8')).join('\n');
  const start = text.indexOf('| Key | Meaning | Default |');
  const rows = text.slice(start).split('\n').slice(2).filter((line) => line.startsWith('| `'));
  const keys = new Set<string>();
  const expand = (key: string): string[] => {
    const brace = /\{([^}]+)\}/.exec(key);
    if (brace === null) return [key];
    const [whole, inner] = brace as unknown as [string, string];
    const values = inner === 'view-key' ? VIEW_KEYS : inner.includes(',') ? inner.split(',') : [`{${inner}}`];
    if (values.length === 1 && values[0] === whole) return [key];
    return values.flatMap((v) => expand(key.replace(whole, v)));
  };
  for (const row of rows) {
    const cell = row.split('|')[1] ?? '';
    for (const m of cell.matchAll(/`([^`]+)`/g)) for (const k of expand(m[1]!)) keys.add(k);
  }
  return keys;
}

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-prefs-registry-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('the preference registry is REQ-SHELL-006\'s table (OQ-302)', () => {
  it('registers no literal key the table does not list', () => {
    const table = registeredKeys();
    expect(table.has('interface/agentPopout')).toBe(true); // the reading itself is checked against a row it must find
    expect(Object.keys(PREFERENCE_KEYS).filter((key) => !table.has(key))).toEqual([]);
  });

  it('stores the agent pop-out under `interface/agentPopout` and the terminal auto-open under `interface/terminalPopout`, both default off', async () => {
    const store = new PreferenceStore(join(dir, 'preferences'));
    expect(store.read('interface/agentPopout')).toBe(false);
    expect(store.read('interface/terminalPopout')).toBe(false);
    await store.write('interface/agentPopout', true);
    await store.write('interface/terminalPopout', true);
    expect(JSON.parse(readFileSync(store.file, 'utf8'))).toEqual({ 'interface/agentPopout': true, 'interface/terminalPopout': true });
    expect(() => store.read('interface/agentPopOut' as never)).toThrow(/not registered \(REQ-SHELL-006\)/);
    expect(() => store.read('terminal/autoOpen' as never)).toThrow(/not registered \(REQ-SHELL-006\)/);
  });

  it('carries a value stored under `interface/agentPopOut` or `terminal/autoOpen` over once, a registered value winning', () => {
    const root = join(dir, 'preferences');
    const store = new PreferenceStore(root);
    mkdirSync(root, { recursive: true });
    writeFileSync(store.file, '{"interface/agentPopOut":true,"terminal/autoOpen":"true"}\n');
    expect(store.read('interface/agentPopout')).toBe(true);
    expect(store.read('interface/terminalPopout')).toBe(true);
    expect(JSON.parse(readFileSync(store.file, 'utf8'))).toEqual({ 'interface/agentPopout': true, 'interface/terminalPopout': 'true' });
    writeFileSync(store.file, '{"interface/agentPopout":false,"interface/agentPopOut":true}\n');
    expect(store.read('interface/agentPopout')).toBe(false);
    expect(JSON.parse(readFileSync(store.file, 'utf8'))).toEqual({ 'interface/agentPopout': false });
  });
});

describe('a pane layout is stored under `panels/version`, `panels/{view-key}/state` and `panels/{view-key}/panes` (REQ-SHELL-069)', () => {
  it('writes the three registered keys, one version stamp for every layout, and reads the layout back', async () => {
    const store = new PreferenceStore(join(dir, 'preferences'));
    expect(PANE_LAYOUT_VIEWS).toEqual(['overview', 'git', 'library', 'workspace']);
    // Each view's current pane count, the figure its stored count is compared against: one per view, none beside them.
    expect(PANE_LAYOUT_PANES).toEqual({ overview: 2, git: 2, library: 2, workspace: 2 });
    expect(paneLayoutKeys('git')).toEqual({ state: 'panels/git/state', panes: 'panels/git/panes' });
    expect(store.readLayout('overview', 2)).toBeUndefined();
    await store.writeLayout('overview', { version: 1, panes: 2, sizes: [700, 340] });
    await store.writeLayout('workspace', { version: 1, panes: 2, sizes: [520, 210] });
    expect(JSON.parse(readFileSync(store.file, 'utf8'))).toEqual({
      'panels/version': 1,
      'panels/overview/panes': 2, 'panels/overview/state': [700, 340],
      'panels/workspace/panes': 2, 'panels/workspace/state': [520, 210],
    });
    expect(store.readLayout('overview', 2)).toEqual({ version: 1, panes: 2, sizes: [700, 340] });
    expect(new PreferenceStore(join(dir, 'preferences')).readLayout('workspace', 2)).toEqual({ version: 1, panes: 2, sizes: [520, 210] });
  });

  it('restores the declared defaults when nothing is stored, the version is not 1, the pane count differs or the state is empty; integers parse tolerantly', () => {
    const root = join(dir, 'preferences');
    const store = new PreferenceStore(root);
    mkdirSync(root, { recursive: true });
    const layout = (doc: Record<string, unknown>) => { writeFileSync(store.file, `${JSON.stringify(doc)}\n`); return store.readLayout('git', 2); };
    expect(layout({ 'panels/git/panes': 2, 'panels/git/state': [1, 2] })).toBeUndefined(); // no version stamp
    expect(layout({ 'panels/version': 2, 'panels/git/panes': 2, 'panels/git/state': [1, 2] })).toBeUndefined();
    expect(layout({ 'panels/version': 1, 'panels/git/panes': 3, 'panels/git/state': [1, 2] })).toBeUndefined();
    expect(layout({ 'panels/version': 1, 'panels/git/panes': 2, 'panels/git/state': [] })).toBeUndefined();
    expect(layout({ 'panels/version': 1, 'panels/git/panes': 2, 'panels/git/state': [1, 'x'] })).toBeUndefined();
    expect(layout({ 'panels/version': '1', 'panels/git/panes': '2', 'panels/git/state': ['400', 528] })).toEqual({ version: 1, panes: 2, sizes: [400, 528] });
  });

  it('carries a layout stored as one object under `panels/<view>` over once to the three keys, a registered layout winning', () => {
    const root = join(dir, 'preferences');
    const store = new PreferenceStore(root);
    mkdirSync(root, { recursive: true });
    writeFileSync(store.file, `${JSON.stringify({ 'panels/git': { version: 1, panes: 2, sizes: [400, 528] }, 'panels/library': { version: 1, panes: 2, sizes: [300, 600] }, 'ui/reduced_motion': true })}\n`);
    expect(store.readLayout('git', 2)).toEqual({ version: 1, panes: 2, sizes: [400, 528] });
    expect(JSON.parse(readFileSync(store.file, 'utf8'))).toEqual({
      'panels/version': 1,
      'panels/git/panes': 2, 'panels/git/state': [400, 528],
      'panels/library/panes': 2, 'panels/library/state': [300, 600],
      'ui/reduced_motion': true,
    });
    writeFileSync(store.file, `${JSON.stringify({ 'panels/version': 1, 'panels/git/panes': 2, 'panels/git/state': [1, 2], 'panels/git': { version: 1, panes: 2, sizes: [400, 528] } })}\n`);
    expect(store.readLayout('git', 2)).toEqual({ version: 1, panes: 2, sizes: [1, 2] });
    expect(JSON.parse(readFileSync(store.file, 'utf8'))).toEqual({ 'panels/version': 1, 'panels/git/panes': 2, 'panels/git/state': [1, 2] });
  });

  // docs/defects/fixed/the-pane-layout-carry-over-stamps-every-layout-with-the-first-old-objects-version.md: each old object
  // stood alone (its own version, refused unless 1), where the registered keys share one stamp. Only a version-1 object is
  // carried, and the stamp it sets is 1, so no old object decides another view's layout.
  it('carries only an old object at version 1 and stamps 1, so an object at another version, or none, decides no other view', () => {
    const root = join(dir, 'preferences');
    const store = new PreferenceStore(root);
    mkdirSync(root, { recursive: true });
    const git = { version: 1, panes: 2, sizes: [400, 528] };
    for (const first of [{ version: 2, panes: 2, sizes: [1, 2] }, { panes: 2, sizes: [1, 2] }, { version: null, panes: 2, sizes: [1, 2] }]) {
      // `panels/overview` is migrated first (PANE_LAYOUT_VIEWS' order), ahead of the version-1 `panels/git`.
      writeFileSync(store.file, `${JSON.stringify({ 'panels/overview': first, 'panels/git': git })}\n`);
      expect(store.readLayout('git', 2)).toEqual({ version: 1, panes: 2, sizes: [400, 528] });
      expect(store.readLayout('overview', 2)).toBeUndefined();
      expect(JSON.parse(readFileSync(store.file, 'utf8'))).toEqual({ 'panels/version': 1, 'panels/git/panes': 2, 'panels/git/state': [400, 528] });
    }
  });

  it('drops an old object the old reading refused, so a later stamp of 1 for another view never brings it to life', async () => {
    const root = join(dir, 'preferences');
    const store = new PreferenceStore(root);
    mkdirSync(root, { recursive: true });
    writeFileSync(store.file, `${JSON.stringify({ 'panels/library': { version: 3, panes: 2, sizes: [300, 600] } })}\n`);
    expect(store.readLayout('library', 2)).toBeUndefined();
    expect(JSON.parse(readFileSync(store.file, 'utf8'))).toEqual({});
    await store.writeLayout('overview', { version: 1, panes: 2, sizes: [700, 340] });
    expect(store.readLayout('library', 2)).toBeUndefined();
  });

  it('reads an old object\'s version tolerantly, as REQ-SHELL-069 reads every integer, and stamps the integer 1', () => {
    const root = join(dir, 'preferences');
    const store = new PreferenceStore(root);
    mkdirSync(root, { recursive: true });
    writeFileSync(store.file, `${JSON.stringify({ 'panels/workspace': { version: '1', panes: 2, sizes: [520, 210] } })}\n`);
    expect(store.readLayout('workspace', 2)).toEqual({ version: 1, panes: 2, sizes: [520, 210] });
    expect(JSON.parse(readFileSync(store.file, 'utf8'))).toEqual({ 'panels/version': 1, 'panels/workspace/panes': 2, 'panels/workspace/state': [520, 210] });
  });
});
