import { AbsoluteFill, Sequence } from "remotion";
import { Title } from "./scenes/Title";
import { WhatIsRemotion } from "./scenes/WhatIsRemotion";
import { Install } from "./scenes/Install";
import { CompositionCode } from "./scenes/CompositionCode";
import { Animate } from "./scenes/Animate";
import { Render } from "./scenes/Render";
import { Outro } from "./scenes/Outro";

const TITLE = 90;
const WHAT = 120;
const INSTALL = 120;
const COMP = 180;
const ANIMATE = 180;
const RENDER = 120;
const OUTRO = 90;

export const HowToRemotion = () => {
  let from = 0;
  const next = (len: number) => {
    const start = from;
    from += len;
    return start;
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0e14", fontFamily: "Inter, system-ui, sans-serif" }}>
      <Sequence from={next(TITLE)} durationInFrames={TITLE}>
        <Title />
      </Sequence>
      <Sequence from={next(WHAT)} durationInFrames={WHAT}>
        <WhatIsRemotion />
      </Sequence>
      <Sequence from={next(INSTALL)} durationInFrames={INSTALL}>
        <Install />
      </Sequence>
      <Sequence from={next(COMP)} durationInFrames={COMP}>
        <CompositionCode />
      </Sequence>
      <Sequence from={next(ANIMATE)} durationInFrames={ANIMATE}>
        <Animate />
      </Sequence>
      <Sequence from={next(RENDER)} durationInFrames={RENDER}>
        <Render />
      </Sequence>
      <Sequence from={next(OUTRO)} durationInFrames={OUTRO}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};
