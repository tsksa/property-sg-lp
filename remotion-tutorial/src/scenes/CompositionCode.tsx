import { AbsoluteFill } from "remotion";
import { CodeBlock, COLORS, FadeIn, SceneTitle, StepBadge } from "../ui";

export const CompositionCode = () => {
  return (
    <AbsoluteFill style={{ padding: 100, justifyContent: "center" }}>
      <FadeIn from={0} duration={14}>
        <StepBadge n={2} label="Write a composition" />
      </FadeIn>
      <FadeIn from={6} duration={16}>
        <SceneTitle>
          <div style={{ marginTop: 18 }}>It's just a React component.</div>
        </SceneTitle>
      </FadeIn>
      <div style={{ marginTop: 36, display: "flex", justifyContent: "center" }}>
        <FadeIn from={18} duration={14}>
          <CodeBlock
            appearFrom={24}
            perLine={6}
            lines={[
              { text: "import { Composition } from 'remotion';", color: COLORS.purple },
              { text: "import { MyVideo } from './MyVideo';", color: COLORS.purple },
              { text: "" },
              { text: "export const Root = () => (", color: COLORS.text },
              { text: "  <Composition", color: COLORS.accent },
              { text: "    id=\"MyVideo\"", color: COLORS.green },
              { text: "    component={MyVideo}", color: COLORS.green },
              { text: "    durationInFrames={150}", color: COLORS.yellow },
              { text: "    fps={30}", color: COLORS.yellow },
              { text: "    width={1920} height={1080}", color: COLORS.yellow },
              { text: "  />", color: COLORS.accent },
              { text: ");", color: COLORS.text },
            ]}
          />
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
};
