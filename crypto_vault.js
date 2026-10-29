'use strict';
const crypto = require('crypto');

/**
 * AES-256-GCM encryption for stored secrets (e.g. Hyperliquid private keys).
 * Set VAULT_MASTER_KEY to 64 hex characters (32 bytes), e.g.:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
function vaultKey() {
  const hex = process.env.VAULT_MASTER_KEY;
  if (!hex || hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      'VAULT_MASTER_KEY must be exactly 64 hex characters (32 bytes). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(hex, 'hex');
}

function encryptSecret(plaintext) {
  const key = vaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    authTag: tag.toString('base64'),
  };
}

function decryptSecret({ ciphertext, iv, authTag }) {
  const key = vaultKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

module.exports = { encryptSecret, decryptSecret, vaultKey };
