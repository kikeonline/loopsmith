import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { chromium } from '@playwright/test';

const url = 'http://127.0.0.1:4175/';
const fixture = process.argv[2];
const suffix = fixture ? `-${(process.argv[3] ?? 'project').replace(/[^a-z0-9-]/gi, '')}` : '';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { logs = (logs + chunk).slice(-4000); });
let chrome;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Preview server exited: ${logs}`);
    try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
    await delay(100);
  }
  if (!ready) throw new Error(`Preview server did not start: ${logs}`);
  chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--window-size=1440,1000', '--no-sandbox', '--disable-dev-shm-usage'] });
  if (fixture) {
    const file = JSON.parse(await readFile(fixture, 'utf8'));
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`);
    const page = await browser.contexts()[0].newPage();
    await page.goto(url);
    await page.evaluate(file => localStorage.setItem('loopsmith.project.v1', JSON.stringify(file)), file);
    await page.close();
    // chrome.kill() below also closes this temporary CDP connection.
  }
  const result = await lighthouse(url, { port: chrome.port, onlyCategories: ['accessibility'], output: ['json', 'html'], formFactor: 'desktop', screenEmulation: { disabled: true }, disableStorageReset: !!fixture, logLevel: 'error' });
  if (!result) throw new Error('Lighthouse produced no report');
  await mkdir('reports', { recursive: true });
  await writeFile(`reports/accessibility${suffix}.json`, result.report[0]);
  await writeFile(`reports/accessibility${suffix}.html`, result.report[1]);
  const score = Math.round((result.lhr.categories.accessibility.score ?? 0) * 100);
  console.log(`Lighthouse accessibility${suffix}: ${score}/100 (required: 90)`);
  for (const audit of Object.values(result.lhr.audits).filter(audit => audit.score !== null && audit.score < 1)) console.log(`- ${audit.title}: ${audit.description}`);
  if (score < 90) process.exitCode = 1;
} finally {
  await chrome?.kill();
  server.kill('SIGTERM');
}
