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

// Self-healing (decision 2026-11-19): a video still held after QA and its text repair is replaced by a fresh video of
// the same format (new questions, new hook), which goes through QA again. Up to 2 rounds, within the time budget,
// so a hold costs render time instead of an empty posting slot.
const started = Date.now();
const remade: string[] = [];
for (let round = 1; round <= 2; round++) {
  if (Date.now() - started > 40 * 60e3) { console.log("remake: time budget used, leaving the rest held"); break; }
  const out = spawnSync("npx", ["tsx", "src/cli.ts", "held"], { encoding: "utf8", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  const line = (out.stdout ?? "").split("\n").find((l) => l.startsWith("HELD_JSON "));
  const held: { id: string; format: string; lang: string; error: string | null }[] = line ? JSON.parse(line.slice(10)) : [];
  if (!held.length) break;
  for (const h of held) {
    step(`retire ${h.id}`, ["skip", h.id, `replaced by a remake (round ${round}): ${(h.error ?? "").slice(0, 300)}`]);
    const ok = step(`remake ${h.format}`, ["make", "--format", h.format, "--lang", h.lang || lang, "--count", "1"]);
    remade.push(`${h.format}:${ok ? "made" : "failed"}`);
  }
  step(`qa round ${round}`, ["qa"]);
  step(`auto-approve round ${round}`, ["auto-approve"]);
}
if (remade.length) console.log(`REMAKES ${remade.join(" ")}`);
results.publish = step("publish", ["publish", "--count", String(POSTING.perDay)]);
results.sync = step("sync", ["sync"]);
results.report = step("report", ["report", ...(weekday === "Sun" ? ["weekly"] : [])]);
console.log(`\nNIGHTLY SUMMARY ${new Date().toISOString()} weekday=${weekday} formats=${formats.join("+")} remakes=${remade.length} ${JSON.stringify(results)}`);
process.exit(Object.values(results).every(Boolean) ? 0 : 1);
