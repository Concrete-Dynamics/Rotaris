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
export type McpSecretsView = z.infer<typeof McpSecretsViewSchema>;
