/** Pure timeline builder (no Node imports): frames for every scene plus audio cues. */
import { BRAND, FORMATS, SFX, VIDEO } from "./config";
import type { Clip, Cue, DisplayQuestion, Hook, Lang, Plan, QuestionSegment } from "./types";

const fps = VIDEO.fps;
const f = (sec: number) => Math.round(sec * fps);

export type PlanInput = {
  id: string; format: string; lang: Lang;
  questions: DisplayQuestion[];
  hook: Hook;
  audio: { hook: Clip; outro: Clip; q: Clip[]; r: Clip[] };
};

/** Countdown length for one question: voice plus a margin, never shorter than the format's think time. */
export function countdownSeconds(fmtId: string, voice: Clip): number {
  const think = FORMATS[fmtId].think;
  return Math.max(think, Math.ceil(voice.speechEnd + VIDEO.voiceMarginSeconds));
}

export function buildPlan(inp: PlanInput): Plan {
  const { questions, hook, audio } = inp;
  const cues: Cue[] = [];
  let t = 0;
  const hook1Frames = f(VIDEO.hook1Seconds);
  const hook2Frames = Math.max(f(VIDEO.hook2Seconds), f(audio.hook.duration - VIDEO.hook1Seconds + 0.3));
  t += hook1Frames + hook2Frames;

  const segs: QuestionSegment[] = questions.map((q, idx) => {
    const vo = audio.q[idx], revealVo = audio.r[idx];
    const secs = countdownSeconds(inp.format, vo);
    const questionAt = t, questionFrames = secs * fps;
    cues.push({ kind: "whoosh", at: questionAt });
    for (let s = Math.min(3, secs - 1); s >= 1; s--) cues.push({ kind: "tick", at: questionAt + (secs - s) * fps });
    const dimAt = questionAt + questionFrames, dimFrames = f(VIDEO.dimSeconds);
    const revealAt = dimAt + dimFrames;
    const revealFrames = Math.max(f(2), f(revealVo.speechEnd + VIDEO.revealTailSeconds));
    cues.push({ kind: "ding", at: revealAt });
    t = revealAt + revealFrames;
    return { idx, n: questions.length, q, countdownSeconds: secs, questionAt, questionFrames, dimAt, dimFrames, revealAt, revealFrames, vo, revealVo };
  });

  const outroFrames = Math.max(f(VIDEO.outroSeconds), f(audio.outro.duration + 0.5));
  const outro = { at: t, frames: outroFrames, vo: audio.outro };
  t += outroFrames;

  const es = inp.lang === "es";
  return {
    id: inp.id, format: inp.format, lang: inp.lang, fps, width: VIDEO.width, height: VIDEO.height, durationInFrames: t,
    brand: BRAND,
    hook: {
      card1: hook.card1, card2: hook.card2,
      sub: es ? `¿Pasarías el examen DMV ${BRAND.year}?` : `Can you pass the ${BRAND.year} DMV test?`,
      pill: es ? "VAMOS" : "LET'S GO", hook1Frames, hook2Frames, vo: audio.hook,
    },
    questions: segs, outro, cues,
    music: { src: SFX.musicPath || null, gain: SFX.musicGain },
    meta: { caption: hook.caption, hashtags: hook.hashtags, questionIds: questions.map((q) => q.id), totalSeconds: Math.round((t / fps) * 10) / 10 },
  };
}
