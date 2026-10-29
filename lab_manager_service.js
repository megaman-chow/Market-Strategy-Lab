┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (strategyLab.html + new labManager.html)         │
│  ├─ Select timeframe, strategy, invert, TP                 │
│  ├─ View leaderboard of winning configs                    │
│  └─ Connect to Binance (testnet/live)                      │
└─────────────────────────────────────────────────────────────┘
                              ↓ WebSocket
┌─────────────────────────────────────────────────────────────┐
│  BACKEND (lab_server.js - NEW)                             │
│  ├─ Strategy Lab Manager (runs permutations)               │
│  ├─ State persistence (save/load all models)               │
│  ├─ Binance streaming with error recovery                  │
│  └─ Leaderboard ranking (Sharpe, WR, PF)                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  DATABASE (trading.db - EXTENDED)                           │
│  ├─ strategy_configs (all tested permutations)             │
│  ├─ model_performance (scores, trades, equity curves)      │
│  ├─ candles (cached historical + live data)                │
│  └─ live_sessions (resume ability)                         │
└─────────────────────────────────────────────────────────────┘
