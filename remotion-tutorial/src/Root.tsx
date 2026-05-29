import { Composition } from "remotion";
import { HowToRemotion } from "./HowToRemotion";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

const DURATION_IN_FRAMES =
  90 + // Title
  120 + // What is Remotion
  120 + // Install
  180 + // Composition code
  180 + // Animate
  120 + // Render
  90; // Outro

export const Root = () => {
  return (
    <Composition
      id="HowToRemotion"
      component={HowToRemotion}
      durationInFrames={DURATION_IN_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
