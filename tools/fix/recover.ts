/** Re-render only hook card 1 (the cover, frames 0..hook1Frames-1) of an already rendered video with corrected card-1
 *  text, and splice it onto the original from the same frame. Audio, voice and every other frame are untouched.
 *  usage: npx tsx tools/fix/recover.ts <original.mp4> <theme> "<card1 with one *highlight*>" <out.mp4> */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { buildPlan } from "../../src/plan";
import { dryClip, hooksDry } from "../../src/dry";
import { ROOT, PUBLIC } from "../../src/env";

const [orig, theme, card1, out] = process.argv.slice(2);
const questions = (JSON.parse(fs.readFileSync(path.join(ROOT, "docs/sample_set.json"), "utf8")) as any[]).slice(0, 1)
  .map((q) => ({ ...q, image: null })); // only card 1 is rendered; the question scene is never drawn
const plan = buildPlan({ id: "cover-fix", format: "pass5", lang: "en", theme, questions, hook: { ...hooksDry({ count: 1, seconds_per_question: 10 }), card1 },
  audio: { hook: dryClip("hook"), outro: dryClip("outro"), q: questions.map((q) => dryClip(q.question_text)), r: questions.map(() => dryClip("The answer is B.")) } });
const n = plan.hook.hook1Frames;
const serveUrl = await bundle({ entryPoint: path.join(ROOT, "remotion/index.ts"), publicDir: PUBLIC, onProgress: () => {} });
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
const composition = await selectComposition({ serveUrl, id: "Quiz", inputProps: { plan }, browserExecutable });
const head = out.replace(/\.mp4$/, ".head.mp4");
await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: head, inputProps: { plan }, browserExecutable, frameRange: [0, n - 1], muted: true });
execFileSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-y", "-i", head, "-i", orig, "-filter_complex",
  `[1:v]trim=start_frame=${n},setpts=PTS-STARTPTS[rest];[0:v][rest]concat=n=2:v=1:a=0,format=yuv420p[v]`,
  "-map", "[v]", "-map", "1:a", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-r", "30", "-c:a", "copy", "-movflags", "+faststart", out]);
fs.rmSync(head);
console.log(`${out}: cover frames 0..${n - 1} replaced`);
