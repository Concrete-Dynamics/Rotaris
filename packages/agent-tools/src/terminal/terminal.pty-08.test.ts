import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSnapshot, snapshotCommand } from './foreground.js';
import { shell, PS, SH, root, bashAsSh, ctx, diag, output, args, posixSession, backendSession, disposeTerminalFixture, wideEchoCase } from './terminal.test-support.js';

/**
 * Part 8 of 14 of the real-PTY cases of `terminal.test.ts`, which were one describe in that file. They are spread over
 * files so that the real-process project can run them side by side on a host with cores to spare (`vitest.config.ts`,
 * `REAL_PROCESS_WORKERS`); each file has a manager, a shell session and a scratch root of its own, from
 * `terminal.test-support.ts`. A new case goes into the part its neighbours are in, or into the shortest one.
 */
afterAll(disposeTerminalFixture);

describe.skipIf(!shell)('terminal — a real shell through a real PTY (ADR-0020, REQ-TOOLS-097..104, 179, 187)', () => {
  it.skipIf(PS)('REQ-TOOLS-127 (A10): the echo of a next call wider than the screen reaches neither road\'s poll of the paused call', async () => {
    const { m, t } = await posixSession(shell!.file);
    try { await wideEchoCase(t); } finally { await m.dispose(); }
  }, 90_000);
  it.runIf(bashAsSh !== null)('REQ-TOOLS-127 (A10): under bash as `/bin/sh`, the echo of a next call wider than the screen reaches neither road\'s poll of the paused call, and the shell\'s line editor is off', async () => {
    const { m, t } = await posixSession(bashAsSh!);
    try {
      const options = output((await t.execute(args({ command: 'set -o', timeout: 15 }), ctx())).text);
      expect(options).toMatch(/^emacs\s+off$/m);
      expect(options).toMatch(/^vi\s+off$/m);
      await wideEchoCase(t);
    } finally { await m.dispose(); }
  }, 90_000);

  // fin15's verification, 2026-10-04: the display narrows the PTY (REQ-TOOLS-128, down to REQ-SHELL-100's 20 columns),
  // and below 34 columns every frame wraps. Under dash at 20 columns each call's capture carried its own frames broken
  // across rows, and a paused call's poll carried its own end frame or the next call's start frame.
  it.skipIf(PS)('REQ-TOOLS-097/127/128: at the display\'s 20-column floor a call\'s capture and a paused call\'s poll carry no frame and no echo', async () => {
    const { m, t } = await posixSession(shell!.file, { cols: 20 });
    try {
      const own = await t.execute(args({ command: `${SH.echo('ready')}; ${SH.echo('ready2')}`, timeout: 15 }), ctx());
      expect(diag(own.text)['exit_code']).toBe(0);
      expect(output(own.text)).toBe('ready\nready2');
      await wideEchoCase(t);
    } finally { await m.dispose(); }
  }, 90_000);
  // docs/archive/defects/the-shell-state-snapshot-is-corrupted-on-a-screen-narrower-than-its-rows.md, through a real PTY: below
  // 76 columns the snapshot's rows wrap, and the reset restored a spliced environment and named it restored.
  it.skipIf(PS)('PD-TOOLS-001, REQ-TOOLS-128: at 20 and 40 columns a hard-timeout reset restores the directory and every exported variable whole', async () => {
    const dir = join(root, 'narrow-cwd');
    mkdirSync(dir, { recursive: true });
    for (const cols of [20, 40]) {
      const { m, t } = await posixSession(shell!.file, { cols });
      try {
        const value = `hello-there-${'v'.repeat(90)}-${cols}`;
        expect(diag((await t.execute(args({ command: `cd '${dir}' && ${SH.setVar('ROTARIS_NARROW', value)}`, timeout: 15 }), ctx())).text)['exit_code']).toBe(0);
        const r = await t.execute(args({ command: `${SH.sleep(20)}; ${SH.echo('late')}`, timeout: 1 }), ctx());
        expect(diag(r.text)).toMatchObject({ exit_code: 124, kill_status: 'session_reset' });
        expect(r.text).toContain('were restored');
        const after = await t.execute(args({ command: `${SH.bracketVar('ROTARIS_NARROW')}; pwd; printf '%s\\n' "$PATH" "$HOME"; command -v sleep`, timeout: 15 }), ctx());
        expect(diag(after.text)['exit_code']).toBe(0);
        // The capture is read off a 20-column screen too, so its rows are rejoined before they are compared.
        const lines = (output(after.text) ?? '').split('\n');
        const joined = lines.join('');
        expect(joined).toContain(`[${value}]`);
        expect(joined).toContain(`${dir}`);
        expect(joined).toContain(process.env['PATH'] ?? '');
        expect(joined).toContain(process.env['HOME'] ?? '');
        expect(joined).toMatch(/\/sleep$/);
      } finally { await m.dispose(); }
    }
  }, 90_000);
  // PD-TOOLS-001's PowerShell capture and restore over a real PTY, first run on a Windows host 2026-10-15 (Windows 11 ARM64,
  // the session's B2): the POSIX case above at the widths the display may give, a directory and a `Path` wider than the
  // screen, a value of 600 characters, a non-ASCII one, one PowerShell would read as code, and a spawn variable the
  // command removed. The environment and the directory are dumped from inside the shell before the hard cap and after
  // the reset, and compared here.
  it.runIf(PS)('PD-TOOLS-001, REQ-TOOLS-099/128: at every width from 20 to 240 columns a hard-timeout reset restores PowerShell\'s directory and environment byte for byte', async () => {
    let dir = join(root, 'ps-wide-cwd');
    while (dir.length < 170) dir = join(dir, 'segment-of-a-long-directory');
    mkdirSync(dir, { recursive: true });
    const dumps = join(root, 'ps-dumps');
    mkdirSync(dumps, { recursive: true });
    const dumpOf = (tag: string) =>
      `Get-ChildItem Env: | Sort-Object Name | ForEach-Object { $_.Name + '=' + $_.Value } | Set-Content -LiteralPath '${join(dumps, `${tag}.env`)}' -Encoding utf8; `
      + `Set-Content -LiteralPath '${join(dumps, `${tag}.cwd`)}' -Value (Get-Location).Path -Encoding utf8`;
    const read = (tag: string): { env: Map<string, string>; cwd: string } => {
      const text = (f: string) => readFileSync(join(dumps, f), 'utf8').replace(/^\uFEFF/, '');
      const env = new Map<string, string>();
      for (const line of text(`${tag}.env`).split(/\r?\n/)) { const eq = line.indexOf('='); if (eq > 0) env.set(line.slice(0, eq), line.slice(eq + 1)); }
      return { env, cwd: text(`${tag}.cwd`).replace(/\r?\n$/, '') };
    };
    const dummies = Array.from({ length: 24 }, (_, i) => `C:\\Program Files\\Tool${i + 1}\\bin`).join(';');
    const nonAscii = 'héllo-ü-日本-€';
    const asCode = "O'Brien $(whoami) `tick";
    // 20 and 33 too since 2026-10-15: below 34 columns every PowerShell call ran to its hard cap until ConPTY's wrapped rows
    // were rejoined for the frame match (docs/archive/defects/below-34-columns-every-powershell-call-runs-to-its-hard-timeout.md).
    for (const cols of [20, 33, 34, 40, 64, 75, 76, 77, 120, 240]) {
      const { m, t } = await backendSession(shell!, { cols, env: { ROTARIS_SPAWN_ONLY: 'present' } });
      try {
        const setup = await t.execute(args({ command: `Set-Location -LiteralPath '${dir}'; $env:Path = '${dummies};' + $env:Path; `
          + `$env:ROTARIS_NONASCII = '${nonAscii}'; $env:ROTARIS_LONG = 'v' * 600; $env:ROTARIS_ASCODE = '${asCode.replace(/'/g, "''")}'; `
          + `Remove-Item Env:ROTARIS_SPAWN_ONLY; ${dumpOf(`before-${cols}`)}`, timeout: 15 }), ctx());
        expect(diag(setup.text)['exit_code'], `setup at ${cols}`).toBe(0);
        // The capture is the product's own command read off this width's screen, and it parses whole.
        const captured = await t.execute(args({ command: snapshotCommand(shell!), timeout: 15 }), ctx());
        expect(parseSnapshot(output(captured.text) ?? '', 'powershell'), `parse at ${cols}`).not.toBeNull();
        const r = await t.execute(args({ command: "Start-Sleep -Seconds 20; Write-Output 'late'", timeout: 1 }), ctx());
        expect(diag(r.text), `reset at ${cols}`).toMatchObject({ exit_code: 124, failure_kind: 'timeout', kill_status: 'session_reset' });
        expect(r.text, `reset at ${cols}`).toContain('were restored');
        const after = await t.execute(args({ command: `${dumpOf(`after-${cols}`)}; (Get-Command cmd.exe).Source; cmd /c ver`, timeout: 15 }), ctx());
        expect(diag(after.text), `after at ${cols}`).toMatchObject({ exit_code: 0, session_reinitialized: true });
        const before = read(`before-${cols}`);
        const restored = read(`after-${cols}`);
        expect(restored.cwd, `cwd at ${cols}`).toBe(dir);
        // A Windows variable's name is matched without case: the spawn environment spells `Path` or `PATH` by whoever made it.
        const pathName = [...before.env.keys()].find((k) => k.toLowerCase() === 'path')!;
        expect(before.env.get(pathName)!.startsWith(dummies), `Path at ${cols}`).toBe(true);
        for (const name of [pathName, 'ROTARIS_NONASCII', 'ROTARIS_LONG', 'ROTARIS_ASCODE']) {
          const value = restored.env.get(name);
          expect(value, `${name} at ${cols}`).toBe(before.env.get(name));
          expect(value ?? '', `${name} at ${cols}`).not.toMatch(/[\r\n]/);
        }
        expect(restored.env.get('ROTARIS_NONASCII')).toBe(nonAscii);
        expect(restored.env.get('ROTARIS_ASCODE')).toBe(asCode);
        expect(restored.env.get('ROTARIS_LONG')).toBe('v'.repeat(600));
        expect(restored.env.has('ROTARIS_SPAWN_ONLY'), `spawn-only at ${cols}`).toBe(false);
        // Every other variable survives the reset as it stood.
        // One exclusion, under Windows PowerShell 5.1 only: the product's own empty `PSModuleAnalysisCachePath` (the spawn
        // environment's) reads present before the reset and absent after
        // (docs/defects/windows-powershell-5-1-loses-the-spawn-environments-empty-psmoduleanalysiscachepath-across-a-reset.md).
        const excluded = /pwsh\.exe$/i.test(shell!.file) ? [] : ['PSModuleAnalysisCachePath'];
        const lost = [...before.env.keys()].filter((k) => !excluded.includes(k) && restored.env.get(k) !== before.env.get(k));
        const gained = [...restored.env.keys()].filter((k) => !before.env.has(k));
        expect({ lost, gained }, `variables at ${cols}`).toEqual({ lost: [], gained: [] });
      } finally { await m.dispose(); }
    }
  }, 240_000);
});
