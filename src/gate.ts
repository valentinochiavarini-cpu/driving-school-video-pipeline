/** The publishing gate around src/qa.ts:
 *   qaStep       QA every ready video (and any approved one whose file changed); a test format is marked skipped;
 *                a failure a script can repair (card 1 text, caption, hashtags) is fixed once and QA runs again;
 *                anything else stays held (status ready) with its reasons on the row and in the report.
 *   autoApprove  approve ready videos that passed QA on their current file (POSTING.autoApprove).
 *   retract      take a video back for fixing: cancel its scheduled Postiz posts, clear approval and QA,
 *                so it must be fixed, pass QA and be approved again before it can be published. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { POSTING } from "./config";
import { ROOT, OUT } from "./env";
import { listVideos, updateVideo, upsertVideo, uploadFile, ingestCall, type VideoRow } from "./ledger";
import { qaVideo, qaPassed, qaSummary, textChecks, QA, type QaResult } from "./qa";

const meta = (v: VideoRow) => ((v.metrics as Record<string, any> | null) ?? {});

/** Deterministic text repairs. Returns the patch, or null when nothing could be repaired. */
export function __repairText(v: VideoRow) { return repairText(v); }
function repairText(v: VideoRow): Partial<VideoRow> | null {
  const h = { ...((v.hook ?? {}) as Record<string, string>) };
  let changed = false;
  const card1 = h.card1 ?? "";
  const spans = [...card1.matchAll(/\*[^*]+\*/g)];
  const span = spans.find((m) => /driving test|dmv/i.test(m[0])) ?? spans[0];
  let fixed = span ? card1.slice(0, span.index).replace(/\*/g, "") + span[0] + card1.slice(span.index! + span[0].length).replace(/\*/g, "")
    : card1.replace(/\*/g, "");
  if (!span) { // highlight "driving test" or "DMV" when the hook has no highlight
    const m = /driving test|dmv test|dmv/i.exec(fixed);
    if (m) fixed = fixed.slice(0, m.index) + `*${m[0]}*` + fixed.slice(m.index + m[0].length);
  }
  if (fixed !== card1) { h.card1 = fixed; changed = true; }
  for (const k of ["card2", "vo_line", "outro_vo"]) if (h[k]?.includes("*")) { h[k] = h[k].replace(/\*/g, ""); changed = true; }
  const caption = (v.caption ?? "").replace(/\*/g, "");
  const tags = [...new Set((v.hashtags ?? []).map((t) => "#" + String(t).replace(/^#+/, "").replace(/[^A-Za-z0-9_]/g, "")).filter((t) => t.length > 2))].slice(0, 8);
  const patch: Partial<VideoRow> = {};
  if (changed) patch.hook = h as VideoRow["hook"];
  if (caption !== (v.caption ?? "")) patch.caption = caption;
  if (JSON.stringify(tags) !== JSON.stringify(v.hashtags ?? [])) patch.hashtags = tags;
  return Object.keys(patch).length ? patch : null;
}

/** Re-render the cover of the downloaded file with the row's card 1 and upload the result. */
function rerenderCover(v: VideoRow): string {
  const dir = path.join(OUT, "qa", v.id); const src = path.join(dir, "video.mp4"); const out = path.join(dir, "fixed.mp4");
  if (!fs.existsSync(src)) throw new Error("no downloaded file to repair");
  const r = spawnSync("npx", ["tsx", "tools/fix/recover.ts", src, String(meta(v).theme ?? "light"), String((v.hook as any)?.card1 ?? ""), out],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, NODE_NO_WARNINGS: "1" } });
  if (r.status !== 0) throw new Error(`cover re-render failed (exit ${r.status})`);
  return out;
}

async function saveQa(v: VideoRow, q: QaResult, extra: Record<string, unknown> = {}) {
  return updateVideo(v.id, { metrics: { ...meta(v), ...extra, qa: q }, error: q.pass ? null : qaSummary(q).slice(0, 500) });
}

export async function qaOne(v: VideoRow, opts: { fix: boolean }): Promise<boolean> {
  if (QA.blockFormats.includes(v.format)) {
    await updateVideo(v.id, { status: "skipped", approved: false, error: `QA: ${v.format} is a test format, never published` });
    console.log(`skipped ${v.id} (test format)`); return false;
  }
  let q = await qaVideo(v);
  if (!q.pass && opts.fix && q.fixable.length && !meta(v).qa_fix_attempted) {
    console.log(`fixing ${v.id}: ${q.fixable.join(", ")}`);
    try {
      const patch = repairText(v) ?? {};
      // the ingest `update` action does not accept hook; `upsert` does and only touches the fields it is given
      if (patch.hook) await upsertVideo({ id: v.id, format: v.format, lang: v.lang, hook: patch.hook });
      const { hook: _h, ...rest } = patch;
      let row = await updateVideo(v.id, { ...rest, metrics: { ...meta(v), qa_fix_attempted: true } });
      const coverChanged = !!patch.hook && (patch.hook as any).card1 !== (v.hook as any)?.card1;
      if (coverChanged || q.fixable.includes("cover")) {
        if (textChecks(row).some((c) => !c.ok && c.name.startsWith("text:cover"))) throw new Error("card 1 still fails the text checks; needs a new hook");
        const file = rerenderCover(row);
        const video_url = await uploadFile(v.id, "video", file);
        const thumb = path.join(OUT, "qa", v.id, "cover.jpg");
        spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-y", "-i", file, "-frames:v", "1", "-q:v", "3", thumb]);
        const thumb_url = await uploadFile(v.id, "thumb", thumb);
        row = await updateVideo(v.id, { video_url, thumb_url, metrics: { ...meta(row), cover_fixed: new Date().toISOString() } });
      }
      q = await qaVideo(row); v = row;
    } catch (e) { console.log(`fix failed ${v.id}: ${(e as Error).message}`); }
  }
  await saveQa(v, q);
  console.log(`${q.pass ? "PASS" : "HELD"} ${v.id}  ${q.pass ? "" : qaSummary(q)}`);
  return q.pass;
}

/** QA every ready video without a passing result for its current file, and approved ones whose file changed. */
export async function qaStep(ids: string[] = [], opts = { fix: true }): Promise<{ pass: number; held: number }> {
  const rows = ids.length ? (await listVideos(null, 200)).filter((v) => ids.includes(v.id))
    : [...(await listVideos("ready", 50)), ...(await listVideos("approved", 50))].filter((v) => !qaPassed(v));
  let pass = 0, held = 0;
  for (const v of rows) (await qaOne(v, opts)) ? pass++ : held++;
  if (!rows.length) console.log("qa: nothing to check");
  return { pass, held };
}

export async function autoApprove(): Promise<number> {
  if (!POSTING.autoApprove) { console.log("auto-approve: off (POSTING.autoApprove)"); return 0; }
  const ready = (await listVideos("ready", 50)).filter(qaPassed);
  for (const v of ready) { await updateVideo(v.id, { approved: true, status: "approved" }); console.log(`auto-approved ${v.id}`); }
  if (!ready.length) console.log("auto-approve: nothing passed QA");
  return ready.length;
}

/** Take a video back for fixing. Scheduled posts are cancelled in Postiz; a post that is already live has to be
 *  deleted in the TikTok and Instagram apps (Postiz cannot remove a published post from the platforms). */
export async function retract(id: string, reason: string): Promise<void> {
  const v = (await listVideos(null, 200)).find((x) => x.id === id);
  if (!v) throw new Error(`no video ${id}`);
  const m = meta(v);
  const postIds: string[] = [...new Set([v.post_id, ...(m.postiz_post_ids ?? [])].filter(Boolean))] as string[];
  if (v.status === "scheduled") for (const pid of postIds) {
    const r = await ingestCall<{ status?: number; error?: string }>({ action: "postiz", method: "DELETE", path: `/posts/${pid}` });
    console.log(`postiz delete ${pid}: ${JSON.stringify(r).slice(0, 120)}`);
  }
  const live = v.status === "posted";
  await updateVideo(id, { status: "ready", approved: false, scheduled_at: null, post_id: null, error: `retracted: ${reason}`,
    metrics: { ...m, qa: undefined, qa_fix_attempted: false, postiz_post_ids: [],
      retracted: [...(m.retracted ?? []), { at: new Date().toISOString(), reason, was: v.status, post_url: v.post_url ?? null, post_ids: postIds }] } } as Partial<VideoRow>);
  console.log(`retracted ${id} (${reason}). ${live ? "It was live: delete it in the TikTok and Instagram apps. " : ""}Next: fix, then \`qa ${id}\`, then \`approve ${id}\`.`);
}
