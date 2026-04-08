'use strict';
/**
 * Unified entry point.
 * Starts Trader Engine (PORT=3000) and Strategy Lab (LAB_PORT=3008)
 * as child processes with automatic restart on crash.
 *
 *   npm start       → node server.js
 *   npm run dev     → nodemon server.js
 */
require('dotenv').config();

const { fork }   = require('child_process');
const { exec }   = require('child_process');
const path       = require('path');
const net        = require('net');

const TRADER_PORT = parseInt(process.env.PORT    || '3000', 10);
const LAB_PORT    = parseInt(process.env.LAB_PORT || '3008', 10);

// ── Safely free a port by killing only the process holding it ─────────────
function freePort(port) {
  return new Promise(resolve => {
    exec(`lsof -ti:${port}`, (err, stdout) => {
      if (err || !stdout.trim()) return resolve();
      const pids = stdout.trim().split('\n').filter(Boolean);
      let done = 0;
      for (const pid of pids) {
        // Never kill Cursor / our own process
        if (parseInt(pid) === process.pid) { done++; if (done === pids.length) resolve(); continue; }
        exec(`kill ${pid}`, () => { done++; if (done === pids.length) resolve(); });
      }
    });
  });
}

// ── Spawn a child with exponential-backoff auto-restart ───────────────────
function spawnServer(file, label, port) {
  let restartDelay = 2000;

  function start() {
    const child = fork(path.join(__dirname, file), [], {
      env: { ...process.env },
      silent: false,
    });

    child.on('exit', (code, signal) => {
      if (code === null && signal) return; // killed intentionally
      console.error(`\n[${label}] exited (code=${code}). Restarting in ${restartDelay / 1000}s…`);
      setTimeout(async () => {
        await freePort(port);
        restartDelay = Math.min(restartDelay * 2, 30000);
        start();
      }, restartDelay);
    });

    child.on('error', err => console.error(`[${label}] fork error:`, err.message));
    restartDelay = 2000; // reset on successful start
    return child;
  }

  return start();
}

// ── Boot sequence ─────────────────────────────────────────────────────────
const children = new Set();

function killAllChildren() {
  for (const child of children) {
    try { child.kill('SIGTERM'); } catch {}
  }
  children.clear();
}

function spawnServerTracked(file, label, port) {
  const child = spawnServer(file, label, port);
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}

(async () => {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║    Market Physics Trader — Unified Server        ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Clear ports before starting children so restarts never conflict
  await freePort(TRADER_PORT);
  await freePort(LAB_PORT);
  await new Promise(r => setTimeout(r, 500));

  spawnServerTracked('trader_engine_manager.js', 'TRADER', TRADER_PORT);
  spawnServerTracked('lab_server.js',            'LAB   ', LAB_PORT);

  // Print quick-reference links once children have had time to boot
  setTimeout(() => {
    console.log('\n══════════════════════════════════════════════════');
    console.log(`  Home               → http://localhost:${TRADER_PORT}`);
    console.log(`  Hyperliquid Setup  → http://localhost:${TRADER_PORT}/hyperliquid_setup.html`);
    console.log(`  Trader Dashboard   → http://localhost:${TRADER_PORT}/MarketPhysicsTraderDashboard.html`);
    console.log(`  Strategy Lab       → http://localhost:${LAB_PORT}/strategyLab.html`);
    console.log(`  Lab Manager        → http://localhost:${LAB_PORT}/StrategyLabManager.html`);
    console.log(`  Quant Portal       → http://localhost:${TRADER_PORT}/quant_portal.html`);
    console.log('══════════════════════════════════════════════════\n');
  }, 3000);

  function shutdown(sig) {
    console.log(`\n[server.js] ${sig} — killing children and shutting down…`);
    killAllChildren();
    setTimeout(() => process.exit(0), 800);
  }
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
})();
