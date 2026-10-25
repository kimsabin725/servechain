import { useId, useState, type ReactNode } from 'react';
import { short } from './data';
import { GLOSSARY } from './content';
import { STATUS_NONE, STATUS_OK } from './legal';

export function Badge({ tone = 'neutral', children, title }: { tone?: 'neutral' | 'ok' | 'bad' | 'warn' | 'info'; children: ReactNode; title?: string }) {
  return <span className={`badge badge-${tone}`} title={title}>{children}</span>;
}

export function Hash({ value, n = 8, label }: { value?: string | null; n?: number; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="muted">—</span>;
  const copy = () => {
    navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }, () => {});
  };
  return (
    <button type="button" className="hash" onClick={copy} title={`${label ? label + ': ' : ''}${value} (click to copy)`}>
      <code>{short(value, n)}</code>
      <span className="hash-copy">{copied ? 'copied' : 'copy'}</span>
    </button>
  );
}

export function TxRef({ hash, href, n = 6 }: { hash?: string | null; href: string | null; n?: number }) {
  if (!hash) return <span className="muted">—</span>;
  if (!href) return <code className="placeholder" title={`${hash} (placeholder, no explorer link)`}>{short(hash, n)}</code>;
  return <a href={href} target="_blank" rel="noreferrer noopener"><code>{short(hash, n)}</code> ↗</a>;
}

export function Quote({ children, cite }: { children: ReactNode; cite: ReactNode }) {
  return (
    <figure className="quote">
      <blockquote>{children}</blockquote>
      <figcaption>{cite}</figcaption>
    </figure>
  );
}

export function Card({ title, aside, children, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || aside) && (
        <header className="card-head">
          {title && <h3>{title}</h3>}
          {aside && <div className="card-aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function StepHead({ n, title, lead }: { n: number; title: string; lead: ReactNode }) {
  return (
    <header className="step-head">
      <p className="eyebrow">Step {n}</p>
      <h2>{title}</h2>
      <p className="lead">{lead}</p>
    </header>
  );
}

export function Status({ ok, okText = STATUS_OK, badText = STATUS_NONE }: { ok: boolean; okText?: string; badText?: string }) {
  return <span className={`status ${ok ? 'status-ok' : 'status-bad'}`}><span aria-hidden>{ok ? '✓' : '✕'}</span> {ok ? okText : badText}</span>;
}

// Prominent badge for evidence that exists only in this replay.
export function Replay({ children }: { children: ReactNode }) {
  return <span className="replay-badge"><strong>replay</strong> {children}</span>;
}

// Dotted-underline term whose definition opens on hover or keyboard focus.
export function Term({ k, children }: { k: keyof typeof GLOSSARY | string; children?: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const def = GLOSSARY[k];
  if (!def) return <>{children ?? k}</>;
  return (
    <span className={`term ${open ? 'term-open' : ''}`} tabIndex={0} aria-describedby={id}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
      {children ?? k}
      <span role="tooltip" id={id} className="term-tip">{def}</span>
    </span>
  );
}
