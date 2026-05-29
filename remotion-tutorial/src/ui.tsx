import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const COLORS = {
  bg: "#0b0e14",
  panel: "#11151c",
  border: "#1f2630",
  text: "#e6edf3",
  muted: "#8b96a5",
  accent: "#4f8cff",
  pink: "#ff5d8f",
  green: "#7ee787",
  yellow: "#f2cc60",
  purple: "#bc8cff",
};

export const FadeIn: React.FC<{
  from: number;
  duration?: number;
  translateY?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ from, duration = 18, translateY = 24, children, style }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [from, from + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        opacity: progress,
        transform: `translateY(${(1 - progress) * translateY}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const SpringIn: React.FC<{
  from: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ from, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - from,
    fps,
    config: { damping: 14, mass: 0.6 },
  });
  return (
    <div
      style={{
        opacity: Math.min(1, s),
        transform: `scale(${0.85 + 0.15 * s})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const StepBadge: React.FC<{ n: number; label: string }> = ({ n, label }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 18,
      padding: "10px 22px",
      borderRadius: 999,
      background: COLORS.panel,
      border: `1px solid ${COLORS.border}`,
      color: COLORS.muted,
      fontSize: 28,
      letterSpacing: 2,
      textTransform: "uppercase",
    }}
  >
    <span
      style={{
        background: COLORS.accent,
        color: COLORS.bg,
        width: 44,
        height: 44,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: 24,
      }}
    >
      {n}
    </span>
    {label}
  </div>
);

export const CodeBlock: React.FC<{
  lines: { text: string; color?: string }[];
  appearFrom?: number;
  perLine?: number;
}> = ({ lines, appearFrom = 0, perLine = 6 }) => {
  return (
    <div
      style={{
        background: "#0d1117",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 18,
        padding: "36px 48px",
        fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
        fontSize: 36,
        lineHeight: 1.5,
        color: COLORS.text,
        boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
        minWidth: 880,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 26,
          paddingBottom: 18,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#ff5f56" }} />
        <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#ffbd2e" }} />
        <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#27c93f" }} />
      </div>
      {lines.map((line, i) => (
        <FadeIn key={i} from={appearFrom + i * perLine} duration={10} translateY={6}>
          <div style={{ color: line.color ?? COLORS.text, whiteSpace: "pre" }}>
            {line.text || " "}
          </div>
        </FadeIn>
      ))}
    </div>
  );
};

export const SceneTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 84,
      fontWeight: 800,
      color: COLORS.text,
      letterSpacing: -1.5,
    }}
  >
    {children}
  </div>
);
