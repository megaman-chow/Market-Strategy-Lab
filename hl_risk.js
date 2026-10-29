'use strict';
require('dotenv').config();

/**
 * Shared Hyperliquid risk gates — one process = one operator (all traders share caps).
 */

function killSwitchActive() {
  return process.env.HL_KILL_SWITCH === 'true' || process.env.HL_KILL_SWITCH === '1';
}

/** Max USD notional per HL order (0 = no cap). */
function maxOrderUsd() {
  const n = parseFloat(process.env.HL_MAX_ORDER_USD || '0');
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function clampOrderUsd(requested) {
  const cap = maxOrderUsd();
  if (!cap) return requested;
  return Math.min(requested, cap);
}

module.exports = {
  killSwitchActive,
  maxOrderUsd,
  clampOrderUsd,
};
