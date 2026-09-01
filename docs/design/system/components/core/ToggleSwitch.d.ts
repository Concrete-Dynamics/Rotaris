export interface ToggleSwitchProps {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}
export function ToggleSwitch(props: ToggleSwitchProps): JSX.Element;
