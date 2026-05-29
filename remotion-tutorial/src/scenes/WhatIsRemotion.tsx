import { AbsoluteFill } from "remotion";
import { COLORS, FadeIn, SceneTitle } from "../ui";

const bullets = [
  { icon: "⚛️", label: "Write videos in React" },
  { icon: "🎬", label: "Compose scenes with JSX & CSS" },
  { icon: "📐", label: "Animate by frame number" },
  { icon: "🚀", label: "Render to MP4 from the CLI" },
];

export const WhatIsRemotion = () => {
  return (
    <AbsoluteFill style={{ padding: 120, justifyContent: "center" }}>
      <FadeIn from={0} duration={18}>
        <SceneTitle>What is Remotion?</SceneTitle>
      </FadeIn>
      <FadeIn from={10} duration={18}>
        <div style={{ fontSize: 38, color: COLORS.muted, marginTop: 20, marginBottom: 60 }}>
          A framework for creating videos programmatically.
        </div>
      </FadeIn>
      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        {bullets.map((b, i) => (
          <FadeIn key={i} from={24 + i * 14} duration={16}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 28,
                background: COLORS.panel,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 16,
                padding: "24px 36px",
                fontSize: 44,
                color: COLORS.text,
                width: "fit-content",
              }}
            >
              <span style={{ fontSize: 52 }}>{b.icon}</span>
              {b.label}
            </div>
          </FadeIn>
        ))}
      </div>
    </AbsoluteFill>
  );
};
