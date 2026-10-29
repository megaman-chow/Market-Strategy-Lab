'use strict';
require('dotenv').config();

const { ethers } = require('ethers');
const { killSwitchActive, clampOrderUsd } = require('./hl_risk');
const {
  HttpTransport,
  InfoClient,
  ExchangeClient,
  MAINNET_API_URL,
  TESTNET_API_URL,
} = require('@nktkas/hyperliquid');

class HyperliquidClient {
  constructor() {
    this._cfg      = null;
    this._info     = null;
    this._exchange = null;
  }

  // ── Configuration ──────────────────────────────────────────────────────

  configure({ secretKey, accountAddress, testnet = true }) {
    this._cfg = { secretKey, accountAddress, testnet };
    this._info = null;
    this._exchange = null;
    return this;
  }

  _ensureConfigured() {
    if (!this._cfg) {
      const secretKey = process.env.HYPERLIQUID_SECRET_KEY ||
                        process.env.HYPERLIQUID_TEST_SECRET_KEY;
      const accountAddress = process.env.HYPERLIQUID_ACCOUNT;
      if (!secretKey || !accountAddress)
        throw new Error('Hyperliquid not configured — set HYPERLIQUID_SECRET_KEY + HYPERLIQUID_ACCOUNT in .env');
      const testnet = process.env.HYPERLIQUID_TESTNET !== 'false';
      this._cfg = { secretKey, accountAddress, testnet };
    }
  }

  _getApiUrl()  { return this._cfg.testnet ? TESTNET_API_URL : MAINNET_API_URL; }

  _getInfoClient() {
    if (!this._info) {
      this._ensureConfigured();
      this._info = new InfoClient({ transport: new HttpTransport({ url: this._getApiUrl() }) });
    }
    return this._info;
  }

  _getExchangeClient() {
    if (!this._exchange) {
      this._ensureConfigured();
      const wallet = new ethers.Wallet(this._cfg.secretKey);
      this._exchange = new ExchangeClient({ wallet, transport: new HttpTransport({ url: this._getApiUrl() }) });
    }
    return this._exchange;
  }

  // ── Read-only ──────────────────────────────────────────────────────────

  async getBalance(address) {
    this._ensureConfigured();
    return this._getInfoClient().clearinghouseState({ user: address || this._cfg.accountAddress });
  }

  async getPositions(address) {
    return (await this.getBalance(address)).assetPositions || [];
  }

  async getOpenOrders(address) {
    this._ensureConfigured();
    return this._getInfoClient().openOrders({ user: address || this._cfg.accountAddress });
  }

  async getAllMids()  { return this._getInfoClient().allMids(); }
  async getMeta()    { return this._getInfoClient().meta(); }

  async getBtcAssetIndex() {
    const meta = await this.getMeta();
    const idx = meta.universe.findIndex(a => a.name === 'BTC');
    return idx >= 0 ? idx : 0;
  }

  /** Map HL perp coin name (e.g. 'BTC', 'ETH') to asset index. */
  async getAssetIndexForCoin(coinName) {
    if (!coinName) return await this.getBtcAssetIndex();
    const meta = await this.getMeta();
    const idx = meta.universe.findIndex(u => u.name === coinName);
    if (idx < 0) {
      throw new Error(`Hyperliquid: coin '${coinName}' not found in universe`);
    }
    return idx;
  }

  /** Map perp symbol → asset index (for cancel payloads — `a` must be a number). */
  async _assetIndexForCoin(coinName) {
    const meta = await this.getMeta();
    const idx = meta.universe.findIndex(u => u.name === coinName);
    return idx >= 0 ? idx : null;
  }

  _collectOrderErrors(statuses) {
    if (!Array.isArray(statuses)) return [];
    return statuses
      .map((s, i) => {
        if (s && typeof s === 'object' && typeof s.error === 'string')
          return `[${i}] ${s.error}`;
        return null;
      })
      .filter(Boolean);
  }

  _oidFromStatus(s) {
    if (!s || typeof s !== 'object') return null;
    if (s.resting?.oid != null) return s.resting.oid;
    if (s.filled?.oid != null) return s.filled.oid;
    return null;
  }

  /**
   * After TP/SL placement, HL sometimes returns `waitingForTrigger` without oid.
   * Poll frontend open orders and match by trigger price + reduce-only.
   */
  async _recoverTpSlOids({ assetIndex, tpPrice, slPrice, isBuy }) {
    const info = this._getInfoClient();
    const meta = await this.getMeta();
    const coin = meta.universe[assetIndex]?.name || 'BTC';
    const closeSide = isBuy ? 'A' : 'B'; // sell to close long, buy to close short
    const eps = 1.5;

    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(r => setTimeout(r, 350 + attempt * 200));
      let rows;
      try {
        rows = await info.frontendOpenOrders({ user: this._cfg.accountAddress });
      } catch {
        continue;
      }
      const mine = rows.filter(
        o => o.coin === coin && o.reduceOnly && o.isTrigger && o.side === closeSide
      );
      let tpOid = null;
      let slOid = null;
      for (const o of mine) {
        const tpx = parseFloat(o.triggerPx || '0');
        if (!tpx) continue;
        if (Math.abs(tpx - tpPrice) <= eps) tpOid = o.oid;
        if (Math.abs(tpx - slPrice) <= eps) slOid = o.oid;
      }
      if (tpOid != null && slOid != null) return { tpOid, slOid };
    }
    return { tpOid: null, slOid: null };
  }

  async _recoverSlOid({ assetIndex, slPrice, isBuy }) {
    const info = this._getInfoClient();
    const meta = await this.getMeta();
    const coin = meta.universe[assetIndex]?.name || 'BTC';
    const closeSide = isBuy ? 'A' : 'B';
    const eps = 1.5;
    const sl = parseFloat(slPrice.toFixed(1));

    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(r => setTimeout(r, 350 + attempt * 200));
      let rows;
      try {
        rows = await info.frontendOpenOrders({ user: this._cfg.accountAddress });
      } catch { continue; }
      for (const o of rows) {
        if (o.coin !== coin || !o.reduceOnly || !o.isTrigger) continue;
        if (o.side !== closeSide) continue;
        const tpx = parseFloat(o.triggerPx || '0');
        if (Math.abs(tpx - sl) <= eps) return o.oid;
      }
    }
    return null;
  }

  /** Absolute position size on HL for a coin (from clearinghouse). */
  async getAbsPositionSize(coinName = 'BTC') {
    const state = await this.getBalance();
    for (const row of state.assetPositions || []) {
      const p = row.position;
      if (p?.coin === coinName) return Math.abs(parseFloat(p.szi || '0'));
    }
    return 0;
  }

  // ── Trading ────────────────────────────────────────────────────────────

  /**
   * Market entry — IOC limit priced 3 % away so it always fills.
   * Returns { result, filledQty, avgPx }.
   */
  async marketOrder({ isBuy, sizeUsd, leverage = 1, reduceOnly = false, assetIndex }) {
    this._ensureConfigured();
    if (!reduceOnly && killSwitchActive()) {
      throw new Error('HL_KILL_SWITCH is enabled — new positions / adds blocked (reduce-only still allowed)');
    }
    if (!reduceOnly) sizeUsd = clampOrderUsd(sizeUsd);
    const exchange = this._getExchangeClient();
    const info     = this._getInfoClient();
    const idx      = assetIndex !== undefined ? assetIndex : await this.getBtcAssetIndex();

    await exchange.updateLeverage({ asset: idx, isCross: true, leverage });

    const mids   = await info.allMids();
    const meta   = await info.meta();
    const coin   = meta.universe[idx]?.name;
    const mid    = parseFloat(mids[coin] || '0');
    if (!mid) throw new Error(`Cannot get mid price for ${coin}`);

    const qty   = ((sizeUsd / mid) * leverage).toFixed(5);
    const slip  = 0.03;
    const limit = isBuy
      ? (mid * (1 + slip)).toFixed(1)
      : (mid * (1 - slip)).toFixed(1);

    const result = await exchange.order({
      orders: [{ a: idx, b: isBuy, p: limit, s: qty, r: reduceOnly, t: { limit: { tif: 'Ioc' } } }],
      grouping: 'na',
    });

    const statuses  = result?.response?.data?.statuses || [];
    const errs = this._collectOrderErrors(statuses);
    if (errs.length) throw new Error(`marketOrder: ${errs.join('; ')}`);

    const filled    = statuses[0]?.filled;
    const filledQty = filled ? parseFloat(filled.totalSz) : parseFloat(qty);
    const avgPx     = filled ? parseFloat(filled.avgPx)   : mid;

    return { result, filledQty, avgPx };
  }

  /**
   * Place TP (trigger-limit) and SL (trigger-market) orders simultaneously.
   * Returns { tpOid, slOid }.
   */
  async placeTPSL({ isBuy, qty, tpPrice, slPrice, assetIndex }) {
    this._ensureConfigured();
    const exchange  = this._getExchangeClient();
    const idx       = assetIndex !== undefined ? assetIndex : await this.getBtcAssetIndex();
    const closeSide = !isBuy;
    const sz        = Math.abs(qty).toFixed(5);
    const tp        = parseFloat(tpPrice.toFixed(1));
    const sl        = parseFloat(slPrice.toFixed(1));
    const tpStr     = tp.toFixed(1);
    const slStr     = sl.toFixed(1);

    // Sanity: HL rejects nonsensical TP/SL relative to direction
    if (isBuy && !(tp > sl)) {
      throw new Error(`placeTPSL: long requires TP (${tp}) > SL (${sl})`);
    }
    if (!isBuy && !(tp < sl)) {
      throw new Error(`placeTPSL: short requires TP (${tp}) < SL (${sl})`);
    }

    const result = await exchange.order({
      orders: [
        { a: idx, b: closeSide, p: tpStr, s: sz, r: true,
          t: { trigger: { triggerPx: tpStr, isMarket: false, tpsl: 'tp' } } },
        { a: idx, b: closeSide, p: '0',   s: sz, r: true,
          t: { trigger: { triggerPx: slStr, isMarket: true,  tpsl: 'sl' } } },
      ],
      grouping: 'na',
    });

    const st = result?.response?.data?.statuses || [];
    const errs = this._collectOrderErrors(st);
    if (errs.length) throw new Error(`placeTPSL: ${errs.join('; ')}`);

    let tpOid = this._oidFromStatus(st[0]);
    let slOid = this._oidFromStatus(st[1]);

    if (tpOid == null || slOid == null) {
      const recovered = await this._recoverTpSlOids({
        assetIndex: idx, tpPrice: tp, slPrice: sl, isBuy,
      });
      if (tpOid == null) tpOid = recovered.tpOid;
      if (slOid == null) slOid = recovered.slOid;
    }

    return { tpOid, slOid, result };
  }

  /**
   * Cancel the existing SL and place a new one at newSlPrice (trailing stop).
   * Returns the new SL oid.
   */
  async updateSL({ isBuy, qty, newSlPrice, oldSlOid, assetIndex }) {
    this._ensureConfigured();
    const exchange = this._getExchangeClient();
    const idx      = assetIndex !== undefined ? assetIndex : await this.getBtcAssetIndex();

    if (oldSlOid != null) {
      try { await exchange.cancel({ cancels: [{ a: idx, o: oldSlOid }] }); }
      catch {} // may already be filled
    }

    const result = await exchange.order({
      orders: [{
        a: idx, b: !isBuy, p: '0', s: Math.abs(qty).toFixed(5), r: true,
        t: { trigger: { triggerPx: newSlPrice.toFixed(1), isMarket: true, tpsl: 'sl' } },
      }],
      grouping: 'na',
    });

    const st = result?.response?.data?.statuses || [];
    const errs = this._collectOrderErrors(st);
    if (errs.length) throw new Error(`updateSL: ${errs.join('; ')}`);
    let oid = this._oidFromStatus(st[0]);
    if (oid == null) {
      oid = await this._recoverSlOid({ assetIndex: idx, slPrice: newSlPrice, isBuy });
    }
    return oid;
  }

  /** Close a position with a reduce-only opposite market order (size from USD notional). */
  async closePosition({ isBuy, sizeUsd, assetIndex }) {
    return this.marketOrder({ isBuy: !isBuy, sizeUsd, reduceOnly: true, assetIndex });
  }

  /**
   * Close a position using the exact BTC quantity held on book.
   * Use this instead of closePosition() when you have the actual filled qty,
   * to avoid residual positions caused by price drift since entry.
   */
  async closeByQty({ isBuy, qty, assetIndex }) {
    this._ensureConfigured();
    const exchange = this._getExchangeClient();
    const info     = this._getInfoClient();
    const idx      = assetIndex !== undefined ? assetIndex : await this.getBtcAssetIndex();

    const mids  = await info.allMids();
    const meta  = await info.meta();
    const coin  = meta.universe[idx]?.name;
    const mid   = parseFloat(mids[coin] || '0');
    if (!mid) throw new Error(`Cannot get mid price for ${coin}`);

    // Closing a long (isBuy=true) → sell → b=false, price below mid (IOC fills immediately)
    // Closing a short (isBuy=false) → buy  → b=true,  price above mid
    const closeBuy = !isBuy;
    const slip     = 0.03;
    const limit    = closeBuy
      ? (mid * (1 + slip)).toFixed(1)
      : (mid * (1 - slip)).toFixed(1);

    const result = await exchange.order({
      orders: [{ a: idx, b: closeBuy, p: limit, s: Math.abs(qty).toFixed(5), r: true, t: { limit: { tif: 'Ioc' } } }],
      grouping: 'na',
    });

    const statuses  = result?.response?.data?.statuses || [];
    const errs = this._collectOrderErrors(statuses);
    if (errs.length) throw new Error(`closeByQty: ${errs.join('; ')}`);

    const filled    = statuses[0]?.filled;
    const filledQty = filled ? parseFloat(filled.totalSz) : parseFloat(Math.abs(qty).toFixed(5));
    const avgPx     = filled ? parseFloat(filled.avgPx)   : mid;

    return { result, filledQty, avgPx };
  }

  /** Cancel every open order for the account (or a specific perp by asset index). */
  async cancelAllOrders(assetIndex) {
    this._ensureConfigured();
    const exchange = this._getExchangeClient();
    const info     = this._getInfoClient();
    const meta     = await this.getMeta();
    const coinName = assetIndex !== undefined ? meta.universe[assetIndex]?.name : null;

    const orders = await info.openOrders({ user: this._cfg.accountAddress });
    if (!orders.length) return { cancelled: 0 };

    const toCancel = coinName
      ? orders.filter(o => o.coin === coinName)
      : orders;
    if (!toCancel.length) return { cancelled: 0 };

    const coinToIdx = new Map(meta.universe.map((u, i) => [u.name, i]));
    const cancels = [];
    for (const o of toCancel) {
      const a = coinToIdx.get(o.coin);
      if (a == null) continue;
      cancels.push({ a, o: o.oid });
    }
    if (!cancels.length) return { cancelled: 0 };

    const result = await exchange.cancel({ cancels });
    return { cancelled: cancels.length, result };
  }

  // ── Snapshot for UI ────────────────────────────────────────────────────

  async getAccountSnapshot(address) {
    this._ensureConfigured();
    const addr = address || this._cfg.accountAddress;
    const [state, mids] = await Promise.all([
      this.getBalance(addr),
      this.getAllMids().catch(() => ({})),
    ]);
    const ms  = state.marginSummary || {};
    const positions = (state.assetPositions || []).map(p => ({
      coin:            p.position?.coin,
      side:            parseFloat(p.position?.szi) > 0 ? 'long' : 'short',
      size:            Math.abs(parseFloat(p.position?.szi || 0)),
      entryPrice:      parseFloat(p.position?.entryPx      || 0),
      unrealisedPnl:   parseFloat(p.position?.unrealizedPnl || 0),
      leverage:        parseFloat(p.position?.leverage?.value || 1),
      liquidationPrice:parseFloat(p.position?.liquidationPx  || 0),
    }));
    return {
      accountAddress:   addr,
      testnet:          this._cfg.testnet,
      accountValue:     parseFloat(ms.accountValue     || 0),
      totalMarginUsed:  parseFloat(ms.totalMarginUsed  || 0),
      totalNtlPos:      parseFloat(ms.totalNtlPos      || 0),
      positions,
      mids,
    };
  }

  isConfigured() {
    if (this._cfg) return true;
    return !!((process.env.HYPERLIQUID_SECRET_KEY || process.env.HYPERLIQUID_TEST_SECRET_KEY)
              && process.env.HYPERLIQUID_ACCOUNT);
  }

  getConfig() {
    this._ensureConfigured();
    return { accountAddress: this._cfg.accountAddress, testnet: this._cfg.testnet };
  }
}

const hlClient = new HyperliquidClient();
module.exports = { HyperliquidClient, hlClient };
