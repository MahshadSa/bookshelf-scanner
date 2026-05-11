// src/components/ReviewScreen.jsx
//
// Editable table of extracted books. Sorted by confidence ascending by default
// so the rows most likely to need human attention show up first.

import { useState, useMemo } from "react";
import { Button, ConfidenceBadge, COLORS, FONTS } from "./ui.jsx";

export function ReviewScreen({ books, setBooks, onNext, onBack }) {
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
    setBooks((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
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
      }}>Review extracted books</h2>
      <p style={{
        fontFamily: FONTS.sans,
        fontSize: "14px",
        color: COLORS.textFaint,
        textAlign: "center",
        marginBottom: "20px",
      }}>
        {books.length} {books.length === 1 ? "book" : "books"} found. Click any row to edit. Low-confidence rows are listed first.
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
        <div style={{
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
          />
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
        <Button variant="ghost" onClick={onBack}>← Back</Button>
        <Button onClick={onNext}>Confirm & enrich →</Button>
      </div>
    </div>
  );
}

function BookRow({ book, isEditing, onToggle, onUpdate, onDelete }) {
  return (
    <div
      onClick={onToggle}
      style={{
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer",
        background: isEditing ? "#fdfcf8" : "transparent",
        transition: "background 0.15s",
      }}
    >
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 70px 40px",
        padding: "14px 20px",
        alignItems: "center",
      }}>
        <div>
          <div style={{ fontFamily: FONTS.serif, fontSize: "14px", color: COLORS.text, lineHeight: 1.3 }}>
            {book.title || <em style={{ color: COLORS.textGhost }}>(no title)</em>}
          </div>
          {book.titleRoman && (
            <div style={{ fontFamily: FONTS.sans, fontSize: "11px", color: COLORS.textGhost, marginTop: "2px" }}>
              {book.titleRoman}
            </div>
          )}
        </div>
        <div style={{ fontFamily: FONTS.sans, fontSize: "13px", color: COLORS.textMuted }}>
          {book.author || <em style={{ color: COLORS.textGhost }}>(no author)</em>}
          {book.authorRoman && (
            <div style={{ fontSize: "11px", color: COLORS.textGhost, marginTop: "2px" }}>
              {book.authorRoman}
            </div>
          )}
        </div>
        <div style={{ textAlign: "center" }}>
          <ConfidenceBadge value={book.confidence} />
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(book.id); }}
          aria-label="Delete row"
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
          style={{
            padding: "0 20px 16px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            { label: "Title", field: "title" },
            { label: "Author", field: "author" },
            { label: "Romanized title", field: "titleRoman" },
            { label: "Romanized author", field: "authorRoman" },
          ].map(({ label, field }) => (
            <div key={field}>
              <label style={{
                fontFamily: FONTS.sans,
                fontSize: "10px",
                color: COLORS.textGhost,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}>{label}</label>
              <input
                value={book[field] || ""}
                onChange={(e) => onUpdate(book.id, field, e.target.value)}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  border: `1px solid #e0dbd0`,
                  borderRadius: "5px",
                  fontFamily: FONTS.sans,
                  fontSize: "13px",
                  color: COLORS.text,
                  background: COLORS.card,
                  outline: "none",
                  marginTop: "3px",
                  boxSizing: "border-box",
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
