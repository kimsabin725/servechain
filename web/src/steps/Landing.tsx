import type { Loaded } from '../data';
import { fmtDate } from '../data';
import { METHOD_QUOTE, PRECEDENTS, TAGLINE, DECISION_URL } from '../legal';
import { Badge, Quote } from '../ui';

const FLOW = [
  ['Impracticability packet', 'Real defendant wallet activity, read-only, plus the contact attempts the court relied on.'],
  ['Order conditions', 'Each condition of the order, quoted with its page, drafted in advance and confirmed by a reviewer.'],
  ['Serve', 'Hash the papers, mint soulbound notices to testnet stand-ins, link every transaction to a condition.'],
  ['Deadline', 'Declared affidavit filing date + 30 days under CPLR 320(a), with sources and caveats.'],
  ['Exhibit & verify', 'An exhibit PDF anyone can check against the chain in the browser, no server.'],
];

export default function Landing({ l, go }: { l: Loaded; go: (n: number) => void }) {
  const c = l.data;
  return (
    <div className="landing">
      <div className="badges-row">
        <Badge tone="warn">Not legal advice</Badge>
        <Badge>Replay of public court records</Badge>
      </div>
      <h1 className="tagline">{TAGLINE}</h1>
      <p className="lead">
        Walk through a real New York order that directed service by NFT airdrop to three wallet addresses, from the impracticability showing to an exhibit you can verify yourself.
      </p>
      <Quote cite={<>{c.court.name}, Index No. {c.court.index}, {c.court.judge}, signed {fmtDate(c.court.orderSigned ?? c.court.decisionDate)} · Decision and Order, p. 6 · <a href={c.court.sourceUrl ?? DECISION_URL} target="_blank" rel="noreferrer noopener">public PDF ↗</a></>}>
        {METHOD_QUOTE}
      </Quote>
      <div className="grid-2">
        <div>
          <h3 className="small-head">Courts already allow it</h3>
          <ul className="plain-list">
            {PRECEDENTS.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
        <div>
          <h3 className="small-head">What stays manual</h3>
          <p className="muted">Tracking each condition of the order, showing which ones are still open, computing the response deadline, and packaging proof that the other side can check independently.</p>
        </div>
      </div>
      <ol className="flow">
        {FLOW.map(([t, d], i) => (
          <li key={t}>
            <button type="button" onClick={() => go(i + 1)}>
              <span className="flow-n">{i + 1}</span>
              <span><strong>{t}</strong><span className="muted"> — {d}</span></span>
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="primary" onClick={() => go(1)}>Start the walkthrough →</button>
    </div>
  );
}
