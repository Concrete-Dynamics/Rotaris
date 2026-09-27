import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PRODUCT_VERSION_PLACES } from '../../../../tools/release-guard/src/versions.js';
import { readProductVersion, VERSION_WITHOUT_METADATA } from './version.js';

const scratch: string[] = [];
afterEach(() => { for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function manifest(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'product-version-'));
  scratch.push(dir);
  writeFileSync(join(dir, 'package.json'), text);
  return join(dir, 'package.json');
}

describe('the version the running desktop reports — REQ-STARTUP-007, REQ-STARTUP-158', () => {
  it('is the version the application manifest declares, as written', () => {
    expect(readProductVersion(manifest(JSON.stringify({ name: '@rotaris/desktop', version: '0.1.0rc1' })))).toBe('0.1.0rc1');
  });

  it('reads the one place the release guard checks, so what a release declares is what it reports', () => {
    // out/main/../../package.json at run time; this source file sits at the same depth under src/main.
    const desktop = resolve(import.meta.dirname, '..', '..', 'package.json');
    expect(PRODUCT_VERSION_PLACES.map((p) => resolve(import.meta.dirname, '..', '..', '..', '..', p.file))).toEqual([desktop]);
    expect(PRODUCT_VERSION_PLACES[0]!.field).toBe('version');
    expect(readProductVersion(desktop)).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('is the literal dev when there is no metadata, and never throws (REQ-STARTUP-159)', () => {
    expect(VERSION_WITHOUT_METADATA).toBe('dev');
    expect(readProductVersion(join(tmpdir(), 'no-such-directory-for-product-version', 'package.json'))).toBe('dev');
    expect(readProductVersion(manifest('{ not json'))).toBe('dev');
    expect(readProductVersion(manifest('null'))).toBe('dev');
    expect(readProductVersion(manifest(JSON.stringify({ name: 'x' })))).toBe('dev');
    expect(readProductVersion(manifest(JSON.stringify({ version: '' })))).toBe('dev');
  });
});
