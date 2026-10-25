import { chromium } from 'playwright-core';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixPdfFile } from '../../scripts/lib/pdfmeta.mjs';

const src = path.resolve('../docs/deck.html');
const out = path.resolve('../docs/deck.pdf');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(src).href, { waitUntil: 'networkidle' });
await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
await browser.close();
fixPdfFile(out, { title: 'ServeChain Deck' });
console.log('wrote', out);
