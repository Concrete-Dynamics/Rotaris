Monospace run-log panel. Levels reuse the axis triad functionally (run=teal, done=violet, warn=amber) plus red for failure — never euphemize state names.

```jsx
<LogPanel maxHeight={160} lines={[
  { time: '14:02:11', level: 'run',  text: 'planner → spawned reviewer (sonnet)' },
  { time: '14:02:38', level: 'warn', text: 'context at 81% — compaction scheduled' },
  { time: '14:03:02', level: 'done', text: 'reviewer finished · 12,480 tok' },
]} />
```
