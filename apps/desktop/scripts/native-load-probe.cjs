'use strict';
/**
 * ADR-0056 rule 4 — the load, not a version comparison. Run by build-hooks.cjs as
 *   ELECTRON_RUN_AS_NODE=1 <appOutDir>/Rotaris.exe native-load-probe.cjs <appOutDir>
 * so the process IS the packaged Electron binary, and every binding is required THROUGH the packaged
 * app.asar (the path the product's own requires resolve), never from node_modules in the checkout.
 * `process.dlopen` is wrapped so the report names the file the loader actually opened.
 * Prints exactly one line starting "PROBE " with the JSON report; exit 0 only when every binding loaded
 * and did its work.
 */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const appOut = process.argv[2];
const opened = [];
const dlopen = process.dlopen;
process.dlopen = function wrappedDlopen(module, filename, ...rest) {
  opened.push(filename);
  return dlopen.call(process, module, filename, ...rest);
};

const out = {
  ok: false,
  runAsNode: process.env['ELECTRON_RUN_AS_NODE'] ?? null,
  execPath: process.execPath,
  versions: { electron: process.versions.electron ?? null, node: process.versions.node, modules: process.versions.modules, napi: process.versions.napi },
  dlopen: opened,
  errors: [],
};
const nm = path.join(appOut, 'resources', 'app.asar', 'node_modules');

async function probeStore() {
  const Database = require(path.join(nm, 'better-sqlite3'));
  const mem = new Database(':memory:');
  out.sqlite = mem.prepare('select sqlite_version() as v').get().v;
  mem.close();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rotaris-load-probe-'));
  try {
    const db = new Database(path.join(tmp, 'probe.db'));
    out.journal = db.pragma('journal_mode = WAL', { simple: true });
    db.pragma('synchronous = NORMAL');
    db.exec('CREATE TABLE t(x INTEGER)');
    db.prepare('INSERT INTO t VALUES (?)').run(1);
    out.rows = db.prepare('SELECT count(*) AS c FROM t').get().c;
    db.close();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function probePty() {
  const pty = require(path.join(nm, 'node-pty'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the pseudo-terminal did not exit within 15 s')), 15_000);
    let data = '';
    const p = pty.spawn(process.env['ComSpec'] || 'cmd.exe', ['/c', 'echo probe-ok'], { cols: 80, rows: 24, cwd: os.tmpdir(), env: process.env });
    p.onData((d) => { data += d; });
    p.onExit(({ exitCode }) => { clearTimeout(timer); resolve({ exitCode, sawEcho: /probe-ok/.test(data), pid: p.pid }); });
  });
}

(async () => {
  try { await probeStore(); } catch (e) { out.errors.push(`better-sqlite3: ${e && e.stack ? e.stack : e}`); }
  try { out.pty = await probePty(); if (out.pty.exitCode !== 0 || !out.pty.sawEcho) out.errors.push(`node-pty: exit ${out.pty.exitCode}, echo seen ${out.pty.sawEcho}`); } catch (e) { out.errors.push(`node-pty: ${e && e.stack ? e.stack : e}`); }
  out.ok = out.errors.length === 0;
  process.stdout.write(`PROBE ${JSON.stringify(out)}\n`);
  process.exit(out.ok ? 0 : 1);
})();
