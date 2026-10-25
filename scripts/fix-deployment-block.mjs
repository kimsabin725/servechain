#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/chain.mjs';

// Rewrites deployments/<chainId>.json blockNumber from the forge broadcast receipts.
function main() {
  const chainId = process.argv[2] || '31337';
  const run = path.join(ROOT, 'broadcast', 'Deploy.s.sol', chainId, 'run-latest.json');
  const dep = path.join(ROOT, 'deployments', `${chainId}.json`);
  const receipts = JSON.parse(fs.readFileSync(run, 'utf8')).receipts.filter((r) => r.contractAddress);
  if (!receipts.length) throw new Error(`no deployment receipts in ${run}`);
  const d = JSON.parse(fs.readFileSync(dep, 'utf8'));
  const blocks = receipts.map((r) => Number(BigInt(r.blockNumber)));
  d.blockNumber = Math.min(...blocks);
  d.blockNumberSource = 'broadcast receipts';
  fs.writeFileSync(dep, JSON.stringify(d, null, 2) + '\n');
  console.log(`deployments/${chainId}.json blockNumber = ${d.blockNumber}`);
}

main();
