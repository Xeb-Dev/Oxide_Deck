interface LogoProps {
  size?: number;
  className?: string;
  color?: string;
}

export default function Logo({ size = 24, className = "", color }: LogoProps) {
  return (
    <span
      className={`brand-logo ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif",
        fontWeight: 800,
        fontSize: `${size}px`,
        lineHeight: 1,
        color: color || "var(--text-primary, #000000)",
        letterSpacing: "-0.04em",
        userSelect: "none"
      }}
    >
      <span>De</span>
      <sup
        style={{
          fontSize: "0.55em",
          fontWeight: 900,
          marginLeft: "1px",
          position: "relative",
          top: "-0.45em"
        }}
      >
        -1
      </sup>
    </span>
  );
}
