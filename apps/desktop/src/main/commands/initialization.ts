import { SKIP_WRITE_FAILED } from '@rotaris/contracts';
import { type CommandContext, type CommandHandlers } from './context.js';

export function initializationCommands(
  ctx: Pick<CommandContext, 'initialization'>,
): Pick<CommandHandlers, 'initialization.read' | 'initialization.resolve' | 'initialization.start' | 'initialization.skip' | 'initialization.cancel'> {
  const { initialization } = ctx;
  return {
    /*
     * Part AS — ADR-0064 (REQ-WORKSPACE-102, 105, 110, 111, 109, 115). Every answer is the whole state,
     * and the coordinator publishes on channel 12 besides, so a window that did not ask still catches up.
     */
    'initialization.read': async () => {
      return { ok: true, value: await initialization.read() };
    },
    'initialization.resolve': async () => {
      // REQ-WORKSPACE-102: a user-requested check is additional to the one automatic resolution per open.
      return { ok: true, value: await initialization.resolve(false) };
    },
    'initialization.start': async () => {
      const r = await initialization.start();
      return r.ok ? { ok: true, value: await initialization.read() } : { ok: false, code: 'initialization.refused', headline: r.headline, ...(r.detail === '' ? {} : { detail: r.detail }) };
    },
    'initialization.skip': async (req) => {
      const r = await initialization.skip(req.ids);
      return r.ok ? { ok: true, value: await initialization.read() } : { ok: false, code: 'initialization.write', headline: SKIP_WRITE_FAILED(r.reason) };
    },
    'initialization.cancel': async () => {
      await initialization.cancel();
      return { ok: true, value: await initialization.read() };
    },
  };
}
