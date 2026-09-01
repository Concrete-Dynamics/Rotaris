The ⌘K overlay — every action reachable from the keyboard, grouped, with shortcut chips. Presentational: the host owns filtering, arrow-key state (activeId) and dispatch.

```jsx
<CommandPalette query={q} onQueryChange={setQ} activeId="new-session" onSelect={run} onClose={close}
  groups={[{ label: 'Session', items: [
    { id: 'new-session', label: 'New session', icon: 'ph-plus', kbd: ['⌘','N'] },
    { id: 'steer', label: 'Steer active agent', icon: 'ph-compass' },
  ]}]} />
```

Group labels mirror the primary navigation. Row copy is sentence case, verb first.
