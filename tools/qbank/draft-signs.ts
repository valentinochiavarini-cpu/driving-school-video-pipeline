/** Draft sign questions from the fetched Commons signs (assets/qbank/signs/manifest.json). Signs new to the bank get
 *  two questions (meaning, required action); signs already in the bank get one action/where question so the bank
 *  asks them a new way. Answers are kept short (<= 22 chars) so the video uses the large-picture layout.
 *  Output: assets/qbank/drafts/signs.json */
import fs from "node:fs";
import path from "node:path";
import { keyOrPlaceholder } from "../../src/env";

const MODEL = process.env.DRAFT_MODEL || "gpt-5.4-2026-03-05";
const manifest = JSON.parse(fs.readFileSync("assets/qbank/signs/manifest.json", "utf8")) as Record<string, any>;
/** MUTCD codes whose meaning the bank already asks (from the bank's 115 image questions, 2026-11-10) */
const IN_BANK = new Set(["R1-1", "R1-2", "R5-1", "R5-1a", "R3-4", "R4-7", "R4-1", "R3-5L", "R3-8", "W4-1", "W6-1", "W6-3", "W10-1", "W11-2", "W2-1", "W2-2", "W2-6", "W5-2", "W7-1", "W3-3", "W8-5", "S1-1", "R2-1"]);
const file = path.resolve("assets/qbank/drafts/signs.json");
const done: any[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];

async function chat(user: string, attempt = 0): Promise<any> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${keyOrPlaceholder("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] }),
  });
  if (r.status >= 500 && attempt < 4) { await new Promise((ok) => setTimeout(ok, 5000 * (attempt + 1))); return chat(user, attempt + 1); }
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return JSON.parse(((await r.json()) as any).choices[0].message.content);
}

const SYSTEM = `You write road-sign questions for a US driver's permit test practice app. The image shown is the official MUTCD sign given by code and meaning; treat that meaning as ground truth.
Rules: the question refers to "this sign". Exactly four answers A-D, each at most 22 characters. One unambiguously correct answer; distractors are meanings of other real signs or plausible misreadings. No "All/None of the above". No state-specific rules or numbers. Explanation 1 to 2 sentences. Spanish (US) translations, answers also at most 22 characters. category is "Signs, Signals & Markings".
Return JSON {"questions":[{"question_text","answers":{"A","B","C","D"},"correct_answer","explanation","question_text_es","answers_es":{"A","B","C","D"},"explanation_es","category","kind"}]} where kind is "meaning" or "action".`;

for (const [code, m] of Object.entries(manifest)) {
  if (!fs.existsSync(path.resolve("assets/qbank/signs", `${code}.png`))) continue;
  if (done.some((q) => q.sign_code === code)) continue;
  const kinds = IN_BANK.has(code) ? ["action"] : ["meaning", "action"];
  const r = await chat(`Sign ${code}: ${m.meaning}. Write ${kinds.length} question(s), kinds: ${kinds.join(", ")}. "meaning" asks what the sign means; "action" asks what a driver must do or expect when they see it.`);
  for (const q of (r.questions ?? []).slice(0, kinds.length)) done.push({ ...q, sign_code: code, sign_meaning: m.meaning, commons_page: m.commons_page, in_bank: IN_BANK.has(code), batch: "signs", source: `drafted by ${MODEL}; image from Wikimedia Commons` });
  fs.writeFileSync(file, JSON.stringify(done, null, 1));
  console.log(`${code}: ${(r.questions ?? []).length}`);
}
console.log(`signs.json: ${done.length} questions`);
