Transient notification, bottom-right. Auto-dismiss after ~6s except `fail`, which stays until dismissed.

```jsx
<ToastStack>
  <Toast level="ok" title="Worktree merged" onDismiss={close}>3 commits onto main.</Toast>
  <Toast level="fail" title="Agent crashed" action={<Button variant="link">View log</Button>} onDismiss={close} />
</ToastStack>
```

Toasts state facts ("Worktree merged"), never celebrate. One line of body max.
