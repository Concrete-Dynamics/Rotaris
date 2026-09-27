import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applicationManifestPath, installedProductVersion, readProductVersion, VERSION_WITHOUT_METADATA } from './version.js';

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

  it('is read from the manifest two levels above a bundle, as every process of one build does', () => {
    const app = mkdtempSync(join(tmpdir(), 'product-version-app-'));
    scratch.push(app);
    mkdirSync(join(app, 'out', 'main'), { recursive: true });
    writeFileSync(join(app, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    expect(applicationManifestPath(join(app, 'out', 'main'))).toBe(join(app, 'package.json'));
    expect(installedProductVersion(join(app, 'out', 'main'))).toBe('1.2.3');
  });

  it('is the literal dev when there is no metadata (OQ-71), and never throws (REQ-STARTUP-159)', () => {
    expect(VERSION_WITHOUT_METADATA).toBe('dev');
    expect(readProductVersion(join(tmpdir(), 'no-such-directory-for-product-version', 'package.json'))).toBe('dev');
    expect(readProductVersion(manifest('{ not json'))).toBe('dev');
    expect(readProductVersion(manifest('null'))).toBe('dev');
    expect(readProductVersion(manifest(JSON.stringify({ name: 'x' })))).toBe('dev');
    expect(readProductVersion(manifest(JSON.stringify({ version: '' })))).toBe('dev');
    expect(readProductVersion(manifest(JSON.stringify({ version: 1 })))).toBe('dev');
  });
});
