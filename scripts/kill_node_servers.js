'use strict';
/** Kill orphaned Market Physics / Rolex node processes (Windows-friendly). */
const { exec } = require('child_process');
const os = require('os');

function killNodeServers(exceptPid = process.pid) {
  return new Promise((resolve) => {
    if (os.platform() !== 'win32') return resolve();

    const ps = [
      'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" |',
      'Where-Object { $_.ProcessId -ne ' + exceptPid + ' -and $_.CommandLine -match \'server\\.js|trader_engine_manager|lab_server|strategy_lab_manager\' } |',
      'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    ].join(' ');

    exec(`powershell -NoProfile -Command "${ps}"`, () => resolve());
  });
}

module.exports = { killNodeServers };
