#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, http, keccak256, encodeAbiParameters, parseAbiItem } from 'viem';
import { foundry, sepolia } from 'viem/chains';
import { ROOT, artifact, collectEvents, readEnv } from './lib/chain.mjs';
import { sha256File, merkleRoot, hashJson } from './lib/hash.mjs';
import { deadlineView, GATE_NOTE } from './lib/deadline.mjs';

export const TRUSTS = 'Trusts: the contract addresses and issuer published in case.json; confirm the issuer through an independent channel';
export const EXIT = { MATCH: 0, MISMATCH: 1, ERROR: 2, OFFLINE_MATCH: 3 };

const CHAINS = {
  31337: { chain: foundry, rpcs: ['http://127.0.0.1:8546'] },
  11155111: { chain: sepolia, rpcs: ['https://ethereum-sepolia-rpc.publicnode.com', 'https://sepolia.gateway.tenderly.co', 'https://sepolia.drpc.org'] },
};
const LEGACY_CASE_OPENED = parseAbiItem(
  'event CaseOpened(bytes32 indexed caseId, address indexed handler, bytes32 orderHash, bytes32 conditionsHash, uint8 conditionCount, uint64 serviceDeadline)',
);

// Returns a contract ABI from forge-out, or the committed copy if forge-out is absent.
function artifactAbi(name) {
  try {
    return artifact(name).abi;
  } catch {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'abi', `${name}.json`), 'utf8'));
  }
}

// Builds a viem public client for one RPC URL.
function defaultClient(url, chain) {
  return createPublicClient({ chain, transport: http(url, { retryCount: 1, timeout: 15_000 }) });
}

// Orders candidate RPCs: explicit --rpc values, then SEPOLIA_RPC_URL, then the public defaults.
function rpcCandidates(chainId, rpcUrls) {
  const env = chainId === 11155111 ? readEnv().SEPOLIA_RPC_URL : null;
  return [...new Set([...(rpcUrls || []), env, ...(CHAINS[chainId]?.rpcs || [])].filter(Boolean))];
}

const digest = (events) => JSON.stringify(events.map((e) => [e.txHash, e.logIndex, e.event, e.args]));

// Reads events and owner() from up to two RPCs over the same block range and compares them.
async function loadLive(c, rpcUrls, makeClient) {
  const known = CHAINS[c.chain.chainId];
  if (!known) throw new Error(`no RPC for chain ${c.chain.chainId}`);
  const nftAbi = artifactAbi('ServiceNotice721');
  const contracts = [
    { name: 'CaseFileRegistry', address: c.chain.registry, abi: [...artifactAbi('CaseFileRegistry'), LEGACY_CASE_OPENED] },
    { name: 'ServiceNotice721', address: c.chain.notice721, abi: nftAbi },
  ];
  const heads = [];
  const errors = [];
  for (const url of rpcCandidates(c.chain.chainId, rpcUrls)) {
    if (heads.length === 2) break;
    try {
      const pub = makeClient(url, known.chain);
      const id = Number(await pub.getChainId());
      if (id !== c.chain.chainId) throw new Error(`RPC chain id ${id} != ${c.chain.chainId}`);
      heads.push({ url, pub, head: BigInt(await pub.getBlockNumber()) });
    } catch (e) {
      errors.push(`${hostOf(url)}: ${e.shortMessage || e.message}`);
    }
  }
  if (!heads.length) throw new Error(errors.join('; ') || 'no RPC');
  const toBlock = heads.reduce((m, h) => (h.head < m ? h.head : m), heads[0].head);
  const reads = [];
  for (const h of heads) {
    try {
      const events = await collectEvents(h.pub, contracts, c.chain.fromBlock, { toBlock });
      const owner = await h.pub.readContract({ address: c.chain.notice721, abi: nftAbi, functionName: 'owner' });
      reads.push({ url: h.url, events, owner });
    } catch (e) {
      errors.push(`${hostOf(h.url)}: ${e.shortMessage || e.message}`);
    }
  }
  if (!reads.length) throw new Error(errors.join('; '));
  const agree = reads.length < 2 || (digest(reads[0].events) === digest(reads[1].events) && eq(reads[0].owner, reads[1].owner));
  const hosts = reads.map((r) => hostOf(r.url)).join(', ');
  const mode = reads.length >= 2 ? (agree ? 'Live (2 RPCs agree)' : 'Live (2 RPCs DISAGREE)') : 'Live (1 RPC)';
  return { events: reads[0].events, owners: reads.map((r) => r.owner), agree, rpcCount: reads.length, mode, source: `${mode}: ${hosts}, chainId ${c.chain.chainId}, blocks ${c.chain.fromBlock}..${toBlock}${errors.length ? ` (skipped ${errors.join('; ')})` : ''}` };
}

// Loads chain events live, falling back to the events.json beside case.json.
async function loadEvents(c, casePath, { offline, rpcUrls, makeClient }) {
  const file = path.join(path.dirname(casePath), 'events.json');
  const cached = (why) => ({ events: JSON.parse(fs.readFileSync(file, 'utf8')), owners: [], agree: true, rpcCount: 0, offline: true, mode: 'Offline', source: why });
  if (offline) return cached('events.json (offline; trusts the cached log file)');
  try {
    return { ...(await loadLive(c, rpcUrls, makeClient)), offline: false };
  } catch (e) {
    if (!fs.existsSync(file)) throw new Error(`RPC failed (${e.message}) and no events.json`);
    return cached(`events.json (offline fallback: ${e.message})`);
  }
}

const hostOf = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};
const eq = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
const toUnix = (s) => Math.floor(new Date(s).getTime() / 1000);
const bits = (mask) => [...BigInt(mask).toString(2)].reverse().flatMap((b, i) => (b === '1' ? [i] : []));

// Service condition ids: chain.serviceMask in case.json, else every condition that is not the affidavit.
export function serviceIdsOf(c) {
  if (c.chain?.serviceMask != null) return bits(c.chain.serviceMask);
  return c.conditions.filter((k) => k.kind !== 'affidavit').map((k) => k.id);
}

// True if the evidence hash is the canonical-JSON hash of the preimage or one of its *Sha256 fields.
function preimageMatches(preimage, h) {
  if (!preimage) return false;
  if (eq(hashJson(preimage), h)) return true;
  return Object.entries(preimage).some(([k, v]) => k.endsWith('Sha256') && eq(v, h));
}

// Re-derives every condition link: txRef target, evidence preimage, deadlines and filing order.
function conditionLinkChecks(c, { nft, fulfilled, opened, done, slot }, check) {
  const serviceIds = serviceIdsOf(c);
  if (opened?.args.serviceMask != null) {
    check('service condition mask on chain matches case.json', eq(BigInt(opened.args.serviceMask), serviceIds.reduce((m, i) => m | (1n << BigInt(i)), 0n)), `chain ${opened.args.serviceMask}, ids ${serviceIds.join(',')}`);
  }
  const noticeTxs = new Set(nft.map((e) => e.txHash.toLowerCase()));
  const affId = c.conditions.find((k) => k.kind === 'affidavit')?.id;
  for (const f of fulfilled) {
    const id = Number(f.args.conditionId);
    if (id === slot) continue;
    const ev = c.conditions.find((k) => k.id === id)?.evidence?.find((x) => x.type === 'tx' && eq(x.txHash, f.txHash));
    const problems = [];
    if (serviceIds.includes(id) && !noticeTxs.has(String(f.args.txRef).toLowerCase())) problems.push('txRef is not a NoticeServed tx of this case');
    if (id === affId && !(done && eq(f.args.txRef, done.txHash))) problems.push('txRef is not the ServiceCompleted tx');
    if (!ev) problems.push('no evidence entry in case.json for this tx');
    else {
      if (!eq(ev.evidenceHash, f.args.evidenceHash) || (ev.txRef != null && !eq(ev.txRef, f.args.txRef))) problems.push('case.json evidence differs from chain');
      if (!preimageMatches(ev.preimage, f.args.evidenceHash)) problems.push('preimage does not hash to evidenceHash');
    }
    check(`condition ${id + 1} evidence link`, problems.length === 0, problems.join('; ') || `txRef ${String(f.args.txRef).slice(0, 10)}…, preimage recomputed`);
  }
  const deadline = Number(opened?.args.serviceDeadline ?? 0);
  const late = nft.filter((e) => !(Number(e.timestamp) <= deadline));
  check('every notice served on or before the service deadline', opened && nft.length > 0 && late.length === 0, late.length ? `${late.length} late` : `deadline ${new Date(deadline * 1000).toISOString()}`);
  const serviceAt = fulfilled.filter((f) => serviceIds.includes(Number(f.args.conditionId))).map((f) => Number(f.args.fulfilledAt ?? f.timestamp));
  if (done) {
    const lastAt = Math.max(0, ...serviceAt);
    check('filedAt not earlier than the last service evidence', Number(done.args.filedAt) >= lastAt && serviceAt.length === serviceIds.length && serviceAt.every((t) => t <= deadline), `filedAt ${done.args.filedAt} vs last ${lastAt}`);
  }
}

// Reads deployments/<chainId>.json if present.
function readDeployment(dir, chainId) {
  const p = dir && path.join(dir, `${chainId}.json`);
  return p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

// Rebuilds the case from chain events and compares it with the PDF and case.json.
export async function verifyExhibit({ pdfPath, casePath, offline = false, rpcUrls = [], rpcUrl = null, expectHandler = null, deploymentsDir = path.join(ROOT, 'deployments'), makeClient = defaultClient }) {
  const c = JSON.parse(fs.readFileSync(casePath, 'utf8'));
  const pdfSha = sha256File(pdfPath);
  const loaded = await loadEvents(c, casePath, { offline, rpcUrls: rpcUrl ? [rpcUrl, ...rpcUrls] : rpcUrls, makeClient });
  const { events } = loaded;
  const mine = (e) => eq(e.address, e.contract === 'CaseFileRegistry' ? c.chain.registry : c.chain.notice721);
  const reg = events.filter((e) => e.contract === 'CaseFileRegistry' && mine(e) && eq(e.args.caseId, c.caseId));
  const nftAll = events.filter((e) => e.contract === 'ServiceNotice721' && mine(e));
  const nft = nftAll.filter((e) => e.event === 'NoticeServed' && eq(e.args.caseId, c.caseId));
  const slot = c.exhibit?.registrySlot ?? 5;
  const fulfilled = reg.filter((e) => e.event === 'ConditionFulfilled');
  const opened = reg.find((e) => e.event === 'CaseOpened');
  const bound = reg.find((e) => e.event === 'CaseRefBound');
  const done = reg.find((e) => e.event === 'ServiceCompleted');
  const snap = reg.find((e) => e.event === 'ActivitySnapshot');
  const anchor = fulfilled.find((e) => Number(e.args.conditionId) === slot);
  const checks = [];
  const check = (name, ok, detail = '', level = 'fail') => checks.push({ name, ok: Boolean(ok), detail, level });

  check('exhibit PDF SHA-256 anchored in registry', anchor && eq(anchor.args.evidenceHash, pdfSha), `pdf ${pdfSha} vs chain ${anchor?.args.evidenceHash ?? 'none'}`);
  if (!loaded.offline) check('live RPCs return the same events and owner', loaded.agree, loaded.mode);
  const issuer = expectHandler || c.chain.issuer;
  if (expectHandler) check('case.json issuer equals --expect-handler', eq(c.chain.issuer, expectHandler), `case.json ${c.chain.issuer} vs expected ${expectHandler}`);
  const dep = readDeployment(deploymentsDir, c.chain.chainId);
  if (dep) {
    check(
      `deployments/${c.chain.chainId}.json matches case.json`,
      eq(dep.issuer, c.chain.issuer) && eq(dep.CaseFileRegistry, c.chain.registry) && eq(dep.ServiceNotice721, c.chain.notice721),
      `issuer ${dep.issuer}`,
    );
  } else check(`deployments/${c.chain.chainId}.json not available to compare`, true, '', 'warn');
  check(
    'registry handler is the issuer',
    issuer && opened && bound && eq(opened.args.handler, issuer) && eq(bound.args.handler, issuer),
    `issuer ${issuer ?? 'missing'} vs CaseOpened ${opened?.args.handler ?? 'none'}`,
  );
  const ownerEv = nftAll.filter((e) => e.event === 'OwnershipTransferred').at(-1);
  const owners = [ownerEv?.args.newOwner, ...loaded.owners].filter(Boolean);
  check('notice contract owner is the issuer', issuer && owners.length > 0 && owners.every((o) => eq(o, issuer)), `owner ${owners[0] ?? 'unknown'}${loaded.owners.length ? ' (owner() read live)' : ' (from OwnershipTransferred)'}`);
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
  conditionLinkChecks(c, { nft, fulfilled, opened, done, slot }, check);
  check(
    'affidavit hash and declaredFiledAt',
    done && eq(done.args.affidavitHash, c.affidavit.hash) && Number(done.args.filedAt) === toUnix(c.affidavit.declaredFiledAt),
    done ? `declaredFiledAt ${c.affidavit.declaredFiledAt}` : 'not recorded',
  );
  if (snap) check('activity snapshot root recomputes from leaves', eq(snap.args.activityRootHash, merkleRoot(c.snapshot.leaves)) && eq(snap.args.activityRootHash, c.snapshot.activityRootHash));
  else check('activity snapshot pending (not anchored)', c.snapshot?.status === 'pending', `snapshot gate opens ${c.snapshot?.pendingUntil} (filedAt + 720 h). ${GATE_NOTE}`);
  const deadline = done ? deadlineView(Number(done.args.filedAt), Number(done.args.responseDeadline)) : null;
  const ok = checks.every((x) => x.ok || x.level === 'warn');
  const verdict = ok ? 'MATCH' : 'MISMATCH';
  const label = !ok ? 'MISMATCH' : loaded.offline ? 'MATCH (offline: against bundled events.json, not independent)' : `MATCH (${loaded.mode})`;
  const exitCode = !ok ? EXIT.MISMATCH : loaded.offline ? EXIT.OFFLINE_MATCH : EXIT.MATCH;
  return { verdict, label, exitCode, deadline, offline: loaded.offline, mode: loaded.mode, rpcCount: loaded.rpcCount, pdfSha, source: loaded.source, issuer, trusts: TRUSTS, checks };
}

export class UsageError extends Error {}
const VALUED = ['--case', '--rpc', '--expect-handler', '--deployments'];
const usage = (m) => new UsageError(m);

// Parses argv; accepts --flag value and --flag=value, --rpc may repeat, anything malformed throws UsageError.
export function parseArgs(args) {
  const seen = {};
  const o = { rpcUrls: [], offline: false };
  let pdfPath = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) {
      if (a.trim() === '') throw usage('empty argument');
      if (pdfPath) throw usage(`unexpected extra argument: ${a}`);
      pdfPath = a;
      continue;
    }
    const eqAt = a.indexOf('=');
    const name = eqAt < 0 ? a : a.slice(0, eqAt);
    const inline = eqAt < 0 ? undefined : a.slice(eqAt + 1);
    if (name === '--offline') {
      if (inline !== undefined) throw usage('--offline takes no value');
      o.offline = true;
      continue;
    }
    if (!VALUED.includes(name)) throw usage(`unknown option: ${name}`);
    const v = inline ?? args[++i];
    if (v === undefined || v.trim() === '' || (inline === undefined && v.startsWith('--'))) throw usage(`${name} needs a non-empty value`);
    if (name !== '--rpc' && seen[name]) throw usage(`${name} given more than once`);
    seen[name] = true;
    if (name === '--rpc') {
      if (!/^(https?|wss?):\/\/\S+$/.test(v)) throw usage(`--rpc must be an http(s) or ws(s) URL: ${v}`);
      o.rpcUrls.push(v);
    } else if (name === '--expect-handler') {
      if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw usage(`--expect-handler must be a 0x-prefixed 20-byte address: ${v}`);
      o.expectHandler = v;
    } else if (name === '--case') o.casePath = v;
    else o.deploymentsDir = v;
  }
  return {
    pdfPath,
    casePath: o.casePath || path.join(ROOT, 'web', 'public', 'case', 'case.json'),
    rpcUrls: o.rpcUrls,
    expectHandler: o.expectHandler || null,
    offline: o.offline,
    ...(o.deploymentsDir ? { deploymentsDir: o.deploymentsDir } : {}),
  };
}

// True when the file starts with the %PDF- header.
export function looksLikePdf(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(5);
    return fs.readSync(fd, head, 0, 5, 0) === 5 && head.toString('latin1') === '%PDF-';
  } finally {
    fs.closeSync(fd);
  }
}

// CLI entry: exit 0 live MATCH, 3 offline MATCH, 1 MISMATCH, 2 error.
async function cli() {
  const help = 'usage: npm run verify -- <exhibit.pdf> [--case web/public/case/case.json] [--offline] [--rpc URL]... [--expect-handler 0xADDR] [--deployments DIR]';
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`${e.message}\n${help}`);
    process.exit(EXIT.ERROR);
  }
  if (!o.pdfPath) {
    console.error(help);
    process.exit(EXIT.ERROR);
  }
  for (const [what, p] of [['input file', o.pdfPath], ['case file', o.casePath]]) {
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
      console.error(`${what} not found: ${p}`);
      process.exit(EXIT.ERROR);
    }
  }
  const notPdf = !looksLikePdf(o.pdfPath);
  const r = await verifyExhibit(o);
  console.log(`events: ${r.source}`);
  for (const x of r.checks) console.log(`${x.ok ? 'ok  ' : x.level === 'warn' ? 'warn' : 'FAIL'} ${x.name}${x.detail ? ` — ${x.detail}` : ''}`);
  if (r.deadline) {
    console.log(`response deadline (calendar estimate): ${r.deadline.calendar}, through the end of that New York day (${r.deadline.rule})`);
    console.log(`${r.deadline.chainLabel}: ${r.deadline.chain} (New York date ${r.deadline.chainNY}${r.deadline.differs ? ', differs from the calendar date' : ''}). ${r.deadline.chainNote}`);
  }
  if (notPdf) console.log('hint: input is not a PDF (no %PDF- header); the compliance summary is a PDF file');
  console.log(r.trusts);
  console.log(r.label);
  process.exit(r.exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  cli().catch((e) => {
    console.error(e.message);
    process.exit(EXIT.ERROR);
  });
}
