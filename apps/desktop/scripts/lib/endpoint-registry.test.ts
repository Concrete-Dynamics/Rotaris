/**
 * The live-run endpoint registry as `slice-proof` reads it (R-068). The proof signed into OpenRouter constants with a key
 * the owner pasted by hand; it now signs into the registry's default endpoint (or `--endpoint=<name>`) with the key
 * `live-run` stores beside the registry, through the same reader. Every case here reads a FIXTURE registry in a scratch
 * directory, never the owner's `~/.rotaris/live-run`.
 */
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KEY_ENV, endpointKey, endpointStore, instanceIdFor, proofEndpoint, registryHome, selectEndpoint } from './endpoint-registry.mjs';

let dir: string;
const FIXTURE = {
  default: 'selfhosted',
  endpoints: {
    selfhosted: { label: 'Self Hosted', baseUrl: 'https://models.example.test/v1/', model: 'local-model-1', inputUsdPerMillion: null, outputUsdPerMillion: null, contextTokens: 32768, unmetered: true },
    hosted: { label: 'Hosted Gateway', baseUrl: 'https://gateway.example.test/api/v1', model: 'vendor/model-2', inputUsdPerMillion: 1, outputUsdPerMillion: 5, contextTokens: null, unmetered: false },
  },
};
const FAKE_KEY = 'fixture-key-not-a-real-credential-0123';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'endpoint-registry-'));
  writeFileSync(join(dir, 'endpoints.json'), `${JSON.stringify(FIXTURE, null, 2)}\n`);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the live-run endpoint registry (R-068)', () => {
  it('lives at ~/.rotaris/live-run, and names an endpoint by the provider id the product mints for its label (REQ-PROVIDER-051)', () => {
    expect(registryHome('/home/someone')).toBe(join('/home/someone', '.rotaris', 'live-run'));
    expect(instanceIdFor('Katalyst')).toBe('openai-compatible--katalyst');
    expect(instanceIdFor('  My Endpoint (v2) ')).toBe('openai-compatible--my-endpoint-v2');
  });

  it('selects the default, or the one named, with the base URL trimmed of its trailing slash', () => {
    const reg = endpointStore(dir).registry();
    expect(selectEndpoint(reg)).toMatchObject({ name: 'selfhosted', label: 'Self Hosted', baseUrl: 'https://models.example.test/v1', model: 'local-model-1' });
    expect(selectEndpoint(reg, 'hosted')).toMatchObject({ name: 'hosted', baseUrl: 'https://gateway.example.test/api/v1' });
    expect(() => selectEndpoint(reg, 'absent')).toThrow(/no endpoint named "absent"; `pnpm live-run --endpoints` lists them/);
    expect(selectEndpoint({ default: null, endpoints: {} })).toBeNull();
  });

  it('stores a key beside the registry, owner-only, and reads it back; the environment\'s key wins over the file', () => {
    const store = endpointStore(dir);
    expect(store.hasKey('selfhosted')).toBe(false);
    const stored = store.storeKey('selfhosted', FAKE_KEY);
    expect(store.hasKey('selfhosted')).toBe(true);
    if (process.platform !== 'win32') {
      expect(stored.file).toBe(join(dir, 'selfhosted.key'));
      expect(statSync(stored.file).mode & 0o777).toBe(0o600);
    }
    expect(endpointKey(store, 'selfhosted', {})).toEqual({ key: FAKE_KEY, source: store.keyFileFor('selfhosted') });
    expect(endpointKey(store, 'selfhosted', { [KEY_ENV]: ' from-the-environment ' })).toEqual({ key: 'from-the-environment', source: `the environment (${KEY_ENV})` });
    expect(endpointKey(store, 'hosted', {})).toEqual({ key: null, source: null });
  });
});

describe('the endpoint slice-proof signs into (R-068)', () => {
  it('is the registry\'s default, with its label, URL, model, provider id and stored key', () => {
    const store = endpointStore(dir);
    store.storeKey('selfhosted', FAKE_KEY);
    const e = proofEndpoint({ argv: ['node', 'slice-proof.mjs', '--skip-build'], env: {}, store });
    expect(e).toMatchObject({
      name: 'selfhosted', label: 'Self Hosted', baseUrl: 'https://models.example.test/v1', model: 'local-model-1',
      providerId: 'openai-compatible--self-hosted', qualified: 'openai-compatible--self-hosted/local-model-1', key: FAKE_KEY, keySource: store.keyFileFor('selfhosted'),
    });
  });

  it('is the one --endpoint=<name> names, as live-run takes it', () => {
    const store = endpointStore(dir);
    store.storeKey('hosted', FAKE_KEY);
    const e = proofEndpoint({ argv: ['node', 'slice-proof.mjs', '--endpoint=hosted'], env: {}, store });
    expect(e).toMatchObject({ name: 'hosted', label: 'Hosted Gateway', providerId: 'openai-compatible--hosted-gateway', qualified: 'openai-compatible--hosted-gateway/vendor/model-2', key: FAKE_KEY });
    expect(() => proofEndpoint({ argv: ['--endpoint=nowhere'], env: {}, store })).toThrow(/no endpoint named "nowhere"/);
  });

  it('names a missing key clearly: the endpoint, where it looked, and the two ways on', () => {
    const store = endpointStore(dir);
    const refusal = (() => { try { proofEndpoint({ argv: [], env: {}, store }); return ''; } catch (cause) { return String((cause as Error).message); } })();
    expect(refusal).toContain('no key is stored for the endpoint "selfhosted"');
    expect(refusal).toContain(KEY_ENV);
    expect(refusal).toContain(join(dir, 'selfhosted.key'));
    expect(refusal).toContain('pnpm live-run --set-key --endpoint=selfhosted');
    expect(refusal).toContain('--paste-key');
  });

  it('--paste-key needs no stored key: the owner pastes it into the dialog', () => {
    const e = proofEndpoint({ argv: ['--paste-key'], env: {}, store: endpointStore(dir) });
    expect(e).toMatchObject({ name: 'selfhosted', key: null, keySource: 'pasted by the owner (--paste-key)' });
  });

  it('refuses an empty registry, naming the file and how to register one', () => {
    const empty = mkdtempSync(join(tmpdir(), 'endpoint-registry-empty-'));
    try {
      expect(() => proofEndpoint({ argv: [], env: {}, store: endpointStore(empty) })).toThrow(new RegExp(`no endpoint is registered in .*endpoints\\.json; register one with \`pnpm live-run --add-endpoint\``));
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('the scripts read one registry one way (R-068)', () => {
  const scripts = resolve(import.meta.dirname, '..');
  it('slice-proof signs into the registered endpoint, not OpenRouter constants, and fills the stored key through the dialog', () => {
    const text = readFileSync(join(scripts, 'slice-proof.mjs'), 'utf8');
    expect(text).toMatch(/import \{ proofEndpoint \} from '\.\/lib\/endpoint-registry\.mjs'/);
    expect(text).not.toMatch(/openrouter\.ai|anthropic\/claude-haiku|'openai-compatible--openrouter'|`OpenRouter>>/);
    expect(text).toMatch(/ROTARIS_CAPTURE_PROVIDER_FILL: PASTE \? `\$\{LABEL\}>>\$\{BASE_URL\}` : `\$\{LABEL\}>>\$\{BASE_URL\}>>\$\{endpoint\.key\}`/);
    // The scratch profile, which holds the product's credential store, is not under the proof's output directory.
    expect(text).not.toMatch(/const root = join\(output, 'profile'\)/);
  });
  it('live-run takes the registry and the key store from the shared module rather than a copy', () => {
    const text = readFileSync(join(scripts, 'live-run.mjs'), 'utf8');
    expect(text).toMatch(/from '\.\/lib\/endpoint-registry\.mjs'/);
    expect(text).not.toMatch(/function storedKey\(|function registry\(|const instanceIdFor =/);
  });
});

describe('slice-proof drives the controls the product draws', () => {
  it('names a model slot by its label, which the capture seam drives as a SearchableSelect, never as a native select', () => {
    const text = readFileSync(join(resolve(import.meta.dirname, '..'), 'slice-proof.mjs'), 'utf8');
    expect(text).not.toMatch(/select\[aria-label="Model for/);
    for (const slot of ['small_model', 'medium_model', 'large_model']) expect(text).toContain(`[aria-label="Model for ${slot}"]>>\${QUALIFIED}`);
    // A step the seam could not drive fails the scenario at once, naming it, not five assertions later.
    expect(text).toMatch(/no such \(control\|option\)/);
  });
});
