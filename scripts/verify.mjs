#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, http, keccak256, encodeAbiParameters } from 'viem';
import { foundry, sepolia } from 'viem/chains';
import { ROOT, artifact, collectEvents, readEnv } from './lib/chain.mjs';
import { sha256File, merkleRoot } from './lib/hash.mjs';

const CHAINS = { 31337: { chain: foundry, rpc: 'http://127.0.0.1:8546' }, 11155111: { chain: sepolia, rpc: 'https://ethereum-sepolia-rpc.publicnode.com' } };

// Loads chain events live from RPC, falling back to the events.json beside case.json.
async function loadEvents(c, casePath, { offline, rpcUrl }) {
  const file = path.join(path.dirname(casePath), 'events.json');
  if (!offline) {
    const known = CHAINS[c.chain.chainId];
    const url = rpcUrl || (c.chain.chainId === 11155111 ? readEnv().SEPOLIA_RPC_URL : null) || known?.rpc;
    try {
      if (!known || !url) throw new Error('no RPC for chain');
      const pub = createPublicClient({ chain: known.chain, transport: http(url, { retryCount: 1, timeout: 15_000 }) });
      if ((await pub.getChainId()) !== c.chain.chainId) throw new Error('RPC chain id differs');
      const events = await collectEvents(
        pub,
        [
          { name: 'CaseFileRegistry', address: c.chain.registry, abi: artifactAbi('CaseFileRegistry') },
          { name: 'ServiceNotice721', address: c.chain.notice721, abi: artifactAbi('ServiceNotice721') },
        ],
        c.chain.fromBlock,
      );
      return { events, source: `live RPC (chainId ${c.chain.chainId})`, offline: false };
    } catch (e) {
      if (!fs.existsSync(file)) throw new Error(`RPC failed (${e.shortMessage || e.message}) and no events.json`);
      return { events: JSON.parse(fs.readFileSync(file, 'utf8')), source: `events.json (offline fallback: ${e.shortMessage || e.message})`, offline: true };
    }
  }
  return { events: JSON.parse(fs.readFileSync(file, 'utf8')), source: 'events.json (offline; trusts the cached log file)', offline: true };
}

// Returns a contract ABI from forge-out, or a minimal event ABI if forge-out is absent.
function artifactAbi(name) {
  try {
    return artifact(name).abi;
  } catch {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'abi', `${name}.json`), 'utf8'));
  }
}

const eq = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
const toUnix = (s) => Math.floor(new Date(s).getTime() / 1000);

// Rebuilds the case from chain events and compares it with the PDF and case.json.
export async function verifyExhibit({ pdfPath, casePath, offline = false, rpcUrl = null }) {
  const c = JSON.parse(fs.readFileSync(casePath, 'utf8'));
  const pdfSha = sha256File(pdfPath);
  const { events, source, offline: usedOffline } = await loadEvents(c, casePath, { offline, rpcUrl });
  const mine = (e) => eq(e.address, e.contract === 'CaseFileRegistry' ? c.chain.registry : c.chain.notice721);
  const reg = events.filter((e) => e.contract === 'CaseFileRegistry' && mine(e) && eq(e.args.caseId, c.caseId));
  const nft = events.filter((e) => e.contract === 'ServiceNotice721' && mine(e) && e.event === 'NoticeServed' && eq(e.args.caseId, c.caseId));
  const slot = c.exhibit?.registrySlot ?? 5;
  const fulfilled = reg.filter((e) => e.event === 'ConditionFulfilled');
  const opened = reg.find((e) => e.event === 'CaseOpened');
  const bound = reg.find((e) => e.event === 'CaseRefBound');
  const done = reg.find((e) => e.event === 'ServiceCompleted');
  const snap = reg.find((e) => e.event === 'ActivitySnapshot');
  const anchor = fulfilled.find((e) => Number(e.args.conditionId) === slot);
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

  check('exhibit PDF SHA-256 anchored in registry', anchor && eq(anchor.args.evidenceHash, pdfSha), `pdf ${pdfSha} vs chain ${anchor?.args.evidenceHash ?? 'none'}`);
  check('case opened with the order hash', opened && eq(opened.args.orderHash, c.order.hash), opened?.txHash);
  const derived = bound && keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [bound.args.handler, bound.args.caseRef]));
  check(
    'case id derived from handler and caseRef',
    bound && eq(derived, c.caseId) && eq(bound.args.caseRef, c.caseRef) && eq(bound.args.handler, opened?.args.handler),
    bound ? `handler ${bound.args.handler}` : 'no CaseRefBound event',
  );
  check('conditions hash', opened && eq(opened.args.conditionsHash, c.order.conditionsHash));
  check(
    'service notices carry the bundle hash',
    nft.length > 0 && nft.length === c.service.length && nft.every((e) => eq(e.args.documentsHash, c.documents.bundleHash)),
    `${nft.length} notices`,
  );
  check('notice recipients match case.json', c.service.every((s) => nft.some((e) => eq(e.args.recipient, s.recipient) && eq(e.txHash, s.txHash))));
  const statusOk = c.conditions.every((k) => (k.status === 'fulfilled') === fulfilled.some((e) => Number(e.args.conditionId) === k.id));
  check('condition statuses match ConditionFulfilled events', statusOk, `${fulfilled.filter((e) => Number(e.args.conditionId) !== slot).length}/${c.conditions.length} fulfilled`);
  check(
    'affidavit hash and declaredFiledAt',
    done && eq(done.args.affidavitHash, c.affidavit.hash) && Number(done.args.filedAt) === toUnix(c.affidavit.declaredFiledAt),
    done ? `declaredFiledAt ${c.affidavit.declaredFiledAt}` : 'not recorded',
  );
  if (snap) check('activity snapshot root recomputes from leaves', eq(snap.args.activityRootHash, merkleRoot(c.snapshot.leaves)) && eq(snap.args.activityRootHash, c.snapshot.activityRootHash));
  else check('activity snapshot pending (not anchored)', c.snapshot?.status === 'pending', `pending until ${c.snapshot?.pendingUntil}`);
  const ok = checks.every((x) => x.ok);
  const verdict = ok ? 'MATCH' : 'MISMATCH';
  const label = ok && usedOffline ? 'MATCH (offline: against bundled events.json, not independent)' : verdict;
  return { verdict, label, offline: usedOffline, pdfSha, source, checks };
}

// CLI entry: prints each check and exits 0 on MATCH, 1 on MISMATCH.
async function cli() {
  const args = process.argv.slice(2);
  const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
  const pdfPath = args.find((a, i) => !a.startsWith('--') && !['--case', '--rpc'].includes(args[i - 1]));
  if (!pdfPath) {
    console.error('usage: npm run verify -- <exhibit.pdf> [--case web/public/case/case.json] [--offline] [--rpc URL]');
    process.exit(2);
  }
  const casePath = opt('--case') || path.join(ROOT, 'web', 'public', 'case', 'case.json');
  const r = await verifyExhibit({ pdfPath, casePath, offline: args.includes('--offline'), rpcUrl: opt('--rpc') });
  console.log(`events: ${r.source}`);
  for (const x of r.checks) console.log(`${x.ok ? 'ok  ' : 'FAIL'} ${x.name}${x.detail ? ` — ${x.detail}` : ''}`);
  console.log(r.label);
  process.exit(r.verdict === 'MATCH' ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  cli().catch((e) => {
    console.error(e.message);
    process.exit(2);
  });
}
