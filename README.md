# Market Strategy Lab

A unified field theory research framework integrated with a cryptocurrency trading strategy laboratory. This project combines symbolic physics calculations with real-time market data analysis, backtesting, and live trading capabilities.

## Overview

Market Strategy Lab is an experimental trading platform that explores the intersection of unified field theory and financial markets. It features:

- **V4 Unified Field Theory**: A symbolic research scaffold for field-theory calculations using SymPy
- **Strategy Laboratory**: Backtesting and live trading for multiple strategy versions (v1, v2, v4)
- **Exchange Integration**: Real-time data and trading via Binance and Hyperliquid
- **Multi-User Portal**: Quant Portal for managing trading bots with encrypted key storage
- **Web Dashboard**: Interactive interfaces for strategy management and monitoring

## Features

### V4 Physics Framework
- Symbolic field-theory calculations using SymPy
- Electroweak Higgs sector modeling
- Gravity sector with FLRW cosmology
- Coupled matter and gauge currents
- Stress-energy tensor and conservation laws
- Consistency checking across all physics sectors

### Trading System
- **Strategy Versions**: v1, v2, and experimental v4 (physics-inspired)
- **Backtesting**: Historical performance analysis with configurable parameters
- **Live Trading**: Real-time signal detection and paper trading simulation
- **Multiple Exchanges**: Binance Futures and Hyperliquid support
- **WebSocket Feeds**: Fast real-time market data via kline WebSockets
- **Risk Management**: Configurable take-profit, stop-loss, and position sizing

### Quant Portal
- User authentication with JWT tokens
- Encrypted API key storage (AES-256-GCM)
- Per-user trading bot management
- Telegram integration for alerts
- Multi-tenant isolation for production environments

## Installation

### Prerequisites
- Node.js (v16 or higher)
- Python 3.8+ with SymPy
- PM2 (for production deployment)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/megaman-chow/Market-Strategy-Lab.git
cd Market-Strategy-Lab
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Install Python dependencies:
```bash
pip install sympy
```

4. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

5. Initialize the database:
```bash
node lab_server.js
```

## Usage

### Running the Lab Server
```bash
npm run lab
```

### Running the Trading Engine
```bash
npm run trader
```

### Running V4 Physics Tests
```bash
python v4_theory.py --self-test
python v4_consistency.py --self-test
python v4_coupled_matter.py --derive
```

### Running Strategy Backtests
```bash
npm run lab
# Then use the web interface at http://localhost:3000
```

### Production Deployment with PM2
```bash
npm run pm2:start
```

## Project Structure

```
Market-Strategy-Lab/
├── v4_*.py                    # V4 unified field theory modules
├── strategy_lab_manager.js    # Strategy backtesting and live trading
├── trader_engine_manager.js   # Trading engine with exchange integration
├── quant_user_service.js      # Multi-user authentication and bot management
├── lab_server.js              # Strategy lab API server
├── server.js                  # Main server with quant portal
├── v4_market_adapter.js       # V4-inspired market signal adapter
├── strategyLab.html           # Strategy lab dashboard
├── quant_portal.html          # Multi-user quant portal
└── ecosystem.config.cjs       # PM2 process configuration
```

## V4 Physics Modules

- `v4_fields.py` - Field definitions and registry
- `v4_matter.py` - Matter sector and scalar fields
- `v4_electroweak_higgs.py` - Electroweak and Higgs sector
- `v4_fermion_sector.py` - Fermion sector with Yukawa couplings
- `v4_gravity_sector.py` - Gravity and cosmology
- `v4_coupled_matter.py` - Coupled matter and gauge currents
- `v4_stress_energy.py` - Stress-energy tensor and conservation
- `v4_variational.py` - Variational calculus and field equations
- `v4_unified_action.py` - Unified action density
- `v4_consistency.py` - Consistency checker for all sectors

## Configuration

### Environment Variables
See `lab_server_configuration.txt` for a complete list of configuration options:
- Binance API credentials
- Hyperliquid wallet keys
- JWT secret for authentication
- Vault master key for encryption
- Telegram bot token for alerts
- Risk management parameters

### Strategy Parameters
- Timeframe selection (1m, 5m, 15m, 1h, 4h, 1d)
- Take-profit and stop-loss levels
- Inversion logic for directional signals
- V4 minimum score threshold
- Structure lookback period

## Safety and Risk Management

⚠️ **Important Disclaimer**

This software executes rules-based strategies. Profit depends on market conditions, fees, slippage, and whether your chosen configurations edge out costs. No code change can guarantee profit. Treat live mainnet trading as capital at risk.

### Safety Features
- `HL_KILL_SWITCH` - Emergency stop for Hyperliquid trading
- `HL_MAX_ORDER_USD` - Per-order size cap
- Paper trading mode for testing
- Encrypted key storage
- Multi-tenant isolation in production

### Recommended Rollout
1. Testnet + paper dashboards until fills, TP/SL, and trailing look correct
2. Mainnet with small order sizes; one trader, kill switch ready
3. Scale size only after forward results match expectations

## Web Interfaces

- **Strategy Lab** (`strategyLab.html`) - Backtesting and strategy configuration
- **Quant Portal** (`quant_portal.html`) - Multi-user bot management
- **Market Physics Dashboard** (`MarketPhysicsTraderDashboard.html`) - Trading overview
- **Rolex Strategy** (`RolexStrategy.html`) - Advanced strategy interface

## Development

### Running Tests
```bash
npm test
node v4_adapter_self_test.js
python v4_theory.py --self-test
```

### Code Validation
```bash
node --check strategy_lab_manager.js
node --check v4_market_adapter.js
python -m py_compile v4_*.py
```

## Documentation

- [V4 Integration Guide](STRATEGY_LAB_V4_INTEGRATION.md)
- [V4 Manager Setup](V4_MANAGER_SETUP.md)
- [Operator Setup](SETUP_OPERATORS.txt)

## Contributing

This is an experimental research project. Contributions should focus on:
- Improving consistency checks for the V4 theory
- Enhancing backtesting accuracy
- Adding new strategy variants
- Improving documentation

## License

Private project. See individual module files for specific licensing information.

## Acknowledgments

- SymPy for symbolic mathematics
- Binance and Hyperliquid for exchange APIs
- The open-source trading community

## Contact

For questions or issues, please open an issue on GitHub.

---

**Note**: The V4 unified field theory is a research scaffold, not a completed or validated unified theory. The V4 market adapter is an experimental technical model inspired by the theory, not derived from the physics equation. Always backtest thoroughly and manage risk appropriately.
