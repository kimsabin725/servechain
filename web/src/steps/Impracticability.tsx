import { useState } from 'react';
import type { Loaded } from '../data';
import { fmtDate, short } from '../data';
import { ACTIVITY_QUOTE, IMPRACT_QUOTES } from '../legal';
import type { Wallet } from '../types';
import { Badge, Card, Quote, StepHead } from '../ui';

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

function Bars({ w, months }: { w: Wallet; months: string[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...months.map((k) => w.monthly[k] ?? 0));
  const W = 100 / months.length;
  const ci = months.indexOf(CITED.from), cj = months.indexOf(CITED.to);
  const shown = hover ?? null;
  return (
    <div className="bars-wrap">
      <div className="bars-readout" aria-live="polite">
        {shown ? <><strong>{shown}</strong>: {w.monthly[shown] ?? 0} tx</> : <span className="muted">Hover a month · peak {max} tx</span>}
      </div>
      <svg className="bars" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`Monthly transactions for ${w.label}`}>
        {ci >= 0 && cj >= 0 && <rect className="band" x={ci * W} y={0} width={(cj - ci + 1) * W} height={40} />}
        {months.map((k, i) => {
          const v = w.monthly[k] ?? 0;
          const h = v ? Math.max(1.2, (v / max) * 36) : 0;
          return (
            <g key={k} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)}>
              <rect className="hit" x={i * W} y={0} width={W} height={40} />
              {v > 0 && <rect className={`bar ${hover === k ? 'bar-hover' : ''}`} x={i * W + W * 0.18} y={40 - h} width={W * 0.64} height={h} rx={0.4} />}
              <title>{`${k}: ${v} tx`}</title>
            </g>
          );
        })}
        <line className="baseline" x1={0} x2={100} y1={39.9} y2={39.9} />
      </svg>
      <div className="bars-axis"><span>{months[0]}</span><span>{months[months.length - 1]}</span></div>
      <p className="band-key"><i aria-hidden /> Apr–Dec 2024, period cited in the decision</p>
    </div>
  );
}

const PHONE_DAYS = ['2024-12-06', '2024-12-09', '2024-12-10', '2024-12-11'];
const PHONES = Array.from({ length: 14 }, (_, i) => ({
  n: `+1 (555) 01${String(i).padStart(2, '0')}-${String(2000 + i * 37).slice(-4)}`,
  day: PHONE_DAYS[i % 4],
  result: i === 2 || i === 9 ? 'Replied, no verifiable address' : 'No reply',
}));
const EMAILS = ['contact-a', 'contact-b', 'contact-c', 'contact-d'].map((u, i) => ({
  n: `${u}@example.invalid`,
  result: i === 1 ? '"Delivered" notice, no address' : 'No receipt',
}));

export default function Impracticability({ l }: { l: Loaded }) {
  const ws = l.data.activity.wallets;
  const def = ws.filter((w) => w.role === 'defendant' || /defendant|^wallet [123]\b/i.test(w.label));
  const rel = ws.filter((w) => !def.includes(w));
  const allKeys = def.flatMap((w) => Object.keys(w.monthly)).sort();
  const last = allKeys[allKeys.length - 1] ?? '2026-10';
  const months = monthRange('2024-01', last > '2024-12' ? last : '2024-12');
  return (
    <div>
      <StepHead n={1} title="Impracticability packet" lead="Service by NFT was allowed because ordinary service was impracticable and the wallets were still in use. Both facts, in one place." />
      <Card title="Defendant wallet activity" aside={<><Badge tone="info">Read-only</Badge> <Badge>Fetched {fmtDate(l.data.activity.fetchedAt, true)}</Badge></>}>
        <p className="muted small">Live chain data fetched at the time shown, not values as of the case. Addresses are quoted from the public complaint (p. 1). Nothing is ever sent to these wallets.</p>
        <div className="wallets">
          {def.map((w) => (
            <article key={w.address} className="wallet">
              <header>
                <h4>{w.label.replace(/\s*\(defendant\)/i, '')}</h4>
                <Badge>{w.chain === 'ethereum' ? 'Ethereum' : w.chain === 'tron' ? 'TRON' : w.chain}</Badge>
              </header>
              <code className="addr" title={w.address}>{short(w.address, 10)}</code>
              <dl className="kv">
                <dt>Balance</dt><dd>{w.balance ?? '—'} <span className="muted small">at fetch</span></dd>
                <dt>Last activity</dt><dd>{fmtDate(w.lastTx)}</dd>
              </dl>
              <Bars w={w} months={months} />
              <p className="source small muted">Source: {w.source}{w.fetchedAt ? ` · ${fmtDate(w.fetchedAt, true)}` : ''}</p>
            </article>
          ))}
        </div>
        <Quote cite="Decision and Order, p. 5">{ACTIVITY_QUOTE}</Quote>
        {rel.length > 0 && (
          <details className="related">
            <summary>Related wallets named in the complaint ({rel.length})</summary>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Label</th><th>Address</th><th>Last activity</th><th>Balance at fetch</th></tr></thead>
                <tbody>{rel.map((w) => <tr key={w.address}><td>{w.label}</td><td><code title={w.address}>{short(w.address, 6)}</code></td><td>{fmtDate(w.lastTx)}</td><td>{w.balance ?? '—'}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        )}
      </Card>
      <Card title="Contact attempts" aside={<Badge tone="warn">Synthetic contact details</Badge>}>
        <div className="tiles">
          <div className="tile"><span className="tile-n">14</span><span>phone numbers called and texted</span></div>
          <div className="tile"><span className="tile-n">2</span><span>replied, no verifiable address</span></div>
          <div className="tile"><span className="tile-n">4</span><span>email addresses contacted</span></div>
          <div className="tile"><span className="tile-n">1</span><span>"delivered" notice</span></div>
        </div>
        <p className="muted small">Counts and dates are from the decision (p. 4). Numbers and addresses below are invented placeholders; the real ones are not public.</p>
        <div className="grid-2">
          <div className="table-scroll">
            <table className="dense">
              <thead><tr><th>Phone (synthetic)</th><th>Date</th><th>Result</th></tr></thead>
              <tbody>{PHONES.map((p) => <tr key={p.n}><td><code>{p.n}</code></td><td>{p.day}</td><td>{p.result}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="table-scroll">
            <table className="dense">
              <thead><tr><th>Email (synthetic)</th><th>Result</th></tr></thead>
              <tbody>{EMAILS.map((p) => <tr key={p.n}><td><code>{p.n}</code></td><td>{p.result}</td></tr>)}</tbody>
            </table>
            {IMPRACT_QUOTES.map((q) => <Quote key={q.slice(0, 20)} cite="Decision and Order, p. 4">{q}</Quote>)}
          </div>
        </div>
      </Card>
    </div>
  );
}
