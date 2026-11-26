/** Batch production (decision 2026-11-26): make several posting days at once, twice a week (config BATCH), plus enough
 *  spare videos to keep BATCH.buffer approved and unscheduled. Then the normal production run (src/nightly.ts): QA,
 *  remakes, publish into the next free slots, sync, report. `npm run batch`. Override the days with
 *  BATCH_DAYS=Thu,Fri,Sat,Sun (catch-up or a rerun after a failed batch). */
import { spawnSync } from "node:child_process";
import { BATCH, NIGHTLY_ROTATION, POSTING } from "./config";

const weekday = new Intl.DateTimeFormat("en-US", { timeZone: POSTING.timezone, weekday: "short" }).format(new Date());
const days = process.env.BATCH_DAYS ? process.env.BATCH_DAYS.split(",").map((d) => d.trim()) : BATCH.covers[weekday] ?? [];
if (!days.length && process.env.BATCH_PRINT === "1") { console.log("BATCH_DAYS none"); process.exit(0); }
if (!days.length) { console.log(`BATCH SUMMARY nothing to make: ${weekday} is not a batch day (BATCH.covers) and BATCH_DAYS is not set`); process.exit(0); }
// BATCH_PRINT=1: print the days this run makes and stop (the scheduled task runs them one day per command, each well
// inside the 2 h command limit: a 9 min classic30 takes about 25 minutes to render)
if (process.env.BATCH_PRINT === "1") { console.log(`BATCH_DAYS ${days.join(",")}`); process.exit(0); }
const unknown = days.filter((d) => !NIGHTLY_ROTATION[d]);
if (unknown.length) throw new Error(`BATCH_DAYS: unknown weekday ${unknown.join(",")} (use Mon..Sun)`);

const formats = days.flatMap((d) => NIGHTLY_ROTATION[d]);
const out = spawnSync("npx", ["tsx", "src/cli.ts", "buffer"], { encoding: "utf8", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
const line = (out.stdout ?? "").split("\n").find((l) => l.startsWith("BUFFER_JSON "));
const buffer: unknown[] = line ? JSON.parse(line.slice(12)) : [];
const extra = Math.max(0, BATCH.buffer - buffer.length);
for (let i = 0; i < extra; i++) formats.push(BATCH.bufferFormats[i % BATCH.bufferFormats.length]);
const publishCount = days.length * POSTING.perDay;
console.log(`BATCH PLAN ${new Date().toISOString()} run=${weekday} days=${days.join(",")} formats=${formats.length} (${formats.join("+")}) buffer_now=${buffer.length} extra=${extra} publish=${publishCount}`);

const r = spawnSync("npx", ["tsx", "src/nightly.ts"], { stdio: "inherit", env: { ...process.env, NIGHTLY_FORMAT: formats.join(","),
  PUBLISH_COUNT: String(publishCount), REMAKE_BUDGET_MIN: String(BATCH.remakeBudgetMinutes), REPORT_WEEKLY: "0" } });
console.log(`BATCH SUMMARY days=${days.join(",")} made_for=${formats.length} exit=${r.status}`);
process.exit(r.status ?? 1);
