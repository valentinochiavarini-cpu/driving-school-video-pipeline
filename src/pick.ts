/** Pick a non-overlapping question set for a format. Mirrors src/lib/creatorSets.ts in the app:
 *  image first, no same category back to back, excluded categories removed.
 *  A ledger in cache/used.json keeps sets from repeating across runs (per format + lang). */
import fs from "node:fs";
import path from "node:path";
import { CACHE, writeJson } from "./env";
import { EXCLUDED_CATEGORIES, EXCLUDED_QUESTIONS, EXCLUDED_TOPIC_WORDS, FORMATS, type FormatDef } from "./config";
import type { Lang, Question } from "./types";

/** Review 2026-11-21: questions a video must never use. Excluded category or topic word, listed broken questions, and
 *  answers that are bare letters (they point at lettered pictures and read "B: A" on screen). */
export function usable(q: Question): boolean {
  if (EXCLUDED_CATEGORIES.includes(q.category)) return false;
  if (EXCLUDED_QUESTIONS.some((p) => q.id.startsWith(p))) return false;
  if (EXCLUDED_TOPIC_WORDS.test([q.question_text, ...Object.values(q.answers)].join(" "))) return false;
  if (Object.values(q.answers).some((a) => /^\s*[A-D]\s*$/.test(a ?? ""))) return false;
  return true;
}
/** Right-of-way scenes (cars at an intersection) also sit in the signs category; a sign format (signs7, signs7q) must
 *  show a sign, so those are left to the right-of-way formats (1db5c811 went out in a road-signs video). */
const isDiagram = (q: Question) => /\b(cars?|vehicles?|drivers?) [A-C]\b|\b(two|three) (cars|vehicles)\b|which (car|vehicle)|right-of-way|statements? (is|are) correct/i.test(q.question_text);
const signFormat = (fmt: FormatDef) => !!fmt.label.match(/sign/i);

const LEDGER = path.join(CACHE, "used.json");
const shuffle = <T>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function order(picked: Question[]): Question[] {
  const rest = shuffle([...picked]); const out: Question[] = [];
  const img = rest.findIndex((q) => q.image_url);
  if (img >= 0) out.push(...rest.splice(img, 1));
  while (rest.length) {
    let i = rest.findIndex((q) => !out.length || q.category !== out[out.length - 1].category);
    if (i < 0) i = 0;
    out.push(...rest.splice(i, 1));
  }
  return out;
}

export function localized(q: Question, lang: Lang): Question {
  if (lang === "es" && q.question_text_es && q.answers_es)
    return { ...q, question_text: q.question_text_es, answers: q.answers_es, explanation: q.explanation_es || q.explanation };
  return q;
}

export function pickSet(all: Question[], fmtId: string, lang: Lang, state?: string, stateCount?: number, remoteUsed: string[] = []): Question[] {
  const fmt = FORMATS[fmtId]; if (!fmt) throw new Error(`Unknown format ${fmtId}`);
  const ledger: Record<string, string[]> = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, "utf8")) : {};
  const key = `${fmtId}:${lang}`; const used = new Set([...(ledger[key] ?? []), ...remoteUsed]);
  const base = all.filter((q) => !used.has(q.id) && usable(q));
  let general = base.filter((q) => q.state === null);
  if (fmt.imageOnly) general = general.filter((q) => q.image_url && (!signFormat(fmt) || !isDiagram(q)));
  if (fmt.pickSign) general = general.filter(pickable);
  if (fmt.categories) general = general.filter((q) => fmt.categories!.includes(q.category));
  const size = fmt.size === "state" ? stateCount ?? 30 : fmt.size;
  shuffle(general);
  const picked: Question[] = [];
  if (fmt.withState && state) {
    const local = shuffle(base.filter((q) => q.state === state));
    picked.push(...local.slice(0, Math.max(1, Math.floor(size / 3))));
  }
  if (fmt.buckets) {
    const taken = new Set<string>();
    for (const b of fmt.buckets) {
      const cands = shuffle(general.filter((q) => b.cats.includes(q.category) && !taken.has(q.id)));
      if (b === fmt.buckets[0]) cands.sort((a, c) => Number(!!c.image_url) - Number(!!a.image_url));
      for (const q of cands.slice(0, b.n)) { picked.push(q); taken.add(q.id); }
    }
    general = general.filter((q) => !taken.has(q.id));
  }
  if (fmt.imageFirst && !picked.some((q) => q.image_url) && !general.slice(0, size - picked.length).some((q) => q.image_url)) {
    const i = general.findIndex((q) => q.image_url);
    if (i >= 0) picked.push(...general.splice(i, 1));
  }
  picked.push(...general.slice(0, size - picked.length));
  // decision 2026-11-18: at three posts a day the sign pool runs dry inside the reuse window; rather than fail the
  // render (an empty slot), top up with questions used before, preferring ones not used by this format recently
  if (picked.length < size) {
    const own = new Set(ledger[key] ?? []);
    let reuse = all.filter((q) => used.has(q.id) && !picked.some((p) => p.id === q.id) && usable(q) && q.state === null);
    if (fmt.imageOnly) reuse = reuse.filter((q) => q.image_url && (!signFormat(fmt) || !isDiagram(q)));
    if (fmt.pickSign) reuse = reuse.filter(pickable);
    if (fmt.categories) reuse = reuse.filter((q) => fmt.categories!.includes(q.category));
    shuffle(reuse).sort((a, b) => Number(own.has(a.id)) - Number(own.has(b.id)));
    if (reuse.length) console.warn(`pick: ${fmtId} reuses ${Math.min(reuse.length, size - picked.length)} question(s), unused pool ran out`);
    picked.push(...reuse.slice(0, size - picked.length));
  }
  if (picked.length < size)
    throw new Error(`Not enough unused questions for ${fmtId} (${picked.length}/${size}). Reset cache/used.json or widen the filter.`);
  const ordered = order(picked);
  ledger[key] = [...(ledger[key] ?? []), ...ordered.map((q) => q.id)];
  writeJson(LEDGER, ledger);
  return ordered.map((q) => localized(q, lang));
}

/** One replacement for a question the pre-render check rejected (2026-11-21): same format filters, not in `exclude`,
 *  same category when possible. Does not write the pick ledger (the video ledger records what was finally used). */
export function pickReplacement(all: Question[], fmtId: string, lang: Lang, like: Question, exclude: string[]): Question | null {
  const fmt = FORMATS[fmtId]; const ex = new Set(exclude);
  let pool = all.filter((q) => !ex.has(q.id) && usable(q) && q.state === null);
  if (fmt.imageOnly) pool = pool.filter((q) => q.image_url && (!signFormat(fmt) || !isDiagram(q)));
  if (fmt.categories) pool = pool.filter((q) => fmt.categories!.includes(q.category));
  if (like.image_url) { const withImg = pool.filter((q) => q.image_url); if (withImg.length) pool = withImg; }
  const same = pool.filter((q) => q.category === like.category);
  const pick = shuffle(same.length ? same : pool)[0];
  return pick ? localized(pick, lang) : null;
}

/* ---------- pick-the-sign (decision 2026-11-18) ---------- */

/** Sign questions that can become "Which sign means X?": one sign picture, a meaning question, a short correct answer. */
export const PICK_QUESTION = /^(what does this (road |traffic |warning )?sign (mean|indicate|tell you)|this sign (means|indicates))/i;
export function pickable(q: Question): boolean {
  const m = q.answers?.[q.correct_answer] ?? "";
  return !!q.image_url && q.state === null && PICK_QUESTION.test(q.question_text) && m.length > 0 && m.length <= 32;
}

export type Pick = { target: Question; meaning: string; options: Record<string, Question>; correct: string };

/** For each target sign, two distractor signs with a different meaning; the correct letter is random. */
export function buildPicks(targets: Question[], pool: Question[]): Pick[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  return targets.map((t) => {
    const meaning = t.answers[t.correct_answer];
    const others = shuffle(pool.filter((q) => q.id !== t.id && q.image_url !== t.image_url && norm(q.answers[q.correct_answer]) !== norm(meaning)));
    const opts = [t, others[0], others[1]];
    if (opts.some((o) => !o)) throw new Error("pick: not enough distractor signs");
    const order = shuffle([0, 1, 2]);
    const options: Record<string, Question> = {}; let correct = "A";
    ["A", "B", "C"].forEach((L, i) => { options[L] = opts[order[i]]; if (order[i] === 0) correct = L; });
    return { target: t, meaning, options, correct };
  });
}
