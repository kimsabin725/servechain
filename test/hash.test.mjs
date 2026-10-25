import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalJson, hashJson, merkleRoot, sha256Hex } from '../scripts/lib/hash.mjs';
import { buildPdf, WATERMARK, DISCLAIMER } from '../scripts/lib/pdf.mjs';
import { buildActivity, caseIdOf, completeFrom, CASE_REF, buildBundlePdf, buildAffidavitPdf, loadInputs } from '../scripts/lib/casedata.mjs';

test('canonical JSON ignores key order', () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] }), '{"a":[2,{"c":4,"d":3}],"b":1}');
  assert.equal(hashJson({ x: 1, y: 2 }), hashJson({ y: 2, x: 1 }));
});

test('merkle root pairs and duplicates the odd node', () => {
  const a = sha256Hex('a');
  const b = sha256Hex('b');
  const c = sha256Hex('c');
  const h = (x, y) => '0x' + createHash('sha256').update(Buffer.concat([Buffer.from(x.slice(2), 'hex'), Buffer.from(y.slice(2), 'hex')])).digest('hex');
  assert.equal(merkleRoot([a]), a);
  assert.equal(merkleRoot([a, b]), h(a, b));
  assert.equal(merkleRoot([a, b, c]), h(h(a, b), h(c, c)));
});

test('sample PDF is deterministic and watermarked', () => {
  const pages = [{ title: 'T', lines: ['hello', 'x'.repeat(300)] }];
  const one = buildPdf(pages);
  assert.deepEqual(one, buildPdf(pages));
  assert.ok(one.toString('latin1').startsWith('%PDF-1.4'));
  assert.ok(one.toString('latin1').includes('SAMPLE \\227 not a real court filing'));
  assert.equal(WATERMARK, 'SAMPLE — not a real court filing');
});

test('case id is keccak256(abi.encode(handler, caseRef))', () => {
  const a = caseIdOf('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
  assert.equal(a.length, 66);
  assert.notEqual(a, caseIdOf('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'));
  assert.equal(caseIdOf('0x0000000000000000000000000000000000000001', '0x' + '00'.repeat(32)), '0xada5013122d395ba3c54772283fb069b10426056ef8ca54750cb9bb552a59e7d');
  assert.equal(CASE_REF.length, 66);
});

test('bundle and affidavit PDFs carry the fixed disclaimer on every page', () => {
  const inputs = loadInputs();
  const bundle = buildBundlePdf(inputs.conditions, inputs.facts).toString('latin1');
  const aff = buildAffidavitPdf({ facts: inputs.facts, service: [], bundleHash: '0x00', declaredFiledAt: 't', networkName: 'n' }).toString('latin1');
  assert.equal(DISCLAIMER, 'Not legal advice. Not a legal determination.');
  const pages = (bundle.match(/\/Type \/Page /g) || []).length;
  assert.ok(pages > 1);
  assert.equal(bundle.split(`(${DISCLAIMER})`).length - 1, pages);
  assert.equal(aff.split(`(${DISCLAIMER})`).length - 1, 1);
});

test('completeFrom is the month after the partial cut-off', () => {
  assert.equal(completeFrom({ truncated: true, monthlyPartialBefore: '2024-03-15T23:01:59Z' }), '2024-04');
  assert.equal(completeFrom({ truncated: true, monthlyPartialBefore: '2023-12-01T00:00:00Z' }), '2024-01');
  assert.equal(completeFrom({ truncated: false, monthlyUniqueTx: { '2024-05': 1, '2024-04': 2 } }), '2024-04');
});

test('activity root changes when one wallet row changes', () => {
  const summary = {
    fetchedAt: 't',
    wallets: [
      { label: 'Wallet 1 (defendant)', chain: 'eth', address: '0x1', lastActivity: 'x', monthlyUniqueTx: { '2024-04': 1 }, balances: {} },
      { label: 'Other', chain: 'tron', address: 'T1', lastActivity: 'y', monthlyUniqueTx: {}, balances: {} },
    ],
  };
  const r1 = buildActivity(summary).root;
  summary.wallets[0].monthlyUniqueTx['2024-04'] = 2;
  assert.notEqual(buildActivity(summary).root, r1);
});
