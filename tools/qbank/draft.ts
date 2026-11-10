/** Draft text questions for owner review (never imported without approval).
 *  - thin topics (HOV, U-turns, curves, drowsy and distracted driving, lane changes, four-way stops, roundabouts,
 *    following distance, work zones)
 *  - rewrites of bank questions whose correct answer is "All of the above"
 *  Output: assets/qbank/drafts/{topics,rewrites}.json */
import fs from "node:fs";
import path from "node:path";
import { keyOrPlaceholder } from "../../src/env";

const OUT = path.resolve("assets/qbank/drafts"); fs.mkdirSync(OUT, { recursive: true });
const MODEL = process.env.DRAFT_MODEL || "gpt-5.4-2026-03-05";
const CATEGORIES = ["Signs, Signals & Markings", "Sharing the Road", "Safe Driving & Defensive Driving", "Road Rules & Right-of-Way", "Right-of-Way Rules",
  "Passing Rules", "Emergencies & Breakdowns", "Vehicle Equipment & Safety", "Driving Conditions & Hazards", "Turning & Lane Changes", "Lane Usage & Highway Driving",
  "Parking Rules", "Vehicle Control & Maneuvers"];

async function chat<T>(system: string, user: string, attempt = 0): Promise<T> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${keyOrPlaceholder("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (r.status >= 500 && attempt < 4) { await new Promise((ok) => setTimeout(ok, 5000 * (attempt + 1))); return chat<T>(system, user, attempt + 1); }
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = (await r.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(j.choices[0].message.content) as T;
}

const RULES = `You write multiple-choice questions for a US driver's permit (written knowledge) test practice app.
Hard rules:
- Only rules that are the same in every US state's driver handbook. Never state fines, ages, BAC limits, state-specific speed numbers, or anything that varies by state. If a rule varies by state, do not write that question.
- Exactly four answers A-D, each under 12 words. One unambiguously correct answer. Distractors plausible but clearly wrong under the rule.
- Never use "All of the above", "None of the above", "Both A and B" or similar.
- Question under 25 words, plain English, no trick wording, no em dashes.
- explanation: 1 to 2 sentences stating the rule and why the answer is correct.
- Spanish (US) translations for question, answers and explanation, natural and accurate.
- category: one of ${JSON.stringify(CATEGORIES)}.
Return JSON {"questions":[{"question_text","answers":{"A","B","C","D"},"correct_answer","explanation","question_text_es","answers_es":{"A","B","C","D"},"explanation_es","category","topic"}]}`;

const TOPICS: [string, number][] = [
  ["HOV / carpool lanes: what they are, who may use them, diamond markings, entering and leaving", 6],
  ["U-turns: where they are not allowed (hills, curves, near railroad crossings, where signs prohibit), how to make one safely", 6],
  ["curves: slowing before the curve, advisory speed plaques, lane position, braking", 6],
  ["drowsy driving: warning signs and what to do", 6],
  ["distracted driving: phones, passengers, eating, what to do when you must use a phone (pull over safely)", 8],
  ["lane changes: mirrors, blind spot head check, signaling, solid vs broken lines", 8],
  ["four-way stops: order of arrival, complete stops, pedestrians, turning traffic", 6],
  ["roundabouts: direction of travel (counterclockwise), yielding on entry, choosing a lane, exiting, pedestrians, large trucks", 8],
  ["following distance: the 3-second rule, increasing it in bad weather, behind motorcycles and large trucks, when being tailgated", 8],
  ["work zones: orange signs, flaggers, lane closures, fines are higher (do not give numbers), slowing down", 6],
];

async function topics() {
  // at most 4 questions per request (long generations time out at the proxy); progress saved after every call
  const file = path.join(OUT, "topics.json");
  const all: any[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  for (const [t, n] of TOPICS) {
    const key = t.split(":")[0];
    let have = all.filter((q) => q.topic_key === key);
    while (have.length < n) {
      const k = Math.min(4, n - have.length);
      const avoid = have.map((q) => q.question_text).join(" | ");
      const r = await chat<{ questions: any[] }>(RULES, `Write ${k} different questions on: ${t}. Vary the angle of each question.${avoid ? ` Do not repeat these existing questions: ${avoid}` : ""}`);
      for (const q of (r.questions ?? []).slice(0, k)) all.push({ ...q, topic_key: key, batch: "thin-topics", source: `drafted by ${MODEL}` });
      fs.writeFileSync(file, JSON.stringify(all, null, 1));
      have = all.filter((q) => q.topic_key === key);
    }
    console.log(`${key}: ${have.length}`);
  }
}

async function rewrites() {
  const bank = JSON.parse(fs.readFileSync("cache/json/questions_all.json", "utf8")).rows as any[];
  const excluded = ["Alcohol & Drugs", "Speed Limits & Laws", "Licensing & Registration"];
  const targets = bank.filter((q) => q.state === null && !excluded.includes(q.category) && /all of the above|all are|all of these/i.test(q.answers[q.correct_answer] ?? ""));
  const out: any[] = [];
  for (const q of targets) {
    const r = await chat<{ questions: any[] }>(RULES, `Rewrite this question so that it has one specific correct answer instead of "all of the above". Keep the same topic and category, base the correct answer on the explanation, and keep the image reference meaning if the question refers to an image (has_image=${!!q.image_url}).
Original: ${JSON.stringify({ question_text: q.question_text, answers: q.answers, correct_answer: q.correct_answer, explanation: q.explanation, category: q.category })}
Return exactly one question in the questions array.`);
    const n = r.questions?.[0]; if (!n) continue;
    out.push({ ...n, category: q.category, image_url: q.image_url ?? null, batch: "all-of-the-above-rewrite", replaces_id: q.id, original_question: q.question_text, source: `drafted by ${MODEL}` });
    console.log(`rewrite ${q.id.slice(0, 8)}: ${n.question_text.slice(0, 70)}`);
  }
  fs.writeFileSync(path.join(OUT, "rewrites.json"), JSON.stringify(out, null, 1));
}

const what = process.argv[2] ?? "all";
if (what === "topics" || what === "all") await topics();
if (what === "rewrites" || what === "all") await rewrites();
