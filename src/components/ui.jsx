// src/components/ui.jsx
// Shared UI primitives: Button, ConfidenceBadge, Stepper, ProgressBar.
// Inline styles match the existing visual design (warm cream + serif headings).

const FONTS = {
  serif: "'Libre Baskerville', serif",
  sans:  "'DM Sans', sans-serif",
  mono:  "'DM Mono', monospace",
};

export const COLORS = {
  bg:          "#f9f7f2",
  card:        "#ffffff",
  cardSubtle:  "#faf8f4",
  border:      "#e8e3d8",
  borderSoft:  "#f0ebe0",
  text:        "#2c2c2c",
  textMuted:   "#666",
  textFaint:   "#888",
  textGhost:   "#aaa",
  accent:      "#4a7c59",
  warning:     "#b8860b",
  danger:      "#a0522d",
};

// ---------- Button ----------

export function Button({ children, onClick, variant = "primary", disabled = false, style = {}, type = "button" }) {
  const variants = {
    primary:   { background: COLORS.text, color: "#f4f0e8", border: "none" },
    secondary: { background: "transparent", color: COLORS.text, border: `1.5px solid ${COLORS.text}` },
    ghost:     { background: "transparent", color: COLORS.textMuted, border: "1px solid #ddd" },
    danger:    { background: "transparent", color: COLORS.danger, border: `1px solid ${COLORS.danger}40` },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 24px",
        borderRadius: "6px",
        fontSize: "13px",
        fontFamily: FONTS.sans,
        fontWeight: 500,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        letterSpacing: "0.03em",
        transition: "all 0.2s ease",
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ---------- ConfidenceBadge ----------
//
// Three buckets rather than a precise percentage. The number that comes back
// from the model is its self-report and should not be presented as if it were
// a calibrated probability.

export function ConfidenceBadge({ value }) {
  const { label, color } = bucket(value);
  return (
    <span
      title={`Model self-reported confidence: ${Math.round((value ?? 0) * 100)}%`}
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "3px",
        fontSize: "10px",
        fontFamily: FONTS.mono,
        background: color + "18",
        color,
        border: `1px solid ${color}40`,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {label}
    </span>
  );
}

function bucket(v) {
  if (v == null) return { label: "—", color: COLORS.textGhost };
  if (v >= 0.9)  return { label: "high",   color: COLORS.accent };
  if (v >= 0.75) return { label: "medium", color: COLORS.warning };
  return                { label: "low",    color: COLORS.danger };
}

// ---------- Stepper ----------

const STEPS = [
  { num: 1, label: "Upload" },
  { num: 2, label: "Review" },
  { num: 3, label: "Library" },
];

export function Stepper({ current }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      margin: "0 auto 40px",
      maxWidth: "520px",
    }}>
      {STEPS.map((s, i) => {
        const active = s.num === current;
        const done = s.num < current;
        return (
          <div key={s.num} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "80px" }}>
              <div style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                fontFamily: FONTS.mono,
                background: active ? COLORS.text : done ? COLORS.accent : "transparent",
                color: active || done ? "#f4f0e8" : "#999",
                border: active || done ? "none" : "1.5px solid #ccc",
                transition: "all 0.3s ease",
              }}>
                {done ? "✓" : s.num}
              </div>
              <span style={{
                marginTop: "6px",
                fontSize: "12px",
                fontWeight: active ? 600 : 400,
                color: active ? COLORS.text : COLORS.textFaint,
                fontFamily: FONTS.sans,
                letterSpacing: "0.02em",
              }}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1,
                height: "1.5px",
                background: done ? COLORS.accent : "#ddd",
                margin: "0 12px 22px",
                transition: "background 0.3s ease",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- ProgressBar ----------

export function ProgressBar({ current, total, label }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div style={{
      maxWidth: "600px",
      margin: "0 auto 20px",
      padding: "20px",
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: "10px",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: "10px",
        fontFamily: FONTS.sans,
        fontSize: "13px",
        color: COLORS.textMuted,
      }}>
        <span>{label}</span>
        <span style={{ fontFamily: FONTS.mono, fontSize: "12px", color: COLORS.textFaint }}>
          {current} / {total}
        </span>
      </div>
      <div style={{
        height: "6px",
        background: "#f0ebe0",
        borderRadius: "3px",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: COLORS.accent,
          borderRadius: "3px",
          transition: "width 0.3s ease",
        }} />
      </div>
    </div>
  );
}

// ---------- ErrorBanner ----------

export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div style={{
      maxWidth: "600px",
      margin: "0 auto 20px",
      padding: "12px 16px",
      background: COLORS.danger + "18",
      border: `1px solid ${COLORS.danger}40`,
      borderRadius: "8px",
      fontFamily: FONTS.sans,
      fontSize: "13px",
      color: COLORS.danger,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "12px",
    }}>
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            color: COLORS.danger,
            cursor: "pointer",
            fontSize: "16px",
            padding: 0,
            lineHeight: 1,
          }}
        >×</button>
      )}
    </div>
  );
}

export { FONTS };
