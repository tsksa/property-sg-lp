import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FadeIn, SpringIn } from "../ui";

export const Outro = () => {
  const frame = useCurrentFrame();
  const glow = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        background: `radial-gradient(circle at 50% 50%, rgba(126,231,135,${0.18 * glow}) 0%, ${COLORS.bg} 60%)`,
      }}
    >
      <SpringIn from={0}>
        <div
          style={{
            fontSize: 140,
            fontWeight: 900,
            color: COLORS.text,
            letterSpacing: -3,
            textAlign: "center",
            lineHeight: 1.05,
          }}
        >
          That's it.
        </div>
      </SpringIn>
      <FadeIn from={18} duration={20}>
        <div
          style={{
            marginTop: 40,
            fontSize: 48,
            color: COLORS.muted,
            textAlign: "center",
            maxWidth: 1200,
          }}
        >
          You just watched a Remotion video
          <br />
          explaining how to make a Remotion video.
        </div>
      </FadeIn>
      <FadeIn from={40} duration={20}>
        <div
          style={{
            marginTop: 50,
            fontSize: 36,
            color: COLORS.accent,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          remotion.dev
        </div>
      </FadeIn>
    </AbsoluteFill>
  );
};
