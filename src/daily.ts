/** Daily upkeep (decision 2026-11-26), no rendering: sync post states and metrics, fill any empty slot in the next
 *  BATCH.dailyFillHours from the buffer, sync again, review newly posted videos, print the report. `npm run daily`. */
import { spawnSync } from "node:child_process";
import { BATCH, POSTING } from "./config";

function step(name: string, args: string[]): boolean {
  console.log(`\n=== ${name}: tsx src/cli.ts ${args.join(" ")}`);
  const r = spawnSync("npx", ["tsx", "src/cli.ts", ...args], { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  if (r.status !== 0) console.error(`=== ${name} FAILED (exit ${r.status})`);
  return r.status === 0;
}
const results: Record<string, boolean> = {};
results.sync = step("sync", ["sync"]);
// pre-post review first, so a video it pulls is replaced from the buffer by the fill step right after (2026-11-26)
results.upcoming = step("review upcoming videos", ["review", "--upcoming"]);
results.fill = step("fill empty slots from buffer", ["publish", "--count", String(POSTING.perDay * 2), "--within-hours", String(BATCH.dailyFillHours)]);
results.sync2 = step("sync", ["sync"]);
results.buffer = step("buffer", ["buffer"]);
// every posted video is reviewed once, the day after it posts (decision 2026-11-26), src/review.ts
results.review = step("review posted videos", ["review"]);
results.report = step("report", ["report"]);
console.log(`\nDAILY SUMMARY ${new Date().toISOString()} ${JSON.stringify(results)}`);
process.exit(Object.values(results).every(Boolean) ? 0 : 1);
