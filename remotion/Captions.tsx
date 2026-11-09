import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { Clip, Word } from "../src/types";

/** Split words into caption chunks: break after punctuation, never more than `max` words per chunk. */
export function chunkWords(words: Word[], max = 4): Word[][] {
  const chunks: Word[][] = []; let cur: Word[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= max || /[.!?,;:]$/.test(w.text)) { chunks.push(cur); cur = []; }
  }
  if (cur.length) { if (cur.length === 1 && chunks.length) chunks[chunks.length - 1].push(cur[0]); else chunks.push(cur); }
  return chunks;
}

/** Word captions for one clip; the clip starts at frame `offset` of the enclosing sequence. */
export const Captions: React.FC<{ clip: Clip; offset?: number }> = ({ clip, offset = 0 }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const t = (frame - offset) / fps;
  const words = clip.words;
  if (!words.length) return null;
  if (t < words[0].start - 0.3 || t > words[words.length - 1].end + 0.6) return null;
  const chunks = chunkWords(words);
  let chunk = chunks.find((c) => t < c[c.length - 1].end) ?? chunks[chunks.length - 1];
  return (
    <div className="cap">
      {chunk.map((w, i) => {
        const cls = t >= w.end ? "done" : t >= w.start ? "on" : "";
        return <span key={i} className={cls}>{w.text}</span>;
      })}
    </div>
  );
};
