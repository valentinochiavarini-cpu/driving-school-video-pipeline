import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { Clip } from "../src/types";

/** Word captions for one clip; the clip starts at frame 0 of the enclosing sequence plus `offset` frames. */
export const Captions: React.FC<{ clip: Clip; offset?: number; perLine?: number }> = ({ clip, offset = 0, perLine = 4 }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const t = (frame - offset) / fps;
  const words = clip.words;
  if (!words.length) return null;
  let cur = words.findIndex((w) => t < w.end);
  if (cur < 0) cur = words.length - 1;
  const lineStart = Math.floor(cur / perLine) * perLine;
  const line = words.slice(lineStart, lineStart + perLine);
  if (t < words[0].start - 0.3 || t > words[words.length - 1].end + 0.6) return null;
  return (
    <div className="cap">
      {line.map((w, i) => {
        const k = lineStart + i;
        const cls = k < cur ? "done" : k === cur && t >= w.start ? "on" : "";
        return <span key={k} className={cls}>{w.text}</span>;
      })}
    </div>
  );
};
