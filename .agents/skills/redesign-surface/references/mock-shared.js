// Mock only: shared pieces of the two workspace concepts. Sample content is invented for the mock.
const ic = (n) => `<i class="ph ph-${n}"></i>`;
const M = {
  titlebar: (narrow) => `<div class="titlebar"><div class="brand"><span class="ring"></span>Rotaris <span class="mono t3">0.1.0rc3</span></div>
    <div class="chip">${ic('folder')}<span class="mono t2">~/code/webshop</span><span class="t3">·</span><span>${narrow ? 'New session' : 'Add a discount code field to the checkout'}</span></div>
    <div class="win"><span style="color:var(--accent-200)">Sessions</span>${ic('minus')}${ic('square')}${ic('x')}</div></div>`,
  rail: () => `<div class="rail"><div class="sq">${ic('plus')}</div><div class="sq">${ic('stack')}</div>
    <div class="nav on">${ic('chats')}Workspace</div><div class="nav">${ic('squares-four')}Overview</div><hr>
    <div class="nav">${ic('list-checks')}Requirements</div><div class="nav">${ic('git-branch')}Git</div><div class="nav">${ic('books')}Library</div>
    <div class="grow"></div><div class="nav">${ic('gear')}Settings</div></div>`,
  strip: (narrow) => `<div class="strip"><span class="path">~/code/webshop</span><span class="mono t3">${ic('git-branch')} feat/discount-code</span><span class="grow"></span>
    ${narrow ? '' : '<span>● CB armed</span><span>redaction: always on</span><span>workspace-scoped</span>'}<span>mode: ask</span><span style="color:var(--text)">model: sonnet-5-5</span><span class="mono">48.2k tok</span><span class="mono">$0.61</span></div>`,
  rows: () => `
    <div class="row you"><div class="who"><b>You</b><span>14:02:11</span></div><div class="say">Add a discount code field to the checkout and cover it with tests.</div></div>
    <div class="row orch"><div class="who"><b>Orchestrator</b><span>14:02:13</span></div><div class="say">
      <div>The checkout form and the pricing service are separate packages, so I am splitting this in three: map how prices are computed, add the API, then the field.</div>
      <div class="tool"><span class="caret">▶</span><span class="v">Plans 4 tasks, delegates 3 agents</span><span class="grow"></span><span class="res">4 calls · ok · 0.4s</span></div></div></div>
    <div class="row ana"><div class="who"><b>pricing-map</b><span>14:02:58</span></div><div class="say">
      <div class="tool"><span class="caret">▶</span><span class="v">Reads 11 files in packages/pricing</span><span class="grow"></span><span class="res">11 calls · ok · 6.2s</span></div>
      <div>Totals are computed in <code class="mono">applyAdjustments()</code>; a discount belongs there as one more adjustment, before tax.</div></div></div>
    <div class="row code"><div class="who"><b>checkout-form</b><span>14:04:20</span></div><div class="say">
      <div class="tool"><span class="caret">▶</span><span class="v">Edits src/checkout/DiscountField.tsx</span><span class="grow"></span><span class="res">ok · 1.2s</span></div>
      <div class="diff"><div class="hd"><span>src/checkout/DiscountField.tsx</span><span class="grow"></span><span class="add">+42</span><span class="del">−3</span></div>
<pre><span>   export function CheckoutSummary({ cart }: Props) {</span><span class="d">-    const total = priceOf(cart);</span><span class="a">+    const [code, setCode] = useState('');</span><span class="a">+    const total = priceOf(cart, { discount: code });</span></pre></div></div></div>`,
  ask: () => `<div class="ask">${ic('shield-warning')}<div class="grow"><b style="font-weight:600">discount-api asks to run a command</b><div class="t2"><code>pnpm test --filter @webshop/pricing</code></div></div>
      <span class="btn">Deny</span><span class="btn sec">Review</span></div>`,
  composer: (o = {}) => `<div class="dock"><div class="field">${o.idle ? 'Describe the outcome you want…' : 'Run active — write a follow-up for the next iteration…'}</div>
    <div class="tools">${ic('paperclip')}<span class="chip">${ic('user-circle')}orchestrator ${ic('caret-down')}</span><span class="chip">${ic('cpu')}sonnet-5-5 ${ic('caret-down')}</span><span class="sep"></span>
      ${o.narrow ? `${ic('brain')}&nbsp;&nbsp;${ic('play-circle')}&nbsp;&nbsp;${ic('shield-check')}` : `<span class="chip">${ic('brain')}Medium</span><span class="chip">${ic('play-circle')}Auto</span><span class="chip">${ic('shield-check')}ask</span>`}
      &nbsp;${ic('microphone')}&nbsp;&nbsp;${ic('push-pin')}<span class="grow"></span><span class="mono t3">~0 tok</span>&nbsp;
      ${o.idle ? `<span class="btn pri">Run ${ic('arrow-up')}</span>` : `<span class="btn icon">${ic('compass')}</span><span class="btn icon">${ic('pause')}</span><span class="btn danger">Stop run</span><span class="btn pri">Queue ${ic('arrow-up')}</span>`}</div></div>`,
  agents: (sel) => [
    ['run', 'orchestrator', '', 'running · 4:12', 0], ['run', 'coding-agent', 'checkout-form', 'running · 2:40', 1],
    ['wait', 'coding-agent', 'discount-api', 'needs you · 1:05', 1], ['done', 'codebase-analyst', 'pricing-map', 'done · 0:58', 1],
  ].map(([s, p, n, st, c]) => `<div class="agent${c ? ' child' : ''}${n === sel ? ' sel' : ''}"><span class="dot ${s}"></span><div class="nm"><b>${n || p}</b>${n ? `<span>${p}</span>` : ''}</div><span class="st">${st}</span></div>`).join(''),
  plan: () => `<ul class="plan"><li class="ok">${ic('check')}<s>Map how prices are computed</s></li><li class="now">${ic('circle-notch')}Add discount adjustment to the pricing API</li>
    <li class="now">${ic('circle-notch')}Add the discount field to the checkout form</li><li class="todo">${ic('circle')}Cover both with tests</li></ul>`,
  detail: () => `<dl class="facts"><dt>State</dt><dd><span class="tag wait"><span class="dot wait"></span>Waiting for approval</span></dd>
      <dt>Elapsed</dt><dd class="mono">1m 05s · 9 tool calls</dd><dt>Context</dt><dd class="mono">18,400 of 265,000 · 7%</dd>
      <dt>Model</dt><dd><span class="sel">sonnet-5-5 ${ic('caret-down')}</span></dd><dt>Reasoning</dt><dd><span class="sel">medium ${ic('caret-down')}</span></dd></dl>
    <div><div class="label" style="margin-bottom:5px">Tools used · 4 of 11</div><div class="chips"><span>read_file</span><span>grep</span><span>edit_file</span><span>terminal</span></div></div>
    <div><div class="label" style="margin-bottom:5px">Artifacts</div><div class="t2" style="font-size:12px">${ic('file-text')} pricing-notes.md <span class="t3">received from pricing-map</span></div></div>
    <div style="display:flex;gap:6px"><span class="btn sec">Steer</span><span class="btn danger">Cancel</span><span class="btn sec">Pop out</span></div>`,
  empty: () => `<div class="empty"><b>No transcript yet</b><span class="t2">Describe the outcome you want. Rotaris will show agent activity and results here.</span></div>`,
};
const frame = (w, h, narrow, inner) => `<div class="frame" style="width:${w}px;height:${h}px">${M.titlebar(narrow)}<div class="body">${M.rail()}${inner}</div>${M.strip(narrow)}</div>`;
const pick = (frames) => { const f = new URLSearchParams(location.search).get('f') ?? '1'; document.body.innerHTML = frames[f](); };
// The pages that load this file call these three by name.
Object.assign(globalThis, { M, frame, pick });
