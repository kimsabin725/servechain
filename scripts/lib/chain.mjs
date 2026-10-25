import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createPublicClient, createWalletClient, http, decodeEventLog, getAddress } from 'viem';
import { foundry, sepolia } from 'viem/chains';
import { assertWritableChain, assertArgsSafe } from './guard.mjs';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

export const NETWORKS = {
  local: { chain: foundry, name: 'anvil (local)', explorer: null, rpcUrl: 'http://127.0.0.1:8546' },
  sepolia: { chain: sepolia, name: 'Sepolia', explorer: 'https://sepolia.etherscan.io', rpcUrl: null },
};

export const ANVIL_DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

export const ANVIL_STAND_INS = [
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
];

// Loads ABI and bytecode for a contract from forge-out.
export function artifact(name) {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'forge-out', `${name}.sol`, `${name}.json`), 'utf8'));
  return { abi: j.abi, bytecode: j.bytecode.object };
}

// Reads KEY=VALUE pairs from .env without exporting them to the shell.
export function readEnv() {
  const p = path.join(ROOT, '.env');
  const env = {};
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

// Resolves true if nothing is listening on the port.
function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

// Starts anvil (default port 8546) and resolves once it answers RPC.
export async function startAnvil(port = 8546, chainId = 31337) {
  if (!(await portFree(port))) throw new Error(`port ${port} is busy; stop the process using it first`);
  const proc = spawn('anvil', ['--port', String(port), '--chain-id', String(chainId), '--silent'], { stdio: 'ignore' });
  const client = createPublicClient({ chain: foundry, transport: http(`http://127.0.0.1:${port}`) });
  for (let i = 0; i < 50; i++) {
    try {
      await client.request({ method: 'eth_chainId' });
      return { proc, client, stop: () => proc.kill('SIGTERM') };
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  proc.kill('SIGTERM');
  throw new Error('anvil did not start');
}

// Creates a write-guarded client: every send re-checks the RPC chain id and the address deny list.
export async function createWriter({ chain, rpcUrl, account }) {
  assertWritableChain(chain.id);
  const transport = http(rpcUrl, { retryCount: 3, retryDelay: 1500 });
  const pub = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ chain, transport, account });
  const check = async () => {
    const live = await pub.getChainId();
    if (live !== chain.id) throw new Error(`write refused: RPC chainId ${live} != expected ${chain.id}`);
    assertWritableChain(live);
  };
  await check();
  const receiptOf = async (hash) => {
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (receipt.status !== 'success') throw new Error(`tx reverted: ${hash}`);
    const block = await pub.getBlock({ blockNumber: receipt.blockNumber });
    return { hash, receipt, block: Number(receipt.blockNumber), timestamp: Number(block.timestamp) };
  };
  return {
    pub,
    account,
    // Deploys a forge artifact and returns address plus receipt block.
    async deploy(name, args = []) {
      assertArgsSafe(args);
      await check();
      const { abi, bytecode } = artifact(name);
      const hash = await wallet.deployContract({ abi, bytecode, args });
      const r = await receiptOf(hash);
      return { ...r, address: getAddress(r.receipt.contractAddress) };
    },
    // Sends a contract write after the chain check and the address deny-list check on every argument.
    async write(address, abi, functionName, args) {
      assertArgsSafe([address, ...args]);
      await check();
      const { request } = await pub.simulateContract({ address, abi, functionName, args, account });
      const gas = await pub.estimateContractGas({ address, abi, functionName, args, account });
      const hash = await wallet.writeContract({ ...request, gas: (gas * 13n) / 10n + 20_000n });
      return receiptOf(hash);
    },
  };
}

export const LOG_CHUNK = 10_000;

// Fetches and decodes all events of the given contracts, reading logs in windows of at most LOG_CHUNK blocks.
export async function collectEvents(pub, contracts, fromBlock, { toBlock, chunk = LOG_CHUNK, onProgress } = {}) {
  const out = [];
  const blockTimes = new Map();
  const byAddr = new Map(contracts.map((c) => [c.address.toLowerCase(), c]));
  const last = BigInt(toBlock ?? (await pub.getBlockNumber()));
  const step = BigInt(Math.min(chunk, LOG_CHUNK));
  const total = last >= BigInt(fromBlock) ? Number((last - BigInt(fromBlock)) / step) + 1 : 0;
  let done = 0;
  for (let from = BigInt(fromBlock); from <= last; from += step) {
    const to = from + step - 1n > last ? last : from + step - 1n;
    const logs = await pub.getLogs({ address: contracts.map((c) => c.address), fromBlock: from, toBlock: to });
    onProgress?.(++done, total);
    for (const log of logs) {
      const c = byAddr.get(String(log.address).toLowerCase());
      if (!c) continue;
      let decoded;
      try {
        decoded = decodeEventLog({ abi: c.abi, data: log.data, topics: log.topics });
      } catch {
        continue;
      }
      const bn = Number(log.blockNumber);
      if (!blockTimes.has(bn)) blockTimes.set(bn, Number((await pub.getBlock({ blockNumber: log.blockNumber })).timestamp));
      out.push({
        contract: c.name,
        address: c.address,
        event: decoded.eventName,
        args: jsonSafe(decoded.args),
        txHash: log.transactionHash,
        block: bn,
        logIndex: Number(log.logIndex),
        timestamp: blockTimes.get(bn),
      });
    }
  }
  return out.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
}

// Converts bigint values to decimal strings for JSON output.
export function jsonSafe(v) {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(jsonSafe);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonSafe(x)]));
  return v;
}
