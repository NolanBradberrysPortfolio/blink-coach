import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve('dist');
const server = createServer(async (req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/blink-coach\/?/, '').replace(/^\//, '');
    let file = path.resolve(root, relative || 'index.html');
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (!path.extname(file)) file += '.html';
    res.setHeader('Content-Type', ({ '.html':'text/html', '.js':'application/javascript', '.json':'application/json', '.png':'image/png', '.css':'text/css' })[path.extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.argv[2], headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let requests = 0;
  await page.route('https://blink-coach-diagnostics.buck-bradberry.chatgpt.site/api/reports**', async route => {
    requests++;
    const suffix = new URL(route.request().url()).pathname;
    const r = await route.fetch({ url: 'http://127.0.0.1:8787' + suffix });
    await route.fulfill({ response: r });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/blink-coach/`);
  await page.getByRole('button', { name: 'Missing my blinks?', exact: true }).click();
  await page.getByRole('button', { name: 'Open camera', exact: true }).click();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click({ timeout: 20000 });
  const stop = page.getByRole('button', { name: 'Done blinking · stop recording', exact: true });
  await stop.waitFor({ timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 3200));
  await stop.click();
  await page.getByLabel('Actual blinks you made (0–30)').fill('5');
  assert.equal(requests, 0, 'No upload before explicit Send');
  assert.equal(await page.getByRole('button', { name: 'Send diagnostic report', exact: true }).isDisabled(), true);
  await page.getByRole('switch').check();
  await page.getByRole('button', { name: 'Send diagnostic report', exact: true }).click();
  await page.getByText('Report received', { exact: true }).waitFor({ timeout: 30000 });
  assert.ok(requests >= 3);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const receipt = await page.evaluate(() => JSON.parse(localStorage.getItem('blink-coach-diagnostic-receipts-v1'))[0]);
  assert.equal(receipt.status, 'ready');
  await page.getByRole('button', { name: 'Delete this report', exact: true }).click();
  await page.getByText('Your report receipts', { exact: true }).waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  console.log('PASS: mobile recording, review, explicit consent, real chunk upload, receipt, deletion, no browser errors/overflow. Synthetic camera only.');
} finally { await browser.close(); server.close(); }
