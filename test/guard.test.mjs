import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mainnet, foundry } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { assertWritableChain, assertNotRealWallet } from '../scripts/lib/guard.mjs';
import { createWriter, startAnvil, ANVIL_DEPLOYER_KEY } from '../scripts/lib/chain.mjs';

test('allows only anvil and Sepolia', () => {
  assert.equal(assertWritableChain(31337), 31337);
  assert.equal(assertWritableChain(11155111), 11155111);
  for (const id of [1, 137, 8453, 728126428]) assert.throws(() => assertWritableChain(id), /write refused/);
});

test('refuses real wallets from the court record', () => {
  assert.throws(() => assertNotRealWallet('0xd7648fffa48e06b0107435a966f3f1e9dbe10b7d'), /real wallet/);
  assert.equal(assertNotRealWallet('0x70997970C51812dc3A010C7d01b50e0d17dc79C8'), '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
});

test('writer refuses mainnet before any request', async () => {
  const account = privateKeyToAccount(ANVIL_DEPLOYER_KEY);
  await assert.rejects(createWriter({ chain: mainnet, rpcUrl: 'http://127.0.0.1:1', account }), /write refused/);
});

test('writer refuses an RPC that is really chain 1 even if configured as anvil', async () => {
  const node = await startAnvil(8547, 1);
  try {
    const account = privateKeyToAccount(ANVIL_DEPLOYER_KEY);
    await assert.rejects(createWriter({ chain: foundry, rpcUrl: 'http://127.0.0.1:8547', account }), /RPC chainId 1 != expected 31337/);
  } finally {
    node.stop();
  }
});
