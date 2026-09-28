import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMPLETE_VERSION_PATTERN, resolveCommand, SETUP_MANIFEST_SCHEMA_VERSION as MANIFEST_SCHEMA_VERSION, type ResolvedCommand } from '@rotaris/config';
import { reasonOf } from './versions.js';

/**
 * REQ-STARTUP-059 — the package-pin half of the pre-build guard: the setup manifest a build ships against the packages
 * the built-in default configuration of that same build launches through `npx` or `uvx`. Same stage, same exit code as
 * the version half (REQ-STARTUP-028).
 */

/**
 * Where the guard reads the setup manifest (REQ-STARTUP-058) from: the file `electron-builder.yml` carries to the root of
 * the artifact's resources (first-release-plan.md §4.1, built 2026-09-28). Its whole shape is `@rotaris/config`'s
 * `SetupManifestSchema`, which `setup-manifest.test.ts` validates the shipped file against; this half reads only the two
 * fields REQ-STARTUP-059 needs, so a manifest missing from a tree still fails the stage naming the file — the
 * requirement, not a fault of the guard: a default the manifest does not pin fails the stage.
 */
export const SETUP_MANIFEST_LOCATION = 'apps/desktop/resources/setup-manifest.json';
/** REQ-STARTUP-058: schema version 1 — the schema's own number, so the two cannot drift. */
export const SETUP_MANIFEST_SCHEMA_VERSION: number = MANIFEST_SCHEMA_VERSION;
/**
 * The field listing the tool-server packages the manifest pins, each `{ name, version }` (REQ-STARTUP-059's "every
 * tool-server package it lists"). With `schemaVersion` it is the whole of the manifest this guard reads; the rest of
 * REQ-STARTUP-058's schema belongs to its builder.
 */
export const TOOL_SERVER_PACKAGES_FIELD = 'toolServerPackages';
/** Where `SHIPPED_MCP_SERVERS` is written, named in every message (a test asserts it still is). */
export const DEFAULT_CONFIGURATION_LOCATION = 'packages/config/src/mcp/defaults.ts';

export interface ManifestPin {
  readonly name: string;
  readonly version: string;
  /** `toolServerPackages[<index>]` */
  readonly at: string;
}

export type ManifestReading =
  | { readonly readable: true; readonly pins: readonly ManifestPin[]; readonly errors: readonly string[] }
  | { readonly readable: false; readonly reason: string };

/**
 * REQ-STARTUP-059's first sentence: exactly one version per listed package, each a complete version string with no
 * range, alias or floating tag. Three numeric components and an optional prerelease, post-release or build qualifier
 * (`1.2.3`, `1.1.403`, `1.2.3-beta.1`, `1.2.3rc1`); `^1.2.3`, `1.2`, `1.x`, `latest` and `npm:x@1.2.3` are not.
 */
export function isCompleteVersion(version: string): boolean {
  // The schema's pattern, so what the guard admits is what the manifest's schema admits. One character per repetition:
  // an optional separator inside a starred group of `+` runs backtracks exponentially on a long qualifier followed by
  // a stray character, and a guard that hangs does not exit 1.
  return COMPLETE_VERSION_PATTERN.test(version);
}

export function readSetupManifest(repoRoot: string, location: string = SETUP_MANIFEST_LOCATION): ManifestReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(repoRoot, location), 'utf8'));
  } catch (cause) {
    return { readable: false, reason: reasonOf(cause) };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { readable: false, reason: 'it is not a JSON object' };
  const record = parsed as Record<string, unknown>;
  if (record['schemaVersion'] !== SETUP_MANIFEST_SCHEMA_VERSION) {
    return { readable: false, reason: `its "schemaVersion" is ${JSON.stringify(record['schemaVersion'] ?? null)}, not ${SETUP_MANIFEST_SCHEMA_VERSION}` };
  }
  const listed = record[TOOL_SERVER_PACKAGES_FIELD];
  if (!Array.isArray(listed)) return { readable: false, reason: `it has no "${TOOL_SERVER_PACKAGES_FIELD}" list` };
  const pins: ManifestPin[] = [];
  const errors: string[] = [];
  listed.forEach((entry: unknown, index) => {
    const at = `${TOOL_SERVER_PACKAGES_FIELD}[${index}]`;
    const name = entry !== null && typeof entry === 'object' ? (entry as Record<string, unknown>)['name'] : undefined;
    const version = entry !== null && typeof entry === 'object' ? (entry as Record<string, unknown>)['version'] : undefined;
    if (typeof name !== 'string' || name === '' || typeof version !== 'string') {
      errors.push(`error: the setup manifest's ${at} is not a { "name", "version" } pair of strings (REQ-STARTUP-059) — ${location}`);
      return;
    }
    if (!isCompleteVersion(version)) {
      errors.push(`error: the setup manifest pins "${name}" to ${JSON.stringify(version)}, which is not a complete version string — a range, an alias or a floating tag is not a pin (REQ-STARTUP-059) — ${location}, ${at}`);
    }
    pins.push({ name, version, at });
  });
  const byName = new Map<string, ManifestPin[]>();
  for (const pin of pins) byName.set(pin.name, [...(byName.get(pin.name) ?? []), pin]);
  for (const [name, same] of byName) {
    if (same.length > 1) {
      errors.push(`error: the setup manifest lists "${name}" ${same.length} times (${same.map((p) => `${p.at} = ${JSON.stringify(p.version)}`).join(', ')}); it must state exactly one version for it (REQ-STARTUP-059) — ${location}`);
    }
  }
  return { readable: true, pins, errors };
}

/** One package a default entry launches through a runner. */
export interface DefaultLaunch {
  readonly server: string;
  readonly runner: 'npx' | 'uvx';
  readonly name: string;
  /** The version the specification pins, or null when it pins none. */
  readonly version: string | null;
  /** The launch as the product resolves it, for the message. */
  readonly launch: string;
}

/**
 * The specification's version: what follows `==`, else what follows the last `@` (REQ-STARTUP-064's two forms, for
 * either runner). The name is everything before it, as written — REQ-STARTUP-059 compares with no case folding and no
 * alias expansion.
 */
export function splitPackageSpec(spec: string): { readonly name: string; readonly version: string | null } {
  const eq = spec.indexOf('==');
  if (eq > 0) return { name: spec.slice(0, eq), version: spec.slice(eq + 2) };
  const at = spec.lastIndexOf('@');
  if (at > 0) return { name: spec.slice(0, at), version: spec.slice(at + 1) };
  return { name: spec, version: null };
}

/**
 * Which options each runner takes and which of them name packages. Anything else before the first positional argument
 * is refused rather than guessed at: a guard that misread an option could pass a package it never saw.
 */
const RUNNER_OPTIONS = {
  npx: {
    flags: new Set(['-y', '--yes', '--no', '--no-install', '-q', '--quiet', '--ignore-existing', '--prefer-offline', '--prefer-online', '--offline']),
    valued: new Set(['--registry', '--cache', '--prefix', '--userconfig', '--loglevel', '-w', '--workspace']),
    packages: new Set(['-p', '--package']),
    /** A package spec given this way makes the first positional the executable, not a package. */
    replacesPositional: new Set(['-p', '--package']),
    unreadable: new Set(['-c', '--call']),
  },
  uvx: {
    flags: new Set(['-q', '--quiet', '-v', '--verbose', '--offline', '--no-cache', '-n', '--isolated', '--refresh', '--reinstall', '-U', '--upgrade', '--no-progress', '--native-tls', '--no-config', '--no-env-file', '--compile-bytecode', '--managed-python', '--no-managed-python', '--no-python-downloads']),
    valued: new Set(['-p', '--python', '--index', '--default-index', '--index-url', '--extra-index-url', '--cache-dir', '--directory', '--project', '--config-file', '--env-file', '--python-preference', '--color', '--index-strategy', '--keyring-provider', '--resolution', '--prerelease', '--exclude-newer', '--link-mode']),
    packages: new Set(['--from', '--with']),
    replacesPositional: new Set(['--from']),
    unreadable: new Set(['--with-editable', '--with-requirements', '-c', '--constraints', '--overrides', '-b', '--build-constraints']),
  },
} as const;

/** The package specifications a resolved `npx`/`uvx` launch names, or why they cannot be read from it. */
export function packageSpecs(runner: 'npx' | 'uvx', args: readonly string[]): { readonly specs: readonly string[] } | { readonly problem: string } {
  const options = RUNNER_OPTIONS[runner];
  const named: string[] = [];
  let replaced = false;
  let i = 0;
  for (; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--') { i++; break; }
    if (!arg.startsWith('-')) break;
    const eq = arg.indexOf('=');
    const option = arg.startsWith('--') && eq > 0 ? arg.slice(0, eq) : arg;
    const inline = option === arg ? null : arg.slice(eq + 1);
    if (options.flags.has(option) && inline === null) continue;
    const valued = options.valued.has(option) || options.packages.has(option) || options.unreadable.has(option);
    if (!valued) return { problem: `${runner} is given the option "${arg}", which this guard does not know how to read` };
    const value = inline ?? args[++i];
    if (value === undefined) return { problem: `${runner}'s option "${option}" has no value` };
    if (options.unreadable.has(option)) return { problem: `${runner}'s option "${option}" names packages this guard cannot read from the launch` };
    if (options.packages.has(option)) {
      named.push(...(runner === 'uvx' && option === '--with' ? value.split(',') : [value]));
      if (options.replacesPositional.has(option)) replaced = true;
    }
  }
  const positional = args[i];
  if (!replaced) {
    if (positional === undefined) return { problem: `${runner} is given no package to run` };
    named.unshift(positional);
  }
  return { specs: named };
}

/** How the guard resolves a default entry: the product's own resolution (REQ-MCP-028..031), shorthands included. */
export function resolveShippedEntry(server: string, entry: Readonly<Record<string, unknown>>): ResolvedCommand | null {
  const command = entry['command'];
  if (typeof command !== 'string') return null;
  const args = Array.isArray(entry['args']) ? entry['args'].filter((a): a is string => typeof a === 'string') : [];
  return resolveCommand({ name: server, command, args, workspaceRoot: null, onPath: () => true, binding: null }).value;
}

/**
 * Every package the built-in default configuration launches through `npx` or `uvx`. An entry switched off by default
 * counts: `enabled: false` is the shipped state, not the launch, and a user switching it on launches exactly this
 * specification — REQ-MCP-095 requires the `browser` entry's pin in the manifest whatever its switch says. REQ-STARTUP-064
 * reads a switched-off entry as one "nothing will ever launch"; which reading governs here is OQ-69, and this one is the
 * stricter of the two.
 */
export function defaultLaunches(servers: Readonly<Record<string, unknown>>): { readonly launches: readonly DefaultLaunch[]; readonly errors: readonly string[] } {
  const launches: DefaultLaunch[] = [];
  const errors: string[] = [];
  for (const [server, value] of Object.entries(servers)) {
    if (value === null || typeof value !== 'object') continue;
    const resolved = resolveShippedEntry(server, value as Record<string, unknown>);
    if (!resolved || resolved.builtin || (resolved.command !== 'npx' && resolved.command !== 'uvx')) continue;
    const runner = resolved.command;
    const launch = [runner, ...resolved.args].join(' ');
    const read = packageSpecs(runner, resolved.args);
    if ('problem' in read) {
      errors.push(`error: cannot tell which package the built-in default "${server}" launches (REQ-STARTUP-059): ${read.problem} — ${DEFAULT_CONFIGURATION_LOCATION}, \`${launch}\``);
      continue;
    }
    for (const spec of read.specs) launches.push({ server, runner, ...splitPackageSpec(spec), launch });
  }
  return { launches, errors };
}

/**
 * REQ-STARTUP-059's two failures — a default naming a package the manifest does not pin, and a pair that disagrees —
 * each naming the package, both version strings (or the absence of one) and both file locations. Compared character
 * for character.
 */
export function pinDisagreements(launches: readonly DefaultLaunch[], manifest: ManifestReading, manifestLocation: string = SETUP_MANIFEST_LOCATION): string[] {
  const errors: string[] = [];
  if (!manifest.readable) errors.push(`error: the setup manifest could not be read, so no default package's pin can be checked (REQ-STARTUP-059) — ${manifestLocation}: ${manifest.reason}`);
  else errors.push(...manifest.errors);
  const side = (label: string, version: string | null, where: string) => `  ${label.padEnd(31)} ${version === null ? 'no version' : JSON.stringify(version)} — ${where}`;
  for (const launch of launches) {
    const defaultSide = side('built-in default configuration:', launch.version, `${DEFAULT_CONFIGURATION_LOCATION}, server "${launch.server}" launches \`${launch.launch}\``);
    const pins = manifest.readable ? manifest.pins.filter((p) => p.name === launch.name) : [];
    if (pins.length > 1) continue; // "listed N times" above already fails the stage; no single pair exists to compare.
    const pin = pins[0];
    if (!pin) {
      const why = manifest.readable ? `${manifestLocation}, ${TOOL_SERVER_PACKAGES_FIELD} lists no "${launch.name}"` : `${manifestLocation} could not be read`;
      errors.push([`error: "${launch.name}" is launched by the built-in default configuration and not pinned by the setup manifest (REQ-STARTUP-059).`, defaultSide, side('setup manifest:', null, why)].join('\n'));
    } else if (pin.version !== launch.version) {
      errors.push([`error: the two places this build states "${launch.name}"'s version disagree (REQ-STARTUP-059).`, defaultSide, side('setup manifest:', pin.version, `${manifestLocation}, ${pin.at}`)].join('\n'));
    }
  }
  return errors;
}
