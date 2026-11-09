import React from "react";
import { Composition } from "remotion";
import { Video } from "./Video";
import { demoPlan } from "./demo";
import type { Plan } from "../src/types";

export const Root: React.FC = () => (
  <Composition
    id="Quiz"
    component={Video}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={300}
    defaultProps={{ plan: demoPlan() }}
    calculateMetadata={({ props }) => ({ durationInFrames: (props as { plan: Plan }).plan.durationInFrames, fps: 30 })}
  />
);
