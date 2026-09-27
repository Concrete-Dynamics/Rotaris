import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { productVersion } from './version.js';

describe('the version main reports — REQ-STARTUP-007, REQ-STARTUP-158', () => {
  it('is the application manifest\'s own, read from beside the bundle (this source sits at out/main\'s depth)', () => {
    const declared = (JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf8')) as { version: string }).version;
    expect(productVersion()).toBe(declared);
    expect(productVersion()).not.toBe(process.versions.electron ?? '');
  });
});
