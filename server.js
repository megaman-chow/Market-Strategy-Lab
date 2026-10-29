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
const fs         = require('fs');
const net        = require('net');
const path       = require('path');
const os         = require('os');

const TRADER_PORT = parseInt(process.env.PORT    || '3000', 10);
const LAB_PORT    = parseInt(process.env.LAB_PORT || '3008', 10);
const LOCK_FILE   = path.join(__dirname, '.market-server.lock');

// ── Single-instance guard (stops previous server if still running) ───────────
async function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    const raw = fs.readFileSync(LOCK_FILE, 'utf8').trim();
    const oldPid = parseInt(raw, 10);
    if (oldPid && oldPid !== process.pid) {
      try {
        process.kill(oldPid, 0);
        console.log(`\n⚠ Stopping previous server (PID ${oldPid})…`);
        if (os.platform() === 'win32') {
          await new Promise(r => exec(`taskkill /PID ${oldPid} /T /F`, () => r()));
        } else {
          try { process.kill(oldPid, 'SIGTERM'); } catch {}
        }
        await new Promise(r => setTimeout(r, 1500));
      } catch {
        // stale lock — previous process already gone
      }
    }
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const raw = fs.readFileSync(LOCK_FILE, 'utf8').trim();
      if (parseInt(raw, 10) === process.pid) fs.unlinkSync(LOCK_FILE);
    }
  } catch {}
}

// ── Parse netstat line for an exact port (avoids :3000 matching :30008) ────
function pidFromNetstatLine(line, port) {
  if (!line.includes('LISTENING')) return null;
  if (!new RegExp(`:${port}\\s+`).test(line)) return null;
  const parts = line.trim().split(/\s+/);
  const pid = parts[parts.length - 1];
  return pid && /^\d+$/.test(pid) ? parseInt(pid, 10) : null;
}

// ── Safely free a port by killing only foreign LISTENING processes ─────────
function freePort(port, exceptPids = new Set()) {
  exceptPids.add(process.pid);

  return new Promise(resolve => {
    const finish = (ms = 900) => setTimeout(resolve, ms);

    if (os.platform() === 'win32') {
      exec(`netstat -ano | findstr LISTENING | findstr :${port}`, (err, stdout) => {
        if (err || !stdout || !stdout.trim()) return finish();
        const pids = new Set();
        for (const line of stdout.split('\n')) {
          const pid = pidFromNetstatLine(line, port);
          if (pid && !exceptPids.has(pid)) pids.add(pid);
        }
        if (!pids.size) return finish();
        let done = 0;
        for (const pid of pids) {
          exec(`taskkill /PID ${pid} /F`, () => {
            done++;
            if (done === pids.size) finish(1200);
          });
        }
      });
      return;
    }

    exec(`lsof -ti:${port} -sTCP:LISTEN`, (err, stdout) => {
      if (err || !stdout.trim()) return finish();
      const pids = stdout.trim().split('\n').filter(Boolean).map(Number);
      const targets = pids.filter(pid => !exceptPids.has(pid));
      if (!targets.length) return finish();
      let done = 0;
      for (const pid of targets) {
        exec(`kill ${pid}`, () => {
          done++;
          if (done === targets.length) finish(1200);
        });
      }
    });
  });
}

// ── Spawn a child with backoff auto-restart ─────────────────────────────────
function spawnServer(file, label, port, extraEnv) {
  let currentChild = null;

  function start() {
    if (currentChild) {
      try { currentChild.kill('SIGTERM'); } catch {}
      currentChild = null;
    }

    const child = fork(path.join(__dirname, file), [], {
      env: { ...process.env, ...extraEnv },
      silent: false,
    });
    currentChild = child;

    child.on('exit', (code, signal) => {
      if (currentChild === child) currentChild = null;
      if (code === null && signal) return; // intentional shutdown
      if (code === 0) return;
      console.error(`\n[${label}] stopped unexpectedly (code=${code}).`);
      console.error(`   Run: npm run stop && npm start\n`);
    });

    child.on('error', err => console.error(`[${label}] fork error:`, err.message));
    return child;
  }

  return { start, getChild: () => currentChild, getLabel: () => label };
}

function isPortListening(port) {
  return new Promise(resolve => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    setTimeout(() => { s.destroy(); resolve(false); }, 400);
  });
}

// ── Boot sequence ───────────────────────────────────────────────────────────
const runners = new Map();

function killAllChildren() {
  for (const r of runners.values()) {
    const c = r.getChild();
    if (c) try { c.kill('SIGTERM'); } catch {}
  }
}

(async () => {
  await acquireLock();

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║    Market Physics Trader — Unified Server        ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  console.log('Clearing ports…');
  await freePort(TRADER_PORT);
  await freePort(LAB_PORT);
  await new Promise(r => setTimeout(r, 1200));

  const busyTrader = await isPortListening(TRADER_PORT);
  const busyLab = await isPortListening(LAB_PORT);
  if (busyTrader || busyLab) {
    console.error('\n❌ Ports still in use after cleanup.');
    if (busyTrader) console.error(`   • ${TRADER_PORT} (trader / Rolex API)`);
    if (busyLab) console.error(`   • ${LAB_PORT} (strategy lab)`);
    console.error('\n   Stop every other terminal running npm start (Ctrl+C), then run:');
    console.error('   npm run stop && npm start\n');
    releaseLock();
    process.exit(1);
  }

  const traderRunner = spawnServer(
    'trader_engine_manager.js', 'TRADER', TRADER_PORT,
    { PORT: String(TRADER_PORT) }
  );
  const labRunner = spawnServer(
    'lab_server.js', 'LAB   ', LAB_PORT,
    { LAB_PORT: String(LAB_PORT) }
  );

  runners.set('TRADER', traderRunner);
  runners.set('LAB', labRunner);

  // Stagger starts so both children never race for the same cleanup window
  traderRunner.start();
  await new Promise(r => setTimeout(r, 5000));
  labRunner.start();

  setTimeout(() => {
    console.log('\n══════════════════════════════════════════════════');
    console.log(`  Home               → http://localhost:${TRADER_PORT}`);
    console.log(`  Hyperliquid Setup  → http://localhost:${TRADER_PORT}/hyperliquid_setup.html`);
    console.log(`  Trader Dashboard   → http://localhost:${TRADER_PORT}/MarketPhysicsTraderDashboard.html`);
    console.log(`  V4 Dashboard       → http://localhost:${TRADER_PORT}/v4`);
    console.log(`  Strategy Lab       → http://localhost:${LAB_PORT}/strategyLab.html`);
    console.log(`  Lab Manager        → http://localhost:${LAB_PORT}/StrategyLabManager.html`);
    console.log(`  Quant Portal       → http://localhost:${TRADER_PORT}/quant_portal.html`);
    console.log(`  ⌚ Rolex Home        → http://localhost:${TRADER_PORT}/RolexHome.html`);
    console.log(`  ⌚ Rolex Dashboard   → http://localhost:${TRADER_PORT}/RolexStrategy.html`);
    console.log('══════════════════════════════════════════════════\n');
  }, 3000);

  async function shutdown(sig) {
    console.log(`\n[server.js] ${sig} — shutting down…`);
    killAllChildren();
    await new Promise(r => setTimeout(r, 400));
    await freePort(TRADER_PORT);
    await freePort(LAB_PORT);
    releaseLock();
    process.exit(0);
  }

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('exit', releaseLock);
})();
