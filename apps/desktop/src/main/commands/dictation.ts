import { canonicalPath } from '@rotaris/platform';
import { millis } from '@rotaris/kernel';
import { transcriberFor } from '../dictation/select.js';
import { clearDictationCredential, maskedBearer, readDictationCredential, writeDictationCredential } from '../dictation/credential.js';
import type { CommandAt, CommandContext, CommandHandlers } from './context.js';
import type { CommandOutcome, CommandRequest } from '@rotaris/contracts';

/** A refusal's sentence is the headline: the composer shows it on its error line, and the control carries it in its two channels once idle. */
const refuse = (code: string, headline: string): CommandOutcome => ({ ok: false, code, headline });

/**
 * DICTATION (OQ-455..458, PD-CONFIG-010) — the renderer holds the microphone; main holds the transcription, because the child
 * process and the credential are main's (ADR-0030). The configuration is read from the saved file at each press, like the
 * `skills:` gesture, since a press acts now rather than at some later run. Main takes the workspace from the window that asked.
 *
 * The endpoint's bearer is a stored credential of its own (`dictation/credential.ts`), read at each press and written by the
 * Settings field. No answer carries it: `dictation.credential` and the two writes answer the masked form alone (REQ-MCP-081's
 * discipline), and no refusal this file writes carries it either.
 */
export function dictationCommands(ctx: Pick<CommandContext, 'services' | 'dictationCredential' | 'log'>): Pick<CommandHandlers, 'dictation.transcribe' | 'dictation.credential' | 'dictation.setCredential' | 'dictation.clearCredential'> {
  const { services, dictationCredential, log } = ctx;
  return {
    'dictation.transcribe': async (req: Extract<CommandRequest, { kind: 'dictation.transcribe' }>, { w }: CommandAt): Promise<CommandOutcome> => {
      const root = canonicalPath(w.workspace);
      const svc = services.get(root);
      if (!svc) return refuse('workspace.none', 'Open a workspace before dictating');
      const read = await svc.link.request({ kind: 'config.read', workspaceRoot: root }, millis(10_000));
      if (read.kind !== 'config.snapshot') return refuse('dictation.config', 'The dictation settings could not be read');
      const chosen = transcriberFor(read.snapshot.dictation, { env: process.env, bearer: readDictationCredential(dictationCredential), scripted: __ROTARIS_SEAMS__ ? process.env['ROTARIS_DICTATION_SCRIPT'] : undefined });
      if (!chosen.ok) return refuse(chosen.error.code, chosen.error.reason);
      const r = await chosen.value.transcribe({ audio: Buffer.from(req.audioBase64, 'base64'), mimeType: req.mimeType, language: read.snapshot.dictation.language });
      return r.ok ? { ok: true, value: { text: r.value } } : refuse(r.error.code, r.error.reason);
    },
    /** PD-CONFIG-010: the masked state alone — null when nothing is stored. The value never crosses back. */
    'dictation.credential': async (): Promise<CommandOutcome> => {
      return { ok: true, value: { masked: maskedBearer(readDictationCredential(dictationCredential)) } };
    },
    'dictation.setCredential': async (req: Extract<CommandRequest, { kind: 'dictation.setCredential' }>): Promise<CommandOutcome> => {
      const value = req.value.trim();
      if (value === '') return refuse('dictation.credential-empty', 'Enter the bearer the endpoint expects; an empty value stores nothing.');
      const r = await writeDictationCredential(dictationCredential, value);
      if (!r.ok) return refuse('dictation.credential-write', `${r.error.headline}${r.error.detail === undefined ? '' : ` (${r.error.detail})`}`);
      log('stored the dictation endpoint credential (PD-CONFIG-010)');
      return { ok: true, value: { masked: maskedBearer(value) } };
    },
    'dictation.clearCredential': async (): Promise<CommandOutcome> => {
      const r = await clearDictationCredential(dictationCredential);
      if (!r.ok) return refuse('dictation.credential-delete', r.error.headline);
      if (r.value.removed) log('removed the dictation endpoint credential (PD-CONFIG-010)');
      return { ok: true, value: { masked: null, removed: r.value.removed } };
    },
  };
}
