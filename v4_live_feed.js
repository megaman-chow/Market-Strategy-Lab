'use strict';

/**
 * Live V4 feed for the trader dashboard.
 * Computes market-adapter snapshots from engine candles, proxies lab
 * leaderboard rows, and caches theory self-test JSON for the frontend.
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { computeV4Features, detectV4Signals } = require('./v4_market_adapter');

const LAB_PORT = parseInt(process.env.LAB_PORT || '3008', 10);
const THEORY_SCRIPT = path.join(__dirname, 'v4_theory_v0_2.py');

let theoryCache = {
  ok: false,
  ready: false,
  running: false,
  error: 'not started',
  updatedAt: null,
};

function snapshotFromCandles(candles, options = {}) {
  if (!Array.isArray(candles) || candles.length < 60) {
    return {
      ready: false,
      reason: candles && candles.length ? `warmup ${candles.length}/60` : 'no candles',
      candleCount: candles ? candles.length : 0,
    };
  }

  const index = candles.length - 1;
  const features = computeV4Features(candles, index, options);
  const signals = detectV4Signals(candles, options);
  const lastSignals = signals.slice(-8).map((signal) => ({
    i: signal.i,
    direction: signal.direction,
    v4Score: signal.v4Score,
    confidence: signal.confidence,
    v4Features: signal.v4Features,
  }));

  const last = lastSignals[lastSignals.length - 1] || null;
  const candle = candles[index];

  return {
    ready: true,
    index,
    candleCount: candles.length,
    close: candle && candle.close,
    openTime: candle && (candle.openTime || candle.t),
    features,
    lastSignals: lastSignals.reverse(),
    signalCount: signals.length,
    lastSignal: last,
    bias: features
      ? (features.score >= 0.42 ? 'bullish' : features.score <= -0.42 ? 'bearish' : 'neutral')
      : 'neutral',
  };
}

function engineFeed(engine) {
  if (!engine) return null;
  const snapshot = engine.v4Snapshot || snapshotFromCandles(engine.candles || []);
  const lastV4 = (engine.signals && engine.signals.v4) ? engine.signals.v4.slice(-5) : [];
  return {
    id: engine.id,
    name: engine.config && engine.config.name,
    strategy: engine.config && engine.config.strategy,
    timeframe: engine.config && engine.config.timeframe,
    symbol: engine.symbol,
    isRunning: !!engine.isRunning,
    pnl: engine.account ? engine.account.bal - 10000 : 0,
    trades: engine.account && engine.account.trades ? engine.account.trades.length : 0,
    openPosition: engine.account ? engine.account.open : null,
    pendingSignal: engine.account ? engine.account.pending : null,
    v4: snapshot,
    lastV4Signals: lastV4.map((s) => ({
      i: s.i,
      direction: s.direction,
      v4Score: s.v4Score,
      tp: s.tp,
      sl: s.sl,
    })),
  };
}

function pickLatest(engines) {
  const feeds = engines.map(engineFeed).filter(Boolean);
  const withReady = feeds.filter((f) => f.v4 && f.v4.ready);
  if (withReady.length) {
    const v4First = withReady.find((f) => f.strategy === 'v4');
    return v4First || withReady[0];
  }
  return feeds[0] || null;
}

function httpJson(url, timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function fetchLabV4() {
  try {
    const data = await httpJson(`http://127.0.0.1:${LAB_PORT}/api/lab/v4`);
    return { ok: true, ...data };
  } catch (err) {
    return { ok: false, error: err.message, live: false, leaderboard: [] };
  }
}

function pythonCommands() {
  return process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
}

function spawnTheory(cmd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, ['-u', THEORY_SCRIPT, '--json'], {
      cwd: __dirname,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('theory timed out'));
    }, 25000);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (!stdout.trim()) {
        reject(new Error(stderr.trim() || `python exit ${code}`));
        return;
      }
      try {
        const start = stdout.indexOf('{');
        const end = stdout.lastIndexOf('}');
        if (start < 0 || end < start) throw new Error('no JSON object in theory output');
        resolve(JSON.parse(stdout.slice(start, end + 1)));
      } catch (err) {
        reject(new Error(`theory JSON parse failed: ${err.message}`));
      }
    });
  });
}

async function refreshTheory() {
  if (theoryCache.running) return theoryCache;
  theoryCache.running = true;
  const cmds = pythonCommands();
  let lastErr = 'python not found';
  for (const cmd of cmds) {
    try {
      const report = await spawnTheory(cmd);
      theoryCache = {
        ready: true,
        running: false,
        ok: !!report.ok,
        error: null,
        updatedAt: Date.now(),
        ...report,
      };
      return theoryCache;
    } catch (err) {
      lastErr = err.message;
    }
  }
  theoryCache = {
    ...theoryCache,
    ready: true,
    running: false,
    ok: false,
    error: lastErr,
    updatedAt: Date.now(),
  };
  return theoryCache;
}

function startTheoryLoop() {
  refreshTheory().catch(() => {});
  setInterval(() => {
    refreshTheory().catch(() => {});
  }, 60000);
}

async function buildStatus(engines) {
  const list = [...(engines || [])];
  const lab = await fetchLabV4();
  const latest = pickLatest(list);
  return {
    updatedAt: Date.now(),
    theory: theoryCache,
    lab,
    latest,
    engines: list.map(engineFeed).filter(Boolean),
  };
}

module.exports = {
  snapshotFromCandles,
  engineFeed,
  buildStatus,
  startTheoryLoop,
  refreshTheory,
  getTheory: () => theoryCache,
};
