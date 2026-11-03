#!/usr/bin/env node
// @ts-check
// `pnpm sbom:write <tag> <dir>` — writes the release's CycloneDX SBOM to `<dir>/Rotaris-<version>-sbom.cdx.json`
// (R-091; `docs/architecture/hardening.md` §3.5 row 10). What the document holds and why pnpm writes it: `sbom.mjs`.
// The release workflow's build job runs it after `pnpm package`, over the installed tree; where the file goes is OQ-487.
//
// Exit codes are the pipeline's (REQ-STARTUP-149): 0 written; 1 a handled error, an `error: …` line saying why and no
// file written; 2 a usage error.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeReleaseSbom, sbomName } from './sbom.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEC_VERSION = '1.6';

const args = process.argv.slice(2);
if (args.length !== 2 || !/^v\d+\.\d+\.\d+(?:(?:a|b|rc)\d+)?$/.test(args[0] ?? '')) {
  process.stderr.write(`usage: pnpm sbom:write <tag> <dir>   (a tag of REQ-STARTUP-027's grammar, e.g. v0.1.0rc1; got ${args.join(' ') || 'nothing'})\n`);
  process.exit(2);
}
const [tag, outDir] = /** @type {[string, string]} */ (args);
const version = tag.slice(1);

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

const readJson = (/** @type {string} */ path) => JSON.parse(readFileSync(path, 'utf8'));
const declared = readJson(join(ROOT, 'apps', 'desktop', 'package.json')).version;
if (declared !== version) fail(`the tag ${tag} names ${version}, and apps/desktop declares ${declared} (REQ-STARTUP-028)`);
let electronVersion;
try {
  electronVersion = readJson(createRequire(join(ROOT, 'apps', 'desktop', 'package.json')).resolve('electron/package.json')).version;
} catch (e) {
  fail(`the installed Electron cannot be read (${e instanceof Error ? e.message : String(e)}); run pnpm install first`);
}

// pnpm on the PATH, the one the workflow's install step set up (pnpm 11, the root manifest's packageManager). On Windows
// it is a .cmd shim, which Node starts only through the command interpreter; every argument here is a constant.
const pnpmArgs = ['-r', 'sbom', '--sbom-format', 'cyclonedx', '--sbom-spec-version', SPEC_VERSION, '--prod', '--sbom-type', 'application'];
const [command, commandArgs] =
  process.platform === 'win32'
    ? [process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm', ...pnpmArgs]]
    : ['pnpm', pnpmArgs];
const run = spawnSync(command, commandArgs, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
if (run.error) fail(`pnpm sbom could not be started: ${run.error.message}`);
if (run.status !== 0) fail(`pnpm sbom exited ${run.status}: ${(run.stderr || run.stdout || '').trim().split('\n').slice(-3).join(' | ')}`);

let sbom;
try {
  sbom = composeReleaseSbom(JSON.parse(run.stdout), {
    version,
    electronVersion,
    license: readJson(join(ROOT, 'package.json')).license,
  });
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
const out = resolve(ROOT, outDir, sbomName(version));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(sbom, null, 2)}\n`);
process.stdout.write(`sbom: ${out} — CycloneDX ${sbom.specVersion}, ${sbom.components.length} components, Electron ${electronVersion} included\n`);
