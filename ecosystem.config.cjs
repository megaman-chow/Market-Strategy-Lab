/**
 * PM2 process file — keeps the unified server (trader :3000 + lab :3008) running.
 *
 *   npm run pm2:start
 *   npm run pm2:logs
 *   npm run pm2:stop
 *
 * Requires PM2:  npm install -g pm2   OR   npx pm2 ...
 */
module.exports = {
  apps: [
    {
      name: 'market-physics-trader',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 30,
      min_uptime: '8s',
      exp_backoff_restart_delay: 2000,
      max_memory_restart: '750M',
      // server.js loads dotenv — run from project root (cwd above)
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
