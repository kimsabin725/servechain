import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const EXHIBIT_HEADER =
  'Exhibit material for an affidavit of service / default motion. Not legal advice. Not a legal determination.';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const short = (h) => (h && h.length > 20 ? `${h.slice(0, 10)}…${h.slice(-8)}` : h || '');
const link = (url, text) => (url ? `<a href="${esc(url)}">${esc(text)}</a>` : esc(text));
const day = (s) => (s ? String(s).slice(0, 10) : '—');

// Contact-attempt rows from data/synthetic-contacts.json (carried in case.contacts).
export function contactRows(contacts) {
  if (!contacts) throw new Error('case.contacts missing: data/synthetic-contacts.json is required');
  return [...contacts.phone, ...contacts.email].map((r) => ({
    channel: r.channel,
    to: `${r.to} (synthetic)`,
    date: r.date ?? 'not stated in decision',
    result: r.result,
  }));
}

// Monthly activity tables, split into chunks so they fit the page width.
function activityTable(wallets, months, caption, per = 9) {
  const parts = [];
  for (let i = 0; i < months.length; i += per) parts.push(activityChunk(wallets, months.slice(i, i + per), i === 0 ? caption : ''));
  return parts.join('');
}

// One monthly activity table.
function activityChunk(wallets, months, caption) {
  const head = months.map((m) => `<th>${m}</th>`).join('');
  const body = wallets
    .map(
      (w) =>
        `<tr><td>${esc(w.label)}<br><span class="mono small">${esc(short(w.address))}</span></td>${months
          .map((m) => `<td class="num">${w.monthly?.[m] ?? 0}${w.completeFrom && m < w.completeFrom ? '*' : ''}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `<table class="small"><caption>${esc(caption)}</caption><tr><th>Wallet</th>${head}</tr>${body}</table>`;
}

// Lists YYYY-MM keys between two months inclusive.
function monthRange(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) (m = 1), y++;
  }
  return out;
}

// Renders the full exhibit HTML (sections A-C) from a case object.
export function renderExhibitHtml(c) {
  const defendants = c.activity.wallets.filter((w) => w.role === 'defendant');
  const contacts = contactRows(c.contacts);
  const ex = c.chain.explorer;
  const evRows = c.conditions
    .map((k) => {
      const own = k.evidence.filter((e) => e.type !== 'imported');
      const imp = k.evidence.filter((e) => e.type === 'imported');
      const cell = own.length
        ? own
            .map(
              (e) =>
                `${esc(e.label)}<br>tx ${link(e.explorerUrl, short(e.txHash))} · block ${e.block} · ${esc(e.timestamp)}<br><span class="mono small">evidence ${esc(short(e.evidenceHash))}</span>`,
            )
            .join('<hr>')
        : '<span class="missing">No evidence recorded</span>';
      const impCell = imp.length
        ? `<div class="imported">Imported (read-only): ${imp.map((e) => link(e.explorerUrl, e.label.replace(/^Real case: real /, '').replace(/ \(read-only\)/, ''))).join('; ')}</div>`
        : '';
      return `<tr class="${k.status}"><td>${k.id}<br><span class="small">${esc(k.ref)}</span></td><td><b>${esc(k.title)}</b><br><q>${esc(k.quote)}</q> <span class="small">(order p.${k.page})</span></td><td class="status-${k.status}">${k.status}</td><td>${cell}${impCell}</td></tr>`;
    })
    .join('');
  const svcRows = c.service
    .map(
      (s) =>
        `<tr><td>${esc(s.recipientLabel)}<br><span class="mono small">${esc(s.recipient)}</span></td><td>${s.tokenId}</td><td>${link(s.explorerUrl, short(s.txHash))}</td><td>${s.block}</td><td>${esc(s.timestamp)}</td></tr>`,
    )
    .join('');
  const existRows = c.existingService
    .map(
      (s) =>
        `<tr><td>${esc(s.phase === 'june-2025-order' ? 'June 2025 order' : 'Jan 2025 order to show cause (pre-order)')}</td><td>${esc(s.recipientLabel)}</td><td>${esc(s.chain)}</td><td>${link(s.explorerUrl, short(s.txHash))}</td><td>${esc(day(s.timestamp))}</td><td class="small">${esc(s.name)}</td></tr>`,
    )
    .join('');
  const d = c.deadlines;
  const snap = c.snapshot;
  const snapLine = snap.txHash
    ? `Anchored root <span class="mono">${esc(short(snap.activityRootHash))}</span> in tx ${link(snap.explorerUrl, short(snap.txHash))} at ${esc(snap.at)}${snap.timeTravel ? ' <b>(local chain clock advanced 31 days with evm_increaseTime; demo only)</b>' : ''}.`
    : `<span class="missing">Pending until ${esc(d.responseDeadline)}</span> — the registry rejects a snapshot before the response deadline. Computed root (not yet anchored): <span class="mono">${esc(short(snap.activityRootHash))}</span>. ${esc(snap.note || '')}`;
  const after = monthRange('2025-06', (c.activity.fetchedAt || '2026-10').slice(0, 7));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Exhibit — ${esc(c.court.index)}</title>
<style>
@page{size:Letter;margin:16mm 14mm}
body{font:10.5px/1.45 Georgia,'Times New Roman',serif;color:#111;margin:0}
header.fixed{border:1.5px solid #111;padding:6px 8px;font:bold 11px Helvetica,Arial,sans-serif;margin-bottom:10px}
h1{font:bold 16px Helvetica,Arial,sans-serif;margin:6px 0}h2{font:bold 13px Helvetica,Arial,sans-serif;border-bottom:1px solid #111;margin:18px 0 6px;break-after:avoid}
table{border-collapse:collapse;width:100%;margin:6px 0 10px;break-inside:auto}tr{break-inside:avoid}
th,td{border:1px solid #888;padding:3px 5px;vertical-align:top;text-align:left}th{background:#eee;font-family:Helvetica,Arial,sans-serif}
caption{text-align:left;font-style:italic;padding:2px 0}
.small{font-size:9px}.mono{font-family:Menlo,monospace;font-size:9px}.num{text-align:right}
.missing,.status-missing{color:#b00020;font-weight:bold}.status-fulfilled{color:#0a6b2f;font-weight:bold}
.imported{margin-top:4px;color:#444;font-size:9px}.note{background:#f6f6f6;border-left:3px solid #999;padding:4px 8px}
a{color:#0645ad;text-decoration:none}q{font-style:italic}hr{border:0;border-top:1px dashed #bbb}
</style></head><body>
<header class="fixed">${esc(EXHIBIT_HEADER)}</header>
<h1>${esc(c.title)}</h1>
<p>${esc(c.court.name)} · Index No. ${esc(c.court.index)} · ${esc(c.court.judge)} · order entered ${esc(c.court.decisionDate)} (source: ${esc(c.court.source)})</p>
<p class="note">Replay of a public court record for demonstration. Service in this exhibit was made on ${esc(c.chain.name)} (chainId ${c.chain.chainId}) to <b>stand-in wallets</b>; nothing was sent to the defendants' real wallets, which are only read. This is proof-of-service material for a lawyer to review; the chain records what was sent and when, not that anyone read it, and not when a paper was filed with the court.</p>
<p class="small">Case ID <span class="mono">${esc(c.caseId)}</span> · registry ${link(ex && `${ex}/address/${c.chain.registry}`, c.chain.registry)} · notice NFT ${link(ex && `${ex}/address/${c.chain.notice721}`, c.chain.notice721)} · order PDF SHA-256 <span class="mono">${esc(c.order.hash)}</span> · generated ${esc(c.generatedAt)}</p>

<h2>A. Impracticability of ordinary service and continued wallet use</h2>
<p>Counts and dates are from the decision (order p.4): calls and texts to 14 numbers on Dec 6 and 9–11, 2024, two replies without a verifiable address; 4 email addresses, one "delivered" notice. <b>Phone numbers, email addresses and the per-row assignment of results below are synthetic.</b></p>
<table class="small"><tr><th>#</th><th>Channel</th><th>Contact (synthetic)</th><th>Date</th><th>Result</th></tr>${contacts
    .map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.channel)}</td><td>${esc(r.to)}</td><td>${esc(r.date)}</td><td>${esc(r.result)}</td></tr>`)
    .join('')}</table>
<p>Frozen balance relied on by the court: about $2,179,507 as of April 2024 (order p.2; complaint p.14). These are historical figures, not current values.</p>
${activityTable(defendants, monthRange('2024-04', '2024-12'), `Defendant wallet transactions per month, Apr–Dec 2024 (read from chain; fetched ${day(c.activity.fetchedAt)}; counts include incoming transfers)`)}

<h2>B. Order conditions and performance record</h2>
<p>Conditions were pre-extracted from the order (p.${esc(c.order.page)}) and confirmed by the author (demo). Status comes from <code>ConditionFulfilled</code> events in the registry. Missing items are marked in red.</p>
<table><tr><th>#</th><th>Condition</th><th>Status</th><th>Evidence (tx · block · time)</th></tr>${evRows}</table>
<table class="small"><caption>Service notices minted (soulbound ERC-721; tokenURI fixes the documents URL and bundle SHA-256 ${esc(short(c.documents.bundleHash))})</caption><tr><th>Recipient</th><th>Token</th><th>Tx</th><th>Block</th><th>Time</th></tr>${svcRows}</table>
<p class="small">Affidavit (synthetic sample) SHA-256 <span class="mono">${esc(c.affidavit.hash)}</span>, declaredFiledAt ${esc(c.affidavit.declaredFiledAt)} — ${esc(c.affidavit.note)}.</p>
${existRows ? `<table class="small"><caption>Service already made in the real case, imported read-only from public chains (not re-sent)</caption><tr><th>Order served</th><th>Recipient</th><th>Chain</th><th>Tx</th><th>Date</th><th>On-chain name</th></tr>${existRows}</table><p class="small">The January 2025 notices served the order to show cause (motion papers) before the June 2025 order. The July 30, 2025 notices fall inside the June order's window; their sender is not verified against court records.</p>` : ''}

<h2>C. Deadlines and activity after service</h2>
<table><tr><th>Item</th><th>Value</th><th>Basis</th></tr>
<tr><td>Service deadline (original case)</td><td>${esc(d.originalServiceDeadline)}</td><td>entry 2025-06-11 + 120 days (CPLR 306-b extension in the order)</td></tr>
<tr><td>Service deadline (this replay, on-chain)</td><td>${esc(d.serviceDeadline)}</td><td>case opened + 120 days; the registry requires a future deadline</td></tr>
<tr><td>declaredFiledAt (affidavit)</td><td>${esc(c.affidavit.declaredFiledAt)}</td><td>entered by the filer; the chain cannot prove the court filing date</td></tr>
<tr><td>Response deadline</td><td><b>${esc(d.responseDeadline)}</b></td><td>${esc(d.rule)} — declaredFiledAt + 30 days (status: ${esc(d.status)})</td></tr>
<tr><td>Caveat</td><td colspan="2" class="missing">${esc(d.caveat)}</td></tr>
<tr><td>Activity snapshot</td><td colspan="2">${snapLine}</td></tr></table>
${activityTable(c.activity.wallets, after, `Wallet transactions per month after the original order (Jun 2025 – fetch date). Includes incoming airdrops such as later court notices. Activity is circumstantial; it does not show that anyone saw the notice.`)}
<p class="small">* month before the wallet's completeFrom month; older items were not fetched, so the count may be low.</p>
<p class="small">Wallet sources: ${c.activity.wallets.map((w) => `${esc(w.label)} — ${esc(w.source)}`).join('; ')}. Rules: ${(c.rules || []).map((r) => link(r.url, `${r.section} [${r.status}]`)).join(', ')}.</p>
</body></html>`;
}

// Finds a Chromium browser for headless printing.
export function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error('no Chrome/Brave found; set CHROME_PATH');
  return hit;
}

// Prints an HTML file to PDF with a throwaway browser profile.
export function htmlToPdf(htmlPath, pdfPath) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'servechain-pdf-'));
  try {
    execFileSync(
      findBrowser(),
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${profile}`,
        '--no-pdf-header-footer',
        `--print-to-pdf=${pdfPath}`,
        'file://' + path.resolve(htmlPath),
      ],
      { stdio: 'ignore', timeout: 90_000 },
    );
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
  if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size < 1000) throw new Error('PDF was not produced');
}
