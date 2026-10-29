'use strict';
/** Stop the unified server and free ports 3000 + 3008 (Windows-friendly). */
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

const { killNodeServers } = require('./kill_node_servers');

const ROOT = path.join(__dirname, '..');
const LOCK_FILE = path.join(ROOT, '.market-server.lock');
const TRADER_PORT = parseInt(process.env.PORT || '3000', 10);
const LAB_PORT = parseInt(process.env.LAB_PORT || '3008', 10);

function pidFromLine(line, port) {
  if (!line.includes('LISTENING')) return null;
  if (!new RegExp(`:${port}\\s+`).test(line)) return null;
  const parts = line.trim().split(/\s+/);
  const pid = parts[parts.length - 1];
  return pid && /^\d+$/.test(pid) ? parseInt(pid, 10) : null;
}

function killPort(port) {
  return new Promise(resolve => {
    if (os.platform() === 'win32') {
      exec(`netstat -ano | findstr LISTENING | findstr :${port}`, (err, stdout) => {
        const pids = new Set();
        if (!err && stdout) {
          for (const line of stdout.split('\n')) {
            const pid = pidFromLine(line, port);
            if (pid) pids.add(pid);
          }
        }
        if (!pids.size) return resolve();
        let done = 0;
        for (const pid of pids) {
          exec(`taskkill /PID ${pid} /F`, () => {
            done++;
            if (done === pids.size) resolve();
          });
        }
      });
      return;
    }
    exec(`lsof -ti:${port} -sTCP:LISTEN`, (err, stdout) => {
      const pids = (stdout || '').trim().split('\n').filter(Boolean);
      if (!pids.length) return resolve();
      let done = 0;
      for (const pid of pids) {
        exec(`kill ${pid}`, () => {
          done++;
          if (done === pids.length) resolve();
        });
      }
    });
  });
}

async function main() {
  if (fs.existsSync(LOCK_FILE)) {
    const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
    if (pid) {
      if (os.platform() === 'win32') {
        await new Promise(r => exec(`taskkill /PID ${pid} /T /F`, () => r()));
        console.log(`Stopped server tree PID ${pid}`);
      } else {
        try {
          process.kill(pid, 'SIGTERM');
          console.log(`Sent SIGTERM to server PID ${pid}`);
        } catch {
          console.log('Lock file present but process already stopped.');
        }
      }
    }
    try { fs.unlinkSync(LOCK_FILE); } catch {}
  }

  await killNodeServers();
  await new Promise(r => setTimeout(r, 1200));
  await killPort(TRADER_PORT);
  await killPort(LAB_PORT);
  await new Promise(r => setTimeout(r, 800));
  await killPort(TRADER_PORT);
  await killPort(LAB_PORT);
  console.log(`Ports ${TRADER_PORT} and ${LAB_PORT} cleared.`);
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
