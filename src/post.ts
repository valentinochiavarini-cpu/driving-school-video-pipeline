/** Pure caption and hashtag rules (decision 2026-11-18). The model writes one short line; the score ask, pass mark
 *  and required hashtags are added here in code, so no post shows an internal series number ("Classic 30 #3"),
 *  repeats the score ("Can you get 4/5? pass mark is 4/5") or carries hashtags in the other language. */
import { BRAND, FORMATS } from "./config";
import type { Lang } from "./types";

const REQUIRED: Record<Lang, string[]> = { en: ["dmvtest", "drivingtest"], es: ["examendemanejo", "dmv"] };
/** tags that mark the other language; dropped when they appear in a post of this language */
const FOREIGN: Record<Lang, RegExp> = {
  en: /^(examen|manejo|practica|licencia|conducir|permiso|senales|señales|prueba|carro|auto)/i,
  es: /^(drivingtest|drivingquiz|driving|roadsigns|roadrules|permittest|newdriver|safedriving|rightofway)$/i,
};

export const passMark = (count: number) => Math.ceil(count * 0.8);

/** The score ask added after the model's line. Short tests dare a perfect score; 20+ question tests give the pass mark. */
export function scoreAsk(count: number, lang: Lang): string {
  if (count === 1) return lang === "es" ? "¿Cuál elegiste? Comenta A, B, C o D." : "Which one did you pick? Comment A, B, C or D.";
  if (lang === "es") return count >= 20
    ? `${count} preguntas, para aprobar necesitas ${passMark(count)}/${count}. ¿Cuántas acertaste?`
    : `¿Puedes sacar ${count}/${count}? Comenta tu puntaje.`;
  return count >= 20
    ? `${count} questions, pass mark is ${passMark(count)}/${count}. How many did you get right?`
    : `Can you get ${count}/${count}? Comment your score.`;
}

/** Clean the model's caption line: no series label or number, no score fraction, no hashtags, one sentence end. */
export function cleanLine(line: string): string {
  let s = line.replace(/\*/g, "").replace(/#\S+/g, "").replace(/\s+/g, " ").trim();
  for (const f of Object.values(FORMATS)) {
    const label = f.label.replace(/\s*\(\d+\)$/, "");
    s = s.replace(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\.?\\s*`, "i"), "");
  }
  // drop any sentence that carries a score fraction, a pass mark or its own score ask: the code adds the score ask itself
  s = s.split(/(?<=[.!?])\s+/).filter((x) => !/\d+\s*\/\s*\d+|pass mark|para aprobar|how many did you get|what did you (get|score)|your score|cu[aá]ntas acertaste|tu puntaje/i.test(x)).join(" ").trim();
  if (s && !/[.!?]$/.test(s)) s += ".";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Caption line that points at the bio link, where the books sell (decision 2026-11-18). */
export const BIO_CTA: Record<Lang, string> = { en: `Take the full test for your state free: ${BRAND.url}`, es: `Haz el examen completo de tu estado gratis: ${BRAND.url}` };

/** A sentence that asks the viewer how they scored (the code adds exactly one such ask). */
const SCORE_Q = /\b(score|perfect|how many|how did you do|get \d+\s*\/|puntaje|puntuaci[oó]n|perfect[oa]|cu[aá]ntas)\b/i;

/** Claims about what other people do: we have no data, so they never go out (review 2026-11-21). */
const CLAIM = /\b(most|many) (people|drivers)\b|\b(everyone|nobody)\b|la mayor[ií]a/i;

export function buildCaption(line: string, count: number, lang: Lang): string {
  const l = cleanLine(line.split(BRAND.url).join(" ").replace(/(Take the full test for your state free|Haz el examen completo de tu estado gratis):?/gi, ""))
    .replace(/[^.!?]*link in (the )?bio[^.!?]*[.!?]?/gi, "").replace(/[^.!?¡¿]*link en la bio[^.!?]*[.!?]?/gi, "").trim();
  // the model line must not ask for a score too ("Can you get a perfect score this time? Can you get 3/3?")
  const kept = (l.match(/[^.!?]+[.!?]*/g) ?? []).filter((x) => !SCORE_Q.test(x) && !CLAIM.test(x)).join(" ").replace(/\s+/g, " ").trim();
  return `${kept ? kept + " " : ""}${scoreAsk(count, lang)} ${BIO_CTA[lang]}`.trim();
}

/** 5 lowercase single-word tags in the post's language, the required ones first, no duplicates. */
export function cleanHashtags(tags: string[], lang: Lang): string[] {
  const norm = tags.map((t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^#+/, "").replace(/[^A-Za-z0-9_]/g, "").toLowerCase()).filter(Boolean);
  const kept = norm.filter((t) => !FOREIGN[lang].test(t));
  // the model sometimes returns too few usable tags (signs7q 2026-11-21 held with only the two required ones): pad
  const pad = lang === "es" ? ["manejo", "licencia", "examen"] : ["roadrules", "drivingquiz", "permittest"];
  return [...new Set([...REQUIRED[lang], ...kept, ...pad])].slice(0, 5);
}

/** Problems a posted caption must not have (used by the QA gate). Empty array = clean. */
export function captionProblems(caption: string, tags: string[], lang: Lang): string[] {
  const p: string[] = [];
  if (/#\d/.test(caption)) p.push("series number in caption");
  const fractions = caption.match(/\d+\s*\/\s*\d+/g) ?? [];
  if (new Set(fractions).size < fractions.length) p.push("score repeated in caption");
  const asks = (caption.match(/[^.!?]+[?]/g) ?? []).filter((x) => SCORE_Q.test(x));
  if (asks.length > 1) p.push("two score questions in caption");
  if (CLAIM.test(caption)) p.push("caption claims what other people do");
  const foreign = tags.map((t) => String(t).replace(/^#+/, "")).filter((t) => FOREIGN[lang].test(t));
  if (foreign.length) p.push(`hashtags in the other language: ${foreign.join(" ")}`);
  return p;
}
