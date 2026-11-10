import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Lang, QuestionSegment } from "../src/types";
import { Captions } from "./Captions";

const R = 26, C = 2 * Math.PI * R;
const LETTERS = ["A", "B", "C", "D"];

export const QuestionScene: React.FC<{ seg: QuestionSegment; lang: Lang }> = ({ seg, lang }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const es = lang === "es";
  const { q, idx, n } = seg;
  const phase = frame < seg.questionFrames ? "question" : frame < seg.questionFrames + seg.dimFrames ? "dim" : "reveal";
  const reveal = phase === "reveal";
  const revealFrame = frame - seg.questionFrames - seg.dimFrames;

  // countdown ring: continuous
  const remaining = Math.max(0, seg.countdownSeconds - frame / fps);
  const revealRemaining = Math.max(0, (seg.revealFrames - revealFrame) / fps);
  const progress = reveal ? Math.min(1, revealFrame / seg.revealFrames) : remaining / seg.countdownSeconds;
  const num = reveal ? Math.ceil(revealRemaining) : Math.ceil(remaining);
  const urgent = !reveal && remaining > 0 && remaining <= 3;
  const pulse = urgent ? 0.6 + 0.4 * Math.abs(Math.cos((frame / fps) * Math.PI)) : 1;
  const ringScale = urgent ? 1 + 0.08 * Math.abs(Math.sin((frame / fps) * Math.PI)) : 1;

  // entrance
  const enter = (delay: number) => spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 190 } });
  const qIn = enter(0);
  const dimOpacity = phase === "dim" ? interpolate(frame - seg.questionFrames, [0, seg.dimFrames], [0, 1], { extrapolateRight: "clamp" }) : 0;
  const pop = spring({ frame: revealFrame, fps, config: { damping: 9, stiffness: 240, mass: 0.7 } });
  const explIn = spring({ frame: revealFrame - 6, fps, config: { damping: 16, stiffness: 180 } });

  const img = q.image ? (q.image.startsWith("http") || q.image.startsWith("../") ? q.image : staticFile(q.image)) : null;
  // visual layout: big picture + 2x2 answers when every answer is short (diagram and sign questions)
  const visual = !!img && Object.values(q.answers).every((a) => a.length <= 22);
  const clip = reveal ? seg.revealVo : seg.vo;
  const capOffset = reveal ? seg.questionFrames + seg.dimFrames : 0;

  return (
    <div className={`studio ${reveal ? "reveal" : ""}`}>
      <div className="studio-header">
        <div className="hdr">
          <div className="l"><span className="back">←</span><span className="title">{es ? "Pregunta" : "Question"} {idx + 1} {es ? "de" : "of"} {n}</span><span className="back">❚❚</span></div>
          <span className={`studio-timer ${urgent ? "urgent" : ""} ${reveal ? "rv" : ""}`} style={{ transform: `scale(${ringScale})` }}>
            <svg className="studio-ring" viewBox="0 0 64 64">
              <circle className="studio-ring-bg" cx="32" cy="32" r={R} />
              <circle className="studio-ring-fg" cx="32" cy="32" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - progress)} transform="rotate(-90 32 32)" />
            </svg>
            <span className="studio-ring-num" style={{ opacity: pulse }}>{reveal ? "✓" : num}</span>
          </span>
        </div>
        <div className="progress"><i style={{ width: `${((idx + (reveal ? 1 : 0.5)) / n) * 100}%`, transition: "none" }} /></div>
      </div>
      <div className={`studio-main ${img ? "has-image" : ""} ${visual ? "visual" : ""}`}>
        <p className="studio-question" style={{ opacity: qIn, transform: `translateY(${(1 - qIn) * 12}px)` }}>{q.question_text}</p>
        {img && <div className="studio-image" style={{ opacity: enter(3), transform: `scale(${0.96 + 0.04 * enter(3)})` }}><Img src={img} /></div>}
        <div className="studio-answers">
          {LETTERS.map((k, i) => {
            const ok = q.correct_answer === k;
            const e = enter(5 + i * 3);
            const faded = reveal && !ok;
            const scale = reveal && ok ? 0.92 + 0.08 * pop + (pop > 0.6 ? 0.04 * (1 - pop) : 0) : 1;
            return (
              <div key={k} className={`studio-answer ${reveal && ok ? "correct" : ""}`}
                style={{ opacity: faded ? 0.45 : e, transform: `translateY(${(1 - e) * 14}px) scale(${scale})`, color: faded ? "hsl(var(--muted-foreground))" : undefined }}>
                <span className="studio-letter">{k}</span>
                <span className="t">{q.answers[k]}</span>
                {reveal && ok && (
                  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="hsl(155 48% 34%)" strokeWidth="2.2" style={{ transform: `scale(${pop})` }}>
                    <circle cx="12" cy="12" r="10" /><path d="m8.5 12.5 2.5 2.5 5-5" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
        {reveal && q.explanation && (
          <p className="studio-explanation" style={{ opacity: explIn, transform: `translateY(${(1 - explIn) * 10}px)` }}><span className="clamp">{q.explanation}</span></p>
        )}
      </div>
      <div className="studio-footer">
        {phase !== "dim" && <Captions clip={clip} offset={capOffset} />}
      </div>
      {phase === "dim" && <div className="dim" style={{ opacity: dimOpacity }} />}
    </div>
  );
};
