// Render every screen in plan.json to a PNG and write concat.txt next to it.
// Usage: node render/render.js out/<id>/plan.json
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const planPath = path.resolve(process.argv[2]);
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const dir = path.dirname(planPath);
const frames = path.join(dir, 'frames');
fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto('file://' + path.resolve(__dirname, 'template.html'));
  const concat = [];
  // De-duplicate identical screens (same JSON) to save screenshots.
  const seen = new Map();
  for (let i = 0; i < plan.screens.length; i++) {
    const s = plan.screens[i];
    const key = JSON.stringify({ ...s, at: 0, seconds: 0 });
    let png = seen.get(key);
    if (!png) {
      if (s.type === 'hook1') await page.evaluate(([a, b]) => renderCard('hook1', a.replace(/\*(\S+)\*/, '<em>$1</em>'), b), [s.text, s.sub]);
      else if (s.type === 'hook2') await page.evaluate(([a, b]) => renderCard('hook2', a, b + ' →'), [s.text, s.pill]);
      else if (s.type === 'outro') await page.evaluate(([n, lang]) => renderCard('outro', n, lang), [s.n, s.lang]);
      else {
        const q = { ...s.q, image_url: s.q.image_url ? 'file://' + s.q.image_url : null };
        await page.evaluate(([q, idx, n, left, total, phase, dim, lang]) => renderQuestion(q, idx, n, left, total, phase, dim, lang), [q, s.idx, s.n, s.seconds_left, s.total, s.phase, !!s.dim, plan.lang]);
      }
      png = path.join(frames, String(seen.size).padStart(4, '0') + '.png');
      await page.screenshot({ path: png });
      seen.set(key, png);
    }
    concat.push(`file '${png}'`, `duration ${s.seconds.toFixed(3)}`);
  }
  concat.push(`file '${seen.get(JSON.stringify({ ...plan.screens.at(-1), at: 0, seconds: 0 }))}'`);
  fs.writeFileSync(path.join(dir, 'concat.txt'), concat.join('\n'));
  await browser.close();
  console.log(`rendered ${seen.size} unique screens for ${plan.screens.length} segments, ${plan.total}s`);
})();
