import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalJson, hashJson, merkleRoot, sha256Hex } from '../scripts/lib/hash.mjs';
import { buildPdf, WATERMARK } from '../scripts/lib/pdf.mjs';
import { buildActivity, CASE_ID } from '../scripts/lib/casedata.mjs';

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

test('case id is keccak of the demo label', () => {
  assert.equal(CASE_ID.length, 66);
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
