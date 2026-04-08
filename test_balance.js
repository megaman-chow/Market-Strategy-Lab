'use strict';
const { hlClient } = require('./hyperliquid_client');

async function main() {
  const state = await hlClient.getBalance();
  console.log('Account Value:', state.marginSummary?.accountValue);
  console.log('Positions    :', state.assetPositions);
}

main().catch(console.error);
