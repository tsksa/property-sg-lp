import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, SpringIn, FadeIn } from "../ui";

export const Title = () => {
  const frame = useCurrentFrame();
  const glow = interpolate(frame, [0, 60], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        background: `radial-gradient(circle at 50% 50%, rgba(79,140,255,${0.18 * glow}) 0%, ${COLORS.bg} 60%)`,
      }}
    >
      <SpringIn from={0}>
        <div
          style={{
            fontSize: 56,
            color: COLORS.muted,
            letterSpacing: 8,
            textTransform: "uppercase",
            textAlign: "center",
            marginBottom: 30,
          }}
        >
          A Meta Tutorial
        </div>
      </SpringIn>
      <SpringIn from={10}>
        <div
          style={{
            fontSize: 160,
            fontWeight: 900,
            color: COLORS.text,
            letterSpacing: -4,
            textAlign: "center",
            lineHeight: 1.05,
          }}
        >
          How to make a video
          <br />
          with{" "}
          <span style={{ color: COLORS.accent }}>Remotion</span>
        </div>
      </SpringIn>
      <FadeIn from={40} duration={20}>
        <div
          style={{
            marginTop: 40,
            fontSize: 38,
            color: COLORS.muted,
            textAlign: "center",
          }}
        >
          (This video was made with Remotion.)
        </div>
      </FadeIn>
    </AbsoluteFill>
  );
};
