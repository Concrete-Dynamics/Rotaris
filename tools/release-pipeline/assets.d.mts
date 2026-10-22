// The types for `assets.mjs`. That module is plain JavaScript on purpose — the signing job runs the release pipeline's
// tool without `pnpm install` — so its contract is declared here for the tests beside it (REQ-STARTUP-031/032/152).
import type { ArtifactKind, ChecksumEntry, PlatformKey } from '@rotaris/release-naming';

export interface ReleaseAsset {
  readonly platform: PlatformKey;
  readonly kind: ArtifactKind;
  readonly name: string;
}

/** `PD-STARTUP-001`: `windows-x64` alone until the directive is withdrawn. */
export declare const PUBLISHED_PLATFORMS: readonly PlatformKey[];
export declare function expectedAssets(version: string, platforms?: readonly string[]): ReleaseAsset[];
export declare function sha256File(path: string): string;
export declare function readReleaseDirectory(dir: string, version: string, platforms?: readonly string[]): { assets: ReleaseAsset[]; missing: ReleaseAsset[]; foreign: string[] };
export declare function writeChecksumManifest(dir: string, version: string, platforms?: readonly string[]): { ok: true; entries: ChecksumEntry[]; text: string } | { ok: false; problems: string[] };
export declare function verifyReleaseDirectory(dir: string, version: string, platforms?: readonly string[]): string[];
