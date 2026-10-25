import { EXHIBIT_SLOT, iso } from './casedata.mjs';

const LABELS = {
  0: 'All notices minted before the service deadline',
  1: 'Document bundle SHA-256 fixed in every notice tokenURI',
  2: 'Hyperlinked notice NFTs (tokenURI external_url → posted papers)',
  3: 'One notice per target (stand-in wallets)',
  4: 'Affidavit hash and declaredFiledAt recorded',
};

const SLOT_DESCRIPTIONS = {
  0: 'Court condition C1 (deadline). Evidence: notice timestamps vs the replay service deadline.',
  1: 'Court condition C2 (documents). Evidence: SHA-256 of the served bundle, fixed in each notice.',
  2: 'Court condition C3 (method). Evidence: notice NFTs whose tokenURI links to the posted papers.',
  3: 'Court condition C4 (targets). Evidence: one notice per stand-in recipient.',
  4: 'Court condition C5 (affidavit). Evidence: affidavit SHA-256 and declaredFiledAt.',
};

const CAVEAT = 'weekend/holiday roll-forward (GCL §25-a) not applied — lawyer review required';

// Assembles case.json from run context and decoded chain events.
export function buildCase(ctx, events) {
  const { net, deployment, inputs, facts = inputs.facts } = ctx;
  const ex = net.explorer;
  const txUrl = (h) => (ex && h ? `${ex}/tx/${h}` : null);
  const reg = events.filter((e) => e.contract === 'CaseFileRegistry' && e.args.caseId === ctx.caseId);
  const originalServiceDeadline =
    facts?.L2_derived?.serviceDeadline || inputs.conditions.conditions.find((k) => k.kind === 'deadline')?.derived?.dueDate;
  const replayServiceDeadline = iso(ctx.serviceDeadline);
  const fulfilled = new Map(reg.filter((e) => e.event === 'ConditionFulfilled').map((e) => [Number(e.args.conditionId), e]));
  const completed = reg.find((e) => e.event === 'ServiceCompleted');
  const snapEv = reg.find((e) => e.event === 'ActivitySnapshot');
  const exhibitEv = fulfilled.get(EXHIBIT_SLOT);
  const imported = ctx.existingService.filter((s) => s.phase === 'june-2025-order');

  const conditions = ctx.conditions.map((c) => {
    const src = inputs.conditions.conditions[c.id];
    const f = fulfilled.get(c.id);
    const evidence = [];
    if (f) {
      evidence.push({
        type: 'tx', label: LABELS[c.id] || 'Recorded evidence', txHash: f.txHash, block: f.block, timestamp: iso(f.timestamp),
        explorerUrl: txUrl(f.txHash), evidenceHash: f.args.evidenceHash, txRef: f.args.txRef, preimage: ctx.preimages[c.id] ?? null,
      });
    }
    if (['method', 'targets'].includes(c.kind)) {
      for (const s of imported) {
        evidence.push({
          type: 'imported', label: `Real case: ${s.recipientLabel}, ${s.timestamp.slice(0, 10)}`, txHash: s.txHash, block: s.block,
          timestamp: s.timestamp, explorerUrl: s.explorerUrl, evidenceHash: null, readOnly: true, note: s.note,
        });
      }
    }
    return {
      id: c.id, ref: c.ref, kind: c.kind, title: c.title, quote: c.quote, page: c.page,
      draftedBy: inputs.conditions.draftedBy || 'pre-extracted', confirmedBy: 'author (demo)',
      status: f ? 'fulfilled' : 'missing', derived: src.derived ?? null,
      deadlineBasis: 'replay',
      replayServiceDeadline,
      originalServiceDeadline,
      deadlineBasisNote:
        c.kind === 'deadline'
          ? 'Fulfilled against the replay deadline (case opening + 120 days), not the original order deadline. The real case deadline was 2025-06-11 + 120 days.'
          : 'Evidence was recorded in this replay; dates are replay dates, not dates in the real case.',
      evidence,
    };
  });

  const rule320 = inputs.rules?.rules?.find((r) => r.section === 'CPLR 320(a)');
  const responseDeadline = completed ? iso(completed.args.responseDeadline) : null;
  const local = ctx.localCase?.snapshot;
  const snapshot = snapEv
    ? {
        status: 'anchored', activityRootHash: snapEv.args.activityRootHash, txHash: snapEv.txHash, block: snapEv.block,
        at: iso(snapEv.timestamp), timeTravel: ctx.snapshotRun?.timeTravel ?? false, explorerUrl: txUrl(snapEv.txHash),
        leaves: ctx.activity.leaves,
        note: ctx.snapshotRun?.timeTravel ? 'Local anvil clock advanced 31 days (evm_increaseTime) so the response deadline passes; demo only.' : null,
      }
    : {
        status: 'pending', activityRootHash: ctx.activity.root, txHash: null, at: null, timeTravel: false, pendingUntil: responseDeadline,
        leaves: ctx.activity.leaves,
        note:
          'Sepolia time cannot be advanced. The registry rejects a declaredFiledAt earlier than case opening (FiledAtBeforeOpen) and any snapshot before the response deadline (ResponsePeriodOpen), so this step is pending on-chain. The snapshot step is shown from the local anvil replay.',
        localReplay: local?.txHash
          ? { case: '../case-local/case.json', txHash: local.txHash, at: local.at, activityRootHash: local.activityRootHash, timeTravel: true }
          : null,
      };

  return {
    caseId: ctx.caseId,
    caseRef: ctx.caseRef,
    caseLabel: ctx.caseLabel,
    caseIdDerivation: 'caseId = keccak256(abi.encode(handler, caseRef)), caseRef = keccak256(caseLabel); see CaseFileRegistry.caseIdOf',
    title: 'People v Unknown Parties in Ownership and/or Control of Digital Wallet Addresses (demo replay)',
    court: {
      name: facts?.case?.court || 'Supreme Court of the State of New York, Queens County',
      index: facts?.case?.indexNo || '700647/2025',
      judge: facts?.case?.justice || 'Hon. Karen Lin',
      decisionDate: facts?.case?.orderEntered || inputs.conditions.orderEntered,
      orderSigned: facts?.case?.orderSigned ?? null,
      source: `decision-and-pleadings-2025.pdf page ${inputs.conditions.extractedFrom?.pdfPage ?? 6}`,
    },
    mode: 'replay',
    chain: {
      chainId: net.chain.id, name: net.name, registry: deployment.CaseFileRegistry, notice721: deployment.ServiceNotice721,
      fromBlock: deployment.blockNumber, explorer: ex, issuer: deployment.issuer, deployTxs: deployment.deployTxs,
    },
    order: {
      hash: ctx.orderHash,
      hashAlgo: 'sha256',
      conditionsHash: ctx.conditionsHash,
      conditionsHashMethod: 'sha256 of canonical JSON {conditions, slots} with sorted keys (scripts/lib/hash.mjs canonicalJson)',
      pdf: inputs.conditions.extractedFrom?.url || facts?.case?.sources?.decisionAndPleadings?.url,
      page: inputs.conditions.extractedFrom?.pdfPage ?? 6,
      note: 'Court PDF is not redistributed; fetch it from the public source URL and compare the SHA-256.',
    },
    registrySlots: ctx.slots,
    registryLayout: {
      slotCount: ctx.conditions.length + ctx.slots.length,
      slots: [
        ...ctx.conditions.map((c) => ({ id: c.id, kind: 'court-condition', ref: c.ref, description: SLOT_DESCRIPTIONS[c.id] ?? c.title })),
        ...ctx.slots.map((s) => ({ id: s.id, kind: s.kind, ref: null, description: s.description })),
      ],
    },
    conditions,
    documents: {
      bundleHash: ctx.bundleHash,
      url: ctx.documentsUrl,
      files: [{ name: 'service-bundle.pdf', sha256: ctx.bundleHash, path: 'docs/service-bundle.pdf' }],
      note: 'Synthetic placeholder bundle watermarked "SAMPLE — not a real court filing".',
    },
    service: ctx.service,
    affidavit: {
      hash: ctx.affidavitHash,
      declaredFiledAt: completed ? iso(completed.args.filedAt) : ctx.declaredFiledAt,
      txHash: completed?.txHash ?? null,
      explorerUrl: txUrl(completed?.txHash),
      file: 'affidavit.pdf',
      note: 'declared by filer; chain cannot prove court filing date',
    },
    deadlines: {
      originalServiceDeadline,
      serviceDeadline: replayServiceDeadline,
      serviceDeadlineNote: 'Replay deadline = case opening + 120 days, because the registry only accepts a future deadline. The original case deadline was entry 2025-06-11 + 120 days.',
      responseDeadline,
      rule: 'CPLR 320(a)',
      formula: inputs.rules?.answerDeadline?.rule?.replace('affidavitOfServiceFiledAt', 'declaredFiledAt') || 'declaredFiledAt + 30 days',
      status: rule320?.status || 'summary',
      caveat: CAVEAT,
      openPoints: inputs.rules?.answerDeadline?.openPoints ?? [],
    },
    rules: (inputs.rules?.rules || []).map((r) => ({
      section: r.section, rule: r.rule, days: r.days, url: r.url, status: r.status, quote: r.quote ?? [], note: r.note ?? null,
      amendmentReviewed: r.amendmentReviewed ?? null,
    })),
    ruleStatusDefinitions: inputs.rules?.statusDefinitions ?? null,
    precedents: inputs.precedents?.precedents ?? [],
    contacts: inputs.contacts ?? null,
    snapshot,
    activity: {
      fetchedAt: ctx.activity.fetchedAt, wallets: ctx.activity.wallets,
      completeFromNote: 'Per wallet, monthly counts from completeFrom onward are complete; earlier months may be undercounted because older items were not fetched.',
      merkle: 'sha256 leaves of canonical wallet rows, pairwise sha256, odd node duplicated',
    },
    existingService: ctx.existingService,
    exhibit: exhibitEv
      ? {
          sha256: exhibitEv.args.evidenceHash, registrySlot: EXHIBIT_SLOT, txHash: exhibitEv.txHash, block: exhibitEv.block,
          at: iso(exhibitEv.timestamp), explorerUrl: txUrl(exhibitEv.txHash), pdf: 'exhibit.pdf', html: 'exhibit.html',
          note: 'Only the PDF bytes are anchored; exhibit.html is the print source.',
        }
      : null,
    disclaimer:
      'Replay of a public court record for demonstration. Nothing was sent to the real defendant wallets; they are read only. Proof-of-service material, not legal advice and not a legal determination.',
    generatedAt: new Date().toISOString(),
  };
}
