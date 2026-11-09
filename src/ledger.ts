/** Video ledger: the `videos` table and `videos` bucket behind the Lovable project, reached only through the
 *  `ingest` server function (shared secret in header x-ingest-token). Without INGEST_TOKEN the ledger is off and
 *  everything stays local (cache/used.json, out/). */
import fs from "node:fs";
import { env } from "./env";

export type VideoStatus = "draft" | "ready" | "approved" | "scheduled" | "posted" | "failed" | "skipped";
export type VideoRow = {
  id: string; format: string; lang: string; status: VideoStatus; approved: boolean;
  caption: string | null; hashtags: string[] | null; hook: unknown; question_ids: string[] | null; seconds: number | null;
  video_url: string | null; thumb_url: string | null; scheduled_at: string | null; posted_at: string | null;
  post_id: string | null; post_url: string | null; metrics: unknown; error: string | null; created_at?: string; updated_at?: string;
};

const URL = () => process.env.INGEST_URL || `${env("SUPABASE_URL")}/functions/v1/ingest`;
export const ledgerEnabled = () => !!process.env.INGEST_TOKEN;
const hdr = () => ({ "x-ingest-token": process.env.INGEST_TOKEN ?? "" });

async function call<T>(body: unknown): Promise<T> {
  const r = await fetch(URL(), { method: "POST", headers: { ...hdr(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(`ingest ${r.status}: ${j.error ?? JSON.stringify(j)}`);
  return j;
}

export const upsertVideo = (video: Partial<VideoRow> & { id: string; format: string; lang: string }) =>
  call<{ video: VideoRow }>({ action: "upsert", video }).then((r) => r.video);
export const updateVideo = (id: string, patch: Partial<VideoRow>) =>
  call<{ video: VideoRow }>({ action: "update", id, patch }).then((r) => r.video);
export const listVideos = (status: VideoStatus | null = null, limit = 50) =>
  call<{ videos: VideoRow[] }>({ action: "list", status, limit }).then((r) => r.videos);
export const usedQuestionIds = (format: string, lang: string) =>
  call<{ ids: string[] }>({ action: "used_question_ids", format, lang }).then((r) => r.ids);

export async function uploadFile(id: string, kind: "video" | "thumb", file: string): Promise<string> {
  const type = kind === "video" ? "video/mp4" : "image/jpeg";
  const r = await fetch(`${URL()}?action=upload&id=${encodeURIComponent(id)}&kind=${kind}`, {
    method: "POST", headers: { ...hdr(), "Content-Type": type }, body: fs.readFileSync(file),
  });
  const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!r.ok || !j.url) throw new Error(`upload ${r.status}: ${j.error ?? JSON.stringify(j)}`);
  return j.url;
}
