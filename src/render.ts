import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { ROOT, PUBLIC } from "./env";
import type { Plan } from "./types";

let serveUrl: string | null = null;

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
