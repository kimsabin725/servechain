import fs from 'node:fs';
import path from 'node:path';
import { keccak256, toHex, encodeAbiParameters } from 'viem';
import { ROOT } from './chain.mjs';
import { hashJson, merkleRoot, sha256Hex } from './hash.mjs';
import { buildPdf } from './pdf.mjs';

export const CASE_LABEL = 'NY-SUP-QUEENS-700647-2025-demo';
export const CASE_REF = keccak256(toHex(CASE_LABEL));

// Same derivation as CaseFileRegistry.caseIdOf: keccak256(abi.encode(handler, caseRef)).
export function caseIdOf(handler, caseRef = CASE_REF) {
  return keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [handler, caseRef]));
}
export const EXHIBIT_SLOT = 5;
export const DAY = 86400;

// Reads a JSON file under data/, or returns null when missing.
export function readData(rel) {
  const p = path.join(ROOT, 'data', rel);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

// Loads every data file the pipeline uses.
export function loadInputs() {
  const conditions = readData('conditions.json');
  if (!conditions) throw new Error('data/conditions.json is missing');
  return {
    conditions,
    facts: readData('court/facts.json'),
    rules: readData('rules.json'),
    summary: readData('activity/summary.json'),
    serviceTxs: readData('activity/service-txs.json'),
    contacts: readData('synthetic-contacts.json'),
    precedents: readData('precedents.json'),
  };
}

// Hash of the decision PDF: from the local file when present, else from facts.json.
export function orderHash(facts) {
  const local = path.join(ROOT, 'data', 'court', 'decision-and-pleadings-2025.pdf');
  if (fs.existsSync(local)) return sha256Hex(fs.readFileSync(local));
  const known = facts?.case?.sources?.decisionAndPleadings?.sha256;
  if (known) return known.startsWith('0x') ? known : '0x' + known;
  throw new Error('decision PDF hash unavailable: add data/court/decision-and-pleadings-2025.pdf');
}

// Condition list hashed onto the registry, numbered 0..n-1 in file order.
export function orderConditions(conditionsFile) {
  return conditionsFile.conditions.map((c, i) => ({
    id: i,
    ref: c.id,
    kind: c.kind,
    title: c.title,
    quote: c.quote,
    page: c.page,
  }));
}

// Formats a wallet balance line from the activity summary.
function balanceText(w) {
  const b = w.balances || {};
  const parts = [];
  if (b.usdc) parts.push(`${b.usdc.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC`);
  if (b.usdt) parts.push(`${b.usdt.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT`);
  if (b.nativeEthWei !== undefined) parts.push(`${(Number(b.nativeEthWei) / 1e18).toFixed(4)} ETH`);
  if (b.trxSun !== undefined) parts.push(`${(Number(b.trxSun) / 1e6).toFixed(2)} TRX`);
  return parts.join(', ');
}

// First month whose count is complete: the month after the partial cut-off, or the earliest month when nothing was cut.
export function completeFrom(w) {
  if (!w.truncated) return Object.keys(w.monthlyUniqueTx || {}).sort()[0] ?? null;
  if (!w.monthlyPartialBefore) return null;
  let [y, m] = w.monthlyPartialBefore.slice(0, 7).split('-').map(Number);
  m += 1;
  if (m > 12) (m = 1), (y += 1);
  return `${y}-${String(m).padStart(2, '0')}`;
}

// Wallet activity rows plus the Merkle leaves and root anchored by snapshot().
export function buildActivity(summary) {
  if (!summary) return { fetchedAt: null, wallets: [], leaves: [], root: null };
  const wallets = summary.wallets.map((w) => ({
    label: w.label,
    role: /defendant/i.test(w.label) ? 'defendant' : 'related',
    chain: w.chain === 'eth' ? 'ethereum' : w.chain,
    address: w.address,
    firstTx: w.firstSeenInFetched,
    lastTx: w.lastActivity,
    monthly: w.monthlyUniqueTx,
    balance: balanceText(w),
    source: w.source,
    sourceUrl: (w.sourceUrls || [])[0] || null,
    status: w.status,
    completeFrom: completeFrom(w),
    note: w.truncated ? w.monthlyNote : null,
  }));
  const leaves = wallets.map((w) =>
    hashJson({ label: w.label, chain: w.chain, address: w.address, lastTx: w.lastTx, monthly: w.monthly, balance: w.balance }),
  );
  return { fetchedAt: summary.fetchedAt, wallets, leaves, root: merkleRoot(leaves) };
}

// Imported real-world service NFTs, read-only, split by the order they served.
export function buildExistingService(serviceTxs) {
  if (!serviceTxs) return [];
  const out = [];
  const tronUrl = (h) => `https://tronscan.org/#/transaction/${h}`;
  const ethUrl = (h) => `https://etherscan.io/tx/${h}`;
  const later = serviceTxs.laterDeliveries || {};
  for (const e of later.eth || []) {
    if (!/^Service of NY OAG Summons/i.test(e.name || '')) continue;
    out.push({
      source: 'imported', phase: 'june-2025-order', chain: 'ethereum', recipient: '0xD7648FffA48e06b0107435a966F3F1e9DBe10B7d',
      recipientLabel: 'real Wallet 1 (read-only)', txHash: e.txHash, block: e.block, timestamp: e.time, tokenId: e.tokenId, attribution: 'unattributed',
      contract: e.contract, name: e.name, explorerUrl: ethUrl(e.txHash),
    });
  }
  const tronLabel = { TCfr5oZp8qJJwarum6kjt4o23wTNhi1ss8: 'Wallet 2', TDvRhqyGMW5NuZjhiAmEmYuXrSZ4bdZtmu: 'Wallet 3' };
  for (const t of later.tron || []) {
    if (!/^Service of NY OAG Summons/i.test(t.name || '')) continue;
    out.push({
      source: 'imported', phase: 'june-2025-order', chain: 'tron', recipient: t.wallet,
      recipientLabel: `real ${tronLabel[t.wallet] || t.wallet} (read-only)`, txHash: t.txHash, block: null, timestamp: t.time,
      tokenId: t.value, contract: t.contract, name: 'Service of NY OAG Summons and Complaint No 700647-2025 (name truncated on-chain)',
      explorerUrl: tronUrl(t.txHash),
    });
  }
  for (const e of serviceTxs.eth?.transfers || []) {
    if (e.to?.toLowerCase() !== '0xd7648fffa48e06b0107435a966f3f1e9dbe10b7d') continue;
    out.push({
      source: 'imported', phase: 'pre-order-osc', chain: 'ethereum', recipient: e.to, recipientLabel: 'real Wallet 1 (read-only)',
      txHash: e.txHash, block: e.block, timestamp: e.time, tokenId: serviceTxs.eth.tokenId, contract: serviceTxs.eth.contract,
      name: serviceTxs.eth.metadata?.name || null, explorerUrl: ethUrl(e.txHash),
    });
  }
  for (const t of serviceTxs.tron?.transfersInWindow || []) {
    out.push({
      source: 'imported', phase: 'pre-order-osc', chain: 'tron', recipient: t.wallet,
      recipientLabel: `real ${tronLabel[t.wallet] || t.wallet} (read-only)`, txHash: t.txHash, block: null, timestamp: t.time,
      tokenId: t.value, contract: t.contract, name: t.name, explorerUrl: tronUrl(t.txHash),
    });
  }
  const notes = {
    'june-2025-order':
      'Unattributed NFTs titled "Service of NY OAG Summons and Complaint…" seen on 2025-07-30 (sender not matched to court records; contract name on-chain: SoulBoundTest). Context only, not linked to any condition.',
    'pre-order-osc':
      'Delivered 2025-01-21/22 under the January 10, 2025 order to show cause (motion papers), before the June 2025 order. Cited in the Sang affirmation (pp.70-72); not performance of the June order.',
  };
  return out.map((s) => ({ ...s, note: notes[s.phase], readOnly: true }));
}

// Synthetic service bundle PDF with one placeholder page per document in condition C2.
export function buildBundlePdf(conditionsFile, facts) {
  const docs = conditionsFile.conditions.find((c) => c.kind === 'documents')?.items || [];
  const caption = facts?.case?.caption || 'People v Unknown Parties in Ownership and/or Control of Digital Wallet Addresses';
  const src = facts?.case?.sources?.decisionAndPleadings?.url || conditionsFile.extractedFrom?.url;
  const pages = [
    {
      title: 'Service document bundle (demo replay)',
      lines: [
        caption,
        `Index No. ${facts?.case?.indexNo || '700647/2025'} - ${facts?.case?.court || 'Supreme Court of the State of New York, Queens County'}`,
        '',
        'This bundle is a synthetic stand-in made for a software demonstration. It is not the actual papers served in the case.',
        'The real filings are public court records published at:',
        src || '',
        '',
        'Documents the order requires to be served (condition C2):',
        ...docs.map((d, i) => `${i + 1}. ${d}`),
      ],
    },
    ...docs.map((d, i) => ({
      title: `${i + 1}. ${d}`,
      lines: [
        `Placeholder page standing in for: ${d}.`,
        'No text from the real filing is reproduced here.',
        'In a real matter this page would be replaced by the filed document, and the bundle hash would change accordingly.',
      ],
    })),
  ];
  return buildPdf(pages, { title: 'ServeChain sample service bundle' });
}

// Synthetic affidavit of service PDF that lists the stand-in mint transactions.
export function buildAffidavitPdf({ facts, service, bundleHash, declaredFiledAt, networkName }) {
  return buildPdf(
    [
      {
        title: 'Sample affidavit data (to be sworn by the person who served)',
        lines: [
          `${facts?.case?.court || 'Supreme Court of the State of New York, Queens County'} - Index No. ${facts?.case?.indexNo || '700647/2025'}`,
          '',
          'Sample affidavit data (to be sworn by the person who served, CPLR 306(d)). Produced by a software demonstration; nobody swore to it and it was not filed.',
          `Declared filing time (entered by the filer, not proven by the chain): ${declaredFiledAt}`,
          `Network: ${networkName}. Recipients are stand-in wallets, not the defendants' wallets.`,
          `SHA-256 of the served document bundle: ${bundleHash}`,
          '',
          'Service notices minted:',
          ...service.map((s) => `${s.recipientLabel}: ${s.recipient} - token ${s.tokenId} - tx ${s.txHash} (block ${s.block}, ${s.timestamp})`),
        ],
      },
    ],
    { title: 'ServeChain sample affidavit' },
  );
}

// Adds whole days to a unix time and returns ISO.
export function isoPlusDays(unix, days) {
  return new Date((unix + days * DAY) * 1000).toISOString();
}

// Unix seconds to ISO string.
export function iso(unix) {
  return unix == null ? null : new Date(Number(unix) * 1000).toISOString();
}
