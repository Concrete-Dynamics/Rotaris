import { Button } from './design-system/index.js';

export interface WindowControlsProps {
  readonly maximized: boolean;
  readonly onMinimize: () => void;
  readonly onToggleMaximize: () => void;
  readonly onClose: () => void;
}

/** PD-SHELL-003 — one product-drawn control set for the main window on Windows and Linux. */
export function WindowControls({ maximized, onMinimize, onToggleMaximize, onClose }: WindowControlsProps) {
  const maximizeLabel = maximized ? 'Restore' : 'Maximize';
  return (
    <div className="window-controls" role="group" aria-label="Window controls" data-ui="shell-window-controls" data-ui-contract='{"relations":[{"kind":"containment","target":"shell-title"}]}' data-testid="window-controls">
      <Button className="window-control" aria-label="Minimize" title="Minimize" onClick={onMinimize} icon="ph-minus" />
      <Button className="window-control" aria-label={maximizeLabel} title={maximizeLabel} onClick={onToggleMaximize} icon={maximized ? 'ph-copy' : 'ph-square'} />
      <Button className="window-control window-control--close" aria-label="Close window" title="Close window" onClick={onClose} icon="ph-x" />
    </div>
  );
}
