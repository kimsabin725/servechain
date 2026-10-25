import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.URL || 'http://localhost:4173/';
const out = path.resolve(process.env.OUT || '../private/shots');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];

// Captures every step at one viewport and theme.
async function pass(tag, viewport, scheme) {
  const page = await browser.newPage({ viewport, colorScheme: scheme });
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
  for (let s = 0; s <= 5; s++) {
    await page.goto(`${url}#step-${s}`);
    await page.reload();
    await page.waitForSelector('.pager');
    if (s === 5) {
      await page.getByRole('button', { name: 'Verify the published exhibit' }).click();
      await page.waitForSelector('.verdict');
      await page.screenshot({ path: `${out}/${tag}-step5-match.png`, fullPage: true });
      await page.getByRole('button', { name: 'Try a tampered copy' }).click();
      await page.waitForFunction(() => document.querySelector('.verdict')?.textContent === 'MISMATCH');
    }
    await page.screenshot({ path: `${out}/${tag}-step${s}${s === 5 ? '-mismatch' : ''}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) errors.push(`${tag} step${s}: horizontal overflow`);
  }
  await page.close();
}

await pass('desktop-light', { width: 1280, height: 860 }, 'light');
await pass('desktop-dark', { width: 1280, height: 860 }, 'dark');
await pass('mobile', { width: 390, height: 844 }, 'light');
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no errors');
