import { useCallback, useEffect, useRef, useState } from 'react';
import type { Loaded } from '../data';
import { asset, short, txLink } from '../data';
import { KIND_TEXT, TRUSTS, describeMatch, verifyFile, type Kind, type VerifyResult } from '../verify';
import { Badge, Card, Hash, StepHead, Term, TxRef } from '../ui';

type Run = { name: string; busy: boolean; result?: VerifyResult; error?: string; progress?: string };

// Reader-facing wording for what a matched file is.
const kindText = (k: Kind) => (k === 'exhibit' ? 'this is the anchored compliance summary' : KIND_TEXT[k]);
const matchText = (s: string) => s.replace(/^Exhibit anchor/, 'Compliance summary anchor');

export default function Exhibit({ l, auto = false, onAuto }: { l: Loaded; auto?: boolean; onAuto?: () => void }) {
  const [run, setRun] = useState<Run | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const check = useCallback(async (name: string, buf: ArrayBuffer) => {
    setRun({ name, busy: true });
    try {
      const result = await verifyFile(buf, l.data, l.events, l.eventsSource, l.isSample, (progress) => setRun((p) => (p && p.busy ? { ...p, progress } : p)));
      setRun({ name, busy: false, result });
    } catch (e) {
      setRun({ name, busy: false, error: (e as Error).message });
    }
  }, [l]);

  const fetchExhibit = async () => {
    if (!l.exhibitUrl) throw new Error('No compliance summary PDF is published yet.');
    return (await fetch(l.exhibitUrl, { cache: 'no-cache' })).arrayBuffer();
  };
  const verifyPublished = async () => {
    try { await check('published compliance summary', await fetchExhibit()); } catch (e) { setRun({ name: 'published compliance summary', busy: false, error: (e as Error).message }); }
  };
  useEffect(() => {
    if (!auto) return;
    onAuto?.();
    verifyPublished();
  }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps
  const verifyTampered = async () => {
    try {
      const b = new Uint8Array((await fetchExhibit()).slice(0));
      const i = Math.floor(b.length / 2);
      b[i] = b[i] ^ 0x01;
      await check(`tampered copy (byte ${i} flipped)`, b.buffer);
    } catch (e) { setRun({ name: 'tampered copy', busy: false, error: (e as Error).message }); }
  };
  const onFiles = async (files: FileList | null) => {
    const f = files?.[0];
    if (f) await check(f.name, await f.arrayBuffer());
  };

  const r = run?.result;
  const ok = r?.verdict === 'MATCH';
  const failed = r?.checks.filter((x) => !x.ok && x.level === 'fail') ?? [];
  const tone = run?.busy ? '' : run?.error || !ok ? 'result-bad' : r?.path === 'offline' ? 'result-neutral' : 'result-ok';
  return (
    <div>
      <StepHead n={5} title="Compliance summary & verify" lead={<>One <Term k="compliance summary">compliance summary (attachment for counsel)</Term> PDF, for counsel preparing an affidavit of service or a default motion. It is not a court-filed exhibit. Anyone can check it against the chain from this page, with no server of ours involved.</>} />
      <div className="grid-2 top">
        <Card title="Compliance summary (attachment for counsel)" aside={l.isSample ? <Badge tone="warn">Sample placeholder</Badge> : <Badge tone="info">exhibit.pdf</Badge>}>
          <p className="small muted">A: impracticability table · B: condition-by-condition record · C: deadlines and post-service activity (context only, not evidence of notice). For counsel's review; does not determine compliance.</p>
          {l.exhibitUrl ? (
            <>
              <object className="pdf" data={l.exhibitUrl} type="application/pdf" aria-label="Compliance summary PDF preview">
                <p className="small muted pdf-fallback">Inline preview is not available in this browser. Use Open or Download.</p>
              </object>
              <div className="row">
                <a className="button" href={l.exhibitUrl} target="_blank" rel="noreferrer noopener">Open</a>
                <a className="button" href={l.exhibitUrl} download="servechain-compliance-summary.pdf">Download</a>
              </div>
            </>
          ) : <p>No compliance summary published yet.</p>}
          {l.data.exhibit?.sha256 && (
            <p className="small">Anchored SHA-256: <Hash value={l.data.exhibit.sha256} />{l.data.exhibit.txHash && <> · recorded as the summary anchor · <TxRef hash={l.data.exhibit.txHash} href={txLink(l, l.data.exhibit.txHash, l.data.exhibit.explorerUrl)} n={4} /></>}</p>
          )}
          <p className="small muted">Other files you can drop into the verifier:{' '}
            {l.data.documents.files.filter((f) => f.path).map((f) => <a key={f.name} href={asset(f.path!)} download>{f.name}</a>)}
            {l.data.affidavit.file && <>{' · '}<a href={asset(`${l.dir}/${l.data.affidavit.file}`)} download>{l.data.affidavit.file}</a></>}
          </p>
        </Card>
        <Card title="Browser verifier">
          <div
            className={`drop ${drag ? 'drop-on' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
            onClick={() => input.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}
          >
            <strong>Drop a PDF here</strong>
            <span className="small muted">or click to choose a file. It is hashed locally and never uploaded.</span>
            <input ref={input} type="file" hidden onChange={(e) => onFiles(e.target.files)} />
          </div>
          <div className="row">
            <button type="button" onClick={verifyPublished} disabled={!l.exhibitUrl || run?.busy}>Verify the published summary</button>
            <button type="button" onClick={verifyTampered} disabled={!l.exhibitUrl || run?.busy}>Try a tampered copy</button>
          </div>
          {run && (
            <div className={`result ${tone}`} aria-live="polite">
              {run.busy && <p>{run.progress ?? 'Hashing and reading chain events…'}</p>}
              {run.error && <p><strong>Error:</strong> {run.error}</p>}
              {r && (
                <>
                  <p className="verdict">{ok ? (r.path === 'offline' ? 'MATCH (offline)' : 'MATCH') : 'MISMATCH'}</p>
                  {r.liveMode && <p className="small verdict-sub">{r.liveMode}</p>}
                  {ok && r.path === 'offline' && <p className="small verdict-sub">Compared with the bundled event log, not an independent chain read.</p>}
                  {ok && r.kind && <p className="verdict-kind">{kindText(r.kind)[0].toUpperCase() + kindText(r.kind).slice(1)}.</p>}
                  <p className="small">File: {run.name}</p>
                  <p className="small">SHA-256: <code className="break">{r.fileHash}</code></p>
                  <p className="small">
                    Path: <Badge tone={r.path === 'live' ? 'ok' : 'neutral'}>{r.path === 'live' ? 'Live' : 'Offline'}</Badge> {r.pathDetail} · {r.eventCount} ServeChain events read (case registry and notice contract)
                  </p>
                  {r.binding.ok
                    ? <details className="small binding formula"><summary>Case id derived from handler + case reference: <span className="text-ok">✓</span></summary>keccak256({short(r.binding.handler, 4)}, {short(r.binding.caseRef, 4)}) = {short(l.data.caseId, 4)}</details>
                    : <p className="small binding">Case id derived from handler + case reference: <span className="text-bad">not confirmed</span> ({r.binding.reason})</p>}
                  {failed.length > 0 && (
                    <ul className="small checks-failed">
                      {failed.map((x) => <li key={x.name}><span className="text-bad">✗</span> {x.name}{x.detail ? ` (${x.detail})` : ''}</li>)}
                    </ul>
                  )}
                  {r.checks.length > 0 && failed.length === 0 && <p className="small">Issuer, notice owner and condition links: <span className="text-ok">✓</span> {r.checks.filter((x) => x.ok).length} checks recomputed</p>}
                  {r.fallbackReason && <p className="small muted">Live lookup unavailable: {r.fallbackReason}</p>}
                  {r.matches.length ? (
                    <ul className="small matches">
                      {r.matches.map((m) => (
                        <li key={`${m.txHash}-${m.field}`}>{matchText(describeMatch(m, l.data))} · block {m.block} · <TxRef hash={m.txHash} href={txLink(l, m.txHash)} n={4} /></li>
                      ))}
                    </ul>
                  ) : (
                    <p className="small">No ServeChain record for this case matches this file.{r.path === 'offline' ? ' Checked against the bundled event log.' : ''}</p>
                  )}
                  <p className="small muted trusts">{TRUSTS}</p>
                </>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
