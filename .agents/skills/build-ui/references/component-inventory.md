# Component inventory

The production layer is `packages/ui/src/design-system/`, exported as `@rotaris/ui/design-system`.

- Core: Button, Kbd, SegmentedControl, StatusDot, Tag, ToggleSwitch
- Forms: Input, TextArea, Select
- Surfaces: Card, KpiCard, SectionLabel
- Data: ContextRing, MeterBar, Sparkline, Table
- Feedback: Dialog, Spinner, Tooltip, Acknowledgement
- Navigation: Tabs, NavRail, CommandPalette
- Patterns: ConfirmDialog, EmptyState, LogPanel, PageHeader, TableCard

Several names also have behavior-rich Shell implementations in `packages/ui/src/`. Prefer those when their requirement-owned behavior applies. Keep the primitive layer free of process messages and domain state.

Every primitive emits `data-ui-component`. Important product relationships may add a `UiLayoutContract` with these relation kinds: `align-x`, `align-y`, `equal-width`, `equal-height`, `spacing-token`, `containment`, `text-fit`, `hit-test`, and `viewport-scroll`.
