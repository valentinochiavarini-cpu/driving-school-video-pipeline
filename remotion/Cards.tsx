import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND } from "../src/config";
import type { Plan } from "../src/types";

const Logo: React.FC<{ name: string }> = ({ name }) => {
  const frame = useCurrentFrame();
  return <>
    <div className="logo">{BRAND.logoWhite ? <Img src={staticFile(BRAND.logoWhite)} className="logo-img" /> : name}</div>
    <div className="road" style={{ transform: `translateX(${-(frame * 1.2) % 40}px)` }} />
  </>;
};

export const HookCard1: React.FC<{ plan: Plan }> = ({ plan }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 180, mass: 0.8 } });
  const emPop = spring({ frame: frame - 6, fps, config: { damping: 13, stiffness: 220 } });
  const sub = interpolate(frame, [0, 14], [0.75, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const parts = plan.hook.card1.split(/\*(\S+)\*/);
  return (
    <div className="card">
      <Logo name={plan.brand.name} />
      <h1 style={{ transform: `scale(${0.94 + 0.06 * pop})` }}>
        {parts.map((p, i) => i % 2 === 1
          ? <em key={i} style={{ transform: `scale(${1 + 0.08 * Math.sin(Math.PI * Math.min(1, emPop))}) rotate(${-2 + 2 * emPop}deg)` }}>{p}</em>
          : <span key={i}>{p}</span>)}
      </h1>
      <h2 style={{ opacity: sub, transform: `translateY(${(1 - sub) * 20}px)` }}>{plan.hook.sub}</h2>
    </div>
  );
};

export const HookCard2: React.FC<{ plan: Plan }> = ({ plan }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const inA = spring({ frame, fps, config: { damping: 14, stiffness: 160 } });
  const pill = spring({ frame: frame - 8, fps, config: { damping: 10, stiffness: 200 } });
  const pulse = 1 + 0.03 * Math.sin((frame / fps) * Math.PI * 3);
  return (
    <div className="card">
      <Logo name={plan.brand.name} />
      <h1 style={{ transform: `translateY(${(1 - inA) * 30}px)`, opacity: inA }}>{plan.hook.card2}</h1>
      <div className="pill" style={{ transform: `scale(${pill * pulse})`, opacity: pill }}>{plan.hook.pill} →</div>
    </div>
  );
};

export const Outro: React.FC<{ plan: Plan }> = ({ plan }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const es = plan.lang === "es"; const n = plan.questions.length;
  const inA = spring({ frame, fps, config: { damping: 12, stiffness: 170 } });
  const pulse = 1 + 0.04 * Math.sin((frame / fps) * Math.PI * 2.5);
  return (
    <div className="card">
      <Logo name={plan.brand.name} />
      <h1 style={{ transform: `scale(${0.85 + 0.15 * inA})`, opacity: inA }}>{es ? <>DEJA TU <em>PUNTAJE</em></> : <>DROP YOUR <em>SCORE</em></>}</h1>
      <h2 style={{ opacity: inA }}>{es ? "en los comentarios" : "in the comments"}</h2>
      <div className="scores">
        {(n <= 7 ? Array.from({ length: n }, (_, i) => `${i + 1}/${n}`) : [`<${Math.ceil(n * 0.8)}/${n}`, `${Math.ceil(n * 0.8)}/${n} ${es ? "APROBADO" : "PASS"}`, `${n}/${n}`]).map((label, i) => {
          const s = spring({ frame: frame - 8 - i * 3, fps, config: { damping: 10, stiffness: 220 } });
          return <span key={i} className={n > 7 ? "wide" : ""} style={{ transform: `scale(${s})`, opacity: s }}>{label}</span>;
        })}
      </div>
      <div className="pill" style={{ transform: `scale(${pulse})` }}>{es ? BRAND.ctaEs : plan.brand.cta} →</div>
    </div>
  );
};
