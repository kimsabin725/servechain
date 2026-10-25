export type Evidence = {
  type: 'tx' | 'hash' | 'imported' | string;
  label: string;
  txHash?: string | null;
  block?: number | null;
  timestamp?: string | null;
  explorerUrl?: string | null;
  evidenceHash?: string | null;
  readOnly?: boolean;
  note?: string;
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
  ref?: string;
  deadlineBasis?: 'replay' | 'original order' | string;
  originalServiceDeadline?: string;
  replayServiceDeadline?: string;
  deadlineBasisNote?: string;
  derived?: { dueDate?: string; from?: string } | null;
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
  note?: string | null;
  completeFrom?: string | null;
};

export type Contact = { channel: string; to: string; date?: string | null; result: string; responded?: boolean; delivered?: boolean };

export type Precedent = string | { citation?: string; cite?: string; name?: string; title?: string; court?: string; year?: number | string; url?: string; thisCase?: boolean; self?: boolean; role?: string; status?: string; note?: string | null; method?: string };

export type Rule = { section: string; status?: string; rule?: string; url?: string; quote?: string[]; note?: string | null };

export type RegistrySlot = { id: number; kind: string; ref?: string | null; description?: string };

export type CaseFile = {
  caseId: string;
  caseRef?: string;
  caseLabel?: string;
  caseIdDerivation?: string;
  title: string;
  court: { name: string; index: string; judge: string; decisionDate: string; orderSigned?: string; entered?: string; source: string; sourceUrl?: string };
  mode: string;
  chain: { chainId: number; name: string; registry: string; notice721: string; fromBlock: number; explorer: string | null; issuer?: string };
  order: { hash: string; conditionsHash: string; pdf: string; entered?: string; serviceDeadline?: string };
  conditions: Condition[];
  documents: { bundleHash: string; url?: string | null; files: { name: string; sha256: string; path?: string }[]; note?: string };
  service: Service[];
  affidavit: { hash: string; declaredFiledAt: string; note: string; file?: string; txHash?: string; explorerUrl?: string };
  deadlines: { originalServiceDeadline?: string; serviceDeadlineNote?: string; formula?: string; openPoints?: string[]; serviceDeadline: string; responseDeadline: string; rule: string; status: 'read' | 'summary' | string; caveat: string };
  snapshot?: {
    status?: string;
    activityRootHash: string;
    txHash: string | null;
    at: string | null;
    timeTravel: boolean;
    pendingUntil?: string;
    note?: string;
    explorerUrl?: string | null;
    localReplay?: { txHash: string; at: string; activityRootHash: string; timeTravel: boolean };
  } | null;
  activity: { fetchedAt: string; wallets: Wallet[]; completeFrom?: string | Record<string, string>; completeFromNote?: string };
  contacts?: Contact[] | { rows?: Contact[]; contacts?: Contact[] };
  precedents?: Precedent[];
  rules?: Rule[];
  ruleStatusDefinitions?: Record<string, string>;
  registryLayout?: { slotCount: number; slots: RegistrySlot[] };
  existingService?: Service[];
  exhibit?: { sha256?: string; registrySlot?: number; txHash?: string; block?: number; explorerUrl?: string };
  registrySlots?: { id: number; kind: string; title: string; description?: string; label?: string }[];
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
