import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyExhibit } from '../scripts/verify.mjs';
import { sha256Hex, merkleRoot } from '../scripts/lib/hash.mjs';
import { ROOT } from '../scripts/lib/chain.mjs';
import { caseIdOf } from '../scripts/lib/casedata.mjs';

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

// Writes a minimal case.json/events.json pair whose exhibit anchor is the given hash.
function fixture(dir, pdfSha) {
  const reg = '0x00000000000000000000000000000000000000aa';
  const nft = '0x00000000000000000000000000000000000000bb';
  const handler = '0x00000000000000000000000000000000000000cc';
  const caseRef = '0x' + '11'.repeat(32);
  const caseId = caseIdOf(handler, caseRef);
  const leaves = [sha256Hex('w1'), sha256Hex('w2')];
  const ev = (contract, event, args, i) => ({ contract, address: contract === 'CaseFileRegistry' ? reg : nft, event, args: { caseId, ...args }, txHash: '0x' + String(i).padStart(64, '0'), block: i, logIndex: 0 });
  const events = [
    ev('CaseFileRegistry', 'CaseRefBound', { handler, caseRef }, 1),
    ev('CaseFileRegistry', 'CaseOpened', { handler, orderHash: '0x' + '22'.repeat(32), conditionsHash: '0x' + '33'.repeat(32) }, 1),
    ev('ServiceNotice721', 'NoticeServed', { tokenId: '1', recipient: '0x1', documentsHash: '0x' + '44'.repeat(32) }, 2),
    ev('CaseFileRegistry', 'ConditionFulfilled', { conditionId: 0, evidenceHash: '0x' + '55'.repeat(32) }, 3),
    ev('CaseFileRegistry', 'ServiceCompleted', { affidavitHash: '0x' + '66'.repeat(32), filedAt: '1761375600' }, 4),
    ev('CaseFileRegistry', 'ActivitySnapshot', { activityRootHash: merkleRoot(leaves) }, 5),
    ev('CaseFileRegistry', 'ConditionFulfilled', { conditionId: 5, evidenceHash: pdfSha }, 6),
  ];
  const c = {
    caseId, caseRef, chain: { chainId: 31337, registry: reg, notice721: nft, fromBlock: 1 },
    order: { hash: '0x' + '22'.repeat(32), conditionsHash: '0x' + '33'.repeat(32) },
    documents: { bundleHash: '0x' + '44'.repeat(32) },
    service: [{ recipient: '0x1', txHash: events.find((e) => e.event === 'NoticeServed').txHash }],
    conditions: [{ id: 0, status: 'fulfilled' }, { id: 1, status: 'missing' }],
    affidavit: { hash: '0x' + '66'.repeat(32), declaredFiledAt: new Date(1761375600 * 1000).toISOString() },
    snapshot: { activityRootHash: merkleRoot(leaves), leaves },
    exhibit: { registrySlot: 5 },
  };
  fs.writeFileSync(path.join(dir, 'case.json'), JSON.stringify(c));
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(events));
  return path.join(dir, 'case.json');
}

test('fixture: anchored PDF matches, one changed letter mismatches', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-verify-'));
  const pdf = Buffer.from('%PDF-1.4\nExhibit material for an affidavit of service\n%%EOF\n');
  const good = path.join(dir, 'exhibit.pdf');
  const bad = path.join(dir, 'exhibit-tampered.pdf');
  fs.writeFileSync(good, pdf);
  fs.writeFileSync(bad, flipOneLetter(pdf));
  const casePath = fixture(dir, sha256Hex(pdf));
  const okRun = await verifyExhibit({ pdfPath: good, casePath, offline: true });
  assert.equal(okRun.verdict, 'MATCH');
  assert.equal(okRun.label, 'MATCH (offline: against bundled events.json, not independent)');
  const r = await verifyExhibit({ pdfPath: bad, casePath, offline: true });
  assert.equal(r.verdict, 'MISMATCH');
  assert.equal(r.checks[0].ok, false);
});

test('fixture: a case id not derived from the handler is caught', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-verify-'));
  const pdf = Buffer.from('%PDF-1.4\nx\n');
  fs.writeFileSync(path.join(dir, 'exhibit.pdf'), pdf);
  const casePath = fixture(dir, sha256Hex(pdf));
  const events = JSON.parse(fs.readFileSync(path.join(dir, 'events.json'), 'utf8'));
  events[0].args.handler = '0x00000000000000000000000000000000000000dd';
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(events));
  const r = await verifyExhibit({ pdfPath: path.join(dir, 'exhibit.pdf'), casePath, offline: true });
  assert.equal(r.verdict, 'MISMATCH');
  assert.equal(r.checks.find((x) => x.name.startsWith('case id')).ok, false);
});

test('fixture: a tampered case.json status is caught', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-verify-'));
  const pdf = Buffer.from('%PDF-1.4\nx\n');
  fs.writeFileSync(path.join(dir, 'exhibit.pdf'), pdf);
  const casePath = fixture(dir, sha256Hex(pdf));
  const c = JSON.parse(fs.readFileSync(casePath, 'utf8'));
  c.conditions[1].status = 'fulfilled';
  fs.writeFileSync(casePath, JSON.stringify(c));
  assert.equal((await verifyExhibit({ pdfPath: path.join(dir, 'exhibit.pdf'), casePath, offline: true })).verdict, 'MISMATCH');
});

for (const name of ['case-local', 'case']) {
  const dir = path.join(ROOT, 'web', 'public', name);
  const ok = fs.existsSync(path.join(dir, 'exhibit.pdf')) && fs.existsSync(path.join(dir, 'events.json'));
  test(`generated ${name}: exhibit matches, one-letter change mismatches`, { skip: !ok && 'run the demo first' }, async () => {
    const casePath = path.join(dir, 'case.json');
    assert.equal((await verifyExhibit({ pdfPath: path.join(dir, 'exhibit.pdf'), casePath, offline: true })).verdict, 'MATCH');
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-verify-')), 'exhibit.pdf');
    fs.writeFileSync(tmp, flipOneLetter(fs.readFileSync(path.join(dir, 'exhibit.pdf'))));
    assert.equal((await verifyExhibit({ pdfPath: tmp, casePath, offline: true })).verdict, 'MISMATCH');
  });
}
