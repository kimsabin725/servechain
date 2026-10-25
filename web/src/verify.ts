import { createPublicClient, http, parseAbi, type Log } from 'viem';
import { sepolia } from 'viem/chains';
import type { CaseFile, ChainEvent } from './types';

export const RPCS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://sepolia.drpc.org',
  'https://rpc.sepolia.org',
];

const ABI = parseAbi([
  'event CaseOpened(bytes32 indexed caseId, address indexed handler, bytes32 orderHash, bytes32 conditionsHash, uint8 conditionCount, uint64 serviceDeadline)',
  'event ConditionFulfilled(bytes32 indexed caseId, uint8 indexed conditionId, bytes32 evidenceHash, bytes32 txRef, uint64 fulfilledAt)',
  'event ServiceCompleted(bytes32 indexed caseId, bytes32 affidavitHash, uint64 filedAt, uint64 responseDeadline)',
  'event ActivitySnapshot(bytes32 indexed caseId, bytes32 activityRootHash, uint64 snapshotAt)',
  'event NoticeServed(uint256 indexed tokenId, bytes32 indexed caseId, uint8 indexed conditionId, address recipient, bytes32 documentsHash, string documentsUrl)',
]);

const HASH_FIELDS = ['evidenceHash', 'documentsHash', 'affidavitHash', 'activityRootHash', 'orderHash', 'conditionsHash'];
const PLACEHOLDER = /^0x0{30}/i;

export type Match = { event: string; field: string; txHash: string; block: number; contract: string };
export type VerifyResult = {
  fileHash: string;
  path: 'live' | 'offline';
  pathDetail: string;
  fallbackReason?: string;
  eventCount: number;
  matches: Match[];
};

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return '0x' + Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000}s`)), ms))]);
}

function normalize(l: Log & { eventName?: string; args?: Record<string, unknown> }): ChainEvent {
  const args: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(l.args ?? {})) args[k] = typeof v === 'bigint' ? v.toString() : v;
  return { contract: l.address, event: l.eventName ?? 'unknown', args, txHash: l.transactionHash ?? '', block: Number(l.blockNumber), logIndex: Number(l.logIndex) };
}

// Rebuilds the case's event log straight from a public Sepolia RPC.
async function liveEvents(c: CaseFile, rpc: string): Promise<ChainEvent[]> {
  const client = createPublicClient({ chain: sepolia, transport: http(rpc, { timeout: 8000, retryCount: 0 }) });
  const latest = await client.getBlockNumber();
  const out: ChainEvent[] = [];
  const step = 40_000n;
  for (let from = BigInt(c.chain.fromBlock); from <= latest; from += step) {
    const to = from + step - 1n > latest ? latest : from + step - 1n;
    const logs = await client.getLogs({ address: [c.chain.registry as `0x${string}`, c.chain.notice721 as `0x${string}`], events: ABI, fromBlock: from, toBlock: to });
    out.push(...logs.map((l) => normalize(l as never)));
  }
  return out;
}

// Finds every event of this case that anchors the given hash.
export function findMatches(hash: string, events: ChainEvent[], caseId: string): Match[] {
  const h = hash.toLowerCase();
  const cid = caseId.toLowerCase();
  const out: Match[] = [];
  for (const e of events) {
    const ec = e.args.caseId;
    if (typeof ec === 'string' && ec.toLowerCase() !== cid) continue;
    for (const f of HASH_FIELDS) {
      const v = e.args[f];
      if (typeof v === 'string' && v.toLowerCase() === h) out.push({ event: e.event, field: f, txHash: e.txHash, block: e.block, contract: e.contract });
    }
  }
  return out;
}

// Hashes a file, tries the live chain, and falls back to the bundled event log.
export async function verifyFile(buf: ArrayBuffer, c: CaseFile, offline: ChainEvent[], offlineName: string, isSample: boolean): Promise<VerifyResult> {
  const fileHash = await sha256Hex(buf);
  let reason = '';
  if (isSample || PLACEHOLDER.test(c.chain.registry)) {
    reason = 'sample data uses placeholder contract addresses, so no live lookup was attempted';
  } else if (c.chain.chainId !== 11155111) {
    reason = `case was recorded on ${c.chain.name} (chainId ${c.chain.chainId}), which has no public RPC`;
  } else {
    for (const rpc of RPCS) {
      try {
        const events = await withTimeout(liveEvents(c, rpc), 15000, new URL(rpc).host);
        return { fileHash, path: 'live', pathDetail: `Sepolia public RPC (${new URL(rpc).host})`, eventCount: events.length, matches: findMatches(fileHash, events, c.caseId) };
      } catch (e) {
        reason = `${new URL(rpc).host}: ${(e as Error).message.split('\n')[0].slice(0, 120)}`;
      }
    }
  }
  return { fileHash, path: 'offline', pathDetail: `bundled ${offlineName}`, fallbackReason: reason, eventCount: offline.length, matches: findMatches(fileHash, offline, c.caseId) };
}
