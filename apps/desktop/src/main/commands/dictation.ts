import { canonicalPath } from '@rotaris/platform';
import { millis } from '@rotaris/kernel';
import { transcriberFor } from '../dictation/select.js';
import type { CommandAt, CommandContext, CommandHandlers } from './context.js';
import type { CommandOutcome, CommandRequest } from '@rotaris/contracts';

/** A refusal's sentence is the headline: the composer shows it as it stands, in the control's two channels and its error line. */
const refuse = (code: string, headline: string): CommandOutcome => ({ ok: false, code, headline });

/**
 * DICTATION (OQ-455..458) — the renderer holds the microphone; main holds the transcription, because the child process and the
 * credential are main's (ADR-0030). The configuration is read from the saved file at each press, like the `skills:` gesture,
 * since a press acts now rather than at some later run. Main takes the workspace from the window that asked.
 */
export function dictationCommands(ctx: Pick<CommandContext, 'providers' | 'services'>): Pick<CommandHandlers, 'dictation.transcribe'> {
  const { providers, services } = ctx;
  return {
    'dictation.transcribe': async (req: Extract<CommandRequest, { kind: 'dictation.transcribe' }>, { w }: CommandAt): Promise<CommandOutcome> => {
      const root = canonicalPath(w.workspace);
      const svc = services.get(root);
      if (!svc) return refuse('workspace.none', 'Open a workspace before dictating');
      const read = await svc.link.request({ kind: 'config.read', workspaceRoot: root }, millis(10_000));
      if (read.kind !== 'config.snapshot') return refuse('dictation.config', 'The dictation settings could not be read');
      const chosen = transcriberFor(read.snapshot.dictation, { env: process.env, bearerOf: (id) => providers.lease([id]).bearers[id] ?? null, scripted: __ROTARIS_SEAMS__ ? process.env['ROTARIS_DICTATION_SCRIPT'] : undefined });
      if (!chosen.ok) return refuse(chosen.error.code, chosen.error.reason);
      const r = await chosen.value.transcribe({ audio: Buffer.from(req.audioBase64, 'base64'), mimeType: req.mimeType, language: read.snapshot.dictation.language });
      return r.ok ? { ok: true, value: { text: r.value } } : refuse(r.error.code, r.error.reason);
    },
  };
}
