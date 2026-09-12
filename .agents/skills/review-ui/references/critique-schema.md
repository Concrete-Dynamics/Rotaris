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
      "surface": "Workspace @ 1400x900",
      "evidence": ["2-workspace-1400x900.png", "geometry.json#Workspace@1400x900"],
      "observation": "What is visibly or measurably present",
      "recommendation": "A bounded direction for the implementation agent"
    }
  ]
}
```

Allowed lifecycle values are `proposed`, `approved`, `implemented`, `verified-resolved`, and `partial`. The critic creates `proposed` findings. A later implementation or verification pass advances status with evidence.
