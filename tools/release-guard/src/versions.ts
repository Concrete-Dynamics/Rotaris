import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * REQ-STARTUP-158, REQ-STARTUP-028 — the version half of the pre-build guard: the tag's version against every place
 * the build declares a product version.
 */

/** One place a product version is declared: a JSON file relative to the repository root, and the field holding it. */
export interface VersionPlace {
  readonly file: string;
  readonly field: string;
}

/**
 * Where the product version is declared — **one place**, decided at this guard's first execution (ADR-0054, §4.1 of
 * `first-release-plan.md`). The desktop application's manifest is the only `version` an artifact carries:
 * electron-builder renders it into every artifact name (REQ-STARTUP-031) and into the installer's own metadata, packs
 * the file into the archive the application runs from, and the running application reads its version back from that
 * packed copy (`apps/desktop/src/main/version.ts`, REQ-STARTUP-004/007). Every other `version` in the workspace belongs
 * to a private package no artifact carries — the workspace packages are the desktop's devDependencies, compiled into its
 * bundles from source and never packed as packages — so none of them is a product version, and the workspace root
 * declares none at all. A place that comes to carry the version into an artifact joins this list.
 */
export const PRODUCT_VERSION_PLACES: readonly VersionPlace[] = [{ file: 'apps/desktop/package.json', field: 'version' }];

export interface DeclaredVersion {
  readonly place: VersionPlace;
  /** The declared string, or null when the place declares none (missing file, unparseable, no such field, not a string). */
  readonly value: string | null;
  /** Why `value` is null. */
  readonly absent?: string;
}

export function describePlace(place: VersionPlace): string {
  return `${place.file} ("${place.field}")`;
}

/** Reads every place. Never throws: a place that cannot be read declares no version, which differs from any tag. */
export function readDeclaredVersions(repoRoot: string, places: readonly VersionPlace[] = PRODUCT_VERSION_PLACES): DeclaredVersion[] {
  return places.map((place) => {
    let text: string;
    try {
      text = readFileSync(join(repoRoot, place.file), 'utf8');
    } catch (cause) {
      return { place, value: null, absent: `the file could not be read (${reasonOf(cause)})` };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (cause) {
      return { place, value: null, absent: `the file is not JSON (${reasonOf(cause)})` };
    }
    const value = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>)[place.field] : undefined;
    if (value === undefined) return { place, value: null, absent: `the file has no "${place.field}" field` };
    if (typeof value !== 'string') return { place, value: null, absent: `"${place.field}" is not a string` };
    return { place, value };
  });
}

/**
 * REQ-STARTUP-028's message, or null when every place agrees with the tag. Equality is exact text: the tag's version
 * is what every artifact name renders (REQ-STARTUP-031), so `0.1.0-rc1` does not equal `0.1.0rc1`.
 *
 * The message names the tag version, every declared version that differs, and every place a version is declared —
 * the agreeing ones too, since the instruction is to bump *every* place — and says why.
 */
export function versionMismatch(tag: string, tagVersion: string, declared: readonly DeclaredVersion[]): string | null {
  if (declared.every((d) => d.value === tagVersion)) return null;
  const width = Math.max(...declared.map((d) => describePlace(d.place).length));
  const lines = declared.map((d) => {
    const stated = d.value === null ? `no version — ${d.absent}` : JSON.stringify(d.value);
    return `  ${describePlace(d.place).padEnd(width)}  ${stated}${d.value === tagVersion ? '' : '   ← differs'}`;
  });
  return [
    `error: the tag and the build disagree on the product version (REQ-STARTUP-028).`,
    `  tag ${tag} is version ${tagVersion}; the build declares:`,
    ...lines,
    `  The product releases exactly one version (REQ-STARTUP-158): bump every place listed above to ${tagVersion}, then tag the commit that carries the bump.`,
  ].join('\n');
}

/** A file system refusal in a sentence: a missing file is the case a reader meets, so it is said plainly. */
export function reasonOf(cause: unknown): string {
  if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT') return 'no such file';
  return cause instanceof Error ? cause.message : String(cause);
}
