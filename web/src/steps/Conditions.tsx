import type { Loaded } from '../data';
import { fmtDate, orderEntered } from '../data';
import { DECISION_URL } from '../legal';
import { Badge, Card, Hash, Quote, StepHead } from '../ui';

const KIND: Record<string, string> = { deadline: 'Deadline', documents: 'Documents', method: 'Method', targets: 'Targets', affidavit: 'Affidavit' };

export default function Conditions({ l }: { l: Loaded }) {
  const c = l.data;
  return (
    <div>
      <StepHead n={2} title="Order conditions" lead="Every obligation in the order becomes a checklist item with its exact wording and page, so nothing is left to memory." />
      <div className="notice">
        <Badge tone="info">pre-extracted draft → confirmed by reviewer</Badge>
        <span className="muted small">These drafts were extracted from the order before the demo and checked by a person. No AI runs live on this page.</span>
      </div>
      <div className="conditions">
        {c.conditions.map((k) => (
          <Card key={k.id} className="condition" title={<><span className="cond-n">{k.id + 1}</span> {k.title}</>} aside={<Badge>{KIND[k.kind] ?? k.kind}</Badge>}>
            <Quote cite={<>Decision and Order, p. {k.page}</>}>{k.quote}</Quote>
            <p className="small muted provenance">
              Drafted: <strong>{k.draftedBy ?? 'pre-extracted'}</strong> → Confirmed: <strong>{k.confirmedBy ?? 'reviewer'}</strong>
            </p>
          </Card>
        ))}
      </div>
      <Card title="What the checklist is anchored to">
        <dl className="kv wide">
          <dt>Order</dt>
          <dd>{c.court.name}, Index No. {c.court.index}, signed {fmtDate(c.court.orderSigned ?? c.court.decisionDate)}{orderEntered(c) ? `, entered ${fmtDate(orderEntered(c))}` : ''}</dd>
          <dt>Order PDF SHA-256</dt>
          <dd><Hash value={c.order.hash} /> <a className="small" href={c.court.sourceUrl ?? DECISION_URL} target="_blank" rel="noreferrer noopener">public source ↗</a></dd>
          <dt>Conditions hash</dt>
          <dd><Hash value={c.order.conditionsHash} /> <span className="muted small">registered when the case is opened on-chain</span></dd>
        </dl>
      </Card>
    </div>
  );
}
