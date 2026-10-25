import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const WRITABLE_CHAIN_IDS = Object.freeze([31337, 11155111]);

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const DENY_SOURCES = ['data/court/facts.json', 'data/conditions.json', 'data/activity/service-txs.json'];
const EVM_RE = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
const TRON_RE = /(?<![1-9A-HJ-NP-Za-km-z])T[1-9A-HJ-NP-Za-km-z]{33}(?![1-9A-HJ-NP-Za-km-z])/g;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Decodes a TRON base58check address to its 20-byte EVM form, or null if the checksum fails.
export function tronToEvm(addr) {
  let n = 0n;
  for (const ch of addr) {
    const i = B58.indexOf(ch);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  const bytes = Buffer.from(n.toString(16).padStart(50, '0'), 'hex');
  if (bytes.length !== 25 || bytes[0] !== 0x41) return null;
  const sum = createHash('sha256').update(createHash('sha256').update(bytes.subarray(0, 21)).digest()).digest();
  if (!sum.subarray(0, 4).equals(bytes.subarray(21))) return null;
  return '0x' + bytes.subarray(1, 21).toString('hex');
}

// Extracts every EVM and TRON address from a text, adding the EVM form of each TRON address.
export function addressesIn(text) {
  const out = new Set();
  for (const m of text.match(EVM_RE) || []) out.add(m.toLowerCase());
  for (const m of text.match(TRON_RE) || []) {
    const evm = tronToEvm(m);
    if (!evm) continue;
    out.add(m.toLowerCase());
    out.add(evm);
  }
  return out;
}

let cached = null;

// Builds the deny list from every address in data/court/facts.json, data/conditions.json and data/activity/service-txs.json.
export function denyList() {
  if (cached) return cached;
  const deny = new Set();
  for (const rel of DENY_SOURCES) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) throw new Error(`write guard: ${rel} is missing, cannot build the deny list`);
    for (const a of addressesIn(fs.readFileSync(p, 'utf8'))) deny.add(a);
  }
  if (deny.size < 3) throw new Error('write guard: deny list unexpectedly small');
  cached = deny;
  return deny;
}

// Throws unless the chain id is anvil or Sepolia.
export function assertWritableChain(chainId) {
  const id = Number(chainId);
  if (!WRITABLE_CHAIN_IDS.includes(id)) {
    throw new Error(`write refused: chainId ${chainId} is not in the allowlist ${WRITABLE_CHAIN_IDS.join(',')}`);
  }
  return id;
}

// Throws if the address (EVM or TRON, any case) appears in the court record.
export function assertNotRealWallet(address, extra = []) {
  const deny = denyList();
  const a = String(address);
  const keys = [a.toLowerCase()];
  if (/^T/.test(a)) {
    const evm = tronToEvm(a);
    if (evm) keys.push(evm);
  }
  const more = new Set(extra.map((x) => String(x).toLowerCase()));
  if (keys.some((k) => deny.has(k) || more.has(k))) {
    throw new Error(`write refused: ${address} is a real wallet or contract from the court record`);
  }
  return address;
}

// Checks every address-shaped value nested anywhere in a call's arguments.
export function assertArgsSafe(args) {
  const walk = (v) => {
    if (typeof v === 'string') {
      for (const a of addressesIn(v)) assertNotRealWallet(a);
      if (/^0x[0-9a-fA-F]{40}$/.test(v) || /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(v)) assertNotRealWallet(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(args);
  return args;
}
