'use strict';

/** Bind an http.Server with retries when the port is temporarily busy (EADDRINUSE). */
async function listenWithRetry(server, port, onReady, label = 'server') {
  const max = 8;

  for (let i = 1; i <= max; i++) {
    try {
      await new Promise((resolve, reject) => {
        const onErr = (err) => reject(err);
        server.once('error', onErr);
        server.listen(port, () => {
          server.removeListener('error', onErr);
          resolve();
        });
      });
      if (onReady) onReady();
      return;
    } catch (err) {
      if (err.code !== 'EADDRINUSE' || i === max) {
        console.error(`\n❌ Could not bind port ${port}: ${err.message}`);
        console.error('   Run: npm run stop && npm start');
        process.exit(1);
      }
      console.warn(`[${label}] Port ${port} busy — retry ${i}/${max} in 2s…`);
      await new Promise((r) => setTimeout(r, 2000));
      if (server.listening) {
        await new Promise((r) => server.close(() => r()));
      }
    }
  }
}

module.exports = { listenWithRetry };
