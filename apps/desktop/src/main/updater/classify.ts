import { pathKey } from '@rotaris/platform';
import type { ArtifactKind } from '@rotaris/release-naming';

/**
 * REQ-STARTUP-106 — installation-flavour classification, decided from THE ARTIFACT THE LAUNCH STARTED FROM and
 * never from the running image. Pure over the facts it is handed; `electron.ts` gathers them once per process,
 * because the classification is stable across launches of the same installation and takes no user input.
 *
 * The order: first whether this is a released standalone artifact at all — which is not a flavour test and which no
 * variable overrides, because REQ-STARTUP-106 classifies "any build that is not running from one of the released
 * standalone artifacts" not updatable, a source checkout or a development environment among them — and only then the
 * flavour tests, in the requirement's order: the AppImage variable before any other flavour test, then the macOS
 * bundle, then on Windows the installer's own registry record (`InstallDir` under `HKCU\Software\Rotaris`,
 * REQ-STARTUP-016) tested against the artifact — never against the running image, which under a preparation
 * (REQ-STARTUP-165) sits inside a copy the product can recreate at will. Everything else on Windows that names an
 * artifact is portable.
 *
 * The AppImage test is applied to a packaged Linux build alone. `APPIMAGE` is inherited by every child of an
 * AppImage-hosted terminal or editor, so on any other launch it names somebody else's file: read on a source-tree
 * launch it would contact the endpoint REQ-STARTUP-106 forbids, and read on a packaged Windows or macOS build it would
 * select a flavour that platform never carries (REQ-STARTUP-031) — under PD-STARTUP-001 one never offered — so a
 * variable a user can set would silently stop the check from ever offering anything (REQ-STARTUP-111). The AppImage
 * artifact exists for `linux-x86_64` alone, so the test is still "before any other flavour test" on the one platform
 * where it can hold.
 *
 * Which file the artifact is (ADR-0054, "How the artifact is identified for the update path"): the portable's own
 * launcher publishes its absolute path in `ROTARIS_PORTABLE_ARTIFACT` — the variable REQ-STARTUP-147 admits as "the
 * variable by which that form names the artifact file a launch started from", whose value is a file path and nothing
 * else. An installed tree made no copy of itself, so its artifact is the executable that is running. With neither a
 * variable nor a registry match, a packaged Windows build is **not updatable** here — ADR-0054's reading ("absent
 * variable → not updatable"), where REQ-STARTUP-106's copied-tree sentence would read it as portable; that
 * disagreement is OQ-84 and the build proceeds under ADR-0054.
 *
 * A build that is not packaged — the source tree, `pnpm dev`, every proof — is classified not updatable: no check is
 * performed, and the process issues no request to the endpoint and none to any release-asset URL (REQ-STARTUP-150).
 */
export const PORTABLE_ARTIFACT_VARIABLE = 'ROTARIS_PORTABLE_ARTIFACT';
/** REQ-STARTUP-147: published by the AppImage runtime, tested before any other flavour test. */
export const APPIMAGE_VARIABLE = 'APPIMAGE';

/** The four flavours REQ-STARTUP-107 maps to the four artifact kinds of REQ-STARTUP-031. */
export type Flavour = 'installer' | 'portable' | 'app-bundle' | 'appimage';

export const ARTIFACT_KIND_BY_FLAVOUR: Readonly<Record<Flavour, ArtifactKind>> = {
  installer: 'setup',
  portable: 'portable',
  'app-bundle': 'dmg',
  appimage: 'appimage',
};

export type Classification =
  | {
      readonly updatable: true;
      readonly flavour: Flavour;
      /** REQ-STARTUP-125's target: the file (portable, AppImage) or the directory (installed tree, bundle) the apply step acts on. */
      readonly target: string;
    }
  | { readonly updatable: false; readonly reason: string };

export interface ClassificationFacts {
  readonly platform: NodeJS.Platform;
  /** Electron's `app.isPackaged`: false for the source tree, `pnpm dev` and every proof. */
  readonly packaged: boolean;
  /** The executable that is running — the artifact itself only for an installed tree or a bundle. */
  readonly execPath: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The installer's `InstallDir` value, read from the registry by the caller (win32 only), or null when absent. */
  readonly installDir: string | null;
}

/**
 * The value of `InstallDir` in `reg.exe query`'s output, or null. The line has the shape
 * `    InstallDir    REG_SZ    C:\Users\u\AppData\Local\Rotaris`; a `REG_EXPAND_SZ` is read the same way. Pure, so the
 * one Windows-specific read (`electron.ts`) has a decidable parser beside it.
 */
export function parseInstallDir(regQueryOutput: string): string | null {
  for (const raw of regQueryOutput.split(/\r?\n/)) {
    const m = /^\s*InstallDir\s+REG_(?:EXPAND_)?SZ\s+(.*\S)\s*$/i.exec(raw);
    if (m) return m[1]!;
  }
  return null;
}

/** Whether `path` resolves inside `dir`, by the product's own path identity (case-folded on Windows). */
export function insideDirectory(path: string, dir: string, platform: NodeJS.Platform): boolean {
  const key = pathKey(path, platform);
  const root = pathKey(dir, platform);
  const sep = platform === 'win32' ? '\\' : '/';
  return key.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

/** The `.app` directory enclosing a path, or null when the path is not inside a bundle. */
export function enclosingBundle(execPath: string): string | null {
  const parts = execPath.split('/');
  for (let i = parts.length - 1; i > 0; i -= 1) {
    if (parts[i]!.endsWith('.app')) return parts.slice(0, i + 1).join('/');
  }
  return null;
}

export function classifyInstallation(facts: ClassificationFacts): Classification {
  // Not a flavour test, and nothing overrides it: a build that is not a released standalone artifact is not updatable
  // whatever its environment says, and issues no request (REQ-STARTUP-106, REQ-STARTUP-150).
  if (!facts.packaged) {
    return { updatable: false, reason: 'a development or source-tree launch, not a released standalone artifact (REQ-STARTUP-106)' };
  }
  const appImage = facts.env[APPIMAGE_VARIABLE];
  if (facts.platform === 'linux' && appImage !== undefined && appImage !== '') {
    // The AppImage clause is applied before any other flavour test; the target is the file the variable names,
    // never the executable image unpacked from it (REQ-STARTUP-106).
    return { updatable: true, flavour: 'appimage', target: appImage };
  }
  if (facts.platform === 'darwin') {
    const bundle = enclosingBundle(facts.execPath);
    return bundle === null
      ? { updatable: false, reason: 'a macOS build running outside a .app bundle is not a released artifact (REQ-STARTUP-106)' }
      : { updatable: true, flavour: 'app-bundle', target: bundle };
  }
  if (facts.platform === 'win32') {
    const published = facts.env[PORTABLE_ARTIFACT_VARIABLE];
    const artifact = published !== undefined && published !== '' ? published : facts.execPath;
    if (facts.installDir !== null && facts.installDir !== '' && insideDirectory(artifact, facts.installDir, 'win32')) {
      return { updatable: true, flavour: 'installer', target: facts.installDir };
    }
    if (published !== undefined && published !== '') {
      return { updatable: true, flavour: 'portable', target: published };
    }
    return {
      updatable: false,
      reason: `a packaged Windows build outside the installer's InstallDir with no ${PORTABLE_ARTIFACT_VARIABLE} naming the artifact it started from — the payload run directly, or an installed tree copied elsewhere (ADR-0054's reading; OQ-84)`,
    };
  }
  return { updatable: false, reason: `a packaged ${facts.platform} build with no ${APPIMAGE_VARIABLE} is not one of the released artifacts (REQ-STARTUP-031, REQ-STARTUP-106)` };
}
