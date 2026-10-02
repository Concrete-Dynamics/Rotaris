import { SHIPPED_MCP_SERVERS } from '@rotaris/config';
import { InvalidReleaseTagError, parseReleaseTag, type ReleaseTag } from '@rotaris/release-naming';
import { defaultLaunches, pinDisagreements, readSetupManifest, SETUP_MANIFEST_LOCATION } from './pins.js';
import { describePlace, PRODUCT_VERSION_PLACES, readDeclaredVersions, versionMismatch, type VersionPlace } from './versions.js';

/**
 * REQ-STARTUP-028 — the pre-build guard: ONE stage, run before any platform is built, that decides whether a tag may
 * become a release. Its two halves report together so one run names everything that is wrong:
 *
 *   - the version half (REQ-STARTUP-158): the tag's version equals every product version the build declares;
 *   - the package-pin half (REQ-STARTUP-059): the setup manifest pins every package the built-in defaults launch
 *     through `npx`/`uvx`, at the same version string.
 *
 * Exit codes are REQ-STARTUP-149's: 0 passed; 1 handled error — a mismatch in either half, or a tag outside
 * REQ-STARTUP-027's grammar, each on stderr as `error: …` — which stops every platform's build; 2 a usage error.
 */
export interface GuardInput {
  readonly tag: string;
  readonly repoRoot: string;
  /** The built-in default configuration — `SHIPPED_MCP_SERVERS` itself on the command line. */
  readonly servers: Readonly<Record<string, unknown>>;
  readonly places?: readonly VersionPlace[];
  readonly manifestLocation?: string;
}

export interface GuardOutcome {
  readonly code: 0 | 1;
  /** Each an `error: …` block, in the order the stage found them. */
  readonly errors: readonly string[];
  /** What was checked, for stdout on a pass. */
  readonly summary: readonly string[];
}

export function runGuard(input: GuardInput): GuardOutcome {
  const errors: string[] = [];
  const summary: string[] = [];
  const places = input.places ?? PRODUCT_VERSION_PLACES;
  const manifestLocation = input.manifestLocation ?? SETUP_MANIFEST_LOCATION;

  let tag: ReleaseTag | null = null;
  try {
    tag = parseReleaseTag(input.tag);
  } catch (cause) {
    if (!(cause instanceof InvalidReleaseTagError)) throw cause;
    errors.push(`error: ${cause.message} No platform is built from it (REQ-STARTUP-027).`);
  }
  if (tag) {
    const declared = readDeclaredVersions(input.repoRoot, places);
    const mismatch = versionMismatch(tag.tag, tag.version, declared);
    if (mismatch) errors.push(mismatch);
    else summary.push(`version: tag ${tag.tag} is ${tag.channel} version ${tag.version}, which ${places.map(describePlace).join(', ')} declares`);
  }

  const { launches, errors: unreadable } = defaultLaunches(input.servers);
  errors.push(...unreadable);
  const manifest = readSetupManifest(input.repoRoot, manifestLocation);
  const disagreements = pinDisagreements(launches, manifest, manifestLocation);
  errors.push(...disagreements);
  if (unreadable.length === 0 && disagreements.length === 0) {
    summary.push(`package pins: ${launches.length === 0 ? 'the built-in defaults launch no package through npx or uvx' : launches.map((l) => `${l.name} ${l.version ?? ''} (server "${l.server}")`).join(', ')} — ${manifestLocation} agrees`);
  }
  return { code: errors.length === 0 ? 0 : 1, errors, summary };
}

export interface GuardStreams {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

export const USAGE = 'usage: pnpm release:guard <tag>   (for example: pnpm release:guard v0.1.0)';

/**
 * `pnpm release:guard <tag>`: one argument, the tag; the repository is the one the script sits in. A single leading
 * `--` is dropped: pnpm passes it through (`pnpm release:guard -- v0.1.0`), and it separates, it is not an argument.
 */
export function guardCommandLine(given: readonly string[], repoRoot: string, io: GuardStreams): 0 | 1 | 2 {
  const argv = given[0] === '--' ? given.slice(1) : given;
  if (argv.length !== 1 || argv[0]!.startsWith('-')) {
    io.err(`error: expected exactly one argument, the release tag, and got ${argv.length === 0 ? 'none' : argv.map((a) => JSON.stringify(a)).join(' ')}\n${USAGE}\n`);
    return 2;
  }
  const outcome = runGuard({ tag: argv[0]!, repoRoot, servers: SHIPPED_MCP_SERVERS });
  if (outcome.code === 0) {
    io.out(`release guard: passed (REQ-STARTUP-028)\n${outcome.summary.map((s) => `  ${s}\n`).join('')}`);
  } else {
    io.err(`${outcome.errors.join('\n\n')}\n\nrelease guard: FAILED — ${outcome.errors.length} error${outcome.errors.length === 1 ? '' : 's'}; no platform may be built from ${JSON.stringify(argv[0])} (REQ-STARTUP-028).\n`);
  }
  return outcome.code;
}
