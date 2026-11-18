#!/bin/bash
# Rebuild the worktree's app, relaunch it on a scratch workspace with a scripted run, and capture the standard states.
#   capture.sh <worktree> <out-dir> [surface-selector-to-wait-for]
# Edit the block marked STATES for the surface being redesigned: one `shot` per state and width the design must hold at.
# It drives the built app through `pnpm app:drive`, spends nothing and talks to no provider (the scripted dialect).
set -u
WT=$1; OUT=$2; READY=${3:-.composer__input}
cd "$WT" || exit 1
unset WAYLAND_DISPLAY; export XDG_SESSION_TYPE=x11   # a Wayland shell: the harness needs X11 (docs/defects, the proof-launch note)
WS="$OUT/../scratch-workspace"; mkdir -p "$OUT" "$WS/.rotaris"
[ -f "$WS/.rotaris/agents.yaml" ] || cat > "$WS/.rotaris/agents.yaml" <<'YAML'
models:
  scripted: { provider: scripted, model_id: scripted }
small_model: scripted
medium_model: scripted
large_model: scripted
mcp_servers:
  code_intelligence: { enabled: false }
runtime:
  permission_mode: autonomous
  max_depth: 3
  max_active_children: 4
YAML
d() { pnpm -s app:drive "$@" > "$OUT/last.json" 2>&1; }
pnpm -s app:drive stop > /dev/null 2>&1
pnpm build > "$OUT/build.log" 2>&1 || { echo "BUILD FAILED"; tail -20 "$OUT/build.log"; exit 1; }
pnpm app:drive start --fresh --workspace="$WS" \
  --env=ROTARIS_SCRIPT=plan:3,delegate:coding-agent:alpha,delegate:coding-agent:beta,delegate:codebase-analyst:gamma,done,answer \
  --env=ROTARIS_CHILD_SCRIPT=wait:900000,read,answer > "$OUT/start.log" 2>&1
d waitFor "$READY"
# ── STATES ── empty first, then a live run, at the default, the wide and the minimum window (REQ-SHELL-022: 1000×680)
d resize 1440 900;  d shot "$OUT/empty-1440.png"
d resize 1000 680;  d shot "$OUT/empty-1000.png"
d resize 1440 900
d click ".composer__input"; d type "Add a discount code field to the checkout and cover it with tests" --enter
pnpm -s app:drive eval "new Promise(r=>setTimeout(()=>r(1),7000))" > /dev/null   # let the scripted run delegate
d shot "$OUT/run-1440.png"
d resize 1920 1080; d shot "$OUT/run-1920.png"
d resize 1000 680;  d shot "$OUT/run-1000.png"
d resize 1440 900
echo "captured $OUT"
