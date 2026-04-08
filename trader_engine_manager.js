require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const Binance = require('node-binance-api');
const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { hlClient } = require('./hyperliquid_client');
const { createKlineHub } = require('./binance_kline_hub');
const { killSwitchActive, maxOrderUsd } = require('./hl_risk');
const quantUser = require('./quant_user_service');

// ═══════════════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

// ═══════════════════════════════════════════════════════════
//  DATABASE SETUP
// ═══════════════════════════════════════════════════════════
const db = new sqlite3.Database('./trading.db', (err) => {
  if (err) console.error('Database error:', err);
  else console.log('✓ Database connected');
});

// Initialize tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS traders (
    id TEXT PRIMARY KEY,
    name TEXT,
    timeframe TEXT,
    strategy TEXT,
    invertLogic INTEGER,
    tpDistance INTEGER,
    createdAt INTEGER,
    isActive INTEGER DEFAULT 1,
    hlLiveMode INTEGER DEFAULT 0,
    hlSizeUsd REAL DEFAULT 100
  )`);
  // Safe migrations for existing databases
  db.run(`ALTER TABLE traders ADD COLUMN hlLiveMode INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE traders ADD COLUMN hlSizeUsd REAL DEFAULT 100`, () => {});

  db.run(`CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    traderId TEXT,
    strategy TEXT,
    direction TEXT,
    entryTime INTEGER,
    entryPrice REAL,
    exitPrice REAL,
    exitTime INTEGER,
    pnl REAL,
    result REAL,
    hit TEXT,
    isLive INTEGER,
    FOREIGN KEY (traderId) REFERENCES traders(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS trader_states (
    id TEXT PRIMARY KEY,
    traderId TEXT,
    balance REAL,
    equity TEXT,
    openPosition TEXT,
    pendingSignal TEXT,
    peak REAL,
    maxDrawdown REAL,
    updatedAt INTEGER,
    FOREIGN KEY (traderId) REFERENCES traders(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    userId TEXT,
    traderId TEXT,
    telegramChatId TEXT,
    tradingEnabled INTEGER DEFAULT 0,
    createdAt INTEGER,
    FOREIGN KEY (traderId) REFERENCES traders(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS candles (
    id TEXT PRIMARY KEY,
    timeframe TEXT,
    openTime INTEGER,
    closeTime INTEGER,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume REAL,
    isLive INTEGER,
    UNIQUE(timeframe, openTime)
  )`);
});

// ═══════════════════════════════════════════════════════════
//  TELEGRAM BOT
// ═══════════════════════════════════════════════════════════
const bot = TELEGRAM_BOT_TOKEN ? new Telegraf(TELEGRAM_BOT_TOKEN) : null;

if (bot) {
  bot.command('start', (ctx) => {
    ctx.reply(`🤖 Market Physics Trader Bot

Commands:
/status - View all active traders
/subscribe [traderId] - Subscribe to trader signals
/mytrades - View your recent trades
/help - Show this message`);
  });

  bot.command('status', async (ctx) => {
    const traders = await getAllActiveTraders();
    if (!traders.length) {
      return ctx.reply('No active traders found.');
    }
    
    let msg = '📊 *Active Traders*\n\n';
    for (const trader of traders) {
      const state = await getTraderState(trader.id);
      const pnl = state ? (state.balance - 10000).toFixed(2) : '0.00';
      msg += `🔹 *${trader.name}*\n`;
      msg += `   ID: \`${trader.id}\`\n`;
      msg += `   ${trader.timeframe} · ${trader.strategy.toUpperCase()} ${trader.invertLogic ? '⇄' : ''}\n`;
      msg += `   P&L: ${pnl >= 0 ? '+' : ''}$${pnl}\n\n`;
    }
    ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  bot.command('subscribe', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      return ctx.reply('Usage: /subscribe [traderId]');
    }
    const traderId = args[1];
    const chatId = ctx.chat.id.toString();
    
    await subscribeToTrader(chatId, traderId);
    ctx.reply(`✓ Subscribed to trader ${traderId}\nYou'll receive all signal updates.`);
  });

  bot.command('link', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const code = (parts[1] || '').trim();
    if (!code) return ctx.reply('Usage: /link <6-digit code>\n\nGet your code from the Quant Portal → Telegram section.');
    try {
      const result = await quantUser.consumeTelegramLinkCode(db, code);
      if (!result.ok) return ctx.reply(`❌ ${result.error}`);
      await quantUser.bindTelegramChat(db, result.userId, ctx.chat.id);
      await quantUser.deleteTelegramLinkCode(db, result.code);
      ctx.reply('✅ Telegram linked to your Quant Portal account!\nYou will now receive trade signals from your bots.');
    } catch (e) {
      ctx.reply('❌ Error: ' + e.message);
    }
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

async function sendTelegramSignal(traderId, signal, price) {
  if (!bot) return;

  const trader = await getTraderOrQuantTrader(traderId);
  if (!trader) return;

  const emoji = signal.direction === 'bullish' ? '📈' : '📉';
  const dir = signal.direction === 'bullish' ? 'LONG' : 'SHORT';
  
  const msg = `${emoji} *SIGNAL ALERT*

🤖 Trader: ${trader.name}
📊 Strategy: ${trader.strategy.toUpperCase()}
⏰ Timeframe: ${trader.timeframe}

🎯 Direction: *${dir}*
💰 Entry: $${price.toFixed(2)}
🎯 TP: $${signal.tp.toFixed(2)}
🛡 SL: $${signal.sl.toFixed(2)}

⚡️ R/R: ${((signal.tpOff / signal.slOff) || 1).toFixed(2)}x`;

  try {
    await bot.telegram.sendMessage(TELEGRAM_CHANNEL_ID, msg, { parse_mode: 'Markdown' });
    
    const subs = await getSubscribers(traderId);
    for (const sub of subs) {
      try {
        await bot.telegram.sendMessage(sub.telegramChatId, msg, { parse_mode: 'Markdown' });
      } catch (e) {
        console.warn('Failed to send to subscriber:', e.message);
      }
    }
  } catch (error) {
    console.error('Telegram send error:', error);
  }
}

async function sendTelegramTrade(traderId, trade) {
  if (!bot) return;

  const trader = await getTraderOrQuantTrader(traderId);
  if (!trader) return;
  const emoji = trade.hit === 'TP' ? '✅' : '❌';
  const pnlEmoji = trade.pnl >= 0 ? '💰' : '💸';
  
  const msg = `${emoji} *TRADE ${trade.hit}*

🤖 Trader: ${trader.name}
📊 ${trade.strategy.toUpperCase()} · ${trader.timeframe}

📍 Entry: $${trade.entryPrice.toFixed(2)}
🎯 Exit: $${trade.exitPrice.toFixed(2)}
${pnlEmoji} P&L: ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}
📈 Return: ${(trade.result * 100).toFixed(2)}%

${trade.isLive ? '🔴 LIVE TRADE' : ''}`;

  try {
    if (trader.quantUserId) {
      const tg = await quantUser.getTelegramForUser(db, trader.quantUserId);
      if (tg && tg.notify_signals && tg.chat_id) {
        try {
          await bot.telegram.sendMessage(tg.chat_id, msg, { parse_mode: 'Markdown' });
        } catch (e) {
          console.warn('Quant user Telegram:', e.message);
        }
      }
    }
    if (TELEGRAM_CHANNEL_ID) {
      await bot.telegram.sendMessage(TELEGRAM_CHANNEL_ID, msg, { parse_mode: 'Markdown' });
    }
    const subs = await getSubscribers(traderId);
    for (const sub of subs) {
      try {
        await bot.telegram.sendMessage(sub.telegramChatId, msg, { parse_mode: 'Markdown' });
      } catch (e) {
        console.warn('Failed to send to subscriber:', e.message);
      }
    }
  } catch (error) {
    console.error('Telegram send error:', error);
  }
}

// ═══════════════════════════════════════════════════════════
//  BINANCE CONNECTION
// ═══════════════════════════════════════════════════════════
const binance = new Binance().options({
  family: 4,
  useServerTime: true
});

const USE_KLINE_WS = process.env.LIVE_KLINE_WS !== 'false';
const LIVE_REST_FALLBACK_MS = parseInt(process.env.LIVE_REST_FALLBACK_MS || '120000', 10);
const klineHub = USE_KLINE_WS ? createKlineHub(binance) : null;
if (klineHub) {
  console.log('✓ Live feed: Binance futures kline WebSocket (per timeframe) + REST fallback');
}

// ── Shared real-time BTC price feed ────────────────────────────────────────
// Uses the 1m candlestick stream which fires on every trade tick (~250ms),
// giving the current candle's close price (= last traded price) in real-time.
// All TraderEngine position watchers share this single WebSocket connection.
class BtcPriceFeed {
  constructor(bn) {
    this._binance   = bn;
    this._listeners = new Set();
    this._endpoint  = null;
    this._lastPrice = null;
  }

  subscribe(fn) {
    this._listeners.add(fn);
    if (this._listeners.size === 1) this._start();
    return fn;
  }

  unsubscribe(fn) {
    this._listeners.delete(fn);
    if (this._listeners.size === 0) this._stop();
  }

  _start() {
    this._endpoint = this._binance.futuresCandlesticks('BTCUSDT', '1m', (msg) => {
      if (!msg || !msg.k) return;
      const price = parseFloat(msg.k.c);
      if (!price) return;
      this._lastPrice = price;
      for (const fn of this._listeners) {
        try { fn(price); } catch (e) {
          console.error('[BtcPriceFeed] listener error:', e.message);
        }
      }
    });
    console.log('📡 BTC real-time price feed started (1m tick stream)');
  }

  _stop() {
    if (this._endpoint) {
      try { this._binance.futuresTerminate(this._endpoint); } catch {}
      this._endpoint = null;
      console.log('📡 BTC real-time price feed stopped');
    }
  }

  getLastPrice() { return this._lastPrice; }
}

const priceFeed = new BtcPriceFeed(binance);

const traderEngines = new Map();

// ═══════════════════════════════════════════════════════════
//  TRADING ENGINE
// ═══════════════════════════════════════════════════════════
class TraderEngine {
  constructor(config) {
    this.id = config.id;
    this.config = config;
    this.candles = [];
    this.account = {
      bal: 10000,
      open: null,
      pending: null,
      trades: [],
      equity: [10000],
      peak: 10000,
      maxDD: 0
    };
    this.signals = { v1: [], v2: [] };
    this.isRunning = false;
    this.pollInterval = null;
    // Hyperliquid live trading
    this.hlLiveMode  = config.hlLiveMode  || false;
    this.hlSizeUsd   = config.hlSizeUsd   || 100;
    this.hlOpenOrder = null; // { isBuy, filledQty }
    this.quantUserId = config.quantUserId || null;
    this._hlWatcher  = null; // bot-managed price watcher (replaces exchange bracket orders)
  }

  async _getHl() {
    if (this.quantUserId) return quantUser.getHlClientForUser(db, this.quantUserId);
    return hlClient;
  }

  // ── Bot-managed price watcher ───────────────────────────────────────────
  // Instead of relying on exchange-side TP/SL brackets (which proved unreliable),
  // the bot monitors live price itself and force-closes via market order.
  // This exactly mirrors the simulation logic and works on any exchange.

  _startHlWatcher(isBuy, tp, sl) {
    this._stopHlWatcher(); // clear any stale watcher

    let currentSl = sl;
    let closing   = false;

    const onPrice = async (price) => {
      // JS is single-threaded: closing=true is set synchronously before the first await,
      // so concurrent ticks from the event loop will bail out immediately.
      if (closing || !this.hlOpenOrder) return;

      const hit = isBuy
        ? (price >= tp ? 'TP' : price <= currentSl ? 'SL' : null)
        : (price <= tp ? 'TP' : price >= currentSl ? 'SL' : null);

      if (!hit) return;
      closing = true;

      console.log(`🎯 Bot-managed ${hit} triggered @ $${price.toFixed(2)}  [${this.config.name}]`);

      try {
        const hl = await this._getHl();
        // Cancel any open bracket orders (safety — should be none in bot-managed mode)
        try {
          const idx = await hl.getBtcAssetIndex();
          await hl.cancelAllOrders(idx);
        } catch {}

        // Close using the actual on-book BTC quantity (not sizeUsd which drifts with price)
        const actualQty = await hl.getAbsPositionSize('BTC');
        if (actualQty > 1e-8) {
          const { avgPx } = await hl.closeByQty({ isBuy, qty: actualQty });
          console.log(`🔴 HL ${hit} close  qty:${actualQty.toFixed(5)}  px:${avgPx}  [${this.config.name}]`);
        } else {
          console.log(`✓ HL already flat at ${hit} [${this.config.name}]`);
        }
        broadcast({ type: 'hl_order_closed', traderId: this.id, reason: hit, triggerPrice: price });
      } catch (err) {
        console.error(`❌ HL watcher close failed [${this.config.name}]:`, err.message);
      } finally {
        this.hlOpenOrder = null;
        this._stopHlWatcher();
      }
    };

    priceFeed.subscribe(onPrice);
    this._hlWatcher = {
      onPrice,
      setSl: (newSl) => { currentSl = newSl; },
    };

    console.log(`👁  HL watcher: ${isBuy ? 'LONG' : 'SHORT'}  TP=$${tp.toFixed(1)}  SL=$${sl.toFixed(1)}  [${this.config.name}]`);
  }

  _stopHlWatcher() {
    if (this._hlWatcher) {
      priceFeed.unsubscribe(this._hlWatcher.onPrice);
      this._hlWatcher = null;
    }
  }

  // ── Hyperliquid live-trading helpers ────────────────────────────────────

  async _hlEnter(isBuy, tp, sl) {
    if (!this.hlLiveMode) return;
    try {
      const hl = await this._getHl();
      const { filledQty: fillFromResp, avgPx } = await hl.marketOrder({ isBuy, sizeUsd: this.hlSizeUsd });
      await new Promise(r => setTimeout(r, 400));
      let filledQty = fillFromResp;
      const fromBook = await hl.getAbsPositionSize('BTC');
      if (fromBook > 1e-8) filledQty = fromBook;
      if (filledQty < 1e-8) {
        console.error(`❌ HL entry had no position size on book [${this.config.name}] — skipping watcher`);
        this.hlOpenOrder = { isBuy, filledQty: 0 };
        broadcast({ type: 'hl_order_placed', traderId: this.id, order: this.hlOpenOrder, tp, sl });
        return;
      }

      this.hlOpenOrder = { isBuy, filledQty };
      console.log(`🟢 HL ${isBuy ? 'LONG' : 'SHORT'} entered  qty:${filledQty}  px:${avgPx}  [${this.config.name}]`);

      // Start bot-managed price watcher — no exchange brackets needed
      if (tp && sl) this._startHlWatcher(isBuy, tp, sl);

      broadcast({ type: 'hl_order_placed', traderId: this.id, order: this.hlOpenOrder, tp, sl });
    } catch (err) {
      console.error(`❌ HL entry failed [${this.config.name}]:`, err.message);
    }
  }

  async _hlExit() {
    if (!this.hlLiveMode || !this.hlOpenOrder) return;
    // Stop the watcher first so it can't race with this manual close
    this._stopHlWatcher();
    try {
      const hl = await this._getHl();
      try {
        const idx = await hl.getBtcAssetIndex();
        await hl.cancelAllOrders(idx);
      } catch {}

      const actualQty = await hl.getAbsPositionSize('BTC');
      if (actualQty > 1e-8) {
        const { avgPx } = await hl.closeByQty({ isBuy: this.hlOpenOrder.isBuy, qty: actualQty });
        console.log(`🔴 HL position closed [${this.config.name}]  qty:${actualQty.toFixed(5)}  px:${avgPx}`);
      } else {
        console.log(`✓ HL already flat (watcher closed it) [${this.config.name}]`);
      }
      broadcast({ type: 'hl_order_closed', traderId: this.id });
    } catch (err) {
      console.error(`❌ HL exit failed [${this.config.name}]:`, err.message);
    } finally {
      this.hlOpenOrder = null;
    }
  }

  async _hlUpdateSL(newSl) {
    if (!this.hlLiveMode || !this.hlOpenOrder) return;
    // In bot-managed mode: update the watcher's in-memory SL — instant, no API call.
    if (this._hlWatcher) {
      this._hlWatcher.setSl(newSl);
      console.log(`📐 HL trailing SL → $${newSl.toFixed(1)}  [${this.config.name}]`);
      broadcast({ type: 'hl_sl_updated', traderId: this.id, newSl });
    }
  }

  async start() {
    console.log(`🚀 Starting trader: ${this.config.name}`);
    this.isRunning = true;
    
    await this.loadHistoricalData();

    if (klineHub) {
      this._wsCandleListener = (candle) => this.tryIngestClosedCandle(candle);
      klineHub.subscribe(this.config.timeframe, this._wsCandleListener);
    }
    
    const pollMs = this.getPollInterval();
    this.pollInterval = setInterval(() => this.poll(), pollMs);
    
    await this.saveState();
    
    broadcast({ type: 'trader_started', traderId: this.id });
  }

  async stop() {
    console.log(`⏸ Stopping trader: ${this.config.name}`);
    this.isRunning = false;
    this._stopHlWatcher(); // stop price watcher; live position (if any) must be closed manually
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (klineHub && this._wsCandleListener) {
      klineHub.unsubscribe(this.config.timeframe, this._wsCandleListener);
      this._wsCandleListener = null;
    }
    await this.saveState();
  }

  getPollInterval() {
    if (klineHub) return LIVE_REST_FALLBACK_MS;
    const fast = this.hlLiveMode;
    const map = fast
      ? { '5m': 3000, '15m': 5000, '1h': 8000, '4h': 15000, '1d': 45000 }
      : { '5m': 10000, '15m': 20000, '1h': 30000, '4h': 60000, '1d': 120000 };
    return map[this.config.timeframe] || (fast ? 8000 : 30000);
  }

  async loadHistoricalData() {
    try {
      const data = await binance.futuresCandles('BTCUSDT', this.config.timeframe, { limit: 500 });
      this.candles = data.map(k => ({
        t: new Date(k[0]),
        openTime: k[0],
        closeTime: k[6],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        isLive: false
      }));
      
      this.buildIndicators();
      this.detectSignals();
      
      console.log(`✓ Loaded ${this.candles.length} historical candles for ${this.config.name}`);
    } catch (error) {
      console.error('Failed to load historical data:', error);
    }
  }

  /**
   * Ingest one fully closed candle (from WebSocket or REST). Deduplicates by openTime.
   */
  async tryIngestClosedCandle(candle) {
    if (!this.isRunning) return;
    if (this.candles.some((c) => c.openTime === candle.openTime)) return;

    this.candles.push(candle);
    this.buildIndicators();
    this.detectSignals();

    await this.processCandle(this.candles.length - 1);
    await this.saveState();
    await this.saveCandle(candle);

    broadcast({
      type: 'new_candle',
      traderId: this.id,
      candle,
      state: this.getPublicState(),
    });

    console.log(`🕯 New candle: ${this.config.name} @ $${candle.close.toFixed(2)}`);
  }

  async poll() {
    if (!this.isRunning) return;

    try {
      const fresh = await binance.futuresCandles('BTCUSDT', this.config.timeframe, { limit: 3 });

      for (const k of fresh) {
        const openTime = k[0];
        const isClosed = k[6] < Date.now() - 1000;
        if (!isClosed) continue;

        const candle = {
          t: new Date(openTime),
          openTime,
          closeTime: k[6],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
          isLive: true,
        };
        await this.tryIngestClosedCandle(candle);
      }
    } catch (error) {
      console.error('Poll error:', error);
    }
  }

  async processCandle(idx, opts = {}) {
    const { isLive = true, notify = true, persist = true } = opts;
    const c = this.candles[idx];
    const stratKey = this.config.strategy;
    const signals = this.signals[stratKey];

    // ── Open pending position ──────────────────────────────────────────────
    if (!this.account.open && this.account.pending) {
      const sig   = this.account.pending;
      const entry = c.open;
      const size  = (this.account.bal * 0.30) / entry;

      this.account.open = {
        dir: sig.direction, entry, size,
        tp: sig.tp, sl: sig.sl,
        entryIdx: idx, entryTime: c.t, isLive
      };
      this.account.pending = null;

      if (notify) {
        await sendTelegramSignal(this.id, sig, entry);
        broadcast({ type: 'position_opened', traderId: this.id, position: this.account.open });
        await this._hlEnter(sig.direction === 'bullish', sig.tp, sig.sl);
      }
    }

    // ── Queue next signal ─────────────────────────────────────────────────
    const sigNow = signals.find(s => s.i === idx);
    if (sigNow && !this.account.open && !this.account.pending) {
      this.account.pending = sigNow;
    }

    // ── Manage open position ──────────────────────────────────────────────
    if (this.account.open) {
      const { dir, entry, size, tp, sl } = this.account.open;
      let hitTP = false, hitSL = false;
      const R = Math.max(1e-9, Math.abs(entry - sl));
      let slMoved = false;

      if (dir === 'bullish') {
        const prevSl = this.account.open.sl;
        if (c.high >= entry + R) this.account.open.sl = Math.max(this.account.open.sl, entry);
        if (c.high >= entry + 2 * R) {
          const trail = c.close - (c.atr || 50) * 1.4;
          if (trail > this.account.open.sl) this.account.open.sl = trail;
        }
        if (this.account.open.sl !== prevSl) slMoved = true;
        if (c.high >= tp) hitTP = true;
        if (c.low  <= this.account.open.sl) hitSL = true;
        if (hitTP && hitSL) hitTP = false;
      } else {
        const prevSl = this.account.open.sl;
        if (c.low  <= entry - R) this.account.open.sl = Math.min(this.account.open.sl, entry);
        if (c.low  <= entry - 2 * R) {
          const trail = c.close + (c.atr || 50) * 1.4;
          if (trail < this.account.open.sl) this.account.open.sl = trail;
        }
        if (this.account.open.sl !== prevSl) slMoved = true;
        if (c.low  <= tp) hitTP = true;
        if (c.high >= this.account.open.sl) hitSL = true;
        if (hitTP && hitSL) hitTP = false;
      }

      // Push trailing stop update to Hyperliquid
      if (slMoved && !hitTP && !hitSL && isLive && notify) {
        await this._hlUpdateSL(this.account.open.sl);
      }

      // ── Exit ──────────────────────────────────────────────────────────
      if (hitTP || hitSL) {
        const ep  = hitTP ? tp : this.account.open.sl;
        const pnl = dir === 'bullish' ? (ep - entry) * size : (entry - ep) * size;

        this.account.bal += pnl;
        if (this.account.bal > this.account.peak) this.account.peak = this.account.bal;
        const dd = (this.account.peak - this.account.bal) / this.account.peak;
        if (dd > this.account.maxDD) this.account.maxDD = dd;
        this.account.equity.push(this.account.bal);

        const trade = {
          id: uuidv4(), traderId: this.id, strategy: stratKey, direction: dir,
          entryTime: this.account.open.entryTime.getTime(), entryPrice: entry,
          exitPrice: ep, exitTime: c.t.getTime(),
          pnl, result: pnl / Math.abs(entry * size),
          hit: hitTP ? 'TP' : 'SL', isLive
        };

        this.account.trades.push(trade);
        this.account.open = null;

        if (persist) await this.saveTrade(trade);
        if (notify) {
          await sendTelegramTrade(this.id, trade);
          await this._hlExit();
          broadcast({ type: 'position_closed', traderId: this.id, trade, state: this.getPublicState() });
        }
      }
    }
  }

  buildIndicators() {
    for (let i = 0; i < this.candles.length; i++) {
      this.candles[i].vel = i === 0 ? 0 : this.candles[i].close - this.candles[i - 1].close;
      this.candles[i].vn = this.candles[i].vel / this.candles[i].close;
    }
    for (let i = 0; i < this.candles.length; i++) {
      this.candles[i].acc = i === 0 ? 0 : this.candles[i].vel - this.candles[i - 1].vel;
      this.candles[i].an = this.candles[i].acc / this.candles[i].close;
      this.candles[i].vp = i === 0 ? 0 : this.candles[i - 1].vn;
    }

    const calcEMA = (p) => {
      const em = [], k = 2 / (p + 1);
      for (let i = 0; i < this.candles.length; i++) {
        if (i < p) { em.push(null); continue; }
        if (em[i - 1] == null) {
          em.push(this.candles.slice(0, p + 1).reduce((a, c) => a + c.close, 0) / p);
          continue;
        }
        em.push(this.candles[i].close * k + em[i - 1] * (1 - k));
      }
      return em;
    };

    const ema20 = calcEMA(20);
    const ema50 = calcEMA(50);
    const ema200 = calcEMA(200);

    const calcRSI = (p = 14) => {
      const rsi = [];
      for (let i = 0; i < this.candles.length; i++) {
        if (i < p) { rsi.push(null); continue; }
        let g = 0, l = 0;
        for (let j = i - p + 1; j <= i; j++) {
          const diff = this.candles[j].close - this.candles[j - 1].close;
          diff >= 0 ? g += diff : l -= diff;
        }
        rsi.push(100 - 100 / (1 + (g / p) / Math.max(l / p, 1e-9)));
      }
      return rsi;
    };

    const rsi = calcRSI();

    const calcATR = (p = 14) => {
      const tr = [0];
      for (let i = 1; i < this.candles.length; i++) {
        tr.push(Math.max(
          this.candles[i].high - this.candles[i].low,
          Math.abs(this.candles[i].high - this.candles[i - 1].close),
          Math.abs(this.candles[i].low - this.candles[i - 1].close)
        ));
      }
      const atr = new Array(this.candles.length).fill(0);
      let s = tr.slice(1, p + 1).reduce((a, b) => a + b, 0) / p;
      atr[p] = s;
      for (let i = p + 1; i < this.candles.length; i++) {
        s = (s * (p - 1) + tr[i]) / p;
        atr[i] = s;
      }
      return atr;
    };

    const atr = calcATR();

    const calcVolMA = (p = 20) => {
      return this.candles.map((_, i) =>
        i < p ? null : this.candles.slice(i - p, i).reduce((a, c) => a + c.volume, 0) / p
      );
    };

    const volma = calcVolMA();

    this.candles.forEach((c, i) => {
      c.ema20 = ema20[i];
      c.ema50 = ema50[i];
      c.ema200 = ema200[i];
      c.rsi = rsi[i];
      c.atr = atr[i];
      c.volma = volma[i];
    });
  }

  detectSignals() {
    const invert = this.config.invertLogic;
    const invDir = (d) => d === 'bullish' ? 'bearish' : 'bullish';
    const effDir = (d) => invert ? invDir(d) : d;

    const v1 = [];
    for (let i = 2; i < this.candles.length; i++) {
      const c = this.candles[i];
      const b = Math.abs(c.close - c.open);
      const uw = Math.max(0, c.high - Math.max(c.open, c.close));
      const lw = Math.max(0, Math.min(c.open, c.close) - c.low);
      const r = Math.max(1e-9, c.high - c.low);
      const uwr = uw / r, lwr = lw / r;

      if (lwr > 0.6 && c.vn > 0 && c.vp < 0 && c.an > 0) {
        v1.push({ i, direction: effDir('bullish') });
      }
      if (uwr > 0.6 && c.vn < 0 && c.vp > 0 && c.an < 0) {
        v1.push({ i, direction: effDir('bearish') });
      }
    }

    const v2 = [];
    for (let i = 3; i < this.candles.length; i++) {
      const c = this.candles[i];
      const p = this.candles[i - 1];
      if (!c.ema20 || !c.ema50 || !c.rsi || !c.volma) continue;

      const bullReg = c.ema20 > c.ema50, bearReg = c.ema20 < c.ema50;
      const sep = Math.abs(c.ema20 - c.ema50) / Math.max(1e-9, c.close) > 0.0002;
      const crossUp = p.close <= p.ema20 && c.close > c.ema20;
      const touchUp = c.low <= c.ema20 * 1.003 && c.close > c.ema20;
      const crossDn = p.close >= p.ema20 && c.close < c.ema20;
      const touchDn = c.high >= c.ema20 * 0.997 && c.close < c.ema20;
      const pullB = crossUp || touchUp, pullS = crossDn || touchDn;
      const momB = (c.vn > 0 || c.close > p.close) && (c.an > 0 || c.close > c.ema20);
      const momS = (c.vn < 0 || c.close < p.close) && (c.an < 0 || c.close < c.ema20);
      const rsiB = c.rsi >= 40 && c.rsi <= 80, rsiS = c.rsi <= 60 && c.rsi >= 20;
      const volOk = c.volume >= c.volma * 0.95;

      if (bullReg && sep && pullB && momB && rsiB && volOk) {
        v2.push({ i, direction: effDir('bullish') });
      }
      if (bearReg && sep && pullS && momS && rsiS && volOk) {
        v2.push({ i, direction: effDir('bearish') });
      }
    }

    const buildPreds = (sigs) => {
      return sigs.map(s => {
        const c = this.candles[s.i];
        const a = c.atr || Math.max(50, c.close * 0.002);
        const tpOff = Math.max(this.config.tpDistance, a * 2.6);
        const slOff = Math.max(this.config.tpDistance / 2, a * 1.3);
        const base = c.close;
        const tp = s.direction === 'bullish' ? base + tpOff : base - tpOff;
        const sl = s.direction === 'bullish' ? base - slOff : base + slOff;
        return { ...s, tpOff, slOff, tp, sl, atr: a };
      });
    };

    this.signals.v1 = buildPreds(v1);
    this.signals.v2 = buildPreds(v2);
  }

  getPublicState() {
    return {
      id: this.id,
      config: this.config,
      balance: this.account.bal,
      equity: this.account.equity,
      trades: this.account.trades.length,
      pnl: this.account.bal - 10000,
      winRate: this.getWinRate(),
      openPosition: this.account.open,
      pendingSignal: this.account.pending,
      candles: this.candles.length,
      isRunning: this.isRunning,
      hlLiveMode: this.hlLiveMode,
      hlSizeUsd: this.hlSizeUsd,
      hlOpenOrder: this.hlOpenOrder,
    };
  }

  getWinRate() {
    if (!this.account.trades.length) return 0;
    const wins = this.account.trades.filter(t => t.pnl > 0).length;
    return wins / this.account.trades.length;
  }

  async saveState() {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO trader_states (id, traderId, balance, equity, openPosition, pendingSignal, peak, maxDrawdown, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.id,
          this.id,
          this.account.bal,
          JSON.stringify(this.account.equity),
          JSON.stringify(this.account.open),
          JSON.stringify(this.account.pending),
          this.account.peak,
          this.account.maxDD,
          Date.now()
        ],
        (err) => err ? reject(err) : resolve()
      );
    });
  }

  async saveTrade(trade) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO trades (id, traderId, strategy, direction, entryTime, entryPrice, exitPrice, exitTime, pnl, result, hit, isLive)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          trade.id,
          trade.traderId,
          trade.strategy,
          trade.direction,
          trade.entryTime,
          trade.entryPrice,
          trade.exitPrice,
          trade.exitTime,
          trade.pnl,
          trade.result,
          trade.hit,
          trade.isLive ? 1 : 0
        ],
        (err) => err ? reject(err) : resolve()
      );
    });
  }

  async saveCandle(candle) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT OR IGNORE INTO candles (id, timeframe, openTime, closeTime, open, high, low, close, volume, isLive)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `${this.config.timeframe}_${candle.openTime}`,
          this.config.timeframe,
          candle.openTime,
          candle.closeTime,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume,
          candle.isLive ? 1 : 0
        ],
        (err) => err ? reject(err) : resolve()
      );
    });
  }
}

// ═══════════════════════════════════════════════════════════
//  DATABASE HELPERS
// ═══════════════════════════════════════════════════════════
function getAllActiveTraders() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM traders WHERE isActive = 1', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getTrader(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM traders WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getTraderState(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM trader_states WHERE traderId = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getSubscribers(traderId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM subscriptions WHERE traderId = ?', [traderId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function subscribeToTrader(chatId, traderId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO subscriptions (id, userId, traderId, telegramChatId, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), chatId, traderId, chatId, Date.now()],
      (err) => err ? reject(err) : resolve()
    );
  });
}

async function getTraderOrQuantTrader(traderId) {
  const engine = traderEngines.get(traderId);
  if (engine) return engine.config;

  const trader = await getTrader(traderId);
  if (trader) return trader;

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM quant_user_traders WHERE id = ?', [traderId], (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  EXPRESS APP
// ═══════════════════════════════════════════════════════════
const app = express();
const server = http.createServer(app);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(__dirname));

app.get('/api/traders', async (req, res) => {
  try {
    const traders = await getAllActiveTraders();
    const withStates = await Promise.all(traders.map(async (t) => {
      const engine = traderEngines.get(t.id);
      const state = engine ? engine.getPublicState() : await getTraderState(t.id);
      return { ...t, state };
    }));
    res.json(withStates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/traders', async (req, res) => {
  try {
    const { name, timeframe, strategy, invertLogic, tpDistance, hlLiveMode, hlSizeUsd } = req.body;
    if (hlLiveMode && killSwitchActive()) {
      return res.status(403).json({ error: 'HL_KILL_SWITCH is on — cannot create trader with live HL' });
    }
    const id = uuidv4();
    let szNew = parseFloat(hlSizeUsd) || 100;
    const cap = maxOrderUsd();
    if (cap > 0) szNew = Math.min(szNew, cap);

    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO traders (id, name, timeframe, strategy, invertLogic, tpDistance, createdAt, hlLiveMode, hlSizeUsd)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, timeframe, strategy, invertLogic ? 1 : 0, tpDistance || 50, Date.now(),
         hlLiveMode ? 1 : 0, szNew],
        (err) => err ? reject(err) : resolve()
      );
    });

    const config = { id, name, timeframe, strategy, invertLogic,
                     tpDistance: tpDistance || 50,
                     hlLiveMode: !!hlLiveMode, hlSizeUsd: szNew };
    const engine = new TraderEngine(config);
    traderEngines.set(id, engine);
    await engine.start();

    res.json({ success: true, trader: config });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/traders/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    const engine = traderEngines.get(id);
    
    if (engine) {
      await engine.stop();
      traderEngines.delete(id);
    }
    
    await new Promise((resolve, reject) => {
      db.run('UPDATE traders SET isActive = 0 WHERE id = ?', [id], (err) => 
        err ? reject(err) : resolve()
      );
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/traders/:id/trades', async (req, res) => {
  try {
    const { id } = req.params;
    const trades = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM trades WHERE traderId = ? ORDER BY entryTime DESC LIMIT 100',
        [id],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });
    res.json(trades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  HYPERLIQUID API ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/public-config', (req, res) => {
  res.json({
    liveKlineWs: !!klineHub,
    liveRestFallbackMs: LIVE_REST_FALLBACK_MS,
    hlKillSwitch: killSwitchActive(),
    hlMaxOrderUsd: maxOrderUsd() || null,
  });
});

app.get('/api/hyperliquid/status', (req, res) => {
  try {
    const configured = hlClient.isConfigured();
    res.json({ configured, ...(configured ? hlClient.getConfig() : {}) });
  } catch { res.json({ configured: false }); }
});

app.post('/api/hyperliquid/configure', async (req, res) => {
  try {
    const { secretKey, accountAddress, testnet } = req.body;
    if (!secretKey || !accountAddress)
      return res.status(400).json({ error: 'secretKey and accountAddress required' });
    hlClient.configure({ secretKey, accountAddress, testnet: testnet !== false });
    res.json({ success: true, configured: true, testnet: testnet !== false, accountAddress });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/hyperliquid/account', async (req, res) => {
  try { res.json(await hlClient.getAccountSnapshot(req.query.address)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/hyperliquid/orders', async (req, res) => {
  try { res.json(await hlClient.getOpenOrders(req.query.address)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/hyperliquid/order', async (req, res) => {
  try {
    const { isBuy, sizeUsd, leverage } = req.body;
    if (typeof isBuy !== 'boolean' || !sizeUsd)
      return res.status(400).json({ error: 'isBuy (boolean) and sizeUsd required' });
    const r = await hlClient.marketOrder({ isBuy, sizeUsd, leverage: leverage || 1 });
    res.json({ success: true, ...r });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/hyperliquid/close', async (req, res) => {
  try {
    const { isBuy, sizeUsd } = req.body;
    const r = await hlClient.closePosition({ isBuy, sizeUsd });
    res.json({ success: true, ...r });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  QUANT USER ROUTES  (/api/quant/*)
// ═══════════════════════════════════════════════════════════

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.userId = quantUser.verifyUserToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.post('/api/quant/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await quantUser.registerUser(db, email, password);
    const token = quantUser.signUserToken(user.id);
    res.json({ token, email: user.email });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/quant/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await quantUser.loginUser(db, email, password);
    const token = quantUser.signUserToken(user.id);
    res.json({ token, email: user.email });
  } catch (err) { res.status(401).json({ error: err.message }); }
});

app.get('/api/quant/me', requireAuth, async (req, res) => {
  try {
    const user = await quantUser.getUserById(db, req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const hl = await quantUser.userHlConfigured(db, req.userId);
    const tg = await quantUser.getTelegramForUser(db, req.userId);
    res.json({ email: user.email, hyperliquid: hl, telegramLinked: !!tg });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/quant/hyperliquid', requireAuth, async (req, res) => {
  try {
    const { accountAddress, secretKey, testnet } = req.body;
    await quantUser.saveUserHyperliquid(db, req.userId, { accountAddress, secretKey, testnet });
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/quant/hyperliquid/status', requireAuth, async (req, res) => {
  try {
    res.json(await quantUser.userHlConfigured(db, req.userId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/quant/hyperliquid/account', requireAuth, async (req, res) => {
  try {
    const hl = await quantUser.getHlClientForUser(db, req.userId);
    const row = await quantUser.getUserHlRow(db, req.userId);
    res.json(await hl.getAccountSnapshot(row.account_address));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/quant/telegram/link-code', requireAuth, async (req, res) => {
  try {
    res.json(await quantUser.createTelegramLinkCode(db, req.userId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/quant/traders', requireAuth, async (req, res) => {
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM quant_user_traders WHERE user_id = ? AND isActive = 1',
        [req.userId],
        (err, r) => err ? reject(err) : resolve(r)
      );
    });
    const withStates = rows.map(t => {
      const engine = traderEngines.get(t.id);
      return { ...t, state: engine ? engine.getPublicState() : null };
    });
    res.json(withStates);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/quant/traders', requireAuth, async (req, res) => {
  try {
    const { name, timeframe, strategy, invertLogic, tpDistance, hlLiveMode, hlSizeUsd } = req.body;
    if (hlLiveMode && killSwitchActive()) {
      return res.status(403).json({ error: 'HL_KILL_SWITCH is on — cannot create trader with live HL' });
    }
    const id = uuidv4();
    let sz = parseFloat(hlSizeUsd) || 100;
    const cap = maxOrderUsd();
    if (cap > 0) sz = Math.min(sz, cap);

    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO quant_user_traders (id, user_id, name, timeframe, strategy, invertLogic, tpDistance, createdAt, hlLiveMode, hlSizeUsd)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, req.userId, name || 'Trader', timeframe, strategy,
         invertLogic ? 1 : 0, tpDistance || 50, Date.now(), hlLiveMode ? 1 : 0, sz],
        (err) => err ? reject(err) : resolve()
      );
    });

    const config = {
      id, name: name || 'Trader', timeframe, strategy,
      invertLogic: !!invertLogic, tpDistance: tpDistance || 50,
      hlLiveMode: !!hlLiveMode, hlSizeUsd: sz,
      quantUserId: req.userId,
    };
    const engine = new TraderEngine(config);
    traderEngines.set(id, engine);
    await engine.start();
    res.json({ success: true, trader: config });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/quant/traders/:id/stop', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM quant_user_traders WHERE id = ? AND user_id = ?', [id, req.userId],
        (err, r) => err ? reject(err) : resolve(r));
    });
    if (!row) return res.status(404).json({ error: 'Trader not found' });

    const engine = traderEngines.get(id);
    if (engine) {
      await engine.stop();
      traderEngines.delete(id);
    }
    await new Promise((resolve, reject) => {
      db.run('UPDATE quant_user_traders SET isActive = 0 WHERE id = ?', [id],
        (err) => err ? reject(err) : resolve());
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/traders/:id/hl-live', async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled, sizeUsd } = req.body;
    if (enabled && killSwitchActive()) {
      return res.status(403).json({
        error: 'HL_KILL_SWITCH is on — enable live trading only after setting HL_KILL_SWITCH=false in .env',
      });
    }
    let sz = parseFloat(sizeUsd) || 100;
    const cap = maxOrderUsd();
    if (cap > 0) sz = Math.min(sz, cap);

    await new Promise((resolve, reject) => {
      db.run('UPDATE traders SET hlLiveMode = ?, hlSizeUsd = ? WHERE id = ?',
        [enabled ? 1 : 0, sz, id],
        (err) => err ? reject(err) : resolve());
    });
    const engine = traderEngines.get(id);
    if (engine) {
      engine.hlLiveMode = !!enabled;
      engine.hlSizeUsd = sz;
    }
    res.json({ success: true, hlLiveMode: !!enabled, hlSizeUsd: sz });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  WEBSOCKET
// ═══════════════════════════════════════════════════════════
const wss = new WebSocket.Server({ server });

const clients = new Set();

wss.on('connection', (ws) => {
  console.log('✓ WebSocket client connected');
  clients.add(ws);
  
  ws.on('close', () => {
    clients.delete(ws);
  });
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
    } catch (error) {
      console.error('WS message error:', error);
    }
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  STARTUP
// ═══════════════════════════════════════════════════════════
async function startup() {
  try {
    await quantUser.initQuantTables(db);
    console.log('✓ Quant user tables ready');
  } catch (e) {
    console.error('Quant tables init failed:', e.message);
  }

  const traders = await getAllActiveTraders();
  console.log(`📊 Restoring ${traders.length} active traders...`);
  
  for (const trader of traders) {
    try {
      const config = {
        id: trader.id,
        name: trader.name,
        timeframe: trader.timeframe,
        strategy: trader.strategy,
        invertLogic: trader.invertLogic === 1,
        tpDistance: trader.tpDistance,
        hlLiveMode: trader.hlLiveMode === 1,
        hlSizeUsd: trader.hlSizeUsd || 100,
      };
      
      const engine = new TraderEngine(config);
      
      const state = await getTraderState(trader.id);
      if (state) {
        engine.account.bal = state.balance;
        engine.account.equity = JSON.parse(state.equity || '[10000]');
        engine.account.peak = state.peak;
        engine.account.maxDD = state.maxDrawdown;
        if (state.openPosition && state.openPosition !== 'null') {
          engine.account.open = JSON.parse(state.openPosition);
        }
        if (state.pendingSignal && state.pendingSignal !== 'null') {
          engine.account.pending = JSON.parse(state.pendingSignal);
        }
      }
      
      traderEngines.set(trader.id, engine);
      await engine.start();
    } catch (error) {
      console.error(`Failed to restore trader ${trader.name}:`, error);
    }
  }

  const qTraders = await quantUser.getAllActiveQuantTraders(db);
  console.log(`📊 Restoring ${qTraders.length} quant user traders...`);
  for (const trader of qTraders) {
    try {
      const config = {
        id: trader.id,
        name: trader.name,
        timeframe: trader.timeframe,
        strategy: trader.strategy,
        invertLogic: trader.invertLogic === 1,
        tpDistance: trader.tpDistance,
        hlLiveMode: trader.hlLiveMode === 1,
        hlSizeUsd: trader.hlSizeUsd || 100,
        quantUserId: trader.user_id,
      };
      const engine = new TraderEngine(config);
      const state = await getTraderState(trader.id);
      if (state) {
        engine.account.bal = state.balance;
        engine.account.equity = JSON.parse(state.equity || '[10000]');
        engine.account.peak = state.peak;
        engine.account.maxDD = state.maxDrawdown;
        if (state.openPosition && state.openPosition !== 'null') {
          engine.account.open = JSON.parse(state.openPosition);
        }
        if (state.pendingSignal && state.pendingSignal !== 'null') {
          engine.account.pending = JSON.parse(state.pendingSignal);
        }
      }
      traderEngines.set(trader.id, engine);
      await engine.start();
    } catch (error) {
      console.error(`Failed to restore quant trader ${trader.name}:`, error);
    }
  }
  
  server.listen(PORT, () => {
    if (bot) {
      bot.launch().then(() => console.log('✓ Telegram bot launched')).catch((err) => {
        console.error('⚠️  Telegram bot launch failed (another instance running?):', err.message);
      });
    }
    console.log(`\n🚀 Market Physics Trader v2.0`);
    console.log(`📡 Server: http://localhost:${PORT}`);
    console.log(`🤖 Telegram: ${bot ? 'ACTIVE' : 'DISABLED'}`);
    console.log(`📊 Traders: ${traderEngines.size}`);
    console.log(`\n✨ Ready!\n`);
  });
}

startup();
