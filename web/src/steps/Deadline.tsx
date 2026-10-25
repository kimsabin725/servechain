import type { Loaded } from '../data';
import type { Rule } from '../types';
import { CHAIN_PERIOD_HOURS, GATE_NOTE, deadlineView, fmtDate, nyDate, txLink } from '../data';
import { COMPLETE_QUOTE, DEADLINE_ESTIMATE, DEADLINE_VALIDITY, RULES } from '../legal';
import { plain, ruleStatus } from '../content';
import { Badge, Card, Hash, Quote, Replay, Status, StepHead, Term, TxRef } from '../ui';

export default function Deadline({ l }: { l: Loaded }) {
  const c = l.data;
  const filed = c.affidavit.declaredFiledAt;
  const due = c.deadlines.responseDeadline;
  const dv = deadlineView(filed, due);
  const consistent = new Date(due).getTime() - new Date(filed).getTime() === CHAIN_PERIOD_HOURS * 3_600_000;
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
            <dt>Filing date (as declared by the filer, New York date)</dt><dd><strong>{nyDate(filed)}</strong></dd>
            <dt>Affidavit hash</dt><dd><Hash value={c.affidavit.hash} /></dd>
          </dl>
          <p className="caveat">The chain cannot prove the court filing date. This value is entered by the filer and only its hash and the declared time are recorded. The affidavit here is sample affidavit data (to be sworn by the person who served).</p>
          {aff && (
            <p className="small"><Status ok={aff.status === 'fulfilled'} /> {aff.id + 1}. {plain(aff.title)}{aff.evidence[0] && <> · <TxRef hash={aff.evidence[0].txHash} href={txLink(l, aff.evidence[0].txHash, aff.evidence[0].explorerUrl)} n={4} /></>}</p>
          )}
          {aff?.status === 'fulfilled' && <p><Replay>recorded on {c.chain.name}, not filed with a court</Replay></p>}
          <details className="small muted"><summary>Raw value</summary><code>{filed}</code> ({fmtDate(filed, true)})</details>
        </Card>
        <Card title="Response deadline (estimate)" aside={<Badge tone={statusRead ? 'ok' : 'warn'}>{st.text}</Badge>}>
          <div className="calc">
            <span>{nyDate(filed)}</span><span className="op">+ 30 calendar days =</span><span className="calc-out">{dv.calendar}</span>
          </div>
          <p className="small">New York dates (America/New_York). The last day runs to the end of {dv.calendar} in New York.</p>
          <p className="caveat">{DEADLINE_ESTIMATE}</p>
          <p className="caveat">{DEADLINE_VALIDITY}</p>
          <dl className="kv wide small">
            <dt>On-chain timestamp (filedAt + 720 h)</dt><dd><code>{fmtDate(due, true)}</code> (New York date {dv.chainNY}{dv.differs ? ', one day off the calendar date' : ''})</dd>
          </dl>
          <p className="small muted">{dv.chainNote}</p>
          <p className="small">{consistent ? 'The registry value equals the declared filing time + 720 h.' : <span className="text-bad">The registry value is not the declared filing time + 720 h. Check the data.</span>}</p>
          <p className="small muted">Rule: <Term k="CPLR">{c.deadlines.rule}</Term>{rules.some((r) => r.section === 'CPLR 3012(c)') && c.deadlines.rule !== 'CPLR 3012(c)' ? '; answer: CPLR 3012(c)' : ''}{statusRead ? ' (statute excerpt checked)' : ' (source: summary, lawyer review required)'}</p>
          <details className="small muted"><summary>Raw on-chain value</summary><code>{due}</code></details>
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
        <p className="caveat">Shown via local replay. On {c.chain.name} the registry's snapshot gate opens at filedAt + 720 h ({fmtDate(s.pendingUntil ?? c.deadlines.responseDeadline, true)}), and testnet time cannot be advanced. {GATE_NOTE}</p>
      )}
      <dl className="kv wide">
        <dt>Activity root</dt><dd><Hash value={shown.activityRootHash} /></dd>
        {shown.at && <><dt>Anchored at</dt><dd>{fmtDate(shown.at, true)}{local ? ' (local chain, clock advanced)' : ''}</dd></>}
        {shown.txHash && <><dt>Tx</dt><dd>{local ? <code className="placeholder">{shown.txHash.slice(0, 10)}… (local chain)</code> : <TxRef hash={shown.txHash} href={txLink(l, shown.txHash, s.explorerUrl)} />}</dd></>}
      </dl>
      <p className="small muted">Context only, not evidence of notice. Wallet activity after service does not show that a defendant saw the notice.</p>
    </Card>
  );
}
