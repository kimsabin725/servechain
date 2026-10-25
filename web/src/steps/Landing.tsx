import type { ReactNode } from 'react';
import type { Loaded } from '../data';
import { fmtDate, short } from '../data';
import { METHOD_QUOTE, TAGLINE, DECISION_URL, PARTY_NOTE, REVIEW_BADGE, TERMS_LINE, TRON_NOTE, WHY_CHAIN_LINE } from '../legal';
import { GLOSSARY, REPO_URL, precedents } from '../content';
import { Badge, Quote, Term } from '../ui';

const FLOW: [string, ReactNode][] = [
  ['Impracticability packet', <>Real defendant wallet activity, read-only, plus the contact attempts the court relied on.</>],
  ['Order conditions', <>Each condition of the order, quoted with its page, drafted in advance from the order text and confirmed by the author.</>],
  ['Serve', <>Hash the papers, mint <Term k="soulbound" /> notices to testnet <Term k="stand-in wallet">stand-in wallets</Term>, link every transaction to a condition.</>],
  ['Deadline', <>Declared affidavit filing date + 30 days under <Term k="CPLR" /> 320(a), with sources and caveats.</>],
  ['Summary & verify', <>A <Term k="compliance summary">compliance summary (attachment for counsel)</Term> PDF anyone can check against the chain in the browser, no server.</>],
];

// Builds an explorer address link for a deployed contract.
function addrLink(l: Loaded, a: string) {
  const ex = l.data.chain.explorer;
  if (l.isSample || !ex) return <code>{short(a, 6)}</code>;
  return <a href={`${ex.replace(/\/$/, '')}/address/${a}`} target="_blank" rel="noreferrer noopener"><code>{short(a, 6)}</code> ↗</a>;
}

export default function Landing({ l, go, verifyNow }: { l: Loaded; go: (n: number) => void; verifyNow: () => void }) {
  const c = l.data;
  const ps = precedents(c);
  const prior = ps.filter((p) => !p.thisCase);
  const self = ps.find((p) => p.thisCase);
  return (
    <div className="landing">
      <p className="review-banner" role="note">{REVIEW_BADGE}</p>
      <h1 className="tagline">{TAGLINE}</h1>
      <p className="lead">
        Walk through a <Term k="replay" /> of a New York order that directed service by NFT airdrop to three wallet addresses, from the impracticability showing to a compliance summary you can verify yourself.
      </p>
      <ul className="landing-notes">
        <li><strong>{PARTY_NOTE}</strong></li>
        <li>{TRON_NOTE}</li>
        <li>{WHY_CHAIN_LINE}</li>
        <li className="small muted">{TERMS_LINE}</li>
      </ul>
      <section className="card runs" aria-labelledby="runs-h">
        <h2 id="runs-h" className="small-head">What runs here</h2>
        <dl className="kv wide">
          <dt>Case registry</dt><dd>{addrLink(l, c.chain.registry)} <span className="muted small">{c.chain.name}</span></dd>
          <dt>Notice NFT</dt><dd>{addrLink(l, c.chain.notice721)} <span className="muted small">{c.chain.name}, soulbound</span></dd>
          <dt>Source code</dt><dd><a href={REPO_URL} target="_blank" rel="noreferrer noopener">github.com/kimsabin725/servechain ↗</a></dd>
          <dt>Demo video</dt><dd><a href="https://youtu.be/58pzpLuhmQc" target="_blank" rel="noreferrer noopener">3-minute walkthrough on YouTube ↗</a></dd>
        </dl>
        <p className="small muted">This page is static. It reads the contracts above through a public RPC, with a bundled event log as fallback. Your browser never signs or sends a transaction.</p>
        <div className="row">
          <button type="button" className="primary" onClick={verifyNow}>Verify now →</button>
          <button type="button" onClick={() => go(1)}>Start the walkthrough →</button>
        </div>
        <p className="small path3"><strong>3-minute path:</strong>{' '}
          <button type="button" className="linkish" onClick={() => go(2)}>2 · Conditions</button> (what the order requires) →{' '}
          <button type="button" className="linkish" onClick={() => go(3)}>3 · Serve</button> (notices on Sepolia, each tied to a condition) →{' '}
          <button type="button" className="linkish" onClick={() => go(5)}>5 · Verify</button> (check the compliance summary, then a tampered copy).
        </p>
      </section>
      <Quote cite={<>{c.court.name}, Index No. {c.court.index}, {c.court.judge}, signed {fmtDate(c.court.orderSigned ?? c.court.decisionDate)} · Decision and Order, p. 6 · <a href={c.court.sourceUrl ?? DECISION_URL} target="_blank" rel="noreferrer noopener">public PDF ↗</a></>}>
        {METHOD_QUOTE}
      </Quote>
      <div className="grid-2">
        <div>
          <h3 className="small-head">Where courts have ordered it</h3>
          <p className="small muted">Trial-court orders on unopposed motions, not appellate rulings.</p>
          <ul className="plain-list">
            {prior.map((p) => <li key={p.text}>{p.url ? <a href={p.url} target="_blank" rel="noreferrer noopener">{p.text}</a> : p.text}{p.method && <> <Badge>{p.method}</Badge></>}</li>)}
          </ul>
          {prior.length > 0 && prior.every((p) => p.asCited) && <p className="small muted">Citations as printed in the 2025 decision (p. 4).</p>}
          {self && <p className="small muted">This replay: <em>{self.text}</em>, the order quoted above.</p>}
        </div>
        <div>
          <h3 className="small-head">What stays manual</h3>
          <p className="muted">Tracking each condition of the order, showing which ones are still open, computing the response deadline, and packaging proof that the other side can check independently.</p>
        </div>
      </div>
      <ol className="flow">
        {FLOW.map(([t, d], i) => (
          <li key={t}>
            <span className="flow-n">{i + 1}</span>
            <span><button type="button" className="linkish flow-t" onClick={() => go(i + 1)}>{t}</button><span className="muted"> — {d}</span></span>
          </li>
        ))}
      </ol>
      <details className="glossary">
        <summary>Glossary</summary>
        <dl>
          {Object.entries(GLOSSARY).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      </details>
    </div>
  );
}
