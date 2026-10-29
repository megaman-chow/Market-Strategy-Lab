'use strict';

/** Advanced Exit Strategies
 * 
 * Implements sophisticated exit mechanisms beyond simple EMA crossover:
 * - Multi-factor exit system (volatility, momentum, time, sacred geometry)
 * - Adaptive exits based on market conditions
 * - Sacred geometry exit patterns (Fibonacci, Phi, Seed of Life)
 * - Volatility-based trailing exits
 * - Momentum exhaustion exits
 * - Time-based exits
 */

// ═══════════════════════════════════════════════════════════
//  DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════

const EXIT_DEFAULTS = Object.freeze({
  enabled: true,
  method: 'multi_factor', // 'ema', 'multi_factor', 'sacred_geometry', 'volatility', 'momentum'
  emaExitLen: 9,
  
  // Multi-factor exit
  useEmaExit: true,
  useVolatilityExit: true,
  useMomentumExit: true,
  useTimeExit: true,
  useSacredGeometryExit: false,
  
  // Volatility exit
  atrExitMult: 1.5,
  atrExitLen: 14,
  volatilityThreshold: 0.02, // 2% change triggers exit
  
  // Momentum exit
  rsiExitLen: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  momentumExitLen: 5,
  momentumThreshold: 0.5, // % change in momentum
  
  // Time exit
  maxBarsInTrade: 50,
  minBarsInTrade: 3,
  
  // Sacred geometry exit
  sacredExitMethod: 'fibonacci', // 'fibonacci', 'phi', 'seed_of_life'
  fibonacciExitLevel: 0.618,
  phiExitExponent: 1,
  
  // Exit confirmation
  requireConfirmation: true,
  confirmationBars: 2,
});

// ═══════════════════════════════════════════════════════════
//  EMA EXIT (Original)
// ═══════════════════════════════════════════════════════════

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

function checkEmaExit(candles, i, isLong, emaExitLen) {
  if (i < emaExitLen) return false;
  
  const close = candles.map(c => c.close);
  const emaE = ema(close, emaExitLen);
  
  if (isLong) {
    return close[i] < emaE[i];
  } else {
    return close[i] > emaE[i];
  }
}

// ═══════════════════════════════════════════════════════════
//  VOLATILITY-BASED EXIT
// ═══════════════════════════════════════════════════════════

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

function checkVolatilityExit(candles, i, isLong, entryPrice, config) {
  if (i < config.atrExitLen) return false;
  
  const atrArr = atr(candles, config.atrExitLen);
  const currentAtr = atrArr[i];
  const close = candles[i].close;
  
  // Exit if price moves against position by ATR multiple
  const atrDistance = currentAtr * config.atrExitMult;
  
  if (isLong) {
    return close < entryPrice - atrDistance;
  } else {
    return close > entryPrice + atrDistance;
  }
}

// ═══════════════════════════════════════════════════════════
//  MOMENTUM EXHAUSTION EXIT
// ═══════════════════════════════════════════════════════════

function rsi(closes, len) {
  const n = closes.length;
  const out = new Array(n).fill(null);
  if (n <= len) return out;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= len; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  let avgGain = gains / len;
  let avgLoss = losses / len;
  
  // Prevent division by zero
  if (avgLoss === 0) {
    out[len] = 100;
  } else {
    out[len] = 100 - (100 / (1 + avgGain / avgLoss));
  }
  
  for (let i = len + 1; i < n; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    
    avgGain = (avgGain * (len - 1) + gain) / len;
    avgLoss = (avgLoss * (len - 1) + loss) / len;
    
    // Prevent division by zero
    if (avgLoss === 0) {
      out[i] = 100;
    } else {
      out[i] = 100 - (100 / (1 + avgGain / avgLoss));
    }
  }
  
  return out;
}

function checkMomentumExit(candles, i, isLong, config) {
  if (i < config.rsiExitLen) return false;
  
  const close = candles.map(c => c.close);
  const rsiArr = rsi(close, config.rsiExitLen);
  const currentRsi = rsiArr[i];
  
  // Exit if momentum is exhausted
  if (isLong) {
    return currentRsi >= config.rsiOverbought;
  } else {
    return currentRsi <= config.rsiOversold;
  }
}

// ═══════════════════════════════════════════════════════════
//  TIME-BASED EXIT
// ═══════════════════════════════════════════════════════════

function checkTimeExit(barsInTrade, config) {
  return barsInTrade >= config.maxBarsInTrade;
}

// ═══════════════════════════════════════════════════════════
//  SACRED GEOMETRY EXIT
// ═══════════════════════════════════════════════════════════

const PHI = 1.618033988749895;
const FIBONACCI_LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786];

function checkSacredGeometryExit(candles, i, isLong, entryPrice, config) {
  const close = candles[i].close;
  const priceChange = isLong ? (close - entryPrice) : (entryPrice - close);
  const entryMove = isLong ? entryPrice : (entryPrice * 2 - close); // Approximation
  
  if (priceChange <= 0) return false; // No profit yet
  
  const profitPct = priceChange / entryPrice;
  
  switch (config.sacredExitMethod) {
    case 'fibonacci':
      // Exit at Fibonacci retracement of profit
      const targetPct = profitPct * config.fibonacciExitLevel;
      const currentPct = priceChange / entryPrice;
      return currentPct >= targetPct && currentPct < targetPct * 1.1;
      
    case 'phi':
      // Exit when price reaches Phi multiple of entry
      const phiTarget = entryPrice * Math.pow(PHI, config.phiExitExponent);
      if (isLong) {
        return close >= phiTarget * 0.95 && close <= phiTarget * 1.05;
      } else {
        return close <= phiTarget * 1.05 && close >= phiTarget * 0.95;
      }
      
    default:
      return false;
  }
}

// ═══════════════════════════════════════════════════════════
//  MULTI-FACTOR EXIT (Main Strategy)
// ═══════════════════════════════════════════════════════════

function checkMultiFactorExit(candles, i, isLong, entryPrice, barsInTrade, config) {
  let exitSignals = 0;
  let totalSignals = 0;
  const reasons = [];
  
  // EMA exit
  if (config.useEmaExit) {
    totalSignals++;
    if (checkEmaExit(candles, i, isLong, config.emaExitLen)) {
      exitSignals++;
      reasons.push('EMA crossover');
    }
  }
  
  // Volatility exit
  if (config.useVolatilityExit) {
    totalSignals++;
    if (checkVolatilityExit(candles, i, isLong, entryPrice, config)) {
      exitSignals++;
      reasons.push('Volatility stop');
    }
  }
  
  // Momentum exit
  if (config.useMomentumExit) {
    totalSignals++;
    if (checkMomentumExit(candles, i, isLong, config)) {
      exitSignals++;
      reasons.push('Momentum exhaustion');
    }
  }
  
  // Time exit
  if (config.useTimeExit) {
    totalSignals++;
    if (checkTimeExit(barsInTrade, config)) {
      exitSignals++;
      reasons.push('Time limit');
    }
  }
  
  // Sacred geometry exit
  if (config.useSacredGeometryExit) {
    totalSignals++;
    if (checkSacredGeometryExit(candles, i, isLong, entryPrice, config)) {
      exitSignals++;
      reasons.push('Sacred geometry target');
    }
  }
  
  // Exit if majority of signals agree (or if configured to require confirmation)
  const threshold = config.requireConfirmation ? Math.ceil(totalSignals * 0.6) : 1;
  
  return {
    shouldExit: exitSignals >= threshold,
    exitSignals,
    totalSignals,
    reasons,
  };
}

// ═══════════════════════════════════════════════════════════
//  MAIN EXIT CALCULATOR
// ═══════════════════════════════════════════════════════════

/**
 * Calculate exit signal based on configured method
 * @param {array} candles - Candle data
 * @param {number} i - Current candle index
 * @param {boolean} isLong - True for long position, false for short
 * @param {number} entryPrice - Entry price of the position
 * @param {number} barsInTrade - Number of bars since entry
 * @param {object} config - Exit configuration
 * @returns {object} Exit signal info
 */
function calculateExit(candles, i, isLong, entryPrice, barsInTrade, config = {}) {
  // Safety checks
  if (!candles || !Array.isArray(candles) || candles.length === 0) {
    return { shouldExit: false, method: 'disabled', reason: 'Invalid candles data' };
  }
  
  if (i < 0 || i >= candles.length) {
    return { shouldExit: false, method: 'disabled', reason: 'Invalid index' };
  }
  
  if (!entryPrice || entryPrice <= 0) {
    return { shouldExit: false, method: 'disabled', reason: 'Invalid entry price' };
  }
  
  const mergedConfig = { ...EXIT_DEFAULTS, ...config };
  
  if (!mergedConfig.enabled) {
    return { shouldExit: false, method: 'disabled' };
  }
  
  try {
    switch (mergedConfig.method) {
      case 'ema':
        return {
          shouldExit: checkEmaExit(candles, i, isLong, mergedConfig.emaExitLen),
          method: 'ema',
          reason: 'EMA crossover',
        };
        
      case 'multi_factor':
        const multiResult = checkMultiFactorExit(candles, i, isLong, entryPrice, barsInTrade, mergedConfig);
        return {
          shouldExit: multiResult.shouldExit,
          method: 'multi_factor',
          reason: multiResult.reasons.join(', '),
          details: multiResult,
        };
        
      case 'volatility':
        return {
          shouldExit: checkVolatilityExit(candles, i, isLong, entryPrice, mergedConfig),
          method: 'volatility',
          reason: 'Volatility stop',
        };
        
      case 'momentum':
        return {
          shouldExit: checkMomentumExit(candles, i, isLong, mergedConfig),
          method: 'momentum',
          reason: 'Momentum exhaustion',
        };
        
      case 'sacred_geometry':
        return {
          shouldExit: checkSacredGeometryExit(candles, i, isLong, entryPrice, mergedConfig),
          method: 'sacred_geometry',
          reason: 'Sacred geometry target',
        };
        
      default:
        return {
          shouldExit: checkEmaExit(candles, i, isLong, mergedConfig.emaExitLen),
          method: 'ema',
          reason: 'EMA crossover (default)',
        };
    }
  } catch (error) {
    console.error('Error in calculateExit:', error.message);
    return { shouldExit: false, method: 'error', reason: 'Calculation error' };
  }
}

// ═══════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════

function getMethodDescription(method) {
  const descriptions = {
    ema: 'EMA Crossover - Simple moving average crossover exit',
    multi_factor: 'Multi-Factor - Combines EMA, volatility, momentum, time, and sacred geometry',
    volatility: 'Volatility Stop - ATR-based volatility exit',
    momentum: 'Momentum Exhaustion - RSI-based momentum exit',
    sacred_geometry: 'Sacred Geometry - Fibonacci/Phi pattern-based exits',
  };
  return descriptions[method] || descriptions.ema;
}

function getAvailableMethods() {
  return ['ema', 'multi_factor', 'volatility', 'momentum', 'sacred_geometry'];
}

function validateConfig(config) {
  const errors = [];
  
  if (config.emaExitLen < 3 || config.emaExitLen > 50) {
    errors.push('emaExitLen must be between 3 and 50');
  }
  if (config.atrExitLen < 5 || config.atrExitLen > 50) {
    errors.push('atrExitLen must be between 5 and 50');
  }
  if (config.atrExitMult < 0.5 || config.atrExitMult > 5) {
    errors.push('atrExitMult must be between 0.5 and 5');
  }
  if (config.rsiExitLen < 5 || config.rsiExitLen > 30) {
    errors.push('rsiExitLen must be between 5 and 30');
  }
  if (config.rsiOverbought < 50 || config.rsiOverbought > 90) {
    errors.push('rsiOverbought must be between 50 and 90');
  }
  if (config.rsiOversold < 10 || config.rsiOversold > 50) {
    errors.push('rsiOversold must be between 10 and 50');
  }
  if (config.maxBarsInTrade < 5 || config.maxBarsInTrade > 200) {
    errors.push('maxBarsInTrade must be between 5 and 200');
  }
  if (!getAvailableMethods().includes(config.method)) {
    errors.push(`Invalid method: ${config.method}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  EXIT_DEFAULTS,
  calculateExit,
  getMethodDescription,
  getAvailableMethods,
  validateConfig,
  checkEmaExit,
  checkVolatilityExit,
  checkMomentumExit,
  checkTimeExit,
  checkSacredGeometryExit,
  checkMultiFactorExit,
  PHI,
  FIBONACCI_LEVELS,
};
