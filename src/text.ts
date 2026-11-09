/** OpenAI text jobs (JSON mode): spoken rewrite per question (cached), hooks + caption per video. */
import { OPENAI, FORMATS, BRAND } from "./config";
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


const HOOK_SYSTEM = `You write opening hooks for vertical short-form quiz videos (TikTok, Reels, Shorts) for 'The Driving School', a US DMV written-test practice brand.
Return JSON only: {"card1": str, "card2": str, "vo_line": str, "outro_vo": str, "caption": str, "hashtags": [str]}
Rules:
- card1 = the hook. Max 7 words. One emotional trigger: fear of failing, curiosity, challenge, "most people get this wrong". Wrap exactly ONE word in *asterisks* for highlight. Uppercase-friendly.
- card2 = the promise. Max 8 words. MUST use the numbers given in \`timing\` (question count and seconds). Example: "5 questions. 6 seconds each."
- vo_line = spoken version of card1 + card2, max 14 words, energetic, ends with "Let's go." (or "Vamos." in Spanish).
- outro_vo = max 16 words: ask for the score in the comments and point to the link in bio.
- caption = max 110 chars, ends with a question asking for their score. hashtags = 5 lowercase tags in the video's language only. English: include #dmvtest and #drivingtest. Spanish: include #examendemanejo and #dmv.
- Banned words: studying, learn, educational, tips, tutorial. No emojis in cards. No em dashes.
- If first_has_image is true, card1 may reference "this sign".`;



export async function hooks(questions: Question[], fmtId: string, lang: Lang, timing: Timing, state?: string): Promise<Hook> {
  const q1 = questions[0];
  const user = JSON.stringify({
    format: fmtId, format_label: FORMATS[fmtId].label, state: state ?? null,
    language: lang === "es" ? "Spanish (US)" : "English (US)", year: BRAND.year,
    first_question: q1.question_text, first_has_image: !!q1.image_url,
    categories: [...new Set(questions.map((q) => q.category))].sort(), timing,
  });
  const h = await chatJson<Hook>(HOOK_SYSTEM, user, OPENAI.temperatureHooks);
  // asterisks mark the highlight word on card 1 only; never speak or post them
  for (const k of ["vo_line", "outro_vo", "card2", "caption"] as const) h[k] = h[k].replace(/\*/g, "");
  if (h.card1.split(/\s+/).length > 8 || h.card2.split(/\s+/).length > 9) throw new Error(`Hook too long: ${JSON.stringify(h)}`);
  return h;
}
