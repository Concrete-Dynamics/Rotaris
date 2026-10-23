/**
 * The portable's assembly — ADR-0054 alternative P4, first-release-plan.md §4.5, REQ-STARTUP-013/031/165.
 *
 * `Rotaris-{v}-windows-x64-portable.exe` is NOT electron-builder's `portable` target (refused, ADR-0054 P1). It is the
 * project's launcher stub (`apps/desktop/launcher`, Rust, no dependency) with the `win-unpacked` payload appended:
 *
 *   artifact = stub ‖ chunks ‖ index ‖ footer          (the layout `launcher/src/payload.rs` reads)
 *
 * - every file is cut into chunks of at most `CHUNK_BYTES`, each one raw deflate stream (ADR-0054 consequence 13: the
 *   payload ships compressed — an uncompressed artifact reproduced a half-minute first launch), so the stub decodes them
 *   independently on every core;
 * - the index is plain text and lists every directory, file (mode, size, path) and chunk (offset, lengths);
 * - the footer is `RTRSPAY1` and three little-endian u64s: where the chunks start, where the index starts, its length.
 *
 * The identity token (clause (b)) is the declared version plus the first 16 hex digits of a SHA-256 over the payload —
 * every directory, every file's mode, size, path and bytes, and the entry point — computed here and written into the
 * stub's token slot (`ROTARIS-PORTABLE-TOKEN-SLOT-V1:` then a length byte), so the stub's fast path compares it without
 * opening the artifact (ADR-0054, "How a version is identified"). It covers the payload and not the stub's own bytes; the
 * stub's launcher-format field is what covers a layout change (ADR-0054: load-bearing).
 *
 * Plain ESM, loaded by `package.mjs`, the release pipeline's `portable` stage, `portable-proof.mjs` and the tests.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, writeSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { deflateRaw } from 'node:zlib';

const deflateRawAsync = promisify(deflateRaw);

export const FOOTER_MAGIC = Buffer.from('RTRSPAY1', 'latin1');
export const FOOTER_BYTES = 32;
export const INDEX_HEADER = 'rotaris-portable-index 1';
export const TOKEN_SLOT_MAGIC = Buffer.from('ROTARIS-PORTABLE-TOKEN-SLOT-V1:\0', 'latin1');
export const TOKEN_SLOT_BYTES = 128;
/** The largest chunk: big enough that the chunk table stays small, small enough that eight cores share a 200 MB file. */
export const CHUNK_BYTES = 8 << 20;
/** What the stub's marker is called inside every tree it places (`launcher/src/main.rs`, `MARKER`). */
export const MARKER = '.rotaris-preparation';

/** The launcher's Cargo project, and the binary a release build of it leaves. */
export const launcherDirectory = (appDir) => join(appDir, 'launcher');
export function launcherBinary(appDir, platform = process.platform) {
  return join(launcherDirectory(appDir), 'target', 'release', platform === 'win32' ? 'rotaris-portable-launcher.exe' : 'rotaris-portable-launcher');
}

/**
 * `cargo build --release` of the launcher for the host, which is the artifact's platform (`pnpm package` runs on the
 * Windows x64 runner). Answers the binary's path; a build that fails or leaves no binary throws.
 */
export function buildLauncher(appDir, { cargo = 'cargo', stdio = 'inherit' } = {}) {
  const r = spawnSync(cargo, ['build', '--release', '--locked', '--manifest-path', join(launcherDirectory(appDir), 'Cargo.toml')], { stdio, shell: process.platform === 'win32' });
  if (r.error) throw new Error(`the launcher stub could not be built: ${cargo} could not be started (${r.error.code ?? r.error.message}) — the portable needs a Rust toolchain on the build host (ADR-0054 consequence 5)`);
  if (r.status !== 0) throw new Error(`the launcher stub could not be built: cargo build exited ${r.status ?? r.signal}`);
  const binary = launcherBinary(appDir);
  lstatSync(binary);
  return binary;
}

/** The stub with `token` written into its one token slot. A stub with no slot, or with two, is refused. */
export function patchTokenSlot(stub, token) {
  if (!/^[0-9A-Za-z.+-]{1,95}$/.test(token)) throw new Error(`an identity token the stub cannot carry: ${JSON.stringify(token)}`);
  const at = stub.indexOf(TOKEN_SLOT_MAGIC);
  if (at < 0) throw new Error('the launcher stub has no token slot');
  if (stub.indexOf(TOKEN_SLOT_MAGIC, at + 1) >= 0) throw new Error('the launcher stub has more than one token slot');
  if (at + TOKEN_SLOT_BYTES > stub.length) throw new Error('the launcher stub\'s token slot is cut short');
  const out = Buffer.from(stub);
  out.fill(0, at + TOKEN_SLOT_MAGIC.length, at + TOKEN_SLOT_BYTES);
  out[at + TOKEN_SLOT_MAGIC.length] = token.length;
  out.write(token, at + TOKEN_SLOT_MAGIC.length + 1, 'latin1');
  return out;
}

/** The token a stub carries, or null when its slot is empty. */
export function slotToken(stub) {
  const at = stub.indexOf(TOKEN_SLOT_MAGIC);
  if (at < 0) return null;
  const len = stub[at + TOKEN_SLOT_MAGIC.length];
  return len === 0 ? null : stub.toString('latin1', at + TOKEN_SLOT_MAGIC.length + 1, at + TOKEN_SLOT_MAGIC.length + 1 + len);
}

/**
 * Every directory and regular file below `tree`, by `/`-separated relative path in code-unit order, so two walks of the
 * same tree list the same thing. A link or a special file is refused: the stub places files, and a payload that needed
 * a link would not survive the trip.
 */
export function walkPayload(tree) {
  const dirs = [];
  const files = [];
  const visit = (abs, rel) => {
    for (const name of readdirSync(abs).sort()) {
      if (/[\n\r\\]/.test(name)) throw new Error(`a payload name the index cannot carry: ${JSON.stringify(`${rel}${name}`)}`);
      const path = join(abs, name);
      const st = lstatSync(path);
      const r = `${rel}${name}`;
      if (st.isDirectory()) {
        dirs.push(r);
        visit(path, `${r}/`);
      } else if (st.isFile()) {
        files.push({ rel: r, abs: path, size: st.size, mode: st.mode & 0o777 });
      } else {
        throw new Error(`the payload holds ${r}, which is neither a file nor a directory`);
      }
    }
  };
  visit(tree, '');
  return { dirs, files };
}

function u64(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

/**
 * Assemble the portable: `stub` (a path), the payload `tree`, its `entry` point (relative, `/`-separated), the declared
 * `version` — written to `out` through a `.partial` sibling renamed into place. Answers what was written.
 */
export async function assemblePortable({ stub, tree, entry, version, out, chunkBytes = CHUNK_BYTES, level = 6 }) {
  const { dirs, files } = walkPayload(tree);
  if (!files.some((f) => f.rel === entry)) throw new Error(`the payload has no entry point ${entry}`);
  const stubBytes = readFileSync(stub);
  const placeholder = patchTokenSlot(stubBytes, '0');
  const partial = `${out}.partial`;
  rmSync(partial, { force: true });
  const fd = openSync(partial, 'w');
  const digest = createHash('sha256');
  const index = [];
  let written = 0;
  let chunkCount = 0;
  let payloadBytes = 0;
  try {
    writeSync(fd, placeholder);
    const dataAt = placeholder.length;
    written = dataAt;
    for (const d of dirs) digest.update(`dir ${d}\n`);
    digest.update(`entry ${entry}\n`);
    // Chunks are compressed on the thread pool, several at a time, and written in order.
    const width = Math.max(2, availableParallelism());
    const pending = [];
    const flush = async () => {
      const { compressing, line } = pending.shift();
      const z = await compressing;
      line.offset = written - dataAt;
      line.compressed = z.length;
      writeSync(fd, z, 0, z.length, written);
      written += z.length;
    };
    for (const f of files) {
      digest.update(`file ${f.mode.toString(8)} ${f.size} ${f.rel}\n`);
      const fileLine = { kind: 'file', file: f, chunks: [] };
      index.push(fileLine);
      payloadBytes += f.size;
      const input = openSync(f.abs, 'r');
      try {
        if (fstatSync(input).size !== f.size) throw new Error(`${f.rel} changed size while the portable was assembled`);
        for (let at = 0; at < f.size; at += chunkBytes) {
          const n = Math.min(chunkBytes, f.size - at);
          const buf = Buffer.allocUnsafe(n);
          let got = 0;
          while (got < n) {
            const r = readSync(input, buf, got, n - got, at + got);
            if (r === 0) throw new Error(`${f.rel} ended early while the portable was assembled`);
            got += r;
          }
          digest.update(buf);
          const line = { decoded: n, offset: 0, compressed: 0 };
          fileLine.chunks.push(line);
          pending.push({ compressing: deflateRawAsync(buf, { level }), line });
          chunkCount += 1;
          if (pending.length >= width) await flush();
        }
      } finally {
        closeSync(input);
      }
    }
    while (pending.length) await flush();
    const token = `${version}-${digest.digest('hex').slice(0, 16)}`;
    const lines = [INDEX_HEADER, `token ${token}`, `entry ${entry}`, ...dirs.map((d) => `dir ${d}`)];
    for (const { file, chunks } of index) {
      lines.push(`file ${file.mode.toString(8)} ${file.size} ${file.rel}`);
      for (const c of chunks) lines.push(`chunk ${c.offset} ${c.compressed} ${c.decoded}`);
    }
    const indexBytes = Buffer.from(`${lines.join('\n')}\n`, 'utf8');
    const indexAt = written;
    writeSync(fd, indexBytes, 0, indexBytes.length, written);
    written += indexBytes.length;
    const footer = Buffer.concat([FOOTER_MAGIC, u64(dataAt), u64(indexAt), u64(indexBytes.length)]);
    writeSync(fd, footer, 0, footer.length, written);
    written += footer.length;
    const slot = patchTokenSlot(stubBytes, token);
    const slotAt = slot.indexOf(TOKEN_SLOT_MAGIC);
    writeSync(fd, slot, slotAt, TOKEN_SLOT_BYTES, slotAt);
    closeSync(fd);
    renameSync(partial, out);
    return { path: out, token, bytes: written, stubBytes: stubBytes.length, payloadBytes, files: files.length, dirs: dirs.length, chunks: chunkCount };
  } catch (e) {
    try { closeSync(fd); } catch { /* closed already */ }
    rmSync(partial, { force: true });
    throw e;
  }
}

/** Parse an index's text into `{ token, entry, dirs, files: [{ path, mode, size, chunks }] }`, refusing what the stub would. */
export function parseIndex(text) {
  const lines = text.split('\n');
  if (lines[0] !== INDEX_HEADER) throw new Error('an index of an unknown format');
  const index = { token: '', entry: '', dirs: [], files: [] };
  for (const line of lines.slice(1)) {
    if (line === '') continue;
    const space = line.indexOf(' ');
    const kind = space < 0 ? line : line.slice(0, space);
    const rest = space < 0 ? '' : line.slice(space + 1);
    if (kind === 'token') index.token = rest;
    else if (kind === 'entry') index.entry = rest;
    else if (kind === 'dir') index.dirs.push(rest);
    else if (kind === 'file') {
      const m = /^([0-7]+) (\d+) (.+)$/.exec(rest);
      if (!m) throw new Error(`a file line the stub would refuse: ${line}`);
      index.files.push({ mode: parseInt(m[1], 8), size: Number(m[2]), path: m[3], chunks: [] });
    } else if (kind === 'chunk') {
      const [offset, compressed, decoded] = rest.split(' ').map(Number);
      const f = index.files.at(-1);
      if (!f) throw new Error('a chunk before any file');
      f.chunks.push({ offset, compressed, decoded });
    } else throw new Error(`an index line of an unknown kind: ${line}`);
  }
  return index;
}

/**
 * Read an assembled portable back: its footer, index and the token its stub carries — the checks the release pipeline
 * and `pnpm package` hold an artifact to before it is published or launched. Throws on any inconsistency.
 */
export function readPortable(path) {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    if (size < FOOTER_BYTES) throw new Error(`${path} carries no portable footer`);
    const footer = Buffer.alloc(FOOTER_BYTES);
    readSync(fd, footer, 0, FOOTER_BYTES, size - FOOTER_BYTES);
    if (!footer.subarray(0, 8).equals(FOOTER_MAGIC)) throw new Error(`${path} carries no portable footer`);
    const dataAt = Number(footer.readBigUInt64LE(8));
    const indexAt = Number(footer.readBigUInt64LE(16));
    const indexBytes = Number(footer.readBigUInt64LE(24));
    if (indexAt + indexBytes !== size - FOOTER_BYTES || dataAt > indexAt) throw new Error(`${path}'s footer does not describe the file`);
    const text = Buffer.alloc(indexBytes);
    readSync(fd, text, 0, indexBytes, indexAt);
    const index = parseIndex(text.toString('utf8'));
    const stub = Buffer.alloc(dataAt);
    readSync(fd, stub, 0, dataAt, 0);
    const carried = slotToken(stub);
    if (carried !== index.token) throw new Error(`${path}'s stub carries the token ${carried ?? '(none)'}, its index ${index.token}`);
    for (const f of index.files) {
      if (f.chunks.reduce((n, c) => n + c.decoded, 0) !== f.size) throw new Error(`${path}: the chunks of ${f.path} do not add up to its size`);
      for (const c of f.chunks) if (dataAt + c.offset + c.compressed > indexAt) throw new Error(`${path}: a chunk of ${f.path} lies outside the payload`);
    }
    return { ...index, bytes: size, stubBytes: dataAt, indexAt, indexBytes };
  } finally {
    closeSync(fd);
  }
}
