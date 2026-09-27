import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THIRD_PARTY_LICENSES_ASSET, thirdPartyLicensesPath } from './about.js';

/** Electron declares `resourcesPath` on every process; under Vitest it is absent until a test sets it. */
const proc = process as unknown as { resourcesPath?: string };

describe('the About page’s licence bundle — REQ-STARTUP-141, REQ-SHELL-142', () => {
  let resources: string;
  let previous: string | undefined;

  beforeEach(() => {
    resources = mkdtempSync(join(tmpdir(), 'rotaris-about-'));
    previous = proc.resourcesPath;
    proc.resourcesPath = resources;
  });

  afterEach(() => {
    if (previous === undefined) delete proc.resourcesPath;
    else proc.resourcesPath = previous;
    rmSync(resources, { recursive: true, force: true });
  });

  it('looks for the file under the name the requirement fixes', () => {
    expect(THIRD_PARTY_LICENSES_ASSET).toBe('THIRD-PARTY-LICENSES.txt');
  });

  it('opens the bundled file when the build carries it', () => {
    const bundled = join(resources, 'THIRD-PARTY-LICENSES.txt');
    writeFileSync(bundled, 'notices\n');
    expect(thirdPartyLicensesPath()).toBe(bundled);
  });

  it('takes the absent branch when the build carries none', () => {
    expect(thirdPartyLicensesPath()).toBeNull();
  });
});
