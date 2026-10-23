import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM beside its test, loaded by package.mjs as it is.
import { assemblePortable, FOOTER_MAGIC, patchTokenSlot, readPortable, slotToken, TOKEN_SLOT_BYTES, TOKEN_SLOT_MAGIC } from './portable.mjs';

/** A stand-in stub: bytes around one token slot, the way the release build of `launcher/` lays it out. */
const fakeStub = () => Buffer.concat([Buffer.from('MZ stand-in stub '), TOKEN_SLOT_MAGIC, Buffer.alloc(TOKEN_SLOT_BYTES - TOKEN_SLOT_MAGIC.length), Buffer.from(' tail')]);

const scratch: string[] = [];
afterEach(() => {
  for (const d of scratch.splice(0)) rmSync(d, { recursive: true, force: true });
});
function tree() {
  const root = mkdtempSync(join(tmpdir(), 'portable-test-'));
  scratch.push(root);
  const payload = join(root, 'payload');
  mkdirSync(join(payload, 'resources', 'empty'), { recursive: true });
  writeFileSync(join(payload, 'Rotaris.exe'), Buffer.alloc(70_000, 7));
  writeFileSync(join(payload, 'resources', 'app.asar'), Buffer.from('x'.repeat(1000) + 'y'.repeat(25_000)));
  writeFileSync(join(payload, 'resources', 'zero'), '');
  writeFileSync(join(root, 'stub'), fakeStub());
  return { root, payload, stub: join(root, 'stub') };
}

describe('the portable assembly (ADR-0054 P4, REQ-STARTUP-165)', () => {
  it('the token slot is written once, and a stub with no slot or two is refused', () => {
    const patched = patchTokenSlot(fakeStub(), '0.1.0rc1-0123456789abcdef');
    expect(slotToken(patched)).toBe('0.1.0rc1-0123456789abcdef');
    expect(slotToken(fakeStub())).toBeNull();
    expect(() => patchTokenSlot(Buffer.from('MZ no slot'), '0.1.0-x')).toThrow(/no token slot/);
    expect(() => patchTokenSlot(Buffer.concat([fakeStub(), fakeStub()]), '0.1.0-x')).toThrow(/more than one/);
    expect(() => patchTokenSlot(fakeStub(), 'a/b')).toThrow(/cannot carry/);
  });

  it('reads back as the payload it was assembled from: every file\'s chunks decode to its bytes, the stub carries the index\'s token', async () => {
    const t = tree();
    const out = join(t.root, 'Rotaris-0.1.0-windows-x64-portable.exe');
    const made = await assemblePortable({ stub: t.stub, tree: t.payload, entry: 'Rotaris.exe', version: '0.1.0', out, chunkBytes: 16_384 });
    expect(made.token).toMatch(/^0\.1\.0-[0-9a-f]{16}$/);
    const artifact = readFileSync(out);
    expect(artifact.subarray(-32, -24).equals(FOOTER_MAGIC)).toBe(true);
    const read = readPortable(out);
    expect(read.token).toBe(made.token);
    expect(read.entry).toBe('Rotaris.exe');
    expect(read.dirs).toEqual(['resources', 'resources/empty']);
    expect(read.files.map((f: { path: string }) => f.path)).toEqual(['Rotaris.exe', 'resources/app.asar', 'resources/zero']);
    for (const f of read.files) {
      const bytes = Buffer.concat(f.chunks.map((c: { offset: number; compressed: number }) => inflateRawSync(artifact.subarray(read.stubBytes + c.offset, read.stubBytes + c.offset + c.compressed))));
      expect(bytes.equals(readFileSync(join(t.payload, ...f.path.split('/'))))).toBe(true);
    }
    expect(read.files[0].chunks).toHaveLength(5);
    expect(read.files[2].chunks).toHaveLength(0);
  });

  it('the token is a function of the payload: the same tree assembles byte for byte alike, one changed byte names another artifact', async () => {
    const t = tree();
    const a = await assemblePortable({ stub: t.stub, tree: t.payload, entry: 'Rotaris.exe', version: '0.1.0', out: join(t.root, 'a.exe') });
    const b = await assemblePortable({ stub: t.stub, tree: t.payload, entry: 'Rotaris.exe', version: '0.1.0', out: join(t.root, 'b.exe') });
    expect(b.token).toBe(a.token);
    expect(readFileSync(join(t.root, 'b.exe')).equals(readFileSync(join(t.root, 'a.exe')))).toBe(true);
    writeFileSync(join(t.payload, 'resources', 'zero'), 'z');
    const c = await assemblePortable({ stub: t.stub, tree: t.payload, entry: 'Rotaris.exe', version: '0.1.0', out: join(t.root, 'c.exe') });
    expect(c.token).not.toBe(a.token);
    const d = await assemblePortable({ stub: t.stub, tree: t.payload, entry: 'Rotaris.exe', version: '0.1.1', out: join(t.root, 'd.exe') });
    expect(d.token.startsWith('0.1.1-')).toBe(true);
  });

  it('refuses a payload it could not place faithfully, and leaves no partial file', async () => {
    const t = tree();
    const out = join(t.root, 'p.exe');
    await expect(assemblePortable({ stub: t.stub, tree: t.payload, entry: 'Missing.exe', version: '0.1.0', out })).rejects.toThrow(/no entry point/);
    if (process.platform !== 'win32') {
      symlinkSync(join(t.payload, 'Rotaris.exe'), join(t.payload, 'link'));
      await expect(assemblePortable({ stub: t.stub, tree: t.payload, entry: 'Rotaris.exe', version: '0.1.0', out })).rejects.toThrow(/neither a file nor a directory/);
    }
    expect(() => readFileSync(`${out}.partial`)).toThrow();
  });

  it('a damaged artifact is refused when read back', async () => {
    const t = tree();
    const out = join(t.root, 'p.exe');
    await assemblePortable({ stub: t.stub, tree: t.payload, entry: 'Rotaris.exe', version: '0.1.0', out });
    const bytes = readFileSync(out);
    writeFileSync(out, bytes.subarray(0, bytes.length - 1));
    expect(() => readPortable(out)).toThrow(/footer/);
    const slotAt = bytes.indexOf(TOKEN_SLOT_MAGIC);
    const other = Buffer.from(bytes);
    other[slotAt + TOKEN_SLOT_MAGIC.length + 1] ^= 1;
    writeFileSync(out, other);
    expect(() => readPortable(out)).toThrow(/carries the token/);
  });
});
