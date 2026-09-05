/**
 * The normalised runtime server description of REQ-MCP-043 — exactly these keys, produced by the
 * configuration pipeline AFTER disabling, renaming and grants were applied (never expressed here as
 * keys), consumed by every connection path (ADR-0034). `transport` uses REQ-MCP-001's three tokens.
 */
export type StdioDescription = {
  readonly transport: 'stdio';
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly timeout?: number;
};
export type RemoteDescription = {
  readonly transport: 'http' | 'sse';
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeout?: number;
};
export type ServerDescription = StdioDescription | RemoteDescription;

/** REQ-MCP-046/052: what discovery returns per tool — the name and a description defaulting to `""`. */
export interface ToolInfo {
  readonly name: string;
  readonly description: string;
  /** The server's declared input schema, passed to the model as the tool's parameters. */
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

/** REQ-MCP-054's two outcomes. */
export type ProbeOutcome =
  | { readonly state: 'healthy'; readonly toolCount: number; readonly elapsedMs: number }
  | { readonly state: 'unreachable'; readonly detail: string; readonly elapsedMs: number };

/** REQ-MCP-048: an empty list never raises; `failed` remembers the failure for REQ-MCP-042. */
export interface DiscoveryResult {
  readonly tools: readonly ToolInfo[];
  readonly failed: boolean;
  readonly detail: string;
  readonly elapsedMs: number;
  /** True when this call answered from the per-process memo rather than interrogating the server (REQ-MCP-047). */
  readonly memoised: boolean;
}

/** What a tool call returns: the server's content rendered as text, `isError` carried (REQ-MCP-003). */
export interface CallOutcome {
  readonly text: string;
  readonly isError: boolean;
  readonly elapsedMs: number;
}

/** The log sink every path writes to; the child's stderr arrives here redacted (ADR-0007). */
export interface McpLog {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly debug: (message: string) => void;
}
