import { AbsoluteFill } from "remotion";
import { CodeBlock, COLORS, FadeIn, SceneTitle, StepBadge } from "../ui";

export const Render = () => {
  return (
    <AbsoluteFill style={{ padding: 120, justifyContent: "center" }}>
      <FadeIn from={0} duration={14}>
        <StepBadge n={4} label="Preview & render" />
      </FadeIn>
      <FadeIn from={6} duration={16}>
        <SceneTitle>
          <div style={{ marginTop: 18 }}>Two commands. Done.</div>
        </SceneTitle>
      </FadeIn>
      <div style={{ marginTop: 50 }}>
        <FadeIn from={18} duration={14}>
          <CodeBlock
            appearFrom={24}
            perLine={10}
            lines={[
              { text: "# Live preview in the browser", color: COLORS.muted },
              { text: "$ npm start", color: COLORS.green },
              { text: "" },
              { text: "# Render an MP4 file", color: COLORS.muted },
              { text: "$ npx remotion render MyVideo out.mp4", color: COLORS.green },
            ]}
          />
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
};
