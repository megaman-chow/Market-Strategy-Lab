require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Binance = require('node-binance-api');
const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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
    isActive INTEGER DEFAULT 1
  )`);

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

  bot.launch();
  console.log('✓ Telegram bot launched');
  
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

async function sendTelegramSignal(traderId, signal, price) {
  if (!bot || !TELEGRAM_CHANNEL_ID) return;
  
  const trader = await getTrader(traderId);
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
  if (!bot || !TELEGRAM_CHANNEL_ID) return;
  
  const trader = await getTrader(traderId);
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

// ═══════════════════════════════════════════════════════════
//  BINANCE CONNECTION
// ═══════════════════════════════════════════════════════════
const binance = new Binance().options({
  family: 4,
  useServerTime: true
});

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
  }

  async start() {
    console.log(`🚀 Starting trader: ${this.config.name}`);
    this.isRunning = true;
    
    await this.loadHistoricalData();
    
    const pollMs = this.getPollInterval();
    this.pollInterval = setInterval(() => this.poll(), pollMs);
    
    await this.saveState();
    
    broadcast({ type: 'trader_started', traderId: this.id });
  }

  async stop() {
    console.log(`⏸ Stopping trader: ${this.config.name}`);
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    await this.saveState();
  }

  getPollInterval() {
    const map = {
      '5m': 10000,
      '15m': 20000,
      '1h': 30000,
      '4h': 60000,
      '1d': 120000
    };
    return map[this.config.timeframe] || 30000;
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

  async poll() {
    if (!this.isRunning) return;
    
    try {
      const fresh = await binance.futuresCandles('BTCUSDT', this.config.timeframe, { limit: 3 });
      
      for (const k of fresh) {
        const openTime = k[0];
        const isClosed = k[6] < Date.now() - 1000;
        
        if (!isClosed) continue;
        if (this.candles.some(c => c.openTime === openTime)) continue;
        
        const candle = {
          t: new Date(openTime),
          openTime,
          closeTime: k[6],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
          isLive: true
        };
        
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
          state: this.getPublicState()
        });
        
        console.log(`🕯 New candle: ${this.config.name} @ $${candle.close.toFixed(2)}`);
      }
    } catch (error) {
      console.error('Poll error:', error);
    }
  }

  async processCandle(idx) {
    const c = this.candles[idx];
    const stratKey = this.config.strategy;
    const signals = this.signals[stratKey];
    
    if (!this.account.open && this.account.pending) {
      const sig = this.account.pending;
      const entry = c.open;
      const size = (this.account.bal * 0.30) / entry;
      
      this.account.open = {
        dir: sig.direction,
        entry,
        size,
        tp: sig.tp,
        sl: sig.sl,
        entryIdx: idx,
        entryTime: c.t,
        isLive: true
      };
      this.account.pending = null;
      
      await sendTelegramSignal(this.id, sig, entry);
      
      broadcast({
        type: 'position_opened',
        traderId: this.id,
        position: this.account.open
      });
    }

    const sigNow = signals.find(s => s.i === idx);
    if (sigNow && !this.account.open && !this.account.pending) {
      this.account.pending = sigNow;
    }

    if (this.account.open) {
      const { dir, entry, size, tp, sl } = this.account.open;
      let hitTP = false, hitSL = false;
      const R = Math.max(1e-9, Math.abs(entry - sl));

      if (dir === 'bullish') {
        if (c.high >= entry + R) this.account.open.sl = Math.max(this.account.open.sl, entry);
        if (c.high >= entry + 2 * R) {
          const trail = c.close - (c.atr || 50) * 1.4;
          if (trail > this.account.open.sl) this.account.open.sl = trail;
        }
        if (c.high >= tp) hitTP = true;
        if (c.low <= this.account.open.sl) hitSL = true;
        if (hitTP && hitSL) hitTP = false;
      } else {
        if (c.low <= entry - R) this.account.open.sl = Math.min(this.account.open.sl, entry);
        if (c.low <= entry - 2 * R) {
          const trail = c.close + (c.atr || 50) * 1.4;
          if (trail < this.account.open.sl) this.account.open.sl = trail;
        }
        if (c.low <= tp) hitTP = true;
        if (c.high >= this.account.open.sl) hitSL = true;
        if (hitTP && hitSL) hitTP = false;
      }

      if (hitTP || hitSL) {
        const ep = hitTP ? tp : this.account.open.sl;
        const pnl = dir === 'bullish' ? (ep - entry) * size : (entry - ep) * size;
        
        this.account.bal += pnl;
        if (this.account.bal > this.account.peak) this.account.peak = this.account.bal;
        const dd = (this.account.peak - this.account.bal) / this.account.peak;
        if (dd > this.account.maxDD) this.account.maxDD = dd;
        
        this.account.equity.push(this.account.bal);
        
        const trade = {
          id: uuidv4(),
          traderId: this.id,
          strategy: stratKey,
          direction: dir,
          entryTime: this.account.open.entryTime.getTime(),
          entryPrice: entry,
          exitPrice: ep,
          exitTime: c.t.getTime(),
          pnl,
          result: pnl / Math.abs(entry * size),
          hit: hitTP ? 'TP' : 'SL',
          isLive: true
        };
        
        this.account.trades.push(trade);
        this.account.open = null;
        
        await this.saveTrade(trade);
        await sendTelegramTrade(this.id, trade);
        
        broadcast({
          type: 'position_closed',
          traderId: this.id,
          trade,
          state: this.getPublicState()
        });
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
      isRunning: this.isRunning
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

// ═══════════════════════════════════════════════════════════
//  EXPRESS APP
// ═══════════════════════════════════════════════════════════
const app = express();
const server = http.createServer(app);

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
    const { name, timeframe, strategy, invertLogic, tpDistance } = req.body;
    const id = uuidv4();
    
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO traders (id, name, timeframe, strategy, invertLogic, tpDistance, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, name, timeframe, strategy, invertLogic ? 1 : 0, tpDistance || 50, Date.now()],
        (err) => err ? reject(err) : resolve()
      );
    });
    
    const config = { id, name, timeframe, strategy, invertLogic, tpDistance: tpDistance || 50 };
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
        tpDistance: trader.tpDistance
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
  
  server.listen(PORT, () => {
    console.log(`\n🚀 Market Physics Trader v2.0`);
    console.log(`📡 Server: http://localhost:${PORT}`);
    console.log(`🤖 Telegram: ${bot ? 'ACTIVE' : 'DISABLED'}`);
    console.log(`📊 Traders: ${traderEngines.size}`);
    console.log(`\n✨ Ready!\n`);
  });
}

startup();
