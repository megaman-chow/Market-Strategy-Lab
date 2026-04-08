require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Binance = require('node-binance-api');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

// ═══════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════
const PORT = process.env.LAB_PORT || 3001;
const BINANCE_API_KEY = process.env.BINANCE_API_KEY || '';
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET || '';
const USE_TESTNET = process.env.USE_TESTNET === 'true';

// ═══════════════════════════════════════════════════════════
//  DATABASE
// ═══════════════════════════════════════════════════════════
const db = new sqlite3.Database('./strategy_lab.db', (err) => {
  if (err) console.error('❌ Database error:', err);
  else console.log('✓ Strategy Lab Database connected');
});

db.serialize(() => {
  // Strategy configurations
  db.run(`CREATE TABLE IF NOT EXISTS strategy_configs (
    id TEXT PRIMARY KEY,
    name TEXT,
    timeframe TEXT,
    strategy TEXT,
    invertLogic INTEGER,
    tpDistance INTEGER,
    createdAt INTEGER,
    isActive INTEGER DEFAULT 1
  )`);

  // Model performance metrics
  db.run(`CREATE TABLE IF NOT EXISTS model_performance (
    id TEXT PRIMARY KEY,
    configId TEXT,
    totalTrades INTEGER,
    winRate REAL,
    avgReturn REAL,
    sharpeRatio REAL,
    profitFactor REAL,
    maxDrawdown REAL,
    finalBalance REAL,
    score REAL,
    equityCurve TEXT,
    lastUpdated INTEGER,
    FOREIGN KEY (configId) REFERENCES strategy_configs(id)
  )`);

  // Candles cache (shared across all models)
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
    indicators TEXT,
    isLive INTEGER,
    UNIQUE(timeframe, openTime)
  )`);

  // Live sessions (for resume)
  db.run(`CREATE TABLE IF NOT EXISTS live_sessions (
    id TEXT PRIMARY KEY,
    configIds TEXT,
    startTime INTEGER,
    liveCandles INTEGER,
    isPaused INTEGER,
    lastCandleTime INTEGER
  )`);

  // Trades log
  db.run(`CREATE TABLE IF NOT EXISTS lab_trades (
    id TEXT PRIMARY KEY,
    configId TEXT,
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
    FOREIGN KEY (configId) REFERENCES strategy_configs(id)
  )`);
});

// ═══════════════════════════════════════════════════════════
//  BINANCE CONNECTION
// ═══════════════════════════════════════════════════════════
const binanceOptions = {
  APIKEY: BINANCE_API_KEY,
  APISECRET: BINANCE_API_SECRET,
  useServerTime: true,
  family: 4
};

if (USE_TESTNET) {
  binanceOptions.test = true;
  console.log('⚠️  Using TESTNET');
}

const binance = new Binance().options(binanceOptions);

// ═══════════════════════════════════════════════════════════
//  STRATEGY LAB ENGINE
// ═══════════════════════════════════════════════════════════
class StrategyLabModel {
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
    this.signals = [];
    this.performance = null;
  }

  // Run backtest on historical data
  backtest(candles) {
    this.candles = [...candles];
    this.buildIndicators();
    this.detectSignals();

    for (let i = 0; i < this.candles.length; i++) {
      this.processCandle(i, false);
    }

    this.calculatePerformance();
    return this.performance;
  }

  // Process live candle
  processLiveCandle(candle) {
    this.candles.push(candle);
    this.buildIndicators();
    this.detectSignals();
    this.processCandle(this.candles.length - 1, true);
    this.calculatePerformance();
  }

  processCandle(idx, isLive) {
    const c = this.candles[idx];

    // Enter pending position
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
        isLive
      };
      this.account.pending = null;
    }

    // Check for new signal
    const sigNow = this.signals.find(s => s.i === idx);
    if (sigNow && !this.account.open && !this.account.pending) {
      this.account.pending = sigNow;
    }

    // Manage open position
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
          configId: this.id,
          strategy: this.config.strategy,
          direction: dir,
          entryTime: this.account.open.entryTime.getTime(),
          entryPrice: entry,
          exitPrice: ep,
          exitTime: c.t.getTime(),
          pnl,
          result: pnl / Math.abs(entry * size),
          hit: hitTP ? 'TP' : 'SL',
          isLive
        };

        this.account.trades.push(trade);
        this.account.open = null;

        if (isLive) {
          this.saveTrade(trade);
          broadcast({
            type: 'trade_closed',
            configId: this.id,
            trade,
            balance: this.account.bal
          });
        }
      }
    }
  }

  buildIndicators() {
    // Physics
    for (let i = 0; i < this.candles.length; i++) {
      this.candles[i].vel = i === 0 ? 0 : this.candles[i].close - this.candles[i - 1].close;
      this.candles[i].vn = this.candles[i].vel / this.candles[i].close;
    }
    for (let i = 0; i < this.candles.length; i++) {
      this.candles[i].acc = i === 0 ? 0 : this.candles[i].vel - this.candles[i - 1].vel;
      this.candles[i].an = this.candles[i].acc / this.candles[i].close;
      this.candles[i].vp = i === 0 ? 0 : this.candles[i - 1].vn;
    }

    // EMAs
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

    // RSI
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

    // ATR
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

    // Volume MA
    const calcVolMA = (p = 20) => {
      return this.candles.map((_, i) =>
        i < p ? null : this.candles.slice(i - p, i).reduce((a, c) => a + c.volume, 0) / p
      );
    };

    const volma = calcVolMA();

    this.candles.forEach((c, i) => {
      c.ema20 = ema20[i];
      c.ema50 = ema50[i];
      c.rsi = rsi[i];
      c.atr = atr[i];
      c.volma = volma[i];
    });
  }

  detectSignals() {
    const invert = this.config.invertLogic;
    const invDir = (d) => d === 'bullish' ? 'bearish' : 'bullish';
    const effDir = (d) => invert ? invDir(d) : d;

    const sigs = [];

    if (this.config.strategy === 'v1') {
      for (let i = 2; i < this.candles.length; i++) {
        const c = this.candles[i];
        const b = Math.abs(c.close - c.open);
        const uw = Math.max(0, c.high - Math.max(c.open, c.close));
        const lw = Math.max(0, Math.min(c.open, c.close) - c.low);
        const r = Math.max(1e-9, c.high - c.low);
        const uwr = uw / r, lwr = lw / r;

        if (lwr > 0.6 && c.vn > 0 && c.vp < 0 && c.an > 0) {
          sigs.push({ i, direction: effDir('bullish') });
        }
        if (uwr > 0.6 && c.vn < 0 && c.vp > 0 && c.an < 0) {
          sigs.push({ i, direction: effDir('bearish') });
        }
      }
    } else if (this.config.strategy === 'v2') {
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
          sigs.push({ i, direction: effDir('bullish') });
        }
        if (bearReg && sep && pullS && momS && rsiS && volOk) {
          sigs.push({ i, direction: effDir('bearish') });
        }
      }
    }

    this.signals = sigs.map(s => {
      const c = this.candles[s.i];
      const a = c.atr || Math.max(50, c.close * 0.002);
      const tpOff = Math.max(this.config.tpDistance, a * 2.6);
      const slOff = Math.max(this.config.tpDistance / 2, a * 1.3);
      const base = c.close;
      const tp = s.direction === 'bullish' ? base + tpOff : base - tpOff;
      const sl = s.direction === 'bullish' ? base - slOff : base + slOff;
      return { ...s, tpOff, slOff, tp, sl, atr: a };
    });
  }

  calculatePerformance() {
    const trades = this.account.trades;
    if (!trades.length) {
      this.performance = { score: 0, message: 'No trades' };
      return;
    }

    const wins = trades.filter(t => t.pnl > 0).length;
    const wr = wins / trades.length;
    const returns = trades.map(t => t.result);
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((a, b) => a + (b - avg) ** 2, 0) / returns.length) || 1e-9;

    const bpd = { '5m': 288, '15m': 96, '1h': 24, '4h': 6, '1d': 1 }[this.config.timeframe] || 24;
    const sharpe = (avg / std) * Math.sqrt(252 * bpd);

    const gw = returns.filter(r => r > 0).reduce((a, b) => a + b, 0);
    const gl = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0));
    const pf = gl > 0 ? gw / gl : gw > 0 ? 999 : 0;

    const wrS = Math.min(10, wr * 16);
    const shS = Math.min(10, Math.max(0, (sharpe + 1) * 3.33));
    const avgS = Math.min(10, Math.max(0, (avg * 1000 + 2) * 2));
    const pfS = Math.min(10, pf * 2.5);
    const cntS = Math.min(10, trades.length / 5);

    const score = wrS * 0.30 + shS * 0.25 + avgS * 0.20 + pfS * 0.15 + cntS * 0.10;

    this.performance = {
      totalTrades: trades.length,
      winRate: wr,
      avgReturn: avg,
      sharpeRatio: sharpe,
      profitFactor: pf,
      maxDrawdown: this.account.maxDD,
      finalBalance: this.account.bal,
      score,
      equityCurve: this.account.equity
    };
  }

  async saveState() {
    return new Promise((resolve, reject) => {
      if (!this.performance) {
        return resolve();
      }

      db.run(
        `INSERT OR REPLACE INTO model_performance 
         (id, configId, totalTrades, winRate, avgReturn, sharpeRatio, profitFactor, maxDrawdown, finalBalance, score, equityCurve, lastUpdated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.id,
          this.id,
          this.performance.totalTrades,
          this.performance.winRate,
          this.performance.avgReturn,
          this.performance.sharpeRatio,
          this.performance.profitFactor,
          this.performance.maxDrawdown,
          this.performance.finalBalance,
          this.performance.score,
          JSON.stringify(this.performance.equityCurve),
          Date.now()
        ],
        (err) => err ? reject(err) : resolve()
      );
    });
  }

  async saveTrade(trade) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO lab_trades (id, configId, strategy, direction, entryTime, entryPrice, exitPrice, exitTime, pnl, result, hit, isLive)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          trade.id,
          trade.configId,
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

  toJSON() {
    return {
      id: this.id,
      config: this.config,
      account: this.account,
      signals: this.signals.length,
      performance: this.performance
    };
  }
}

// ═══════════════════════════════════════════════════════════
//  LAB MANAGER
// ═══════════════════════════════════════════════════════════
class StrategyLabManager {
  constructor() {
    this.models = new Map();
    this.liveSession = null;
    this.candleCache = new Map();
    this.isRunning = false;
    this.pollInterval = null;
  }

  // Generate all permutations
  generatePermutations() {
    const timeframes = ['5m', '15m', '1h', '4h', '1d'];
    const strategies = ['v1', 'v2'];
    const inverts = [false, true];
    const tpDistances = [30, 50, 75];

    const configs = [];
    for (const tf of timeframes) {
      for (const strat of strategies) {
        for (const inv of inverts) {
          for (const tp of tpDistances) {
            configs.push({
              id: uuidv4(),
              name: `${strat.toUpperCase()}_${tf}_${inv ? 'INV' : 'NORM'}_TP${tp}`,
              timeframe: tf,
              strategy: strat,
              invertLogic: inv,
              tpDistance: tp
            });
          }
        }
      }
    }

    return configs;
  }

  // Run backtest on all models
  async runBacktests(timeframe) {
    console.log(`\n🔬 Running backtests for ${timeframe}...`);

    const candles = await this.loadCandles(timeframe);
    if (!candles.length) {
      console.log('❌ No candles available');
      return;
    }

    const configs = this.generatePermutations().filter(c => c.timeframe === timeframe);
    console.log(`📊 Testing ${configs.length} configurations...`);

    for (const config of configs) {
      const model = new StrategyLabModel(config);
      model.backtest(candles);
      await model.saveState();
      this.models.set(config.id, model);
    }

    console.log(`✅ Backtest complete. ${this.models.size} models ready.`);
    broadcast({ type: 'backtest_complete', modelCount: this.models.size });
  }

  // Start live trading with winning models
  async startLive(timeframe, topN = 10) {
    if (this.isRunning) {
      console.log('⚠️  Already running');
      return;
    }

    console.log(`\n🚀 Starting live session for ${timeframe}...`);

    // Get top performing models
    const ranked = await this.getLeaderboard(timeframe);
    const winners = ranked.slice(0, topN);

    if (!winners.length) {
      console.log('⚠️  No ranked models found — run a backtest first.');
      return;
    }

    console.log(`📈 Selected top ${winners.length} models:`);
    winners.forEach((w, i) => {
      console.log(`  ${i + 1}. ${w.name} - Score: ${w.performance.score.toFixed(2)}`);
    });

    // Hydrate any winners not already in memory (cold start after process restart)
    const missing = winners.filter(w => !this.models.has(w.id));
    if (missing.length > 0) {
      console.log(`♻️  Hydrating ${missing.length} model(s) from historical data...`);
      const candles = await this.loadCandles(timeframe);
      for (const w of missing) {
        const model = new StrategyLabModel({
          id: w.id,
          name: w.name,
          timeframe: w.timeframe,
          strategy: w.strategy,
          invertLogic: w.invertLogic,
          tpDistance: w.tpDistance,
        });
        model.backtest(candles);
        this.models.set(w.id, model);
      }
      console.log(`✅ Hydrated ${missing.length} model(s)`);
    }

    this.isRunning = true;

    const pollMs = { '5m': 10000, '15m': 20000, '1h': 30000, '4h': 60000, '1d': 120000 }[timeframe] || 30000;
    this.pollInterval = setInterval(() => this.pollLive(timeframe), pollMs);
    this.pollLive(timeframe); // Immediate first poll

    broadcast({ type: 'live_started', timeframe, models: winners.length });
  }

  async pollLive(timeframe) {
    try {
      const fresh = await binance.futuresCandles('BTCUSDT', timeframe, { limit: 3 });

      for (const k of fresh) {
        const openTime = k[0];
        const isClosed = k[6] < Date.now() - 1000;

        if (!isClosed) continue;

        const cacheKey = `${timeframe}_${openTime}`;
        if (this.candleCache.has(cacheKey)) continue;

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

        this.candleCache.set(cacheKey, candle);
        await this.saveCandle(candle, timeframe);

        // Process in all active models
        for (const [id, model] of this.models.entries()) {
          if (model.config.timeframe === timeframe) {
            model.processLiveCandle(candle);
            await model.saveState();
          }
        }

        console.log(`🕯 New ${timeframe} candle @ $${candle.close.toFixed(2)}`);
        broadcast({
          type: 'new_candle',
          timeframe,
          candle,
          leaderboard: await this.getLeaderboard(timeframe)
        });
      }
    } catch (error) {
      console.error('❌ Poll error:', error.message);
    }
  }

  stopLive() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
    console.log('⏸ Live session stopped');
    broadcast({ type: 'live_stopped' });
  }

  async loadCandles(timeframe) {
    try {
      const data = await binance.futuresCandles('BTCUSDT', timeframe, { limit: 500 });
      return data.map(k => ({
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
    } catch (error) {
      console.error('Failed to load candles:', error);
      return [];
    }
  }

  async saveCandle(candle, timeframe) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT OR IGNORE INTO candles (id, timeframe, openTime, closeTime, open, high, low, close, volume, isLive)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `${timeframe}_${candle.openTime}`,
          timeframe,
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

  async getLeaderboard(timeframe = null) {
    return new Promise((resolve, reject) => {
      const sql = timeframe
        ? `SELECT c.*, p.* FROM strategy_configs c 
           JOIN model_performance p ON c.id = p.configId 
           WHERE c.timeframe = ? AND c.isActive = 1 
           ORDER BY p.score DESC`
        : `SELECT c.*, p.* FROM strategy_configs c 
           JOIN model_performance p ON c.id = p.configId 
           WHERE c.isActive = 1 
           ORDER BY p.score DESC`;

      const params = timeframe ? [timeframe] : [];

      db.all(sql, params, (err, rows) => {
        if (err) return reject(err);

        const results = rows.map(row => ({
          id: row.id,
          name: row.name,
          timeframe: row.timeframe,
          strategy: row.strategy,
          invertLogic: row.invertLogic === 1,
          tpDistance: row.tpDistance,
          performance: {
            totalTrades: row.totalTrades,
            winRate: row.winRate,
            avgReturn: row.avgReturn,
            sharpeRatio: row.sharpeRatio,
            profitFactor: row.profitFactor,
            maxDrawdown: row.maxDrawdown,
            finalBalance: row.finalBalance,
            score: row.score,
            equityCurve: JSON.parse(row.equityCurve || '[10000]')
          }
        }));

        resolve(results);
      });
    });
  }

  async saveAllConfigs() {
    const configs = this.generatePermutations();
    for (const config of configs) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT OR IGNORE INTO strategy_configs (id, name, timeframe, strategy, invertLogic, tpDistance, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [config.id, config.name, config.timeframe, config.strategy, config.invertLogic ? 1 : 0, config.tpDistance, Date.now()],
          (err) => err ? reject(err) : resolve()
        );
      });
    }
    console.log(`✅ Saved ${configs.length} strategy configurations`);
  }
}

const labManager = new StrategyLabManager();

// ═══════════════════════════════════════════════════════════
//  EXPRESS API
// ═══════════════════════════════════════════════════════════
const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(__dirname));

// Get leaderboard
app.get('/api/lab/leaderboard', async (req, res) => {
  try {
    const { timeframe } = req.query;
    const leaderboard = await labManager.getLeaderboard(timeframe);
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Run backtest
app.post('/api/lab/backtest', async (req, res) => {
  try {
    const { timeframe } = req.body;
    await labManager.runBacktests(timeframe);
    res.json({ success: true, message: 'Backtest complete' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start live trading
app.post('/api/lab/live/start', async (req, res) => {
  try {
    const { timeframe, topN } = req.body;
    await labManager.startLive(timeframe, topN || 10);
    res.json({ success: true, message: 'Live trading started' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop live trading
app.post('/api/lab/live/stop', async (req, res) => {
  try {
    labManager.stopLive();
    res.json({ success: true, message: 'Live trading stopped' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get model details
app.get('/api/lab/models/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const model = labManager.models.get(id);
    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }
    res.json(model.toJSON());
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
  console.log('\n🔬 Market Physics Strategy Lab');
  console.log('════════════════════════════════════════════\n');

  await labManager.saveAllConfigs();

  server.listen(PORT, () => {
    console.log(`\n📡 Lab Server: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log(`📊 Database: strategy_lab.db\n`);
    console.log(`✨ Ready! Visit /StrategyLabManager.html to start\n`);
  });
}

startup();
