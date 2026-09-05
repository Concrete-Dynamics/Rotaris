'use strict';
/**
 * A file-descriptor gate for the packaging step (ADR-0056; found by Part S's console spike, 2026-09-05).
 *
 * electron-builder's node-module collector runs `pnpm list --prod --json --depth Infinity` in `apps/desktop`, and pnpm
 * 11.9 opens every `package.json` of the tree at once — the walk is not limited by `--prod` and the tree has grown past
 * what Windows lets one process hold open, so the command dies with `EMFILE: too many open files` (reproducibly, on an
 * idle host, in the main checkout) and the build is refused before it starts. pnpm exposes no concurrency setting for
 * the walk and electron-builder no switch past the collector (its traversal collector is only a fallback for an EMPTY
 * result, and the error JSON is parsed as a failure instead).
 *
 * This preload bounds the opens in flight. It is loaded through `NODE_OPTIONS=--require` for the electron-builder step of
 * `package.mjs` ONLY — every node process of that step inherits it (electron-builder, corepack's `pnpm.js`, the rebuild),
 * and the packaged application's own launch never sees it. It changes ordering, never results: a gated call waits for a
 * slot and then runs exactly as it would have.
 */
const fs = require('node:fs');

const LIMIT = Number(process.env['ROTARIS_FD_GATE'] ?? 200);
let inFlight = 0;
const waiting = [];

function acquire() {
  if (inFlight < LIMIT) { inFlight += 1; return Promise.resolve(); }
  return new Promise((resolve) => waiting.push(resolve)).then(() => { inFlight += 1; });
}
function release() {
  inFlight -= 1;
  const next = waiting.shift();
  if (next) next();
}

// The wrapper keeps the original's own properties (`fs.realpath.native`, `fs.readFile[promisify.custom]` …): fs-extra and
// graceful-fs read them, and a bare wrapper made electron-builder fail with "realpath.native is not a function".
function keepProperties(wrapper, original) {
  for (const key of Reflect.ownKeys(original)) {
    if (key === 'length' || key === 'name' || key === 'prototype') continue;
    Object.defineProperty(wrapper, key, Object.getOwnPropertyDescriptor(original, key));
  }
  return wrapper;
}
function gatePromise(target, name) {
  const original = target[name];
  if (typeof original !== 'function') return;
  target[name] = keepProperties(async function gated(...args) {
    await acquire();
    try { return await original.apply(this, args); } finally { release(); }
  }, original);
}
function gateCallback(target, name) {
  const original = target[name];
  if (typeof original !== 'function') return;
  target[name] = keepProperties(function gated(...args) {
    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    void acquire().then(() => {
      original.call(this, ...args, (...result) => { release(); if (cb) cb(...result); });
    });
  }, original);
}

// Only the two calls that hold a descriptor open are gated. `fs/promises` and `fs.promises` are one object.
for (const name of ['open', 'readFile']) gatePromise(fs.promises, name);
for (const name of ['open', 'readFile']) gateCallback(fs, name);
