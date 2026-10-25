#!/usr/bin/env node
/**
 * T3 / REQ-STARTUP-122/123/167: published v0.1.0rc1 bytes through the updater's actual verifier.
 * Run: node tools/release-pipeline/update-path-proof.mjs [--release-dir=PATH]
 * No build, Electron, credentials, signing operation or installer execution. Network reads public assets only.
 * Evidence: .proof/update-path/report.json and original/tampered manifests with the original detached signature.
 * A one-byte digest mutation must fail before any artifact is downloaded; the original must verify and every
 * published Windows artifact must stream to the digest it lists. Each request has a five-minute deadline.
 */
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDetachedSignature } from '../../apps/desktop/src/main/updater/keys.ts';
import { parseChecksumManifest, formatChecksumManifest } from '../release-naming/src/index.ts';
import { expectedAssets } from './assets.mjs';
import { carriedKeyFingerprints } from './signing.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && !/^--release-dir=.+/.test(args[0]))) {
  throw new Error('usage: node tools/release-pipeline/update-path-proof.mjs [--release-dir=PATH]');
}
const releaseDir = args.length === 1 ? resolve(args[0].slice('--release-dir='.length)) : null;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = join(root, '.proof/update-path');
mkdirSync(output, { recursive: true });
const base = 'https://github.com/Concrete-Dynamics/Rotaris/releases/download/v0.1.0rc1/';
const report = { tag: 'v0.1.0rc1', source: releaseDir ?? base, publishedSource: base, at: new Date().toISOString(), node: process.version,
  platform: process.platform, keys: carriedKeyFingerprints(), checks: [] };
const check = (name, pass, detail) => {
  report.checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${JSON.stringify(detail)}`);
  if (!pass) throw new Error(name);
};
const get = async (name) => {
  if (releaseDir !== null) return createReadStream(join(releaseDir, name));
  const response = await fetch(`${base}${name}`, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.body;
};
const small = async (name, limit) => {
  const stream = await get(name);
  const parts = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > limit) throw new Error(`${name}: exceeds ${limit} bytes`);
    parts.push(chunk);
  }
  return Buffer.concat(parts);
};
try {
  const manifest = await small('SHA256SUMS.txt', 1024 * 1024);
  const signature = await small('SHA256SUMS.txt.sig', 64);
  writeFileSync(join(output, 'SHA256SUMS.txt'), manifest);
  writeFileSync(join(output, 'SHA256SUMS.txt.sig'), signature);
  // Preserve the format: change exactly one hexadecimal digest character. Never re-sign it.
  const altered = Buffer.from(manifest);
  altered[0] = altered[0] === 48 ? 49 : 48;
  writeFileSync(join(output, 'SHA256SUMS.tampered.txt'), altered);
  const negative = verifyDetachedSignature(altered, signature);
  check('tampered manifest rejected by the updater verifier', !negative.verified && negative.reason === 'not-verified', negative);
  const positive = verifyDetachedSignature(manifest, signature);
  check('published manifest accepted with the compiled-in keys', positive.verified, positive);
  // Parsing is deliberately after the signature verdict, just as in runInstall.
  const entries = parseChecksumManifest(manifest.toString('utf8'));
  check('canonical manifest and exact published asset set', formatChecksumManifest(entries) === manifest.toString('utf8')
    && JSON.stringify(entries.map((e) => e.name).sort()) === JSON.stringify(expectedAssets('0.1.0rc1').map((a) => a.name).sort()), entries);
  for (const entry of entries) {
    const hash = createHash('sha256');
    let bytes = 0;
    const stream = await get(entry.name);
    for await (const chunk of stream) { hash.update(chunk); bytes += chunk.length; }
    const actual = hash.digest('hex');
    check(`published asset digest: ${entry.name}`, actual === entry.sha256, { bytes, expected: entry.sha256, actual });
  }
} catch (cause) {
  report.error = cause instanceof Error ? cause.message : String(cause);
  process.exitCode = 1;
  console.error(`FAIL  ${report.error}`);
} finally {
  report.passed = report.error === undefined && report.checks.length === 5 && report.checks.every((c) => c.pass);
  if (!report.passed) process.exitCode = 1;
  writeFileSync(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Evidence: ${output}`);
}
