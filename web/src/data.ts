import type { CaseFile, ChainEvent } from './types';

const BASE = import.meta.env.BASE_URL;
export const asset = (p: string) => `${BASE}${p}`;

export type Loaded = {
  data: CaseFile;
  events: ChainEvent[];
  caseSource: string;
  eventsSource: string;
  exhibitUrl: string | null;
  isSample: boolean;
  dir: string;
};

// Fetches JSON and returns null for missing files or SPA fallbacks.
async function tryJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(asset(path), { cache: 'no-cache' });
    if (!r.ok) return null;
    return JSON.parse(await r.text()) as T;
  } catch {
    return null;
  }
}

// Returns the path if it serves a real PDF.
async function tryPdf(path: string): Promise<string | null> {
  try {
    const r = await fetch(asset(path), { cache: 'no-cache' });
    if (!r.ok) return null;
    const head = new Uint8Array(await r.arrayBuffer()).slice(0, 5);
    return String.fromCharCode(...head) === '%PDF-' ? asset(path) : null;
  } catch {
    return null;
  }
}

// Loads case.json, events.json and exhibit.pdf from public/case (or ?case=<dir>).
export async function loadCase(): Promise<Loaded> {
  const param = new URLSearchParams(location.search).get('case');
  const dir = param && /^[a-z0-9-]+$/.test(param) ? param : 'case';
  const data = await tryJson<CaseFile>(`${dir}/case.json`);
  if (!data || !data.caseId) throw new Error(`No case data found at ${dir}/case.json.`);
  const ev = await tryJson<ChainEvent[]>(`${dir}/events.json`);
  return {
    data,
    events: ev ?? [],
    caseSource: `${dir}/case.json`,
    eventsSource: ev ? `${dir}/events.json` : 'none',
    exhibitUrl: await tryPdf(`${dir}/exhibit.pdf`),
    isSample: !!data.sample,
    dir,
  };
}

export const DAY = 86_400_000;

export function fmtDate(iso?: string | null, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const s = d.toISOString();
  return withTime ? `${s.slice(0, 10)} ${s.slice(11, 16)} UTC` : s.slice(0, 10);
}

// Formats an ISO time as its New York calendar date, hiding the time of day.
export function nyDate(iso?: string | null): string {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function short(h?: string | null, n = 6): string {
  if (!h) return '—';
  return h.length <= n * 2 + 3 ? h : `${h.slice(0, n + 2)}…${h.slice(-n)}`;
}

export function daysBetween(a: string | number, b: string | number): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY);
}

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY).toISOString();
}

// Builds an explorer link unless the data is a placeholder sample.
export function txLink(l: Loaded, txHash?: string | null, override?: string | null): string | null {
  if (override) return override;
  if (l.isSample || !txHash || !l.data.chain.explorer) return null;
  return `${l.data.chain.explorer.replace(/\/$/, '')}/tx/${txHash}`;
}

export function orderDeadline(c: CaseFile): string | null {
  const known = c.order.serviceDeadline ?? c.deadlines.originalServiceDeadline;
  if (known) return known;
  const entered = c.order.entered ?? c.court.entered;
  return entered ? addDays(entered, 120).slice(0, 10) : null;
}

export function orderEntered(c: CaseFile): string | null {
  return c.order.entered ?? c.court.entered ?? (c.court.orderSigned ? c.court.decisionDate : null);
}
