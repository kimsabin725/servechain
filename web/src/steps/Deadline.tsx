import type { Loaded } from '../data';
import { addDays, daysBetween, fmtDate, txLink } from '../data';
import { COMPLETE_QUOTE, RULES } from '../legal';
import { Badge, Card, Hash, Quote, Status, StepHead, TxRef } from '../ui';

export default function Deadline({ l }: { l: Loaded }) {
  const c = l.data;
  const filed = c.affidavit.declaredFiledAt;
  const due = c.deadlines.responseDeadline;
  const expected = addDays(filed, 30);
  const consistent = Math.abs(daysBetween(expected, due)) === 0;
  const aff = c.conditions.find((k) => k.kind === 'affidavit');
  const statusRead = c.deadlines.status === 'read';
  return (
    <div>
      <StepHead n={4} title="Deadline" lead="The order says service is complete when the affidavit is filed. The response clock starts there." />
      <div className="grid-2 top">
        <Card title="Affidavit of service" aside={<Badge tone="warn">Declared by filer</Badge>}>
          <dl className="kv wide">
            <dt>declaredFiledAt</dt><dd><strong>{fmtDate(filed, true)}</strong></dd>
            <dt>Affidavit hash</dt><dd><Hash value={c.affidavit.hash} /></dd>
          </dl>
          <p className="caveat">The chain cannot prove the court filing date. This value is entered by the filer and only its hash and the declared time are recorded.</p>
          {aff && (
            <p className="small"><Status ok={aff.status === 'fulfilled'} /> {aff.id + 1}. {aff.title}{aff.evidence[0] && <> · <TxRef hash={aff.evidence[0].txHash} href={txLink(l, aff.evidence[0].txHash, aff.evidence[0].explorerUrl)} n={4} /></>}</p>
          )}
        </Card>
        <Card title="Response deadline" aside={<Badge tone={statusRead ? 'ok' : 'warn'}>{statusRead ? 'Rule text read' : 'Rule from summary'}</Badge>}>
          <div className="calc">
            <span>{fmtDate(filed)}</span><span className="op">+ 30 days =</span><span className="calc-out">{fmtDate(due)}</span>
          </div>
          <p className="small">{consistent ? 'Matches the deadline the registry derived on-chain.' : <span className="text-bad">Registry deadline differs from filedAt + 30 days ({fmtDate(expected)}). Check the data.</span>}</p>
          <p className="small muted">Rule: {c.deadlines.rule}{statusRead ? '' : ' (source: summary, lawyer review required)'}</p>
          <p className="caveat">{c.deadlines.caveat}</p>
          {c.deadlines.openPoints && c.deadlines.openPoints.length > 0 && (
            <ul className="small muted open-points">{c.deadlines.openPoints.map((o) => <li key={o}>{o}</li>)}</ul>
          )}
        </Card>
      </div>
      <Card title="Where the 30 days come from">
        <Quote cite="Decision and Order, p. 6">{COMPLETE_QUOTE}</Quote>
        <ul className="rules">
          {RULES.map((r) => (
            <li key={r.section}>
              <div><strong>{r.section}</strong> <Badge tone={r.status === 'read' ? 'ok' : 'warn'}>{r.status}</Badge> <a className="small" href={r.url} target="_blank" rel="noreferrer noopener">nysenate.gov ↗</a></div>
              <div className="small muted">{r.quote.map((q) => `"${q}"`).join(' … ')}</div>
            </li>
          ))}
        </ul>
        <p className="small muted">Statute excerpts were retrieved from nysenate.gov on 2026-10-25 as short quotes, not full section text.</p>
      </Card>
      {c.snapshot && <Snapshot l={l} />}
    </div>
  );
}

function Snapshot({ l }: { l: Loaded }) {
  const c = l.data;
  const s = c.snapshot!;
  const pending = s.status === 'pending' || !s.txHash;
  const shown = pending && s.localReplay ? s.localReplay : s;
  const local = pending ? !!s.localReplay : s.timeTravel;
  return (
    <Card title="Post-deadline activity snapshot" aside={<>{pending && <Badge tone="warn">pending on {c.chain.name}</Badge>} {local && <Badge tone="warn">local time-travel demo</Badge>}</>}>
      {pending && (
        <p className="caveat">Pending on {c.chain.name} until {fmtDate(s.pendingUntil ?? c.deadlines.responseDeadline, true)}; local time-travel replay shown. The registry refuses a snapshot before the response deadline, and testnet time cannot be advanced.</p>
      )}
      <dl className="kv wide">
        <dt>Activity root</dt><dd><Hash value={shown.activityRootHash} /></dd>
        {shown.at && <><dt>Anchored at</dt><dd>{fmtDate(shown.at, true)}{local ? ' (local chain, clock advanced)' : ''}</dd></>}
        {shown.txHash && <><dt>Tx</dt><dd>{local ? <code className="placeholder">{shown.txHash.slice(0, 10)}… (local chain)</code> : <TxRef hash={shown.txHash} href={txLink(l, shown.txHash, s.explorerUrl)} />}</dd></>}
      </dl>
      <p className="small muted">Wallet activity after service is circumstantial. It does not show that a defendant saw the notice.</p>
    </Card>
  );
}
