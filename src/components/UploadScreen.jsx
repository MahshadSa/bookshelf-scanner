// src/components/UploadScreen.jsx
import { useRef, useCallback } from "react";
import { Button, COLORS, FONTS } from "./ui.jsx";

export function UploadScreen({ images, setImages, onNext, hasApiKey }) {
  const fileRef = useRef(null);

  const addFiles = (files) => {
    const accepted = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const newImages = accepted.map((file, i) => ({
      id: Date.now() + i,
      file,
      name: file.name,
      size: (file.size / 1024 / 1024).toFixed(1),
      url: URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...newImages]);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }, []);

  const removeImage = (id) => {
    setImages((prev) => {
      const removed = prev.find((i) => i.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((i) => i.id !== id);
    });
  };

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto" }}>
      <h2 style={{
        fontFamily: FONTS.serif,
        fontSize: "26px",
        fontWeight: 400,
        color: COLORS.text,
        marginBottom: "8px",
        textAlign: "center",
      }}>Upload your shelves</h2>
      <p style={{
        fontFamily: FONTS.sans,
        fontSize: "14px",
        color: COLORS.textFaint,
        textAlign: "center",
        marginBottom: "32px",
      }}>
        Take clear photos of each shelf. Closer is better. JPG and PNG work best.
      </p>

      <div
        onClick={() => fileRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        style={{
          border: "2px dashed #d0c9b8",
          borderRadius: "12px",
          padding: "48px 24px",
          textAlign: "center",
          cursor: "pointer",
          background: COLORS.cardSubtle,
          transition: "border-color 0.2s",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "12px", opacity: 0.4 }}>📷</div>
        <p style={{ fontFamily: FONTS.sans, fontSize: "14px", color: COLORS.textMuted, margin: 0 }}>
          Drop shelf photos here, or click to browse
        </p>
        <p style={{ fontFamily: FONTS.sans, fontSize: "12px", color: COLORS.textGhost, marginTop: "8px" }}>
          JPG, PNG, WebP
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          style={{ display: "none" }}
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {images.length > 0 && (
        <div style={{ marginTop: "24px" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
            gap: "12px",
          }}>
            {images.map((img) => (
              <div key={img.id} style={{ position: "relative" }}>
                <img
                  src={img.url}
                  alt={img.name}
                  style={{
                    width: "100%",
                    height: "100px",
                    objectFit: "cover",
                    borderRadius: "8px",
                    border: `1px solid #e0dbd0`,
                  }}
                />
                <button
                  onClick={() => removeImage(img.id)}
                  aria-label={`Remove ${img.name}`}
                  style={{
                    position: "absolute",
                    top: "4px",
                    right: "4px",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(0,0,0,0.5)",
                    color: "white",
                    fontSize: "11px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
        <Button onClick={onNext} disabled={images.length === 0 || !hasApiKey}>
          {hasApiKey ? "Extract books →" : "Add API key in Settings first"}
        </Button>
      </div>
    </div>
  );
}
