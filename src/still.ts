/** QA helper: render single frames of a plan without a full render.
 *  npx tsx src/still.ts out/<id>/plan.json <frame> [<frame> ...]  -> out/<id>/stills/f<frame>.png */
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { ROOT, PUBLIC } from "./env";
import type { Plan } from "./types";

const [planPath, ...frames] = process.argv.slice(2);
if (!planPath || !frames.length) { console.error("usage: still <plan.json> <frame> [frame...]"); process.exit(1); }
const plan = JSON.parse(fs.readFileSync(planPath, "utf8")) as Plan;
const dir = path.join(path.dirname(path.resolve(planPath)), "stills"); fs.mkdirSync(dir, { recursive: true });
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
const serveUrl = await bundle({ entryPoint: path.join(ROOT, "remotion/index.ts"), publicDir: PUBLIC, onProgress: () => {} });
const inputProps = { plan };
const composition = await selectComposition({ serveUrl, id: "Quiz", inputProps, browserExecutable });
for (const f of frames) {
  const output = path.join(dir, `f${f}.png`);
  await renderStill({ composition, serveUrl, output, frame: parseInt(f, 10), inputProps, browserExecutable, scale: 0.375 });
  console.log(output);
}
