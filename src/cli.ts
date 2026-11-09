/** CLI: dry | make [--format pass5] [--lang en] [--count 1] [--state Texas] | replan out/<id>/plan.json | audition "text" | voices */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ROOT, OUT, PUBLIC, writeJson } from "./env";
import { FORMATS } from "./config";
import { fetchAllQuestions, cacheImage } from "./supabase";
import { pickSet } from "./pick";
import { speakable, speakableDry, hooks, hooksDry } from "./text";
import { tts, dryClip, audition, listVoices } from "./voice";
import { buildPlan, countdownSeconds } from "./plan";
import { renderPlan } from "./render";
import type { DisplayQuestion, Lang, Question } from "./types";

async function make(fmt: string, lang: Lang, state: string | undefined, dry: boolean) {
  if (!FORMATS[fmt]) throw new Error(`Unknown format ${fmt}`);
  const id = `${fmt}_${lang}_${Date.now()}`;
  const work = path.join(OUT, id); fs.mkdirSync(work, { recursive: true });

  let qs: Question[];
  if (dry) {
    qs = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/sample_set.json"), "utf8"));
    const sample = path.join(PUBLIC, "cache/images/sample_sign.png");
    if (!fs.existsSync(sample)) fs.copyFileSync(path.join(ROOT, "docs/sample_sign.png"), sample);
  } else qs = pickSet(await fetchAllQuestions(), fmt, lang, state);

  const speak = await Promise.all(qs.map((q) => (dry ? speakableDry(q) : speakable(q, lang))));
  const display: DisplayQuestion[] = await Promise.all(qs.map(async (q, i) => ({
    id: q.id, question_text: q.question_text, answers: speak[i].answers_display, correct_answer: q.correct_answer,
    explanation: q.explanation ?? "",
    image: q.image_url ? (dry ? "cache/images/sample_sign.png" : await cacheImage(q.image_url, q.id)) : null,
  })));

  const aq = [], ar = [];
  for (const s of speak) {
    aq.push(dry ? dryClip(s.question_vo) : await tts(s.question_vo, lang));
    ar.push(dry ? dryClip(s.reveal_vo) : await tts(s.reveal_vo, lang));
  }
  const secs = Math.round(aq.reduce((a, c, i) => a + countdownSeconds(fmt, display[i], c), 0) / aq.length);
  const timing = { count: qs.length, seconds_per_question: secs };
  const h = dry ? hooksDry(timing) : await hooks(qs, fmt, lang, timing, state);
  const ah = dry ? dryClip(h.vo_line) : await tts(h.vo_line, lang);
  const ao = dry ? dryClip(h.outro_vo) : await tts(h.outro_vo, lang);

  const plan = buildPlan({ id, format: fmt, lang, questions: display, hook: h, audio: { hook: ah, outro: ao, q: aq, r: ar } });
  writeJson(path.join(work, "plan.json"), plan);
  writeJson(path.join(work, "post.json"), { caption: h.caption, hashtags: h.hashtags, hook: h, questions: plan.meta.questionIds, seconds: plan.meta.totalSeconds });
  console.log(`plan ${id}: ${plan.meta.totalSeconds}s, ${plan.durationInFrames} frames, ${qs.length} questions`);
  if (plan.meta.totalSeconds > 75) console.warn(`WARNING: ${plan.meta.totalSeconds}s is over the 75 s soft ceiling`);
  await renderPlan(plan, path.join(work, "video.mp4"));
  console.log(`OK ${path.relative(ROOT, path.join(work, "video.mp4"))}  ${plan.meta.totalSeconds}s`);
}

/** Re-time and re-render an existing plan with the current rules. No API calls (clips are reused). */
async function replan(planPath: string) {
  const old = JSON.parse(fs.readFileSync(planPath, "utf8")) as import("./types").Plan;
  const h = { ...old.hook, caption: old.meta.caption, hashtags: old.meta.hashtags, vo_line: old.hook.vo.text, outro_vo: old.outro.vo.text };
  const plan = buildPlan({ id: old.id, format: old.format, lang: old.lang, questions: old.questions.map((s) => s.q), hook: h,
    audio: { hook: old.hook.vo, outro: old.outro.vo, q: old.questions.map((s) => s.vo), r: old.questions.map((s) => s.revealVo) } });
  const secs = Math.round(plan.questions.reduce((a, s) => a + s.countdownSeconds, 0) / plan.questions.length);
  plan.hook.card2 = plan.hook.card2.replace(/\b\d+ seconds/, `${secs} seconds`);
  const dir = path.dirname(planPath); const n = fs.readdirSync(dir).filter((f) => /^video.*\.mp4$/.test(f)).length + 1;
  writeJson(path.join(dir, `plan_v${n}.json`), plan);
  console.log(`replan ${plan.id}: ${old.meta.totalSeconds}s -> ${plan.meta.totalSeconds}s, countdowns ${plan.questions.map((s) => s.countdownSeconds).join("/")}`);
  await renderPlan(plan, path.join(dir, `video_v${n}.mp4`));
  console.log(`OK ${path.relative(ROOT, path.join(dir, `video_v${n}.mp4`))}`);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { format: { type: "string", default: "pass5" }, lang: { type: "string", default: "en" }, count: { type: "string", default: "1" }, state: { type: "string" } },
});
const cmd = positionals[0] ?? "dry";
const lang = values.lang as Lang;
try {
  if (cmd === "dry") await make(values.format!, lang, values.state, true);
  else if (cmd === "make") for (let i = 0; i < parseInt(values.count!, 10); i++) await make(values.format!, lang, values.state, false);
  else if (cmd === "audition") await audition(positionals[1] ?? `Most people fail this one. Can you pass the ${new Date().getFullYear() + 1} DMV test? Question one. What does this sign mean?`);
  else if (cmd === "replan") await replan(positionals[1]);
  else if (cmd === "voices") for (const v of await listVoices()) console.log(v.voice_id, v.name, JSON.stringify(v.labels));
  else throw new Error(`Unknown command ${cmd}`);
} catch (e) { console.error((e as Error).message); process.exit(1); }
