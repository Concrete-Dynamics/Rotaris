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
});

contextBridge.exposeInMainWorld(BRIDGE_KEY, bridge);
