import { millis } from '@rotaris/kernel';
import { refusal, type CommandContext, type CommandHandlers } from './context.js';

/**
 * HOOKS — the summary a workspace's hooks present, the trust review main opens for them, and the toggles
 * (REQ-HOOKS-*, ADR-0025). The decision is the user's and is stored by the run host; this file opens the
 * review, relays the answer, and closes the window once the run host has acknowledged it.
 */
export function hooksCommands(
  ctx: Pick<CommandContext, 'clocks' | 'log' | 'openHookReview' | 'reviewPayloads' | 'runHost'>,
): Pick<CommandHandlers, 'hooks.summary' | 'hooks.review' | 'playbooks.catalogue' | 'hooks.reviewPayload' | 'hooks.reviewDecide' | 'hooks.clearDecision' | 'hooks.setToggle'> {
  const { clocks, log, openHookReview, reviewPayloads, runHost } = ctx;
  return {
    'hooks.summary': async (req, { w }) => {
      if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace to see its hooks' };
      const r = await runHost.request({ kind: 'hooks.summary', workspaceId: w.workspaceId, ...(req.sessionId === undefined ? {} : { sessionId: req.sessionId }) }, millis(10_000));
      return r.kind === 'hooks.summary' ? { ok: true, value: r.summary } : refusal(r, 'The hooks could not be read');
    },
    'hooks.review': () => {
      return openHookReview();
    },
    'playbooks.catalogue': async () => {
      const r = await runHost.request({ kind: 'playbooks.catalogue' }, millis(10_000));
      return r.kind === 'playbooks.catalogue' ? { ok: true, value: r.catalogue } : refusal(r, 'The playbook catalogue could not be read');
    },
    'hooks.reviewPayload': (_req, { senderId }) => {
      const p = reviewPayloads.get(senderId);
      return p ? { ok: true, value: { workspace: p.workspace, entries: p.entries } } : { ok: false, code: 'hooks.review.none', headline: 'This window was not opened for a hook review' };
    },
    'hooks.reviewDecide': async (req, { w, senderId }) => {
      const p = reviewPayloads.get(senderId);
      if (!p || p.decided) return { ok: false, code: 'hooks.review.none', headline: 'No review is open for this window' };
      if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'The workspace is no longer open' };
      const r = await runHost.request({ kind: 'hooks.decide', workspaceId: w.workspaceId, trusted: req.trusted }, millis(10_000));
      if (r.kind !== 'ack') return refusal(r, 'The decision could not be saved');
      p.decided = true;
      log(`hook review → ${req.trusted ? 'allowed' : 'refused'}`);
      clocks.timers.after(millis(50), () => { if (!p.win.isDestroyed()) p.win.close(); });
      return { ok: true };
    },
    'hooks.clearDecision': async (_req, { w }) => {
      if (!w.workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace first' };
      const r = await runHost.request({ kind: 'hooks.clearDecision', workspaceId: w.workspaceId }, millis(10_000));
      return r.kind === 'ack' ? { ok: true } : refusal(r, 'The stored decision could not be removed');
    },
    'hooks.setToggle': async (req) => {
      const r = await runHost.request({ kind: 'hooks.setToggle', agent: req.agent, hookId: req.hookId, on: req.on }, millis(10_000));
      return r.kind === 'ack' ? { ok: true } : refusal(r, 'The hook policy could not be saved');
    },
  };
}
