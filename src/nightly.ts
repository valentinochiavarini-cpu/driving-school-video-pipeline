/** One nightly run: render the weekday's formats (two videos), schedule approved videos, sync states and metrics,
 *  then print the daily report (weekly on Sunday). Deterministic so a scheduled session only runs `npm run nightly`. */
import { spawnSync } from "node:child_process";
import { NIGHTLY_ROTATION, POSTING } from "./config";

const weekday = new Intl.DateTimeFormat("en-US", { timeZone: POSTING.timezone, weekday: "short" }).format(new Date());
const formats = process.env.NIGHTLY_FORMAT ? process.env.NIGHTLY_FORMAT.split(",") : NIGHTLY_ROTATION[weekday] ?? ["pass5"];
const lang = process.env.NIGHTLY_LANG || "en";

function step(name: string, args: string[]): boolean {
  console.log(`\n=== ${name}: tsx src/cli.ts ${args.join(" ")}`);
  const r = spawnSync("npx", ["tsx", "src/cli.ts", ...args], { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  if (r.status !== 0) console.error(`=== ${name} FAILED (exit ${r.status})`);
  return r.status === 0;
}

const results: Record<string, boolean> = {};
for (const f of formats) results[`render:${f}`] = step(`render ${f}`, ["make", "--format", f, "--lang", lang, "--count", "1"]);
results.qa = step("qa", ["qa"]);
results.approve = step("auto-approve", ["auto-approve"]);
results.publish = step("publish", ["publish", "--count", String(POSTING.perDay)]);
results.sync = step("sync", ["sync"]);
results.report = step("report", ["report", ...(weekday === "Sun" ? ["weekly"] : [])]);
console.log(`\nNIGHTLY SUMMARY ${new Date().toISOString()} weekday=${weekday} formats=${formats.join("+")} ${JSON.stringify(results)}`);
process.exit(Object.values(results).every(Boolean) ? 0 : 1);
