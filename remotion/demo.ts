/** Default props for Remotion Studio: a dry plan from the sample set, no audio. */
import sample from "../docs/sample_set.json";
import { buildPlan } from "../src/plan";
import { dryClip, hooksDry, speakableDry } from "../src/dry";
import type { Plan, Question } from "../src/types";

export function demoPlan(): Plan {
  const qs = sample as unknown as Question[];
  const speak = qs.map((q) => speakableDry(q));
  const h = hooksDry({ count: qs.length, seconds_per_question: 6 });
  return buildPlan({
    id: "demo", format: "pass5", lang: "en",
    questions: qs.map((q, i) => ({ id: q.id, question_text: q.question_text, answers: speak[i].answers_display, correct_answer: q.correct_answer, explanation: q.explanation ?? "", image: q.image_url ? "../docs/sample_sign.png" : null })),
    hook: h,
    audio: { hook: dryClip(h.vo_line), outro: dryClip(h.outro_vo), q: speak.map((s) => dryClip(s.question_vo)), r: speak.map((s) => dryClip(s.reveal_vo)) },
  });
}
