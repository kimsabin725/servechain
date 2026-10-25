import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mainnet, foundry } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'node:fs';
import path from 'node:path';
import { assertWritableChain, assertNotRealWallet, assertArgsSafe, denyList, tronToEvm, addressesIn } from '../scripts/lib/guard.mjs';
import { createWriter, startAnvil, ANVIL_DEPLOYER_KEY, ANVIL_STAND_INS, ROOT } from '../scripts/lib/chain.mjs';

test('allows only anvil and Sepolia', () => {
  assert.equal(assertWritableChain(31337), 31337);
  assert.equal(assertWritableChain(11155111), 11155111);
  for (const id of [1, 137, 8453, 728126428]) assert.throws(() => assertWritableChain(id), /write refused/);
});

test('refuses real wallets from the court record', () => {
  assert.throws(() => assertNotRealWallet('0xd7648fffa48e06b0107435a966f3f1e9dbe10b7d'), /real wallet/);
  assert.equal(assertNotRealWallet('0x70997970C51812dc3A010C7d01b50e0d17dc79C8'), '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
});

test('deny list covers every address in facts.json', () => {
  const deny = denyList();
  const facts = fs.readFileSync(path.join(ROOT, 'data', 'court', 'facts.json'), 'utf8');
  const expected = [
    '0xD7648FffA48e06b0107435a966F3F1e9DBe10B7d', 'TCfr5oZp8qJJwarum6kjt4o23wTNhi1ss8', 'TDvRhqyGMW5NuZjhiAmEmYuXrSZ4bdZtmu',
    '0x6298BfEd428B843d326dDAE1A406441CDB40db80', '0x7a448169e9d5DB6405087dAB9dfF774Db6589b05', '0x409C4A8eC8eEBf4132E33122164D57C5B7039E59',
    'TB73gtW1hsTxxA9XUYKLSJKTSHw6Jk53eH', '0xc9154424b823b10579895ccbe442d41b9abd96ed',
  ];
  for (const a of expected) {
    assert.ok(facts.toLowerCase().includes(a.toLowerCase()), `${a} in facts.json`);
    assert.ok(deny.has(a.toLowerCase()), `${a} denied`);
    assert.throws(() => assertNotRealWallet(a), /write refused/);
  }
  for (const a of addressesIn(facts)) assert.ok(deny.has(a));
});

test('TRON addresses are refused in any case and in their EVM form', () => {
  const t = 'TCfr5oZp8qJJwarum6kjt4o23wTNhi1ss8';
  for (const v of [t, t.toLowerCase(), t.toUpperCase()]) assert.throws(() => assertNotRealWallet(v), /write refused/);
  const evm = tronToEvm(t);
  assert.match(evm, /^0x[0-9a-f]{40}$/);
  assert.throws(() => assertNotRealWallet(evm), /write refused/);
  assert.throws(() => assertNotRealWallet(evm.toUpperCase().replace('0X', '0x')), /write refused/);
  assert.equal(tronToEvm('TCfr5oZp8qJJwarum6kjt4o23wTNhi1ss9'), null);
});

test('argument scan catches a denied address anywhere in the call', () => {
  assert.throws(() => assertArgsSafe(['0x00', [{ to: '0x409c4a8ec8eebf4132e33122164d57c5b7039e59' }]]), /write refused/);
  assert.throws(() => assertArgsSafe(['see TDvRhqyGMW5NuZjhiAmEmYuXrSZ4bdZtmu']), /write refused/);
  assert.deepEqual(assertArgsSafe([ANVIL_STAND_INS[0], '0x' + 'ab'.repeat(32), 'https://example.org/a.pdf']).length, 3);
});

test('writer refuses a mint to a real wallet without any caller option', async () => {
  const node = await startAnvil(8548, 31337);
  try {
    const account = privateKeyToAccount(ANVIL_DEPLOYER_KEY);
    const w = await createWriter({ chain: foundry, rpcUrl: 'http://127.0.0.1:8548', account });
    const abi = [{ type: 'function', name: 'mint', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }], outputs: [] }];
    await assert.rejects(w.write(ANVIL_STAND_INS[1], abi, 'mint', ['0xD7648FffA48e06b0107435a966F3F1e9DBe10B7d']), /write refused/);
    await assert.rejects(w.write('0xc9154424b823b10579895ccbe442d41b9abd96ed', abi, 'mint', [ANVIL_STAND_INS[0]]), /write refused/);
  } finally {
    node.stop();
  }
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
