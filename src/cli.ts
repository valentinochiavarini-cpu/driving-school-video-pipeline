/** CLI: dry | make [--format pass5] [--lang en] [--count 1] [--state Texas] | replan out/<id>/plan.json | approve <id> | list [status] | publish [--count 3] [--at ISO,ISO] | sync | slots | report [weekly] | metrics <id> views=.. likes=.. | audition "text" | voices */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ROOT, OUT, PUBLIC, writeJson } from "./env";
import { FORMATS } from "./config";
import { fetchAllQuestions, cacheImage } from "./supabase";
import type { VideoRow } from "./ledger";
import { pickSet } from "./pick";
import { speakable, speakableDry, hooks, hooksDry } from "./text";
import { tts, dryClip, audition, listVoices } from "./voice";
import { buildPlan, countdownSeconds } from "./plan";
import { renderPlan } from "./render";
import { execFileSync } from "node:child_process";
import { ledgerEnabled, upsertVideo, updateVideo, listVideos, uploadFile } from "./ledger";
import { postizEnabled, publishApproved, syncScheduled, nextSlots } from "./publish";
import { report } from "./report";
import { chooseAngle } from "./text";
import { POSTING, THEMES } from "./config";
import type { DisplayQuestion, Lang, Question } from "./types";

async function make(fmt: string, lang: Lang, state: string | undefined, dry: boolean) {
  if (!FORMATS[fmt]) throw new Error(`Unknown format ${fmt}`);
  const id = `${fmt}_${lang}_${Date.now()}`;
  const work = path.join(OUT, id); fs.mkdirSync(work, { recursive: true });

  let qs: Question[]; let ledgerRows: VideoRow[] = [];
  if (dry) {
    qs = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/sample_set.json"), "utf8"));
    const sample = path.join(PUBLIC, "cache/images/sample_sign.png");
    if (!fs.existsSync(sample)) fs.copyFileSync(path.join(ROOT, "docs/sample_sign.png"), sample);
  } else {
    let remoteUsed: string[] = [];
    if (ledgerEnabled()) {
      const recent = (await listVideos(null, 1000)).filter((v) => v.lang === lang && v.status !== "failed" && Date.now() - new Date(v.created_at ?? 0).getTime() < POSTING.reuseAfterDays * 86400e3);
      remoteUsed = recent.flatMap((v) => v.question_ids ?? []);
      ledgerRows = recent;
    }
    qs = pickSet(await fetchAllQuestions(), fmt, lang, state, undefined, remoteUsed);
  }

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
  const stats: Record<string, { posts: number; views: number }> = {};
  for (const v of ledgerRows) { const a = (v.hook as { style?: string } | null)?.style; if (!a) continue; stats[a] ??= { posts: 0, views: 0 }; stats[a].posts++; stats[a].views += Number((v.metrics as { views?: number } | null)?.views ?? 0); }
  const seriesNumber = ledgerRows.filter((v) => v.format === fmt && v.lang === lang).length + 1;
  const h = dry ? hooksDry(timing) : await hooks(qs, fmt, lang, timing, state, chooseAngle(stats), seriesNumber);
  const ah = dry ? dryClip(h.vo_line) : await tts(h.vo_line, lang);
  const ao = dry ? dryClip(h.outro_vo) : await tts(h.outro_vo, lang);

  const themeCount: Record<string, number> = Object.fromEntries(THEMES.map((x) => [x, 0]));
  for (const v of ledgerRows) { const th = (v.metrics as { theme?: string } | null)?.theme; if (th && th in themeCount) themeCount[th]++; }
  const theme = process.env.THEME || [...THEMES].sort((a, b) => themeCount[a] - themeCount[b] || Math.random() - 0.5)[0];
  const plan = buildPlan({ id, format: fmt, lang, theme, questions: display, hook: h, audio: { hook: ah, outro: ao, q: aq, r: ar } });
  writeJson(path.join(work, "plan.json"), plan);
  writeJson(path.join(work, "post.json"), { caption: h.caption, hashtags: h.hashtags, hook: h, questions: plan.meta.questionIds, seconds: plan.meta.totalSeconds });
  console.log(`plan ${id}: ${plan.meta.totalSeconds}s, ${plan.durationInFrames} frames, ${qs.length} questions, theme ${theme}, angle ${h.style ?? "-"}`);
  if (plan.meta.totalSeconds > 75) console.warn(`WARNING: ${plan.meta.totalSeconds}s is over the 75 s soft ceiling`);
  const video = path.join(work, "video.mp4");
  await renderPlan(plan, video);
  const thumb = path.join(work, "thumb.jpg");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "0.9", "-i", video, "-frames:v", "1", "-q:v", "3", thumb]);
  console.log(`OK ${path.relative(ROOT, video)}  ${plan.meta.totalSeconds}s`);
  if (ledgerEnabled() && !dry) {
    const chars = [ah, ao, ...aq, ...ar].reduce((a, c) => a + c.text.length, 0);
    await upsertVideo({ id, format: fmt, lang, status: "draft", approved: false, caption: h.caption, hashtags: h.hashtags, hook: h,
      question_ids: plan.meta.questionIds, seconds: plan.meta.totalSeconds, metrics: { chars, angle: h.style ?? null, theme } });
    const videoUrl = await uploadFile(id, "video", video);
    await uploadFile(id, "thumb", thumb);
    await updateVideo(id, { status: "ready" });
    console.log(`ledger: ${id} ready  ${videoUrl}`);
  }
}

async function setMetrics(id: string, pairs: string[]) {
  const rows = await listVideos(null, 1000); const v = rows.find((r) => r.id === id);
  if (!v) throw new Error(`no video ${id}`);
  const patch: Record<string, unknown> = { ...((v.metrics as object) ?? {}) };
  for (const p of pairs) { const [k, val] = p.split("="); if (k && val !== undefined) patch[k] = Number(val); }
  patch.manual_at = new Date().toISOString();
  await updateVideo(id, { metrics: patch }); console.log(`metrics ${id}`, patch);
}

async function approve(id: string) {
  const v = await updateVideo(id, { approved: true, status: "approved" });
  console.log(`approved ${v.id}  ${v.video_url}`);
}

async function list(status: string | undefined) {
  const rows = await listVideos((status as import("./ledger").VideoStatus) ?? null, 50);
  for (const v of rows) console.log(`${v.status.padEnd(9)} ${v.id.padEnd(28)} ${String(v.seconds ?? "").padStart(5)}s  ${v.scheduled_at ?? ""} ${v.post_url ?? v.video_url ?? ""}`);
  if (!rows.length) console.log("(no videos)");
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
  options: { format: { type: "string", default: "pass5" }, lang: { type: "string", default: "en" }, count: { type: "string", default: "1" }, state: { type: "string" }, weekly: { type: "boolean", default: false }, now: { type: "boolean", default: false }, at: { type: "string" } },
});
const cmd = positionals[0] ?? "dry";
const lang = values.lang as Lang;
try {
  if (cmd === "dry") await make(values.format!, lang, values.state, true);
  else if (cmd === "make") for (let i = 0; i < parseInt(values.count!, 10); i++) await make(values.format!, lang, values.state, false);
  else if (cmd === "audition") await audition(positionals[1] ?? `Most people fail this one. Can you pass the ${new Date().getFullYear() + 1} DMV test? Question one. What does this sign mean?`);
  else if (cmd === "replan") await replan(positionals[1]);
  else if (cmd === "approve") await approve(positionals[1]);
  else if (cmd === "report") console.log(await report(positionals[1] === "weekly" || values.weekly === true));
  else if (cmd === "metrics") await setMetrics(positionals[1], positionals.slice(2));
  else if (cmd === "publish") { if (!postizEnabled()) console.log("publish: POSTIZ_API_KEY not set, skipping"); else await publishApproved(parseInt(values.count!, 10) || 3, { firstNow: values.now === true, at: values.at ? String(values.at).split(",").map((t) => { const d = new Date(t); if (isNaN(+d) || +d < Date.now() + 30 * 60e3) throw new Error(`--at ${t}: not a time at least 30 min ahead`); return d; }) : undefined }); }
  else if (cmd === "sync") { if (!postizEnabled()) console.log("sync: POSTIZ_API_KEY not set, skipping"); else await syncScheduled(); }
  else if (cmd === "slots") for (const s of nextSlots([], parseInt(values.count!, 10) || 7)) console.log(s.toISOString(), new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(s));
  else if (cmd === "list") await list(positionals[1]);
  else if (cmd === "voices") for (const v of await listVoices()) console.log(v.voice_id, v.name, JSON.stringify(v.labels));
  else throw new Error(`Unknown command ${cmd}`);
} catch (e) { console.error((e as Error).message); process.exit(1); }
