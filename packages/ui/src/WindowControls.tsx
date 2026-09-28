import { Button, layoutContractAttributes, type UiLayoutContract } from './design-system/index.js';

export interface WindowControlsProps {
  readonly maximized: boolean;
  readonly onMinimize: () => void;
  readonly onToggleMaximize: () => void;
  readonly onClose: () => void;
}

/**
 * The controls sit inside the title bar they end (PD-SHELL-003: "at the right edge of that title bar").
 * Published through `layoutContractAttributes`, the one publisher, so the attribute is the relations
 * ARRAY `ui-audit` iterates — a hand-written object here once killed every audit on the first view.
 */
export const WINDOW_CONTROLS_LAYOUT: UiLayoutContract = {
  id: 'shell-window-controls',
  relations: [{ kind: 'containment', target: 'shell-title' }],
};

/** PD-SHELL-003 — one product-drawn control set for the main window on every supported desktop. */
export function WindowControls({ maximized, onMinimize, onToggleMaximize, onClose }: WindowControlsProps) {
  const maximizeLabel = maximized ? 'Restore' : 'Maximize';
  return (
    <div className="window-controls" role="group" aria-label="Window controls" data-testid="window-controls" {...layoutContractAttributes(WINDOW_CONTROLS_LAYOUT)}>
      <Button className="window-control" aria-label="Minimize" title="Minimize" onClick={onMinimize} icon="ph-minus" />
      <Button className="window-control" aria-label={maximizeLabel} title={maximizeLabel} onClick={onToggleMaximize} icon={maximized ? 'ph-copy' : 'ph-square'} />
      <Button className="window-control window-control--close" aria-label="Close window" title="Close window" onClick={onClose} icon="ph-x" />
    </div>
  );
}
