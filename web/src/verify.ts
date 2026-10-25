import { createPublicClient, decodeEventLog, encodeAbiParameters, http, keccak256, parseAbi, toBytes, type Log } from 'viem';
import { sepolia } from 'viem/chains';
import type { CaseFile, ChainEvent, Evidence } from './types';

export const RPCS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://sepolia.gateway.tenderly.co',
  'https://sepolia.drpc.org',
];

export const LOG_CHUNK = 10_000n;
export const TRUSTS = 'Trusts: the contract addresses and issuer published in case.json; confirm the issuer through an independent channel.';
export const BROWSER_SKIPS = 'Not checked in the browser: a deployments/<chainId>.json comparison, an issuer pinned with --expect-handler, and the activity snapshot Merkle root. The CLI (npm run verify) checks those.';

const ABI = parseAbi([
  'event CaseOpened(bytes32 indexed caseId, address indexed handler, bytes32 orderHash, bytes32 conditionsHash, uint8 conditionCount, uint256 serviceMask, uint64 serviceDeadline)',
  'event CaseOpened(bytes32 indexed caseId, address indexed handler, bytes32 orderHash, bytes32 conditionsHash, uint8 conditionCount, uint64 serviceDeadline)',
  'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)',
  'event CaseRefBound(bytes32 indexed caseId, address indexed handler, bytes32 indexed caseRef)',
  'event ConditionFulfilled(bytes32 indexed caseId, uint8 indexed conditionId, bytes32 evidenceHash, bytes32 txRef, uint64 fulfilledAt)',
  'event ServiceCompleted(bytes32 indexed caseId, bytes32 affidavitHash, uint64 filedAt, uint64 responseDeadline)',
  'event ActivitySnapshot(bytes32 indexed caseId, bytes32 activityRootHash, uint64 snapshotAt)',
  'event NoticeServed(uint256 indexed tokenId, bytes32 indexed caseId, uint8 indexed conditionId, address recipient, bytes32 documentsHash, string documentsUrl)',
]);
const OWNER_ABI = parseAbi(['function owner() view returns (address)']);

export const DECODED = new Set(['OwnershipTransferred', 'CaseOpened', 'CaseRefBound', 'ConditionFulfilled', 'ServiceCompleted', 'ActivitySnapshot', 'NoticeServed']);

const HASH_FIELDS = ['evidenceHash', 'documentsHash', 'affidavitHash', 'activityRootHash', 'orderHash', 'conditionsHash'];
const PLACEHOLDER = /^0x0{30}/i;

export type Match = { event: string; field: string; txHash: string; block: number; contract: string; conditionId?: number };
export type Kind = 'exhibit' | 'bundle' | 'affidavit' | 'order' | 'snapshot' | 'evidence';
export type Binding = { ok: boolean; handler?: string; caseRef?: string; reason?: string };
export type Check = { name: string; ok: boolean; detail?: string; level: 'fail' | 'warn' };
export type Progress = (msg: string) => void;
export type VerifyResult = {
  fileHash: string;
  binding: Binding;
  path: 'live' | 'offline';
  liveMode?: 'Live (2 RPCs agree)' | 'Live (1 RPC)' | 'Live (2 RPCs DISAGREE)';
  pathDetail: string;
  checks: Check[];
  verdict: 'MATCH' | 'MISMATCH';
  fallbackReason?: string;
  eventCount: number;
  matches: Match[];
  kind: Kind | null;
};

export const KIND_TEXT: Record<Kind, string> = {
  exhibit: 'this is the anchored compliance summary',
  bundle: 'this is the served document bundle',
  affidavit: 'this is the declared affidavit of service',
  order: 'this is the court order PDF registered with the case',
  snapshot: 'this is the anchored wallet activity root',
  evidence: 'this file is recorded as condition evidence',
};

// Describes a matching event in plain words.
export function describeMatch(m: Match, c: CaseFile): string {
  const slot = c.exhibit?.registrySlot ?? c.registrySlots?.find((s) => s.kind === 'exhibit-anchor')?.id;
  if (m.event === 'ConditionFulfilled') {
    if (m.conditionId === slot) return 'Compliance summary anchor recorded in the case registry';
    const k = c.conditions.find((x) => x.id === m.conditionId);
    return k ? `Evidence for condition ${k.id + 1}: ${k.title}` : 'Condition evidence recorded in the case registry';
  }
  if (m.event === 'NoticeServed') return 'Document hash fixed in a service notice';
  if (m.event === 'ServiceCompleted') return 'Affidavit hash recorded at service completion';
  if (m.event === 'CaseOpened') return m.field === 'orderHash' ? 'Order hash recorded when the case was opened' : 'Conditions hash recorded when the case was opened';
  if (m.event === 'ActivitySnapshot') return 'Wallet activity snapshot';
  return m.event;
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return '0x' + Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000}s`)), ms))]);
}

// Converts a decoded log into the event shape used by events.json.
function normalize(l: Log & { eventName?: string; args?: Record<string, unknown> }): ChainEvent {
  const args: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(l.args ?? {})) args[k] = typeof v === 'bigint' ? v.toString() : v;
  return { contract: l.address, address: l.address, event: l.eventName ?? 'unknown', args, txHash: l.transactionHash ?? '', block: Number(l.blockNumber), logIndex: Number(l.logIndex) };
}

type LiveRead = { events: ChainEvent[]; owner: string; host: string };

// Reads this case's contracts from one RPC in windows of at most 10,000 blocks, plus notice block times and owner().
async function liveEvents(c: CaseFile, rpc: string, toBlock: bigint, onProgress?: Progress): Promise<LiveRead> {
  const host = new URL(rpc).host;
  const client = createPublicClient({ chain: sepolia, transport: http(rpc, { timeout: 8000, retryCount: 0 }) });
  const out: ChainEvent[] = [];
  const first = BigInt(c.chain.fromBlock);
  const total = toBlock >= first ? Number((toBlock - first) / LOG_CHUNK) + 1 : 0;
  let n = 0;
  for (let from = first; from <= toBlock; from += LOG_CHUNK) {
    const to = from + LOG_CHUNK - 1n > toBlock ? toBlock : from + LOG_CHUNK - 1n;
    onProgress?.(`Reading chain events from ${host}: window ${++n} of ${total}`);
    const logs = await client.getLogs({ address: [c.chain.registry as `0x${string}`, c.chain.notice721 as `0x${string}`], fromBlock: from, toBlock: to });
    for (const l of logs) {
      try {
        const d = decodeEventLog({ abi: ABI, data: l.data, topics: l.topics });
        out.push(normalize({ ...l, eventName: d.eventName, args: d.args as Record<string, unknown> }));
      } catch {
        continue;
      }
    }
  }
  const times = new Map<number, number>();
  for (const e of out.filter((x) => x.event === 'NoticeServed')) {
    if (!times.has(e.block)) times.set(e.block, Number((await client.getBlock({ blockNumber: BigInt(e.block) })).timestamp));
    e.timestamp = times.get(e.block);
  }
  const owner = await client.readContract({ address: c.chain.notice721 as `0x${string}`, abi: OWNER_ABI, functionName: 'owner' });
  return { events: out, owner, host };
}

// Returns the chain head after confirming the RPC serves Sepolia.
async function headOf(rpc: string): Promise<bigint> {
  const client = createPublicClient({ chain: sepolia, transport: http(rpc, { timeout: 8000, retryCount: 0 }) });
  const id = await client.getChainId();
  if (id !== 11155111) throw new Error(`chain id ${id} is not Sepolia`);
  return client.getBlockNumber();
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
      if (typeof v === 'string' && v.toLowerCase() === h) {
        const cid2 = e.args.conditionId;
        out.push({ event: e.event, field: f, txHash: e.txHash, block: e.block, contract: e.contract, conditionId: cid2 === undefined ? undefined : Number(cid2) });
      }
    }
  }
  return out;
}

// Picks what the file is from the slot or field it matched, most specific first.
export function classify(matches: Match[], c: CaseFile): Kind | null {
  if (!matches.length) return null;
  const slot = c.exhibit?.registrySlot ?? c.registrySlots?.find((s) => s.kind === 'exhibit-anchor')?.id;
  const affId = c.conditions.find((k) => k.kind === 'affidavit')?.id;
  const has = (p: (m: Match) => boolean) => matches.some(p);
  if (slot !== undefined && has((m) => m.event === 'ConditionFulfilled' && m.conditionId === slot)) return 'exhibit';
  if (has((m) => m.field === 'documentsHash')) return 'bundle';
  if (has((m) => m.field === 'affidavitHash' || (m.event === 'ConditionFulfilled' && m.conditionId === affId))) return 'affidavit';
  if (has((m) => m.field === 'orderHash')) return 'order';
  if (has((m) => m.field === 'activityRootHash')) return 'snapshot';
  return 'evidence';
}

// Checks that the case id equals keccak256(abi.encode(handler, caseRef)) from the CaseRefBound event.
export function caseBinding(c: CaseFile, events: ChainEvent[]): Binding {
  const cid = c.caseId.toLowerCase();
  const ev = events.find((e) => e.event === 'CaseRefBound' && String(e.args.caseId).toLowerCase() === cid);
  if (!ev) return { ok: false, reason: 'no CaseRefBound event for this case id was found' };
  const handler = String(ev.args.handler);
  const caseRef = String(ev.args.caseRef);
  const derived = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [handler as `0x${string}`, caseRef as `0x${string}`]));
  if (derived.toLowerCase() !== cid) return { ok: false, handler, caseRef, reason: 'keccak256(handler, caseRef) does not equal the case id' };
  if (c.caseRef && c.caseRef.toLowerCase() !== caseRef.toLowerCase()) return { ok: false, handler, caseRef, reason: 'caseRef on chain differs from case.json' };
  if (c.caseLabel && keccak256(toBytes(c.caseLabel)).toLowerCase() !== caseRef.toLowerCase()) return { ok: false, handler, caseRef, reason: 'caseRef is not keccak256 of the case label' };
  return { ok: true, handler, caseRef };
}

const lc = (v: unknown) => String(v ?? '').toLowerCase();

// Serializes JSON with sorted keys, matching scripts/lib/hash.mjs canonicalJson.
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(o[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

// Service condition ids: chain.serviceMask in case.json, else every condition that is not the affidavit.
export function serviceIds(c: CaseFile): number[] {
  const m = (c.chain as { serviceMask?: string }).serviceMask;
  if (m != null) return [...BigInt(m).toString(2)].reverse().flatMap((b, i) => (b === '1' ? [i] : []));
  return c.conditions.filter((k) => k.kind !== 'affidavit').map((k) => k.id);
}

// Re-derives issuer, owner and condition links from the events; failures make the verdict MISMATCH.
export async function assess(c: CaseFile, events: ChainEvent[], binding: Binding, liveOwners: string[]): Promise<Check[]> {
  const checks: Check[] = [];
  const check = (name: string, ok: unknown, detail = '', level: Check['level'] = 'fail') => checks.push({ name, ok: Boolean(ok), detail, level });
  const cid = lc(c.caseId);
  const at = (e: ChainEvent) => !e.address || [lc(c.chain.registry), lc(c.chain.notice721)].includes(lc(e.address));
  const mine = events.filter((e) => at(e) && (e.args.caseId === undefined || lc(e.args.caseId) === cid));
  const opened = mine.find((e) => e.event === 'CaseOpened');
  const bound = mine.find((e) => e.event === 'CaseRefBound');
  const done = mine.find((e) => e.event === 'ServiceCompleted');
  const notices = mine.filter((e) => e.event === 'NoticeServed');
  const fulfilled = mine.filter((e) => e.event === 'ConditionFulfilled');
  const issuer = c.chain.issuer;
  check('case id derived from handler and caseRef', binding.ok, binding.reason);
  check('registry handler is the published issuer', issuer && lc(opened?.args.handler) === lc(issuer) && lc(bound?.args.handler) === lc(issuer), `issuer ${issuer ?? 'missing'}`);
  const ownerEv = mine.filter((e) => e.event === 'OwnershipTransferred').at(-1);
  const owners = [ownerEv?.args.newOwner, ...liveOwners].filter(Boolean).map(lc);
  check('notice contract owner is the published issuer', issuer && owners.length > 0 && owners.every((o) => o === lc(issuer)), `owner ${owners[0] ?? 'unknown'}`);
  const svc = serviceIds(c);
  const noticeTx = new Set(notices.map((e) => lc(e.txHash)));
  const slot = c.exhibit?.registrySlot ?? c.registrySlots?.find((s) => s.kind === 'exhibit-anchor')?.id;
  const affId = c.conditions.find((k) => k.kind === 'affidavit')?.id;
  for (const f of fulfilled) {
    const id = Number(f.args.conditionId);
    if (id === slot) continue;
    const ev = c.conditions.find((k) => k.id === id)?.evidence.find((x) => x.type === 'tx' && lc(x.txHash) === lc(f.txHash)) as (Evidence & { txRef?: string; preimage?: Record<string, unknown> }) | undefined;
    const bad: string[] = [];
    if (svc.includes(id) && !noticeTx.has(lc(f.args.txRef))) bad.push('txRef is not a service notice of this case');
    if (id === affId && lc(f.args.txRef) !== lc(done?.txHash)) bad.push('txRef is not the service completion');
    if (!ev) bad.push('no evidence entry in case.json');
    else if (lc(ev.evidenceHash) !== lc(f.args.evidenceHash)) bad.push('case.json evidence hash differs');
    else if (!ev.preimage) bad.push('no preimage to recompute');
    else {
      const h = lc(f.args.evidenceHash);
      const json = new TextEncoder().encode(canonicalJson(ev.preimage));
      const direct = Object.entries(ev.preimage).some(([k, v]) => k.endsWith('Sha256') && lc(v) === h);
      if (!direct && (await sha256Hex(json.buffer as ArrayBuffer)) !== h) bad.push('preimage does not hash to the recorded evidence');
    }
    check(`condition ${id + 1} evidence link`, bad.length === 0, bad.join('; '));
  }
  check('case opened with the order hash', opened && lc(opened.args.orderHash) === lc(c.order.hash));
  check('conditions hash', opened && lc(opened.args.conditionsHash) === lc(c.order.conditionsHash));
  check('service notices carry the bundle hash', notices.length > 0 && notices.length === c.service.length && notices.every((e) => lc(e.args.documentsHash) === lc(c.documents.bundleHash)), `${notices.length} notices`);
  check('notice recipients match case.json', c.service.every((s) => notices.some((e) => lc(e.args.recipient) === lc(s.recipient) && lc(e.txHash) === lc(s.txHash))));
  check('condition statuses match the registry', c.conditions.every((k) => (k.status === 'fulfilled') === fulfilled.some((f) => Number(f.args.conditionId) === k.id)));
  const deadline = Number(opened?.args.serviceDeadline ?? 0);
  const timed = notices.filter((e) => typeof e.timestamp === 'number');
  check('notices served on or before the service deadline', opened && notices.length > 0 && timed.length === notices.length && timed.every((e) => (e.timestamp as number) <= deadline), timed.length < notices.length ? 'notice times unavailable' : `${notices.length} notices`);
  if (done) {
    const serviceAt = fulfilled.filter((f) => svc.includes(Number(f.args.conditionId))).map((f) => Number(f.args.fulfilledAt ?? 0));
    const last = Math.max(0, ...serviceAt);
    check('filing not dated before the last service evidence, all service evidence by the deadline', Number(done.args.filedAt) >= last && serviceAt.length === svc.length && serviceAt.every((t) => t <= deadline), `filedAt ${done.args.filedAt} vs ${last}`);
    check('affidavit hash and declared filing time', lc(done.args.affidavitHash) === lc(c.affidavit.hash) && Number(done.args.filedAt) === Math.floor(new Date(c.affidavit.declaredFiledAt).getTime() / 1000));
  }
  return checks;
}

const verdictOf = (matches: Match[], checks: Check[]) => (matches.length > 0 && checks.every((x) => x.ok || x.level === 'warn') ? 'MATCH' : 'MISMATCH');

// Hashes a file, reads the live chain from up to two RPCs, and falls back to the bundled event log.
export async function verifyFile(buf: ArrayBuffer, c: CaseFile, offline: ChainEvent[], offlineName: string, isSample: boolean, onProgress?: Progress): Promise<VerifyResult> {
  const fileHash = await sha256Hex(buf);
  let reason = '';
  if (isSample || PLACEHOLDER.test(c.chain.registry)) {
    reason = 'sample data uses placeholder contract addresses, so no live lookup was attempted';
  } else if (c.chain.chainId !== 11155111) {
    reason = `case was recorded on ${c.chain.name} (chainId ${c.chain.chainId}), which has no public RPC`;
  } else {
    const reads: LiveRead[] = [];
    let toBlock: bigint | null = null;
    for (const rpc of RPCS) {
      if (reads.length === 2) break;
      const host = new URL(rpc).host;
      try {
        onProgress?.(`Connecting to ${host}`);
        const head = await withTimeout(headOf(rpc), 10000, host);
        if (toBlock !== null && head < toBlock) throw new Error('RPC is behind the first one');
        toBlock ??= head;
        const windows = Number((toBlock - BigInt(c.chain.fromBlock)) / LOG_CHUNK) + 1;
        reads.push(await withTimeout(liveEvents(c, rpc, toBlock, onProgress), 15000 + windows * 4000, host));
      } catch (e) {
        reason = `${host}: ${(e as Error).message.split('\n')[0].slice(0, 120)}`;
      }
    }
    if (reads.length) {
      const sig = (r: LiveRead) => JSON.stringify(r.events.map((e) => [e.txHash, e.logIndex, e.event, canonicalJson(e.args)])) + lc(r.owner);
      const agree = reads.length < 2 || sig(reads[0]) === sig(reads[1]);
      const liveMode = reads.length < 2 ? 'Live (1 RPC)' : agree ? 'Live (2 RPCs agree)' : 'Live (2 RPCs DISAGREE)';
      const events = reads[0].events;
      const binding = caseBinding(c, events);
      const checks = await assess(c, events, binding, reads.map((r) => r.owner));
      if (reads.length > 1) checks.unshift({ name: 'two RPCs return the same events and owner', ok: agree, level: 'fail' });
      const matches = findMatches(fileHash, events, c.caseId);
      return { fileHash, binding, path: 'live', liveMode, pathDetail: `Sepolia public RPC (${reads.map((r) => r.host).join(', ')})`, fallbackReason: reads.length < 2 ? reason || undefined : undefined, eventCount: events.length, matches, kind: classify(matches, c), checks, verdict: verdictOf(matches, checks) };
    }
  }
  const matches = findMatches(fileHash, offline, c.caseId);
  const binding = caseBinding(c, offline);
  const checks = await assess(c, offline, binding, []);
  return { fileHash, binding, path: 'offline', pathDetail: `bundled ${offlineName}`, fallbackReason: reason, eventCount: offline.filter((e) => DECODED.has(e.event)).length, matches, kind: classify(matches, c), checks, verdict: verdictOf(matches, checks) };
}
