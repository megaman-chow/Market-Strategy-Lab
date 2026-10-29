'use strict';

const assert = require('node:assert/strict');

const {
  computeV4Features,
  detectV4Signals
} = require('./v4_market_adapter');

const candles = [];

let close = 100;

for (let i = 0; i < 180; i += 1) {
  close += 0.9 + Math.sin(i / 7) * 0.05;

  const open = close - 0.25;
  const high = Math.max(open, close) + 0.3;
  const low = Math.min(open, close) - 0.3;

  candles.push({
    open,
    high,
    low,
    close,

    volume: 1000 + (i % 13) * 75,

    atr: 0.8,
    ema20: close - 1,
    ema50: close - 5,
    rsi: 55,
    volma: 1200
  });
}

const features = computeV4Features(
  candles,
  100,
  { structureLookback: 12 }
);

assert.ok(
  features,
  'Features should be computed'
);

assert.ok(
  Number.isFinite(features.score),
  'Score must be finite'
);

assert.ok(
  features.score >= -1 &&
  features.score <= 1,
  'Score must remain between -1 and 1'
);

const signals = detectV4Signals(
  candles,
  {
    minScore: 0.42,
    structureLookback: 12
  }
);

assert.ok(
  Array.isArray(signals),
  'Signals must be an array'
);

assert.ok(
  signals.length > 0,
  'Synthetic trend should generate signals'
);

for (const signal of signals) {
  assert.ok(
    signal.i >= 50 &&
    signal.i < candles.length,
    'Signal index must be valid'
  );

  assert.ok(
    ['bullish', 'bearish'].includes(
      signal.direction
    ),
    'Signal direction must be valid'
  );

  assert.ok(
    Number.isFinite(signal.v4Score),
    'Signal score must be finite'
  );
}

console.log(
  `V4 adapter self-test passed: ${signals.length} signals.`
);
