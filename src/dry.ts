/** Pure dry-mode stand-ins (no API, no Node): used by the CLI --dry path and by Remotion Studio's demo props. */
import { BRAND } from "./config";
import type { Clip, Hook, Question, Speak } from "./types";

const firstWords = (s: string, n: number) => s.split(/\s+/).filter(Boolean).slice(0, n).join(" ").replace(/[,;:]$/, "");

export function speakableDry(q: Question): Speak {
  const qt = q.question_text.replace(/\s*\(.*?\)/g, "").replace(/:$/, "").trim();
  const first = (q.explanation ?? "").split(/(?<=[.!?])\s/)[0];
  return { question_vo: qt, reveal_vo: `The answer is ${q.correct_answer}. ${firstWords(first, 10)}.`, answers_display: q.answers };
}

export type Timing = { count: number; seconds_per_question: number };

export function hooksDry(timing: Timing): Hook {
  return {
    card1: "Most people *FAIL* this one",
    card2: `${timing.count} questions. ${timing.seconds_per_question} seconds each.`,
    vo_line: `Most people fail this one. Can you pass the ${BRAND.year} DMV test? Let's go.`,
    outro_vo: "How many did you get? Drop your score in the comments and check the link in bio.",
    caption: `Only ${timing.count} questions. How many did you get right?`,
    hashtags: ["#dmvtest", "#drivingtest", "#permittest", "#roadsigns", "#newdriver"],
  };
}

/** Silent stand-in clip: evenly spaced words at about 3.1 words per second (ElevenLabs at speed 1.12). */
export function dryClip(text: string): Clip {
  const ws = text.split(/\s+/).filter(Boolean);
  const per = 1 / 3.1;
  const words = ws.map((w, i) => ({ text: w, start: 0.15 + i * per, end: 0.15 + (i + 0.85) * per }));
  const end = (words.at(-1)?.end ?? 0.5) + 0.1;
  return { src: null, text, duration: end + 0.2, speechStart: 0.15, speechEnd: end, words };
}
