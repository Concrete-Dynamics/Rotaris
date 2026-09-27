import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILD_ID_ASSET, THIRD_PARTY_LICENSES_ASSET, buildIdentifier, thirdPartyLicensesPath } from './about.js';
import { NOTICES_FILE } from '../../../../tools/notices/notices.mjs';

/**
 * The About page's two bundled assets (REQ-SHELL-140, REQ-SHELL-142), read from `process.resourcesPath` the way a
 * packaged build reads them. The licence bundle's name is REQ-STARTUP-141's, case included: until 2026-09-27 the
 * reader looked for `third-party-licenses.txt`, which a case-insensitive filesystem answered for the upper-case file
 * and a Linux one did not (`docs/defects/fixed/the-about-page-looks-for-the-licence-bundle-under-a-lowercase-name.md`).
 * The second case below fails on every platform against that name: on Linux the reader finds nothing, and elsewhere
 * it answers a path spelled differently from the file the generator wrote.
 */
describe('REQ-STARTUP-141 / REQ-SHELL-142: the About page opens the file the notices generator writes', () => {
  const holder = process as NodeJS.Process & { resourcesPath?: string };
  const before = holder.resourcesPath;
  let resources: string;
  beforeEach(() => { resources = mkdtempSync(join(tmpdir(), 'rotaris-about-')); holder.resourcesPath = resources; });
  afterEach(() => { holder.resourcesPath = before; rmSync(resources, { recursive: true, force: true }); });

  it('names the bundle exactly as REQ-STARTUP-141 does, and as the generator writes it', () => {
    expect(THIRD_PARTY_LICENSES_ASSET).toBe('THIRD-PARTY-LICENSES.txt');
    expect(THIRD_PARTY_LICENSES_ASSET).toBe(NOTICES_FILE);
  });

  it('finds the bundle the generator names under the resources path, by that exact spelling', () => {
    const bundled = join(resources, NOTICES_FILE);
    writeFileSync(bundled, 'Rotaris — third-party software notices\n');
    expect(thirdPartyLicensesPath()).toBe(bundled);
  });

  it('reads the build identifier from its own asset, and an empty one as absent', () => {
    writeFileSync(join(resources, BUILD_ID_ASSET), '  0.1.0+abc1234\n');
    expect(buildIdentifier()).toBe('0.1.0+abc1234');
    writeFileSync(join(resources, BUILD_ID_ASSET), '\n');
    expect(buildIdentifier()).toBeNull();
  });
});
