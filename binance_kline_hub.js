'use strict';

/**
 * Single shared Binance USD-M futures kline WebSocket per timeframe.
 * Emits only when k.x === true (closed bar) — typically seconds after close vs REST polling.
 *
 * @param {import('node-binance-api')} binance - configured Binance instance
 */
function createKlineHub(binance) {
  const streams = new Map();
  // timeframe -> { endpoint: string, listeners: Set<(candle) => void> }

  function subscribe(timeframe, listener) {
    let bucket = streams.get(timeframe);
    if (!bucket) {
      bucket = { endpoint: null, listeners: new Set() };
      streams.set(timeframe, bucket);
    }
    bucket.listeners.add(listener);
    if (bucket.listeners.size === 1) {
      const endpoint = binance.futuresCandlesticks('BTCUSDT', timeframe, (msg) => {
        if (!msg || !msg.k) return;
        const k = msg.k;
        if (!k.x) return;
        const candle = {
          t: new Date(k.t),
          openTime: k.t,
          closeTime: k.T,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
          isLive: true,
        };
        const b = streams.get(timeframe);
        if (!b) return;
        for (const fn of b.listeners) {
          try {
            fn(candle);
          } catch (e) {
            console.error(`[kline ${timeframe}] listener error:`, e.message);
          }
        }
      });
      bucket.endpoint = endpoint || null;
    }
  }

  function unsubscribe(timeframe, listener) {
    const bucket = streams.get(timeframe);
    if (!bucket) return;
    bucket.listeners.delete(listener);
    if (bucket.listeners.size === 0 && bucket.endpoint) {
      try {
        binance.futuresTerminate(bucket.endpoint);
      } catch (e) {
        console.warn(`[kline ${timeframe}] terminate:`, e.message);
      }
      streams.delete(timeframe);
    }
  }

  return { subscribe, unsubscribe };
}

module.exports = { createKlineHub };
