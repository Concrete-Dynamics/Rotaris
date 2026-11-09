import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ok } from '@rotaris/kernel';
import { windowsProtector, type Exec, type Protector } from '@rotaris/platform';
import { loadConfiguration } from '../load.js';
import { SECRETS_FILE, readSecretsFile, resolveRemoteUrl } from './environment.js';
import { SECRETS_FILE_MODE, secretsPathFor, setServerSecret, unsetServerSecret, clearServerSecrets } from './secrets-write.js';
import { SHIPPED_MCP_SERVERS } from './defaults.js';

/*
 * REQ-MCP-084/110/111's write side: each case fails for exactly one reason, stated on it. The main case — "after a
 * store the file holds that entry and mode 0600" — goes red the moment `setServerSecret` stops committing (the
 * negative control in the slice's report stashed exactly that commit call), and the ordering case goes red when the
 * protect-then-write ordering of REQ-CONFIG-216 is removed (round-1 rework, 2026-11-09).
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
    expect(readdirSync(dirname(file)).filter((f) => f.includes('staging'))).toEqual([]);
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

describe('REQ-CONFIG-216: the protection is applied BEFORE the write, and the write does not happen without it (round-1 rework, 2026-11-09; round-2 Major 1 added the create-time mode)', () => {
  /*
   * HOW THE ORDERING IS OBSERVED. The adapter is injected (`SecretsWriteDeps.protector`), and what this suite's spies
   * see is the file's state at the moment the adapter is asked to protect it: the staged sibling exists, it is still
   * EMPTY, it was CREATED owner-only (the mode is read back there — round-2 Major 1: `.rotaris` is not a protected
   * directory, so a create at the umask's 0664 would sit readable until the later chmod, which cannot close a
   * descriptor already held), and the target does not exist yet (or, over an existing file, still holds its own
   * bytes). With the ordering removed (a post-rename chmod) the spy would see the umask's mode over eight characters
   * of content. A refusal is the second observable: it must leave no staged file and no target behind, which a
   * post-rename protection cannot promise.
   */
  it('the adapter is called with the staged sibling while it is EMPTY, owner-only from its creation, and the target still holds the previous file — fails if the protection runs after the content is written, after the rename, or over a file the umask left group/other-readable', async () => {
    const dir = scratchDir('rotaris-secrets-order-');
    const file = secretsPathFor('workspace', join(dir, 'config'), ws(dir));
    mkdirSync(join(ws(dir), '.rotaris'), { recursive: true });
    writeFileSync(file, 'web_search:\n  ROTARIS_SEARCH_API_KEY: old\n');
    /** What each protect call saw: the staged sibling's bytes and mode, and the target's, at the moment protection was asked. */
    const sawStaged: { path: string; emptyAtProtect: boolean; modeAtProtect: number; targetAtProtect: string }[] = [];
    const spy: Protector = { protect: async (path) => { sawStaged.push({ path, emptyAtProtect: readFileSync(path, 'utf8') === '', modeAtProtect: statSync(path).mode & 0o777, targetAtProtect: existsSync(file) ? readFileSync(file, 'utf8') : '' }); return ok(undefined); } };
    const r = await setServerSecret(file, 'web_search', 'ROTARIS_SEARCH_API_KEY', 'sk-new', { protector: spy });
    expect(r.ok).toBe(true);
    expect(sawStaged).toHaveLength(1);
    // The staged sibling sits INSIDE the target's own directory (the primitive's staging rule) and is not the target.
    expect(dirname(sawStaged[0]!.path)).toBe(dirname(file));
    expect(sawStaged[0]!.path).not.toBe(file);
    expect(sawStaged[0]!.emptyAtProtect).toBe(true); // NOT a byte of content existed when protection was asked
    // Round-2 Major 1, at the SECRETS layer: `.rotaris` is not protected the way the credential store's 0700
    // `tokens` directory is, so the staged file must be created already owner-only — a later chmod cannot revoke a
    // descriptor another account opened on the empty file. This spy chmods NOTHING, so the mode read here is the
    // create-time mode alone; the negative control (the create without its mode argument) reads 0664 under this
    // host's umask 002 and this assertion goes red. Skips on Windows: Node ignores the mode argument there and the
    // ACLs a fresh file inherits are the residual (recorded in `document.ts`), with the ACL read-back the protection.
    if (process.platform !== 'win32') expect(sawStaged[0]!.modeAtProtect).toBe(0o600);
    // And at that moment the target still held the PREVIOUS file, untouched — the rename has not happened yet.
    expect(sawStaged[0]!.targetAtProtect).toContain('old');
    expect(sawStaged[0]!.targetAtProtect).not.toContain('sk-new');
    // After the write the new content is in place (the injected no-op leaves the mode to the create; the REAL
    // adapter's 0600 is asserted by the case below, which drives `createProtector` itself).
    expect(readFileSync(file, 'utf8')).toContain('sk-new');
  });

  it('a protection refusal answers BEFORE the rename: the target keeps its own bytes and no staged file is left — fails if a refused protection can still replace the file', async () => {
    const dir = scratchDir('rotaris-secrets-order-');
    const file = secretsPathFor('workspace', join(dir, 'config'), ws(dir));
    mkdirSync(join(ws(dir), '.rotaris'), { recursive: true });
    writeFileSync(file, 'web_search:\n  ROTARIS_SEARCH_API_KEY: old\n');
    const before = sha(file);
    const refusing: Protector = { protect: async () => ({ ok: false as const, error: { code: 'credential.protect', headline: 'The protection could not be applied', detail: 'the volume has no access-control list' } }) };
    const r = await setServerSecret(file, 'web_search', 'ROTARIS_SEARCH_API_KEY', 'sk-new', { protector: refusing });
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error.code).toBe('protection');
    expect(r.ok ? '' : r.error.fault).toContain('no access-control list');
    expect(sha(file)).toBe(before); // byte-identical: "the write does not happen"
    expect(readdirSync(dirname(file)).filter((f) => f.includes('staging'))).toEqual([]);
  });

  it('a protection refusal on a file that does not exist yet creates NOTHING — fails if a refused first write leaves an empty or partially written secrets.yaml', async () => {
    const dir = scratchDir('rotaris-secrets-order-');
    const file = secretsPathFor('workspace', join(dir, 'config'), ws(dir));
    const refusing: Protector = { protect: async () => ({ ok: false as const, error: { code: 'credential.protect', headline: 'no', detail: 'the directory could not be protected' } }) };
    const r = await setServerSecret(file, 'web_search', 'ROTARIS_SEARCH_API_KEY', 'sk-new', { protector: refusing });
    expect(r.ok ? '' : r.error.code).toBe('protection');
    expect(existsSync(file)).toBe(false);
    expect(existsSync(join(ws(dir), '.rotaris'))).toBe(true); // the parent may exist; the FILE must not
    expect(readdirSync(join(ws(dir), '.rotaris'))).toEqual([]);
  });

  it('on this machine: the real adapter protects the staged file before the content, and the file ends at 0600 with the staged sibling gone', async () => {
    // The default protector is the platform's own (`createProtector`): POSIX chmod+stat on this host.
    if (process.platform === 'win32') return;
    const dir = scratchDir('rotaris-secrets-order-');
    const file = secretsPathFor('workspace', join(dir, 'config'), ws(dir));
    // The condition REQ-PROVIDER-016 forbids inheriting: a parent directory left loose, so an umask-masked staged
    // file would read back 0644 rather than 0600 if the mode were not applied explicitly.
    mkdirSync(join(ws(dir), '.rotaris'), { recursive: true });
    const r = await setServerSecret(file, 'web_search', 'ROTARIS_SEARCH_API_KEY', 'sk-real');
    expect(r.ok).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readdirSync(dirname(file)).filter((f) => f.includes('staging'))).toEqual([]);
  });

  it('on Windows the same path routes through the ACL adapter: a refusal is the protection refusal and nothing is written — the path exists and is driven with the adapter injected; it is NOT measured on a real Windows host (none is available to this build)', async () => {
    const dir = scratchDir('rotaris-secrets-order-');
    const file = secretsPathFor('workspace', join(dir, 'config'), ws(dir));
    mkdirSync(join(ws(dir), '.rotaris'), { recursive: true });
    writeFileSync(file, 'web_search:\n  ROTARIS_SEARCH_API_KEY: old\n');
    const before = sha(file);
    // A Windows shape: the ACL adapter refuses the read-back (the DACL that came back is not the exact one).
    const calls: string[][] = [];
    const exec: Exec = async (cmd, args) => {
      calls.push([cmd, ...args]);
      if (cmd.endsWith('whoami.exe')) return { status: 0, stdout: '"host\\me","S-1-5-21-9-9-9-1001"\r\n', stderr: '' };
      if (args.includes('/save')) { writeFileSync(args[args.indexOf('/save') + 1]!, Buffer.concat([Buffer.from('\uFEFF', 'utf16le'), Buffer.from('name\r\nD:PAI(A;;FA;;;S-1-5-21-9-9-9-1001)(A;;FA;;;SY)(A;;FR;;;BU)\r\n', 'utf16le')])); return { status: 0, stdout: '', stderr: '' }; }
      return { status: 0, stdout: '', stderr: '' };
    };
    const protector = windowsProtector({ exec, env: { SystemRoot: 'C:\\W' }, scratchDir: dir, random: () => 'z' });
    const refused = await setServerSecret(file, 'web_search', 'ROTARIS_SEARCH_API_KEY', 'sk-new', { protector });
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.error.code).toBe('protection');
    expect(refused.ok ? '' : refused.error.fault).toMatch(/two/); // the DACL's own complaint, read back
    expect(calls.some((c) => c.includes('/inheritance:r'))).toBe(true); // icacls ran at all — the path is wired
    expect(sha(file)).toBe(before);
    // And an exact DACL lets the same write through.
    const exact: Exec = async (cmd, args) => {
      if (cmd.endsWith('whoami.exe')) return { status: 0, stdout: '"host\\me","S-1-5-21-9-9-9-1001"\r\n', stderr: '' };
      if (args.includes('/save')) { writeFileSync(args[args.indexOf('/save') + 1]!, Buffer.concat([Buffer.from('\uFEFF', 'utf16le'), Buffer.from('name\r\nD:PAI(A;;FA;;;S-1-5-21-9-9-9-1001)(A;;FA;;;SY)\r\n', 'utf16le')])); return { status: 0, stdout: '', stderr: '' }; }
      return { status: 0, stdout: '', stderr: '' };
    };
    const accepted = await setServerSecret(file, 'web_search', 'ROTARIS_SEARCH_API_KEY', 'sk-new', { protector: windowsProtector({ exec: exact, env: { SystemRoot: 'C:\\W' }, scratchDir: dir, random: () => 'y' }) });
    expect(accepted.ok).toBe(true);
    expect(readFileSync(file, 'utf8')).toContain('sk-new');
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
