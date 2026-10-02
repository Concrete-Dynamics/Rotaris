import type { CommandContext, CommandHandlers } from './context.js';

/**
 * REQ-NOTIFY-071 / REQ-NOTIFY-078 (the 401 note's part B) — the non-modal re-authentication prompt's two answers. Main
 * holds the prompt (`auth-fallback.ts`); the window names only the session the prompt it draws was opened for, and the
 * key typed into it goes to the credential store or nowhere — it is never logged (REQ-PROVIDER-131).
 */
export function reauthCommands(ctx: Pick<CommandContext, 'authFallback'>): Pick<CommandHandlers, 'reauth.submit' | 'reauth.dismiss' | 'reauth.read'> {
  return {
    'reauth.read': () => ({ ok: true, value: { prompts: ctx.authFallback.openPrompts() } }),
    'reauth.submit': async (req) => ({ ok: true, value: await ctx.authFallback.submitPrompt(req.sessionId, req.apiKey) }),
    'reauth.dismiss': (req) => (ctx.authFallback.dismissPrompt(req.sessionId) ? { ok: true } : { ok: false, code: 'reauth.none', headline: 'No re-authentication prompt is open for this session' }),
  };
}
