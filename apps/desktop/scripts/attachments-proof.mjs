/** Part AE proof: content validation, ceilings, capability gate, durable metadata and lower-bound estimate. */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const output = join(repo, '.proof', 'attachments-proof');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const args = ['exec', 'vitest', 'run', 'packages/ui/src/attachments.test.ts', 'packages/engine/src/attachments.test.ts', 'packages/store/src/store.test.ts'];
const test = process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', `pnpm ${args.join(' ')}`], { cwd: repo, encoding: 'utf8', timeout: 180_000 })
  : spawnSync('pnpm', args, { cwd: repo, encoding: 'utf8', timeout: 180_000 });
writeFileSync(join(output, 'tests.log'), `${test.stdout ?? ''}\n${test.stderr ?? ''}`);

const channels = readFileSync(join(repo, 'packages/contracts/src/channels.ts'), 'utf8');
const sessions = readFileSync(join(repo, 'packages/engine/src/sessions.ts'), 'utf8');
const store = readFileSync(join(repo, 'packages/store/src/schema.ts'), 'utf8');
const ui = readFileSync(join(repo, 'packages/ui/src/WorkspaceView.tsx'), 'utf8');
const results = {
  testsPassed: test.status === 0,
  contentValidated: readFileSync(join(repo, 'packages/ui/src/attachments.ts'), 'utf8').includes('sniffImageMediaType'),
  capabilityDeclared: sessions.includes('acceptsImageInput !== true') && ui.includes('does not declare image input support'),
  metadataOnlySnapshot: channels.includes('ImageAttachmentSchema') && !/ImageAttachmentSchema[\s\S]{0,500}base64/.test(channels),
  v14Storage: store.includes('to: 14') && store.includes("attachments TEXT NOT NULL DEFAULT '[]'"),
  digestRevalidated: sessions.includes('projectAttachments') && readFileSync(join(repo, 'packages/engine/src/attachments.ts'), 'utf8').includes('does not match its recorded digest'),
  lowerBoundChanges: ui.includes('composerTokenEstimate(text, attachments)') && ui.includes('setAttachments((xs)'),
};
results.passed = Object.values(results).every(Boolean);
writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
if (!results.passed) { console.error(JSON.stringify(results, null, 2)); process.exit(1); }
console.log(`attachments-proof PASSED (${join(output, 'results.json')})`);
