import { useCallback, useEffect, useState } from 'react';
import { loadCase, type Loaded } from './data';
import { FOOTER } from './legal';
import { Badge } from './ui';
import Landing from './steps/Landing';
import Impracticability from './steps/Impracticability';
import Conditions from './steps/Conditions';
import Serve from './steps/Serve';
import Deadline from './steps/Deadline';
import Exhibit from './steps/Exhibit';

const STEPS = ['Overview', 'Impracticability', 'Conditions', 'Serve', 'Deadline', 'Exhibit & verify'];
type Theme = 'light' | 'dark' | null;

function readStep(): number {
  const m = location.hash.match(/step-(\d)/);
  const n = m ? Number(m[1]) : 0;
  return n >= 0 && n < STEPS.length ? n : 0;
}

function storedTheme(): Theme {
  try { const t = localStorage.getItem('sc-theme'); return t === 'light' || t === 'dark' ? t : null; } catch { return null; }
}

export default function App() {
  const [l, setL] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState(readStep);
  const [theme, setTheme] = useState<Theme>(storedTheme);

  useEffect(() => { loadCase().then(setL, (e) => setErr(String(e?.message ?? e))); }, []);
  useEffect(() => {
    const on = () => setStep(readStep());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme;
    try { if (theme) localStorage.setItem('sc-theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);

  const go = useCallback((n: number) => {
    const s = Math.max(0, Math.min(STEPS.length - 1, n));
    history.replaceState(null, '', `#step-${s}`);
    setStep(s);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      if (e.key === 'ArrowRight') go(step + 1);
      if (e.key === 'ArrowLeft') go(step - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [step, go]);

  const dark = theme ? theme === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden>§</span>
          <div>
            <strong>ServeChain</strong>
            <span className="muted small brand-sub">{l ? `${l.data.court.index} · demo replay` : 'Case file'}</span>
          </div>
        </div>
        <div className="top-right">
          {l && (l.isSample ? <Badge tone="warn" title={`Loaded ${l.caseSource}`}>Sample data</Badge> : <Badge tone="info" title={`Loaded ${l.caseSource}`}>case.json</Badge>)}
          <button type="button" className="ghost" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label="Toggle color theme">{dark ? 'Light' : 'Dark'}</button>
        </div>
      </header>
      <nav className="stepper" aria-label="Steps">
        <ol>
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined} onClick={() => go(i)}>
                <span className="step-n">{i}</span><span className="step-t">{s}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <main>
        {err && <p className="text-bad">Could not load case data: {err}</p>}
        {!l && !err && <p className="muted">Loading case file…</p>}
        {l && (
          <>
            {step === 0 && <Landing l={l} go={go} />}
            {step === 1 && <Impracticability l={l} />}
            {step === 2 && <Conditions l={l} />}
            {step === 3 && <Serve l={l} />}
            {step === 4 && <Deadline l={l} />}
            {step === 5 && <Exhibit l={l} />}
            <div className="pager">
              <button type="button" onClick={() => go(step - 1)} disabled={step === 0}>← {step > 0 ? STEPS[step - 1] : 'Back'}</button>
              <span className="muted small">{step} / {STEPS.length - 1}</span>
              <button type="button" className="primary" onClick={() => go(step + 1)} disabled={step === STEPS.length - 1}>{step < STEPS.length - 1 ? STEPS[step + 1] : 'Done'} →</button>
            </div>
          </>
        )}
      </main>
      <footer className="foot">
        <p>{FOOTER}</p>
      </footer>
    </div>
  );
}
