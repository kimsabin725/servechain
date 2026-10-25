import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.URL || 'http://localhost:4173/';
const out = path.resolve(process.env.OUT || '../private/shots/v4/deck');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' });
const card = (title) => page.locator('section.card').filter({ has: page.locator('h3', { hasText: title }) }).first();

// Opens a step fresh and waits for it to render.
async function open(step) {
  await page.goto(`${url}#step-${step}`);
  await page.reload();
  await page.waitForSelector('.pager');
}

await open(1);
await card('Defendant wallets').locator('.wallets').screenshot({ path: `${out}/impracticability.png` });
await open(3);
await card('Notices minted').screenshot({ path: `${out}/serve-notices.png` });
await card('Conditions after service').screenshot({ path: `${out}/serve-conditions.png` });
await open(4);
await card('Affidavit of service').screenshot({ path: `${out}/affidavit.png` });
await card('Response deadline').screenshot({ path: `${out}/deadline.png` });
await open(5);
await page.getByRole('button', { name: 'Verify the published summary' }).click();
await page.waitForSelector('.verdict', { timeout: 60000 });
await page.locator('.result').screenshot({ path: `${out}/verify-match.png` });
await page.getByRole('button', { name: 'Try a tampered copy' }).click();
await page.waitForFunction(() => document.querySelector('.verdict')?.textContent === 'MISMATCH', null, { timeout: 60000 });
await page.locator('.result').screenshot({ path: `${out}/verify-mismatch.png` });
await browser.close();
console.log(fs.readdirSync(out).join(' '));
