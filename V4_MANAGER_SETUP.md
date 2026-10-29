# V4 Strategy Lab integration

## Files

- `strategy_lab_manager_v4.js` — integrated Strategy Lab manager reconstructed from the manager source shared in chat, with V4 registered.
- `v4_market_adapter.js` — V4-inspired experimental market signal adapter.
- `v4_adapter_self_test.js` — deterministic test for the adapter.

## Install dependencies

Run from the Strategy Lab project directory if these packages are not already installed:

```bash
npm install express ws node-binance-api sqlite3 uuid dotenv
```

The manager also expects the existing `port_listen.js` and `StrategyLabManager.html` files in the same project directory.

## Install these files

1. Back up your current `strategy_lab_manager.js` and `strategy_lab.db`.
2. Copy `strategy_lab_manager_v4.js` into the project directory.
3. Copy `v4_market_adapter.js` and `v4_adapter_self_test.js` into that same directory.
4. Run the validation commands below.
5. Start using `node strategy_lab_manager_v4.js`. Once the integration is accepted, you can rename it to `strategy_lab_manager.js` if that matches your normal launch command.

## Validation

```bash
node --check strategy_lab_manager_v4.js
node --check v4_market_adapter.js
node v4_adapter_self_test.js
```

## What changed

- Registered `v4` alongside `v1` and `v2`.
- Added a V4 adapter call in `StrategyLabModel.detectSignals()`.
- Kept the existing TP/SL mapping and trade simulation pipeline.
- Changed configuration IDs to stable, deterministic IDs, so backtests can save and retrieve performance under the same ID.
- Deactivated same-name legacy configurations with old random IDs to prevent duplicate leaderboard entries.
- Corrected the EMA seed calculation and corrected the V2 indicator null checks.
- Restricted candle processing during a live session to the selected leaderboard winners.

## Important limits

- The adapter is an experimental technical market model inspired by the V4 theory; it is not derived from the physics equation and has not been shown to be profitable.
- The manager reads Binance Futures BTCUSDT candles and simulates trades. It does not submit real orders to Binance.
- The source passes Node syntax checks and the adapter self-test passes. A full server/database integration run must be done in the user's project environment because the server dependencies, `port_listen.js`, and project database were not available in the generation environment.
- Backtest results should be checked for trading fees, slippage, out-of-sample performance, intrabar TP/SL ambiguity, and look-ahead bias before trusting them.
