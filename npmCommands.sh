# 🚀 Market Physics Trader v2.0

Live BTC trading platform with Binance connection, Telegram signals, and persistent state.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Telegram (optional):**
   - Get bot token from [@BotFather](https://t.me/BotFather)
   - Edit `.env` and add your token

3. **Start server:**
   ```bash
   npm start
   ```

4. **Open dashboard:**
   - Go to `http://localhost:3000/dashboard.html`
   - Click **+ NEW TRADER** to create your first bot
   - View `strategyLab.html` for the original lab interface

## Files

- **`server.js`** - Main backend (Binance, Telegram, WebSocket, Database)
- **`dashboard.html`** - Trader management UI
- **`strategyLab.html`** - Original strategy lab interface
- **`trading.db`** - SQLite database (auto-created)
- **`.env`** - Environment variables

## Features

✅ Live Binance candle streaming
✅ Persistent trader state (survives restart)
✅ Telegram signal alerts
✅ WebSocket real-time updates
✅ V1 & V2 strategy support
✅ Invert logic toggle

## Safety

⚠️ **PAPER TRADING ONLY** - No real money at risk!

All trades are simulated with $10,000 virtual balance.npm install
npm start
