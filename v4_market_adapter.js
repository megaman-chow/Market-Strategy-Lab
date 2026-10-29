
// v4_market_adapter.js
'use strict';

/**
 * V4 Market-Model Adapter for Strategy Lab
 *
 * Experimental market signals inspired by interacting fields,
 * market state, momentum, acceleration and structure.
 *
 * IMPORTANT:
 * This is an experimental market model, NOT a direct mathematical
 * consequence of the V4 Unified Field Theory.
 *
 * Required candle fields:
 * open, high, low, close, volume
 *
 * Required indicators:
 * ema20, ema50, rsi, atr, volma
 *
 * Exports:
 * computeV4Features(candles, index, options)
 * detectV4Signals(candles, options)
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function tanh(value) {
  return Math.tanh(clamp(value, -20, 20));
}

/**
 * Calculate the V4-inspired market state at a given candle.
 *
 * Only candles at indices <= index are used.
 * Future candles are never accessed.
 */
function computeV4Features(candles, index, options = {}) {
  const lookback = Math.max(
    3,
    Math.floor(options.structureLookback ?? 12)
  );

  if (
    !Array.isArray(candles) ||
    !Number.isInteger(index) ||
    index < lookback ||
    index >= candles.length
  ) {
    return null;
  }

  const candle = candles[index];
  const previous = candles[index - 1];
  const previous2 = candles[index - 2];

  if (!candle || !previous || !previous2) {
    return null;
  }

  const close = safeNumber(candle.close, NaN);
  const open = safeNumber(candle.open, NaN);
  const high = safeNumber(candle.high, NaN);
  const low = safeNumber(candle.low, NaN);

  const previousClose = safeNumber(
    previous.close,
    NaN
  );

  const previous2Close = safeNumber(
    previous2.close,
    NaN
  );

  if (
    ![
      close,
      open,
      high,
      low,
      previousClose,
      previous2Close
    ].every(Number.isFinite)
  ) {
    return null;
  }

  if (
    close <= 0 ||
    previousClose <= 0 ||
    previous2Close <= 0 ||
    high < low ||
    open <= 0
  ) {
    return null;
  }

  const atr = safeNumber(candle.atr, 0);

  const atrFraction = atr > 0
    ? atr / close
    : 0;

  const ema20 = safeNumber(candle.ema20, NaN);
  const ema50 = safeNumber(candle.ema50, NaN);
  const rsi = safeNumber(candle.rsi, NaN);

  const volume = Math.max(
    0,
    safeNumber(candle.volume, 0)
  );

  const volumeMA = safeNumber(candle.volma, 0);

  // Require valid indicators before generating a signal.
  if (
    !(atrFraction > 0) ||
    !Number.isFinite(ema20) ||
    !Number.isFinite(ema50) ||
    !Number.isFinite(rsi)
  ) {
    return null;
  }

  // ----------------------------------------------------------
  // 1. MARKET VELOCITY AND ACCELERATION
  // ----------------------------------------------------------

  const logReturn = Math.log(
    close / previousClose
  );

  const previousLogReturn = Math.log(
    previousClose / previous2Close
  );

  const velocity = logReturn / atrFraction;

  const acceleration =
    (logReturn - previousLogReturn) /
    atrFraction;

  // ----------------------------------------------------------
  // 2. NORMALIZED MARKET FIELDS
  // ----------------------------------------------------------

  const trendField = tanh(
    (ema20 - ema50) /
    Math.max(atr, close * 0.0001)
  );

  const momentumField = tanh(
    velocity / 0.9
  );

  const accelerationField = tanh(
    acceleration / 0.8
  );

  // ----------------------------------------------------------
  // 3. CANDLE PRESSURE AND VOLUME
  // ----------------------------------------------------------

  const range = Math.max(
    high - low,
    close * 1e-8
  );

  const closeLocation = clamp(
    (2 * close - high - low) / range,
    -1,
    1
  );

  let volumeActivity = 0;

  if (volumeMA > 0) {
    volumeActivity = clamp(
      (volume / volumeMA - 1) / 1.5,
      -1,
      1
    );
  }

  const volumePressure =
    volumeActivity * closeLocation;

  // ----------------------------------------------------------
  // 4. MARKET STRUCTURE AND SWEEP DETECTION
  // ----------------------------------------------------------

  // The current candle is excluded from the reference range.
  const first = Math.max(
    0,
    index - lookback
  );

  let priorHigh = -Infinity;
  let priorLow = Infinity;

  for (let j = first; j < index; j += 1) {
    priorHigh = Math.max(
      priorHigh,
      safeNumber(candles[j].high, -Infinity)
    );

    priorLow = Math.min(
      priorLow,
      safeNumber(candles[j].low, Infinity)
    );
  }

  const sweptHigh =
    Number.isFinite(priorHigh) &&
    high > priorHigh &&
    close < priorHigh;

  const sweptLow =
    Number.isFinite(priorLow) &&
    low < priorLow &&
    close > priorLow;

  let structureField = 0;

  if (sweptLow && !sweptHigh) {
    structureField = 1;
  } else if (sweptHigh && !sweptLow) {
    structureField = -1;
  }

  // ----------------------------------------------------------
  // 5. COMBINED MARKET-STATE SCORE
  // ----------------------------------------------------------

  // Initial research weights. These have not been optimized
  // or validated for predictive performance.
  const score = clamp(
    0.30 * trendField +
    0.25 * momentumField +
    0.15 * accelerationField +
    0.15 * volumePressure +
    0.15 * structureField,
    -1,
    1
  );

  return {
    index,
    close,
    atr,
    rsi,

    velocity,
    acceleration,

    trendField,
    momentumField,
    accelerationField,

    volumeActivity,
    volumePressure,

    structureField,
    sweptHigh,
    sweptLow,

    score,
    confidence: Math.abs(score)
  };
}

/**
 * Generate bullish and bearish V4-inspired signals.
 *
 * Signal index i identifies the candle on which the signal
 * was calculated. The manager's trade simulator should enter
 * no earlier than the next candle.
 */
function detectV4Signals(candles, options = {}) {
  if (
    !Array.isArray(candles) ||
    candles.length < 60
  ) {
    return [];
  }

  const minScore = clamp(
    safeNumber(options.minScore, 0.42),
    0.1,
    0.95
  );

  const minRsi = safeNumber(
    options.minRsi,
    20
  );

  const maxRsi = safeNumber(
    options.maxRsi,
    80
  );

  const signals = [];

  // The indicator warm-up period is 50 candles.
  for (let i = 50; i < candles.length; i += 1) {
    const features = computeV4Features(
      candles,
      i,
      options
    );

    if (!features) {
      continue;
    }

    let direction = null;

    if (
      features.score >= minScore &&
      features.rsi >= minRsi &&
      features.rsi <= maxRsi
    ) {
      direction = 'bullish';
    } else if (
      features.score <= -minScore &&
      features.rsi >= minRsi &&
      features.rsi <= maxRsi
    ) {
      direction = 'bearish';
    }

    if (!direction) {
      continue;
    }

    signals.push({
      i,
      direction,

      confidence: features.confidence,
      v4Score: features.score,

      v4Features: {
        trend: features.trendField,
        momentum: features.momentumField,
        acceleration: features.accelerationField,
        volumePressure: features.volumePressure,
        structure: features.structureField,
        rsi: features.rsi
      }
    });
  }

  return signals;
}

module.exports = {
  computeV4Features,
  detectV4Signals
};
