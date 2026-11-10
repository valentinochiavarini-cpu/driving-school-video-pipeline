/** Phase 3: schedule approved videos through Postiz (audited TikTok app) and sync their state back to the ledger.
 *  publish: approved -> scheduled (one per day at the configured local hour, next free slot)
 *  sync:    scheduled -> posted | failed, from Postiz post state. A failed video is retried once on the next free slot.
 *  Needs POSTIZ_API_KEY. POSTIZ_INTEGRATION_ID is optional (defaults to the first TikTok channel). */
import { POSTING } from "./config";
import { listVideos, updateVideo, type VideoRow } from "./ledger";

const BASE = () => process.env.POSTIZ_BASE_URL || "https://api.postiz.com/public/v1";
export const postizEnabled = () => !!process.env.POSTIZ_API_KEY;
const hdr = () => ({ Authorization: process.env.POSTIZ_API_KEY ?? "" });

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE()}${path}`, { ...init, headers: { ...hdr(), ...(init.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`Postiz ${r.status} ${path}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

type Integration = { id: string; name: string; identifier: string; disabled?: boolean };
export async function tiktokIntegration(): Promise<Integration> {
  if (process.env.POSTIZ_INTEGRATION_ID) return { id: process.env.POSTIZ_INTEGRATION_ID, name: "env", identifier: "tiktok" };
  const list = await api<Integration[] | { integrations: Integration[] }>("/integrations");
  const arr = Array.isArray(list) ? list : list.integrations;
  const tt = arr.find((i) => /^tiktok/.test(i.identifier) && !i.disabled);
  if (!tt) throw new Error(`No TikTok channel connected in Postiz (channels: ${arr.map((i) => i.identifier).join(", ") || "none"})`);
  return tt;
}

/* ---------- slots ---------- */

/** UTC instant for a wall-clock hour on a calendar day in POSTING.timezone. */
export function zonedInstant(y: number, m: number, d: number, hour: number): Date {
  const guess = Date.UTC(y, m - 1, d, hour);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: POSTING.timezone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const asIf = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  return new Date(guess - (asIf - guess));
}

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: POSTING.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Next free posting slots, skipping days that already hold `perDay` scheduled or posted videos. */
export function nextSlots(taken: Date[], count: number, now = new Date()): Date[] {
  const perDay = new Map<string, number>();
  for (const t of taken) perDay.set(dayKey(t), (perDay.get(dayKey(t)) ?? 0) + 1);
  const out: Date[] = [];
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: POSTING.timezone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  for (let i = 0; i < POSTING.horizonDays && out.length < count; i++) {
    const probe = new Date(now.getTime() + i * 86400e3);
    const p = Object.fromEntries(ymd.formatToParts(probe).map((x) => [x.type, x.value]));
    const weekend = p.weekday === "Sat" || p.weekday === "Sun";
    for (const hour of weekend ? POSTING.weekendHours : POSTING.weekdayHours) {
      if (out.length >= count) break;
      const slot = zonedInstant(+p.year, +p.month, +p.day, hour);
      if (slot.getTime() - now.getTime() < POSTING.minLeadMinutes * 60e3) continue;
      if (taken.some((x) => Math.abs(x.getTime() - slot.getTime()) < 60e3)) continue;
      const k = dayKey(slot);
      if ((perDay.get(k) ?? 0) >= POSTING.perDay) continue;
      perDay.set(k, (perDay.get(k) ?? 0) + 1); out.push(slot);
    }
  }
  return out;
}

/* ---------- publish ---------- */

export function postText(v: VideoRow): { content: string; title: string } {
  const tags = (v.hashtags ?? []).join(" ");
  const content = `${v.caption ?? ""}\n\n${tags}`.trim();
  const title = (v.caption ?? v.id).replace(/[#\n]/g, " ").trim().slice(0, 90);
  return { content, title };
}

export async function publishApproved(limit = 3): Promise<void> {
  const approved = (await listVideos("approved", 50)).filter((v) => v.video_url);
  const failedRetry = (await listVideos("failed", 50)).filter((v) => v.video_url && !(v.metrics as { retried?: boolean } | null)?.retried);
  const queue = [...approved, ...failedRetry].slice(0, limit);
  if (!queue.length) { console.log("publish: nothing approved"); return; }
  const tt = await tiktokIntegration();
  const taken = [...(await listVideos("scheduled", 200)), ...(await listVideos("posted", 200))]
    .map((v) => v.scheduled_at).filter(Boolean).map((s) => new Date(s!));
  const slots = nextSlots(taken, queue.length);
  for (let i = 0; i < queue.length; i++) {
    const v = queue[i]; const when = slots[i];
    if (!when) { console.log(`publish: no free slot for ${v.id} within ${POSTING.horizonDays} days`); break; }
    try {
      const media = await api<{ id: string; path: string }>("/upload-from-url", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: v.video_url }),
      });
      const { content, title } = postText(v);
      const body = {
        type: "schedule", date: when.toISOString(), shortLink: false, tags: [],
        posts: [{ integration: { id: tt.id }, value: [{ content, image: [{ id: media.id, path: media.path }] }],
          settings: { __type: "tiktok", title, ...POSTING.tiktok } }],
      };
      const res = await api<unknown>("/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const postId = extractPostId(res);
      await updateVideo(v.id, { status: "scheduled", scheduled_at: when.toISOString(), post_id: postId, error: null,
        metrics: { ...((v.metrics as object) ?? {}), retried: v.status === "failed" ? true : (v.metrics as { retried?: boolean } | null)?.retried ?? false, postiz_media: media.path } });
      console.log(`scheduled ${v.id} -> ${when.toISOString()} (post ${postId ?? "?"})`);
    } catch (e) {
      await updateVideo(v.id, { status: "failed", error: `publish: ${(e as Error).message}`.slice(0, 500), metrics: { ...((v.metrics as object) ?? {}), retried: true } });
      console.error(`publish failed ${v.id}: ${(e as Error).message}`);
    }
  }
}

function extractPostId(res: unknown): string | null {
  if (!res || typeof res !== "object") return null;
  const r = res as Record<string, unknown>;
  if (typeof r.id === "string") return r.id;
  if (Array.isArray(res) && res[0] && typeof (res[0] as { id?: unknown }).id === "string") return (res[0] as { id: string }).id;
  const posts = (r.posts ?? r.post) as unknown;
  if (Array.isArray(posts) && posts[0] && typeof (posts[0] as { id?: unknown }).id === "string") return (posts[0] as { id: string }).id;
  if (posts && typeof posts === "object" && typeof (posts as { id?: unknown }).id === "string") return (posts as { id: string }).id;
  return null;
}

/* ---------- sync ---------- */

type PostizPost = { id: string; publishDate?: string; date?: string; state?: string; releaseURL?: string; releaseUrl?: string; error?: string; group?: string };

export async function syncScheduled(): Promise<void> {
  const scheduled = await listVideos("scheduled", 200);
  const pulled = await pullMetrics(); if (pulled) console.log(`metrics refreshed for ${pulled} posts`);
  if (!scheduled.length) { console.log("sync: nothing scheduled"); return; }
  const now = Date.now();
  const due = scheduled.filter((v) => v.scheduled_at && new Date(v.scheduled_at).getTime() < now - 30 * 60e3);
  if (!due.length) { console.log(`sync: ${scheduled.length} scheduled, none due yet`); return; }
  const dates = due.map((v) => new Date(v.scheduled_at!).getTime());
  const start = new Date(Math.min(...dates) - 86400e3).toISOString(), end = new Date(Math.max(...dates) + 86400e3).toISOString();
  const res = await api<PostizPost[] | { posts: PostizPost[] }>(`/posts?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`);
  const posts = Array.isArray(res) ? res : res.posts ?? [];
  for (const v of due) {
    const p = posts.find((x) => x.id === v.post_id || x.group === v.post_id);
    if (!p) {
      if (new Date(v.scheduled_at!).getTime() < now - 24 * 3600e3)
        await updateVideo(v.id, { status: "failed", error: "sync: post not found in Postiz 24 h after its slot" });
      continue;
    }
    const state = (p.state ?? "").toUpperCase();
    if (state === "PUBLISHED") {
      await updateVideo(v.id, { status: "posted", posted_at: new Date().toISOString(), post_url: p.releaseURL ?? p.releaseUrl ?? null });
      console.log(`posted ${v.id} ${p.releaseURL ?? p.releaseUrl ?? ""}`);
    } else if (state === "ERROR") {
      await updateVideo(v.id, { status: "failed", error: `postiz: ${p.error ?? "ERROR state"}`.slice(0, 500) });
      console.log(`failed ${v.id}`);
    } else if (new Date(v.scheduled_at!).getTime() < now - 12 * 3600e3) {
      await updateVideo(v.id, { status: "failed", error: `postiz: still ${state || "QUEUE"} 12 h after the slot` });
      console.log(`failed (stuck) ${v.id}`);
    }
  }
}

/* ---------- analytics ---------- */

type Series = { label: string; data: { total: string; date: string }[]; percentageChange?: number };
const lastTotal = (s: Series[], label: RegExp) => { const m = s.find((x) => label.test(x.label)); const v = m?.data?.at(-1)?.total; return v === undefined ? null : Number(v); };

/** Post metrics from Postiz (path per the docs' CLI `analytics:post`; verified once an account exists). */
export async function postMetrics(postId: string, days = 30): Promise<Record<string, number | null> | null> {
  try {
    const s = await api<Series[]>(`/analytics/post/${encodeURIComponent(postId)}?date=${days}`);
    if (!Array.isArray(s)) return null;
    return { views: lastTotal(s, /view|impression|play/i), likes: lastTotal(s, /like/i), comments: lastTotal(s, /comment/i), shares: lastTotal(s, /share/i), saves: lastTotal(s, /save|favor/i) };
  } catch (e) { console.warn(`metrics ${postId}: ${(e as Error).message.slice(0, 120)}`); return null; }
}

export async function platformMetrics(days = 7): Promise<Series[] | null> {
  try { const tt = await tiktokIntegration(); return await api<Series[]>(`/analytics/${tt.id}?date=${days}`); }
  catch (e) { console.warn(`platform metrics: ${(e as Error).message.slice(0, 120)}`); return null; }
}

/** Refresh metrics for videos posted in the last 30 days. */
export async function pullMetrics(): Promise<number> {
  const posted = (await listVideos("posted", 200)).filter((v) => v.post_id && v.posted_at && Date.now() - new Date(v.posted_at).getTime() < 30 * 86400e3);
  let n = 0;
  for (const v of posted) {
    const m = await postMetrics(v.post_id!);
    if (!m || Object.values(m).every((x) => x === null)) continue;
    await updateVideo(v.id, { metrics: { ...((v.metrics as object) ?? {}), ...m, pulled_at: new Date().toISOString() } }); n++;
  }
  return n;
}
