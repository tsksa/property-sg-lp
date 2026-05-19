import { AbsoluteFill } from "remotion";
import { CodeBlock, COLORS, FadeIn, SceneTitle, StepBadge } from "../ui";

export const Install = () => {
  return (
    <AbsoluteFill style={{ padding: 120, justifyContent: "center" }}>
      <FadeIn from={0} duration={14}>
        <StepBadge n={1} label="Install" />
      </FadeIn>
      <FadeIn from={6} duration={16}>
        <SceneTitle>
          <div style={{ marginTop: 24 }}>One command to scaffold a project.</div>
        </SceneTitle>
      </FadeIn>
      <div style={{ marginTop: 60 }}>
        <FadeIn from={18} duration={14}>
          <CodeBlock
            appearFrom={22}
            perLine={8}
            lines={[
              { text: "$ npm create video@latest", color: COLORS.green },
              { text: "" },
              { text: "✔ What should we call your video?", color: COLORS.muted },
              { text: "  · my-first-video", color: COLORS.text },
              { text: "✔ Choose a template", color: COLORS.muted },
              { text: "  · Hello World", color: COLORS.text },
              { text: "" },
              { text: "→ cd my-first-video && npm start", color: COLORS.accent },
            ]}
          />
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
};
