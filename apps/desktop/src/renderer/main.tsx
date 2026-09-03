import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BRIDGE_KEY, type RendererBridge } from '@rotaris/contracts';
import { AppShell } from '@rotaris/ui';
import './design.css';
// The mockup loads these two stylesheets from @phosphor-icons/web@2.1.1; the design assets
// carry the same two fonts byte for byte (REQ-SHELL-027, a distinct icon per view).
import '@phosphor-icons/web/regular';
import '@phosphor-icons/web/fill';

/**
 * The renderer composition root. One bundle for every window; the window's
 * role arrives by route (ADR-0056). Sandboxed: no Node, no filesystem, no
 * store handle — everything it knows arrives over the five channels through
 * the one frozen namespace the preload exposes (ADR-0044).
 */
function requireBridge(): RendererBridge {
  const b = (window as unknown as Record<string, RendererBridge | undefined>)[BRIDGE_KEY];
  if (!b) throw new Error('the preload bridge is absent — the renderer was loaded without its preload');
  return b;
}
const bridge = requireBridge();

async function boot(): Promise<void> {
  const hello = await bridge.command({ kind: 'shell.hello' });
  const info = hello.ok ? (hello.value as { version: string; workspace: string; processes: string[] }) : { version: '?', workspace: '(no workspace)', processes: [] };
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppShell version={info.version} workspaceLabel={info.workspace} statusItems={['rotaris-dim', ...info.processes]} />
    </StrictMode>,
  );
}

void boot();
