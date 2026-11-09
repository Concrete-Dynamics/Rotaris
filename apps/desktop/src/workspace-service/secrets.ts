import type { ProcessReply, WorkspaceServiceRequest } from '@rotaris/contracts';
import { REDACTION_MARK, type Timers } from '@rotaris/kernel';
import { secretsPathFor, setServerSecret, unsetServerSecret } from '@rotaris/config';

/**
 * REQ-MCP-084/110/111 (ADR-0034 part S's owed write side): the two secret mutations of the workspace service,
 * lifted out of `index.ts` so the reply SHAPE can be tested without a process behind it — the same reason
 * `open-bootstrap.ts` and `store-establish.ts` stand beside it.
 *
 * The scope the request names decides the file (REQ-MCP-082's two places, through `secretsPathFor`); `workspace`
 * when none is named (REQ-CONFIG-463's opening choice, the `config.setField` default). The reply is the masked
 * confirmation alone — server, key, scope and the one mask (REQ-MCP-081) — never the value, which is why this
 * function reads no value out of the request on its way back; a key that a delete did not find answers `masked:
 * null`, which REQ-MCP-110 states as "the key was not present in that scope, which is not an error".
 */
export type SecretWriteRequest = Extract<WorkspaceServiceRequest, { kind: 'mcp.setSecret' | 'mcp.unsetSecret' }>;

export interface SecretWriteDeps {
  /** `dirs.config`: the global configuration directory the global scope's file sits in. */
  readonly configDir: string;
  readonly timers: Timers;
  readonly log: (message: string, level?: 'info' | 'warn') => void;
}

export async function handleSecretWrite(req: SecretWriteRequest, deps: SecretWriteDeps): Promise<ProcessReply> {
  const scope = req.scope ?? 'workspace';
  const file = secretsPathFor(scope, deps.configDir, req.workspaceRoot);
  const display = scope === 'workspace' ? 'Workspace' as const : 'Global' as const;
  if (req.kind === 'mcp.setSecret') {
    const r = await setServerSecret(file, req.server, req.key, req.value, { timers: deps.timers });
    if (!r.ok) {
      deps.log(`secrets: storing one key for '${req.server}' in the ${scope} scope refused: ${r.error.fault}`, 'warn');
      return { kind: 'refused', code: `mcp.secret.${r.error.code}`, headline: 'The secret could not be stored', detail: `${r.error.file}: ${r.error.fault}` };
    }
    deps.log(`secrets: stored one key for '${req.server}' in the ${scope} scope (REQ-MCP-110)`);
    return { kind: 'mcp.secretWritten', server: req.server, key: req.key, scope: display, masked: REDACTION_MARK, removed: false };
  }
  const r = await unsetServerSecret(file, req.server, req.key, { timers: deps.timers });
  if (!r.ok) {
    deps.log(`secrets: deleting one key of '${req.server}' in the ${scope} scope refused: ${r.error.fault}`, 'warn');
    return { kind: 'refused', code: `mcp.secret.${r.error.code}`, headline: 'The secret could not be deleted', detail: `${r.error.file}: ${r.error.fault}` };
  }
  // REQ-CONFIG-217: a key that was not there writes nothing and is not an error; the mask is null for it.
  deps.log(r.value.removed > 0
    ? `secrets: deleted one key of '${req.server}' in the ${scope} scope (REQ-CONFIG-217)`
    : `secrets: '${req.server}' had no such key in the ${scope} scope; nothing was written (REQ-CONFIG-217)`);
  return { kind: 'mcp.secretWritten', server: req.server, key: req.key, scope: display, masked: r.value.removed > 0 ? REDACTION_MARK : null, removed: r.value.removed > 0 };
}
