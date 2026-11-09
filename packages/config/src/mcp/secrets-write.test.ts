import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfiguration } from '../load.js';
import { SECRETS_FILE, readSecretsFile, resolveRemoteUrl } from './environment.js';
import { SECRETS_FILE_MODE, secretsPathFor, setServerSecret, unsetServerSecret, clearServerSecrets } from './secrets-write.js';
import { SHIPPED_MCP_SERVERS } from './defaults.js';

/*
 * REQ-MCP-084/110/111's write side: each case fails for exactly one reason, stated on it. The main case — "after a
 * store the file holds that entry and mode 0600" — goes red the moment `setServerSecret` stops committing (the
 * negative control in the slice's report stashed exactly that commit call).
 */

const scratchDirs: string[] = [];
function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}
afterEach(() => { for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); });

const sha = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');
const ws = (dir: string): string => join(dir, 'ws');

describe('REQ-MCP-084/110: a set stores the secret atomically at mode 0600 (REQ-CONFIG-216)', () => {
  it('creates <ws>/.rotaris/secrets.yaml with the entry, protects it, and leaves nothing else behind — one reason: the commit stops writing', async () => {
    const dir = scratchDir('rotaris-secrets-');
    const file = secretsPathFor('workspace', join(dir, 'config'), ws(dir));
    expect(existsSync(file)).toBe(false);
    const r = await setServerSecret(file, 'web_search', 'ROTARIS_SEARCH_API_KEY', 'sk-live-1');
    expect(r.ok).toBe(true);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toContain('sk-live-1');
    // REQ-CONFIG-216, NOT REQ-CONFIG-444's 0644: this file is protected by what it carries.
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(SECRETS_FILE_MODE);
    // The staging sibling ADR-0004's primitive makes is gone whatever happened.
    expect(readFileSync(file, 'utf8')).toMatch(/^web_search:\n {2}ROTARIS_SEARCH_API_KEY: sk-live-1\n$/);
  });

  it('preserves every other server, key and comment it did not touch (REQ-CONFIG-252\'s discipline) — one reason: the overlay drops a sibling key', async () => {
    const dir = scratchDir('rotaris-secrets-');
    const file = secretsPathFor('workspace', join(dir, 'config'), ws(dir));
    mkdirSync(join(ws(dir), '.rotaris'), { recursive: true });
    writeFileSync(file, '# hand-written\nweb_search:\n  ROTARIS_SEARCH_API_KEY: old\nbrowser:\n  TOKEN: keep-me\n');
    const r = await setServerSecret(file, 'web_search', 'ROTARIS_SEARCH_API_KEY', 'sk-live-2');
    expect(r.ok).toBe(true);
    const text = readFileSync(file, 'utf8');
    expect(text).toContain('# hand-written');
    expect(text).toContain('browser:');
    expect(text).toContain('TOKEN: keep-me');
    expect(text).toContain('sk-live-2');
    expect(text).not.toContain('old');
  });

  it('creates the server sub-map when absent and the global scope\'s own file (REQ-CONFIG-217) — one reason: the created map lands at the wrong scope', async () => {
    const dir = scratchDir('rotaris-secrets-');
    const globalFile = secretsPathFor('global', join(dir, 'config'), ws(dir));
    const r = await setServerSecret(globalFile, 'brand_new', 'KEY', 'v');
    expect(r.ok).toBe(true);
    expect(globalFile).toBe(join(dir, 'config', SECRETS_FILE));
    expect(readFileSync(globalFile, 'utf8')).toBe('brand_new:\n  KEY: v\n');
  });
});

describe('REQ-MCP-084/110: the refusals write nothing (the file byte-identical afterwards)', () => {
  it('an empty value is refused and the file is byte-identical — one reason: the refusal writes the file anyway', async () => {
    const dir = scratchDir('rotaris-secrets-');
    const file = secretsPathFor('workspace', join(dir, 'config'), ws(dir));
    await setServerSecret(file, 'web_search', 'ROTARIS_SEARCH_API_KEY', 'sk-live-3');
    const before = sha(file);
    const r = await setServerSecret(file, 'web_search', 'ROTARIS_SEARCH_API_KEY', '');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error.code).toBe('empty-value');
    expect(sha(file)).toBe(before);
    // REQ-MCP-084's own words: the refusal reports a value is required. An empty value can never clear the key it names.
    expect(readFileSync(file, 'utf8')).toContain('sk-live-3');
  });

  it('an empty key is refused with nothing written, even where the file does not exist yet — one reason: the guard sits after the write', async () => {
    const dir = scratchDir('rotaris-secrets-');
    const file = secretsPathFor('workspace', join(dir, 'config'), ws(dir));
    const r = await setServerSecret(file, 'web_search', '', 'v');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error.code).toBe('empty-key');
    expect(existsSync(file)).toBe(false);
  });

  it('an existing file that does not parse to a mapping is refused, left exactly as it stands — one reason: the writer re-emits a document it could not read (REQ-CONFIG-442\'s ground)', async () => {
    const dir = scratchDir('rotaris-secrets-');
    const file = secretsPathFor('workspace', join(dir, 'config'), ws(dir));
    mkdirSync(join(ws(dir), '.rotaris'), { recursive: true });
    writeFileSync(file, 'not: [valid\n');
    const before = sha(file);
    const r = await setServerSecret(file, 'web_search', 'ROTARIS_SEARCH_API_KEY', 'sk-live-4');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error.code).toBe('unreadable');
    expect(sha(file)).toBe(before);
    // A list at the top level is not a mapping either: refused with nothing written.
    writeFileSync(file, '- a\n- b\n');
    const beforeList = sha(file);
    const r2 = await setServerSecret(file, 'web_search', 'ROTARIS_SEARCH_API_KEY', 'sk-live-4');
    expect(r2.ok ? '' : r2.error.code).toBe('not-a-mapping');
    expect(sha(file)).toBe(beforeList);
  });
});

describe('REQ-CONFIG-217: unset and clear write only when something was removed', () => {
  it('unsetting a missing key reports not-found and writes nothing — one reason: the no-op path commits anyway', async () => {
    const dir = scratchDir('rotaris-secrets-');
    const file = secretsPathFor('workspace', join(dir, 'config'), ws(dir));
    await setServerSecret(file, 'web_search', 'ROTARIS_SEARCH_API_KEY', 'sk-live-5');
    const before = sha(file);
    const r = await unsetServerSecret(file, 'web_search', 'OTHER_KEY');
    expect(r.ok).toBe(true);
    expect(r.ok ? r.value.wrote : true).toBe(false);
    expect(r.ok ? r.value.removed : -1).toBe(0);
    expect(sha(file)).toBe(before);
    // A server that is not there at all: the same no-op.
    const missing = await unsetServerSecret(file, 'nowhere', 'K');
    expect(missing.ok ? missing.value.wrote : true).toBe(false);
    expect(sha(file)).toBe(before);
  });

  it('removing a server\'s last key removes the server entry (REQ-CONFIG-217) — one reason: an emptied map is left behind', async () => {
    const dir = scratchDir('rotaris-secrets-');
    const file = secretsPathFor('workspace', join(dir, 'config'), ws(dir));
    await setServerSecret(file, 'web_search', 'ROTARIS_SEARCH_API_KEY', 'sk-live-6');
    await setServerSecret(file, 'browser', 'TOKEN', 't');
    const r = await unsetServerSecret(file, 'web_search', 'ROTARIS_SEARCH_API_KEY');
    expect(r.ok).toBe(true);
    expect(r.ok ? r.value.removed : -1).toBe(1);
    expect(readFileSync(file, 'utf8')).toBe('browser:\n  TOKEN: t\n');
  });

  it('clear reports the count removed and writes nothing when the server had none — one reason: a zero-count clear still commits', async () => {
    const dir = scratchDir('rotaris-secrets-');
    const file = secretsPathFor('workspace', join(dir, 'config'), ws(dir));
    await setServerSecret(file, 'web_search', 'A', '1');
    await setServerSecret(file, 'web_search', 'B', '2');
    const cleared = await clearServerSecrets(file, 'web_search');
    expect(cleared.ok ? cleared.value.removed : -1).toBe(2);
    const after = sha(file);
    const none = await clearServerSecrets(file, 'web_search');
    expect(none.ok ? none.value.removed : -1).toBe(0);
    expect(none.ok ? none.value.wrote : true).toBe(false);
    expect(sha(file)).toBe(after);
  });
});

describe('REQ-MCP-082/088/111 + REQ-CONFIG-225/371: the stored key is what the placeholder resolves from', () => {
  it('with nothing stored, web_search is unavailable with a detail naming ${ROTARIS_SEARCH_API_KEY}; a stored key resolves it and the store is read back by the load — one reason: the writer and the reader disagree on the file', async () => {
    const dir = scratchDir('rotaris-secrets-');
    const root = ws(dir);
    mkdirSync(root, { recursive: true });
    const configDir = join(dir, 'config');
    const load = () => loadConfiguration({ workspaceRoot: root, globalDir: configDir, env: {}, platform: 'linux', keepIgnored: false });
    // The negative control: nothing is stored, and the shipped default (REQ-CONFIG-181) is not resolvable.
    const missing = load();
    expect(missing.ok).toBe(true);
    const before = missing.ok ? missing.value.mcp.servers['web_search'] : null;
    expect(before?.unresolved).toEqual(['ROTARIS_SEARCH_API_KEY']);
    const availability = before?.availability;
    expect(availability?.available).toBe(false);
    expect(availability?.available === false ? availability.detail : '').toContain('${ROTARIS_SEARCH_API_KEY}');
    expect(SHIPPED_MCP_SERVERS['web_search']).toMatchObject({ enabled: false });
    const file = secretsPathFor('workspace', configDir, root);
    await setServerSecret(file, 'web_search', 'ROTARIS_SEARCH_API_KEY', 'sk-live-7');
    // The write is exactly the one REQ-MCP-111 promises: the placeholder is satisfied with no further configuration.
    const stored = load();
    const after = stored.ok ? stored.value.mcp.servers['web_search'] : null;
    expect(after?.unresolved).toEqual([]);
    expect((after?.description.transport === 'http' ? after.description.url : '')).toContain('key=sk-live-7');
    // And the read side lists it under the scope it was written to (REQ-MCP-083).
    const read = readSecretsFile(file, 'workspace');
    expect(read.value).toEqual([{ server: 'web_search', key: 'ROTARIS_SEARCH_API_KEY', value: 'sk-live-7', scope: 'workspace' }]);
    // REQ-MCP-088's own substitution agrees, and on a file with no key the placeholder stays literal.
    expect(resolveRemoteUrl('web_search', 'https://x/?key=${ROTARIS_SEARCH_API_KEY}', {}, {}).value.unresolved).toEqual(['ROTARIS_SEARCH_API_KEY']);
  });

  it('a read that never submits leaves agents.yaml and secrets.yaml byte-identical — one reason: the read path writes a file', async () => {
    const dir = scratchDir('rotaris-secrets-');
    const root = ws(dir);
    mkdirSync(join(root, '.rotaris'), { recursive: true });
    const configDir = join(dir, 'config');
    const agents = join(root, '.rotaris', 'agents.yaml');
    const secrets = secretsPathFor('workspace', configDir, root);
    writeFileSync(agents, 'default_persona: orchestrator\n');
    await setServerSecret(secrets, 'web_search', 'ROTARIS_SEARCH_API_KEY', 'sk-live-8');
    const agentsBefore = sha(agents);
    const secretsBefore = sha(secrets);
    // What an abandoned settings form does: the read side runs (the listing a mounted card would ask for), no write follows.
    const loaded = loadConfiguration({ workspaceRoot: root, globalDir: configDir, env: {}, platform: 'linux', keepIgnored: false });
    expect(loaded.ok).toBe(true);
    expect(readSecretsFile(secrets, 'workspace').value).toHaveLength(1);
    expect(sha(agents)).toBe(agentsBefore);
    expect(sha(secrets)).toBe(secretsBefore);
  });
});
