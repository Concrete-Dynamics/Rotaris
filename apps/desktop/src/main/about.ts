import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The About page's two bundled assets (REQ-SHELL-140, REQ-SHELL-142), resolved the way every other bundled
 * resource in this process is: `process.resourcesPath` for a packaged build (electron-builder's
 * `extraResources`), else the source tree's `apps/desktop/resources/`, so the development entry and the
 * packaged binary run one code path (the same rule `sentinel.ts` states for the code-intelligence runtime).
 *
 * **Neither asset is produced by any build today**, so both readers take their absent branch and the About page
 * shows what the requirements say it shows then: an em dash for Build, and REQ-SHELL-142's caption for the
 * licence bundle. That is the requirement met on the branch that reaches, not a stub — emitting the two assets
 * belongs to the packaging part (ADR-0054) and changes nothing here when it lands.
 */

export const BUILD_ID_ASSET = 'build-id.txt';
/**
 * REQ-STARTUP-141 fixes this name, capitals included. A case-insensitive volume (Windows, a default macOS one) would
 * find the file under any spelling, and a Linux artifact finds it only under this one.
 */
export const THIRD_PARTY_LICENSES_ASSET = 'THIRD-PARTY-LICENSES.txt';

function candidates(name: string): readonly string[] {
  const out: string[] = [];
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resources) out.push(join(resources, name));
  out.push(join(__dirname, '..', '..', 'resources', name));
  return out;
}

/** REQ-SHELL-140: the build identifier, or null when the asset is missing, unreadable or says nothing. */
export function buildIdentifier(): string | null {
  for (const path of candidates(BUILD_ID_ASSET)) {
    try {
      const text = readFileSync(path, 'utf8').trim();
      if (text !== '') return text;
    } catch {
      // Missing or unreadable reads as absent, which REQ-SHELL-140 states in as many words.
    }
  }
  return null;
}

/** REQ-SHELL-142: the bundled notices file, or null when this build carries none. */
export function thirdPartyLicensesPath(): string | null {
  for (const path of candidates(THIRD_PARTY_LICENSES_ASSET)) {
    try {
      if (statSync(path).isFile()) return path;
    } catch {
      // Same reading as the build identifier: unreadable is absent.
    }
  }
  return null;
}
