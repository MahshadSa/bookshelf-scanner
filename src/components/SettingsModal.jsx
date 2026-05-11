// src/components/SettingsModal.jsx
// Settings panel for the HuggingFace API token and model choices.
// Stored in IndexedDB (via idb-keyval); never leaves the browser.

import { useState, useEffect } from "react";
import { Button, COLORS, FONTS } from "./ui.jsx";
import { loadSettings, saveSettings } from "../lib/library.js";

export const DEFAULT_VISION_MODEL = "Qwen/Qwen2.5-VL-72B-Instruct";
export const DEFAULT_TEXT_MODEL = "Qwen/Qwen2.5-72B-Instruct";

export function SettingsModal({ open, onClose, onSaved }) {
  const [apiKey, setApiKey] = useState("");
  const [visionModel, setVisionModel] = useState(DEFAULT_VISION_MODEL);
  const [textModel, setTextModel] = useState(DEFAULT_TEXT_MODEL);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (!open) return;
    loadSettings().then((s) => {
      setApiKey(s.apiKey || "");
      setVisionModel(s.visionModel || DEFAULT_VISION_MODEL);
      setTextModel(s.textModel || DEFAULT_TEXT_MODEL);
    });
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    await saveSettings({ apiKey: apiKey.trim(), visionModel, textModel });
    onSaved?.();
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.bg,
          borderRadius: "12px",
          padding: "32px",
          maxWidth: "480px",
          width: "100%",
          fontFamily: FONTS.sans,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <h2 style={{
          fontFamily: FONTS.serif,
          fontSize: "22px",
          fontWeight: 400,
          color: COLORS.text,
          margin: "0 0 6px",
        }}>Settings</h2>
        <p style={{
          fontSize: "13px",
          color: COLORS.textFaint,
          margin: "0 0 24px",
          lineHeight: 1.5,
        }}>
          Your token and preferences stay on this device. Nothing is sent to anyone except HuggingFace and Open Library when you scan books.
        </p>

        <Field label="HuggingFace token">
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="hf_..."
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              style={{
                padding: "0 12px",
                border: `1px solid ${COLORS.border}`,
                borderRadius: "6px",
                background: COLORS.card,
                color: COLORS.textMuted,
                fontSize: "12px",
                cursor: "pointer",
                fontFamily: FONTS.sans,
              }}
            >{showKey ? "Hide" : "Show"}</button>
          </div>
          <Hint>
            Get a free token at{" "}
            <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.accent }}>
              huggingface.co/settings/tokens
            </a>. A read token is enough.
          </Hint>
        </Field>

        <Field label="Vision model">
          <input
            type="text"
            value={visionModel}
            onChange={(e) => setVisionModel(e.target.value)}
            style={inputStyle}
          />
          <Hint>Used to read book spines from photos.</Hint>
        </Field>

        <Field label="Text model">
          <input
            type="text"
            value={textModel}
            onChange={(e) => setTextModel(e.target.value)}
            style={inputStyle}
          />
          <Hint>Used to fill metadata gaps when Open Library has no match.</Hint>
        </Field>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "28px" }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <label style={{
        display: "block",
        fontSize: "11px",
        color: COLORS.textFaint,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: "6px",
        fontWeight: 600,
      }}>{label}</label>
      {children}
    </div>
  );
}

function Hint({ children }) {
  return (
    <p style={{
      fontSize: "11px",
      color: COLORS.textGhost,
      margin: "6px 0 0",
      lineHeight: 1.5,
    }}>{children}</p>
  );
}

const inputStyle = {
  flex: 1,
  width: "100%",
  padding: "9px 12px",
  border: `1px solid ${COLORS.border}`,
  borderRadius: "6px",
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: COLORS.text,
  background: COLORS.card,
  outline: "none",
  boxSizing: "border-box",
};
