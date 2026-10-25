export type Evidence = {
  type: 'tx' | 'hash' | 'imported' | string;
  label: string;
  txHash?: string | null;
  block?: number | null;
  timestamp?: string | null;
  explorerUrl?: string | null;
  evidenceHash?: string | null;
};

export type Condition = {
  id: number;
  kind: 'deadline' | 'documents' | 'method' | 'targets' | 'affidavit' | string;
  title: string;
  quote: string;
  page: number | string;
  draftedBy?: string;
  confirmedBy?: string;
  status: 'fulfilled' | 'missing' | string;
  evidence: Evidence[];
};

export type Service = {
  source: 'servechain' | 'imported' | string;
  chain: string;
  recipient: string;
  recipientLabel: string;
  txHash: string;
  block?: number | null;
  timestamp: string;
  tokenId?: string;
  tokenURI?: string;
  name?: string;
  stage?: string;
  phase?: string;
  note?: string;
  explorerUrl?: string;
};

export type Wallet = {
  label: string;
  chain: string;
  address: string;
  role?: string;
  firstTx?: string | null;
  lastTx?: string | null;
  monthly: Record<string, number>;
  balance?: string;
  source?: string;
  fetchedAt?: string;
  monthlyNote?: string;
};

export type CaseFile = {
  caseId: string;
  title: string;
  court: { name: string; index: string; judge: string; decisionDate: string; orderSigned?: string; entered?: string; source: string; sourceUrl?: string };
  mode: string;
  chain: { chainId: number; name: string; registry: string; notice721: string; fromBlock: number; explorer: string | null };
  order: { hash: string; conditionsHash: string; pdf: string; entered?: string; serviceDeadline?: string };
  conditions: Condition[];
  documents: { bundleHash: string; url?: string | null; files: { name: string; sha256: string }[] };
  service: Service[];
  affidavit: { hash: string; declaredFiledAt: string; note: string };
  deadlines: { originalServiceDeadline?: string; openPoints?: string[]; serviceDeadline: string; responseDeadline: string; rule: string; status: 'read' | 'summary' | string; caveat: string };
  snapshot?: { activityRootHash: string; txHash: string; at: string; timeTravel: boolean; note?: string } | null;
  activity: { fetchedAt: string; wallets: Wallet[] };
  existingService?: Service[];
  exhibit?: { sha256?: string };
  generatedAt: string;
  sample?: boolean;
};

export type ChainEvent = {
  contract: string;
  event: string;
  args: Record<string, unknown>;
  txHash: string;
  block: number;
  logIndex: number;
};
