import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.URL || 'http://localhost:4173/';
const out = path.resolve(process.env.OUT || '../private/shots');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const log = [];

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
      await page.waitForSelector('.verdict', { timeout: 60000 });
      log.push(`${tag} published: ${await page.locator('.result').innerText()}`);
      await page.screenshot({ path: `${out}/${tag}-step5-match.png`, fullPage: true });
      await page.getByRole('button', { name: 'Try a tampered copy' }).click();
      await page.waitForFunction(() => document.querySelector('.verdict')?.textContent === 'MISMATCH', null, { timeout: 60000 });
      log.push(`${tag} tampered: ${await page.locator('.result').innerText()}`);
      await page.screenshot({ path: `${out}/${tag}-step5-mismatch.png`, fullPage: true });
      for (const [name, file] of [['bundle', 'public/docs/service-bundle.pdf'], ['affidavit', 'public/case/affidavit.pdf']]) {
        await page.locator('input[type=file]').setInputFiles(file);
        await page.waitForFunction((n) => document.querySelector('.result')?.textContent?.includes(n) && document.querySelector('.verdict'), file.split('/').pop(), { timeout: 60000 });
        log.push(`${tag} ${name}: ${await page.locator('.result').innerText()}`);
        await page.screenshot({ path: `${out}/${tag}-step5-${name}.png`, fullPage: true });
      }
      continue;
    }
    await page.screenshot({ path: `${out}/${tag}-step${s}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) errors.push(`${tag} step${s}: horizontal overflow`);
  }
  await page.close();
}

await pass('desktop-light', { width: 1280, height: 860 }, 'light');
await pass('desktop-dark', { width: 1280, height: 860 }, 'dark');
await pass('mobile', { width: 390, height: 844 }, 'light');
await browser.close();
console.log(log.join('\n---\n'));
console.log(errors.length ? errors.join('\n') : 'no errors');
