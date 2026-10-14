import { contextBridge, ipcRenderer } from 'electron';
import { BRIDGE_KEY, CHANNEL, type CommandOutcome, type CommandRequest, type RendererBridge } from '@rotaris/contracts';

/**
 * ADR-0044 — the preload exposes exactly ONE frozen namespace built from an
 * explicit method list. `contextIsolation: true`, `nodeIntegration: false`,
 * `sandbox: true` in every renderer. Nothing here generates, renumbers or
 * re-derives a sequence number; payloads pass through untouched.
 */
function subscribe(channel: string): (fn: (p: unknown) => void) => () => void {
  return (fn) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: unknown) => fn(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.off(channel, handler);
  };
}

const bridge: RendererBridge = Object.freeze({
  command: (req: CommandRequest): Promise<CommandOutcome> => ipcRenderer.invoke(CHANNEL.command, req) as Promise<CommandOutcome>,
  onTranscriptIncrement: subscribe(CHANNEL.transcriptIncrement),
  onSessionSnapshot: subscribe(CHANNEL.sessionSnapshot),
  onTerminalFrame: subscribe(CHANNEL.terminalFrames),
  onNotice: subscribe(CHANNEL.noticeCurrent),
  onThemeChanged: subscribe(CHANNEL.themeChanged),
  onConfigChanged: subscribe(CHANNEL.configChanged),
  onAcknowledgement: subscribe(CHANNEL.acknowledgementPublish),
  onLibraryChanged: subscribe(CHANNEL.libraryChanged),
  // Part AK — channel 10, the requirements board's generation (REQ-TRACE-374).
  onRequirementsChanged: subscribe(CHANNEL.requirementsChanged),
  onImprovementActivity: subscribe(CHANNEL.improvementActivity),
  // Part AS — channel 12, the nine values and the live run report (ADR-0064, REQ-WORKSPACE-105/109).
  onInitializationState: subscribe(CHANNEL.initializationState),
  // Channel 13 — the non-modal re-authentication prompt (REQ-NOTIFY-071, ADR-0048).
  onReauthPrompt: subscribe(CHANNEL.reauthPrompt),
  // Channel 14 — a stored transcript display preference, to every window (REQ-CHAT-167, REQ-CONFIG-403).
  onDisplayChanged: subscribe(CHANNEL.displayChanged),
  // Channel 15 — open Settings › Project in the window holding a banner's project (PD-WORKSPACE-005 revision 2, OQ-262).
  onProjectInitOpen: subscribe(CHANNEL.projectInitOpen),
  // Channel 16 — focus a notice's session in the window holding its workspace (PD-SHELL-001 revision 3, OQ-292).
  onSessionFocus: subscribe(CHANNEL.sessionFocus),
});

contextBridge.exposeInMainWorld(BRIDGE_KEY, bridge);
