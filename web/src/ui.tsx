import { useState, type ReactNode } from 'react';
import { short } from './data';

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

export function Status({ ok, okText = 'Fulfilled', badText = 'Missing' }: { ok: boolean; okText?: string; badText?: string }) {
  return <span className={`status ${ok ? 'status-ok' : 'status-bad'}`}><span aria-hidden>{ok ? '✓' : '✕'}</span> {ok ? okText : badText}</span>;
}
