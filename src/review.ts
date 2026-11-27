/** Review of what actually went out (decision 2026-11-26: the owner does not watch the videos, so every posted video
 *  is checked once after it posts). Pre-publish QA (src/qa.ts) looks at 3 frames; this looks at the whole video:
 *  frames every 2 s (6 s for long tests) in contact sheets, plus a transcript of the voice, against the bank's answers.
 *  The result goes on the row as metrics.review = { at, ok, critical, issues[] }; the watchdog alerts on critical
 *  issues and the weekly report lists them. Read only on everything else: it never changes status or posts. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { BRAND, FORMATS } from "./config";
import { keyOrPlaceholder, OUT } from "./env";
import { listVideos, updateVideo, type VideoRow } from "./ledger";
import { fetchAllQuestions } from "./supabase";
import { QA } from "./qa";
import { retract } from "./gate";
import type { Question } from "./types";

type Issue = { severity: "critical" | "minor"; at: string; what: string };
export type Review = { at: string; ok: boolean; critical: number; issues: Issue[]; frames: number };

const PER_SHEET = 12;

function seconds(file: string): number {
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim());
}

async function transcribe(file: string, dir: string): Promise<string> {
  const mp3 = path.join(dir, "audio.mp3");
  execFileSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-y", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", mp3]);
  const form = new FormData();
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("file", new Blob([fs.readFileSync(mp3)], { type: "audio/mpeg" }), "audio.mp3");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${keyOrPlaceholder("OPENAI_API_KEY")}` }, body: form });
  if (!r.ok) throw new Error(`transcribe ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return String(((await r.json()) as { text?: string }).text ?? "");
}

function questionLines(v: VideoRow, bank: Map<string, Question>): string {
  const ids = (v.question_ids ?? []) as string[]; const pick = !!FORMATS[v.format]?.pickSign;
  const m = (v.metrics as { letters?: string[]; reveals?: string[] } | null) ?? {};
  return ids.map((id, i) => {
    const q = bank.get(id);
    if (!q) return `${i + 1}. (question ${id.slice(0, 8)} not in the bank)`;
    const right = q.answers[q.correct_answer];
    const script = m.reveals?.[i] ? ` | scripted reveal voice: "${m.reveals[i]}"` : "";
    if (pick) return `${i + 1}. "Which sign means "${right}"?" Three sign pictures as answers; the correct one is the sign that means "${right}"${m.letters?.[i] ? `, shown as letter ${m.letters[i]}` : " (its letter is random)"}${script}.`;
    return `${i + 1}. ${q.question_text} | ${Object.entries(q.answers).map(([L, a]) => `${L}) ${a}`).join(" | ")} | correct in the bank: ${q.correct_answer}) ${right}${script}`;
  }).join("\n");
}

export async function reviewVideo(v: VideoRow, bank: Map<string, Question>): Promise<Review> {
  const dir = path.join(OUT, "review", v.id); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "video.mp4");
  if (!v.video_url) throw new Error("no video_url");
  const r = await fetch(v.video_url); if (!r.ok) throw new Error(`download ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  const dur = seconds(file);
  const every = dur > 120 ? 6 : 2;
  execFileSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-y", "-i", file, "-vf", `fps=1/${every},scale=270:-1,tile=4x3`, path.join(dir, "sheet_%02d.jpg")]);
  const sheets = fs.readdirSync(dir).filter((f) => f.startsWith("sheet_")).sort().slice(0, 8);
  const transcript = await transcribe(file, dir).catch((e) => `(transcript unavailable: ${(e as Error).message})`);
  const content = [
    { type: "text", text: `You review a vertical driving-test quiz video that is ALREADY POSTED on TikTok and Instagram (brand "${BRAND.name}", site ${BRAND.url}).
Format: ${v.format} (${FORMATS[v.format]?.label ?? ""}), ${dur.toFixed(0)} s. Each image is a contact sheet of ${PER_SHEET} frames, left to right then top to bottom, one frame every ${every} s; sheet k (from 1) frame i (from 1) is at about ${every} * ((k - 1) * ${PER_SHEET} + i - 1) s.
Not problems: the site shown in capitals (THEDRIVINGSCHOOL.APP) or spoken as "the driving school dot app" is correct; answer texts shown shorter than the bank wording are fine when the meaning is the same; the transcript comes from speech recognition and often mishears single letters (E, I, see, be for C or B, "Course A" for "of course, A"): when the scripted reveal voice is given, trust the script for what was said; only report a spoken letter as wrong when it differs from the highlighted answer in the script or, with no script, when the spoken reason itself contradicts the highlighted answer.
On a question screen the four answers show (pictures in a "Which sign means" question) with a countdown ring; then the screen dims and the reveal highlights the correct answer and shows an explanation. The yellow words in the footer are live captions of the voice, a few words at a time: fragments there are expected. Capital letters in headlines are styling. Ignore animation in progress and design taste.
Questions, in order, with the bank's correct answer:
${questionLines(v, bank)}
Voice transcript:
${transcript.slice(0, 6000)}
Caption posted: ${(v.caption ?? "").slice(0, 400)}

Find real problems a viewer would notice or that make the video wrong:
CRITICAL: the reveal highlights or the voice says a different answer than the bank's correct one; a question or answer shown does not match the bank; the explanation contradicts the answer; a sign picture is missing or clearly the wrong sign; text cut off or overlapping so it cannot be read; blank or broken frames; the voice reads something that gives the answer away before the reveal; the site named wrongly (it must be ${BRAND.url}); a year or date anywhere.
MINOR: typos, awkward voice wording, a timer that looks too short to read, anything else odd.
Return JSON {"issues": [{"severity": "critical" | "minor", "at": "<about N s or question N>", "what": "<short description>"}]}. Empty list if the video is fine. Do not invent problems.` },
    ...sheets.map((s) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(path.join(dir, s)).toString("base64")}` } })),
  ];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${keyOrPlaceholder("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: QA.visionModel, response_format: { type: "json_object" }, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error(`review vision ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = JSON.parse(((await res.json()) as any).choices[0].message.content);
  const issues: Issue[] = (Array.isArray(j.issues) ? j.issues : []).map((i: any) => ({ severity: i.severity === "critical" ? "critical" : "minor", at: String(i.at ?? ""), what: String(i.what ?? "").slice(0, 300) }));
  const critical = issues.filter((i) => i.severity === "critical").length;
  return { at: new Date().toISOString(), ok: critical === 0, critical, issues, frames: sheets.length * PER_SHEET };
}

/** Pre-post check (decision 2026-11-26): approved and scheduled videos of the next 48 h are reviewed before they post.
 *  A critical issue that a second review confirms takes the video back (retract: its Postiz posts are cancelled), and
 *  the daily run then fills the slot from the buffer. One review is kept on the row (metrics.review with pre: true). */
export async function reviewUpcoming(hours = 48): Promise<void> {
  const until = Date.now() + hours * 3600e3;
  const rows = [...(await listVideos("scheduled", 100)), ...(await listVideos("approved", 100))]
    .filter((v) => v.video_url && (!v.scheduled_at || new Date(v.scheduled_at).getTime() < until) && !(v.metrics as { review?: Review } | null)?.review);
  if (!rows.length) { console.log("review upcoming: nothing new"); console.log("UPCOMING_JSON []"); return; }
  const bank = new Map((await fetchAllQuestions()).map((q) => [q.id, q]));
  const out: { id: string; format: string; retracted: boolean; issues: Issue[] }[] = [];
  for (const v of rows) {
    try {
      let rv = await reviewVideo(v, bank);
      let pulled = false;
      if (!rv.ok) {
        const second = await reviewVideo(v, bank); // the vision check is the flaky part: both looks must agree
        if (!second.ok) { pulled = true; await retract(v.id, `pre-post review: ${rv.issues.filter((i) => i.severity === "critical").map((i) => `${i.at}: ${i.what}`).join("; ").slice(0, 400)}`); }
        else rv = { ...second, issues: [...second.issues, ...rv.issues.filter((i) => i.severity === "critical").map((i) => ({ ...i, severity: "minor" as const, what: `not confirmed by a 2nd look: ${i.what}` }))] };
      }
      const fresh = (await listVideos(null, 300)).find((x) => x.id === v.id) ?? v;
      await updateVideo(v.id, { metrics: { ...((fresh.metrics as object) ?? {}), review: { ...rv, pre: true } } });
      out.push({ id: v.id, format: v.format, retracted: pulled, issues: rv.issues });
      console.log(`review upcoming ${v.id}: ${pulled ? "RETRACTED" : "ok"}${rv.issues.length ? `: ${rv.issues.map((i) => `[${i.severity} ${i.at}] ${i.what}`).join("; ")}` : ""}`);
    } catch (e) { console.log(`review upcoming ${v.id}: could not review: ${(e as Error).message.slice(0, 200)}`); }
  }
  console.log(`UPCOMING_JSON ${JSON.stringify(out)}`);
}

/** Review posted videos from the last `days` that have no review yet (or all of them with force). */
export async function reviewPosted(days = 8, force = false): Promise<void> {
  const rows = (await listVideos("posted", 200)).filter((v) => v.video_url && Date.now() - new Date(v.posted_at ?? v.scheduled_at ?? 0).getTime() < days * 86400e3
    && (force || !(v.metrics as { review?: Review } | null)?.review));
  if (!rows.length) { console.log("review: nothing new to review"); console.log("REVIEW_JSON []"); return; }
  const bank = new Map((await fetchAllQuestions()).map((q) => [q.id, q]));
  const out: { id: string; format: string; ok: boolean; critical: number; issues: Issue[] }[] = [];
  for (const v of rows) {
    try {
      const rv = await reviewVideo(v, bank);
      await updateVideo(v.id, { metrics: { ...((v.metrics as object) ?? {}), review: rv } });
      out.push({ id: v.id, format: v.format, ok: rv.ok, critical: rv.critical, issues: rv.issues });
      console.log(`review ${v.id}: ${rv.ok ? "ok" : `${rv.critical} critical`}${rv.issues.length ? `: ${rv.issues.map((i) => `[${i.severity} ${i.at}] ${i.what}`).join("; ")}` : ""}`);
    } catch (e) { console.log(`review ${v.id}: could not review: ${(e as Error).message.slice(0, 200)}`); }
  }
  console.log(`REVIEW_JSON ${JSON.stringify(out)}`);
}
