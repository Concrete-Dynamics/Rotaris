/**
 * REQ-STARTUP-030, REQ-STARTUP-031 — the build matrix and the artifact names.
 *
 * One authority. `electron-builder`'s `artifactName` templates, the updater's
 * expectation of what a release contains, and the portable's assembly step all
 * read this module and compose nothing of their own.
 */
export const PLATFORM_KEYS = ['windows-x64', 'macos-arm64', 'linux-x86_64'] as const;
export type PlatformKey = (typeof PLATFORM_KEYS)[number];

export const ARTIFACT_KINDS = ['setup', 'portable', 'dmg', 'appimage'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** Per-platform kinds, exactly as REQ-STARTUP-031 fixes them. */
export const KINDS_BY_PLATFORM: Readonly<Record<PlatformKey, readonly ArtifactKind[]>> = {
  'windows-x64': ['setup', 'portable'],
  'macos-arm64': ['dmg'],
  'linux-x86_64': ['appimage'],
};

export class UnknownArtifactKindError extends Error {
  constructor(requested: string) {
    super(`Unknown artifact kind "${requested}". Known kinds: ${ARTIFACT_KINDS.join(', ')}.`);
    this.name = 'UnknownArtifactKindError';
  }
}

export function artifactName(version: string, kind: string): string {
  switch (kind as ArtifactKind) {
    case 'setup':
      return `Rotaris-${version}-windows-x64-setup.exe`;
    case 'portable':
      return `Rotaris-${version}-windows-x64-portable.exe`;
    case 'dmg':
      return `Rotaris-${version}-macos-arm64.dmg`;
    case 'appimage':
      return `Rotaris-${version}-linux-x86_64.AppImage`;
    default:
      throw new UnknownArtifactKindError(kind);
  }
}

/** Every artifact a full release publishes, in matrix order. */
export function releaseArtifacts(version: string): readonly { platform: PlatformKey; kind: ArtifactKind; name: string }[] {
  return PLATFORM_KEYS.flatMap((platform) => KINDS_BY_PLATFORM[platform].map((kind) => ({ platform, kind, name: artifactName(version, kind) })));
}

export const CHECKSUM_MANIFEST_NAME = 'SHA256SUMS.txt' as const;
export const CHECKSUM_SIGNATURE_NAME = 'SHA256SUMS.txt.sig' as const;
