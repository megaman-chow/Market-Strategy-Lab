'use strict';

/**
 * Single shared Binance USD-M futures kline WebSocket per timeframe.
 * Emits only when k.x === true (closed bar) — typically seconds after close vs REST polling.
 *
 * @param {import('node-binance-api')} binance - configured Binance instance
 */
function createKlineHub(binance) {
  const streams = new Map();
  // `${symbol}_${timeframe}` -> { endpoint: string, listeners: Set<(candle) => void> }

  function key(symbol, timeframe) {
    return `${symbol}__${timeframe}`;
  }

  function subscribe(symbol, timeframe, listener) {
    const streamKey = key(symbol, timeframe);
    let bucket = streams.get(streamKey);
    if (!bucket) {
      bucket = { endpoint: null, listeners: new Set() };
      streams.set(streamKey, bucket);
    }
    bucket.listeners.add(listener);
    if (bucket.listeners.size === 1) {
      const endpoint = binance.futuresCandlesticks(symbol, timeframe, (msg) => {
        if (!msg || !msg.k) return;
        const bar = msg.k;
        if (!bar.x) return;
        const candle = {
          t: new Date(bar.t),
          openTime: bar.t,
          closeTime: bar.T,
          open: parseFloat(bar.o),
          high: parseFloat(bar.h),
          low: parseFloat(bar.l),
          close: parseFloat(bar.c),
          volume: parseFloat(bar.v),
          isLive: true,
        };
        const b = streams.get(streamKey);
        if (!b) return;
        for (const fn of b.listeners) {
          try {
            fn(candle);
          } catch (e) {
            console.error(`[kline ${symbol} ${timeframe}] listener error:`, e.message);
          }
        }
      });
      bucket.endpoint = endpoint || null;
    }
  }

  function unsubscribe(symbol, timeframe, listener) {
    const bucket = streams.get(key(symbol, timeframe));
    if (!bucket) return;
    bucket.listeners.delete(listener);
    if (bucket.listeners.size === 0 && bucket.endpoint) {
      try {
        binance.futuresTerminate(bucket.endpoint);
      } catch (e) {
        console.warn(`[kline ${symbol} ${timeframe}] terminate:`, e.message);
      }
      streams.delete(key(symbol, timeframe));
    }
  }

  return { subscribe, unsubscribe };
}

module.exports = { createKlineHub };
