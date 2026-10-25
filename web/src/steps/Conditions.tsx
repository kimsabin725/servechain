import type { Loaded } from '../data';
import { fmtDate, orderEntered } from '../data';
import { DECISION_URL } from '../legal';
import { CONFIRMED_SENTENCE, confirmedBy, plain } from '../content';
import { Badge, Card, Hash, Quote, StepHead } from '../ui';

const KIND: Record<string, string> = { deadline: 'Deadline', documents: 'Documents', method: 'Method', targets: 'Targets', affidavit: 'Affidavit' };

export default function Conditions({ l }: { l: Loaded }) {
  const c = l.data;
  const anchor = c.registrySlots?.find((r) => r.kind === 'exhibit-anchor');
  return (
    <div>
      <StepHead n={2} title="Order conditions" lead="Every obligation in the order becomes a checklist item with its exact wording and page, so nothing is left to memory." />
      <div className="notice">
        <Badge tone="info">drafted in advance · confirmed by the author</Badge>
        <span className="muted small">{CONFIRMED_SENTENCE}</span>
      </div>
      <div className="conditions">
        {c.conditions.map((k) => (
          <Card key={k.id} className="condition" title={<><span className="cond-n">{k.id + 1}</span> {k.title}</>} aside={<Badge>{KIND[k.kind] ?? k.kind}</Badge>}>
            <Quote cite={<>Decision and Order, p. {k.page}</>}>{k.quote}</Quote>
            <p className="small muted provenance">
              Drafted in advance from the order text · confirmed by <strong>{confirmedBy(k.confirmedBy)}</strong>
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
          {c.caseRef && <><dt>Case reference</dt><dd><Hash value={c.caseRef} /> {c.caseLabel && <span className="muted small">keccak256 of "{c.caseLabel}"</span>}</dd></>}
          <dt>Case id</dt>
          <dd><Hash value={c.caseId} /> <span className="muted small">{c.caseIdDerivation ? 'derived on-chain from the handler address and the case reference' : 'registry case id'}</span></dd>
          {c.registryLayout && <><dt>Registry slots</dt><dd>
            <ul className="slots small">
              {c.registryLayout.slots.map((s) => (
                <li key={s.id}><code>{s.id}</code> {s.kind === 'exhibit-anchor' ? <Badge>summary anchor</Badge> : <span>condition {s.ref ? Number(s.ref.replace(/\D/g, '')) : s.id + 1}</span>} <span className="muted">{plain(s.description ?? '')}</span></li>
              ))}
            </ul>
          </dd></>}
          {anchor && !c.registryLayout && <><dt>Summary anchor</dt><dd className="small">{plain(anchor.description ?? 'One extra record entry holds the SHA-256 of the compliance summary PDF (Step 5). It is not a court condition.')}</dd></>}
        </dl>
      </Card>
    </div>
  );
}
