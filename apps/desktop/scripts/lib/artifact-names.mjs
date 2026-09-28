/**
 * The artifact names `pnpm package` hands electron-builder, rendered from the DECLARED product version
 * (REQ-STARTUP-031, REQ-STARTUP-158; first-release-plan.md §4.1/§4.2/§4.5).
 *
 * The one place a release declares its version is `apps/desktop/package.json` (`tools/release-guard`, `versions.ts`),
 * and REQ-STARTUP-027's grammar writes a prerelease without a separator: `0.1.0rc1`. electron-builder does not keep
 * that text: when it reads the manifest it normalises the version through loose SemVer, which rewrites the suffix with
 * a hyphen (`0.1.0rc1` → `0.1.0-rc1`, measured on app-builder-lib 26.15.3), and its `${version}` macro renders the
 * normalised value. So the names are NOT templates in `electron-builder.yml` any more: `package.mjs` reads the declared
 * text here, renders the names through `tools/release-naming` — the single authority — and writes them as literal
 * `artifactName` values into the configuration electron-builder is run with (`release/electron-builder.package.yml`, the
 * repository's yml with the two keys set), which its macro expander leaves as they are. `build-hooks.cjs` then compares
 * what electron-builder is configured to produce, and what it did produce, against the same declared text
 * (`checkNaming`, `artifactBuildCompleted`).
 *
 * Why a written configuration and not `-c.win.artifactName=…` on the command line (measured 2026-09-28, 26.15.3): a
 * dotted override beside `--config <file>` turns the configuration into `{ extends: <file>, win: {…} }`, and with no
 * path left to load electron-builder ALSO reads the project's default `electron-builder.yml`, so the yml is merged twice
 * — `files` and `extraResources` doubled — and the keep-prebuild counterfactual's variant is merged OVER the base rather
 * than in place of it, so the base's prebuild exclusions stay in force and the counterfactual stops being one.
 *
 * Plain ESM, loaded by `package.mjs` (import), by `build-hooks.cjs` (dynamic import) and by the tests. The naming module
 * is imported by path, as the hook imports it: one file of erasable syntax that plain Node loads without a bundler.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifactName, parseReleaseVersion } from '../../../../tools/release-naming/src/index.ts';

/** The one place the product version is declared, relative to the application directory (`PRODUCT_VERSION_PLACES`). */
export const DECLARED_VERSION_FILE = 'package.json';

/**
 * The declared product version, exactly as the manifest's text writes it, validated through REQ-STARTUP-029's grammar.
 * The text is read from the file, never from electron-builder's metadata, because electron-builder's copy is normalised.
 * A version outside the grammar is refused with `UnsupportedVersionError`: such a text renders no REQ-STARTUP-031 name.
 */
export function declaredProductVersion(appDir) {
  const file = join(appDir, DECLARED_VERSION_FILE);
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  const value = manifest.version;
  if (typeof value !== 'string') throw new Error(`${file} declares no product version ("version" is ${value === undefined ? 'absent' : typeof value}); the product releases one version (REQ-STARTUP-158)`);
  return parseReleaseVersion(value).version;
}

/** The Windows artifact electron-builder produces on this configuration, named by the authority (REQ-STARTUP-031). */
export function packagingArtifactNames(version) {
  return { setup: artifactName(parseReleaseVersion(version).version, 'setup') };
}

/**
 * Every configuration key electron-builder reads an installer's `artifactName` from on this configuration: the
 * platform's (`win`) and the target's (`nsis`; the target's wins when both are set, so both are set to the one name).
 */
export const BUILDER_ARTIFACT_NAME_KEYS = ['win.artifactName', 'nsis.artifactName'];

/**
 * The parsed configuration with every key above set to the setup name — a new object; the input is not touched. A key
 * already present is a name composed outside the authority and is refused rather than overwritten, so the repository's
 * yml cannot quietly grow a `${version}` template again.
 */
export function configurationWithNames(config, names) {
  const out = { ...config };
  for (const key of BUILDER_ARTIFACT_NAME_KEYS) {
    const [section, field] = key.split('.');
    const present = config[section] && config[section][field];
    if (present !== undefined && present !== null) throw new Error(`REQ-STARTUP-031: the configuration already sets ${key} ("${present}"); the artifact names are rendered from the declared version by pnpm package and composed nowhere else`);
    out[section] = { ...(config[section] ?? {}), [field]: names.setup };
  }
  return out;
}

/**
 * The configuration text `pnpm package` writes and runs electron-builder with: the given yml text (the repository's, or
 * the counterfactual's variant of it) parsed by the parser electron-builder loads it with, the names set, dumped again.
 * `yaml` is electron-builder's own `js-yaml`, handed in so this file loads without resolving it.
 */
export function namedConfigurationText(ymlText, names, yaml) {
  return yaml.dump(configurationWithNames(yaml.load(ymlText), names), { lineWidth: -1, noRefs: true });
}

/**
 * Whether a file electron-builder produced carries the name the declared version renders: the installer exactly, or
 * its block map, which electron-builder names after the installer. Anything else is a name composed somewhere other
 * than the authority (REQ-STARTUP-031, REQ-STARTUP-152). Returns the problem, or null.
 */
export function producedNameProblem(fileBasename, names) {
  if (fileBasename === names.setup || fileBasename === `${names.setup}.blockmap`) return null;
  return `REQ-STARTUP-031: electron-builder produced "${fileBasename}"; the declared version renders "${names.setup}" (a prerelease's suffix carries no hyphen)`;
}
