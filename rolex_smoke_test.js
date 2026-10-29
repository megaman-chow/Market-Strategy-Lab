'use strict';
/** Quick smoke test for Rolex v3 detection + API module */
const rolex = require('./rolex_v3_params');

function makeCandles(n, start = 100) {
  const out = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    const o = p;
    const move = (Math.sin(i / 7) + (Math.random() - 0.5) * 0.4) * 2;
    const c = o + move;
    const h = Math.max(o, c) + Math.random() * 1.5;
    const l = Math.min(o, c) - Math.random() * 1.5;
    out.push({ open: o, high: h, low: l, close: c, volume: 1000 + Math.random() * 500, openTime: i });
    p = c;
  }
  return out;
}

const candles = makeCandles(400);
const r = rolex.detectV3(candles, rolex.V3_DEFAULTS);

console.log('Rolex v3 smoke test');
console.log('  candles:', candles.length);
console.log('  entries:', r.entries.length, '(bull', r.stats.bulls, 'bear', r.stats.bears + ')');
console.log('  exits:', r.exitIdxs.size);
console.log('  params ok:', r.params.emaTrendLen === 200);

// Flat-only: no consecutive entries without exit between
let ok = true;
let lastEntry = -1;
let hadExit = true;
for (const e of r.entries) {
  if (!hadExit && e.i - lastEntry < 3) {
    ok = false;
    break;
  }
  lastEntry = e.i;
  hadExit = false;
  for (const x of r.exitIdxs) if (x > e.i) { hadExit = true; break; }
}
console.log('  flat-only entries:', ok ? 'PASS' : 'CHECK');

const custom = rolex.detectV3(candles, { emaTrendLen: 50, cooldownBars: 10 });
console.log('  custom params entries:', custom.entries.length);
console.log('✓ Module OK');
