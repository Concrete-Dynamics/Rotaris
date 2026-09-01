The base surface for every panel — dashboard tiles, inspector sections, list rows.

```jsx
<Card title="Git — feature/auth-refactor" accented footer="9 files touched · 3 uncommitted">
  <span className="kpi-value">↑4</span>
</Card>
```

`accented` adds the 2px accent left rule seen on dashboard summary cards. Combine with `.elev-sm/md/lg` utility classes for elevation when floating (dialogs, popovers).
