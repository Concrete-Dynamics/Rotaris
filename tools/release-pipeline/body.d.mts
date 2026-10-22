// The types for `body.mjs` (REQ-STARTUP-033..035, PD-STARTUP-001), declared for the tests beside it.
import type { ChecksumEntry } from '@rotaris/release-naming';

export declare const FIRST_RELEASE_CHANGELOG: string;
export declare const WINDOWS_ONLY_LINE: string;
export declare function noCommitsChangelog(previousTag: string): string;
export declare function changesSinceHeading(previousTag: string): string;
export declare function changelog(previousTag: string | null, subjects: readonly string[]): string;
export declare function previousReleaseTag(tags: readonly string[], tag: string): string | null;
export declare function releaseMetadata(tag: string): { tag: string; version: string; name: string; prerelease: boolean };
export declare function releaseBody(input: {
  tag: string;
  entries: readonly ChecksumEntry[];
  platformsWithAssets: readonly string[];
  changelogText: string;
  publishedPlatforms?: readonly string[];
}): string;
export declare function changelogFromGit(repo: string, tag: string): string;
