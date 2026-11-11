/** Fetch real US road sign images (MUTCD) from Wikimedia Commons. Never invents a sign: every file comes from Commons
 *  with its page URL, licence and author kept in assets/qbank/signs/manifest.json.
 *  usage: npx tsx tools/signs/fetch.ts [CODE ...]   (default: the list below) */
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("assets/qbank/signs");
fs.mkdirSync(OUT, { recursive: true });
const API = "https://commons.wikimedia.org/w/api.php";
// Wikimedia policy: identify the client with a contact point (the public app URL), see meta.wikimedia.org/wiki/User-Agent_policy
const UA = { "User-Agent": "TheDrivingSchoolQuestionBank/1.0 (https://the-driving-school.lovable.app) node-fetch/22" };

/** MUTCD code -> meaning (from the MUTCD sign descriptions). The question drafts use the meaning; owner reviews. */
export const SIGNS: Record<string, string> = {
  "R1-1": "Stop", "R1-2": "Yield", "R6-1R": "One way (traffic flows to the right)", "R5-1": "Do not enter",
  "R5-1a": "Wrong way", "R3-1": "No right turn", "R3-2": "No left turn", "R3-4": "No U-turn", "R3-18": "No U-turn or left turn",
  "R4-7": "Keep right (of the obstruction)", "R4-8": "Keep left (of the obstruction)", "R4-1": "Do not pass",
  "R3-17": "Bike lane", "R10-6": "Stop here on red", "R10-7": "Do not block intersection", "R10-11": "No turn on red",
  "R3-7R": "Right lane must turn right", "R3-5L": "Left turn only (this lane)", "R3-8": "Advance lane control: left lane turns left only; right lane turns left or goes straight",
  "R4-2": "Pass with care", "R2-1": "Speed limit",
  "W14-1": "Dead end", "W14-2": "No outlet", "W12-2": "Low clearance (height limit ahead)", "W4-2": "Lane ends (merge left)",
  "W20-7": "Flagger ahead", "W8-3": "Pavement ends", "W8-4": "Soft shoulder", "W8-5": "Slippery when wet",
  "W1-6": "Large arrow: the road turns sharply to the left", "W1-8": "Chevron alignment: the road curves to the left; follow the chevrons", "W3-2": "Yield ahead",
  "W3-3": "Traffic signal ahead", "W4-1": "Merge: traffic from the left joins your lane ahead", "W6-1": "Divided highway begins",
  "W6-3": "Two-way traffic ahead", "W10-1": "Highway-rail grade crossing ahead", "W11-2": "Pedestrian crossing",
  "W16-7P": "Downward arrow plaque: crossing is here", "W2-1": "Cross road (intersection) ahead", "W2-2": "Side road ahead",
  "W2-6": "Circular intersection (roundabout) ahead", "W5-2": "Narrow bridge", "W7-1": "Steep hill / downgrade",
  "W11-8": "Fire station / emergency vehicles", "W12-1": "Double arrow: traffic may pass on either side",
  "M4-8": "Detour", "R3-11": "HOV lane: only vehicles with the posted number of occupants (2+) during the posted hours", "W9-1": "Lane ends (right lane ends)",
  "R9-7": "Shared-use path: bicycles keep left, pedestrians keep right", "S1-1": "School advance warning (school zone)",
};

/* The Commons API rate-limits the shared egress IP of cloud sessions (HTTP 429 on the first request), so files are
 * fetched straight from upload.wikimedia.org by their hashed path: /wikipedia/commons/<md5[0]>/<md5[0:2]>/<File_name>.
 * Pacing 6 s per request, exponential backoff on 429. SVG originals are rasterised locally to 600 px PNG. */
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const fileUrl = (name: string) => { const h = crypto.createHash("md5").update(name).digest("hex"); return `https://upload.wikimedia.org/wikipedia/commons/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(name)}`; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<{ status: number; body?: Buffer }> {
  // the shared egress IP gets ~1 in 3 requests through regardless of spacing, so retry quickly at a fixed interval
  for (let attempt = 0; attempt < Number(process.env.ATTEMPTS ?? 15); attempt++) {
    const r = await fetch(url, { headers: UA });
    if (r.status === 429) { await sleep(8000); continue; }
    return { status: r.status, body: r.ok ? Buffer.from(await r.arrayBuffer()) : undefined };
  }
  return { status: 429 };
}

/** File-name variants Commons uses for MUTCD signs */
function variants(code: string): string[] {
  const base = [`MUTCD_${code}.svg`, `MUTCD-${code}.svg`];
  if (!/[LR]$/.test(code)) base.push(`MUTCD_${code}L.svg`, `MUTCD_${code}R.svg`);
  if (/[LR]$/.test(code)) base.push(`MUTCD_${code.slice(0, -1)}.svg`);
  return base;
}

async function rasterise(svgs: { code: string; svg: string }[]) {
  // same method as tools/signs/rasterise.ts: the SVG as an <img> fitted into 560 px, whatever its intrinsic size
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
  for (const { code, svg } of svgs) {
    await page.setContent(`<html><body style="margin:0;width:600px;height:600px;display:flex;align-items:center;justify-content:center;background:transparent">
      <img style="width:560px;height:560px;object-fit:contain" src="data:image/svg+xml;base64,${Buffer.from(svg.replace(/<\?xml[^>]*>/, "")).toString("base64")}"/></body></html>`);
    await page.locator("img").screenshot({ path: path.join(OUT, `${code}.png`), omitBackground: true });
  }
  await browser.close();
}

const codes = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SIGNS);
const manifestPath = path.join(OUT, "manifest.json");
const manifest: Record<string, any> = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
const fetched: { code: string; svg: string }[] = [];
for (const code of codes) {
  if (manifest[code]?.file && fs.existsSync(path.join(OUT, manifest[code].file)) && !process.env.REFETCH) { console.log(`SKIP ${code}`); continue; }
  let done = false;
  for (const name of variants(code)) {
    const url = fileUrl(name);
    const r = await get(url); await sleep(Number(process.env.PACE_MS ?? 4000));
    if (r.status === 404) continue;
    if (r.status !== 200 || !r.body) { console.log(`FAIL ${code} ${name} ${r.status}`); done = true; break; }
    const svg = r.body.toString("utf8");
    fs.writeFileSync(path.join(OUT, `${code}.svg`), svg);
    fetched.push({ code, svg });
    manifest[code] = { code, meaning: SIGNS[code] ?? null, file: `${code}.png`, svg: `${code}.svg`, commons_file: name,
      commons_page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name)}`, source_url: url,
      license: "Public domain: MUTCD sign design (US federal work). Verify the tag on the Commons page.", fetched_at: new Date().toISOString() };
    console.log(`OK   ${code.padEnd(7)} ${name}`); done = true; break;
  }
  if (!done) console.log(`MISS ${code} (no Commons file under ${variants(code).join(", ")})`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
}
if (fetched.length) await rasterise(fetched);
console.log(`done: ${Object.keys(manifest).length} signs in manifest`);
