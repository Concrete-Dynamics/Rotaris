# Critique schema

```json
{
  "version": 1,
  "revision": "git revision from manifest.json",
  "iteration": 1,
  "summary": "Short overall assessment",
  "findings": [
    {
      "id": "UIR-001",
      "status": "proposed",
      "category": "design-quality | originality | craft | functionality | deterministic",
      "severity": "high | medium | low",
      "criterion": "C5",
      "surface": "Workspace @ 1400x900",
      "evidence": ["1-workspace-1400x900.png", "geometry.json#Workspace@1400x900"],
      "observation": "What is visibly or measurably present",
      "recommendation": "A bounded direction for the implementation agent"
    }
  ]
}
```

Allowed lifecycle values are `proposed`, `approved`, `implemented`, `verified-resolved`, and `partial`. The critic creates `proposed` findings. A later implementation or verification pass advances status with evidence.

`criterion` is the id of the rubric row the finding fails ([critique-rubric.md](critique-rubric.md)); it is optional, and `pnpm ui-review -- --validate=<path>` does not check it. The rubric fixes which `category` a criterion belongs to.
