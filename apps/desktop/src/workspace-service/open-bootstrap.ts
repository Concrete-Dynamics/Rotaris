import { bootstrapConfigFile, scopeFiles, type BootstrapOutcome } from '@rotaris/config';

/**
 * REQ-CONFIG-025 / REQ-CONFIG-028: the starter `<workspace>/.rotaris/agents.yaml` is written at the workspace's open,
 * before anything else can write that file.
 *
 * The open is the first moment the product holds a workspace, so it is REQ-CONFIG-025's "first run" for that file. It has
 * to come before ADR-0064's initialization records its first outcome: that recording goes through the scoped per-field
 * writer (`config.setField`), which REQ-CONFIG-030 forbids to bootstrap, so a file it creates holds `initialization:`
 * alone, and every later bootstrap then correctly finds it non-blank and reports `exists` (REQ-CONFIG-026). Until
 * 2026-10-03 the only bootstrap was the one a provider change asks for (REQ-WORKSPACE-135), which came after the
 * initialization record whenever code-intelligence setup succeeded before the sign-in, and never at all for a workspace
 * opened after the first sign-in (`docs/defects/fixed/a-first-run-workspace-never-gets-the-starter-agents-yaml.md`).
 *
 * The open is never refused for it: an existing file is left as it is (REQ-CONFIG-026), a directory or undecodable bytes
 * decline, logged as a warning, and surface as the load's fatal error (REQ-CONFIG-028, REQ-CONFIG-462), and a target that cannot be read
 * declines, logged as a warning, with nothing written over it (REQ-CONFIG-028's shared rule); a write that fails is logged
 * the same way.
 */
export function bootstrapAtOpen(configDir: string, workspaceRoot: string, log: (message: string, level?: 'info' | 'warn') => void): BootstrapOutcome | 'refused' {
  const file = scopeFiles(configDir, workspaceRoot).workspace.agents;
  // No `try` here: since 2026-10-04 `replaceDocumentSync` answers a parent it cannot create as a refusal rather than a
  // throw, so `bootstrapConfigFile` answers every failure as a `Result` and the catch that stood here guarded nothing
  // (`docs/defects/fixed/replace-document-sync-throws-when-the-parent-cannot-be-created.md`).
  const r = bootstrapConfigFile(file);
  if (!r.ok) {
    log(`configuration bootstrap at the open of ${workspaceRoot} declined: ${r.error.file}: ${r.error.fault}`, 'warn');
    return 'refused';
  }
  // A declined target (a directory, undecodable bytes) is one REQ-CONFIG-028 calls needing attention, as is a refusal.
  log(`configuration bootstrap at the open of ${workspaceRoot}: ${r.value}`, r.value.startsWith('declined') ? 'warn' : 'info');
  return r.value;
}
