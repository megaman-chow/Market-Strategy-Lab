'use strict';
const { hlClient } = require('./hyperliquid_client');

async function main() {
  const snap = await hlClient.getAccountSnapshot();
  console.log('Address     :', snap.accountAddress);
  console.log('Network     :', snap.testnet ? 'Testnet' : 'Mainnet');
  console.log('Value       : $' + snap.accountValue);
  console.log('Margin used : $' + snap.totalMarginUsed);
  console.log('Positions   :', snap.positions.length ? snap.positions : '(none)');
}

main().catch(console.error);
