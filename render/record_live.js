// Test: record the live Creator Studio auto-play with Playwright recordVideo.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true,
    recordVideo: { dir: 'live', size: { width: 1080, height: 1920 } },
  });
  const page = await ctx.newPage();
  const log = [];
  const t0 = Date.now();
  const mark = (m) => { log.push([((Date.now() - t0) / 1000).toFixed(2), m]); };
  await page.goto('https://the-driving-school.lovable.app/studio-vc', { waitUntil: 'networkidle' });
  mark('loaded');
  await page.fill('input[type=password]', 'drive2026');
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Creator Studio', { timeout: 20000 });
  mark('authed');
  // format select is a shadcn Select; open it and pick "Can you pass? (5)"
  await page.waitForSelector('text=/sets completed/', { timeout: 30000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Loading sets'), { timeout: 60000 });
  mark('sets loaded');
  const fmt = await page.locator('[aria-labelledby=fmt-label]').innerText();
  mark('format: ' + fmt);
  if (!fmt.includes('Can you pass')) {
    await page.click('[aria-labelledby=fmt-label]');
    await page.click('text=Can you pass? (5)');
    await page.waitForTimeout(1500);
  }
  await page.click('text=Start set 1');
  mark('started set 1');
  // Observe state changes: poll header text + reveal state
  let last = '';
  for (let i = 0; i < 1200; i++) {
    await page.waitForTimeout(100);
    const s = await page.evaluate(() => {
      const h = document.querySelector('.studio-header span.text-base')?.textContent || '';
      const t = document.querySelector('[role=timer]')?.getAttribute('aria-label') || '';
      const rev = !!document.querySelector('.studio-answer-correct-pop');
      const done = !document.querySelector('.studio-recording');
      return JSON.stringify({ h, t, rev, done });
    });
    if (s !== last) { mark(s); last = s; }
    if (JSON.parse(s).done) break;
  }
  mark('finished');
  const v = page.video();
  await ctx.close();
  const p = await v.path();
  require('fs').writeFileSync('live/timeline.json', JSON.stringify(log, null, 1));
  console.log('video', p);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
