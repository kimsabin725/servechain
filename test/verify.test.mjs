import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { encodeAbiParameters, encodeEventTopics } from 'viem';
import { verifyExhibit, parseArgs, EXIT, TRUSTS, UsageError } from '../scripts/verify.mjs';
import { sha256Hex, merkleRoot, hashJson } from '../scripts/lib/hash.mjs';
import { ROOT, collectEvents, LOG_CHUNK } from '../scripts/lib/chain.mjs';
import { caseIdOf } from '../scripts/lib/casedata.mjs';

const REG = '0x00000000000000000000000000000000000000aa';
const NFT = '0x00000000000000000000000000000000000000bb';
const HANDLER = '0x00000000000000000000000000000000000000cc';
const OTHER = '0x00000000000000000000000000000000000000dd';
const RECIPIENT = '0x0000000000000000000000000000000000000001';
const T = 1_761_000_000;
const DEADLINE = T + 120 * 86400;
const ABI = ['CaseFileRegistry', 'ServiceNotice721'].flatMap((n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'abi', `${n}.json`), 'utf8')));
const tx = (i) => '0x' + String(i).padStart(64, '0');
const h = (b) => '0x' + b.repeat(32);

// Returns a copy of the bytes with one ASCII letter changed.
function flipOneLetter(buf) {
  const out = Buffer.from(buf);
  for (let i = Math.floor(out.length / 2); i < out.length; i++) {
    const ch = out[i];
    if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122)) {
      out[i] = ch === 120 ? 121 : 120;
      return out;
    }
  }
  throw new Error('no letter found');
}

// Builds a consistent case.json/events.json pair with one service condition, an affidavit slot and the exhibit anchor.
function build(pdfSha) {
  const caseRef = h('11');
  const caseId = caseIdOf(HANDLER, caseRef);
  const leaves = [sha256Hex('w1'), sha256Hex('w2')];
  const bundle = h('44');
  const affidavit = h('66');
  const preimage0 = { bundleSha256: bundle, documentsUrl: 'https://example.org/b.pdf' };
  const preimage1 = { affidavitSha256: affidavit, declaredFiledAt: new Date((T + 4) * 1000).toISOString() };
  const ev = (address, event, args, i) => ({ contract: address === REG ? 'CaseFileRegistry' : 'ServiceNotice721', address, event, args, txHash: tx(i), block: i, logIndex: 0, timestamp: T + i });
  const events = [
    ev(NFT, 'OwnershipTransferred', { previousOwner: '0x0000000000000000000000000000000000000000', newOwner: HANDLER }, 1),
    ev(REG, 'CaseRefBound', { caseId, handler: HANDLER, caseRef }, 1),
    ev(REG, 'CaseOpened', { caseId, handler: HANDLER, orderHash: h('22'), conditionsHash: h('33'), conditionCount: 6, serviceMask: '1', serviceDeadline: String(DEADLINE) }, 1),
    ev(NFT, 'NoticeServed', { tokenId: '1', caseId, conditionId: 0, recipient: RECIPIENT, documentsHash: bundle, documentsUrl: 'https://example.org/b.pdf' }, 2),
    ev(REG, 'ConditionFulfilled', { caseId, conditionId: 0, evidenceHash: bundle, txRef: tx(2), fulfilledAt: String(T + 3) }, 3),
    ev(REG, 'ServiceCompleted', { caseId, affidavitHash: affidavit, filedAt: String(T + 4), responseDeadline: String(T + 4 + 30 * 86400) }, 4),
    ev(REG, 'ConditionFulfilled', { caseId, conditionId: 1, evidenceHash: affidavit, txRef: tx(4), fulfilledAt: String(T + 5) }, 5),
    ev(REG, 'ActivitySnapshot', { caseId, activityRootHash: merkleRoot(leaves), snapshotAt: String(T + 6) }, 6),
    ev(REG, 'ConditionFulfilled', { caseId, conditionId: 5, evidenceHash: pdfSha, txRef: tx(6), fulfilledAt: String(T + 7) }, 7),
  ];
  const evidence = (id, preimage) => [{ type: 'tx', txHash: tx(id === 0 ? 3 : 5), evidenceHash: id === 0 ? bundle : affidavit, txRef: id === 0 ? tx(2) : tx(4), preimage }];
  const c = {
    caseId, caseRef, chain: { chainId: 31337, registry: REG, notice721: NFT, fromBlock: 1, issuer: HANDLER, serviceMask: '1' },
    order: { hash: h('22'), conditionsHash: h('33') },
    documents: { bundleHash: bundle },
    service: [{ recipient: RECIPIENT, txHash: tx(2) }],
    conditions: [
      { id: 0, kind: 'documents', status: 'fulfilled', evidence: evidence(0, preimage0) },
      { id: 1, kind: 'affidavit', status: 'fulfilled', evidence: evidence(1, preimage1) },
      { id: 2, kind: 'note', status: 'missing', evidence: [] },
    ],
    affidavit: { hash: affidavit, declaredFiledAt: new Date((T + 4) * 1000).toISOString() },
    snapshot: { activityRootHash: merkleRoot(leaves), leaves },
    exhibit: { registrySlot: 5 },
  };
  return { c, events };
}

// Writes a fixture to a temp dir; mutate(c, events) may tamper with it before writing.
function fixture(mutate = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-verify-'));
  const pdf = Buffer.from('%PDF-1.4\nExhibit material for an affidavit of service\n%%EOF\n');
  fs.writeFileSync(path.join(dir, 'exhibit.pdf'), pdf);
  fs.writeFileSync(path.join(dir, 'exhibit-tampered.pdf'), flipOneLetter(pdf));
  const { c, events } = build(sha256Hex(pdf));
  mutate(c, events);
  fs.writeFileSync(path.join(dir, 'case.json'), JSON.stringify(c));
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(events));
  return { dir, pdf: path.join(dir, 'exhibit.pdf'), bad: path.join(dir, 'exhibit-tampered.pdf'), casePath: path.join(dir, 'case.json'), events };
}

const run = (f, opts = {}) => verifyExhibit({ pdfPath: f.pdf, casePath: f.casePath, offline: true, deploymentsDir: f.dir, ...opts });
const failed = (r) => r.checks.filter((x) => !x.ok && x.level !== 'warn').map((x) => x.name);

// Encodes a decoded fixture event back into a raw log for a mock RPC.
function toLog(e) {
  const item = ABI.find((x) => x.type === 'event' && x.name === e.event && x.inputs.every((i) => i.name in e.args));
  const val = (i) => (i.type.startsWith('uint') ? BigInt(e.args[i.name]) : e.args[i.name]);
  const indexed = Object.fromEntries(item.inputs.filter((i) => i.indexed).map((i) => [i.name, val(i)]));
  const rest = item.inputs.filter((i) => !i.indexed);
  return {
    address: e.address, topics: encodeEventTopics({ abi: [item], eventName: e.event, args: indexed }), data: encodeAbiParameters(rest, rest.map(val)),
    blockNumber: BigInt(e.block), transactionHash: e.txHash, logIndex: e.logIndex,
  };
}

// Mock viem client serving the given events; records each getLogs range.
function mockClient(events, { chainId = 31337, head = 25_000n, owner = HANDLER, fail = false } = {}) {
  const ranges = [];
  const logs = events.map(toLog);
  return {
    ranges,
    getChainId: async () => chainId,
    getBlockNumber: async () => {
      if (fail) throw new Error('connection refused');
      return head;
    },
    getLogs: async ({ address, fromBlock, toBlock }) => {
      ranges.push([fromBlock, toBlock]);
      const addrs = [].concat(address).map((a) => a.toLowerCase());
      return logs.filter((l) => addrs.includes(l.address.toLowerCase()) && l.blockNumber >= fromBlock && l.blockNumber <= toBlock);
    },
    getBlock: async ({ blockNumber }) => ({ timestamp: BigInt(T) + blockNumber }),
    readContract: async () => owner,
  };
}

test('fixture: anchored PDF matches offline, one changed letter mismatches', async () => {
  const f = fixture();
  const ok = await run(f);
  assert.deepEqual(failed(ok), []);
  assert.equal(ok.verdict, 'MATCH');
  assert.equal(ok.label, 'MATCH (offline: against bundled events.json, not independent)');
  assert.equal(ok.exitCode, EXIT.OFFLINE_MATCH);
  assert.equal(ok.trusts, TRUSTS);
  const r = await run(f, { pdfPath: f.bad });
  assert.equal(r.verdict, 'MISMATCH');
  assert.equal(r.exitCode, EXIT.MISMATCH);
  assert.equal(r.checks[0].ok, false);
});

test('CLI exit codes: offline MATCH is 3, MISMATCH is 1, and the trust line is printed', () => {
  const f = fixture();
  const cli = (pdf, ...extra) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'verify.mjs'), pdf, '--case', f.casePath, '--deployments', f.dir, '--offline', ...extra], { encoding: 'utf8' });
  const ok = cli(f.pdf);
  assert.equal(ok.status, 3, ok.stderr);
  assert.match(ok.stdout, /Trusts: the contract addresses and issuer published in case\.json/);
  assert.equal(cli(f.bad).status, 1);
  assert.equal(cli(f.pdf, '--expect-handler', OTHER).status, 1);
});

test('parseArgs reads repeated --rpc and --expect-handler', () => {
  const o = parseArgs(['x.pdf', '--rpc', 'http://a', '--rpc', 'http://b', '--expect-handler', OTHER, '--offline']);
  assert.deepEqual(o.rpcUrls, ['http://a', 'http://b']);
  assert.equal(o.expectHandler, OTHER);
  assert.equal(o.pdfPath, 'x.pdf');
  assert.equal(o.offline, true);
});

test('parseArgs accepts --flag=value and rejects missing, empty or malformed values', () => {
  const o = parseArgs(['--case=c.json', '--rpc=http://a', 'x.pdf', `--expect-handler=${OTHER}`, '--deployments=d']);
  assert.equal(o.casePath, 'c.json');
  assert.deepEqual(o.rpcUrls, ['http://a']);
  assert.equal(o.expectHandler, OTHER);
  assert.equal(o.deploymentsDir, 'd');
  const bad = [
    ['x.pdf', '--case'], ['x.pdf', '--case', ''], ['x.pdf', '--case='], ['x.pdf', '--rpc', '--offline'], ['x.pdf', '--rpc=  '],
    ['x.pdf', '--rpc', 'not-a-url'], ['x.pdf', '--expect-handler', ''], ['x.pdf', '--expect-handler=0x12'], ['x.pdf', '--offline=yes'],
    ['x.pdf', '--cases', 'c.json'], ['x.pdf', 'y.pdf'], ['x.pdf', '--case', 'a', '--case', 'b'], [''],
  ];
  for (const args of bad) assert.throws(() => parseArgs(args), UsageError, JSON.stringify(args));
});

test('CLI: usage errors exit 2 with a message; a non-PDF input is MISMATCH with a hint', () => {
  const f = fixture();
  const cli = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'verify.mjs'), ...args], { encoding: 'utf8' });
  for (const args of [[f.pdf, '--case'], [f.pdf, '--expect-handler='], [f.pdf, '--rpc', ''], [f.pdf, '--case', path.join(f.dir, 'missing.json')], [path.join(f.dir, 'missing.pdf'), '--case', f.casePath]]) {
    const r = cli(...args);
    assert.equal(r.status, 2, JSON.stringify(args));
    assert.ok(r.stderr.trim().length > 0);
  }
  const txt = path.join(f.dir, 'notes.txt');
  fs.writeFileSync(txt, 'hello');
  const empty = path.join(f.dir, 'empty.pdf');
  fs.writeFileSync(empty, '');
  for (const p of [txt, empty]) {
    const r = cli(p, '--case', f.casePath, '--deployments', f.dir, '--offline');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /input is not a PDF/);
  }
  const ok = cli(f.pdf, `--case=${f.casePath}`, `--deployments=${f.dir}`, '--offline');
  assert.equal(ok.status, 3, ok.stderr);
  assert.doesNotMatch(ok.stdout, /input is not a PDF/);
  assert.match(ok.stdout, /response deadline \(calendar estimate\): \d{4}-\d{2}-\d{2}, through the end of that New York day/);
  assert.match(ok.stdout, /on-chain timestamp \(filedAt \+ 720 h\)/);
});

test('binding: a case id not derived from the handler is MISMATCH', async () => {
  const f = fixture((c, ev) => {
    ev.find((e) => e.event === 'CaseRefBound').args.caseRef = h('99');
  });
  const r = await run(f);
  assert.equal(r.verdict, 'MISMATCH');
  assert.ok(failed(r).includes('case id derived from handler and caseRef'));
});

test('issuer: --expect-handler differing from case.json is MISMATCH', async () => {
  const r = await run(fixture(), { expectHandler: OTHER });
  assert.equal(r.verdict, 'MISMATCH');
  assert.deepEqual(failed(r).sort(), ['case.json issuer equals --expect-handler', 'notice contract owner is the issuer', 'registry handler is the issuer'].sort());
});

test('issuer: a notice contract owned by someone else is MISMATCH', async () => {
  const f = fixture((c, ev) => {
    ev.push({ ...ev[0], args: { previousOwner: HANDLER, newOwner: OTHER }, block: 8, txHash: tx(8) });
  });
  const r = await run(f);
  assert.deepEqual(failed(r), ['notice contract owner is the issuer']);
});

test('issuer: a case.json issuer that the registry handler does not match is MISMATCH', async () => {
  const r = await run(fixture((c) => { c.chain.issuer = OTHER; }));
  assert.ok(failed(r).includes('registry handler is the issuer'));
});

test('issuer: deployments/<chainId>.json disagreeing with case.json is MISMATCH', async () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.dir, '31337.json'), JSON.stringify({ issuer: OTHER, CaseFileRegistry: REG, ServiceNotice721: NFT }));
  assert.deepEqual(failed(await run(f)), ['deployments/31337.json matches case.json']);
  fs.writeFileSync(path.join(f.dir, '31337.json'), JSON.stringify({ issuer: HANDLER, CaseFileRegistry: REG, ServiceNotice721: NFT }));
  assert.equal((await run(f)).verdict, 'MATCH');
});

test('links: a txRef that is not a NoticeServed tx of the case is MISMATCH', async () => {
  const r = await run(fixture((c, ev) => {
    ev.find((e) => e.event === 'ConditionFulfilled' && e.args.conditionId === 0).args.txRef = tx(4);
    c.conditions[0].evidence[0].txRef = tx(4);
  }));
  assert.deepEqual(failed(r), ['condition 1 evidence link']);
});

test('links: a preimage that does not hash to evidenceHash is MISMATCH', async () => {
  const r = await run(fixture((c) => { c.conditions[1].evidence[0].preimage.affidavitSha256 = h('77'); }));
  assert.deepEqual(failed(r), ['condition 2 evidence link']);
});

test('links: a JSON preimage recomputes through canonical JSON', async () => {
  const pre = { recipients: [RECIPIENT], mintTxs: [tx(2)] };
  const r = await run(fixture((c, ev) => {
    const f0 = ev.find((e) => e.event === 'ConditionFulfilled' && e.args.conditionId === 0);
    f0.args.evidenceHash = hashJson(pre);
    Object.assign(c.conditions[0].evidence[0], { evidenceHash: hashJson(pre), preimage: pre });
  }));
  assert.deepEqual(failed(r), []);
});

test('links: a notice served after the service deadline is MISMATCH', async () => {
  const r = await run(fixture((c, ev) => { ev.find((e) => e.event === 'NoticeServed').timestamp = DEADLINE + 1; }));
  assert.deepEqual(failed(r), ['every notice served on or before the service deadline']);
});

test('links: filedAt before the last service evidence is MISMATCH', async () => {
  const r = await run(fixture((c, ev) => {
    ev.find((e) => e.event === 'ConditionFulfilled' && e.args.conditionId === 0).args.fulfilledAt = String(T + 50);
  }));
  assert.deepEqual(failed(r), ['filedAt not earlier than the last service evidence']);
});

test('a tampered case.json status is caught', async () => {
  const r = await run(fixture((c) => { c.conditions[2].status = 'fulfilled'; }));
  assert.equal(r.verdict, 'MISMATCH');
});

test('collectEvents reads logs in windows of at most 10,000 blocks covering the whole range', async () => {
  const { events } = build(h('ab'));
  const pub = mockClient(events.map((e, i) => ({ ...e, block: 1 + i * 3000 })), { head: 25_000n });
  const progress = [];
  const out = await collectEvents(pub, [{ name: 'CaseFileRegistry', address: REG, abi: ABI }, { name: 'ServiceNotice721', address: NFT, abi: ABI }], 1, { chunk: 50_000, onProgress: (d, t) => progress.push([d, t]) });
  assert.equal(LOG_CHUNK, 10_000);
  assert.equal(out.length, events.length);
  assert.ok(pub.ranges.every(([a, b]) => b - a + 1n <= 10_000n));
  assert.equal(pub.ranges[0][0], 1n);
  assert.equal(pub.ranges.at(-1)[1], 25_000n);
  for (let i = 1; i < pub.ranges.length; i++) assert.equal(pub.ranges[i][0], pub.ranges[i - 1][1] + 1n);
  assert.deepEqual(progress.at(-1), [3, 3]);
});

test('live: two agreeing RPCs give "Live (2 RPCs agree)" and exit 0', async () => {
  const f = fixture();
  const clients = { 'http://a': mockClient(f.events), 'http://b': mockClient(f.events) };
  const r = await verifyExhibit({ pdfPath: f.pdf, casePath: f.casePath, rpcUrls: Object.keys(clients), deploymentsDir: f.dir, makeClient: (u) => clients[u] ?? mockClient([], { fail: true }) });
  assert.deepEqual(failed(r), []);
  assert.equal(r.mode, 'Live (2 RPCs agree)');
  assert.equal(r.label, 'MATCH (Live (2 RPCs agree))');
  assert.equal(r.exitCode, EXIT.MATCH);
});

test('live: one reachable RPC gives "Live (1 RPC)"; a wrong chain id is skipped', async () => {
  const f = fixture();
  const clients = { 'http://a': mockClient(f.events, { chainId: 1 }), 'http://b': mockClient(f.events) };
  const r = await verifyExhibit({ pdfPath: f.pdf, casePath: f.casePath, rpcUrls: Object.keys(clients), deploymentsDir: f.dir, makeClient: (u) => clients[u] ?? mockClient([], { fail: true }) });
  assert.equal(r.mode, 'Live (1 RPC)');
  assert.match(r.source, /chain id 1 != 31337/);
  assert.equal(r.exitCode, EXIT.MATCH);
});

test('live: disagreeing RPCs or a live owner() that is not the issuer is MISMATCH', async () => {
  const f = fixture();
  const fewer = f.events.filter((e) => !(e.event === 'ConditionFulfilled' && e.args.conditionId === 1));
  let clients = { 'http://a': mockClient(f.events), 'http://b': mockClient(fewer) };
  let r = await verifyExhibit({ pdfPath: f.pdf, casePath: f.casePath, rpcUrls: Object.keys(clients), deploymentsDir: f.dir, makeClient: (u) => clients[u] ?? mockClient([], { fail: true }) });
  assert.equal(r.verdict, 'MISMATCH');
  assert.ok(failed(r).includes('live RPCs return the same events and owner'));
  clients = { 'http://a': mockClient(f.events, { owner: OTHER }) };
  r = await verifyExhibit({ pdfPath: f.pdf, casePath: f.casePath, rpcUrls: ['http://a'], deploymentsDir: f.dir, makeClient: (u) => clients[u] ?? mockClient([], { fail: true }) });
  assert.deepEqual(failed(r), ['notice contract owner is the issuer']);
});

test('live: no reachable RPC falls back to events.json with exit 3', async () => {
  const f = fixture();
  const r = await verifyExhibit({ pdfPath: f.pdf, casePath: f.casePath, rpcUrls: ['http://a'], deploymentsDir: f.dir, makeClient: () => mockClient([], { fail: true }) });
  assert.equal(r.offline, true);
  assert.match(r.source, /offline fallback/);
  assert.equal(r.exitCode, EXIT.OFFLINE_MATCH);
});

for (const name of ['case-local', 'case']) {
  const dir = path.join(ROOT, 'web', 'public', name);
  const ok = fs.existsSync(path.join(dir, 'exhibit.pdf')) && fs.existsSync(path.join(dir, 'events.json'));
  test(`generated ${name}: exhibit matches, one-letter change mismatches`, { skip: !ok && 'run the demo first' }, async () => {
    const casePath = path.join(dir, 'case.json');
    const r = await verifyExhibit({ pdfPath: path.join(dir, 'exhibit.pdf'), casePath, offline: true });
    assert.deepEqual(failed(r), []);
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-verify-')), 'exhibit.pdf');
    fs.writeFileSync(tmp, flipOneLetter(fs.readFileSync(path.join(dir, 'exhibit.pdf'))));
    assert.equal((await verifyExhibit({ pdfPath: tmp, casePath, offline: true })).verdict, 'MISMATCH');
  });
}
