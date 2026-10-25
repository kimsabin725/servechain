import { useCallback, useRef, useState } from 'react';
import type { Loaded } from '../data';
import { short, txLink } from '../data';
import { verifyFile, type VerifyResult } from '../verify';
import { Badge, Card, Hash, StepHead, TxRef } from '../ui';

type Run = { name: string; busy: boolean; result?: VerifyResult; error?: string };

export default function Exhibit({ l }: { l: Loaded }) {
  const [run, setRun] = useState<Run | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const check = useCallback(async (name: string, buf: ArrayBuffer) => {
    setRun({ name, busy: true });
    try {
      const result = await verifyFile(buf, l.data, l.events, l.eventsSource, l.isSample);
      setRun({ name, busy: false, result });
    } catch (e) {
      setRun({ name, busy: false, error: (e as Error).message });
    }
  }, [l]);

  const fetchExhibit = async () => {
    if (!l.exhibitUrl) throw new Error('No exhibit PDF is published yet.');
    return (await fetch(l.exhibitUrl, { cache: 'no-cache' })).arrayBuffer();
  };
  const verifyPublished = async () => {
    try { await check('published exhibit', await fetchExhibit()); } catch (e) { setRun({ name: 'published exhibit', busy: false, error: (e as Error).message }); }
  };
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
  const ok = !!r && r.matches.length > 0;
  return (
    <div>
      <StepHead n={5} title="Exhibit & verify" lead="One PDF for the affidavit of service or a default motion. Anyone can check it against the chain from this page, with no server of ours involved." />
      <div className="grid-2 top">
        <Card title="Exhibit A–C" aside={l.isSample ? <Badge tone="warn">Sample placeholder</Badge> : <Badge tone="info">exhibit.pdf</Badge>}>
          <p className="small muted">A: impracticability table · B: condition-by-condition record · C: deadlines and post-service activity.</p>
          {l.exhibitUrl ? (
            <>
              <object className="pdf" data={l.exhibitUrl} type="application/pdf" aria-label="Exhibit PDF preview">
                <p className="small muted pdf-fallback">Inline preview is not available in this browser. Use Open or Download.</p>
              </object>
              <div className="row">
                <a className="button" href={l.exhibitUrl} target="_blank" rel="noreferrer noopener">Open</a>
                <a className="button" href={l.exhibitUrl} download="servechain-exhibit.pdf">Download</a>
              </div>
            </>
          ) : <p>No exhibit published yet.</p>}
          {l.data.exhibit?.sha256 && <p className="small">Expected SHA-256: <Hash value={l.data.exhibit.sha256} /></p>}
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
            <button type="button" onClick={verifyPublished} disabled={!l.exhibitUrl || run?.busy}>Verify the published exhibit</button>
            <button type="button" onClick={verifyTampered} disabled={!l.exhibitUrl || run?.busy}>Try a tampered copy</button>
          </div>
          {run && (
            <div className={`result ${run.busy ? '' : run.error ? 'result-bad' : ok ? 'result-ok' : 'result-bad'}`} aria-live="polite">
              {run.busy && <p>Hashing and reading chain events…</p>}
              {run.error && <p><strong>Error:</strong> {run.error}</p>}
              {r && (
                <>
                  <p className="verdict">{ok ? 'MATCH' : 'MISMATCH'}</p>
                  <p className="small">File: {run.name}</p>
                  <p className="small">SHA-256: <code className="break">{r.fileHash}</code></p>
                  <p className="small">
                    Path: <Badge tone={r.path === 'live' ? 'ok' : 'neutral'}>{r.path === 'live' ? 'Live' : 'Offline'}</Badge> {r.pathDetail} · {r.eventCount} events read
                  </p>
                  {r.fallbackReason && <p className="small muted">Live lookup skipped: {r.fallbackReason}</p>}
                  {ok ? (
                    <ul className="small matches">
                      {r.matches.map((m) => (
                        <li key={`${m.txHash}-${m.field}`}>{m.event}.{m.field} · block {m.block} · <TxRef hash={m.txHash} href={txLink(l, m.txHash)} n={4} /></li>
                      ))}
                    </ul>
                  ) : (
                    <p className="small">No event for case <code>{short(l.data.caseId, 4)}</code> anchors this hash. The file differs from what was recorded.</p>
                  )}
                </>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
