/** Pure timeline builder (no Node imports): frames for every scene plus audio cues. */
import { BRAND, FORMATS, READING, SFX, VIDEO } from "./config";
import type { Clip, Cue, DisplayQuestion, Hook, Lang, Plan, QuestionSegment } from "./types";

const fps = VIDEO.fps;
const f = (sec: number) => Math.round(sec * fps);

export type PlanInput = {
  id: string; format: string; lang: Lang; theme?: string;
  questions: DisplayQuestion[];
  hook: Hook;
  audio: { hook: Clip; outro: Clip; q: Clip[]; r: Clip[] };
};

/** Seconds a viewer needs to read the question and the four answers (plus a beat to think). */
export function readingSeconds(q: Pick<DisplayQuestion, "question_text" | "answers" | "image">): number {
  const words = [q.question_text, ...Object.values(q.answers)].join(" ").trim().split(/\s+/).filter(Boolean).length;
  const s = Math.ceil(words / READING.wordsPerSecond + READING.thinkSeconds + (q.image ? READING.imageSeconds : 0));
  return Math.min(READING.maxSeconds, Math.max(READING.minSeconds, s));
}

/** Countdown length for one question: reading time capped by the format's maxCountdown (short formats stay in the
 *  30 to 90 s band, decision 2026-11-18), never shorter than the format's think time or the voice. */
export function countdownSeconds(fmtId: string, q: Pick<DisplayQuestion, "question_text" | "answers" | "image">, voice: Clip): number {
  const fmt = FORMATS[fmtId];
  const reading = Math.min(readingSeconds(q), fmt.maxCountdown ?? Infinity);
  return Math.max(fmt.think, reading, Math.ceil(voice.speechEnd + VIDEO.voiceMarginSeconds));
}

/** Link-in-bio call to action (decision 2026-11-18): spoken on one reveal about halfway through, with an on-screen pill.
 *  Viewers rarely reach the outro (TikTok full-watch rate 0 to 2 percent), so the CTA cannot live only there. */
export const CTA_LINE: Record<Lang, string> = {
  en: `By the way, take the full test for your state free at ${BRAND.urlSpoken}.`,
  es: `Por cierto, haz el examen completo de tu estado gratis en ${BRAND.urlSpoken}.`,
};
export const CTA_PILL: Record<Lang, string> = { en: `FULL TEST FOR YOUR STATE: ${BRAND.url.toUpperCase()}`, es: `EXAMEN DE TU ESTADO: ${BRAND.url.toUpperCase()}` };
/** Which question's reveal carries the CTA: after about a third of the set; none for a single question. */
export function ctaIndex(n: number): number { return n < 3 ? -1 : Math.max(0, Math.floor(n / 3) - 1 + (n >= 5 ? 1 : 0)); }

/** Explanation shown on the reveal screen (decision 2026-11-18): never a sentence cut off with an ellipsis.
 *  Full text if it fits, else its first sentence, else the reveal voice phrase (one complete phrase, max 10 words). */
export function fitExplanation(explanation: string, revealVoText: string, maxChars = EXPLANATION_MAX_CHARS): string {
  const full = explanation.trim();
  if (full.length <= maxChars) return full;
  const first = full.split(/(?<=[.!?])\s+/)[0].trim();
  if (first.length <= maxChars) return first;
  const phrase = revealVoText.replace(/^\s*(The answer is|La respuesta es)( la)? [A-D]\.\s*/i, "").replace(/\s*(By the way|Por cierto),.*$/i, "").trim();
  if (!phrase) return "";
  const p = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  return /[.!?]$/.test(p) ? p : `${p}.`;
}
/** about 3 lines of the explanation box at .92rem in the 360 px layout */
export const EXPLANATION_MAX_CHARS = 125;
export const EXPLANATION_MAX_CHARS_VISUAL = 165;

export function buildPlan(inp: PlanInput): Plan {
  const { questions, hook, audio } = inp;
  const cues: Cue[] = [];
  let t = 0;
  // question-first opening (test 2026-11-18): no title cards, the hook rides on question 1 as a banner
  const questionFirst = FORMATS[inp.format].opening === "question";
  const hook1Frames = questionFirst ? 0 : f(VIDEO.hook1Seconds);
  const hook2Frames = questionFirst ? 0 : Math.max(f(VIDEO.hook2Seconds), f(audio.hook.duration - VIDEO.hook1Seconds + 0.3));
  const bannerFrames = questionFirst ? f(VIDEO.bannerSeconds) : 0;
  t += hook1Frames + hook2Frames;

  const segs: QuestionSegment[] = questions.map((q0, idx) => {
    const vo = audio.q[idx], revealVo = audio.r[idx];
    // the picture + 2x2 layout (same rule as QuestionScene) has room for a 4th line
    const visual = !!q0.image && Object.values(q0.answers).every((a) => a.length <= 22);
    const q = { ...q0, explanation: fitExplanation(q0.explanation ?? "", revealVo.text, visual ? EXPLANATION_MAX_CHARS_VISUAL : EXPLANATION_MAX_CHARS) };
    // question 1 under the banner gets the banner time on top, so the viewer still has the full reading time
    const secs = countdownSeconds(inp.format, q, vo) + (idx === 0 && questionFirst ? Math.ceil(VIDEO.bannerSeconds) : 0);
    const questionAt = t, questionFrames = secs * fps;
    cues.push({ kind: "whoosh", at: questionAt });
    for (let s = Math.min(3, secs - 1); s >= 1; s--) cues.push({ kind: "tick", at: questionAt + (secs - s) * fps });
    const dimAt = questionAt + questionFrames, dimFrames = f(VIDEO.dimSeconds);
    const revealAt = dimAt + dimFrames;
    const revealFrames = Math.max(f(2), f(revealVo.speechEnd + VIDEO.revealTailSeconds));
    cues.push({ kind: "ding", at: revealAt });
    t = revealAt + revealFrames;
    return { idx, n: questions.length, q, countdownSeconds: secs, cta: idx === ctaIndex(questions.length), questionAt, questionFrames, dimAt, dimFrames, revealAt, revealFrames, vo, revealVo };
  });

  // outro: false (loop formats) ends on the last reveal; the CTA lives mid-video and in the caption
  const outroFrames = FORMATS[inp.format].outro === false ? 0 : Math.max(f(VIDEO.outroSeconds), f(audio.outro.duration + 0.5));
  const outro = { at: t, frames: outroFrames, vo: audio.outro };
  t += outroFrames;

  const es = inp.lang === "es";
  return {
    id: inp.id, format: inp.format, lang: inp.lang, theme: inp.theme ?? "light", fps, width: VIDEO.width, height: VIDEO.height, durationInFrames: t,
    brand: BRAND,
    hook: {
      card1: hook.card1, card2: hook.card2,
      sub: es ? "Practica para el examen de manejo" : "Driving test practice",
      pill: es ? "VAMOS" : "LET'S GO", hook1Frames, hook2Frames, vo: audio.hook, bannerFrames,
    },
    questions: segs, outro, cues,
    music: { src: SFX.musicPath || null, gain: SFX.musicGain },
    meta: { caption: hook.caption, hashtags: hook.hashtags, questionIds: questions.map((q) => q.id), totalSeconds: Math.round((t / fps) * 10) / 10 },
  };
}
