#!/usr/bin/env node
// @ts-check
/**
 * `pnpm release:pipeline <command> …` — the tag workflow's stages after the guard (`.github/workflows/release.yml`;
 * first-release-plan.md §4.2, §4.5, §4.7, §4.8). Each command is one stage and fails the release on its own.
 *
 *   preflight <tag>             before any build: the build carries a verification key, and the key record's row for
 *                               the tag's version is exactly the set it carries (REQ-STARTUP-167, REQ-STARTUP-168 (b))
 *   portable <dir> <tag>        the portable (REQ-STARTUP-031, ADR-0054 P4): the artifact `pnpm package` assembled around
 *                               the launcher stub (apps/desktop/release/portable/), read back and copied into <dir> —
 *                               refused when it is absent, not an assembled portable, or of another version (§4.5)
 *   manifest <dir> <tag>        writes SHA256SUMS.txt over the release directory's assets (REQ-STARTUP-032)
 *   sign <dir>                  writes SHA256SUMS.txt.sig with the key in ROTARIS_RELEASE_SIGNING_KEY (O-2)
 *   verify <dir> <tag>          §5's pipeline checks: the manifest covers every asset and every digest matches, the
 *                               signature verifies against a key the build carries, and that key is carried by every
 *                               recorded release this one may be offered to (REQ-STARTUP-032, 038, 167, 168 (b))
 *   body <dir> <tag> <out>      writes <out>/release-body.md and <out>/release.json — the body, the name, the
 *                               prerelease flag (REQ-STARTUP-033..035, PD-STARTUP-001)
 *   draft-args <out>            prints, one per line, the `gh release create` arguments the draft is created with —
 *                               the name, the body file and the channel's flag both ways (REQ-STARTUP-029, 034)
 *   release-state <out> <view> <draft|published>
 *                               holds what the release host recorded (`gh release view --json tagName,name,isDraft,
 *                               isPrerelease`, saved to <view>) to <out>/release.json: the name, the stage, and
 *                               prerelease exactly when the tag is of the prerelease channel (REQ-STARTUP-034)
 *   keys [<version>]            prints the key-record row this tree's build would commit (REQ-STARTUP-168 (b))
 *
 * Exit codes are the pipeline's (REQ-STARTUP-149): 0 done, 1 a handled refusal (every line `error: …`), 2 a usage
 * error. No command reaches the network (`release-state` reads what the workflow fetched), and none needs `pnpm install`: the signing job runs this file bare.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactName, CHECKSUM_MANIFEST_NAME, CHECKSUM_SIGNATURE_NAME, parseChecksumManifest, parseReleaseTag } from '../release-naming/src/index.ts';
import { readPortable } from '../../apps/desktop/scripts/lib/portable.mjs';
import { readReleaseDirectory, verifyReleaseDirectory, writeChecksumManifest } from './assets.mjs';
import { changelogFromGit, draftReleaseArguments, releaseBody, releaseMetadata, releaseStateProblems } from './body.mjs';
import { checkBuildAgainstRecord, keyFingerprint, keyRecordRow, readKeyRecord, signManifest, SIGNING_KEY_VARIABLE, verifyReleaseSignature } from './signing.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '..', '..');
export const KEY_RECORD = join(HERE, 'key-record.json');
/** Where `pnpm package` writes the portable it assembled (apps/desktop/scripts/package.mjs, step 2′). */
export const PACKAGED_PORTABLE_DIR = join(REPO, 'apps', 'desktop', 'release', 'portable');

const USAGE = 'usage: pnpm release:pipeline preflight <tag> | portable <dir> <tag> | manifest <dir> <tag> | sign <dir> | verify <dir> <tag> | body <dir> <tag> <out> | draft-args <out> | release-state <out> <view> <draft|published> | keys [<version>]';

class Usage extends Error {}

/** The tag argument through REQ-STARTUP-027's grammar; a tag outside it is a refusal, not a usage error. */
function tagOf(text) {
  return parseReleaseTag(text);
}

function arity(args, n) {
  if (args.length !== n) throw new Usage(USAGE);
}

/** `body`'s metadata, re-derived from the tag it records: the channel is the grammar's, never the file's say-so. */
function metadataIn(out) {
  const recorded = JSON.parse(readFileSync(join(out, 'release.json'), 'utf8'));
  return releaseMetadata(String(recorded.tag));
}

/**
 * Runs one command. `env` is where the signing key is read from; `out`/`err` receive whole lines. Returns the exit code.
 * @param {string[]} argv
 * @param {{ env?: NodeJS.ProcessEnv, out?: (line: string) => void, err?: (line: string) => void, keyRecord?: string, repo?: string, keys?: readonly string[], portableDir?: string }} [options]
 */
export function runPipelineCommand(argv, options = {}) {
  const env = options.env ?? process.env;
  const out = options.out ?? ((line) => process.stdout.write(`${line}\n`));
  const err = options.err ?? ((line) => process.stderr.write(`${line}\n`));
  const keyRecordPath = options.keyRecord ?? KEY_RECORD;
  const repo = options.repo ?? REPO;
  const keyOptions = options.keys === undefined ? {} : { keys: options.keys };
  const refuse = (problems) => {
    for (const p of problems) err(`error: ${p}`);
    return 1;
  };
  const record = () => {
    const read = readKeyRecord(keyRecordPath);
    if ('problems' in read) throw Object.assign(new Error('key record'), { problems: read.problems });
    return read.record;
  };
  const [command, ...args] = argv;
  try {
    switch (command) {
      case 'preflight': {
        arity(args, 1);
        const { version } = tagOf(args[0]);
        const problems = checkBuildAgainstRecord(record(), version, options.keys);
        if (problems.length > 0) return refuse(problems);
        out(`preflight: ${version}'s build carries ${keyRecordRow(version, options.keys).keys.join(', ')}, as the key record says`);
        return 0;
      }
      case 'portable': {
        arity(args, 2);
        const { version } = tagOf(args[1]);
        const name = artifactName(version, 'portable');
        const target = join(args[0], name);
        const source = existsSync(target) ? target : join(options.portableDir ?? PACKAGED_PORTABLE_DIR, name);
        if (!existsSync(source)) {
          return refuse([`REQ-STARTUP-031: the windows-x64 portable of ${version} is not in ${args[0]} and \`pnpm package\` assembled none at ${source} (ADR-0054 P4, first-release-plan.md §4.5). A release publishes both Windows artifacts (PD-STARTUP-001), so this release stops here`]);
        }
        let read;
        try {
          read = readPortable(source);
        } catch (e) {
          return refuse([`REQ-STARTUP-031: ${source} is not an assembled portable: ${e instanceof Error ? e.message : String(e)}`]);
        }
        if (!read.token.startsWith(`${version}-`) || read.entry !== 'Rotaris.exe') {
          return refuse([`REQ-STARTUP-031: ${source} carries ${read.token} with entry point ${read.entry}; the release of ${version} needs ${version}'s payload starting Rotaris.exe (REQ-STARTUP-158)`]);
        }
        if (source !== target) copyFileSync(source, target);
        out(`portable: ${name}, ${read.bytes} B, token ${read.token}, ${read.files.length} files${source !== target ? ` (from ${source})` : ''}`);
        return 0;
      }
      case 'manifest': {
        arity(args, 2);
        const { version } = tagOf(args[1]);
        const written = writeChecksumManifest(args[0], version);
        if (!written.ok) return refuse(written.problems);
        for (const e of written.entries) out(`${CHECKSUM_MANIFEST_NAME}: ${e.sha256}  ${e.name}`);
        return 0;
      }
      case 'sign': {
        arity(args, 1);
        const pem = env[SIGNING_KEY_VARIABLE];
        if (pem === undefined || pem.trim() === '') {
          return refuse([
            `${SIGNING_KEY_VARIABLE} is not set: the release signing key (O-2, first-release-plan.md §6) is the release environment's secret, and no release is published without a signature (REQ-STARTUP-032, REQ-STARTUP-167)`,
          ]);
        }
        const manifest = readFileSync(join(args[0], CHECKSUM_MANIFEST_NAME));
        const signature = signManifest(manifest, pem);
        writeFileSync(join(args[0], CHECKSUM_SIGNATURE_NAME), signature);
        out(`${CHECKSUM_SIGNATURE_NAME}: signed by ${keyFingerprint(pem)}`);
        return 0;
      }
      case 'verify': {
        arity(args, 2);
        const { version } = tagOf(args[1]);
        const problems = verifyReleaseDirectory(args[0], version);
        if (problems.length === 0) {
          let signature;
          try {
            signature = readFileSync(join(args[0], CHECKSUM_SIGNATURE_NAME));
          } catch {
            return refuse([`REQ-STARTUP-032: ${CHECKSUM_SIGNATURE_NAME} is missing; a release publishing no signature is never installed (REQ-STARTUP-123)`]);
          }
          const manifest = readFileSync(join(args[0], CHECKSUM_MANIFEST_NAME));
          problems.push(...verifyReleaseSignature({ manifest, signature, version, record: record(), ...keyOptions }));
        }
        if (problems.length > 0) return refuse(problems);
        out(`verify: ${version} is complete, its manifest matches every asset, and its signature verifies against a key this build and every offerable build carry`);
        return 0;
      }
      case 'body': {
        arity(args, 3);
        const meta = releaseMetadata(args[1]);
        const entries = parseChecksumManifest(readFileSync(join(args[0], CHECKSUM_MANIFEST_NAME), 'utf8'));
        const { assets } = readReleaseDirectory(args[0], meta.version);
        const listed = new Set(entries.map((e) => e.name));
        const platformsWithAssets = [...new Set(assets.filter((a) => listed.has(a.name)).map((a) => a.platform))];
        const body = releaseBody({ tag: meta.tag, entries, platformsWithAssets, changelogText: changelogFromGit(repo, meta.tag) });
        mkdirSync(args[2], { recursive: true });
        writeFileSync(join(args[2], 'release-body.md'), body);
        writeFileSync(join(args[2], 'release.json'), `${JSON.stringify(meta, null, 2)}\n`);
        out(`body: "${meta.name}"${meta.prerelease ? ', prerelease' : ''}, ${entries.length} asset row${entries.length === 1 ? '' : 's'}`);
        return 0;
      }
      case 'draft-args': {
        arity(args, 1);
        for (const a of draftReleaseArguments(metadataIn(args[0]), join(args[0], 'release-body.md'))) out(a);
        return 0;
      }
      case 'release-state': {
        arity(args, 3);
        const stage = args[2];
        if (stage !== 'draft' && stage !== 'published') throw new Usage(USAGE);
        const meta = metadataIn(args[0]);
        const problems = releaseStateProblems(meta, JSON.parse(readFileSync(args[1], 'utf8')), stage);
        if (problems.length > 0) return refuse(problems);
        out(`release-state: "${meta.name}" is ${stage === 'draft' ? 'a draft' : 'published'}, prerelease=${meta.prerelease}, as its channel says`);
        return 0;
      }
      case 'keys': {
        if (args.length > 1) throw new Usage(USAGE);
        const version = args[0] ?? JSON.parse(readFileSync(join(repo, 'apps', 'desktop', 'package.json'), 'utf8')).version;
        out(JSON.stringify(keyRecordRow(version, options.keys)));
        return 0;
      }
      default:
        throw new Usage(USAGE);
    }
  } catch (e) {
    if (e instanceof Usage) {
      err(e.message);
      return 2;
    }
    if (e && typeof e === 'object' && 'problems' in e && Array.isArray(e.problems)) return refuse(e.problems);
    return refuse([e instanceof Error ? e.message : String(e)]);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runPipelineCommand(process.argv.slice(2));
}
