/**
 * The live-run endpoint registry and its key store, shared by `live-run.mjs` and `slice-proof.mjs`.
 *
 * The owner registers an OpenAI-compatible endpoint once (`pnpm live-run --add-endpoint`): a name, the label the
 * product shows, the base URL, the model id, optional prices and context window, and the key behind a hidden prompt.
 * The registry is `~/.rotaris/live-run/endpoints.json`; the keys live beside it, one file per endpoint, never in this
 * repository and never on a command line: `<name>.key.dpapi` (Windows DPAPI, this account on this machine) or
 * `<name>.key` (mode 600, or an owner-only ACL where DPAPI is not available). `ROTARIS_LIVE_API_KEY` in the
 * environment wins over the stored file, for a one-off or a machine where the prompt cannot run.
 *
 * These lines lived inline in `live-run.mjs` until 2026-10-02, when `slice-proof` was retargeted from OpenRouter
 * constants to the registry's default endpoint (R-068); they moved here so both scripts read one registry one way.
 * Every function takes the registry's directory, so the tests read a fixture registry and never the owner's.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The environment variable that, when set, supplies the key in place of the stored file. */
export const KEY_ENV = 'ROTARIS_LIVE_API_KEY';
/** The registry's directory: `~/.rotaris/live-run`. */
export const registryHome = (home = homedir()) => join(home, '.rotaris', 'live-run');
/** REQ-PROVIDER-051, repeated here so a script can name the credential file before the app writes it. */
export const instanceIdFor = (label) => `openai-compatible--${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;

/**
 * The shell the key store talks to, probed once: PowerShell 7 first, because Windows PowerShell 5.1 cannot always
 * load `Microsoft.PowerShell.Security` — where the DPAPI cmdlets live — and a host that cannot load it cannot
 * encrypt. The probe is the cmdlet itself, not the version banner; when neither host answers, `storeKey` falls back.
 */
let powershellProbed;
export function powershell() {
  if (powershellProbed !== undefined) return powershellProbed;
  const candidates = process.platform === 'win32' ? ['pwsh.exe', join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')] : ['pwsh'];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-NoProfile', '-NonInteractive', '-Command', 'ConvertTo-SecureString -String 1 -AsPlainText -Force | Out-Null'], { encoding: 'utf8', windowsHide: true });
    if (probe.status === 0) { powershellProbed = candidate; return powershellProbed; }
  }
  powershellProbed = candidates[candidates.length - 1];
  return powershellProbed;
}

/** The file's own protection: inheritance off and this account alone on Windows, mode 600 elsewhere. */
function lockDown(file) {
  if (process.platform !== 'win32') { chmodSync(file, 0o600); return; }
  const icacls = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'icacls.exe');
  spawnSync(icacls, [file, '/inheritance:r', '/grant:r', `${process.env['USERNAME'] ?? ''}:F`], { encoding: 'utf8', windowsHide: true });
}

/** The registry and the key store under one directory (default `~/.rotaris/live-run`). */
export function endpointStore(dir = registryHome()) {
  const file = join(dir, 'endpoints.json');
  const dpapiFileFor = (name) => join(dir, `${name}.key.dpapi`);
  const plainFileFor = (name) => join(dir, `${name}.key`);
  /** Whichever form this account's key is in: the DPAPI ciphertext when there is one, the protected file otherwise. */
  const keyFileFor = (name) => (existsSync(dpapiFileFor(name)) ? dpapiFileFor(name) : plainFileFor(name));
  const hasKey = (name) => existsSync(dpapiFileFor(name)) || existsSync(plainFileFor(name));
  function registry() {
    if (!existsSync(file)) return { default: null, endpoints: {} };
    const read = JSON.parse(readFileSync(file, 'utf8'));
    return { default: read.default ?? null, endpoints: read.endpoints ?? {} };
  }
  function writeRegistry(next) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  }
  /**
   * Storage, best available first: DPAPI through PowerShell's SecureString — ciphertext this account on this
   * machine can read and nothing else — and, where that shell cannot load `Microsoft.PowerShell.Security` (a
   * constrained host, a policy), the key in a file whose ACL names this account alone. Which one was used is
   * returned and printed; it is never quietly the weaker of the two.
   */
  function storeKey(name, secret) {
    mkdirSync(dir, { recursive: true });
    if (process.platform === 'win32') {
      const target = dpapiFileFor(name);
      const script = `$k = ConvertTo-SecureString -String $env:ROTARIS_LIVE_RUN_SECRET -AsPlainText -Force; ConvertFrom-SecureString -SecureString $k | Set-Content -NoNewline -Encoding ascii -Path ${JSON.stringify(target)}`;
      const written = spawnSync(powershell(), ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, env: { ...process.env, ROTARIS_LIVE_RUN_SECRET: secret } });
      if (written.status === 0 && existsSync(target)) { lockDown(target); rmSync(plainFileFor(name), { force: true }); return { file: target, protection: 'DPAPI, this account on this machine' }; }
      rmSync(target, { force: true });
      const plain = plainFileFor(name);
      writeFileSync(plain, secret);
      lockDown(plain);
      return { file: plain, protection: `an owner-only ACL — DPAPI was not available (${(written.stderr ?? '').split('\n')[0]?.trim() || `powershell exited ${written.status}`})` };
    }
    const plain = plainFileFor(name);
    writeFileSync(plain, secret, { mode: 0o600 });
    lockDown(plain);
    return { file: plain, protection: 'mode 600' };
  }
  function storedKey(name) {
    const keyFile = keyFileFor(name);
    if (!existsSync(keyFile)) return null;
    if (!keyFile.endsWith('.dpapi')) return readFileSync(keyFile, 'utf8').trim();
    const read = spawnSync(powershell(), ['-NoProfile', '-NonInteractive', '-Command', `$s = Get-Content -Raw -Path ${JSON.stringify(keyFile)} | ConvertTo-SecureString; [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))`], { encoding: 'utf8', windowsHide: true });
    if (read.status !== 0) throw new Error(`${keyFile} could not be decrypted — DPAPI binds it to one account on one machine. Store it again with \`pnpm live-run --set-key --endpoint=${name}\`.\n${read.stderr?.trim() ?? ''}`);
    return read.stdout.trim();
  }
  return { dir, file, dpapiFileFor, plainFileFor, keyFileFor, hasKey, registry, writeRegistry, storeKey, storedKey };
}

/**
 * One registered endpoint: the one named, else the registry's default. Null when nothing is named and the registry
 * has no default; a name the registry does not hold is an error that says how to list what it does hold.
 */
export function selectEndpoint(reg, name = null) {
  const chosen = name ?? reg.default;
  if (chosen === null || chosen === undefined) return null;
  const found = reg.endpoints[chosen];
  if (!found) throw new Error(`no endpoint named "${chosen}"; \`pnpm live-run --endpoints\` lists them`);
  return { name: chosen, ...found, baseUrl: String(found.baseUrl).replace(/\/+$/, '') };
}

/** The key for one endpoint, the way `live-run` supplies it: the environment's first, the stored file's otherwise. */
export function endpointKey(store, name, env = process.env) {
  const fromEnv = (env[KEY_ENV] ?? '').trim();
  if (fromEnv !== '') return { key: fromEnv, source: `the environment (${KEY_ENV})` };
  if (store.hasKey(name)) return { key: store.storedKey(name), source: store.keyFileFor(name) };
  return { key: null, source: null };
}

/**
 * The endpoint a proof signs into through the product (`slice-proof`, R-068): `--endpoint=<name>` from `argv`, else the
 * registry's default, with the provider id the product will mint for its label (REQ-PROVIDER-051) and its key.
 * `pasteKey` (`--paste-key`) leaves the key to the owner, who pastes it into the dialog, so no key need be stored;
 * otherwise an endpoint without a key is refused here, naming where the key was looked for and the two ways on.
 */
export function proofEndpoint({ argv = process.argv, env = process.env, store = endpointStore(), pasteKey = argv.includes('--paste-key') } = {}) {
  const named = argv.find((a) => a.startsWith('--endpoint='))?.slice('--endpoint='.length) ?? null;
  const endpoint = selectEndpoint(store.registry(), named === '' ? null : named);
  if (endpoint === null) throw new Error(`no endpoint is registered in ${store.file}; register one with \`pnpm live-run --add-endpoint\``);
  if (typeof endpoint.label !== 'string' || endpoint.label.trim() === '') throw new Error(`the endpoint "${endpoint.name}" has no label in ${store.file}`);
  if (typeof endpoint.model !== 'string' || endpoint.model.trim() === '') throw new Error(`the endpoint "${endpoint.name}" has no model in ${store.file}`);
  const providerId = instanceIdFor(endpoint.label);
  const shaped = { ...endpoint, providerId, qualified: `${providerId}/${endpoint.model}` };
  if (pasteKey) return { ...shaped, key: null, keySource: 'pasted by the owner (--paste-key)' };
  const { key, source } = endpointKey(store, endpoint.name, env);
  if (key === null || key === '') {
    throw new Error(`no key is stored for the endpoint "${endpoint.name}" (looked in ${KEY_ENV} and ${store.keyFileFor(endpoint.name)}); store one with \`pnpm live-run --set-key --endpoint=${endpoint.name}\`, or run with --paste-key and paste it into the dialog`);
  }
  return { ...shaped, key, keySource: source };
}
