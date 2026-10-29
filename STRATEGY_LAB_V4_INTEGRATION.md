# Connect V4 to `strategy_lab_manager.js`

## Important distinction

- `v4_theory_v0_2.py` is a Python/SymPy research tool for symbolic field-theory calculations. The Node strategy manager does not call it.
- `v4_market_adapter.js` is the optional JavaScript trading-signal adapter that lets the Strategy Lab test an experimental market model called `v4`.
- The market adapter is an analogy/modeling choice, not a prediction derived from the physics equation. Backtest it as an experimental strategy.

## 1. Put the adapter beside the manager

Place `v4_market_adapter.js` in the same directory as `strategy_lab_manager.js`.

## 2. Add the import

Near the other `require(...)` statements at the top of `strategy_lab_manager.js`, add:

```js
const { detectV4Signals } = require('./v4_market_adapter');
```

## 3. Register V4 in configuration generation

Inside `StrategyLabManager.generatePermutations()`, find:

```js
const strategies = ['v1', 'v2'];
```

Replace it with:

```js
const strategies = ['v1', 'v2', 'v4'];
```

## 4. Add the V4 branch in `StrategyLabModel.detectSignals()`

Find the `if (this.config.strategy === 'v1') ... else if (this.config.strategy === 'v2') ...` chain. After the complete V2 branch and before the chain's closing brace (and before `this.signals = sigs.map(...)`), add this branch:

```js
    } else if (this.config.strategy === 'v4') {
      const v4Signals = detectV4Signals(this.candles, {
        minScore: this.config.v4MinScore ?? 0.42,
        structureLookback: 12,
      });

      for (const signal of v4Signals) {
        sigs.push({
          ...signal,
          // Keep the existing invertLogic configuration functional.
          direction: effDir(signal.direction),
        });
      }
    }
```

Keep the existing signal-to-TP/SL mapping immediately after the strategy-selection chain. It will attach targets to V4 signals like it does to V1/V2.

## 5. Important existing ID issue to fix for the leaderboard

The uploaded manager's `generatePermutations()` assigns a new `uuidv4()` each time it is called. `saveAllConfigs()` and `runBacktests()` each call it separately, so their IDs may not match. Since `getLeaderboard()` joins `strategy_configs.id` to `model_performance.configId`, this can leave the leaderboard empty even after backtests.

For stable IDs, replace this line inside the generated config object:

```js
id: uuidv4(),
```

with:

```js
id: `${strat}_${tf}_${inv ? 'INV' : 'NORM'}_TP${tp}`,
```

These fields uniquely identify the current permutation set. Old UUID rows in SQLite are not deleted; the new stable-ID configs are added separately.

## 6. What runs after integration

The existing routes should then run V4 using the same code path as V1/V2:

- `POST /api/lab/backtest` with `{ "timeframe": "1h" }`
- `GET /api/lab/leaderboard?timeframe=1h`
- `POST /api/lab/live/start` with `{ "timeframe": "1h", "topN": 10 }`

The current manager's `startLive()` processes new Binance futures candles through the model but does not submit exchange orders. Treat this as live-candle simulation/paper trading, not live order execution.

## 7. Verify

From the project directory:

```bash
node --check v4_market_adapter.js
node --check strategy_lab_manager.js
python -m pip install sympy
python v4_theory_v0_2.py --self-test
```

The JavaScript adapter should be tested with historical candles before using its scores for any trading decisions. Fees, slippage, look-ahead bias, out-of-sample testing, and position sizing still need separate validation.
