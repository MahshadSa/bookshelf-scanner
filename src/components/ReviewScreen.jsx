// src/components/ReviewScreen.jsx
//
// Editable table of extracted books. Sorted by confidence ascending by default
// so the rows most likely to need human attention show up first.

import { useState, useMemo } from "react";
import { Button, ConfidenceBadge, COLORS, FONTS } from "./ui.jsx";

const METADATA_FIELDS = new Set(["titleEnglish", "authorEnglish", "year", "country", "genre", "pages", "language", "isbn"]);
const IDENTITY_FIELDS = new Set(["title", "titleRoman", "author", "authorRoman"]);
const GENRE_OPTIONS = ["Fiction", "Non-fiction", "History", "Philosophy", "Science", "Poetry", "Biography", "Self-help", "Religion", "Politics", "Psychology", "Art", "Drama"];

export function ReviewScreen({ books, setBooks, stage = "identity", onNext, onBack }) {
  const [editingId, setEditingId] = useState(null);
  const [sortBy, setSortBy] = useState("confidence");

  const sortedBooks = useMemo(() => {
    const arr = [...books];
    if (sortBy === "confidence") {
      arr.sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0));
    } else if (sortBy === "title") {
      arr.sort((a, b) => (a.titleRoman || a.title).localeCompare(b.titleRoman || b.title));
    }
    return arr;
  }, [books, sortBy]);

  const updateBook = (id, field, value) => {
    setBooks((prev) => prev.map((b) => {
      if (b.id !== id) return b;
      const updated = { ...b, [field]: value };
      if (METADATA_FIELDS.has(field)) {
        updated.metadataSource = { ...(b.metadataSource || {}), [field]: "user" };
      } else if (IDENTITY_FIELDS.has(field) && Object.keys(b.metadataSource || {}).length > 0) {
        for (const metadataField of METADATA_FIELDS) updated[metadataField] = null;
        updated.coverUrl = null;
        updated.metadataSource = {};
      }
      return updated;
    }));
  };

  const deleteBook = (id) => {
    setBooks((prev) => prev.filter((b) => b.id !== id));
    if (editingId === id) setEditingId(null);
  };

  if (books.length === 0) {
    return (
      <div style={{ maxWidth: "600px", margin: "0 auto", textAlign: "center" }}>
        <p style={{ fontFamily: FONTS.sans, color: COLORS.textFaint }}>
          No books were extracted. Try clearer photos, or different images.
        </p>
        <div style={{ marginTop: "20px" }}>
          <Button variant="ghost" onClick={onBack}>← Back to upload</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "780px", margin: "0 auto" }}>
      <h2 style={{
        fontFamily: FONTS.serif,
        fontSize: "26px",
        fontWeight: 400,
        color: COLORS.text,
        marginBottom: "8px",
        textAlign: "center",
      }}>{stage === "metadata" ? "Review book metadata" : "Review extracted books"}</h2>
      <p style={{
        fontFamily: FONTS.sans,
        fontSize: "14px",
        color: COLORS.textFaint,
        textAlign: "center",
        marginBottom: "20px",
      }}>
        {stage === "metadata"
          ? "Check the suggested details before saving. Click any row to edit; source labels show where each value came from."
          : `${books.length} ${books.length === 1 ? "book" : "books"} found. Click any row to edit. Low-confidence rows are listed first.`}
      </p>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px", gap: "8px", alignItems: "center" }}>
        <label style={{ fontSize: "11px", color: COLORS.textFaint, fontFamily: FONTS.sans, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Sort
        </label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{
            padding: "6px 10px",
            border: `1px solid ${COLORS.border}`,
            borderRadius: "5px",
            fontFamily: FONTS.sans,
            fontSize: "12px",
            color: COLORS.textMuted,
            background: COLORS.card,
            cursor: "pointer",
          }}
        >
          <option value="confidence">Confidence (low first)</option>
          <option value="title">Title</option>
        </select>
      </div>

      <div style={{
        background: COLORS.card,
        borderRadius: "10px",
        border: `1px solid ${COLORS.border}`,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div className="review-table-header" style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 70px 40px",
          padding: "12px 20px",
          background: COLORS.cardSubtle,
          borderBottom: `1px solid ${COLORS.border}`,
          fontFamily: FONTS.sans,
          fontSize: "11px",
          fontWeight: 600,
          color: "#999",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          <span>Title</span>
          <span>Author</span>
          <span style={{ textAlign: "center" }}>Conf.</span>
          <span></span>
        </div>

        {sortedBooks.map((book) => (
          <BookRow
            key={book.id}
            book={book}
            isEditing={editingId === book.id}
            onToggle={() => setEditingId(editingId === book.id ? null : book.id)}
            onUpdate={updateBook}
            onDelete={deleteBook}
            stage={stage}
          />
        ))}
      </div>

      <div className="review-footer" style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
        <Button variant="ghost" onClick={onBack}>{stage === "metadata" ? "← Back to titles" : "← Back"}</Button>
        <Button onClick={onNext}>{stage === "metadata" ? "Save to library →" : "Confirm & enrich →"}</Button>
      </div>
    </div>
  );
}

function BookRow({ book, isEditing, onToggle, onUpdate, onDelete, stage }) {
  return (
    <div
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      role="button"
      tabIndex={0}
      aria-expanded={isEditing}
      style={{
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer",
        background: isEditing ? "#fdfcf8" : "transparent",
        transition: "background 0.15s",
      }}
    >
      <div className="review-row-main" style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 70px 40px",
        padding: "14px 20px",
        alignItems: "center",
      }}>
        <div className="review-title-cell">
          <div style={{ fontFamily: FONTS.serif, fontSize: "14px", color: COLORS.text, lineHeight: 1.3 }}>
            {book.title || <em style={{ color: COLORS.textGhost }}>(no title)</em>}
          </div>
          {book.titleRoman && (
            <div style={{ fontFamily: FONTS.sans, fontSize: "11px", color: COLORS.textGhost, marginTop: "2px" }}>
              {book.titleRoman}
            </div>
          )}
          {book.titleEnglish && (
            <div style={{ fontFamily: FONTS.serif, fontStyle: "italic", fontSize: "12px", color: COLORS.textMuted, marginTop: "2px" }}>
              {book.titleEnglish}
            </div>
          )}
          {stage === "metadata" && <MetadataSummary book={book} />}
        </div>
        <div className="review-author-cell" style={{ fontFamily: FONTS.sans, fontSize: "13px", color: COLORS.textMuted }}>
          {book.author || <em style={{ color: COLORS.textGhost }}>(no author)</em>}
          {book.authorRoman && (
            <div style={{ fontSize: "11px", color: COLORS.textGhost, marginTop: "2px" }}>
              {book.authorRoman}
            </div>
          )}
        </div>
        <div className="review-confidence-cell" style={{ textAlign: "center" }}>
          <ConfidenceBadge value={book.confidence} />
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(book.id); }}
          aria-label="Delete row"
          className="review-delete-cell"
          style={{
            background: "none",
            border: "none",
            color: "#ccc",
            cursor: "pointer",
            fontSize: "16px",
            padding: "4px",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.danger)}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#ccc")}
        >×</button>
      </div>

      {isEditing && (
        <div
          className="review-editor-grid"
          style={{
            padding: "0 20px 16px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(stage === "metadata" ? [
            { label: "English title", field: "titleEnglish" },
            { label: "English author", field: "authorEnglish" },
            { label: "Year", field: "year", type: "number" },
            { label: "Country", field: "country" },
            { label: "Genre", field: "genre" },
            { label: "Pages", field: "pages", type: "number" },
            { label: "Language", field: "language" },
            { label: "ISBN", field: "isbn" },
          ] : [
            { label: "Title", field: "title" },
            { label: "Author", field: "author" },
            { label: "Romanized title", field: "titleRoman" },
            { label: "Romanized author", field: "authorRoman" },
          ]).map(({ label, field, type }) => (
            <div key={field}>
              <label htmlFor={`${field}-${book.id}`} style={{
                fontFamily: FONTS.sans,
                fontSize: "10px",
                color: COLORS.textGhost,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}>{label}</label>
              {field === "genre" ? (
                <select
                  id={`${field}-${book.id}`}
                  value={book[field] || ""}
                  onChange={(e) => onUpdate(book.id, field, e.target.value)}
                  style={editorControlStyle}
                >
                  <option value="">Unknown</option>
                  {GENRE_OPTIONS.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
                </select>
              ) : (
                <input
                  id={`${field}-${book.id}`}
                  type={type || "text"}
                  min={type === "number" ? 0 : undefined}
                  value={book[field] || ""}
                  onChange={(e) => onUpdate(book.id, field, e.target.value)}
                  style={editorControlStyle}
                />
              )}
              {stage === "metadata" && book.metadataSource?.[field] && (
                <span style={{ fontFamily: FONTS.sans, fontSize: "9px", color: COLORS.textGhost }}>
                  Source: {sourceLabel(book.metadataSource[field])}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetadataSummary({ book }) {
  const values = [book.year, book.country, book.genre, book.pages && `${book.pages} pages`, book.language].filter(Boolean);
  return (
    <div className="metadata-summary" style={{ fontFamily: FONTS.sans, fontSize: "10px", color: COLORS.textFaint, marginTop: "5px" }}>
      {values.length > 0 ? values.join(" · ") : "No metadata found — click to add details"}
    </div>
  );
}

const SOURCE_LABELS = { wikidata: "Wikidata", openlibrary: "Open Library", model: "AI suggestion" };

function sourceLabel(source) {
  return SOURCE_LABELS[source] || "Edited by you";
}

const editorControlStyle = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid #e0dbd0",
  borderRadius: "5px",
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: COLORS.text,
  background: COLORS.card,
  outline: "none",
  marginTop: "3px",
  boxSizing: "border-box",
};
