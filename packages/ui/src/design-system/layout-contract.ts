/**
 * REQ-SHELL-144..160 — machine-readable relationships for rendered UI evidence.
 *
 * A component may publish one contract on its root. `ui-audit` evaluates the
 * relationship against live DOM geometry after layout and animation settle.
 */
export type UiEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type UiAxis = 'x' | 'y' | 'both';

export type UiLayoutRelation =
  | { readonly kind: 'align-x'; readonly target: string; readonly edge?: Extract<UiEdge, 'left' | 'center' | 'right'>; readonly tolerance?: number }
  | { readonly kind: 'align-y'; readonly target: string; readonly edge?: Extract<UiEdge, 'top' | 'middle' | 'bottom'>; readonly tolerance?: number }
  | { readonly kind: 'equal-width'; readonly target: string; readonly tolerance?: number }
  | { readonly kind: 'equal-height'; readonly target: string; readonly tolerance?: number }
  | { readonly kind: 'spacing-token'; readonly property: 'gap' | 'row-gap' | 'column-gap' | 'padding-top' | 'padding-right' | 'padding-bottom' | 'padding-left'; readonly token: string; readonly tolerance?: number }
  | { readonly kind: 'containment'; readonly target?: string; readonly tolerance?: number }
  | { readonly kind: 'text-fit'; readonly axis?: UiAxis; readonly tolerance?: number }
  | { readonly kind: 'hit-test' }
  | { readonly kind: 'viewport-scroll'; readonly axis: UiAxis; readonly expected: boolean };

export interface UiLayoutContract {
  readonly id: string;
  readonly relations: readonly UiLayoutRelation[];
}

export interface UiLayoutAttributes {
  readonly 'data-ui'?: string;
  readonly 'data-ui-contract'?: string;
}

export function layoutContractAttributes(contract: UiLayoutContract | undefined): UiLayoutAttributes {
  if (contract === undefined) return {};
  return { 'data-ui': contract.id, 'data-ui-contract': JSON.stringify(contract.relations) };
}
