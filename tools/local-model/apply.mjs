#!/usr/bin/env node
// R-087 — `pnpm local-model:apply`: bind every agent role of Rotaris (the thirteen built-in roles and `intent-classifier`),
// every model slot, the compressor and the circuit breaker to ONE locally hosted OpenAI-compatible model, by writing the
// layer `@rotaris/config`'s `localModelLayer` builds into the user's global configuration (`agents.yaml`), field by field
// and keeping its comments. Repeatable: applying it twice changes nothing the second time, so it survives a re-run and a
// fresh clone. The endpoint and the key are the USER's — passed here or read from the environment, never committed:
//
//   ROTARIS_LOCAL_MODEL_BASE_URL=http://<host>:<port>/v1 pnpm local-model:apply --label ds41 --model-id <served id> \
//     [--api-key-env DS41_API_KEY] [--config-dir <dir>] [--max-output-tokens 16384] [--print]
//
// `--config-dir` defaults to the product's global configuration directory (`@rotaris/platform`'s `resolveUserDirs`).
// `--print` writes nothing and prints the layer with the base URL masked. The proof that the layer binds the whole set is
// `pnpm vitest run apps/desktop/src/run-host/local-model.test.ts`.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const root = fileURLToPath(new URL('../..', import.meta.url));
const jiti = createJiti(import.meta.url, { alias: {
  '@rotaris/config': join(root, 'packages/config/src/index.ts'),
  '@rotaris/contracts': join(root, 'packages/contracts/src/index.ts'),
  '@rotaris/kernel': join(root, 'packages/kernel/src/index.ts'),
  '@rotaris/platform': join(root, 'packages/platform/src/index.ts'),
} });

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const label = flag('label') ?? 'ds41';
const modelId = flag('model-id') ?? label;
const baseUrl = flag('base-url') ?? process.env.ROTARIS_LOCAL_MODEL_BASE_URL;
const apiKeyEnv = flag('api-key-env') ?? null;
const maxOutputTokens = flag('max-output-tokens') ? Number(flag('max-output-tokens')) : undefined;
if (!baseUrl) {
  console.error('local-model:apply: no endpoint. Pass --base-url or set ROTARIS_LOCAL_MODEL_BASE_URL; it is yours, and never committed.');
  process.exit(2);
}
const config = await jiti.import('@rotaris/config');
const spec = { label, modelId, baseUrl, apiKeyEnv, ...(maxOutputTokens ? { maxOutputTokens } : {}) };
if (args.includes('--print')) {
  const layer = config.localModelLayer(spec);
  if (!layer.ok) { console.error(`local-model:apply: ${layer.error}`); process.exit(2); }
  const masked = JSON.parse(JSON.stringify(layer.value));
  masked.models[label].base_url = '<your endpoint>';
  console.log(JSON.stringify(masked, null, 2));
  process.exit(0);
}
let configDir = flag('config-dir');
if (!configDir) {
  const platform = await jiti.import('@rotaris/platform');
  configDir = platform.resolveUserDirs().config;
}
const r = await config.applyLocalModel(configDir, spec);
if (!r.ok) { console.error(`local-model:apply: ${r.error.fault ?? r.error.code}`); process.exit(1); }
console.log(`local-model:apply: ${config.LOCAL_MODEL_ROLES.length} roles, ${config.MODEL_SLOTS.length} slots, the compressor and the circuit breaker now name '${label}' (${modelId}) in ${r.value.file}`);
