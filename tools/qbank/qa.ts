/** Independent QA pass over every draft (signs, thin topics, rewrites, diagrams): a model grades each question for
 *  exactly one defensible answer, a correct key, no state-specific claim, and Spanish that matches the English.
 *  Writes a `qa` field into each draft file; the review sheet shows problems as flags. */
import fs from "node:fs";
import { keyOrPlaceholder } from "../../src/env";
const MODEL = process.env.QA_MODEL || "gpt-5.4-2026-03-05";
const FILES = ["assets/qbank/drafts/signs.json", "assets/qbank/drafts/topics.json", "assets/qbank/drafts/rewrites.json", "assets/qbank/diagrams/questions.json"];
const SYSTEM = `You are a strict reviewer of US driver's permit test practice questions. For each question decide:
1. Is the marked correct answer actually correct under rules common to every US state?
2. Is any other option also correct or arguably correct (ambiguous)?
3. Does it rely on a state-specific rule or number?
4. Do the Spanish question and answers say the same thing as the English?
For sign questions, the sign shown is the MUTCD sign given in "sign" (treat its meaning as ground truth). For diagram questions, trust the scenario described in the question.
Return JSON {"results":[{"i": <index>, "verdict": "ok" | "problem", "issue": "<short reason, empty if ok>"}]}`;

async function chat(user: string, attempt = 0): Promise<any> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST",
    headers: { Authorization: `Bearer ${keyOrPlaceholder("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] }) });
  if (r.status >= 500 && attempt < 4) { await new Promise((ok) => setTimeout(ok, 5000 * (attempt + 1))); return chat(user, attempt + 1); }
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return JSON.parse(((await r.json()) as any).choices[0].message.content);
}

for (const f of FILES) {
  if (!fs.existsSync(f)) continue;
  const rows = JSON.parse(fs.readFileSync(f, "utf8")) as any[];
  const todo = rows.map((q, i) => ({ q, i })).filter(({ q }) => !q.qa || process.env.REQA);
  for (let k = 0; k < todo.length; k += 6) {
    const batch = todo.slice(k, k + 6);
    const payload = batch.map(({ q, i }) => ({ i, sign: q.sign_code ? `${q.sign_code}: ${q.sign_meaning}` : undefined, question: q.question_text, answers: q.answers,
      correct: q.correct_answer, explanation: q.explanation, question_es: q.question_text_es, answers_es: q.answers_es }));
    const r = await chat(JSON.stringify(payload));
    for (const res of r.results ?? []) { const row = rows[res.i]; if (row) row.qa = { verdict: res.verdict, issue: res.issue ?? "", model: MODEL }; }
    fs.writeFileSync(f, JSON.stringify(rows, null, 1));
  }
  const bad = rows.filter((q) => q.qa?.verdict === "problem");
  console.log(`${f}: ${rows.length} checked, ${bad.length} problems`);
  for (const q of bad) console.log(`   - ${q.question_text.slice(0, 60)} | ${q.qa.issue.slice(0, 110)}`);
}
