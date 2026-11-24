/** One nightly run: render the weekday's formats (two videos), schedule approved videos, sync states and metrics,
 *  then print the daily report (weekly on Sunday). Deterministic so a scheduled session only runs `npm run nightly`. */
import { spawnSync } from "node:child_process";
import { EXTRA_RENDERS, NIGHTLY_ROTATION, POSTING } from "./config";

const weekday = new Intl.DateTimeFormat("en-US", { timeZone: POSTING.timezone, weekday: "short" }).format(new Date());
const formats = process.env.NIGHTLY_FORMAT ? process.env.NIGHTLY_FORMAT.split(",") : NIGHTLY_ROTATION[weekday] ?? ["pass5"];
const lang = process.env.NIGHTLY_LANG || "en";
// one-off replacements (config EXTRA_RENDERS), rendered only by the run whose ET date matches
const today = new Intl.DateTimeFormat("en-CA", { timeZone: POSTING.timezone }).format(new Date());
if (!process.env.NIGHTLY_FORMAT) for (const x of EXTRA_RENDERS) if (x.on === today) formats.push(x.format);

function step(name: string, args: string[]): boolean {
  console.log(`\n=== ${name}: tsx src/cli.ts ${args.join(" ")}`);
  const r = spawnSync("npx", ["tsx", "src/cli.ts", ...args], { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  if (r.status !== 0) console.error(`=== ${name} FAILED (exit ${r.status})`);
  return r.status === 0;
}

/** make, with its output echoed and the last error line kept (2026-11-24: failed makes left no trace in the ledger). */
function makeStep(name: string, fmt: string): { ok: boolean; err: string } {
  console.log(`\n=== ${name}: tsx src/cli.ts make --format ${fmt} --lang ${lang} --count 1`);
  const r = spawnSync("npx", ["tsx", "src/cli.ts", "make", "--format", fmt, "--lang", lang, "--count", "1"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  process.stdout.write(r.stdout ?? ""); process.stderr.write(r.stderr ?? "");
  const lines = `${r.stderr ?? ""}`.split("\n").map((l) => l.trim()).filter((l) => l && !/UNDICI|trace-warnings|memory|Memory|lower amount/.test(l));
  if (r.status !== 0) console.error(`=== ${name} FAILED (exit ${r.status})`);
  return { ok: r.status === 0, err: (lines.at(-1) ?? `exit ${r.status}`).slice(0, 300) };
}

// A slot needs a video (decision 2026-11-24, after two nights with empty slots): a failed make is retried once, then
// replaced by its control format; every failure is written to the ledger (status skipped, "make failed: ...") so the
// report and the watchdog see it.
const FALLBACK: Record<string, string> = { signs7q: "signs7", pass5q: "pass5", debate1: "row5", quick3: "pass5", pick6: "signs7", signs7: "pass5", row5: "pass5", tricky5: "pass5", classic30: "pass5" };
const results: Record<string, boolean> = {};
const makeFailures: string[] = [];
for (const f of formats) {
  let r = makeStep(`render ${f}`, f);
  if (!r.ok) { makeFailures.push(`${f}: ${r.err}`); step(`log failure ${f}`, ["make-failed", f, lang, r.err]); r = makeStep(`render ${f} (retry)`, f); }
  if (!r.ok) {
    makeFailures.push(`${f} retry: ${r.err}`); step(`log failure ${f} retry`, ["make-failed", f, lang, r.err]);
    const fb = FALLBACK[f] ?? "pass5";
    r = makeStep(`render ${fb} (fallback for ${f})`, fb);
    if (!r.ok) { makeFailures.push(`${fb} fallback: ${r.err}`); step(`log failure ${fb}`, ["make-failed", fb, lang, r.err]); }
  }
  results[`render:${f}`] = r.ok;
}
if (makeFailures.length) console.log(`MAKE FAILURES ${makeFailures.join(" | ")}`);
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
    const m = makeStep(`remake ${h.format}`, h.format);
    if (!m.ok) step(`log failure remake ${h.format}`, ["make-failed", h.format, h.lang || lang, m.err]);
    const ok = m.ok;
    remade.push(`${h.format}:${ok ? "made" : "failed"}`);
  }
  step(`qa round ${round}`, ["qa"]);
  step(`auto-approve round ${round}`, ["auto-approve"]);
}
if (remade.length) console.log(`REMAKES ${remade.join(" ")}`);
results.publish = step("publish", ["publish", "--count", String(POSTING.perDay)]);
results.sync = step("sync", ["sync"]);
results.report = step("report", ["report", ...(weekday === "Sun" ? ["weekly"] : [])]);
console.log(`\nNIGHTLY SUMMARY ${new Date().toISOString()} weekday=${weekday} formats=${formats.join("+")} remakes=${remade.length} make_failures=${makeFailures.length} ${JSON.stringify(results)}`);
process.exit(Object.values(results).every(Boolean) ? 0 : 1);
