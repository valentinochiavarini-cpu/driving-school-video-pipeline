/** Pick a non-overlapping question set for a format. Mirrors src/lib/creatorSets.ts in the app:
 *  image first, no same category back to back, excluded categories removed.
 *  A ledger in cache/used.json keeps sets from repeating across runs (per format + lang). */
import fs from "node:fs";
import path from "node:path";
import { CACHE, writeJson } from "./env";
import { EXCLUDED_CATEGORIES, FORMATS } from "./config";
import type { Lang, Question } from "./types";

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
  const base = all.filter((q) => !used.has(q.id) && !EXCLUDED_CATEGORIES.includes(q.category));
  let general = base.filter((q) => q.state === null);
  if (fmt.imageOnly) general = general.filter((q) => q.image_url);
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
  if (picked.length < size)
    throw new Error(`Not enough unused questions for ${fmtId} (${picked.length}/${size}). Reset cache/used.json or widen the filter.`);
  const ordered = order(picked);
  ledger[key] = [...(ledger[key] ?? []), ...ordered.map((q) => q.id)];
  writeJson(LEDGER, ledger);
  return ordered.map((q) => localized(q, lang));
}
