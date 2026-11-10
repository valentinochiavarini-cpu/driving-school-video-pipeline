/** OpenAI text jobs (JSON mode): spoken rewrite per question (cached), hooks + caption per video. */
import { OPENAI, FORMATS, BRAND, HOOK_ANGLES, type HookStyle } from "./config";
import { jsonCache, keyOrPlaceholder, writeJson } from "./env";
import type { Hook, Lang, Question, Speak } from "./types";
import type { Timing } from "./dry";
export { speakableDry, hooksDry } from "./dry";
export type { Timing } from "./dry";

export async function chatJson<T>(system: string, user: string, temperature: number): Promise<T> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${keyOrPlaceholder("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI.model, temperature, response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(j.choices[0].message.content) as T;
}

const SPEAK_SYSTEM = `You prepare DMV multiple-choice questions for a spoken short-form quiz video.
Return JSON: {"question_vo": str, "reveal_vo": str, "answers_display": {"A": str, "B": str, "C": str, "D": str}}
Rules:
- question_vo: the question as a natural spoken sentence. Max 22 words. Expand abbreviations, remove trailing colons and parenthetical lists. If the question refers to an image say "this sign".
  Do NOT read the answer options; the viewer sees them on screen.
- reveal_vo: "The answer is <letter>." then ONE short phrase (max 10 words) with the key reason, taken from the explanation. Spanish input -> Spanish output ("La respuesta es la B.").
- answers_display: the four answers for the screen. Keep them identical unless they contain symbols or shorthand that a viewer would stumble on ('e.g.', '=', '/', '&'), then rewrite to plain words, max 12 words each, same meaning.
- Never change which answer is correct. No em dashes.`;

export async function speakable(q: Question, lang: Lang): Promise<Speak> {
  const c = jsonCache<Speak>(`speak_${q.id}_${lang}`);
  if (c.data) return c.data;
  const user = JSON.stringify({
    question_text: q.question_text, answers: q.answers, correct_answer: q.correct_answer,
    explanation: q.explanation ?? "", has_image: !!q.image_url, language: lang,
  });
  const data = await chatJson<Speak>(SPEAK_SYSTEM, user, OPENAI.temperatureSpeakable);
  for (const k of ["A", "B", "C", "D"]) data.answers_display[k] ??= q.answers[k];
  if (!/^(The answer is|La respuesta es)/.test(data.reveal_vo)) throw new Error(`Bad reveal_vo: ${data.reveal_vo}`);
  writeJson(c.path, data);
  return data;
}


const HOOK_SYSTEM = `You write opening hooks for vertical short-form quiz videos (TikTok, Reels, Shorts) for 'The Driving School', a US DMV written-test practice brand. Every video is a DMV written test quiz: the viewer answers real exam questions and keeps score.
Return JSON only: {"card1": str, "card2": str, "vo_line": str, "outro_vo": str, "caption": str, "hashtags": [str]}
Rules:
- card1 = the hook, written from the requested angle ("angle" and "angle_brief" in the input). Max 7 words. It MUST make clear this is the written driving test. Use the exact words "driving test" by default; use "DMV test" only when "wording" says "dmv". Wrap exactly ONE word in *asterisks* for highlight. Uppercase-friendly. Never invent statistics or percentages.
  Any number in card1 or card2 MUST come from timing.count, timing.seconds_per_question or pass_mark. Vary sentence shape: questions, dares, statements, "POV:", "Be honest:", a number first, a word first. Avoid starting two hooks the same way.
- card2 = the promise. Max 8 words. MUST use the numbers given in \`timing\` (question count and seconds). Example: "5 questions. 10 seconds each."
- vo_line = spoken version of card1 + card2, max 16 words, energetic, ends with "Let's go." (or "Vamos." in Spanish).
- outro_vo = max 18 words: ask for the score in the comments, then say the full practice test is in the link in bio.
- caption = max 110 chars. Start with the series title from "series" (for example "Road signs test #4" or "Driving test quiz #12"), then a score ask using timing.count ("Can you get 7/7?", "How many did you get right?"). For tests of 20+ questions also state the pass mark ("pass mark is 24/30"). Say DMV test instead of driving test only when wording is "dmv". hashtags = 5 lowercase tags in the video's language only. English: include #dmvtest and #drivingtest. Spanish: include #examendemanejo and #dmv.
- Banned words: studying, learn, educational, tips, tutorial. No emojis in cards. No em dashes. Never mention a year or a date: posts must not look expired later.`;



/** Epsilon-greedy angle choice: untried angles first, then 70 percent best-by-views, 30 percent random. */
export function chooseAngle(stats: Record<string, { posts: number; views: number }>, rnd = Math.random()): HookStyle {
  const untried = HOOK_ANGLES.filter((a) => !stats[a.id] || stats[a.id].posts === 0);
  if (untried.length) return untried[Math.floor(rnd * untried.length)].id;
  if (rnd < 0.3) return HOOK_ANGLES[Math.floor((rnd / 0.3) * HOOK_ANGLES.length)].id;
  const ranked = HOOK_ANGLES.map((a) => ({ id: a.id, avg: stats[a.id].views / Math.max(1, stats[a.id].posts) })).sort((x, y) => y.avg - x.avg);
  return ranked[Math.floor(((rnd - 0.3) / 0.7) * Math.min(3, ranked.length))].id;
}

export async function hooks(questions: Question[], fmtId: string, lang: Lang, timing: Timing, state?: string, style: HookStyle = chooseAngle({}), seriesNumber = 1): Promise<Hook> {
  const angle = HOOK_ANGLES.find((a) => a.id === style) ?? HOOK_ANGLES[0];
  const q1 = questions[0];
  const user = JSON.stringify({
    format: fmtId, format_label: FORMATS[fmtId].label, state: state ?? null,
    language: lang === "es" ? "Spanish (US)" : "English (US)",
    first_question: q1.question_text, first_has_image: !!q1.image_url,
    categories: [...new Set(questions.map((q) => q.category))].sort(), timing, angle: angle.id, angle_brief: angle.brief,
    pass_mark: Math.ceil(timing.count * 0.8),
    series: `${FORMATS[fmtId].label.replace(/\s*\(\d+\)$/, "")} #${seriesNumber}`,
    wording: Math.random() < 0.25 ? "dmv" : "driving test",
    cta: lang === "es" ? "practica el examen completo, link en la bio" : "practice the full test, link in bio",
  });
  const h = await chatJson<Hook>(HOOK_SYSTEM, user, OPENAI.temperatureHooks);
  h.style = style;
  // exactly one highlighted word on card 1: fall back to the first all-caps word, then "DMV"
  if (!/\*\S+\*/.test(h.card1)) {
    const caps = h.card1.split(/\s+/).find((w) => /^[A-Z]{3,}[!?.]?$/.test(w));
    const target = caps ?? h.card1.split(/\s+/).find((w) => /DMV/i.test(w)) ?? h.card1.split(/\s+/)[0];
    h.card1 = h.card1.replace(target, `*${target.replace(/[!?.]$/, "")}*${/[!?.]$/.test(target) ? target.slice(-1) : ""}`);
  }
  // asterisks mark the highlight word on card 1 only; never speak or post them
  for (const k of ["vo_line", "outro_vo", "card2", "caption"] as const) h[k] = h[k].replace(/\*/g, "");
  if (h.card1.split(/\s+/).length > 8 || h.card2.split(/\s+/).length > 9) throw new Error(`Hook too long: ${JSON.stringify(h)}`);
  return h;
}
