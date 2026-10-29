'use strict';

let advancedExit = null;
try {
  advancedExit = require('./advanced_exit_strategies');
} catch (e) {
  console.warn('Advanced exit strategies module not available:', e.message);
}

/** Rolex v3 (BULL/BEAR MOM ELITE) — shared defaults, validation, and signal detection */
const V3_DEFAULTS = Object.freeze({
  bodyLen: 10,
  atrLen: 14,
  atrMult: 0.9,
  useVolume: true,
  volLen: 20,
  volMult: 1.6,
  emaTrendLen: 200,
  emaExitLen: 9,
  swingLen: 10,
  cooldownBars: 5,
  maxATRBody: 2.5,
  // Sacred Geometry Trailing
  trailingEnabled: false,
  trailingMethod: 'fibonacci',
  trailStartPct: 0.5,
  trailStepPct: 0.2,
  minTrailPct: 0.3,
  maxTrailPct: 2.0,
  fibonacciLevel: 0.618,
  phiExponent: 1,
  dynamicAcceleration: true,
  profitLockPct: 0.8,
  // Advanced Exit Strategies
  exitEnabled: false,
  exitMethod: 'multi_factor',
  useEmaExit: true,
  useVolatilityExit: true,
  useMomentumExit: true,
  useTimeExit: true,
  useSacredGeometryExit: false,
  atrExitMult: 1.5,
  atrExitLen: 14,
  volatilityThreshold: 0.02,
  rsiExitLen: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  momentumExitLen: 5,
  momentumThreshold: 0.5,
  maxBarsInTrade: 50,
  minBarsInTrade: 3,
  sacredExitMethod: 'fibonacci',
  fibonacciExitLevel: 0.618,
  phiExitExponent: 1,
  requireExitConfirmation: true,
  exitConfirmationBars: 2,
});

/** UI metadata — groups mirror TradingView-style indicator inputs */
const V3_PARAM_META = [
  { key: 'bodyLen', label: 'Body length', group: 'Momentum', type: 'int', min: 3, max: 50, step: 1, desc: 'SMA period for average candle body size' },
  { key: 'atrLen', label: 'ATR length', group: 'Momentum', type: 'int', min: 5, max: 50, step: 1, desc: 'ATR period for volatility expansion filter' },
  { key: 'atrMult', label: 'ATR multiplier', group: 'Momentum', type: 'float', min: 0.5, max: 3, step: 0.1, desc: 'Body must exceed ATR × this value' },
  { key: 'maxATRBody', label: 'Max ATR body', group: 'Momentum', type: 'float', min: 1, max: 5, step: 0.1, desc: 'Reject overextended bodies (body < ATR × this)' },
  { key: 'useVolume', label: 'Volume filter', group: 'Volume', type: 'bool', desc: 'Require volume spike on entry' },
  { key: 'volLen', label: 'Volume SMA', group: 'Volume', type: 'int', min: 5, max: 100, step: 1, desc: 'Average volume lookback' },
  { key: 'volMult', label: 'Volume multiplier', group: 'Volume', type: 'float', min: 1, max: 5, step: 0.1, desc: 'Volume must exceed avg × this' },
  { key: 'emaTrendLen', label: 'Trend EMA', group: 'Trend', type: 'int', min: 20, max: 400, step: 1, desc: 'Long-term trend filter (default 200)' },
  { key: 'emaExitLen', label: 'Exit EMA', group: 'Trend', type: 'int', min: 5, max: 100, step: 1, desc: 'EMA used for position exit' },
  { key: 'swingLen', label: 'Swing length', group: 'Structure', type: 'int', min: 3, max: 50, step: 1, desc: 'Structure break lookback (prior bar swing)' },
  { key: 'cooldownBars', label: 'Cooldown bars', group: 'Timing', type: 'int', min: 0, max: 30, step: 1, desc: 'Min bars between entry signals' },
  // Sacred Geometry Trailing
  { key: 'trailingEnabled', label: 'Enable trailing', group: 'Trailing', type: 'bool', desc: 'Enable sacred geometry trailing stop-loss' },
  { key: 'trailingMethod', label: 'Trailing method', group: 'Trailing', type: 'select', options: ['fibonacci', 'phi', 'seed_of_life', 'egg_of_life'], desc: 'Sacred geometry method for trailing' },
  { key: 'trailStartPct', label: 'Trail start %', group: 'Trailing', type: 'float', min: 0.1, max: 5, step: 0.1, desc: 'Start trailing after this profit %' },
  { key: 'trailStepPct', label: 'Trail step %', group: 'Trailing', type: 'float', min: 0.05, max: 2, step: 0.05, desc: 'Move SL every this profit %' },
  { key: 'minTrailPct', label: 'Min trail %', group: 'Trailing', type: 'float', min: 0.1, max: 5, step: 0.1, desc: 'Minimum trail distance from price' },
  { key: 'maxTrailPct', label: 'Max trail %', group: 'Trailing', type: 'float', min: 0.5, max: 20, step: 0.5, desc: 'Maximum trail distance from price' },
  { key: 'fibonacciLevel', label: 'Fibonacci level', group: 'Trailing', type: 'select', options: [0.236, 0.382, 0.5, 0.618, 0.786], desc: 'Fibonacci retracement level for trailing' },
  { key: 'phiExponent', label: 'Phi exponent', group: 'Trailing', type: 'int', min: 1, max: 5, step: 1, desc: 'Phi power for progression (1-5)' },
  { key: 'dynamicAcceleration', label: 'Dynamic acceleration', group: 'Trailing', type: 'bool', desc: 'Accelerate trailing as profit grows' },
  { key: 'profitLockPct', label: 'Profit lock %', group: 'Trailing', type: 'float', min: 0.5, max: 1, step: 0.05, desc: 'Lock in this % of max profit at peak' },
  // Advanced Exit Strategies
  { key: 'exitEnabled', label: 'Enable advanced exit', group: 'Exit', type: 'bool', desc: 'Enable advanced multi-factor exit system' },
  { key: 'exitMethod', label: 'Exit method', group: 'Exit', type: 'select', options: ['ema', 'multi_factor', 'volatility', 'momentum', 'sacred_geometry'], desc: 'Exit strategy method' },
  { key: 'useEmaExit', label: 'Use EMA exit', group: 'Exit', type: 'bool', desc: 'Include EMA crossover in exit signals' },
  { key: 'useVolatilityExit', label: 'Use volatility exit', group: 'Exit', type: 'bool', desc: 'Include ATR-based volatility stop' },
  { key: 'useMomentumExit', label: 'Use momentum exit', group: 'Exit', type: 'bool', desc: 'Include RSI momentum exhaustion' },
  { key: 'useTimeExit', label: 'Use time exit', group: 'Exit', type: 'bool', desc: 'Include maximum bars in trade limit' },
  { key: 'useSacredGeometryExit', label: 'Use sacred geometry exit', group: 'Exit', type: 'bool', desc: 'Include sacred geometry pattern exits' },
  { key: 'atrExitMult', label: 'ATR exit multiplier', group: 'Exit', type: 'float', min: 0.5, max: 5, step: 0.1, desc: 'ATR multiplier for volatility exit' },
  { key: 'atrExitLen', label: 'ATR exit length', group: 'Exit', type: 'int', min: 5, max: 50, step: 1, desc: 'ATR period for exit calculation' },
  { key: 'rsiExitLen', label: 'RSI exit length', group: 'Exit', type: 'int', min: 5, max: 30, step: 1, desc: 'RSI period for momentum exit' },
  { key: 'rsiOverbought', label: 'RSI overbought', group: 'Exit', type: 'int', min: 50, max: 90, step: 1, desc: 'RSI level for long exit (overbought)' },
  { key: 'rsiOversold', label: 'RSI oversold', group: 'Exit', type: 'int', min: 10, max: 50, step: 1, desc: 'RSI level for short exit (oversold)' },
  { key: 'maxBarsInTrade', label: 'Max bars in trade', group: 'Exit', type: 'int', min: 5, max: 200, step: 5, desc: 'Maximum bars to hold position' },
  { key: 'sacredExitMethod', label: 'Sacred exit method', group: 'Exit', type: 'select', options: ['fibonacci', 'phi'], desc: 'Sacred geometry method for exits' },
  { key: 'fibonacciExitLevel', label: 'Fibonacci exit level', group: 'Exit', type: 'select', options: [0.236, 0.382, 0.5, 0.618, 0.786], desc: 'Fibonacci level for exit target' },
  { key: 'requireExitConfirmation', label: 'Require confirmation', group: 'Exit', type: 'bool', desc: 'Require multiple signals before exit' },
];

const ROLEX_FEATURES = Object.freeze({
  standard: {
    customIndicators: true,
    saveSettings: true,
    applyToLiveBots: true,
    advancedChart: true,
  },
  premium: {
    customIndicators: true,
    saveSettings: true,
    applyToLiveBots: true,
    advancedChart: true,
  },
});

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function sanitizeParams(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = { ...V3_DEFAULTS };
  for (const m of V3_PARAM_META) {
    const raw = src[m.key];
    if (raw === undefined || raw === null) continue;
    if (m.type === 'bool') {
      out[m.key] = !!raw;
    } else if (m.type === 'int') {
      const v = parseInt(raw, 10);
      if (!Number.isNaN(v)) out[m.key] = clamp(v, m.min, m.max);
    } else if (m.type === 'float') {
      const v = parseFloat(raw);
      if (!Number.isNaN(v)) out[m.key] = clamp(v, m.min, m.max);
    } else if (m.type === 'select') {
      if (m.options && m.options.includes(raw)) {
        out[m.key] = raw;
      }
    }
  }
  return out;
}

function parseParamsJson(raw) {
  if (!raw) return { ...V3_DEFAULTS };
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return sanitizeParams(j);
  } catch {
    return { ...V3_DEFAULTS };
  }
}

function sma(arr, len) {
  const n = arr.length;
  const out = new Array(n).fill(null);
  if (!len || len <= 0) return out;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += arr[i];
    if (i >= len) sum -= arr[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

function ema(arr, len) {
  const n = arr.length;
  const out = new Array(n).fill(null);
  if (!len || len <= 0 || n < len) return out;
  const k = 2 / (len + 1);
  let sum = 0;
  for (let i = 0; i < len; i++) sum += arr[i];
  out[len - 1] = sum / len;
  for (let i = len; i < n; i++) out[i] = arr[i] * k + out[i - 1] * (1 - k);
  return out;
}

function atr(candles, len) {
  const n = candles.length;
  const out = new Array(n).fill(null);
  if (n <= len) return out;
  const tr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    tr[i] = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  let sum = 0;
  for (let i = 1; i <= len; i++) sum += tr[i];
  out[len] = sum / len;
  for (let i = len + 1; i < n; i++) out[i] = (out[i - 1] * (len - 1) + tr[i]) / len;
  return out;
}

/** Pine ta.highest(high, len)[1] — prior bar's swing high excluding current bar */
function swingHighPrior(high, len) {
  const n = high.length;
  const out = new Array(n).fill(null);
  if (!len || len <= 0) return out;
  for (let i = 1; i < n; i++) {
    if (i < len) continue;
    let mx = -Infinity;
    for (let j = i - len; j < i; j++) mx = Math.max(mx, high[j]);
    out[i] = mx;
  }
  return out;
}

/** Pine ta.lowest(low, len)[1] */
function swingLowPrior(low, len) {
  const n = low.length;
  const out = new Array(n).fill(null);
  if (!len || len <= 0) return out;
  for (let i = 1; i < n; i++) {
    if (i < len) continue;
    let mn = Infinity;
    for (let j = i - len; j < i; j++) mn = Math.min(mn, low[j]);
    out[i] = mn;
  }
  return out;
}

function computeStats(entries, exitIdxs, viewStart = 0) {
  const inView = entries.filter(e => e.i >= viewStart);
  const exitsInView = [...exitIdxs].filter(i => i >= viewStart).length;
  const bulls = inView.filter(e => e.dir === 'bullish').length;
  const bears = inView.filter(e => e.dir === 'bearish').length;
  return {
    entries: inView.length,
    exits: exitsInView,
    bulls,
    bears,
    total: inView.length + exitsInView,
  };
}

/**
 * Detect v3 entries + exit indices on candle array.
 * Entries only fire when flat (state === 0). Exits use EMA even if other filters unavailable.
 */
function detectV3(candles, rawParams) {
  const P = sanitizeParams(rawParams);
  const n = candles.length;
  const entries = [];
  const exitIdxs = new Set();

  if (n < 10) {
    return { entries, exitIdxs, emaTrend: [], emaExit: [], params: P, stats: computeStats([], exitIdxs) };
  }

  const open = candles.map(c => c.open);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const close = candles.map(c => c.close);
  const volume = candles.map(c => c.volume);

  const bodySize = close.map((cl, i) => Math.abs(cl - open[i]));
  const avgBody = sma(bodySize, P.bodyLen);
  const atrArr = atr(candles, P.atrLen);
  const avgVol = sma(volume, P.volLen);
  const emaT = ema(close, P.emaTrendLen);
  const emaE = ema(close, P.emaExitLen);
  const swingH = swingHighPrior(high, P.swingLen);
  const swingL = swingLowPrior(low, P.swingLen);

  let lastSignalIdx = null;
  let state = 0; // 0 flat, 1 bull, -1 bear
  let entryPrice = null;
  let barsInTrade = 0;

  for (let i = 0; i < n; i++) {
    const prevState = state;
    const exitE = emaE[i];

    // Advanced exit system or traditional EMA exit
    let exitBull = false;
    let exitBear = false;

    if (P.exitEnabled && advancedExit) {
      // Use advanced multi-factor exit system
      const exitConfig = {
        enabled: true,
        method: P.exitMethod,
        emaExitLen: P.emaExitLen,
        useEmaExit: P.useEmaExit,
        useVolatilityExit: P.useVolatilityExit,
        useMomentumExit: P.useMomentumExit,
        useTimeExit: P.useTimeExit,
        useSacredGeometryExit: P.useSacredGeometryExit,
        atrExitMult: P.atrExitMult,
        atrExitLen: P.atrExitLen,
        rsiExitLen: P.rsiExitLen,
        rsiOverbought: P.rsiOverbought,
        rsiOversold: P.rsiOversold,
        maxBarsInTrade: P.maxBarsInTrade,
        sacredExitMethod: P.sacredExitMethod,
        fibonacciExitLevel: P.fibonacciExitLevel,
        phiExitExponent: P.phiExitExponent,
        requireExitConfirmation: P.requireExitConfirmation,
        exitConfirmationBars: P.exitConfirmationBars,
      };

      if (prevState === 1 && entryPrice != null) {
        const exitResult = advancedExit.calculateExit(candles, i, true, entryPrice, barsInTrade, exitConfig);
        exitBull = exitResult.shouldExit;
      } else if (prevState === -1 && entryPrice != null) {
        const exitResult = advancedExit.calculateExit(candles, i, false, entryPrice, barsInTrade, exitConfig);
        exitBear = exitResult.shouldExit;
      }
    } else {
      // Traditional EMA exit
      exitBull = prevState === 1 && exitE != null && close[i] < exitE;
      exitBear = prevState === -1 && exitE != null && close[i] > exitE;
    }

    const cooldownPassed = lastSignalIdx == null || i - lastSignalIdx >= P.cooldownBars;
    const haveAll = (
      bodySize[i] != null && atrArr[i] != null && avgVol[i] != null &&
      emaT[i] != null && exitE != null &&
      swingH[i] != null && swingL[i] != null &&
      avgBody[i] != null
    );

    let bullEntry = false;
    let bearEntry = false;

    // Entries only when flat — prevents stacked duplicate signals
    if (state === 0 && haveAll && cooldownPassed) {
      const bs = bodySize[i];
      const a = atrArr[i];
      const av = avgVol[i];
      const trend = emaT[i];
      const sbH = swingH[i];
      const sbL = swingL[i];
      const bullCandle = close[i] > open[i];
      const bearCandle = close[i] < open[i];
      const largeBody = bs > avgBody[i];
      const atrExpansion = bs > a * P.atrMult;
      const notOverextended = bs < a * P.maxATRBody;
      const volumeFilter = P.useVolume ? volume[i] > av * P.volMult : true;
      const bullTrend = close[i] > trend;
      const bearTrend = close[i] < trend;
      const bullBreak = close[i] > sbH;
      const bearBreak = close[i] < sbL;

      bullEntry = bullTrend && bullBreak && bullCandle && largeBody && atrExpansion && notOverextended && volumeFilter;
      bearEntry = bearTrend && bearBreak && bearCandle && largeBody && atrExpansion && notOverextended && volumeFilter;
    }

    if (bullEntry) {
      lastSignalIdx = i;
      state = 1;
      entryPrice = close[i];
      barsInTrade = 0;
      entries.push({ i, dir: 'bullish' });
    } else if (bearEntry) {
      lastSignalIdx = i;
      state = -1;
      entryPrice = close[i];
      barsInTrade = 0;
      entries.push({ i, dir: 'bearish' });
    } else if (exitBull || exitBear) {
      state = 0;
      entryPrice = null;
      barsInTrade = 0;
    }

    if ((prevState === 1 || prevState === -1) && state === 0) {
      exitIdxs.add(i);
    }

    // Increment bars in trade counter
    if (state !== 0) {
      barsInTrade++;
    }
  }

  return {
    entries,
    exitIdxs,
    emaTrend: emaT,
    emaExit: emaE,
    params: P,
    stats: computeStats(entries, exitIdxs),
  };
}

const RolexV3Exports = {
  V3_DEFAULTS,
  V3_PARAM_META,
  ROLEX_FEATURES,
  sanitizeParams,
  parseParamsJson,
  detectV3,
  computeStats,
  atr,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RolexV3Exports;
}
if (typeof window !== 'undefined') {
  window.RolexV3 = RolexV3Exports;
}
