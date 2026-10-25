import { useEffect, useState } from 'react';
import type { Loaded } from '../data';
import { daysBetween, fmtDate, orderDeadline, orderEntered, short, txLink } from '../data';
import type { Service } from '../types';
import type { Condition } from '../types';
import { plain } from '../content';
import { Badge, Card, Hash, Status, StepHead, Term, TxRef } from '../ui';

function useNow(ms = 60_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function importedLink(s: Service): string | null {
  if (s.explorerUrl) return s.explorerUrl;
  if (s.chain === 'ethereum') return `https://etherscan.io/tx/${s.txHash}`;
  if (s.chain === 'tron') return `https://tronscan.org/#/transaction/${s.txHash}`;
  return null;
}

function ImportedTable({ rows }: { rows: Service[] }) {
  return (
    <div className="table-scroll">
      <table className="dense">
        <thead><tr><th>Recipient</th><th>Chain</th><th>Time (UTC)</th><th>Token</th><th>Tx</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.txHash}>
              <td>{s.recipientLabel}</td>
              <td>{s.chain === 'ethereum' ? 'Ethereum' : s.chain === 'tron' ? 'TRON' : s.chain}</td>
              <td>{fmtDate(s.timestamp, true)}</td>
              <td className="small">{s.name ?? '—'}</td>
              <td><TxRef hash={s.txHash} href={importedLink(s)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Badges that say what each piece of evidence rests on: stand-in testnet tx or imported mainnet record.
function Basis({ k, c }: { k: Condition; c: Loaded['data'] }) {
  const stand = k.evidence.filter((e) => e.type !== 'imported').length;
  const imp = k.evidence.filter((e) => e.type === 'imported').length;
  if (k.kind === 'deadline') {
    const basis = k.deadlineBasis ?? (c.mode === 'replay' ? 'replay' : 'original order');
    const orig = k.originalServiceDeadline ?? k.derived?.dueDate ?? orderDeadline(c);
    return (
      <span className="basis">
        <Badge tone={basis === 'replay' ? 'warn' : 'info'} title="Which deadline the check mark is measured against">{basis === 'replay' ? 'replay deadline' : 'original order deadline'}</Badge>
        {basis === 'replay' && orig && <span className="small">original order deadline <strong>{fmtDate(orig)}</strong></span>}
      </span>
    );
  }
  if (!imp) return null;
  return (
    <span className="basis">
      {stand > 0 && <Badge tone="info">stand-in tx on {c.chain.name}</Badge>}
      <Badge>imported ×{imp}, real service (read-only)</Badge>
    </span>
  );
}

export default function Serve({ l }: { l: Loaded }) {
  const c = l.data;
  const now = useNow();
  const ours = c.service.filter((s) => s.source !== 'imported');
  const entered = orderEntered(c);
  const imported = [...(c.existingService ?? []), ...c.service.filter((s) => s.source === 'imported')];
  const isOsc = (s: Service) => { const tag = s.stage ?? s.phase; return tag ? /osc|jan/i.test(tag) : !!entered && s.timestamp.slice(0, 10) < entered; };
  const underOrder = imported.filter((s) => !isOsc(s));
  const osc = imported.filter(isOsc);
  const lastServed = ours.map((s) => s.timestamp).sort().pop();
  const dl = c.deadlines.serviceDeadline;
  const leftNow = daysBetween(now, dl);
  const leftAtService = lastServed ? daysBetween(lastServed, dl) : null;
  const odl = orderDeadline(c);
  const lastImported = underOrder.map((s) => s.timestamp).sort().pop();
  return (
    <div>
      <StepHead n={3} title="Serve" lead={<>Hash the papers, fix that hash in each notice, mint one <Term k="soulbound" /> notice per target, and link every transaction to the condition it satisfies.</>} />
      <div className="notice notice-safe">
        <strong>Writes go to {c.chain.chainId === 11155111 ? 'Sepolia testnet' : c.chain.name} <Term k="stand-in wallet">stand-in wallets</Term> only.</strong> The real defendant wallets are read-only in this demo.
        {l.isSample && <> <Badge tone="warn">Sample data: transaction hashes are placeholders, links disabled</Badge></>}
      </div>
      <div className="grid-2 top">
        <Card title="1 · Service bundle">
          <dl className="kv wide">
            <dt>Bundle SHA-256</dt><dd><Hash value={c.documents.bundleHash} /></dd>
            {c.documents.url && <><dt>Posted at</dt><dd><a href={c.documents.url} target="_blank" rel="noreferrer noopener">{c.documents.url} ↗</a></dd></>}
          </dl>
          <ul className="files">
            {c.documents.files.map((f) => <li key={f.name}><span>{f.name}</span> <Hash value={f.sha256} n={4} /></li>)}
          </ul>
          <p className="small muted">The bundle hash is written into every notice's <Term k="tokenURI" /> at mint. The notice contract has no function to change it afterward.</p>
        </Card>
        <Card title="Service deadline" aside={<Badge tone="warn">replay deadline · 120 days</Badge>}>
          <div className={`countdown ${leftNow < 0 ? 'countdown-bad' : ''}`}>
            <span className="countdown-n">{Math.abs(leftNow)}</span>
            <span>{leftNow >= 0 ? 'days left' : 'days past'} as of {fmtDate(new Date(now).toISOString())} (replay deadline {fmtDate(dl)})</span>
          </div>
          {leftAtService !== null && <p className="small">At the last ServeChain mint: <strong>{leftAtService} days</strong> remaining.</p>}
          {odl && (
            <p className="small muted">
              The replay deadline is case opening on {c.chain.name} + 120 days, because the registry only accepts a future deadline. Original order: entered {fmtDate(entered)} + 120 days = <strong>{fmtDate(odl)}</strong>.
              {lastImported && <> The imported July 30, 2025 service was {daysBetween(lastImported, odl + 'T23:59:59Z')} days before that date.</>}
            </p>
          )}
        </Card>
      </div>
      <Card title="2 · Notices minted" aside={<Badge tone="info">{c.chain.name} testnet · chain {c.chain.chainId}</Badge>}>
        <div className="table-scroll">
          <table>
            <thead><tr><th>#</th><th>Recipient</th><th>Address</th><th>Time (UTC)</th><th>Tx</th></tr></thead>
            <tbody>
              {ours.map((s) => (
                <tr key={s.txHash}>
                  <td>{s.tokenId ?? '—'}</td>
                  <td><Badge tone="info">{s.recipientLabel}</Badge></td>
                  <td><code title={s.recipient}>{short(s.recipient, 5)}</code></td>
                  <td>{fmtDate(s.timestamp, true)}</td>
                  <td><TxRef hash={s.txHash} href={txLink(l, s.txHash)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="3 · Conditions after service" aside={<span className="small muted">state before the affidavit is declared (Step 4)</span>}>
        <ul className="checklist">
          {c.conditions.map((k) => {
            const ok = k.kind === 'affidavit' ? false : k.status === 'fulfilled';
            const ev = k.evidence[0];
            return (
              <li key={k.id} className={ok ? 'ok' : 'bad'}>
                <Status ok={ok} badText={k.kind === 'affidavit' ? 'Missing: affidavit not yet filed' : 'Missing'} />
                <span className="check-title">{k.id + 1}. {k.title} {ok && <Basis k={k} c={c} />}</span>
                {ok && ev && <span className="check-ev small muted">{plain(ev.label)} · <TxRef hash={ev.txHash} href={txLink(l, ev.txHash, ev.explorerUrl)} n={4} />{k.evidence.length > 1 ? ` +${k.evidence.length - 1} more` : ''}</span>}
              </li>
            );
          })}
        </ul>
      </Card>
      {underOrder.length > 0 && (
        <Card title="Imported: NY OAG service, Jul 30 2025 (read-only)" aside={<Badge tone="info">Imported, not sent by ServeChain</Badge>}>
          <p className="small muted">NFTs titled "Service of NY OAG Summons and Complaint No 700647-2025" received by the three real wallets on mainnet. Imported as read-only evidence that can be attached to conditions. Token names are on-chain text, not verified against court records.</p>
          <ImportedTable rows={underOrder} />
        </Card>
      )}
      {osc.length > 0 && (
        <details className="related">
          <summary>Earlier: January 21–22, 2025 NFTs (order to show cause stage, before the June order)</summary>
          <p className="small muted">These served the January 10, 2025 order to show cause (motion papers). The decision cites them in support of the motion; they are not performance of the June order.</p>
          <ImportedTable rows={osc} />
        </details>
      )}
    </div>
  );
}
