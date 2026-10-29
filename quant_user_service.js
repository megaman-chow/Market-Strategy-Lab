'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { HyperliquidClient } = require('./hyperliquid_client');
const { encryptSecret, decryptSecret } = require('./crypto_vault');

const SALT_ROUNDS = 12;
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '30d';
const hlClientCache = new Map(); // userId -> HyperliquidClient

function jwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error('JWT_SECRET must be set (min 16 chars) for multi-user quant auth');
  }
  return s;
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function initQuantTables(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS quant_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS quant_user_hl (
        user_id TEXT PRIMARY KEY NOT NULL,
        account_address TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        testnet INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES quant_users(id)
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS quant_user_telegram (
        user_id TEXT PRIMARY KEY NOT NULL,
        chat_id TEXT NOT NULL,
        notify_signals INTEGER DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES quant_users(id)
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS quant_telegram_link_codes (
        code TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES quant_users(id)
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS quant_user_traders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        symbol TEXT NOT NULL DEFAULT 'BTCUSDT',
        coinName TEXT NOT NULL DEFAULT 'BTC',
        timeframe TEXT NOT NULL,
        strategy TEXT NOT NULL,
        invertLogic INTEGER DEFAULT 0,
        tpDistance INTEGER DEFAULT 50,
        createdAt INTEGER NOT NULL,
        isActive INTEGER DEFAULT 1,
        hlLiveMode INTEGER DEFAULT 0,
        hlSizeUsd REAL DEFAULT 100,
        FOREIGN KEY (user_id) REFERENCES quant_users(id)
      )`, (err) => (err ? reject(err) : resolve()));

      // Safe migrations for existing DBs
      db.run(`ALTER TABLE quant_user_traders ADD COLUMN symbol TEXT DEFAULT 'BTCUSDT'`, () => {});
      db.run(`ALTER TABLE quant_user_traders ADD COLUMN coinName TEXT DEFAULT 'BTC'`, () => {});

      db.run(`CREATE TABLE IF NOT EXISTS quant_user_rolex_entitlements (
        user_id TEXT PRIMARY KEY NOT NULL,
        tier TEXT NOT NULL DEFAULT 'standard',
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES quant_users(id)
      )`, () => {});

      db.run(`CREATE TABLE IF NOT EXISTS quant_user_rolex_settings (
        user_id TEXT PRIMARY KEY NOT NULL,
        params_json TEXT NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES quant_users(id)
      )`, () => {});

      db.run(`ALTER TABLE quant_user_traders ADD COLUMN strategyParams TEXT`, () => {});
    });
  });
}

async function getRolexEntitlement(db, userId) {
  const row = await get(
    db,
    'SELECT tier FROM quant_user_rolex_entitlements WHERE user_id = ?',
    [userId]
  );
  return row && row.tier ? row.tier : 'standard';
}

async function getRolexSettings(db, userId) {
  const row = await get(db, 'SELECT params_json FROM quant_user_rolex_settings WHERE user_id = ?', [userId]);
  if (!row || !row.params_json) return null;
  return row.params_json;
}

async function setRolexSettings(db, userId, paramsJson) {
  await run(
    db,
    `INSERT OR REPLACE INTO quant_user_rolex_settings (user_id, params_json, updatedAt) VALUES (?, ?, ?)`,
    [userId, paramsJson, Date.now()]
  );
}

async function setRolexEntitlement(db, userId, tier) {
  const t = String(tier || '').toLowerCase();
  const allowed = new Set(['standard', 'premium']);
  const nextTier = allowed.has(t) ? t : 'standard';

  await run(
    db,
    `INSERT OR REPLACE INTO quant_user_rolex_entitlements (user_id, tier, updatedAt)
     VALUES (?, ?, ?)`,
    [userId, nextTier, Date.now()]
  );
  return nextTier;
}

async function registerUser(db, email, password) {
  const em = String(email || '').trim().toLowerCase();
  if (!em.includes('@')) throw new Error('Invalid email');
  if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');
  const id = uuidv4();
  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  try {
    await run(db, 'INSERT INTO quant_users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)', [
      id, em, hash, Date.now(),
    ]);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new Error('Email already registered');
    throw e;
  }
  return { id, email: em };
}

async function loginUser(db, email, password) {
  const em = String(email || '').trim().toLowerCase();
  const row = await get(db, 'SELECT * FROM quant_users WHERE email = ?', [em]);
  if (!row) throw new Error('Invalid email or password');
  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) throw new Error('Invalid email or password');
  return { id: row.id, email: row.email };
}

function signUserToken(userId) {
  return jwt.sign({ sub: userId }, jwtSecret(), { expiresIn: JWT_EXPIRES });
}

function verifyUserToken(token) {
  const p = jwt.verify(token, jwtSecret());
  return p.sub;
}

async function getUserById(db, id) {
  return get(db, 'SELECT id, email, created_at FROM quant_users WHERE id = ?', [id]);
}

function invalidateHlCache(userId) {
  hlClientCache.delete(userId);
}

async function saveUserHyperliquid(db, userId, { accountAddress, secretKey, testnet }) {
  if (!accountAddress || !secretKey) throw new Error('accountAddress and secretKey required');
  const enc = encryptSecret(secretKey.trim());
  await run(
    db,
    `INSERT OR REPLACE INTO quant_user_hl (user_id, account_address, ciphertext, iv, auth_tag, testnet, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      accountAddress.trim(),
      enc.ciphertext,
      enc.iv,
      enc.authTag,
      testnet !== false ? 1 : 0,
      Date.now(),
    ]
  );
  invalidateHlCache(userId);
}

async function getUserHlRow(db, userId) {
  return get(db, 'SELECT * FROM quant_user_hl WHERE user_id = ?', [userId]);
}

async function getHlClientForUser(db, userId) {
  if (hlClientCache.has(userId)) return hlClientCache.get(userId);
  const row = await getUserHlRow(db, userId);
  if (!row) throw new Error('Hyperliquid credentials not saved for this account');
  const secretKey = decryptSecret({
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.auth_tag,
  });
  const client = new HyperliquidClient();
  client.configure({
    secretKey,
    accountAddress: row.account_address,
    testnet: row.testnet === 1,
  });
  hlClientCache.set(userId, client);
  return client;
}

async function userHlConfigured(db, userId) {
  const row = await getUserHlRow(db, userId);
  return row
    ? { configured: true, accountAddress: row.account_address, testnet: row.testnet === 1 }
    : { configured: false };
}

async function createTelegramLinkCode(db, userId) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = Date.now() + 10 * 60 * 1000;
  await run(db, 'DELETE FROM quant_telegram_link_codes WHERE user_id = ?', [userId]);
  await run(
    db,
    'INSERT INTO quant_telegram_link_codes (code, user_id, expires_at) VALUES (?, ?, ?)',
    [code, userId, expires]
  );
  return { code, expiresInMinutes: 10 };
}

async function consumeTelegramLinkCode(db, code) {
  const row = await get(db, 'SELECT * FROM quant_telegram_link_codes WHERE code = ?', [String(code).trim()]);
  if (!row) return { ok: false, error: 'Invalid code' };
  if (row.expires_at < Date.now()) {
    await run(db, 'DELETE FROM quant_telegram_link_codes WHERE code = ?', [row.code]);
    return { ok: false, error: 'Code expired — request a new one in the Quant Portal' };
  }
  return { ok: true, userId: row.user_id, code: row.code };
}

async function bindTelegramChat(db, userId, chatId) {
  await run(
    db,
    `INSERT OR REPLACE INTO quant_user_telegram (user_id, chat_id, notify_signals) VALUES (?, ?, 1)`,
    [userId, String(chatId)]
  );
}

async function deleteTelegramLinkCode(db, code) {
  await run(db, 'DELETE FROM quant_telegram_link_codes WHERE code = ?', [code]);
}

async function getTelegramForUser(db, userId) {
  return get(db, 'SELECT * FROM quant_user_telegram WHERE user_id = ?', [userId]);
}

async function getUserByTelegramChat(db, chatId) {
  const row = await get(db, 'SELECT user_id FROM quant_user_telegram WHERE chat_id = ?', [String(chatId)]);
  if (!row) return null;
  return getUserById(db, row.user_id);
}

async function getQuantUserIdForTrader(db, traderId) {
  const row = await get(db, 'SELECT user_id FROM quant_user_traders WHERE id = ?', [traderId]);
  return row ? row.user_id : null;
}

async function getAllActiveQuantTraders(db) {
  return all(db, 'SELECT * FROM quant_user_traders WHERE isActive = 1');
}

module.exports = {
  initQuantTables,
  registerUser,
  loginUser,
  getUserById,
  signUserToken,
  verifyUserToken,
  saveUserHyperliquid,
  getUserHlRow,
  getHlClientForUser,
  userHlConfigured,
  getUserByTelegramChat,
  invalidateHlCache,
  createTelegramLinkCode,
  consumeTelegramLinkCode,
  bindTelegramChat,
  deleteTelegramLinkCode,
  getTelegramForUser,
  getQuantUserIdForTrader,
  getAllActiveQuantTraders,
  getRolexEntitlement,
  setRolexEntitlement,
  getRolexSettings,
  setRolexSettings,
  run,
  get,
  all,
};
