import type { CaseFile, Contact, Precedent, Wallet } from './types';

const DATA = import.meta.glob('../../data/{precedents,synthetic-contacts}.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const pick = (name: string) => Object.entries(DATA).find(([k]) => k.endsWith(`/${name}.json`))?.[1];

export const REPO_URL = 'https://github.com/kimsabin725/servechain';

export const CONFIRMED_SENTENCE =
  'Drafted in advance from the order text and confirmed by the author for this demo. No AI runs live on this page.';

export const DECISION_COUNTS = { phones: 14, replied: 2, emails: 4, delivered: 1 };

const FALLBACK_PRECEDENTS: Precedent[] = [
  { citation: 'LCX AG v 1.274M U.S. Dollar Coin, 2022 NY Slip Op 32834[U]', court: 'Sup Ct, NY County', year: 2022 },
  { citation: 'Meghji v Wallet Owner (In re Celsius Network LLC), 666 BR 28 [Bankr SD NY 2024]', court: 'Bankr. S.D.N.Y.', year: 2024 },
  { citation: 'People v Unknown Parties in Ownership and/or Control of Digital Wallet Addresses, Sup Ct, Queens County, Index No. 700647/2025', court: 'Sup Ct, Queens County', year: 2025, thisCase: true },
];

export type PrecedentRow = { text: string; url?: string; note?: string; thisCase: boolean; asCited?: boolean };

// Normalizes precedent entries from case.json, data/precedents.json or the fallback list.
export function precedents(c: CaseFile): PrecedentRow[] {
  const raw = pick('precedents');
  const src = (c.precedents ?? (Array.isArray(raw) ? raw : (raw as { precedents?: Precedent[] })?.precedents) ?? FALLBACK_PRECEDENTS) as Precedent[];
  return src.map((p) => {
    if (typeof p === 'string') return { text: p, thisCase: /700647|Unknown Parties/i.test(p) } as PrecedentRow;
    const base = p.citation ?? p.cite ?? p.name ?? p.title ?? '';
    const yr = p.year ? String(p.year) : '';
    const text = !yr || base.includes(yr) ? base : p.court && !base.includes(p.court) ? `${base} (${p.court} ${yr})` : `${base} (${yr})`;
    const thisCase = !!(p.thisCase || p.self || /this (case|replay)/i.test(p.role ?? '') || /700647|Unknown Parties/i.test(base));
    return { text, url: p.url, note: p.note ?? undefined, thisCase, asCited: p.status === 'as-cited' };
  }).filter((p) => p.text);
}

// Returns synthetic contact rows from case.json or data/synthetic-contacts.json, or null when neither exists.
export function contacts(c: CaseFile): Contact[] | null {
  const from = (v: unknown): Contact[] | null => {
    if (Array.isArray(v)) return v as Contact[];
    const o = v as { rows?: Contact[]; contacts?: Contact[]; phone?: Contact[]; email?: Contact[] } | undefined;
    if (o?.phone || o?.email) return [...(o.phone ?? []), ...(o.email ?? [])];
    return o?.rows ?? o?.contacts ?? null;
  };
  return from(c.contacts) ?? from(pick('synthetic-contacts'));
}

export const isEmail = (r: Contact) => /mail|@/i.test(`${r.channel} ${r.to}`);

// Summarizes contact attempts, falling back to the counts stated in the decision.
export function contactCounts(rows: Contact[] | null) {
  if (!rows?.length) return DECISION_COUNTS;
  const phones = rows.filter((r) => !isEmail(r));
  const emails = rows.filter(isEmail);
  return {
    phones: phones.length,
    replied: phones.filter((r) => r.responded ?? /^(responded|replied)/i.test(r.result)).length,
    emails: emails.length,
    delivered: emails.filter((r) => r.delivered ?? /^"?delivered/i.test(r.result)).length,
  };
}

// Replaces developer field names and tool names with plain wording.
export function plain(s: string): string {
  return s
    .replace(/\s*\[unverified\]/gi, ' (not verified)')
    .replace(/\bWebFetch\b/g, 'an automated web reader')
    .replace(/\bdeclaredFiledAt\b/g, 'declared filing date')
    .replace(/\bregistry slot \d+\b/gi, 'exhibit anchor')
    .replace(/\bconditionId\b/g, 'condition');
}

// Maps legacy confirmer values to the factual wording.
export function confirmedBy(v?: string): string {
  return !v || /reviewer/i.test(v) ? 'author (demo)' : v;
}

// Maps a rule status to the label shown to readers.
export function ruleStatus(s?: string): { text: string; ok: boolean } {
  return !s || /^(read|excerpt-verified|verified)$/i.test(s) ? { text: 'excerpt verified', ok: true } : { text: 'summary', ok: false };
}

const nextMonth = (k: string) => {
  const [y, m] = k.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

// Finds the first month whose transaction count is complete for this wallet.
export function completeFrom(w: Wallet, c: CaseFile): string | null {
  if (w.completeFrom) return w.completeFrom.slice(0, 7);
  const a = c.activity.completeFrom;
  if (typeof a === 'string') return a.slice(0, 7);
  if (a && (a[w.address] || a[w.label])) return (a[w.address] ?? a[w.label]).slice(0, 7);
  const m = (w.note ?? w.monthlyNote ?? '').match(/months after (\d{4}-\d{2}) are complete/);
  return m ? nextMonth(m[1]) : null;
}

export const GLOSSARY: Record<string, string> = {
  replay: 'Re-running a real, public court case on a testnet with today\'s dates, so every step can be shown without touching the real parties.',
  impracticability: 'The showing that ordinary service (hand delivery, mail) cannot be done, which lets a New York court direct another method under CPLR 308(5).',
  soulbound: 'A token that cannot be transferred out of the wallet it was sent to. Each service notice stays with its recipient.',
  'stand-in wallet': 'A Sepolia testnet wallet controlled by this demo that takes the place of a real defendant wallet. Nothing is sent to the real wallets.',
  exhibit: 'A document attached to an affidavit or motion as supporting material. Here: one PDF with the impracticability table, the condition record and the deadlines.',
  CPLR: 'New York Civil Practice Law and Rules, the statute that governs civil procedure in New York state courts.',
  tokenURI: 'The metadata field of an NFT. Each notice\'s tokenURI carries the link to the posted papers and the SHA-256 of the document bundle.',
};
