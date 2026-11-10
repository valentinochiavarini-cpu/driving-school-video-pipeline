import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import "./studio.css";
import { useInter } from "./fonts";
import { HookCard1, HookCard2, Outro } from "./Cards";
import { QuestionScene } from "./QuestionScene";
import type { Clip, Plan } from "../src/types";
import { SFX } from "../src/config";

const Voice: React.FC<{ clip: Clip; from: number }> = ({ clip, from }) =>
  clip.src ? <Sequence from={from} durationInFrames={Math.ceil(clip.duration * 30) + 2}><Audio src={staticFile(clip.src)} /></Sequence> : null;

const GAIN = { tick: SFX.tickGain, ding: SFX.dingGain, whoosh: SFX.whooshGain };

export const Video: React.FC<{ plan: Plan }> = ({ plan }) => {
  useInter();
  const h1 = plan.hook.hook1Frames, h2 = plan.hook.hook2Frames;
  return (
    <AbsoluteFill className={`theme-${plan.theme ?? "light"}`} style={{ background: plan.theme === "dark" ? "hsl(217 70% 9%)" : plan.theme === "ink" ? "hsl(217 92% 12%)" : "hsl(210 25% 98%)" }}>
      {/* brand cards are full-bleed: the navy covers the whole frame, the content stays inside the safe box */}
      <Sequence from={0} durationInFrames={h1 + h2} layout="none"><AbsoluteFill style={{ background: "hsl(217 92% 12%)" }} /></Sequence>
      <Sequence from={plan.outro.at} durationInFrames={plan.outro.frames} layout="none"><AbsoluteFill style={{ background: "hsl(217 92% 12%)" }} /></Sequence>
      <div className={`phone theme-${plan.theme ?? "light"}`}>
        <Sequence from={0} durationInFrames={h1} layout="none"><HookCard1 plan={plan} /></Sequence>
        <Sequence from={h1} durationInFrames={h2} layout="none"><HookCard2 plan={plan} /></Sequence>
        {plan.questions.map((seg) => (
          <Sequence key={seg.idx} from={seg.questionAt} durationInFrames={seg.questionFrames + seg.dimFrames + seg.revealFrames} layout="none">
            <QuestionScene seg={seg} lang={plan.lang} />
          </Sequence>
        ))}
        <Sequence from={plan.outro.at} durationInFrames={plan.outro.frames} layout="none"><Outro plan={plan} /></Sequence>
      </div>
      <Voice clip={plan.hook.vo} from={0} />
      {plan.questions.map((seg) => (
        <React.Fragment key={seg.idx}>
          <Voice clip={seg.vo} from={seg.questionAt} />
          <Voice clip={seg.revealVo} from={seg.revealAt} />
        </React.Fragment>
      ))}
      <Voice clip={plan.outro.vo} from={plan.outro.at} />
      {plan.cues.map((c, i) => (
        <Sequence key={i} from={c.at} durationInFrames={30}><Audio src={staticFile(`sfx/${c.kind}.wav`)} volume={GAIN[c.kind]} /></Sequence>
      ))}
      {plan.music.src && <Audio src={staticFile(plan.music.src)} volume={plan.music.gain} loop />}
    </AbsoluteFill>
  );
};
