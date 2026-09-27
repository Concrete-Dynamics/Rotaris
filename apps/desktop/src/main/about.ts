import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The About page's two bundled assets (REQ-SHELL-140, REQ-SHELL-142), resolved the way every other bundled
 * resource in this process is: `process.resourcesPath` for a packaged build (electron-builder's
 * `extraResources`), else the source tree's `apps/desktop/resources/`, so the development entry and the
 * packaged binary run one code path (the same rule `sentinel.ts` states for the code-intelligence runtime).
 *
 * **Neither asset is carried by a build yet**, so both readers take their absent branch and the About page shows what
 * the requirements say it shows then: an em dash for Build, and REQ-SHELL-142's caption for the licence bundle. That
 * is the requirement met on the branch that reaches, not a stub. `pnpm notices` (`tools/notices/`, 2026-09-27) now
 * writes the licence bundle to `apps/desktop/resources/` when its validation passes; carrying the two assets into the
 * artifact belongs to the packaging part (ADR-0054, first-release-plan.md §4.4) and changes nothing here when it lands.
 */

export const BUILD_ID_ASSET = 'build-id.txt';
/**
 * REQ-STARTUP-141 fixes the name, case included: `THIRD-PARTY-LICENSES.txt`. It was written in lower case until
 * 2026-09-27, which a case-insensitive filesystem forgives and a Linux one does not — the About page there would have
 * shown the absent caption beside a bundle that is present (`docs/defects/fixed/the-about-page-looks-for-the-licence-
 * bundle-under-a-lowercase-name.md`). The generator writes the same literal (`tools/notices/notices.mjs`, `NOTICES_FILE`),
 * and `about.test.ts` holds the two equal.
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
