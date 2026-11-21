import { z } from 'zod';
import { CONFIG_KEY_PATH_MAX, CONFIGURE_SCOPES, configKeyClass, configKeyClassSentence, configKeySegments, type ConfigureScope } from '@rotaris/contracts';
import { errorObservation, observation, type ToolExecutor } from './types.js';

/**
 * PD-CONFIG-014: the one way an agent changes Rotaris's own configuration. It takes a dotted key, never a file's text;
 * `read` and `explain` answer from the saved configuration, and `set` hands one key of one scope to the port, which the
 * run host fills by asking main to have the workspace service write it (the one writer, REQ-CONFIG-441) and load again.
 *
 * The gate decides before this runs (clause 4): an authority key, or the global scope, always asks the user. The class
 * is checked here as well so a credential or an undefined key is refused with the reason, and again by the writer.
 */
export const CONFIGURE_OPERATIONS = ['read', 'explain', 'set'] as const;

/** What the saved configuration says of one key. */
export interface ConfigurationReading {
  /** The effective value after every layer (REQ-CONFIG-031); undefined where nothing gives the key a value. */
  readonly value: unknown;
  /** The file that states it, and its scope; `default` where no file does (a built-in default or nothing). */
  readonly scope: ConfigureScope | 'default';
  readonly file: string | null;
}

export type ConfigurationWrite =
  | { readonly ok: true; readonly file: string; readonly stated: boolean; readonly before: unknown }
  | { readonly ok: false; readonly error: string };

/** The run host's side of the tool, per workspace. */
export interface ConfigurationPort {
  read(key: string): ConfigurationReading | { readonly error: string };
  write(key: string, scope: ConfigureScope, value: unknown): Promise<ConfigurationWrite>;
}

const configureSchema = z.object({
  operation: z.enum(CONFIGURE_OPERATIONS),
  /**
   * A dotted path into `agents.yaml`: `runtime.max_iterations`, `personas.coding-agent.model`, `skills.enabled`. Named
   * `setting`, not `key`: the approval dialog masks an argument whose name reads as a secret's, and `key` does — the first
   * execution showed the user `key=***` for the one argument the dialog exists to show (2026-11-22).
   */
  setting: z.string().min(1).max(CONFIG_KEY_PATH_MAX),
  /** `set` only: the value, as YAML would hold it — a string, a number, a boolean, a list or a mapping. */
  value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional(),
  /** `set` only: `workspace` (the default) or `global`, which reaches every workspace and always asks the user. */
  scope: z.enum(CONFIGURE_SCOPES).optional(),
});
export type ConfigureArgs = z.infer<typeof configureSchema>;

const DESCRIPTION = [
  'Read or change Rotaris\'s own configuration (agents.yaml) by setting name. The file tools never write .rotaris/ — use this.',
  'Operations: read (the effective value and the file that states it), explain (what kind of key it is and how a change is approved), set (write one key).',
  'The setting is a dotted path: models.<name>.temperature, personas.<role>.model, runtime.max_iterations, skills.enabled, display.show_tool_inputs.',
  'set writes the workspace scope unless scope is global. A change takes effect at the next run, not the current one.',
  'Keys that decide what a run may do (permission mode, sandbox, network, hooks, tool servers, a role\'s tools) always ask the user first. Credentials are never accessible.',
].join(' ');

function rendered(value: unknown): string {
  if (value === undefined) return '(not set)';
  const text = JSON.stringify(value);
  return text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
}

function where(r: ConfigurationReading): string {
  return r.scope === 'default' || r.file === null ? 'no file states it (a built-in default, or unset)' : `stated in the ${r.scope} file ${r.file}`;
}

/** PD-CONFIG-014 clause 1. `port` absent means the build has no way to write, and the run host registers no executor. */
export function configureTool(port: ConfigurationPort): ToolExecutor<ConfigureArgs> {
  return {
    name: 'configure',
    description: DESCRIPTION,
    schema: configureSchema,
    label: (args) => `${args.operation} ${args.setting}${args.operation === 'set' ? ` (${args.scope ?? 'workspace'})` : ''}`,
    async execute(args) {
      const key = args.setting.trim();
      const klass = configKeyClass(key);
      if (configKeySegments(key) === null || klass === 'unknown') {
        return errorObservation(`Unknown configuration key: ${key}. A key is a dotted path from one of the top-level keys: default_persona, the model slots (small_model, medium_model, large_model, …), models, personas, runtime, compressor, circuit_breaker, display, transcript, skills, instructions, checkpoints, requirements, dictation, mcp_servers, hooks.`);
      }
      if (klass === 'never') return errorObservation(`${key}: ${configKeyClassSentence('never')}`);
      if (args.operation === 'read' || args.operation === 'explain') {
        const r = port.read(key);
        if ('error' in r) return errorObservation(`The configuration could not be read: ${r.error}`);
        const head = `${key} = ${rendered(r.value)} — ${where(r)}.`;
        return observation(args.operation === 'read' ? head : `${head}\n${configKeyClassSentence(klass)} A set writes the workspace scope unless scope is global (which always asks), and takes effect at the next run.`);
      }
      if (args.value === undefined) return errorObservation('set needs a value. To see what the key holds now, use read.');
      const scope = args.scope ?? 'workspace';
      const w = await port.write(key, scope, args.value);
      if (!w.ok) return errorObservation(`${key} was not changed: ${w.error}`);
      return observation(`Set ${key} in the ${scope} configuration (${w.file}): ${w.stated ? rendered(w.before) : '(not stated in that file)'} → ${rendered(args.value)}. It takes effect at the next run; this run keeps the configuration it started with.`);
    },
  };
}
