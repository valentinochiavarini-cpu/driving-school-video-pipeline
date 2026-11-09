import fs from "node:fs";
import path from "node:path";
import { env, jsonCache, writeJson, PUBLIC } from "./env";
import type { Question } from "./types";

const headers = () => ({ apikey: env("SUPABASE_ANON_KEY"), Authorization: `Bearer ${env("SUPABASE_ANON_KEY")}` });

/** All questions, cached for 24 h in cache/json/questions_all.json. */
export async function fetchAllQuestions(): Promise<Question[]> {
  const c = jsonCache<{ at: number; rows: Question[] }>("questions_all");
  if (c.data && Date.now() - c.data.at < 24 * 3600e3) return c.data.rows;
  const url = `${env("SUPABASE_URL")}/rest/v1/questions?select=*&limit=5000`;
  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  const rows = (await r.json()) as Question[];
  writeJson(c.path, { at: Date.now(), rows });
  return rows;
}

/** Download a question image into public/cache/images and return the path relative to public/. */
export async function cacheImage(url: string, id: string): Promise<string> {
  const ext = (path.extname(new URL(url).pathname) || ".png").toLowerCase();
  const rel = `cache/images/${id}${ext}`;
  const abs = path.join(PUBLIC, rel);
  if (!fs.existsSync(abs)) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`image ${r.status} ${url}`);
    fs.writeFileSync(abs, Buffer.from(await r.arrayBuffer()));
  }
  return rel;
}
