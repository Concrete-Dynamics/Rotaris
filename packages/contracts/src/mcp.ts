import { z } from 'zod';

/**
 * The MCP settings category's renderer-facing shapes (REQ-MCP-091/092/109/115, REQ-CONFIG-350..353): what the run
 * host answers `mcp.list`, `mcp.probe` and `mcp.secrets` with, relayed by main. No field carries a value out of the
 * secrets store — every rendering is the mask (REQ-MCP-081) — and no field name looks like a secret (the contracts
 * test's forbidden list). The transport vocabulary is REQ-MCP-001's; the origin vocabulary REQ-MCP-026's; the four
 * health states REQ-CONFIG-353's.
 */
export const MCP_TRANSPORT_NAMES = ['stdio', 'http', 'sse'] as const;
export const MCP_ORIGIN_NAMES = ['yaml', 'discovered-project', 'discovered-user', 'default'] as const;
export const MCP_HEALTH_STATES = ['unknown', 'checking', 'healthy', 'unreachable'] as const;
export type McpHealthState = (typeof MCP_HEALTH_STATES)[number];

export const McpHealthSchema = z.object({
  state: z.enum(MCP_HEALTH_STATES),
  /** `healthy`: the tools the server listed on that contact. */
  toolCount: z.number().int().nonnegative().optional(),
  /** `unreachable`: human-readable text describing the failure. */
  detail: z.string().optional(),
  elapsedMs: z.number().nonnegative().optional(),
});
export type McpHealth = z.infer<typeof McpHealthSchema>;

export const McpServerRowSchema = z.object({
  name: z.string(),
  type: z.enum(MCP_TRANSPORT_NAMES),
  /** REQ-MCP-091: the url, or the command and args joined by spaces — through the mask for secret-looking values. */
  line: z.string(),
  origin: z.enum(MCP_ORIGIN_NAMES),
  /** REQ-CONFIG-465: the configured value. */
  enabled: z.boolean(),
  /** REQ-MCP-094/115: toggled off for this session (never persistent). */
  overridden: z.boolean(),
  available: z.boolean(),
  availabilityDetail: z.string(),
  /** REQ-MCP-088 / REQ-CONFIG-225: a remote entry whose url still holds unresolved placeholders. */
  unresolved: z.array(z.string()),
  /** REQ-MCP-109: the keys of the entry's configured env block, in code-point order. */
  expectedKeys: z.array(z.string()),
});
export type McpServerRow = z.infer<typeof McpServerRowSchema>;

export const McpListingSchema = z.object({
  /** REQ-CONFIG-350: the configuration file named by the empty state. */
  configFile: z.string(),
  rows: z.array(McpServerRowSchema),
});
export type McpListing = z.infer<typeof McpListingSchema>;

export const McpSecretRowSchema = z.object({
  server: z.string(),
  key: z.string(),
  /** REQ-MCP-081: the one mask, never a character of the value. */
  masked: z.string(),
  scope: z.enum(['Workspace', 'Global']),
});
export type McpSecretRow = z.infer<typeof McpSecretRowSchema>;

export const McpSecretsViewSchema = z.object({
  /** The configured server names, for the per-server chooser, in code-point order. */
  servers: z.array(z.string()),
  rows: z.array(McpSecretRowSchema),
  /** The per-server view's expected-keys hint: each configured env key and whether a stored entry satisfies it. */
  expected: z.array(z.object({ key: z.string(), satisfied: z.boolean() })),
  /** Which view answered: all servers or one. */
  server: z.string().nullable(),
});

/**
 * ADR-0035 (Part T) / REQ-MCP-099 and REQ-MCP-112: the code-intelligence project setup as the settings category sees it.
 * Three steps in the requirement's order, each in the closed status vocabulary of REQ-MCP-099 (plus `pending` and
 * `running` for a step not yet reached or in flight); one final outcome of REQ-MCP-112's three, `unavailable` for the
 * non-retryable "not a local launch" refusal of REQ-MCP-036/099. Every field is text a screen can show as text.
 */
export const MCP_SETUP_STEP_IDS = ['create', 'index', 'memory'] as const;
export const MCP_SETUP_STEP_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'skipped-no-code', 'not-attempted'] as const;
export const MCP_SETUP_OUTCOMES = ['completed', 'failed', 'cancelled', 'unavailable'] as const;
export const McpSetupStepSchema = z.object({
  id: z.enum(MCP_SETUP_STEP_IDS),
  label: z.string(),
  status: z.enum(MCP_SETUP_STEP_STATUSES),
  /** A failing step's output, its LAST 400 characters (REQ-MCP-099); a skipped or unattempted step's reason. */
  detail: z.string(),
  elapsedMs: z.number().nonnegative().nullable(),
});
export type McpSetupStep = z.infer<typeof McpSetupStepSchema>;
/**
 * REQ-MCP-118 (ESC-32 / IC-7): the language-server disclosure's data — what the bundled runtime will download at the first
 * use of a language, from where, under which licence, and into which directory. Read by the run host from the binding
 * manifest (REQ-MCP-116); the category shows it as text on every setup status, idle included. No secret-looking field.
 */
export const McpLanguageServerPackageSchema = z.object({ name: z.string(), version: z.string(), source: z.string(), license: z.string() });
export const McpLanguageServerSchema = z.object({ language: z.string(), provisioner: z.string(), packages: z.array(McpLanguageServerPackageSchema) });
export const McpProvisioningSchema = z.object({
  /** The runtime's store under its per-user home (REQ-STARTUP-145), as a path. */
  store: z.string(),
  servers: z.array(McpLanguageServerSchema),
});
export type McpProvisioning = z.infer<typeof McpProvisioningSchema>;
export const McpSetupStatusSchema = z.object({
  /** REQ-MCP-118: present on every status so the disclosure is readable before any fetch it describes. */
  provisioning: McpProvisioningSchema,
  state: z.enum(['idle', 'running', 'finished']),
  steps: z.array(McpSetupStepSchema),
  outcome: z.enum(MCP_SETUP_OUTCOMES).nullable(),
  /** The final sentence, or the refusal's text; empty while idle. */
  message: z.string(),
  /** REQ-MCP-099's contains-code answer, once taken for the run; null before. */
  containsCode: z.boolean().nullable(),
  /** The invocation the steps were derived from (REQ-MCP-036), for the log line the category shows; empty when none could be derived. */
  invocation: z.string(),
  startedAt: z.string().nullable(),
  /**
   * Part AS (ADR-0064) / REQ-WORKSPACE-090: whether a `code_intelligence` server is configured AND
   * launchable on this machine, judged by the one availability rule REQ-MCP-037 fixes for every
   * surface. It is `code-intelligence-setup`'s applicability predicate, and it rides the status so
   * this domain asks the question through the surface that already answers it rather than declaring
   * a second rule of its own — which REQ-WORKSPACE-090 forbids in terms.
   */
  applicable: z.boolean(),
});
export type McpSetupStatus = z.infer<typeof McpSetupStatusSchema>;
export type McpSecretsView = z.infer<typeof McpSecretsViewSchema>;
