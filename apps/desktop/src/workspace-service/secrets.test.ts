import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REDACTION_MARK } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { secretsPathFor } from '@rotaris/config';
import { handleSecretWrite, type SecretWriteRequest } from './secrets.js';

/*
 * REQ-MCP-110/111's process-protocol half, driven without a process behind it: the request names the scope, the
 * reply is the masked confirmation and never the value (REQ-MCP-081, W-01), and a delete that found nothing says so
 * without a mask (REQ-CONFIG-217). One reason each case can fail: the reply stops naming a field, or the value
 * crosses back on it.
 */

const scratchDirs: string[] = [];
function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}
afterEach(() => { for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); });

const sha = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

function deps(configDir: string, lines: string[] = []) {
  return { configDir, timers: nodeClocks().timers, log: (m: string) => { lines.push(m); } };
}

describe('mcp.setSecret — the masked confirmation, and the value never comes back', () => {
  it('answers server, key, scope and the one mask — one reason: a field of the confirmation is dropped or the value leaks into it', async () => {
    const dir = scratchDir('rotaris-secret-svc-');
    const root = join(dir, 'ws');
    mkdirSync(root, { recursive: true });
    const line: string[] = [];
    const req: SecretWriteRequest = { kind: 'mcp.setSecret', workspaceRoot: root, server: 'web_search', key: 'ROTARIS_SEARCH_API_KEY', value: 'sk-live-svc', scope: 'workspace' };
    const reply = await handleSecretWrite(req, deps(dir, line));
    expect(reply).toEqual({ kind: 'mcp.secretWritten', server: 'web_search', key: 'ROTARIS_SEARCH_API_KEY', scope: 'Workspace', masked: REDACTION_MARK, removed: false });
    expect(JSON.stringify(reply)).not.toContain('sk-live-svc');
    expect(line.join('\n')).not.toContain('sk-live-svc');
    // The file the writer chose is REQ-MCP-082's workspace place, at REQ-CONFIG-216's protection.
    const file = secretsPathFor('workspace', dir, root);
    expect(readFileSync(file, 'utf8')).toContain('sk-live-svc');
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('defaults the scope to the workspace (REQ-CONFIG-463) and writes the global scope to its own file when named — one reason: the scope default flips', async () => {
    const dir = scratchDir('rotaris-secret-svc-');
    const root = join(dir, 'ws');
    mkdirSync(root, { recursive: true });
    const noScope = await handleSecretWrite({ kind: 'mcp.setSecret', workspaceRoot: root, server: 's', key: 'K', value: 'v' } satisfies SecretWriteRequest, deps(dir));
    expect(noScope).toMatchObject({ kind: 'mcp.secretWritten', scope: 'Workspace' });
    expect(existsSync(secretsPathFor('workspace', dir, root))).toBe(true);
    const global = await handleSecretWrite({ kind: 'mcp.setSecret', workspaceRoot: root, server: 's', key: 'K', value: 'v', scope: 'global' } satisfies SecretWriteRequest, deps(dir));
    expect(global).toMatchObject({ kind: 'mcp.secretWritten', scope: 'Global' });
    expect(existsSync(join(dir, 'secrets.yaml'))).toBe(true);
  });

  it('an empty value is refused, the file byte-identical, the refusal naming the file — one reason: the refusal loses its file/detail', async () => {
    const dir = scratchDir('rotaris-secret-svc-');
    const root = join(dir, 'ws');
    mkdirSync(root, { recursive: true });
    await handleSecretWrite({ kind: 'mcp.setSecret', workspaceRoot: root, server: 's', key: 'K', value: 'v' } satisfies SecretWriteRequest, deps(dir));
    const file = secretsPathFor('workspace', dir, root);
    const before = sha(file);
    const reply = await handleSecretWrite({ kind: 'mcp.setSecret', workspaceRoot: root, server: 's', key: 'K', value: '' } satisfies SecretWriteRequest, deps(dir));
    expect(reply).toMatchObject({ kind: 'refused', code: 'mcp.secret.empty-value' });
    expect(reply.kind === 'refused' ? reply.detail : '').toContain(file);
    expect(sha(file)).toBe(before);
  });

  it('an unparseable file is refused with the file left as it stands — one reason: the service writes over a file it could not read', async () => {
    const dir = scratchDir('rotaris-secret-svc-');
    const root = join(dir, 'ws');
    mkdirSync(join(root, '.rotaris'), { recursive: true });
    const file = secretsPathFor('workspace', dir, root);
    writeFileSync(file, 'broken: [\n');
    const before = sha(file);
    const reply = await handleSecretWrite({ kind: 'mcp.setSecret', workspaceRoot: root, server: 's', key: 'K', value: 'v' } satisfies SecretWriteRequest, deps(dir));
    expect(reply).toMatchObject({ kind: 'refused', code: 'mcp.secret.unreadable' });
    expect(sha(file)).toBe(before);
  });
});

describe('mcp.unsetSecret — not-found is not an error (REQ-CONFIG-217, REQ-MCP-110)', () => {
  it('a delete that removed the key answers with the mask; a delete that found nothing answers without one and writes nothing — one reason: a no-op delete reports a removal', async () => {
    const dir = scratchDir('rotaris-secret-svc-');
    const root = join(dir, 'ws');
    mkdirSync(root, { recursive: true });
    await handleSecretWrite({ kind: 'mcp.setSecret', workspaceRoot: root, server: 's', key: 'K', value: 'v' } satisfies SecretWriteRequest, deps(dir));
    const file = secretsPathFor('workspace', dir, root);
    const deleted = await handleSecretWrite({ kind: 'mcp.unsetSecret', workspaceRoot: root, server: 's', key: 'K' } satisfies SecretWriteRequest, deps(dir));
    expect(deleted).toEqual({ kind: 'mcp.secretWritten', server: 's', key: 'K', scope: 'Workspace', masked: REDACTION_MARK, removed: true });
    const after = sha(file);
    const notFound = await handleSecretWrite({ kind: 'mcp.unsetSecret', workspaceRoot: root, server: 's', key: 'K' } satisfies SecretWriteRequest, deps(dir));
    expect(notFound).toEqual({ kind: 'mcp.secretWritten', server: 's', key: 'K', scope: 'Workspace', masked: null, removed: false });
    expect(sha(file)).toBe(after);
  });
});
