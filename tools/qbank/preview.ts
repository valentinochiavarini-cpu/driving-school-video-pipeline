/** Preview how review questions look in the video before import: renders the question and reveal frames for the given
 *  rows (from any drafts JSON with image_file/image_path) into out/qbank-preview/. No API calls.
 *  usage: npx tsx tools/qbank/preview.ts assets/qbank/diagrams/questions.json [id ...] */
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { buildPlan } from "../../src/plan";
import { dryClip, hooksDry } from "../../src/dry";
import { ROOT, PUBLIC } from "../../src/env";

const [file, ...ids] = process.argv.slice(2);
const rows = (JSON.parse(fs.readFileSync(file, "utf8")) as any[]).filter((r) => !ids.length || ids.includes(r.id ?? r.sign_code));
const dir = path.join(PUBLIC, "cache/qbank"); fs.mkdirSync(dir, { recursive: true });
const questions = rows.map((r, i) => {
  const src = r.image_path ?? (r.image_file ? path.join(ROOT, "assets/qbank", r.image_file) : null);
  let image: string | null = null;
  if (src && fs.existsSync(src)) { const name = `${i}-${path.basename(src)}`; fs.copyFileSync(src, path.join(dir, name)); image = `cache/qbank/${name}`; }
  return { id: r.id ?? String(i), question_text: r.question_text, answers: r.answers, correct_answer: r.correct_answer, explanation: r.explanation, image };
});
const plan = buildPlan({ id: "preview", format: "pass5", lang: "en", theme: process.env.THEME ?? "light", questions, hook: hooksDry({ count: questions.length, seconds_per_question: 10 }),
  audio: { hook: dryClip("hook"), outro: dryClip("outro"), q: questions.map((q) => dryClip(q.question_text)), r: questions.map(() => dryClip("The answer is B. Because.")) } });
const out = path.join(ROOT, "out/qbank-preview"); fs.mkdirSync(out, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(ROOT, "remotion/index.ts"), publicDir: PUBLIC, onProgress: () => {} });
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
const composition = await selectComposition({ serveUrl, id: "Quiz", inputProps: { plan }, browserExecutable });
for (const s of plan.questions) for (const [tag, f] of [["q", s.questionAt + 45], ["r", s.revealAt + 40]] as const) {
  await renderStill({ composition, serveUrl, output: path.join(out, `${s.q.id}-${tag}.png`), frame: f, inputProps: { plan }, browserExecutable, scale: 0.375 });
}
console.log(`previews -> ${out}`);
