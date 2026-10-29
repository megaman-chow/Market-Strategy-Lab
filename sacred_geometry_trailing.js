'use strict';

/** Sacred Geometry Trailing System
 * 
 * Implements advanced trailing stop-loss and take-profit mechanisms based on:
 * - Fibonacci retracement levels
 * - Phi (Golden Ratio) progression
 * - Seed of Life geometric patterns
 * - Egg of Life spiral dynamics
 * 
 * These sacred geometry patterns provide natural, harmonic progression for
 * dynamic trailing that adapts to market momentum while preserving profits.
 */

// ═══════════════════════════════════════════════════════════
//  SACRED GEOMETRY CONSTANTS
// ═══════════════════════════════════════════════════════════

const PHI = 1.618033988749895; // Golden ratio
const PHI_INVERSE = 0.618033988749895; // 1/PHI
const FIBONACCI = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987];
const FIBONACCI_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786]; // Key retracement levels

// Seed of Life: 6 circles around 1 center = 7 points
const SEED_OF_LIFE_ANGLES = [0, 60, 120, 180, 240, 300, 360]; // Degrees
const SEED_OF_LIFE_MULTIPLIERS = [1, 1.1547, 1.4142, 1.732, 2, 2.309, 2.6458]; // Radial distances

// Egg of Life: 8 spheres forming an egg shape
const EGG_OF_LIFE_STAGES = 8;
const EGG_OF_LIFE_GROWTH = [1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4]; // Growth factors

// ═══════════════════════════════════════════════════════════
//  DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════

const TRAILING_DEFAULTS = Object.freeze({
  enabled: true,
  method: 'fibonacci', // 'fibonacci', 'phi', 'seed_of_life', 'egg_of_life'
  trailStartPct: 0.5, // Start trailing after 0.5% profit
  trailStepPct: 0.2, // Move SL every 0.2% additional profit
  minTrailPct: 0.3, // Minimum trail distance from current price
  maxTrailPct: 2.0, // Maximum trail distance
  fibonacciLevel: 0.618, // Which Fibonacci level to use (0.236, 0.382, 0.5, 0.618, 0.786)
  phiExponent: 1, // Phi power for progression (1, 2, 3...)
  seedStage: 0, // Current Seed of Life stage (0-6)
  eggStage: 0, // Current Egg of Life stage (0-7)
  dynamicAcceleration: true, // Accelerate trailing as profit grows
  profitLockPct: 0.8, // Lock in 80% of max profit at peak
});

// ═══════════════════════════════════════════════════════════
//  FIBONACCI TRAILING
// ═══════════════════════════════════════════════════════════

/**
 * Calculate Fibonacci-based trailing stop
 * Uses Fibonacci retracement levels to determine optimal stop placement
 */
function fibonacciTrail(entryPrice, currentPrice, isLong, config) {
  const profitPct = isLong 
    ? (currentPrice - entryPrice) / entryPrice 
    : (entryPrice - currentPrice) / entryPrice;
  
  if (profitPct < config.trailStartPct) {
    // Not enough profit to start trailing
    return null;
  }
  
  // Calculate how far we've progressed beyond trail start
  const progressPct = profitPct - config.trailStartPct;
  const steps = Math.floor(progressPct / config.trailStepPct);
  
  // Use Fibonacci ratio for trail distance
  const fibRatio = config.fibonacciLevel || 0.618;
  const trailDistance = entryPrice * fibRatio * (steps + 1) * 0.01;
  
  // Ensure trail is within bounds
  const minTrail = entryPrice * config.minTrailPct * 0.01;
  const maxTrail = entryPrice * config.maxTrailPct * 0.01;
  const clampedTrail = Math.max(minTrail, Math.min(maxTrail, trailDistance));
  
  // Calculate stop price
  const stopPrice = isLong 
    ? currentPrice - clampedTrail 
    : currentPrice + clampedTrail;
  
  return {
    stopPrice,
    trailDistance: clampedTrail,
    method: 'fibonacci',
    level: fibRatio,
    steps,
  };
}

// ═══════════════════════════════════════════════════════════
//  PHI (GOLDEN RATIO) TRAILING
// ═══════════════════════════════════════════════════════════

/**
 * Calculate Phi-based trailing stop
 * Uses the golden ratio progression for harmonic trailing
 */
function phiTrail(entryPrice, currentPrice, isLong, config) {
  const profitPct = isLong 
    ? (currentPrice - entryPrice) / entryPrice 
    : (entryPrice - currentPrice) / entryPrice;
  
  if (profitPct < config.trailStartPct) {
    return null;
  }
  
  // Calculate progression using Phi
  const progressPct = profitPct - config.trailStartPct;
  const exponent = config.phiExponent || 1;
  const phiMultiplier = Math.pow(PHI, exponent);
  
  // Trail distance grows with Phi progression
  const baseTrail = entryPrice * config.minTrailPct * 0.01;
  const trailDistance = baseTrail * phiMultiplier * (1 + progressPct);
  
  // Clamp to bounds
  const maxTrail = entryPrice * config.maxTrailPct * 0.01;
  const clampedTrail = Math.min(maxTrail, trailDistance);
  
  const stopPrice = isLong 
    ? currentPrice - clampedTrail 
    : currentPrice + clampedTrail;
  
  return {
    stopPrice,
    trailDistance: clampedTrail,
    method: 'phi',
    phiMultiplier,
    exponent,
  };
}

// ═══════════════════════════════════════════════════════════
//  SEED OF LIFE TRAILING
// ═══════════════════════════════════════════════════════════

/**
 * Calculate Seed of Life pattern-based trailing stop
 * Uses the 7-point geometric pattern for staged trailing
 */
function seedOfLifeTrail(entryPrice, currentPrice, isLong, config, history = []) {
  const profitPct = isLong 
    ? (currentPrice - entryPrice) / entryPrice 
    : (entryPrice - currentPrice) / entryPrice;
  
  if (profitPct < config.trailStartPct) {
    return null;
  }
  
  // Determine current stage based on profit progression
  const progressPct = profitPct - config.trailStartPct;
  const stage = Math.min(6, Math.floor(progressPct / (config.trailStepPct * 2)));
  
  // Use Seed of Life radial multiplier for this stage
  const multiplier = SEED_OF_LIFE_MULTIPLIERS[stage] || 1;
  const baseTrail = entryPrice * config.minTrailPct * 0.01;
  const trailDistance = baseTrail * multiplier;
  
  // Add dynamic adjustment based on price history
  let dynamicAdjustment = 1;
  if (config.dynamicAcceleration && history.length > 10) {
    const recent = history.slice(-10);
    const avgChange = recent.reduce((sum, p, i) => {
      if (i === 0) return 0;
      return sum + Math.abs(p - recent[i-1]);
    }, 0) / recent.length;
    const volatilityFactor = Math.min(1.5, Math.max(0.5, avgChange / entryPrice * 100));
    dynamicAdjustment = volatilityFactor;
  }
  
  const finalTrail = trailDistance * dynamicAdjustment;
  const maxTrail = entryPrice * config.maxTrailPct * 0.01;
  const clampedTrail = Math.min(maxTrail, finalTrail);
  
  const stopPrice = isLong 
    ? currentPrice - clampedTrail 
    : currentPrice + clampedTrail;
  
  return {
    stopPrice,
    trailDistance: clampedTrail,
    method: 'seed_of_life',
    stage,
    multiplier,
    dynamicAdjustment,
  };
}

// ═══════════════════════════════════════════════════════════
//  EGG OF LIFE TRAILING
// ═══════════════════════════════════════════════════════════

/**
 * Calculate Egg of Life spiral-based trailing stop
 * Uses 8-stage growth pattern for progressive trailing
 */
function eggOfLifeTrail(entryPrice, currentPrice, isLong, config, history = []) {
  const profitPct = isLong 
    ? (currentPrice - entryPrice) / entryPrice 
    : (entryPrice - currentPrice) / entryPrice;
  
  if (profitPct < config.trailStartPct) {
    return null;
  }
  
  // Determine current stage based on profit progression
  const progressPct = profitPct - config.trailStartPct;
  const stage = Math.min(7, Math.floor(progressPct / (config.trailStepPct * 1.5)));
  
  // Use Egg of Life growth factor for this stage
  const growthFactor = EGG_OF_LIFE_GROWTH[stage] || 1;
  const baseTrail = entryPrice * config.minTrailPct * 0.01;
  const trailDistance = baseTrail * growthFactor;
  
  // Calculate spiral acceleration
  let spiralFactor = 1;
  if (config.dynamicAcceleration) {
    spiralFactor = 1 + (stage * 0.1); // Accelerate with each stage
  }
  
  // Profit locking mechanism
  const maxProfit = isLong 
    ? Math.max(...history) - entryPrice 
    : entryPrice - Math.min(...history);
  const lockPct = config.profitLockPct || 0.8;
  const lockedProfit = maxProfit * lockPct;
  
  const finalTrail = trailDistance * spiralFactor;
  const maxTrail = entryPrice * config.maxTrailPct * 0.01;
  const clampedTrail = Math.min(maxTrail, finalTrail);
  
  const stopPrice = isLong 
    ? Math.max(entryPrice + lockedProfit, currentPrice - clampedTrail)
    : Math.min(entryPrice - lockedProfit, currentPrice + clampedTrail);
  
  return {
    stopPrice,
    trailDistance: clampedTrail,
    method: 'egg_of_life',
    stage,
    growthFactor,
    spiralFactor,
    lockedProfit,
  };
}

// ═══════════════════════════════════════════════════════════
//  MAIN TRAILING CALCULATOR
// ═══════════════════════════════════════════════════════════

/**
 * Calculate trailing stop based on configured method
 * @param {number} entryPrice - Entry price of the position
 * @param {number} currentPrice - Current market price
 * @param {boolean} isLong - True for long position, false for short
 * @param {object} config - Trailing configuration
 * @param {array} history - Price history for dynamic calculations
 * @returns {object|null} Trailing stop info or null if not trailing
 */
function calculateTrailingStop(entryPrice, currentPrice, isLong, config = {}, history = []) {
  // Safety checks
  if (!entryPrice || !currentPrice || entryPrice <= 0 || currentPrice <= 0) {
    return null;
  }
  
  const mergedConfig = { ...TRAILING_DEFAULTS, ...config };
  
  if (!mergedConfig.enabled) {
    return null;
  }
  
  // Ensure history is an array
  const safeHistory = Array.isArray(history) ? history : [];
  
  try {
    switch (mergedConfig.method) {
      case 'fibonacci':
        return fibonacciTrail(entryPrice, currentPrice, isLong, mergedConfig);
      case 'phi':
        return phiTrail(entryPrice, currentPrice, isLong, mergedConfig);
      case 'seed_of_life':
        return seedOfLifeTrail(entryPrice, currentPrice, isLong, mergedConfig, safeHistory);
      case 'egg_of_life':
        return eggOfLifeTrail(entryPrice, currentPrice, isLong, mergedConfig, safeHistory);
      default:
        return fibonacciTrail(entryPrice, currentPrice, isLong, mergedConfig);
    }
  } catch (error) {
    console.error('Error in calculateTrailingStop:', error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Get description of trailing method
 */
function getMethodDescription(method) {
  const descriptions = {
    fibonacci: 'Fibonacci - Uses golden ratio retracement levels for harmonic trailing',
    phi: 'Phi - Golden ratio progression for exponential trailing acceleration',
    seed_of_life: 'Seed of Life - 7-point geometric pattern for staged trailing',
    egg_of_life: 'Egg of Life - 8-stage spiral growth for progressive trailing',
  };
  return descriptions[method] || descriptions.fibonacci;
}

/**
 * Get available trailing methods
 */
function getAvailableMethods() {
  return ['fibonacci', 'phi', 'seed_of_life', 'egg_of_life'];
}

/**
 * Validate trailing configuration
 */
function validateConfig(config) {
  const errors = [];
  
  if (config.trailStartPct < 0 || config.trailStartPct > 10) {
    errors.push('trailStartPct must be between 0 and 10');
  }
  if (config.trailStepPct < 0.01 || config.trailStepPct > 5) {
    errors.push('trailStepPct must be between 0.01 and 5');
  }
  if (config.minTrailPct < 0.1 || config.minTrailPct > 5) {
    errors.push('minTrailPct must be between 0.1 and 5');
  }
  if (config.maxTrailPct < config.minTrailPct || config.maxTrailPct > 20) {
    errors.push('maxTrailPct must be greater than minTrailPct and less than 20');
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
  TRAILING_DEFAULTS,
  calculateTrailingStop,
  getMethodDescription,
  getAvailableMethods,
  validateConfig,
  PHI,
  PHI_INVERSE,
  FIBONACCI,
  FIBONACCI_RATIOS,
  SEED_OF_LIFE_ANGLES,
  SEED_OF_LIFE_MULTIPLIERS,
  EGG_OF_LIFE_STAGES,
  EGG_OF_LIFE_GROWTH,
};
