// Optional live-site smoke check; deliberately excluded from offline CI tests.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const path = process.argv[2];
if (!path) throw new Error('Usage: node scripts/verify-export-in-strudel.mjs <exported-code.strudel>');
const code = await readFile(path, 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto('https://strudel.cc/', { waitUntil: 'domcontentloaded' });
  const editor = page.getByRole('textbox');
  await editor.waitFor();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(code);
  await page.getByRole('button', { name: 'play', exact: true }).click();
  await page.getByRole('button', { name: 'stop', exact: true }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  const body = await page.locator('body').innerText();
  if (/Error:|SyntaxError:|ReferenceError:/.test(body)) throw new Error('Strudel displayed an evaluation error');
  await mkdir('reports', { recursive: true });
  await page.screenshot({ path: 'reports/strudel-compatibility.png' });
  await page.getByRole('button', { name: 'stop', exact: true }).click();
  await page.getByRole('button', { name: 'play', exact: true }).waitFor();
  const evidence = { checkedAt: new Date().toISOString(), url: page.url(), file: path, codeCharacters: code.length, evaluationAccepted: true, stopped: true, listening: 'Not a human listening check' };
  await writeFile('reports/strudel-compatibility.json', JSON.stringify(evidence, null, 2));
  console.log('PASS: exported code played and stopped in strudel.cc');
} finally { await browser.close(); }
