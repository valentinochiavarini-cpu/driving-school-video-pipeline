/** Daily and weekly report from the ledger (plus Postiz platform metrics when available). Pure text output so a
 *  scheduled session can paste it into its reply. Growth rules live in docs/GROWTH.md. */
import { COSTS, HOOK_ANGLES, POSTING } from "./config";
import { listVideos, type VideoRow } from "./ledger";
import { platformMetrics, postizEnabled } from "./publish";

const days = (n: number) => Date.now() - n * 86400e3;
const fmtDate = (s: string | null | undefined) => s ? new Intl.DateTimeFormat("en-US", { timeZone: POSTING.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(s)) : "";
const num = (v: unknown) => (typeof v === "number" ? v : null);
const m = (v: VideoRow) => (v.metrics ?? {}) as Record<string, unknown>;
const angleOf = (v: VideoRow) => ((v.hook as { style?: string } | null)?.style ?? "?");

function table(rows: string[][], head: string[]): string {
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (r: string[]) => r.map((c, i) => (c ?? "").padEnd(w[i])).join("  ").trimEnd();
  return [line(head), ...rows.map(line)].join("\n");
}

function group(rows: VideoRow[], key: (v: VideoRow) => string) {
  const g: Record<string, { posts: number; withViews: number; views: number; likes: number; comments: number }> = {};
  for (const v of rows) {
    const k = key(v); g[k] ??= { posts: 0, withViews: 0, views: 0, likes: 0, comments: 0 };
    g[k].posts++;
    const views = num(m(v).views); if (views !== null) { g[k].withViews++; g[k].views += views; }
    g[k].likes += num(m(v).likes) ?? 0; g[k].comments += num(m(v).comments) ?? 0;
  }
  return Object.entries(g).map(([k, s]) => ({ k, ...s, avg: s.withViews ? Math.round(s.views / s.withViews) : null })).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
}

export async function report(weekly: boolean): Promise<string> {
  const all = await listVideos(null, 1000);
  const out: string[] = [];
  const since7 = days(7), since30 = days(30);
  const byStatus: Record<string, number> = {}; for (const v of all) byStatus[v.status] = (byStatus[v.status] ?? 0) + 1;
  out.push(`PIPELINE  ${Object.entries(byStatus).map(([k, n]) => `${k} ${n}`).join(" | ")}`);

  const failed = all.filter((v) => v.status === "failed" && new Date(v.updated_at ?? v.created_at ?? 0).getTime() > since7);
  if (failed.length) { out.push("ERRORS (7d)"); for (const v of failed) out.push(`  ${v.id}  ${(v.error ?? "").slice(0, 140)}`); }

  const upcoming = all.filter((v) => v.status === "scheduled" && v.scheduled_at && new Date(v.scheduled_at).getTime() > Date.now())
    .sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!)).slice(0, 6);
  out.push(`NEXT POSTS  ${upcoming.length ? upcoming.map((v) => `${fmtDate(v.scheduled_at)} ${v.format}/${angleOf(v)}`).join("; ") : "none scheduled"}`);
  const ready = all.filter((v) => v.status === "ready");
  if (ready.length) out.push(`WAITING FOR APPROVAL  ${ready.map((v) => v.id).join(", ")}`);

  const posted7 = all.filter((v) => v.status === "posted" && v.posted_at && new Date(v.posted_at).getTime() > since7);
  out.push(`POSTED (7d)  ${posted7.length}`);
  if (posted7.length) out.push(table(posted7.map((v) => [fmtDate(v.posted_at), v.format, angleOf(v), `${v.seconds ?? ""}s`, String(num(m(v).views) ?? "-"), String(num(m(v).likes) ?? "-"), String(num(m(v).comments) ?? "-"), (v.post_url ?? "").slice(0, 60)]),
    ["when", "format", "angle", "len", "views", "likes", "comm", "url"]).split("\n").map((l) => "  " + l).join("\n"));

  // costs this week: ElevenLabs characters are stored per video at render time (metrics.chars)
  const made7 = all.filter((v) => new Date(v.created_at ?? 0).getTime() > since7);
  const chars = made7.reduce((a, v) => a + (num(m(v).chars) ?? 0), 0);
  const cost = (chars / 1000) * COSTS.elevenlabsPer1kChars + made7.length * COSTS.openaiPerVideo + (COSTS.postizPerMonth * 7) / 30;
  out.push(`COSTS (7d est.)  ${made7.length} videos, ${chars.toLocaleString()} voice chars -> voice $${((chars / 1000) * COSTS.elevenlabsPer1kChars).toFixed(2)}, text $${(made7.length * COSTS.openaiPerVideo).toFixed(2)}, Postiz $${((COSTS.postizPerMonth * 7) / 30).toFixed(2)}, total about $${cost.toFixed(2)}`);

  if (weekly) {
    const posted30 = all.filter((v) => v.status === "posted" && v.posted_at && new Date(v.posted_at).getTime() > since30);
    const withViews = posted30.filter((v) => num(m(v).views) !== null);
    out.push(`\nWEEKLY  posted 30d ${posted30.length}, with metrics ${withViews.length}`);
    if (withViews.length) {
      const views = withViews.map((v) => num(m(v).views)!).sort((a, b) => a - b);
      const median = views[Math.floor(views.length / 2)];
      out.push(`  median views ${median}, best ${views.at(-1)}, worst ${views[0]}`);
      for (const [label, key] of [["BY ANGLE", angleOf], ["BY FORMAT", (v: VideoRow) => v.format], ["BY THEME", (v: VideoRow) => String(m(v).theme ?? "?")], ["BY LENGTH", (v: VideoRow) => (v.seconds ?? 0) < 90 ? "<90s" : (v.seconds ?? 0) < 240 ? "90-240s" : ">240s"]] as const) {
        const g = group(withViews, key as (v: VideoRow) => string);
        out.push(`  ${label}`);
        out.push(table(g.map((r) => [r.k, String(r.posts), String(r.avg ?? "-"), String(r.likes), String(r.comments), r.posts >= 4 && r.avg !== null && r.avg < median * 0.5 ? "CUT?" : r.posts >= 4 && r.avg !== null && r.avg > median * 1.5 ? "SCALE" : ""]), ["key", "posts", "avg views", "likes", "comm", "flag"]).split("\n").map((l) => "    " + l).join("\n"));
      }
      const tried = new Set(posted30.map(angleOf));
      const untried = HOOK_ANGLES.filter((a) => !tried.has(a.id)).map((a) => a.id);
      if (untried.length) out.push(`  angles not tried yet: ${untried.join(", ")}`);
    } else out.push("  no post metrics yet (Postiz analytics or manual `metrics` entries)");
    if (postizEnabled()) {
      const pm = await platformMetrics(7);
      if (pm) out.push(`  ACCOUNT (7d)  ${pm.map((s) => `${s.label} ${s.data.at(-1)?.total ?? "-"}${typeof s.percentageChange === "number" ? ` (${s.percentageChange > 0 ? "+" : ""}${s.percentageChange}%)` : ""}`).join(" | ")}`);
    }
  }
  return out.join("\n");
}
