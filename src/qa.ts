/** Quality gate: nothing is approved or published unless its latest file passed every check below.
 *  The result is stored on the ledger row (metrics.qa) together with the exact video_url it checked, so a replaced
 *  file must pass again. Status stays "ready" while a video is held; the report lists the reasons.
 *
 *  Checklist
 *   format    not a test format (QA.blockFormats)
 *   file      downloads; 1080x1920, 30 fps, H.264 + AAC; length within the format's bounds
 *   audio     not silent (mean volume), not clipping (peak)
 *   frames    cover (frame 0), a question frame and the outro are not blank
 *   cover     frame 0 shows card 1 as written, with no markup, cut-off or garbled text (vision model)
 *   layout    question and outro frames: nothing cut off, overlapping or unreadable (vision model)
 *   text      card 1 has one highlight and says driving test or DMV; no asterisks anywhere; no year in any
 *             visible or posted text; caption present; 3 to 8 hashtags; post text within platform limits
 *   content   every question exists in the bank, none in an excluded category, count matches the format
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { EXCLUDED_CATEGORIES, FORMATS } from "./config";
import { keyOrPlaceholder, OUT } from "./env";
import { fetchAllQuestions } from "./supabase";
import type { VideoRow } from "./ledger";

export const QA = {
  blockFormats: ["single"],
  minSeconds: 15,
  maxSeconds: (format: string) => (format === "classic30" || format === "full" ? 900 : 240),
  minMeanDb: -35, maxPeakDb: -0.1,
  visionModel: process.env.QA_VISION_MODEL || "gpt-5.4-2026-03-05",
};

export type QaCheck = { name: string; ok: boolean; detail: string };
export type QaResult = { pass: boolean; at: string; video_url: string; checks: QaCheck[]; fixable: string[] };

const YEAR = /\b(19|20)\d{2}\b/;
const visible = (s: string) => s.replace(/\*/g, "");

/** Pure text checks on the hook, caption and hashtags (also used before rendering). */
export function textChecks(v: Pick<VideoRow, "hook" | "caption" | "hashtags">): QaCheck[] {
  const h = (v.hook ?? {}) as Record<string, string>;
  const card1 = h.card1 ?? "";
  const spans = card1.match(/\*[^*]+\*/g) ?? [];
  const stray = card1.replace(/\*[^*]+\*/, "").includes("*");
  const tags = (v.hashtags ?? []).map(String);
  const post = `${v.caption ?? ""}\n\n${tags.join(" ")}`;
  const others = ["card2", "vo_line", "outro_vo"].map((k) => h[k] ?? "");
  return [
    { name: "text:cover-highlight", ok: spans.length === 1 && !stray, detail: spans.length === 1 && !stray ? "" : `card 1 needs exactly one *highlight* and no other asterisks: "${card1}"` },
    { name: "text:cover-words", ok: /driving test|dmv/i.test(card1) && visible(card1).split(/\s+/).length <= 8, detail: `card 1 must say driving test or DMV in at most 8 words: "${visible(card1)}"` },
    { name: "text:no-asterisks", ok: ![v.caption ?? "", ...others, ...tags].some((s) => s.includes("*")), detail: "asterisks in caption, card 2, voice lines or hashtags" },
    { name: "text:no-year", ok: ![card1, v.caption ?? "", ...others, ...tags].some((s) => YEAR.test(s)), detail: "a year appears in visible or posted text" },
    { name: "text:caption", ok: (v.caption ?? "").trim().length >= 10, detail: "caption missing or too short" },
    { name: "text:hashtags", ok: tags.length >= 3 && tags.length <= 8 && tags.every((t) => /^#?[A-Za-z0-9_]+$/.test(t)), detail: `need 3 to 8 single-word hashtags: ${tags.join(" ")}` },
    { name: "text:length", ok: post.length <= 2000, detail: `post text ${post.length} chars (limit 2000)` },
  ].map((c) => (c.ok ? { ...c, detail: "" } : c));
}

function probe(file: string) {
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { encoding: "utf8" }));
  const vs = j.streams.find((s: any) => s.codec_type === "video"); const as = j.streams.find((s: any) => s.codec_type === "audio");
  return { w: vs?.width, h: vs?.height, fps: vs?.r_frame_rate, vcodec: vs?.codec_name, acodec: as?.codec_name, seconds: Number(j.format.duration) };
}
function frame(file: string, at: number, out: string) {
  execFileSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-y", "-ss", String(at), "-i", file, "-frames:v", "1", "-vf", "scale=540:-1", out]);
  return out;
}
async function vision(images: string[], card1: string): Promise<{ cover_ok: boolean; layout_ok: boolean; issues: string[] }> {
  const content = [
    { type: "text", text: `Frames from a vertical driving-test quiz video, in order: 1) the cover (frame 0), 2) a question screen, 3) the outro.
The cover headline must read exactly (case-insensitive, one part highlighted in yellow): "${visible(card1)}".
Check: is the cover headline exactly that, fully visible, with no asterisks, markup or garbled characters? On every frame: is any text cut off at an edge, overlapping other text, unreadable or broken; is any image broken or missing; does anything look like a rendering error?
Ignore animation in progress (slight tilt or scale) and do not judge design taste.
Return JSON {"cover_ok": boolean, "layout_ok": boolean, "issues": [short strings]}.` },
    ...images.map((p) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${fs.readFileSync(p).toString("base64")}` } })),
  ];
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${keyOrPlaceholder("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: QA.visionModel, response_format: { type: "json_object" }, messages: [{ role: "user", content }] }),
  });
  if (!r.ok) throw new Error(`vision ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return JSON.parse(((await r.json()) as any).choices[0].message.content);
}

export async function qaVideo(v: VideoRow): Promise<QaResult> {
  const checks: QaCheck[] = [];
  const add = (name: string, ok: boolean, detail = "") => checks.push({ name, ok, detail: ok ? "" : detail });
  add("format", !QA.blockFormats.includes(v.format) && !!FORMATS[v.format], `format ${v.format} is a test format or unknown`);
  checks.push(...textChecks(v));

  // content
  const fmt = FORMATS[v.format]; const ids = (v.question_ids ?? []) as string[];
  try {
    const bank = new Map((await fetchAllQuestions()).map((q) => [q.id, q]));
    const missing = ids.filter((id) => !bank.has(id));
    const excluded = ids.filter((id) => EXCLUDED_CATEGORIES.includes(bank.get(id)?.category ?? ""));
    add("content:questions", missing.length === 0 && excluded.length === 0, `missing ${missing.length}, excluded category ${excluded.length}`);
    if (typeof fmt?.size === "number") add("content:count", ids.length === fmt.size, `${ids.length} questions, format needs ${fmt.size}`);
  } catch (e) { add("content:questions", false, `bank unavailable: ${(e as Error).message.slice(0, 100)}`); }

  // file
  const dir = path.join(OUT, "qa", v.id); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "video.mp4");
  try {
    if (!v.video_url) throw new Error("no video_url");
    const r = await fetch(v.video_url); if (!r.ok) throw new Error(`download ${r.status}`);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    const p = probe(file);
    add("file:format", p.w === 1080 && p.h === 1920 && p.fps === "30/1" && p.vcodec === "h264" && p.acodec === "aac", `${p.w}x${p.h} ${p.fps} ${p.vcodec}/${p.acodec}`);
    add("file:length", p.seconds >= QA.minSeconds && p.seconds <= QA.maxSeconds(v.format), `${p.seconds.toFixed(1)} s (allowed ${QA.minSeconds} to ${QA.maxSeconds(v.format)})`);
    const vol = execFileSync("sh", ["-c", `ffmpeg -nostdin -hide_banner -i "${file}" -vn -af volumedetect -f null - 2>&1`], { encoding: "utf8" });
    const mean = Number(/mean_volume: (-?[\d.]+)/.exec(vol)?.[1] ?? -99), peak = Number(/max_volume: (-?[\d.]+)/.exec(vol)?.[1] ?? 0);
    add("audio", mean >= QA.minMeanDb && peak <= QA.maxPeakDb, `mean ${mean} dB, peak ${peak} dB`);
    const frames = [frame(file, 0, path.join(dir, "cover.png")), frame(file, Math.max(4, p.seconds * 0.3), path.join(dir, "question.png")), frame(file, Math.max(0, p.seconds - 1.2), path.join(dir, "outro.png"))];
    const blank = frames.filter((f) => {
      const s = execFileSync("sh", ["-c", `ffmpeg -nostdin -hide_banner -i "${f}" -vf signalstats,metadata=print -f null - 2>&1`], { encoding: "utf8" });
      const lo = Number(/YMIN=(\d+)/.exec(s)?.[1] ?? 0), hi = Number(/YMAX=(\d+)/.exec(s)?.[1] ?? 0);
      return hi - lo < 40;
    });
    add("frames", blank.length === 0, `blank frame(s): ${blank.map((f) => path.basename(f)).join(", ")}`);
    try {
      const vr = await vision(frames, (v.hook as any)?.card1 ?? "");
      add("cover", !!vr.cover_ok, `cover: ${vr.issues.join("; ")}`);
      add("layout", !!vr.layout_ok, `layout: ${vr.issues.join("; ")}`);
    } catch (e) { add("cover", false, `vision check unavailable: ${(e as Error).message.slice(0, 120)}`); }
  } catch (e) { add("file", false, (e as Error).message.slice(0, 160)); }

  // checks a script can repair without a human: card 1 text (cover re-render) and caption or hashtags
  const failed = checks.filter((c) => !c.ok).map((c) => c.name);
  const fixable = failed.every((n) => n.startsWith("text:") || n === "cover") ? failed : [];
  return { pass: failed.length === 0, at: new Date().toISOString(), video_url: v.video_url ?? "", checks, fixable };
}

/** True when the row carries a passing QA result for its current file. */
export const qaPassed = (v: VideoRow) => {
  const q = (v.metrics as { qa?: QaResult } | null)?.qa;
  return !!q && q.pass && q.video_url === v.video_url;
};
export const qaSummary = (q: QaResult) => q.pass ? "QA pass" : `QA held: ${q.checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.detail})`).join("; ")}`;
