#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'data', 'activity');
const UA = { 'User-Agent': 'servechain-research', Accept: 'application/json' };
const MAX_PAGES = Number(process.env.MAX_PAGES || 3);
const DELAY_MS = 400;
const MONTH_FROM = '2024-01';
const BLOCKSCOUT = 'https://eth.blockscout.com/api/v2';
const TRONGRID = 'https://api.trongrid.io/v1';
const USDC_ETH = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const USDT_TRON = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

const WALLETS = [
  { chain: 'eth', address: '0xD7648FffA48e06b0107435a966F3F1e9DBe10B7d', label: 'Wallet 1 (defendant)', source: 'complaint-2025.pdf p.1' },
  { chain: 'eth', address: '0x6298BfEd428B843d326dDAE1A406441CDB40db80', label: 'Transition Wallet A', source: 'complaint-2025.pdf p.13 ¶42' },
  { chain: 'eth', address: '0x7a448169e9d5DB6405087dAB9dfF774Db6589b05', label: 'Transition Wallet B', source: 'complaint-2025.pdf p.13 ¶42' },
  { chain: 'eth', address: '0x409C4A8eC8eEBf4132E33122164D57C5B7039E59', label: 'wallet 0x409 (USDC outflow)', source: 'complaint-2025.pdf p.14 ¶44' },
  { chain: 'tron', address: 'TCfr5oZp8qJJwarum6kjt4o23wTNhi1ss8', label: 'Wallet 2 (defendant)', source: 'complaint-2025.pdf p.1' },
  { chain: 'tron', address: 'TDvRhqyGMW5NuZjhiAmEmYuXrSZ4bdZtmu', label: 'Wallet 3 (defendant)', source: 'complaint-2025.pdf p.1' },
];

let requests = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET a JSON endpoint and record the URL used
async function getJson(url, urls) {
  await sleep(DELAY_MS);
  requests++;
  urls.push(url);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45000) });
    if (res.status === 429 && attempt < 2) { await sleep(5000 * (attempt + 1)); requests++; continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res.json();
  }
}

// Build the list of YYYY-MM keys from MONTH_FROM to the current month
function monthKeys() {
  const keys = [];
  const now = new Date();
  let [y, m] = MONTH_FROM.split('-').map(Number);
  while (y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth() + 1)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return keys;
}

// Count events per month and find first/last timestamps
function tally(events) {
  const months = Object.fromEntries(monthKeys().map((k) => [k, 0]));
  let first = null, last = null;
  for (const e of events) {
    const k = e.time.slice(0, 7);
    if (k in months) months[k]++;
    if (!first || e.time < first) first = e.time;
    if (!last || e.time > last) last = e.time;
  }
  return { count: events.length, first, last, monthly: months };
}

// Follow Blockscout next_page_params up to MAX_PAGES
async function blockscoutPages(base, urls) {
  const items = [];
  let params = null, pages = 0, truncated = false;
  while (pages < MAX_PAGES) {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    const d = await getJson(base + q, urls);
    items.push(...(d.items || []));
    pages++;
    params = d.next_page_params;
    if (!params) break;
  }
  if (params) truncated = true;
  return { items, truncated };
}

// Fetch Ethereum activity for one address from Blockscout
async function fetchEth(w, urls) {
  const a = `${BLOCKSCOUT}/addresses/${w.address}`;
  const info = await getJson(a, urls);
  const counters = await getJson(`${a}/counters`, urls);
  const balances = await getJson(`${a}/token-balances`, urls);
  const txs = await blockscoutPages(`${a}/transactions`, urls);
  const tts = await blockscoutPages(`${a}/token-transfers`, urls);
  const usdc = balances.find((b) => b.token?.address_hash?.toLowerCase() === USDC_ETH);
  const txEvents = txs.items.map((t) => ({ hash: t.hash, time: t.timestamp }));
  const ttEvents = tts.items.map((t) => ({ hash: t.transaction_hash, time: t.timestamp, token: t.token?.symbol, type: t.token_type, scam: t.token?.reputation && t.token.reputation !== 'ok' }));
  const seen = new Map();
  for (const e of [...txEvents, ...ttEvents]) if (!seen.has(e.hash)) seen.set(e.hash, e);
  return {
    balances: {
      nativeEthWei: info.coin_balance ?? null,
      usdc: usdc ? { raw: usdc.value, decimals: Number(usdc.token.decimals), amount: Number(usdc.value) / 10 ** Number(usdc.token.decimals) } : null,
    },
    totals: { transactionsCount: counters.transactions_count, tokenTransfersCount: counters.token_transfers_count },
    transactions: { ...tally(txEvents), truncated: txs.truncated },
    tokenTransfers: { ...tally(ttEvents), truncated: tts.truncated, flaggedTokenCount: ttEvents.filter((e) => e.scam).length },
    uniqueTxAll: { ...tally([...seen.values()]), truncated: txs.truncated || tts.truncated },
    raw: { address: info, counters, tokenBalances: balances.slice(0, 10), transactions: txs.items.slice(0, 3), tokenTransfers: tts.items.slice(0, 3) },
  };
}

// Follow TronGrid fingerprint pagination up to MAX_PAGES
async function tronPages(base, urls) {
  const items = [];
  let url = base, pages = 0, next = null;
  while (url && pages < MAX_PAGES) {
    const d = await getJson(url, urls);
    if (d.success === false) throw new Error(`TronGrid error ${JSON.stringify(d.error || d)}`);
    items.push(...(d.data || []));
    pages++;
    next = d.meta?.links?.next || null;
    url = next;
  }
  return { items, truncated: Boolean(next) };
}

// Fetch TRON activity for one address from TronGrid
async function fetchTron(w, urls) {
  const a = `${TRONGRID}/accounts/${w.address}`;
  const acct = await getJson(a, urls);
  const info = acct.data?.[0] || null;
  const trc20 = await tronPages(`${a}/transactions/trc20?limit=200`, urls);
  const native = await tronPages(`${a}/transactions?limit=200`, urls);
  const firstTrc20 = await getJson(`${a}/transactions/trc20?limit=1&order_by=block_timestamp,asc`, urls);
  const firstNative = await getJson(`${a}/transactions?limit=1&order_by=block_timestamp,asc`, urls);
  const iso = (ms) => new Date(ms).toISOString();
  const usdtRaw = info?.trc20?.map((o) => o[USDT_TRON]).find((v) => v !== undefined) ?? null;
  const trc20Events = trc20.items.map((t) => ({ hash: t.transaction_id, time: iso(t.block_timestamp), token: t.token_info?.symbol }));
  const nativeEvents = native.items.map((t) => ({ hash: t.txID, time: iso(t.block_timestamp) }));
  const seen = new Map();
  for (const e of [...nativeEvents, ...trc20Events]) if (!seen.has(e.hash)) seen.set(e.hash, e);
  const earliest = [firstTrc20.data?.[0]?.block_timestamp, firstNative.data?.[0]?.block_timestamp].filter(Boolean);
  return {
    balances: {
      trxSun: info?.balance ?? null,
      usdt: usdtRaw !== null ? { raw: usdtRaw, decimals: 6, amount: Number(usdtRaw) / 1e6 } : null,
      accountFound: Boolean(info),
    },
    earliestActivity: earliest.length ? iso(Math.min(...earliest)) : null,
    trc20Transfers: { ...tally(trc20Events), truncated: trc20.truncated },
    nativeTransactions: { ...tally(nativeEvents), truncated: native.truncated },
    uniqueTxAll: { ...tally([...seen.values()]), truncated: trc20.truncated || native.truncated },
    raw: { account: info ? { ...info, assetV2: undefined } : null, trc20: trc20.items.slice(0, 3), transactions: native.items.slice(0, 2), firstTrc20: firstTrc20.data, firstNative: firstNative.data?.map((t) => ({ txID: t.txID, block_timestamp: t.block_timestamp })) },
  };
}

const SERVICE = {
  window: ['2025-01-20T00:00:00Z', '2025-01-24T00:00:00Z'],
  eth: { wallet: WALLETS[0].address, contract: '0xc9154424b823b10579895ccbe442d41b9abd96ed', tokenId: '45941267142316491420780756377080437389336336339189278277342547391922395152392', source: 'decision-and-pleadings-2025.pdf p.70 (Sang Aff. ¶3)' },
  tron: { wallets: [WALLETS[4].address, WALLETS[5].address], contracts: ['TLJa2LhmGUqrB2KjpxNRHPPTxgrPTz7mGf', 'TTaW2mBYS4PrtR5KAJPuVJnqraUiyaVat3'], txids: ['bfbacea582b76fb95eaa3f4fac32ccfb832a5703a1f7ea9a08593808ae1c6df4', '6361f4f44b95b0cfd165801d0d1a515d3a154584d9b5e0f86d4dc9a429823907', '782febfc3134e9b1f602dcb0522d0454e41ebae350e7cd330837ccc54bed95c5', '70c0c9dc940cc8b8bafd1c96e1364179e4ef9b98d5c8fba0a8b96fa9dc3d225b'], source: 'decision-and-pleadings-2025.pdf p.72 (Sang Aff. ¶¶6-7)' },
};

// POST a JSON body to TronGrid and record the URL used
async function postJson(url, body, urls) {
  await sleep(DELAY_MS);
  requests++;
  urls.push(`POST ${url} ${JSON.stringify(body)}`);
  const res = await fetch(url, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

// Decode an ABI-encoded string returned by a constant call
function abiString(hex) {
  if (!hex || hex.length < 128) return null;
  const len = parseInt(hex.slice(64, 128), 16);
  return Buffer.from(hex.slice(128, 128 + len * 2), 'hex').toString('utf8');
}

// Look up the service NFT deliveries cited in the Sang affirmation
async function fetchService() {
  const urls = [];
  const out = { fetchedAt: new Date().toISOString(), window: SERVICE.window, eth: null, tron: null, errors: [] };
  const e = SERVICE.eth;
  try {
    const base = `${BLOCKSCOUT}/tokens/${e.contract}/instances/${e.tokenId}`;
    const inst = await getJson(base, urls);
    const tr = await getJson(`${base}/transfers`, urls);
    out.eth = {
      source: e.source, contract: e.contract, tokenId: e.tokenId, owner: inst.owner?.hash ?? null,
      tokenURI: inst.metadata ? null : inst.token_uri ?? null, metadata: inst.metadata ?? null, externalAppUrl: inst.external_app_url ?? null,
      transfers: (tr.items || []).map((t) => ({ txHash: t.transaction_hash, block: t.block_number, time: t.timestamp, from: t.from?.hash, to: t.to?.hash, method: t.method })),
    };
  } catch (err) { out.errors.push(`eth: ${err.message}`); }
  const t = SERVICE.tron;
  const [lo, hi] = SERVICE.window.map((d) => Date.parse(d));
  try {
    const transfers = [];
    for (const w of t.wallets) {
      const d = await getJson(`${TRONGRID}/accounts/${w}/transactions/trc20?limit=200&min_timestamp=${lo}&max_timestamp=${hi}`, urls);
      for (const x of d.data || []) transfers.push({ wallet: w, txHash: x.transaction_id, time: new Date(x.block_timestamp).toISOString(), from: x.from, to: x.to, contract: x.token_info?.address, name: x.token_info?.name, symbol: x.token_info?.symbol, value: x.value, citedInAffidavit: t.txids.includes(x.transaction_id) });
    }
    const uris = {};
    for (const c of t.contracts) {
      const r = await postJson('https://api.trongrid.io/wallet/triggerconstantcontract', { owner_address: c, contract_address: c, function_selector: 'tokenURI(uint256)', parameter: (1).toString(16).padStart(64, '0'), visible: true }, urls);
      const uri = abiString(r.constant_result?.[0]);
      const b64 = uri?.startsWith('data:application/json;base64,') ? uri.split(',')[1] : null;
      uris[c] = { tokenId: 1, tokenURI: uri, decoded: b64 ? JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) : null, raw: r.constant_result?.[0] ?? null, ok: r.result?.result ?? null };
    }
    out.tron = { source: t.source, affidavitTxids: t.txids, transfersInWindow: transfers, tokenURIs: uris, missingAffidavitTxids: t.txids.filter((id) => !transfers.some((x) => x.txHash === id)), blockNumbers: 'not fetched (TronGrid trc20 endpoint omits block number)' };
  } catch (err) { out.errors.push(`tron: ${err.message}`); }
  out.sourceUrls = urls;
  out.requestCount = requests;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'service-txs.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ errors: out.errors, requests }, null, 0));
}

// Find later NFT deliveries to the defendant wallets after the June 2025 order
async function fetchServiceLater() {
  const urls = [];
  const file = path.join(OUT, 'service-txs.json');
  const out = JSON.parse(fs.readFileSync(file, 'utf8'));
  const since = '2025-06-01T00:00:00Z';
  const later = { since, note: 'NFTs received after the order date; names/descriptions are on-chain text, not verified against court records', eth: [], tron: [], errors: [] };
  try {
    const d = await getJson(`${BLOCKSCOUT}/addresses/${SERVICE.eth.wallet}/token-transfers?type=ERC-721`, urls);
    for (const t of d.items || []) {
      if (t.timestamp < since) continue;
      const m = t.total?.token_instance?.metadata || {};
      later.eth.push({ txHash: t.transaction_hash, block: t.block_number, time: t.timestamp, from: t.from?.hash, contract: t.token?.address_hash, tokenId: t.total?.token_id, name: m.name ?? null, description: m.description ?? null });
    }
  } catch (err) { later.errors.push(`eth: ${err.message}`); }
  for (const w of SERVICE.tron.wallets) {
    try {
      const d = await getJson(`${TRONGRID}/accounts/${w}/transactions/trc20?limit=200&min_timestamp=${Date.parse(since)}`, urls);
      for (const x of d.data || []) {
        if (x.token_info?.decimals !== 0) continue;
        later.tron.push({ wallet: w, txHash: x.transaction_id, time: new Date(x.block_timestamp).toISOString(), from: x.from, contract: x.token_info?.address, name: x.token_info?.name, symbol: x.token_info?.symbol, value: x.value });
      }
    } catch (err) { later.errors.push(`tron ${w}: ${err.message}`); }
  }
  later.sourceUrls = urls;
  later.fetchedAt = new Date().toISOString();
  out.laterDeliveries = later;
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ eth: later.eth.length, tron: later.tron.length, errors: later.errors, requests }));
}

// Build one summary row, marking from when monthly counts are complete
function walletRow(w, data, file) {
  const lists = Object.values(data).filter((v) => v && typeof v === 'object' && 'truncated' in v && 'monthly' in v);
  const cut = lists.filter((v) => v.truncated && v.first).map((v) => v.first).sort().pop() || null;
  const all = data.uniqueTxAll;
  const t = data.totals;
  const countersSuspect = t ? Number(t.transactionsCount) < (data.transactions?.count ?? 0) || Number(t.tokenTransfersCount) < (data.tokenTransfers?.count ?? 0) : null;
  return {
    chain: w.chain, address: w.address, label: w.label, source: w.source, status: 'ok', file, fetchedAt: data.fetchedAt, sourceUrls: data.sourceUrls,
    lastActivity: all.last, firstSeenInFetched: all.first, earliestActivity: data.earliestActivity ?? null,
    truncated: all.truncated, monthlyPartialBefore: cut, monthlyNote: cut ? `older items not fetched; months after ${cut.slice(0, 7)} are complete, ${cut.slice(0, 7)} and earlier may be undercounted` : 'all items fetched',
    monthlyUniqueTx: Object.fromEntries(Object.entries(all.monthly).filter(([, n]) => n > 0)),
    uniqueTxFetched: all.count, balances: data.balances, totals: t ?? null, countersSuspect,
  };
}

// Write summary.json from cached per-wallet files plus any failures
function writeSummary(meta, failures) {
  const rows = WALLETS.map((w) => {
    const file = `${w.chain}-${w.address}.json`;
    const f = failures.find((x) => x.address === w.address);
    if (f) return f;
    const p = path.join(OUT, file);
    return fs.existsSync(p) ? walletRow(w, JSON.parse(fs.readFileSync(p, 'utf8')), file) : { ...w, status: 'missing', note: 'source: manual cache needed' };
  });
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ ...meta, wallets: rows }, null, 2));
}

// Fetch every wallet, write per-wallet caches and a summary
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const meta = { fetchedAt: new Date().toISOString(), maxPagesPerList: MAX_PAGES, userAgent: UA['User-Agent'] };
  const failures = [];
  for (const w of WALLETS) {
    const urls = [];
    try {
      const data = w.chain === 'eth' ? await fetchEth(w, urls) : await fetchTron(w, urls);
      fs.writeFileSync(path.join(OUT, `${w.chain}-${w.address}.json`), JSON.stringify({ ...w, fetchedAt: new Date().toISOString(), sourceUrls: urls, ...data }, null, 2));
      console.log(`ok   ${w.label} last=${data.uniqueTxAll.last} n=${data.uniqueTxAll.count}${data.uniqueTxAll.truncated ? ' (truncated)' : ''}`);
    } catch (err) {
      failures.push({ ...w, status: 'failed', reason: String(err.message || err), sourceUrls: urls, note: 'source: manual cache needed' });
      console.log(`FAIL ${w.label} ${err.message}`);
    }
  }
  writeSummary({ ...meta, requestCount: requests }, failures);
  console.log(`requests=${requests}`);
}

// Rebuild summary.json from the cache without network calls
function resummarize() {
  const prev = JSON.parse(fs.readFileSync(path.join(OUT, 'summary.json'), 'utf8'));
  const { wallets, ...meta } = prev;
  writeSummary(meta, wallets.filter((w) => w.status === 'failed'));
  console.log('summary rebuilt from cache');
}

const MODES = { service: fetchService, 'service-later': fetchServiceLater, summary: resummarize };
(MODES[process.argv[2]] || main)();
