/** Phase 3: schedule approved videos through Postiz (audited TikTok app) and sync their state back to the ledger.
 *  publish: approved -> scheduled (one per day at the configured local hour, next free slot)
 *  sync:    scheduled -> posted | failed, from Postiz post state. A failed video is retried once on the next free slot.
 *  Needs POSTIZ_API_KEY. POSTIZ_INTEGRATION_ID is optional (defaults to the first TikTok channel). */
import { POSTING } from "./config";
import { listVideos, updateVideo, ingestCall, type VideoRow } from "./ledger";

const BASE = () => process.env.POSTIZ_BASE_URL || "https://api.postiz.com/public/v1";
export const postizEnabled = () => !!process.env.POSTIZ_API_KEY;
// Postiz reads the bare key from Authorization, and also from a plain `auth` header (used by the session proxy).
const hdr = () => ({ Authorization: process.env.POSTIZ_API_KEY ?? "", auth: process.env.POSTIZ_API_KEY ?? "" });

/** POSTIZ_API_KEY=via-ingest routes every call through the Lovable ingest function, which holds the real key
 *  server-side (needed where the session proxy cannot send a bare Authorization header). */
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (process.env.POSTIZ_API_KEY === "via-ingest") {
    const r = await ingestCall<{ status?: number } & T>({ action: "postiz", method: init.method ?? "GET", path, body: init.body ? JSON.parse(String(init.body)) : undefined });
    return r as T;
  }
  const r = await fetch(`${BASE()}${path}`, { ...init, headers: { ...hdr(), ...(init.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`Postiz ${r.status} ${path}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

type Integration = { id: string; name: string; identifier: string; disabled?: boolean };
async function integrations(): Promise<Integration[]> {
  const list = await api<Integration[] | { integrations: Integration[] }>("/integrations");
  return (Array.isArray(list) ? list : list.integrations).filter((i) => !i.disabled);
}
export async function tiktokIntegration(): Promise<Integration> {
  if (process.env.POSTIZ_INTEGRATION_ID) return { id: process.env.POSTIZ_INTEGRATION_ID, name: "env", identifier: "tiktok" };
  const arr = await integrations();
  const tt = arr.find((i) => /^tiktok/.test(i.identifier));
  if (!tt) throw new Error(`No TikTok channel connected in Postiz (channels: ${arr.map((i) => i.identifier).join(", ") || "none"})`);
  return tt;
}
/** One Postiz post entry per configured platform. TikTok is required; others are skipped with a warning if absent. */
async function channelPosts(content: string, title: string, media: { id: string; path: string }) {
  const arr = await integrations();
  const out: unknown[] = []; const used: { platform: string; id: string }[] = [];
  for (const platform of POSTING.platforms) {
    const ch = platform === "tiktok" && process.env.POSTIZ_INTEGRATION_ID ? { id: process.env.POSTIZ_INTEGRATION_ID, identifier: "tiktok" } : arr.find((i) => i.identifier.startsWith(platform));
    if (!ch) { if (platform === "tiktok") throw new Error("No TikTok channel connected in Postiz"); console.warn(`publish: no ${platform} channel connected, skipping`); continue; }
    const settings = platform === "tiktok" ? { __type: "tiktok", title, ...POSTING.tiktok } : { __type: ch.identifier.startsWith("instagram-standalone") ? "instagram-standalone" : "instagram", ...POSTING.instagram };
    out.push({ integration: { id: ch.id }, value: [{ content, image: [{ id: media.id, path: media.path }] }], settings });
    used.push({ platform, id: ch.id });
  }
  return { posts: out, used };
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
  const tags = (v.hashtags ?? []).map((t) => "#" + String(t).replace(/^#+/, "").replace(/\s+/g, "")).filter((t) => t.length > 1).join(" ");
  const content = `${v.caption ?? ""}\n\n${tags}`.trim();
  const title = (v.caption ?? v.id).replace(/[#\n]/g, " ").trim().slice(0, 90);
  return { content, title };
}

/** opts.firstNow: schedule the first video about 3 minutes from now (manual test), the rest on normal slots.
 *  opts.at: explicit times (one-off catch-up days); used in order before any normal slot. */
export async function publishApproved(limit = 3, opts: { firstNow?: boolean; at?: Date[] } = {}): Promise<void> {
  const approved = (await listVideos("approved", 50)).filter((v) => v.video_url);
  const failedRetry = (await listVideos("failed", 50)).filter((v) => v.video_url && !(v.metrics as { retried?: boolean } | null)?.retried);
  const queue = [...approved, ...failedRetry].slice(0, limit);
  if (!queue.length) { console.log("publish: nothing approved"); return; }
  const taken = [...(await listVideos("scheduled", 200)), ...(await listVideos("posted", 200))]
    .map((v) => v.scheduled_at).filter(Boolean).map((s) => new Date(s!));
  const slots = opts.at?.length ? [...opts.at, ...nextSlots([...taken, ...opts.at], Math.max(0, queue.length - opts.at.length))] : nextSlots(taken, queue.length);
  if (opts.firstNow) slots.unshift(new Date(Date.now() + 3 * 60e3));
  for (let i = 0; i < queue.length; i++) {
    const v = queue[i]; const when = slots[i];
    if (!when) { console.log(`publish: no free slot for ${v.id} within ${POSTING.horizonDays} days`); break; }
    try {
      const media = await api<{ id: string; path: string }>("/upload-from-url", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: v.video_url }),
      });
      const { content, title } = postText(v);
      const { posts, used } = await channelPosts(content, title, media);
      const body = { type: "schedule", date: when.toISOString(), shortLink: false, tags: [], posts };
      const res = await api<unknown>("/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      let ids = extractPostIds(res);
      if (!ids.length) {
        console.log(`publish: create response without ids (${JSON.stringify(res).slice(0, 200)}), looking the posts up`);
        ids = await findPostIds(when, content);
      }
      await updateVideo(v.id, { status: "scheduled", scheduled_at: when.toISOString(), post_id: ids[0] ?? null, error: null,
        metrics: { ...((v.metrics as object) ?? {}), retried: v.status === "failed" ? true : (v.metrics as { retried?: boolean } | null)?.retried ?? false,
          postiz_media: media.path, postiz_post_ids: ids, channels: used.map((u) => u.platform) } });
      console.log(`scheduled ${v.id} -> ${when.toISOString()} on ${used.map((u) => u.platform).join("+")} (posts ${ids.join(",") || "?"})`);
    } catch (e) {
      await updateVideo(v.id, { status: "failed", error: `publish: ${(e as Error).message}`.slice(0, 500), metrics: { ...((v.metrics as object) ?? {}), retried: true } });
      console.error(`publish failed ${v.id}: ${(e as Error).message}`);
    }
  }
}

/** Post ids for a video found by publish date and caption (fallback when the create response carries no ids). */
async function findPostIds(when: Date, content: string): Promise<string[]> {
  const s = new Date(when.getTime() - 60e3).toISOString(), e = new Date(when.getTime() + 60e3).toISOString();
  const res = await api<PostizPost[] | { posts: PostizPost[] }>(`/posts?startDate=${encodeURIComponent(s)}&endDate=${encodeURIComponent(e)}`);
  const posts = Array.isArray(res) ? res : res.posts ?? [];
  const head = content.slice(0, 40);
  return posts.filter((p) => (p.content ?? "").startsWith(head)).map((p) => p.id);
}

/** All post ids in a create response, whatever its shape (object, array, or {posts: [...]}) */
function extractPostIds(res: unknown): string[] {
  const ids: string[] = [];
  // Postiz create responses look like [{ postId, integration }]; older shapes used id
  const take = (x: unknown) => { if (!x || typeof x !== "object") return; const o = x as { id?: unknown; postId?: unknown }; const v = typeof o.postId === "string" ? o.postId : typeof o.id === "string" ? o.id : null; if (v) ids.push(v); };
  if (Array.isArray(res)) res.forEach(take);
  else if (res && typeof res === "object") {
    take(res);
    const inner = (res as { posts?: unknown; post?: unknown }).posts ?? (res as { post?: unknown }).post;
    if (Array.isArray(inner)) inner.forEach(take); else take(inner);
  }
  return [...new Set(ids)];
}

/* ---------- sync ---------- */

type PostizPost = { id: string; publishDate?: string; date?: string; state?: string; releaseURL?: string | null; releaseUrl?: string; error?: string | null; group?: string; content?: string; integration?: { providerIdentifier?: string; id?: string } };

export async function syncScheduled(): Promise<void> {
  const scheduled = await listVideos("scheduled", 200);
  const pulled = await pullMetrics(); if (pulled) console.log(`metrics refreshed for ${pulled} posts`);
  if (!scheduled.length) { console.log("sync: nothing scheduled"); return; }
  const now = Date.now();
  const minAge = Number(process.env.SYNC_MIN_AGE_MINUTES ?? 30) * 60e3;
  const due = scheduled.filter((v) => v.scheduled_at && new Date(v.scheduled_at).getTime() < now - minAge);
  if (!due.length) { console.log(`sync: ${scheduled.length} scheduled, none due yet`); return; }
  const dates = due.map((v) => new Date(v.scheduled_at!).getTime());
  const start = new Date(Math.min(...dates) - 86400e3).toISOString(), end = new Date(Math.max(...dates) + 86400e3).toISOString();
  const res = await api<PostizPost[] | { posts: PostizPost[] }>(`/posts?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`);
  const posts = Array.isArray(res) ? res : res.posts ?? [];
  for (const v of due) {
    const ids = new Set<string>([v.post_id, ...(((v.metrics as { postiz_post_ids?: string[] } | null)?.postiz_post_ids) ?? [])].filter(Boolean) as string[]);
    const mine = posts.filter((x) => ids.has(x.id) || (x.group && ids.has(x.group)));
    if (mine.length) await updateVideo(v.id, { metrics: { ...((v.metrics as object) ?? {}), post_states: Object.fromEntries(mine.map((x) => [x.id, x.state ?? "?"])) } });
    const p = mine.find((x) => (x.state ?? "").toUpperCase() === "PUBLISHED") ?? mine.find((x) => (x.state ?? "").toUpperCase() === "ERROR") ?? mine[0];
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
