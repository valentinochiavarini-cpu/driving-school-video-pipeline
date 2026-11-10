/** Rasterise every fetched sign SVG (assets/qbank/signs/*.svg) to a 600 px PNG with transparent background, and
 *  write a captioned contact sheet (contact.png) to check each image matches its MUTCD meaning. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const DIR = path.resolve("assets/qbank/signs");
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8")) as Record<string, any>;
const { chromium } = require("playwright");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
for (const code of Object.keys(manifest)) {
  const svgFile = path.join(DIR, `${code}.svg`); if (!fs.existsSync(svgFile)) continue;
  const svg = fs.readFileSync(svgFile, "utf8").replace(/<\?xml[^>]*>/, "");
  await page.setContent(`<html><body style="margin:0;width:600px;height:600px;display:flex;align-items:center;justify-content:center;background:transparent">
    <img style="max-width:560px;max-height:560px;width:560px;height:560px;object-fit:contain" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"/></body></html>`);
  await page.locator("img").screenshot({ path: path.join(DIR, `${code}.png`), omitBackground: true });
}
const cells = Object.values(manifest).filter((m: any) => fs.existsSync(path.join(DIR, `${m.code}.png`)))
  .map((m: any) => `<div class="c"><img src="data:image/png;base64,${fs.readFileSync(path.join(DIR, m.code + ".png")).toString("base64")}"/><p><b>${m.code}</b> ${m.meaning}</p></div>`).join("");
const sheet = await browser.newPage({ viewport: { width: 1400, height: 800 } });
await sheet.setContent(`<html><head><style>body{margin:0;font:15px Inter,Arial;background:#fff}.g{display:grid;grid-template-columns:repeat(7,1fr);gap:10px;padding:10px}.c{text-align:center}.c img{width:150px;height:150px;object-fit:contain;background:#f3f4f6}.c p{margin:4px 0}</style></head><body><div class="g">${cells}</div></body></html>`, { waitUntil: "load" });
await sheet.screenshot({ path: path.join(DIR, "contact.png"), fullPage: true });
await browser.close();
console.log(`rasterised; contact sheet ${path.join(DIR, "contact.png")}`);
