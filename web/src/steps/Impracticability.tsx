import { useState, type KeyboardEvent } from 'react';
import type { Loaded } from '../data';
import { fmtDate, short } from '../data';
import { ACTIVITY_QUOTE, IMPRACT_QUOTES } from '../legal';
import { completeFrom, contactCounts, contacts, isEmail } from '../content';
import type { Wallet } from '../types';
import { Badge, Card, Quote, StepHead, Term } from '../ui';

const CITED = { from: '2024-04', to: '2024-12' };

// Lists every month between two YYYY-MM keys inclusive.
function monthRange(a: string, b: string): string[] {
  const out: string[] = [];
  let [y, m] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  while (y < by || (y === by && m <= bm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

const chainName = (c: string) => (c === 'ethereum' ? 'Ethereum' : c === 'tron' ? 'TRON' : c);
const walletName = (w: Wallet) => w.label.replace(/\s*\(defendant\)/i, '');

// Monthly bar chart; arrow keys move between months when the chart has focus.
function Bars({ w, months, full }: { w: Wallet; months: string[]; full: string | null }) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...months.map((k) => w.monthly[k] ?? 0));
  const W = 100 / months.length;
  const ci = months.indexOf(CITED.from), cj = months.indexOf(CITED.to);
  const pj = full ? months.findIndex((k) => k >= full) : 0;
  const partialEnd = pj < 0 ? months.length : pj;
  const k = sel === null ? null : months[sel];
  const lastWithData = () => { for (let i = months.length - 1; i >= 0; i--) if (w.monthly[months[i]]) return i; return months.length - 1; };
  const onKey = (e: KeyboardEvent) => {
    const i = sel ?? lastWithData();
    const n = e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowRight' ? i + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? months.length - 1 : null;
    if (n === null) return;
    e.preventDefault();
    setSel(Math.max(0, Math.min(months.length - 1, n)));
  };
  return (
    <div className="bars-wrap">
      <div className="bars-readout" aria-live="polite">
        {k ? <><strong>{k}</strong>: {w.monthly[k] ?? 0} tx{months.indexOf(k) < partialEnd ? ' (partial count)' : ''}</> : <span className="muted">peak {max} tx/month</span>}
      </div>
      <div className="bars-focus" tabIndex={0} data-keys role="group" aria-label={`Monthly transactions for ${walletName(w)}. Use left and right arrow keys to read each month.`}
        onKeyDown={onKey} onFocus={() => setSel((s) => s ?? lastWithData())} onBlur={() => setSel(null)}>
        <svg className="bars" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          {partialEnd > 0 && <rect className="partial" x={0} y={0} width={partialEnd * W} height={40} />}
          {ci >= 0 && cj >= 0 && <rect className="band" x={ci * W} y={0} width={(cj - ci + 1) * W} height={40} />}
          {months.map((m, i) => {
            const v = w.monthly[m] ?? 0;
            const h = v ? Math.max(1.2, (v / max) * 36) : 0;
            return (
              <g key={m} onMouseEnter={() => setSel(i)} onMouseLeave={() => setSel(null)}>
                <rect className="hit" x={i * W} y={0} width={W} height={40} />
                {v > 0 && <rect className={`bar ${i < partialEnd ? 'bar-partial' : ''} ${sel === i ? 'bar-hover' : ''}`} x={i * W + W * 0.18} y={40 - h} width={W * 0.64} height={h} rx={0.4} />}
                {sel === i && v === 0 && <rect className="bar-hover" x={i * W + W * 0.18} y={39} width={W * 0.64} height={1} />}
              </g>
            );
          })}
          <line className="baseline" x1={0} x2={100} y1={39.9} y2={39.9} />
        </svg>
      </div>
      <div className="bars-axis"><span>{months[0]}</span><span>{months[months.length - 1]}</span></div>
    </div>
  );
}

export default function Impracticability({ l }: { l: Loaded }) {
  const c = l.data;
  const ws = c.activity.wallets;
  const def = ws.filter((w) => w.role === 'defendant' || /defendant|^wallet [123]\b/i.test(w.label));
  const rel = ws.filter((w) => !def.includes(w));
  const allKeys = def.flatMap((w) => Object.keys(w.monthly)).sort();
  const last = allKeys[allKeys.length - 1] ?? '2026-10';
  const months = monthRange('2024-01', last > '2024-12' ? last : '2024-12');
  const rows = contacts(c);
  const n = contactCounts(rows);
  const partial = def.map((w) => ({ w, f: completeFrom(w, c) })).filter(({ f }) => f && f > months[0]);
  return (
    <div>
      <StepHead n={1} title="Impracticability packet" lead={<>Service by NFT was allowed because ordinary service was <Term k="impracticability">impracticable</Term> and the wallets were still in use. Both facts, in one place.</>} />
      <Card title="Defendant wallets, read-only" aside={<Badge>Fetched {fmtDate(c.activity.fetchedAt, true)}</Badge>}>
        <div className="wallets">
          {def.map((w) => (
            <article key={w.address} className="wallet">
              <header>
                <h4>{walletName(w)}</h4>
                <Badge>{chainName(w.chain)}</Badge>
              </header>
              <p className="wallet-bal">{w.balance ?? '—'}</p>
              <p className="small muted wallet-last">Last activity {fmtDate(w.lastTx)}</p>
              <Bars w={w} months={months} full={completeFrom(w, c)} />
            </article>
          ))}
        </div>
        <p className="band-key">
          <span><i className="key-band" aria-hidden /> Apr–Dec 2024: period the decision cites (p. 5)</span>
          {partial.length > 0 && <span title={c.activity.completeFromNote}><i className="key-partial" aria-hidden /> partial: older history not fully fetched ({partial.map(({ w, f }) => `${walletName(w)} before ${f}`).join('; ')})</span>}
        </p>
        <p className="contact-line">
          <strong>Contact attempts</strong> (decision p. 4): {n.phones} calls/texts, {n.emails} emails, {n.delivered} delivered. No verifiable mailing address.
        </p>
        <details className="related">
          <summary>Addresses, sources and related wallets</summary>
          <p className="muted small">Live chain data fetched at the time shown, not values as of the case. Addresses are quoted from the public complaint (p. 1). Nothing is ever sent to these wallets.</p>
          <div className="table-scroll">
            <table className="dense">
              <thead><tr><th>Wallet</th><th>Address</th><th>Last activity</th><th>Balance at fetch</th><th>Source</th></tr></thead>
              <tbody>{[...def, ...rel].map((w) => (
                <tr key={w.address}><td>{walletName(w)}</td><td><code title={w.address}>{short(w.address, 6)}</code></td><td>{fmtDate(w.lastTx)}</td><td>{w.balance ?? '—'}</td><td className="small">{w.source}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <Quote cite="Decision and Order, p. 5">{ACTIVITY_QUOTE}</Quote>
        </details>
        <details className="related">
          <summary>Contact attempt log and the court's findings</summary>
          {rows?.length ? (
            <>
              <p className="muted small"><Badge tone="warn">Synthetic contact details</Badge> Counts and dates are from the decision (p. 4). Numbers, addresses and the per-row results are invented placeholders, the same values as in the exhibit PDF; the real ones are not public.</p>
              <div className="table-scroll">
                <table className="dense">
                  <thead><tr><th>Channel</th><th>Contact (synthetic)</th><th>Date</th><th>Result</th></tr></thead>
                  <tbody>{rows.map((r, i) => (
                    <tr key={`${r.to}-${i}`}><td>{isEmail(r) ? 'Email' : 'Call + text'}</td><td><code>{r.to.replace(/\s*\(synthetic\)/i, '')}</code></td><td>{r.date ?? (isEmail(r) ? 'not stated' : '—')}</td><td>{r.result}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          ) : <p className="muted small">The per-contact log (synthetic placeholders) is in Exhibit A of the exhibit PDF, Step 5.</p>}
          {IMPRACT_QUOTES.map((q) => <Quote key={q.slice(0, 20)} cite="Decision and Order, p. 4">{q}</Quote>)}
        </details>
      </Card>
    </div>
  );
}
