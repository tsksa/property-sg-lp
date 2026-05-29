import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CodeBlock, COLORS, FadeIn, StepBadge } from "../ui";

export const Animate = () => {
  const frame = useCurrentFrame();
  const start = 36;
  const end = 170;
  const x = interpolate(frame, [start, end], [0, 720], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const hue = interpolate(frame, [start, end], [210, 330], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ padding: 100 }}>
      <FadeIn from={0} duration={14}>
        <StepBadge n={3} label="Animate" />
      </FadeIn>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 60,
          alignItems: "center",
          marginTop: 60,
          flex: 1,
        }}
      >
        <FadeIn from={14} duration={16}>
          <CodeBlock
            appearFrom={20}
            perLine={6}
            lines={[
              { text: "const frame =", color: COLORS.text },
              { text: "  useCurrentFrame();", color: COLORS.accent },
              { text: "" },
              { text: "const x = interpolate(", color: COLORS.text },
              { text: "  frame,", color: COLORS.yellow },
              { text: "  [0, 60],", color: COLORS.green },
              { text: "  [0, 720],", color: COLORS.green },
              { text: ");", color: COLORS.text },
              { text: "" },
              { text: "<div style={{", color: COLORS.purple },
              { text: "  transform:", color: COLORS.text },
              { text: "    `translateX(${x}px)`,", color: COLORS.pink },
              { text: "}} />", color: COLORS.purple },
            ]}
          />
        </FadeIn>
        <FadeIn from={28} duration={16}>
          <div
            style={{
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 18,
              padding: 36,
              height: 480,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 18,
                left: 24,
                fontSize: 24,
                color: COLORS.muted,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Preview
            </div>
            <div
              style={{
                position: "absolute",
                bottom: 80,
                left: 40,
                width: 120,
                height: 120,
                borderRadius: "50%",
                background: `hsl(${hue}, 80%, 62%)`,
                boxShadow: `0 0 60px hsl(${hue}, 80%, 62%)`,
                transform: `translateX(${x}px)`,
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 40,
                left: 40,
                right: 40,
                height: 4,
                background: COLORS.border,
                borderRadius: 4,
              }}
            >
              <div
                style={{
                  width: `${interpolate(frame, [start, end], [0, 100], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })}%`,
                  height: "100%",
                  background: COLORS.accent,
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
};
