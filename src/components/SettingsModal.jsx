// src/components/SettingsModal.jsx
// Settings panel for the model provider, its API key and model choices.
// Each provider keeps its own key and models, so switching back and forth
// does not lose anything.
// Stored in IndexedDB (via idb-keyval); never leaves the browser.

import { useState, useEffect, useRef } from "react";
import { Button, COLORS, FONTS } from "./ui.jsx";
import { loadSettings, saveSettings } from "../lib/library.js";
import { PROVIDERS, migrateSettings } from "../lib/providers.js";

export function SettingsModal({ open, onClose, onSaved }) {
  const [settings, setSettings] = useState(() => migrateSettings({}));
  const [showKey, setShowKey] = useState(false);
  const dialogRef = useRef(null);
  const apiKeyRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement;
    loadSettings().then((s) => {
      setSettings(s);
      requestAnimationFrame(() => apiKeyRef.current?.focus());
    });
    return () => previousFocus.current?.focus?.();
  }, [open]);

  if (!open) return null;

  const provider = settings.provider;
  const config = PROVIDERS[provider];
  const { apiKey, visionModel, textModel } = settings.providers[provider];

  const setProvider = (id) => setSettings((prev) => ({ ...prev, provider: id }));
  const update = (field, value) => setSettings((prev) => ({
    ...prev,
    providers: { ...prev.providers, [prev.provider]: { ...prev.providers[prev.provider], [field]: value } },
  }));

  const handleSave = async () => {
    const providers = Object.fromEntries(Object.entries(settings.providers).map(([id, entry]) => [
      id,
      { apiKey: entry.apiKey.trim(), visionModel: entry.visionModel.trim(), textModel: entry.textModel.trim() },
    ]));
    await saveSettings({ provider, providers });
    onSaved?.();
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = [...dialogRef.current.querySelectorAll("button, input, select, [tabindex]:not([tabindex='-1'])")]
      .filter((element) => !element.disabled);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
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
        className="settings-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onKeyDown={handleKeyDown}
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
        <h2 id="settings-title" style={{
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
          Your keys and preferences stay on this device. Nothing is sent to anyone except the model provider below, Open Library and Wikidata when you scan books.
        </p>

        <Field label="Model provider" htmlFor="settings-provider">
          <select
            id="settings-provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            style={inputStyle}
          >
            {Object.entries(PROVIDERS).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </Field>

        <Field label={config.keyLabel} htmlFor="settings-api-key">
          <div className="settings-token-row" style={{ display: "flex", gap: "8px" }}>
            <input
              id="settings-api-key"
              ref={apiKeyRef}
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
              placeholder={config.keyPlaceholder}
              style={inputStyle}
            />
            <button
              type="button"
              aria-pressed={showKey}
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
            Get one at{" "}
            <a href={config.keyUrl} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.accent }}>
              {config.keyUrl.replace("https://", "")}
            </a>. {config.keyHint}
          </Hint>
        </Field>

        <Field label="Vision model" htmlFor="settings-vision-model">
          <input
            id="settings-vision-model"
            type="text"
            value={visionModel}
            onChange={(e) => update("visionModel", e.target.value)}
            style={inputStyle}
          />
          <Hint>Used to read book spines from photos.</Hint>
        </Field>

        <Field label="Text model" htmlFor="settings-text-model">
          <input
            id="settings-text-model"
            type="text"
            value={textModel}
            onChange={(e) => update("textModel", e.target.value)}
            style={inputStyle}
          />
          <Hint>Used to find English titles that Wikidata doesn't have, and to fill metadata gaps.</Hint>
        </Field>

        <div className="settings-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "28px" }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <label htmlFor={htmlFor} style={{
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
