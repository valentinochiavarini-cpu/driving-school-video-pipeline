/** One nightly run: pick the format by weekday, render one video (ledger: ready), schedule approved videos, sync states.
 *  Deterministic so a scheduled session only has to run `npm run nightly` and report the output. */
import { spawnSync } from "node:child_process";
import { POSTING } from "./config";

const ROTATION: Record<string, string> = { Mon: "pass5", Tue: "signs7", Wed: "row5", Thu: "pass10", Fri: "tricky5", Sat: "classic30", Sun: "pass5" };
const weekday = new Intl.DateTimeFormat("en-US", { timeZone: POSTING.timezone, weekday: "short" }).format(new Date());
const format = process.env.NIGHTLY_FORMAT || ROTATION[weekday] || "pass5";
const lang = process.env.NIGHTLY_LANG || "en";

function step(name: string, args: string[]): boolean {
  console.log(`\n=== ${name}: tsx src/cli.ts ${args.join(" ")}`);
  const r = spawnSync("npx", ["tsx", "src/cli.ts", ...args], { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  if (r.status !== 0) console.error(`=== ${name} FAILED (exit ${r.status})`);
  return r.status === 0;
}

const results = {
  render: step("render", ["make", "--format", format, "--lang", lang, "--count", "1"]),
  publish: step("publish", ["publish", "--count", "1"]),
  sync: step("sync", ["sync"]),
};
console.log(`\nNIGHTLY SUMMARY ${new Date().toISOString()} weekday=${weekday} format=${format} ${JSON.stringify(results)}`);
process.exit(Object.values(results).every(Boolean) ? 0 : 1);
