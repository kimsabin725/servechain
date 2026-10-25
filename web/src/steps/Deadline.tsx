import type { Loaded } from '../data';
import type { Rule } from '../types';
import { addDays, daysBetween, fmtDate, txLink } from '../data';
import { COMPLETE_QUOTE, RULES } from '../legal';
import { plain, ruleStatus } from '../content';
import { Badge, Card, Hash, Quote, Status, StepHead, Term, TxRef } from '../ui';

export default function Deadline({ l }: { l: Loaded }) {
  const c = l.data;
  const filed = c.affidavit.declaredFiledAt;
  const due = c.deadlines.responseDeadline;
  const expected = addDays(filed, 30);
  const consistent = Math.abs(daysBetween(expected, due)) === 0;
  const aff = c.conditions.find((k) => k.kind === 'affidavit');
  const st = ruleStatus(c.deadlines.status);
  const statusRead = st.ok;
  const rules: Rule[] = c.rules?.length ? c.rules : RULES;
  const defs = c.ruleStatusDefinitions;
  return (
    <div>
      <StepHead n={4} title="Deadline" lead="The order says service is complete when the affidavit is filed. The response clock starts there." />
      <div className="grid-2 top">
        <Card title="Affidavit of service" aside={<Badge tone="warn">Declared by filer</Badge>}>
          <dl className="kv wide">
            <dt>Filing date (as declared by the filer)</dt><dd><strong>{fmtDate(filed, true)}</strong></dd>
            <dt>Affidavit hash</dt><dd><Hash value={c.affidavit.hash} /></dd>
          </dl>
          <p className="caveat">The chain cannot prove the court filing date. This value is entered by the filer and only its hash and the declared time are recorded.</p>
          {aff && (
            <p className="small"><Status ok={aff.status === 'fulfilled'} /> {aff.id + 1}. {plain(aff.title)}{aff.evidence[0] && <> · <TxRef hash={aff.evidence[0].txHash} href={txLink(l, aff.evidence[0].txHash, aff.evidence[0].explorerUrl)} n={4} /></>}</p>
          )}
        </Card>
        <Card title="Response deadline" aside={<Badge tone={statusRead ? 'ok' : 'warn'}>{st.text}</Badge>}>
          <div className="calc">
            <span>{fmtDate(filed)}</span><span className="op">+ 30 days =</span><span className="calc-out">{fmtDate(due)}</span>
          </div>
          <p className="small">{consistent ? 'Matches the deadline recorded by the registry.' : <span className="text-bad">Registry deadline differs from filing date + 30 days ({fmtDate(expected)}). Check the data.</span>}</p>
          <p className="small muted">The response deadline is computed on-chain as filing date + 30 days; the filing date itself is declared by the filer.</p>
          <p className="small muted">Rule: <Term k="CPLR">{c.deadlines.rule}</Term>{rules.some((r) => r.section === 'CPLR 3012(c)') && c.deadlines.rule !== 'CPLR 3012(c)' ? '; answer: CPLR 3012(c)' : ''}{statusRead ? ' (statute excerpt checked)' : ' (source: summary, lawyer review required)'}</p>
          <p className="caveat">{c.deadlines.caveat}</p>
          {c.deadlines.openPoints && c.deadlines.openPoints.length > 0 && (
            <ul className="small muted open-points">{c.deadlines.openPoints.map((o) => <li key={o}>{plain(o)}</li>)}</ul>
          )}
        </Card>
      </div>
      <Card title="Where the 30 days come from">
        <Quote cite="Decision and Order, p. 6">{COMPLETE_QUOTE}</Quote>
        <ul className="rules">
          {rules.map((r) => {
            const rs = ruleStatus(r.status);
            return (
              <li key={r.section}>
                <div><strong>{r.section}</strong> <Badge tone={rs.ok ? 'ok' : 'warn'}>{rs.text}</Badge> {r.url && <a className="small" href={r.url} target="_blank" rel="noreferrer noopener">nysenate.gov ↗</a>}</div>
                {r.rule && <div className="small">{r.rule}</div>}
                {r.quote && r.quote.length > 0 && <div className="small muted">{r.quote.map((q) => `"${q}"`).join(' … ')}</div>}
              </li>
            );
          })}
        </ul>
        {defs && (
          <dl className="small muted rule-defs">
            {Object.entries(defs).map(([k, v]) => <div key={k}><dt>{ruleStatus(k).text}</dt><dd>{v}</dd></div>)}
          </dl>
        )}
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
