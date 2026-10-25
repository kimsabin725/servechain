#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { decodeEventLog, formatEther, zeroHash } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { ROOT, NETWORKS, ANVIL_DEPLOYER_KEY, ANVIL_STAND_INS, artifact, readEnv, startAnvil, createWriter, collectEvents } from './lib/chain.mjs';
import { sha256Hex, sha256File, hashJson } from './lib/hash.mjs';
import {
  CASE_REF, caseIdOf, CASE_LABEL, EXHIBIT_SLOT, DAY, loadInputs, orderHash, orderConditions, buildActivity, buildExistingService,
  buildBundlePdf, buildAffidavitPdf, iso,
} from './lib/casedata.mjs';
import { buildCase } from './lib/casefile.mjs';
import { renderExhibitHtml, htmlToPdf } from './lib/exhibit.mjs';

const DOCS_BASE_URL = process.env.DOCS_BASE_URL || 'https://kimsabin725.github.io/servechain';

// Parses --network from argv.
function networkArg() {
  const i = process.argv.indexOf('--network');
  const n = i >= 0 ? process.argv[i + 1] : 'local';
  if (!NETWORKS[n]) throw new Error(`unknown network ${n}; use local or sepolia`);
  return n;
}

// Writes JSON with two-space indent.
function writeJson(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
}

// Runs the full serve → record → snapshot → exhibit flow on one network.
async function main() {
  const network = networkArg();
  const net = NETWORKS[network];
  const log = (...a) => console.log(`[${network}]`, ...a);
  execFileSync('forge', ['build', '--quiet'], { cwd: ROOT, stdio: 'inherit' });

  const inputs = loadInputs();
  const conditions = orderConditions(inputs.conditions);
  const slots = [{
    id: EXHIBIT_SLOT, kind: 'exhibit-anchor', title: 'Exhibit material SHA-256 (record slot, not a court condition)',
    description: 'Registry slot 5 holds the SHA-256 of exhibit.pdf so the verifier can detect a changed byte. It is not an order condition.',
  }];
  const conditionsHash = hashJson({ conditions, slots });
  const oHash = orderHash(inputs.facts);
  const activity = buildActivity(inputs.summary);

  const bundle = buildBundlePdf(inputs.conditions, inputs.facts);
  const bundleHash = sha256Hex(bundle);
  const documentsUrl = `${DOCS_BASE_URL}/docs/service-bundle.pdf`;

  let anvil, account, standIns, rpcUrl;
  if (network === 'local') {
    anvil = await startAnvil();
    rpcUrl = net.rpcUrl;
    account = privateKeyToAccount(ANVIL_DEPLOYER_KEY);
    standIns = ANVIL_STAND_INS;
  } else {
    const env = readEnv();
    if (!env.DEPLOYER_KEY || !env.SEPOLIA_RPC_URL) throw new Error('.env needs DEPLOYER_KEY and SEPOLIA_RPC_URL');
    rpcUrl = env.SEPOLIA_RPC_URL;
    account = privateKeyToAccount(env.DEPLOYER_KEY.startsWith('0x') ? env.DEPLOYER_KEY : `0x${env.DEPLOYER_KEY}`);
    standIns = [0, 1, 2].map(() => privateKeyToAccount(generatePrivateKey()).address);
  }

  try {
    const w = await createWriter({ chain: net.chain, rpcUrl, account });
    for (const p of ['docs/service-bundle.pdf', 'web/public/docs/service-bundle.pdf']) {
      fs.mkdirSync(path.dirname(path.join(ROOT, p)), { recursive: true });
      fs.writeFileSync(path.join(ROOT, p), bundle);
    }
    const CASE_ID = caseIdOf(account.address);
    const balanceBefore = await w.pub.getBalance({ address: account.address });
    log('issuer', account.address, 'balance', formatEther(balanceBefore));

    const nft = await w.deploy('ServiceNotice721', [account.address]);
    const reg = await w.deploy('CaseFileRegistry');
    const fromBlock = Math.min(nft.block, reg.block);
    const deployment = {
      chainId: net.chain.id, blockNumber: fromBlock, issuer: account.address,
      ServiceNotice721: nft.address, CaseFileRegistry: reg.address,
      deployTxs: { ServiceNotice721: nft.hash, CaseFileRegistry: reg.hash },
    };
    writeJson(path.join(ROOT, 'deployments', `${net.chain.id}.json`), deployment);
    log('deployed registry', reg.address, 'notice721', nft.address, 'fromBlock', fromBlock);

    const regAbi = artifact('CaseFileRegistry').abi;
    const nftAbi = artifact('ServiceNotice721').abi;
    const now = Number((await w.pub.getBlock()).timestamp);
    const serviceDeadline = now + 120 * DAY;
    const onChainId = await w.pub.readContract({ address: reg.address, abi: regAbi, functionName: 'caseIdOf', args: [account.address, CASE_REF] });
    if (onChainId !== CASE_ID) throw new Error(`caseId derivation differs: ${onChainId} != ${CASE_ID}`);
    const serviceMask = conditions.filter((k) => k.kind !== 'affidavit').reduce((m, k) => m | (1n << BigInt(k.id)), 0n);
    const opened = await w.write(reg.address, regAbi, 'openCase', [CASE_REF, oHash, conditionsHash, conditions.length + slots.length, serviceMask, BigInt(serviceDeadline)]);
    log('openCase', opened.hash);

    const service = [];
    for (const [i, to] of standIns.entries()) {
      const r = await w.write(nft.address, nftAbi, 'mint', [to, CASE_ID, 2, documentsUrl, bundleHash]);
      const ev = r.receipt.logs
        .filter((l) => l.address.toLowerCase() === nft.address.toLowerCase())
        .map((l) => { try { return decodeEventLog({ abi: nftAbi, data: l.data, topics: l.topics }); } catch { return null; } })
        .find((e) => e?.eventName === 'NoticeServed');
      const tokenId = Number(ev.args.tokenId);
      const tokenURI = await w.pub.readContract({ address: nft.address, abi: nftAbi, functionName: 'tokenURI', args: [BigInt(tokenId)] });
      service.push({
        source: 'servechain', chain: network === 'local' ? 'anvil' : 'sepolia', recipient: to,
        recipientLabel: `stand-in for Wallet ${i + 1}`, txHash: r.hash, block: r.block, timestamp: iso(r.timestamp), tokenId, tokenURI,
        explorerUrl: net.explorer ? `${net.explorer}/tx/${r.hash}` : null,
      });
      log('mint', `stand-in for Wallet ${i + 1}`, to, r.hash);
    }

    const preimages = {
      1: { bundleSha256: bundleHash, documentsUrl },
      2: { notice721: nft.address, tokenIds: service.map((s) => s.tokenId), documentsUrl, conditionId: 2 },
      3: { recipients: service.map((s) => s.recipient), mintTxs: service.map((s) => s.txHash) },
      0: { servedAt: service.map((s) => s.timestamp), serviceDeadline: iso(serviceDeadline) },
    };
    const evidenceHash = { 1: bundleHash, 2: hashJson(preimages[2]), 3: hashJson(preimages[3]), 0: hashJson(preimages[0]) };
    const txRef = { 1: service[0].txHash, 2: service[0].txHash, 3: service[2].txHash, 0: service[2].txHash };
    const fulfillTx = {};
    for (const id of [1, 2, 3, 0]) {
      const r = await w.write(reg.address, regAbi, 'fulfill', [CASE_ID, id, evidenceHash[id], txRef[id]]);
      fulfillTx[id] = r.hash;
      log('fulfill', id, r.hash);
    }

    const declaredUnix = Number((await w.pub.getBlock()).timestamp);
    const declaredFiledAt = iso(declaredUnix);
    const affidavitPdf = buildAffidavitPdf({ facts: inputs.facts, service, bundleHash, declaredFiledAt, networkName: net.name });
    const affidavitHash = sha256Hex(affidavitPdf);
    const sc = await w.write(reg.address, regAbi, 'recordServiceComplete', [CASE_ID, affidavitHash, BigInt(declaredUnix)]);
    log('recordServiceComplete', sc.hash);
    preimages[4] = { affidavitSha256: affidavitHash, declaredFiledAt };
    const f4 = await w.write(reg.address, regAbi, 'fulfill', [CASE_ID, 4, affidavitHash, sc.hash]);
    log('fulfill', 4, f4.hash);

    let snapshotRun = null;
    if (network === 'local') {
      await w.pub.request({ method: 'evm_increaseTime', params: [31 * DAY] });
      await w.pub.request({ method: 'evm_mine', params: [] });
      const s = await w.write(reg.address, regAbi, 'snapshot', [CASE_ID, activity.root]);
      snapshotRun = { txHash: s.hash, block: s.block, at: iso(s.timestamp), timeTravel: true };
      log('snapshot (after +31d time travel)', s.hash);
    }

    const outDir = path.join(ROOT, 'web', 'public', network === 'local' ? 'case-local' : 'case');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'affidavit.pdf'), affidavitPdf);
    const localCasePath = path.join(ROOT, 'web', 'public', 'case-local', 'case.json');
    const localCase = network === 'sepolia' && fs.existsSync(localCasePath) ? JSON.parse(fs.readFileSync(localCasePath, 'utf8')) : null;

    const contracts = [
      { name: 'CaseFileRegistry', address: reg.address, abi: regAbi },
      { name: 'ServiceNotice721', address: nft.address, abi: nftAbi },
    ];
    const ctx = {
      network, net, deployment, inputs, caseId: CASE_ID, caseRef: CASE_REF, conditions, slots, conditionsHash, orderHash: oHash, activity, bundleHash, documentsUrl,
      service, preimages, serviceDeadline, declaredFiledAt, affidavitHash, snapshotRun, localCase,
      existingService: buildExistingService(inputs.serviceTxs), caseLabel: CASE_LABEL,
    };
    let events = await collectEvents(w.pub, contracts, fromBlock);
    const draft = buildCase(ctx, events);
    const html = renderExhibitHtml(draft);
    fs.writeFileSync(path.join(outDir, 'exhibit.html'), html);
    htmlToPdf(path.join(outDir, 'exhibit.html'), path.join(outDir, 'exhibit.pdf'));
    const exhibitSha = sha256File(path.join(outDir, 'exhibit.pdf'));
    const ex = await w.write(reg.address, regAbi, 'fulfill', [CASE_ID, EXHIBIT_SLOT, exhibitSha, snapshotRun?.txHash ?? zeroHash]);
    log('exhibit anchored', exhibitSha, ex.hash);

    events = await collectEvents(w.pub, contracts, fromBlock);
    const finalCase = buildCase(ctx, events);
    finalCase.chain.serviceMask = serviceMask.toString();
    writeJson(path.join(outDir, 'case.json'), finalCase);
    writeJson(path.join(outDir, 'events.json'), events);
    const balanceAfter = await w.pub.getBalance({ address: account.address });
    log('wrote', path.relative(ROOT, outDir), '| spent', formatEther(balanceBefore - balanceAfter), 'ETH | left', formatEther(balanceAfter));
  } finally {
    anvil?.stop();
  }
}

main().catch((e) => {
  console.error(e.shortMessage || e.message);
  process.exit(1);
});
