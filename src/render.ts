import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { ROOT, PUBLIC } from "./env";
import type { Plan } from "./types";

let serveUrl: string | null = null;

/** Single frames of a plan (pre-render check, 2026-11-21): same bundle as the full render, a fraction of the time. */
export async function renderStills(plan: Plan, frames: number[], dir: string, scale = 0.5): Promise<string[]> {
  serveUrl ??= await bundle({ entryPoint: path.join(ROOT, "remotion/index.ts"), publicDir: PUBLIC, onProgress: () => {} });
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  const inputProps = { plan };
  const composition = await selectComposition({ serveUrl, id: "Quiz", inputProps, browserExecutable });
  fs.mkdirSync(dir, { recursive: true });
  const out: string[] = [];
  for (const f of frames) {
    const output = path.join(dir, `f${f}.png`);
    await renderStill({ composition, serveUrl, output, frame: Math.max(0, Math.min(plan.durationInFrames - 1, f)), inputProps, browserExecutable, scale });
    out.push(output);
  }
  return out;
}

export async function renderPlan(plan: Plan, outFile: string) {
  serveUrl ??= await bundle({ entryPoint: path.join(ROOT, "remotion/index.ts"), publicDir: PUBLIC, onProgress: () => {} });
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  const inputProps = { plan };
  const composition = await selectComposition({ serveUrl, id: "Quiz", inputProps, browserExecutable });
  let last = -1;
  await renderMedia({
    composition, serveUrl, codec: "h264", crf: 18, outputLocation: outFile, inputProps, browserExecutable,
    audioBitrate: "192k", imageFormat: "jpeg", jpegQuality: 90,
    onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; process.stdout.write(`  render ${p * 10}%\r`); } },
  });
  process.stdout.write("\n");
}
