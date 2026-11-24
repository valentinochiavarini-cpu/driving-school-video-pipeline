/** OpenAI text jobs (JSON mode): spoken rewrite per question (cached), hooks + caption per video. */
import { buildCaption, cleanHashtags } from "./post";
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
- question_vo: the question as a natural spoken sentence. Max 22 words. Expand abbreviations, remove trailing colons and parenthetical lists.
  Keep every fact of the question (who, where, what) and keep its wording as close to the original as you can.
  NEVER state, hint at or imply the correct answer or the explanation: the viewer must still have to answer.
  Only when "image_kind" is "sign" may you call the picture "this sign"; for a "diagram" or "photo" say "this picture" or
  nothing at all. Do NOT read the answer options; the viewer sees them on screen.
- reveal_vo: "The answer is <letter>." then ONE short phrase (max 10 words) with the key reason, taken from the explanation. Spanish input -> Spanish output ("La respuesta es la B.").
- answers_display: the four answers for the screen. Keep them identical unless they contain symbols or shorthand that a viewer would stumble on ('e.g.', '=', '/', '&'), then rewrite to plain words, max 12 words each, same meaning.
- Never change which answer is correct. No em dashes.`;

const SIGN_CATS = /sign|signal|marking/i;
const STOP = new Set("the a an is are be to of in on at for and or this that these those what which who whom when where why how you your do does did if it its with from by as must should can will would may".split(" "));
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9áéíóúñü\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Guard (fix 2026-11-21): the spoken question once read "This sign indicates that car A must yield to car B. Who must
 *  yield?" on a right-of-way diagram, giving the answer away and calling a diagram a sign. The rewrite must keep the
 *  question's facts, add no new claims and only say "sign" for sign questions. Returns the problems, empty if fine. */
export function questionVoProblems(q: Pick<Question, "question_text" | "question_text_es" | "category" | "image_url">, vo: string, lang: Lang = "en"): string[] {
  const p: string[] = [];
  const text = sourceText(q, lang);
  if (!text) return p; // Spanish without a Spanish source: nothing reliable to compare against
  const src = new Set(words(text)), out = words(vo);
  const allowed = new Set(["sign", "picture", "image", "shown", "show", "shows", "means", "mean", "following", "number", "percent", "feet", "miles", "hour", "per"]);
  const added = [...new Set(out.filter((w) => !src.has(w) && !allowed.has(w) && !/^\d/.test(w)))];
  if (added.length > 2) p.push(`adds words not in the question: ${added.join(", ")}`);
  const kept = [...src].filter((w) => out.includes(w)).length;
  if (src.size >= 4 && kept / src.size < 0.6) p.push(`drops the question's facts (kept ${kept} of ${src.size} key words)`);
  if (/\bsigns?\b|\bse[nñ]al/i.test(vo) && !/\bsigns?\b|\bse[nñ]al/i.test(text) && !SIGN_CATS.test(q.category)) p.push("calls the picture a sign on a non-sign question");
  if (/\b(indicates?|means?) that\b/i.test(vo) && !/\b(indicates?|means?) that\b/i.test(text)) p.push("turns the question into a statement");
  if (/\b(indica|significa) que\b/i.test(vo) && !/\b(indica|significa) que\b/i.test(text)) p.push("turns the question into a statement");
  return p;
}

/** The wording the spoken question is checked against: Spanish source for Spanish videos (pick6 already carries it). */
function sourceText(q: Pick<Question, "question_text" | "question_text_es">, lang: Lang): string | null {
  if (lang !== "es") return q.question_text;
  if (/^\s*¿/.test(q.question_text)) return q.question_text;
  return q.question_text_es ?? null;
}

/** Plain fallback: the bank's own wording, cleaned for the ear. */
const plainQuestion = (t: string) => t.replace(/\s*\([^)]*\)/g, "").replace(/[:\s]+$/, "").replace(/\s+/g, " ").trim();

export async function speakable(q: Question, lang: Lang): Promise<Speak> {
  const c = jsonCache<Speak>(`speak_${q.id}_${lang}`);
  if (c.data && questionVoProblems(q, c.data.question_vo, lang).length === 0) return c.data;
  const imageKind = !q.image_url ? "none" : SIGN_CATS.test(q.category) ? "sign" : /generated|diagram/i.test(q.image_url) ? "diagram" : "photo";
  const base = {
    question_text: q.question_text, answers: q.answers, correct_answer: q.correct_answer,
    explanation: q.explanation ?? "", category: q.category, image_kind: imageKind, language: lang,
  };
  let data = await chatJson<Speak>(SPEAK_SYSTEM, JSON.stringify(base), OPENAI.temperatureSpeakable);
  let problems = questionVoProblems(q, data.question_vo, lang);
  if (problems.length) {
    const retry = await chatJson<Speak>(SPEAK_SYSTEM, JSON.stringify({ ...base, previous_attempt_problems: problems }), 0);
    // the retry often returns only the corrected question_vo: keep the first reply's other fields (an answers_display
    // missing here crashed the whole video, fix 2026-11-24)
    data = { ...data, ...retry, reveal_vo: retry.reveal_vo || data.reveal_vo, answers_display: { ...(data.answers_display ?? {}), ...(retry.answers_display ?? {}) } };
    problems = questionVoProblems(q, data.question_vo, lang);
    if (problems.length) {
      console.warn(`speakable ${q.id}: rewrite rejected (${problems.join("; ")}), using the bank wording`);
      data.question_vo = plainQuestion(sourceText(q, lang) ?? q.question_text);
    }
  }
  data.answers_display ??= {} as Speak["answers_display"];
  for (const k of ["A", "B", "C", "D"]) data.answers_display[k] ??= q.answers[k];
  // a malformed reveal used to throw and cost the whole video; the plain reveal is always correct (fix 2026-11-24)
  if (!/^(The answer is|La respuesta es)/.test(data.reveal_vo ?? "")) {
    console.warn(`speakable ${q.id}: bad reveal_vo "${data.reveal_vo}", using the plain reveal`);
    data.reveal_vo = lang === "es" ? `La respuesta es la ${q.correct_answer}.` : `The answer is ${q.correct_answer}.`;
  }
  writeJson(c.path, data);
  return data;
}


const HOOK_SYSTEM = `You write opening hooks for vertical short-form quiz videos (TikTok, Reels, Shorts) for 'The Driving School', a US DMV written-test practice brand. Every video is a DMV written test quiz: the viewer answers real exam questions and keeps score.
Return JSON only: {"card1": str, "card2": str, "vo_line": str, "outro_vo": str, "caption": str, "hashtags": [str]}
Rules:
- card1 = the hook, written from the requested angle ("angle" and "angle_brief" in the input). Max 7 words. It MUST make clear this is the written driving test. Use the exact words "driving test" by default; use "DMV test" only when "wording" says "dmv". Wrap exactly ONE word in *asterisks* for highlight. Uppercase-friendly. Never invent statistics or percentages, and never claim what other people do ("most people fail", "everyone misses", "nobody gets"): we have no data on that.
  Say "this sign", "this question" or "this one" only when timing.count is 1; with several questions talk about the test or the set.
  Any number in card1 or card2 MUST come from timing.count, timing.seconds_per_question or pass_mark. Vary sentence shape: questions, dares, statements, "POV:", "Be honest:", a number first, a word first. Avoid starting two hooks the same way.
- card2 = the promise. Max 8 words. MUST use the numbers given in \`timing\` (question count and seconds). Example: "5 questions. 10 seconds each."
- vo_line = spoken version of card1 + card2, max 16 words, energetic, ends with "Let's go." (or "Vamos." in Spanish).
- outro_vo = max 18 words: ask for the score in the comments (when timing.count is 1 there is no score: ask which answer they picked, A, B, C or D), then say the full test for your state is free at "the driving school dot app" (spoken exactly like that; never say "link in bio").
- caption = ONE short line, max 70 chars, written to the viewer in the angle's voice (for example "Only the careful ones get all of these." or "Trickier than it looks."). No numbers, no score, no "perfect score", no question asking how they did, no series name, no hashtags: the code adds the score ask. Never claim what most people do. Say DMV test instead of driving test only when wording is "dmv". hashtags = 5 lowercase tags in the video's language only. English: include #dmvtest and #drivingtest. Spanish: include #examendemanejo and #dmv.
- Banned words: studying, learn, educational, tips, tutorial. No emojis in cards. No em dashes. Never mention a year or a date: posts must not look expired later.`;



/** Epsilon-greedy angle choice: untried angles first, then 70 percent best-by-views, 30 percent random. */
export function chooseAngle(stats: Record<string, { posts: number; views: number }>, rnd = Math.random()): HookStyle {
  const untried = HOOK_ANGLES.filter((a) => !stats[a.id] || stats[a.id].posts === 0);
  if (untried.length) return untried[Math.floor(rnd * untried.length)].id;
  if (rnd < 0.3) return HOOK_ANGLES[Math.floor((rnd / 0.3) * HOOK_ANGLES.length)].id;
  const ranked = HOOK_ANGLES.map((a) => ({ id: a.id, avg: stats[a.id].views / Math.max(1, stats[a.id].posts) })).sort((x, y) => y.avg - x.avg);
  return ranked[Math.floor(((rnd - 0.3) / 0.7) * Math.min(3, ranked.length))].id;
}

/** Claims the hook must not make (review 2026-11-21: "Most people fail on *this* sign!" on a 5-question video). */
export function hookProblems(h: Pick<Hook, "card1" | "card2" | "vo_line" | "outro_vo">, count: number, lang: Lang): string[] {
  const p: string[] = [];
  const all = [h.card1, h.card2, h.vo_line, h.outro_vo].join(" ").replace(/\*/g, "");
  if (/\b(most|many|few) (people|drivers)\b|\b(everyone|everybody|nobody|no one)\b|\d+\s?%|la mayor[ií]a|todo el mundo|nadie/i.test(all)) p.push("claims what other people do");
  if (count > 1 && /\bthis (sign|question|one)\b|\besta (señal|pregunta)\b/i.test(`${h.card1} ${h.card2}`.replace(/\*/g, ""))) p.push("says this sign / this question on a multi-question video");
  if (count === 1 && /\b(score|how many|puntaje|cu[aá]ntas)\b/i.test(h.outro_vo)) p.push("asks for a score on a one-question video");
  return p;
}
const OUTRO_SINGLE: Record<Lang, string> = {
  en: "Which one did you pick? Comment A, B, C or D. The full test for your state is free at the driving school dot app.",
  es: "¿Cuál elegiste? Comenta A, B, C o D. El examen completo de tu estado es gratis en the driving school punto app.",
};

export async function hooks(questions: Question[], fmtId: string, lang: Lang, timing: Timing, state?: string, style: HookStyle = chooseAngle({}), seriesNumber = 1): Promise<Hook> {
  const angle = HOOK_ANGLES.find((a) => a.id === style) ?? HOOK_ANGLES[0];
  const q1 = questions[0];
  const user = JSON.stringify({
    format: fmtId, format_label: FORMATS[fmtId].label, state: state ?? null,
    language: lang === "es" ? "Spanish (US)" : "English (US)",
    first_question: q1.question_text, first_has_image: !!q1.image_url,
    categories: [...new Set(questions.map((q) => q.category))].sort(), timing, angle: angle.id, angle_brief: angle.brief,
    pass_mark: Math.ceil(timing.count * 0.8),
    wording: Math.random() < 0.25 ? "dmv" : "driving test",
    cta: lang === "es" ? "examen completo de tu estado gratis en thedrivingschool.app" : "free full test for your state at thedrivingschool.app",
  });
  let h = await chatJson<Hook>(HOOK_SYSTEM, user, OPENAI.temperatureHooks);
  const first = hookProblems(h, timing.count, lang);
  if (first.length) h = await chatJson<Hook>(HOOK_SYSTEM, JSON.stringify({ ...JSON.parse(user), previous_attempt_problems: first }), OPENAI.temperatureHooks);
  if (timing.count === 1 && hookProblems(h, 1, lang).includes("asks for a score on a one-question video")) h.outro_vo = OUTRO_SINGLE[lang];
  h.style = style;
  // exactly one highlighted span on card 1 (a word or a short phrase such as *driving test*): keep the first span,
  // drop any other asterisks; with no span, fall back to the first all-caps word, then "DMV"
  const spans = [...h.card1.matchAll(/\*([^*]+)\*/g)];
  const span = spans.find((m) => /driving test|dmv/i.test(m[0])) ?? spans[0];
  if (span) h.card1 = h.card1.slice(0, span.index).replace(/\*/g, "") + span[0] + h.card1.slice(span.index! + span[0].length).replace(/\*/g, "");
  else {
    h.card1 = h.card1.replace(/\*/g, "");
    const caps = h.card1.split(/\s+/).find((w) => /^[A-Z]{3,}[!?.]?$/.test(w));
    const target = caps ?? h.card1.split(/\s+/).find((w) => /DMV/i.test(w)) ?? h.card1.split(/\s+/)[0];
    h.card1 = h.card1.replace(target, `*${target.replace(/[!?.]$/, "")}*${/[!?.]$/.test(target) ? target.slice(-1) : ""}`);
  }
  // asterisks mark the highlight word on card 1 only; never speak or post them
  for (const k of ["vo_line", "outro_vo", "card2", "caption"] as const) h[k] = h[k].replace(/\*/g, "");
  // caption and hashtags are finished in code (src/post.ts): score ask, pass mark, language-correct tags
  if (timing.count === 1) h.card2 = h.card2.replace(/\b(1|one) questions\b/i, (m) => m.replace(/questions/i, "question")).replace(/\b1 preguntas\b/i, "1 pregunta");
  h.caption = buildCaption(h.caption, timing.count, lang);
  h.hashtags = cleanHashtags(h.hashtags ?? [], lang);
  // a hook too long for the card used to throw and cost the whole video (fix 2026-11-24): use the safe hook instead
  const tooLong = h.card1.split(/\s+/).length > 8 || h.card2.split(/\s+/).length > 9;
  if (tooLong) {
    console.warn(`hooks: too long (${JSON.stringify({ card1: h.card1, card2: h.card2 })}), using the safe hook`);
    const n = timing.count, s = timing.seconds_per_question;
    h.card2 = lang === "es" ? `${n} ${n === 1 ? "pregunta" : "preguntas"}. ${s} segundos.` : `${n} ${n === 1 ? "question" : "questions"}. ${s} seconds${n === 1 ? "" : " each"}.`;
  }
  // still wrong after the retry: a plain safe hook rather than a failed render
  if (tooLong || hookProblems(h, timing.count, lang).length) {
    if (!tooLong) console.warn(`hooks: problems after retry (${hookProblems(h, timing.count, lang).join("; ")}), using the safe hook`);
    const es = lang === "es";
    h.card1 = es ? "¿Puedes aprobar este *examen del DMV*?" : "Can you pass this *driving test*?";
    h.vo_line = `${h.card1.replace(/\*/g, "")} ${h.card2} ${es ? "Vamos." : "Let's go."}`;
    if (timing.count === 1) h.outro_vo = OUTRO_SINGLE[lang];
    else if (hookProblems(h, timing.count, lang).length) h.outro_vo = es ? "¿Cuál fue tu puntaje? El examen completo de tu estado es gratis en the driving school punto app." : "How did you score? The full test for your state is free at the driving school dot app.";
  }
  return h;
}
