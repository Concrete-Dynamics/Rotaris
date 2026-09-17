import { relayTerminalCommand } from '../terminal.js';
import { type CommandOutcome, type CommandRequest } from '@rotaris/contracts';
import { type CommandAt, type CommandContext, type CommandHandlers } from './context.js';

/**
 * WINDOWS AND TERMINALS — the auxiliary windows main opens beside a main window, and the seven terminal
 * commands that travel to the run host shape for shape (Part AL, REQ-TOOLS-128; ADR-0048 for modality).
 * A payload command answers for the window that sent it; everything else answers for its owner.
 */
export function windowsCommands(
  ctx: Pick<CommandContext, 'log' | 'measurePersonaPaint' | 'ownerOfAuxiliary' | 'runHost' | 'terminalWindowCommand' | 'windowFor'>,
): Pick<CommandHandlers, 'terminal.streams' | 'terminal.sendKeys' | 'terminal.resize' | 'terminal.interrupt' | 'terminal.endInput' | 'terminal.kill' | 'terminal.audit' | 'window.openTerminal' | 'window.terminalPayload' | 'window.terminalSession' | 'window.terminalAutoOpen' | 'window.showWorkspace' | 'window.openPersona' | 'window.personaPayload' | 'window.modality'> {
  const { log, measurePersonaPaint, ownerOfAuxiliary, runHost, terminalWindowCommand, windowFor } = ctx;
  // Part AL — the seven `terminal.*` commands travel to the run host shape for shape (`main/terminal.ts`, REQ-TOOLS-128).
  const onTerminalStreams = (req: Extract<CommandRequest, { kind: 'terminal.streams' | 'terminal.sendKeys' | 'terminal.resize' | 'terminal.interrupt' | 'terminal.endInput' | 'terminal.kill' | 'terminal.audit' }>): CommandOutcome | Promise<CommandOutcome> => {
    return relayTerminalCommand(req, runHost, log);
  };
  // The same block's second half (wave 2): the terminal WINDOW's five commands, answered by the registry built above `runCommand`.
  const onWindowOpenTerminal = (req: Extract<CommandRequest, { kind: 'window.openTerminal' | 'window.terminalPayload' | 'window.terminalSession' | 'window.terminalAutoOpen' | 'window.showWorkspace' }>, { senderId }: CommandAt): CommandOutcome | Promise<CommandOutcome> => {
    return terminalWindowCommand(req, senderId);
  };
  return {
    'terminal.streams': onTerminalStreams,
    'terminal.sendKeys': onTerminalStreams,
    'terminal.resize': onTerminalStreams,
    'terminal.interrupt': onTerminalStreams,
    'terminal.endInput': onTerminalStreams,
    'terminal.kill': onTerminalStreams,
    'terminal.audit': onTerminalStreams,
    'window.openTerminal': onWindowOpenTerminal,
    'window.terminalPayload': onWindowOpenTerminal,
    'window.terminalSession': onWindowOpenTerminal,
    'window.terminalAutoOpen': onWindowOpenTerminal,
    'window.showWorkspace': onWindowOpenTerminal,
    'window.openPersona': async (req, { w }) => {
      // REQ-SHELL-072: an unknown agent — here, no followed session for it to belong to — is a silent no-op; the renderer
      // sends the command only for an id its replica holds (the reading in ADR-0048's note).
      if (w.followedSessionId === null) { log(`persona window for ${req.agentId} not opened: no session is followed`); return { ok: true, value: { opened: false } }; }
      const shownAt = Date.now();
      const wasVisible = w.personaWindows.entry(req.persona)?.win.isVisible() ?? false;
      const entry = await w.personaWindows.open(req.persona, req.agentId, req.focusSteer ?? false);
      if (!wasVisible) measurePersonaPaint(req.persona, entry.win, shownAt);
      return { ok: true, value: { opened: true, reused: wasVisible } };
    },
    'window.personaPayload': (_req, { senderId }) => {
      // A3: from the persona window itself, so its owner is found through the registries rather than assumed.
      const owner = ownerOfAuxiliary(senderId);
      const entry = owner?.personaWindows.bySender(senderId);
      if (!owner || !entry) return { ok: false, code: 'window.unknown', headline: 'This window is not a persona window' };
      return { ok: true, value: { persona: entry.persona, sessionId: owner.followedSessionId, select: owner.personaWindows.takeSelection(senderId) } };
    },
    'window.modality': (req, { w, senderId }) => {
      // ADR-0048's application modality, second execution (Part W): the main window's palette or keyboard help is open or
      // closed; every persona window of the family stops taking input, or takes it again. Only the main window may say so.
      if (windowFor(senderId) === undefined) return { ok: false, code: 'window.notMain', headline: 'Only the main window registers an application-modal surface' };
      const n = w.personaWindows.setFamilyModal(req.active);
      log(`application modality ${req.active ? 'on' : 'off'}: ${n} persona window(s) ${req.active ? 'disabled' : 'enabled'} (ADR-0048)`);
      return { ok: true, value: { windows: n } };
    },
  };
}
