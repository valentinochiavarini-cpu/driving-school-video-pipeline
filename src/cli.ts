/** CLI: dry | make [--format pass5] [--lang en] [--count 1] [--state Texas] | replan out/<id>/plan.json | qa [id ...] [--no-fix] | approve <id> [--force] | auto-approve | retract <id> [reason] | list [status] | publish [--count 3] [--at ISO,ISO] | sync | slots | report [weekly] | metrics <id> views=.. likes=.. | audition "text" | voices */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ROOT, OUT, PUBLIC, writeJson } from "./env";
import { FORMATS } from "./config";
import { fetchAllQuestions, cacheImage } from "./supabase";
import type { VideoRow } from "./ledger";
import { pickSet, pickable, buildPicks } from "./pick";
import { speakable, speakableDry, hooks, hooksDry } from "./text";
import { tts, dryClip, audition, listVoices } from "./voice";
import { buildPlan, countdownSeconds, ctaIndex, CTA_LINE } from "./plan";
import { renderPlan } from "./render";
import { execFileSync } from "node:child_process";
import { ledgerEnabled, upsertVideo, updateVideo, listVideos, uploadFile } from "./ledger";
import { postizEnabled, publishApproved, syncScheduled, nextSlots } from "./publish";
import { qaPassed } from "./qa";
import { qaStep, autoApprove, retract } from "./gate";
import { report } from "./report";
import { chooseAngle } from "./text";
import { POSTING, THEMES } from "./config";
import type { DisplayQuestion, Lang, Question } from "./types";

async function make(fmt: string, lang: Lang, state: string | undefined, dry: boolean) {
  if (!FORMATS[fmt]) throw new Error(`Unknown format ${fmt}`);
  const id = `${fmt}_${lang}_${Date.now()}`;
  const work = path.join(OUT, id); fs.mkdirSync(work, { recursive: true });

  let qs: Question[]; let ledgerRows: VideoRow[] = []; let bank: Question[] = [];
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
    bank = await fetchAllQuestions();
    qs = pickSet(bank, fmt, lang, state, undefined, remoteUsed);
  }

  // pick-the-sign: each target becomes "Which sign means X?" with its sign and two other signs as picture answers.
  // The synthetic question keeps the target id (QA content check) and a cache id that includes the options.
  let pickImages: Record<string, string>[] | null = null;
  if (FORMATS[fmt].pickSign && !dry) {
    const es = lang === "es";
    const picks = buildPicks(qs, bank.filter(pickable).map((q) => ({ ...q, ...(es && q.answers_es ? { answers: q.answers_es } : {}) })));
    pickImages = await Promise.all(picks.map(async (p) => Object.fromEntries(await Promise.all(Object.entries(p.options).map(async ([L, o]) => [L, await cacheImage(o.image_url!, o.id)] as const)))));
    qs = picks.map((p) => ({ ...p.target, question_text: es ? `¿Qué señal significa "${p.meaning}"?` : `Which sign means "${p.meaning}"?`,
      answers: Object.fromEntries(Object.entries(p.options).map(([L, o]) => [L, o.answers[o.correct_answer]])), correct_answer: p.correct, image_url: null }));
  }
  const speakId = (q: Question, i: number) => pickImages ? { ...q, id: `pick_${q.id.slice(0, 8)}_${Object.values(pickImages[i]).map((p) => path.basename(p).slice(0, 8)).join("-")}_${q.correct_answer}` } : q;
  const speak = await Promise.all(qs.map((q, i) => (dry ? speakableDry(q) : speakable(speakId(q, i), lang))));
  // link-in-bio call to action on one reveal in the middle (decision 2026-11-18: the bio link is where the books sell)
  const ci = ctaIndex(qs.length);
  if (ci >= 0) speak[ci] = { ...speak[ci], reveal_vo: `${speak[ci].reveal_vo} ${CTA_LINE[lang]}` };
  const display: DisplayQuestion[] = await Promise.all(qs.map(async (q, i) => ({
    id: q.id, question_text: q.question_text, answers: pickImages ? Object.fromEntries(Object.keys(pickImages[i]).map((L) => [L, ""])) : speak[i].answers_display,
    correct_answer: q.correct_answer, explanation: q.explanation ?? "",
    image: q.image_url ? (dry ? "cache/images/sample_sign.png" : await cacheImage(q.image_url, q.id)) : null,
    ...(pickImages ? { answerImages: pickImages[i] } : {}),
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
  // question-first formats show the hook as a banner and never play the hook voice line
  const ah = FORMATS[fmt].opening === "question" || dry ? dryClip(h.vo_line) : await tts(h.vo_line, lang);
  const ao = FORMATS[fmt].outro === false ? dryClip("") : dry ? dryClip(h.outro_vo) : await tts(h.outro_vo, lang);

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

async function approve(id: string, force: boolean) {
  const row = (await listVideos(null, 200)).find((x) => x.id === id);
  if (!row) throw new Error(`no video ${id}`);
  if (!qaPassed(row) && !force) throw new Error(`${id} has no passing QA for its current file: run \`qa ${id}\` first (or --force)`);
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
  options: { format: { type: "string", default: "pass5" }, lang: { type: "string", default: "en" }, count: { type: "string", default: "1" }, state: { type: "string" }, weekly: { type: "boolean", default: false }, now: { type: "boolean", default: false }, at: { type: "string" }, force: { type: "boolean", default: false }, "no-fix": { type: "boolean", default: false } },
});
const cmd = positionals[0] ?? "dry";
const lang = values.lang as Lang;
try {
  if (cmd === "dry") await make(values.format!, lang, values.state, true);
  else if (cmd === "make") for (let i = 0; i < parseInt(values.count!, 10); i++) await make(values.format!, lang, values.state, false);
  else if (cmd === "audition") await audition(positionals[1] ?? `Most people fail this one. Can you pass the ${new Date().getFullYear() + 1} DMV test? Question one. What does this sign mean?`);
  else if (cmd === "replan") await replan(positionals[1]);
  else if (cmd === "approve") await approve(positionals[1], values.force === true);
  else if (cmd === "qa") { const r = await qaStep(positionals.slice(1), { fix: values["no-fix"] !== true }); console.log(`qa: ${r.pass} pass, ${r.held} held`); }
  else if (cmd === "auto-approve") await autoApprove();
  else if (cmd === "retract") await retract(positionals[1], positionals.slice(2).join(" ") || "manual");
  else if (cmd === "report") console.log(await report(positionals[1] === "weekly" || values.weekly === true));
  else if (cmd === "metrics") await setMetrics(positionals[1], positionals.slice(2));
  else if (cmd === "publish") { if (!postizEnabled()) console.log("publish: POSTIZ_API_KEY not set, skipping"); else await publishApproved(parseInt(values.count!, 10) || 3, { firstNow: values.now === true, at: values.at ? String(values.at).split(",").map((t) => { const d = new Date(t); if (isNaN(+d) || +d < Date.now() + 30 * 60e3) throw new Error(`--at ${t}: not a time at least 30 min ahead`); return d; }) : undefined }); }
  else if (cmd === "sync") { if (!postizEnabled()) console.log("sync: POSTIZ_API_KEY not set, skipping"); else await syncScheduled(); }
  else if (cmd === "slots") for (const s of nextSlots([], parseInt(values.count!, 10) || 7)) console.log(s.toISOString(), new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(s));
  else if (cmd === "list") await list(positionals[1]);
  else if (cmd === "held") { // ready videos from the last 36 h whose current file has no passing QA (used by the nightly remake loop)
    const rows = (await listVideos("ready", 100)).filter((v) => !qaPassed(v) && Date.now() - new Date(v.created_at ?? 0).getTime() < 36 * 3600e3);
    console.log(`HELD_JSON ${JSON.stringify(rows.map((v) => ({ id: v.id, format: v.format, lang: v.lang, error: v.error })))}`);
  }
  else if (cmd === "skip") { await updateVideo(positionals[1], { status: "skipped", approved: false, error: positionals.slice(2).join(" ") || "skipped" }); console.log(`skipped ${positionals[1]}`); }
  else if (cmd === "voices") for (const v of await listVoices()) console.log(v.voice_id, v.name, JSON.stringify(v.labels));
  else throw new Error(`Unknown command ${cmd}`);
} catch (e) { console.error((e as Error).message); process.exit(1); }
