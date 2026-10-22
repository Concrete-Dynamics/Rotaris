/**
 * The macOS and Linux packaging configuration, PREPARED AND NOT WIRED (R-080, 2026-10-22; ADR-0054, "Linux and macOS
 * configuration prepared").
 *
 * IC-3 binds every Linux and macOS release artifact, and `PD-STARTUP-001` keeps both platform keys out of a release, so
 * nothing builds from this module: `pnpm package` runs `electron-builder --win` with `electron-builder.yml` alone and
 * never imports this file, and `scripts/build-hooks.cjs` refuses every platform but `win32` in `beforeBuild` and
 * `afterPack` ("IC-3: no <platform> artifact may be produced until the build hosts exist"). What this module holds is
 * what a build host would run with, read against the requirements here rather than invented on the day a host exists,
 * and held by `platform-targets.test.ts`:
 *
 *   macos-arm64   REQ-STARTUP-014 (identifier `ai.rotaris.app`), REQ-STARTUP-022 (a compressed disk image, native ARM64
 *                 only, its volume `Rotaris <version>`, an /Applications link), REQ-STARTUP-023 (no code signature, no
 *                 notarization)
 *   linux-x86_64  REQ-STARTUP-024 (an AppImage that runs unextracted on unmodified Ubuntu 24.04; its desktop entry),
 *                 ESC-11 option (b): the stable line pins the static runtime explicitly
 *
 * Names are the authority's and are written as literals, as `artifact-names.mjs` writes the installer's, because
 * electron-builder's `${version}` is the version normalised (`0.1.0rc1` → `0.1.0-rc1`); so is the disk image's volume
 * name, which REQ-STARTUP-022 makes carry the version.
 *
 * WHAT IS NOT DECIDED HERE (the host's, IC-3): whether the static runtime launches on a host that never had
 * `libfuse.so.2` (spike 12); the two artifacts' first paint (spike 17); ADR-0056's load proof on a macOS and a Linux
 * runner, which `build-hooks.cjs` builds for win32 alone; the instance claim on both. OQ-450 asks what REQ-STARTUP-014's
 * lower-case bundle name and REQ-STARTUP-023's "no code signature" mean for an ARM64 bundle. The icon is O-4's.
 *
 * Plain ESM, like `artifact-names.mjs`, importing the naming authority by path.
 */
import { artifactName, parseReleaseVersion } from '../../../../tools/release-naming/src/index.ts';

/**
 * Per platform key: the artifact kind, the GitHub-hosted runner the release matrix would use, the configuration keys the
 * artifact's name is written to, and the configuration merged over `electron-builder.yml`.
 *
 * The runners: REQ-STARTUP-025 builds the AppImage against the oldest supported base, so the Linux runner is pinned to
 * Ubuntu 24.04 rather than `ubuntu-latest`, which moves; REQ-STARTUP-022's native ARM64 build needs an Apple-silicon
 * runner, pinned for the same reason.
 */
export const PREPARED_TARGETS = Object.freeze({
  'macos-arm64': {
    kind: 'dmg',
    runner: 'macos-15',
    nameKeys: ['mac.artifactName', 'dmg.artifactName'],
    config: {
      mac: {
        target: [{ target: 'dmg', arch: ['arm64'] }],
        // REQ-STARTUP-014.
        appId: 'ai.rotaris.app',
        category: 'public.app-category.developer-tools',
        // REQ-STARTUP-023: no code signature and no notarization ticket. `null` skips signing outright (OQ-450 (b)).
        identity: null,
        notarize: false,
      },
      dmg: {
        // REQ-STARTUP-022: compressed, with the drag-to-install link to /Applications beside the bundle.
        format: 'UDZO',
        contents: [
          { x: 130, y: 220 },
          { x: 410, y: 220, type: 'link', path: '/Applications' },
        ],
      },
    },
  },
  'linux-x86_64': {
    kind: 'appimage',
    runner: 'ubuntu-24.04',
    nameKeys: ['linux.artifactName', 'appImage.artifactName'],
    config: {
      // ESC-11, option (b): the stable line (app-builder-lib 26.15.3) admits `toolsets.appimage` "1.0.3", the static
      // runtime that needs no `libfuse.so.2`. Its default, "0.0.0", is the legacy FUSE 2 runtime, and with it the tool
      // writes `--no-sandbox` into the desktop entry's Exec line unconditionally (`AppImageTarget.js`); with "1.0.3" it
      // writes none, and the image's AppRun adds the switch only where `unshare -Ur true` fails — the behaviour ESC-11
      // chose. 26.x labels "1.0.3" a beta; spike 12 measures it on a host that never had the legacy library (IC-3).
      toolsets: { appimage: '1.0.3' },
      linux: {
        target: [{ target: 'AppImage', arch: ['x64'] }],
        category: 'Development',
        // REQ-STARTUP-024's desktop entry. Exec is electron-builder's (`AppRun %U`): `%U` passes the directory a file
        // manager hands over, which REQ-STARTUP-041 (a) reads as the opened workspace; `inode/directory` is what makes
        // a folder's "open with" offer the application at all.
        desktop: {
          entry: {
            Type: 'Application',
            Name: 'Rotaris',
            Terminal: 'false',
            Categories: 'Development;IDE;',
            MimeType: 'inode/directory;',
          },
        },
      },
    },
  },
});

/** The macOS volume name REQ-STARTUP-022 fixes: `Rotaris <version>`, the declared text, never the normalised one. */
export function dmgVolumeName(version) {
  return `Rotaris ${parseReleaseVersion(version).version}`;
}

function setPath(target, dotted, value) {
  const [section, field] = dotted.split('.');
  target[section] = { ...(target[section] ?? {}), [field]: value };
}

/**
 * The configuration a build host for `platform` would run with: `base` (the parsed `electron-builder.yml`) with the
 * prepared sections merged over it section by section, and the artifact's name — and, for the disk image, its volume
 * name — written as literals from the declared `version`. A new object; `base` is not touched. A name already present
 * in `base` is refused, as `configurationWithNames` refuses one, so no `${version}` template can return through here.
 * `windows-x64` is not prepared, it is live: its configuration is `artifact-names.mjs`'s.
 */
export function preparedConfiguration(base, platform, version) {
  const target = PREPARED_TARGETS[platform];
  if (!target) throw new Error(`"${platform}" has no prepared configuration; the prepared platform keys are ${Object.keys(PREPARED_TARGETS).join(', ')}`);
  const declared = parseReleaseVersion(version).version;
  const out = { ...base };
  for (const [section, value] of Object.entries(target.config)) {
    out[section] = value !== null && typeof value === 'object' && !Array.isArray(value) ? { ...(base[section] ?? {}), ...value } : value;
  }
  const name = artifactName(declared, target.kind);
  for (const key of target.nameKeys) {
    const [section, field] = key.split('.');
    const present = base[section] && base[section][field];
    if (present !== undefined && present !== null) throw new Error(`REQ-STARTUP-031: the configuration already sets ${key} ("${present}"); the artifact names are rendered from the declared version and composed nowhere else`);
    setPath(out, key, name);
  }
  if (target.kind === 'dmg') setPath(out, 'dmg.title', dmgVolumeName(declared));
  return out;
}
