// src/App.jsx
//
// Top-level orchestrator. Holds the step state machine, the in-flight scan
// (images / extracted books), and the persistent library loaded from
// IndexedDB. Three views: Upload -> Review -> Library.

import { useState, useEffect, useCallback } from "react";

import { Stepper, ProgressBar, ErrorBanner, Button, COLORS, FONTS } from "./components/ui.jsx";
import { UploadScreen } from "./components/UploadScreen.jsx";
import { ReviewScreen } from "./components/ReviewScreen.jsx";
import { LibraryScreen } from "./components/LibraryScreen.jsx";
import { SettingsModal, DEFAULT_VISION_MODEL, DEFAULT_TEXT_MODEL } from "./components/SettingsModal.jsx";

import { extractBooksFromImages } from "./api/extractor.js";
import { enrichBooks } from "./api/enricher.js";
import { loadLibrary, addBooksToLibrary, loadSettings } from "./lib/library.js";

const STEPS = { UPLOAD: 1, REVIEW: 2, LIBRARY: 3 };

export default function App() {
  // Step state
  const [step, setStep] = useState(STEPS.LIBRARY);

  // Scan-in-progress state
  const [images, setImages] = useState([]);
  const [extracted, setExtracted] = useState([]);

  // Persistent state
  const [library, setLibrary] = useState([]);
  const [settings, setSettings] = useState({});

  // UI state
  const [phase, setPhase] = useState("idle"); // 'idle' | 'extracting' | 'enriching'
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  // ---------- Initial load ----------

  useEffect(() => {
    (async () => {
      const [lib, s] = await Promise.all([loadLibrary(), loadSettings()]);
      setLibrary(lib);
      setSettings(s);
      // First-run: open settings if no API key yet
      if (!s.apiKey) setShowSettings(true);
      // Land on Library view when the user already has books, otherwise Upload
      setStep(lib.length > 0 ? STEPS.LIBRARY : STEPS.UPLOAD);
    })();
  }, []);

  const refreshSettings = useCallback(async () => {
    setSettings(await loadSettings());
  }, []);

  // ---------- Actions ----------

  const handleExtract = async () => {
    if (!settings.apiKey) {
      setError("Add your HuggingFace token in Settings first.");
      setShowSettings(true);
      return;
    }
    if (images.length === 0) return;

    setError("");
    setPhase("extracting");
    setProgress({ current: 0, total: images.length, label: "Reading shelves..." });

    try {
      const files = images.map((img) => img.file);
      const { books, errors } = await extractBooksFromImages(
        files,
        settings.apiKey,
        settings.visionModel || DEFAULT_VISION_MODEL,
        (current, total, filename) => {
          setProgress({
            current,
            total,
            label: filename ? `Reading ${filename}...` : "Done",
          });
        }
      );

      if (errors.length > 0 && books.length === 0) {
        setError(`No books extracted. ${errors[0].message}`);
        setPhase("idle");
        return;
      }

      if (errors.length > 0) {
        setError(`Some images failed: ${errors.map((e) => e.filename).join(", ")}. Continuing with the rest.`);
      }

      setExtracted(books);
      setStep(STEPS.REVIEW);
    } catch (err) {
      setError(`Extraction failed: ${err.message}`);
    } finally {
      setPhase("idle");
    }
  };

  const handleEnrichAndSave = async () => {
    if (extracted.length === 0) return;
    setError("");
    setPhase("enriching");
    setProgress({ current: 0, total: extracted.length, label: "Looking up metadata..." });

    try {
      const enriched = await enrichBooks(
        extracted,
        settings.apiKey,
        settings.textModel || DEFAULT_TEXT_MODEL,
        (current, total, title) => {
          setProgress({
            current,
            total,
            label: title ? `Enriching: ${title}` : "Done",
          });
        }
      );

      // Merge into the persistent library, skipping cross-batch duplicates
      const { library: updated, added, skipped } = await addBooksToLibrary(enriched);
      setLibrary(updated);

      // Reset scan-in-progress state
      setImages((prev) => {
        prev.forEach((img) => URL.revokeObjectURL(img.url));
        return [];
      });
      setExtracted([]);
      setStep(STEPS.LIBRARY);

      if (skipped > 0) {
        setError(`Added ${added} new ${added === 1 ? "book" : "books"}. ${skipped} ${skipped === 1 ? "was" : "were"} already in your library.`);
      }
    } catch (err) {
      setError(`Enrichment failed: ${err.message}`);
    } finally {
      setPhase("idle");
    }
  };

  const handleScanMore = () => {
    setExtracted([]);
    setError("");
    setStep(STEPS.UPLOAD);
  };

  const handleBackToUpload = () => {
    setExtracted([]);
    setStep(STEPS.UPLOAD);
  };

  // ---------- Render ----------

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.bg,
      fontFamily: FONTS.sans,
      padding: "32px 24px 60px",
    }}>
      {/* Header */}
      <div style={{
        maxWidth: "780px",
        margin: "0 auto 32px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ width: "70px" }} /> {/* spacer for centering */}
        <div style={{ textAlign: "center" }}>
          <h1 style={{
            fontFamily: FONTS.serif,
            fontSize: "18px",
            fontWeight: 400,
            color: COLORS.text,
            margin: 0,
            letterSpacing: "0.04em",
          }}>
            <span style={{ opacity: 0.3, marginRight: "8px" }}>📚</span>
            Bookshelf Scanner
          </h1>
          <div style={{ width: "40px", height: "1px", background: "#d0c9b8", margin: "12px auto 0" }} />
        </div>
        <button
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          style={{
            background: "transparent",
            border: `1px solid ${COLORS.border}`,
            borderRadius: "6px",
            padding: "6px 12px",
            color: COLORS.textMuted,
            cursor: "pointer",
            fontFamily: FONTS.sans,
            fontSize: "12px",
            width: "70px",
          }}
        >
          ⚙ Settings
        </button>
      </div>

      <Stepper current={step} />

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {phase !== "idle" && (
        <ProgressBar
          current={progress.current}
          total={progress.total}
          label={progress.label}
        />
      )}

      {phase === "idle" && step === STEPS.UPLOAD && (
        <UploadScreen
          images={images}
          setImages={setImages}
          onNext={handleExtract}
          hasApiKey={!!settings.apiKey}
        />
      )}

      {phase === "idle" && step === STEPS.REVIEW && (
        <ReviewScreen
          books={extracted}
          setBooks={setExtracted}
          onNext={handleEnrichAndSave}
          onBack={handleBackToUpload}
        />
      )}

      {phase === "idle" && step === STEPS.LIBRARY && (
        <LibraryScreen
          books={library}
          setBooks={setLibrary}
          onScanMore={handleScanMore}
        />
      )}

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onSaved={refreshSettings}
      />
    </div>
  );
}
