/** Pre-render checks (2026-11-21). A held video used to cost a full render plus a fresh remake with new voice: the
 *  2026-11-21 nightly made 9 videos for 3 slots. These checks look at still frames first, while a fix is still free:
 *    questions  draft plan with estimated voice timing, before any voice is bought: every question and reveal screen
 *    cover      the real plan, before the full render: cover, one question, outro
 *  A failed vision call never blocks a render; the full QA after the render still runs. */
import { buildPlan } from "./plan";
import { renderStills } from "./render";
import { visionFrames } from "./qa";
import { dryClip } from "./voice";
import type { DisplayQuestion, Hook, Lang, Plan, Speak } from "./types";

const DRAFT_HOOK: Hook = { card1: "Can you pass this *driving test*?", card2: "Questions ahead.", vo_line: "", outro_vo: "", caption: "", hashtags: [] };

/** Indices of questions whose question or reveal screen has a layout problem. */
export async function preflightQuestions(id: string, fmt: string, lang: Lang, display: DisplayQuestion[], speak: Speak[], dir: string): Promise<number[]> {
  try {
    const plan = buildPlan({ id: `${id}_draft`, format: fmt, lang, questions: display, hook: DRAFT_HOOK,
      audio: { hook: dryClip(""), outro: dryClip(""), q: speak.map((s) => dryClip(s.question_vo)), r: speak.map((s) => dryClip(s.reveal_vo)) } });
    const items: { label: string; frame: number }[] = [];
    plan.questions.forEach((s, i) => {
      items.push({ label: `q${i + 1}`, frame: s.questionAt + Math.min(s.questionFrames - 1, Math.round(1.5 * plan.fps)) });
      items.push({ label: `r${i + 1}`, frame: s.revealAt + Math.max(0, s.revealFrames - 3) });
    });
    const files = await renderStills(plan, items.map((x) => x.frame), dir);
    const res = await visionFrames(items.map((x, k) => ({ label: x.label, path: files[k] })));
    if (res.issues.length) console.log(`preflight: ${res.issues.join("; ")}`);
    const bad = [...new Set(res.bad.map((l) => parseInt(l.slice(1), 10) - 1).filter((i) => i >= 0 && i < display.length))];
    console.log(`preflight questions: ${bad.length ? `bad ${bad.map((i) => i + 1).join(", ")}` : "ok"} (${items.length} stills)`);
    return bad;
  } catch (e) {
    console.log(`preflight questions skipped: ${(e as Error).message.slice(0, 160)}`);
    return [];
  }
}

/** Labels ("cover", "question", "outro") with a problem on the real plan, before the full render. */
export async function preflightCover(plan: Plan, dir: string): Promise<string[]> {
  try {
    const items: { label: string; frame: number }[] = [{ label: "cover", frame: 0 }];
    const q = plan.questions[Math.min(1, plan.questions.length - 1)];
    items.push({ label: "question", frame: q.questionAt + Math.min(q.questionFrames - 1, Math.round(2 * plan.fps)) });
    if (plan.outro.frames > 0) items.push({ label: "outro", frame: plan.outro.at + plan.outro.frames - 5 });
    const files = await renderStills(plan, items.map((x) => x.frame), dir);
    const res = await visionFrames(items.map((x, k) => ({ label: x.label, path: files[k] })), plan.hook.card1);
    if (res.issues.length) console.log(`preflight: ${res.issues.join("; ")}`);
    console.log(`preflight cover: ${res.bad.length ? `bad ${res.bad.join(", ")}` : "ok"}`);
    return res.bad;
  } catch (e) {
    console.log(`preflight cover skipped: ${(e as Error).message.slice(0, 160)}`);
    return [];
  }
}
