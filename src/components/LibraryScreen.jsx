// src/components/LibraryScreen.jsx
//
// The persistent dashboard view: stats, country chart, searchable/sortable
// book list, export. Reads from IndexedDB on mount via the parent.

import { useState, useMemo } from "react";
import { Button, COLORS, FONTS } from "./ui.jsx";
import { exportAsCSV, exportAsJSON, downloadFile, removeBookFromLibrary, clearLibrary } from "../lib/library.js";
import { normalizeText } from "../lib/text.js";

export function LibraryScreen({ books, setBooks, onScanMore }) {
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("title");
  const [languageFilter, setLanguageFilter] = useState("");

  const languages = useMemo(
    () => Array.from(new Set(books.map((b) => b.language).filter(Boolean))).sort(),
    [books]
  );

  const filtered = useMemo(() => {
    const q = normalizeText(filter);
    return books
      .filter((b) => {
        if (languageFilter && b.language !== languageFilter) return false;
        if (!q) return true;
        return [b.title, b.titleRoman, b.author, b.authorRoman]
          .filter(Boolean)
          .some((field) => normalizeText(field).includes(q));
      })
      .sort((a, b) => {
        if (sortBy === "year") return (a.year || 9999) - (b.year || 9999);
        if (sortBy === "author") return (a.authorRoman || a.author || "").localeCompare(b.authorRoman || b.author || "");
        return (a.titleRoman || a.title || "").localeCompare(b.titleRoman || b.title || "");
      });
  }, [books, filter, languageFilter, sortBy]);

  const stats = useMemo(() => computeStats(books), [books]);

  const handleExportCSV = () => {
    downloadFile(exportAsCSV(books), `library-${dateStamp()}.csv`, "text/csv");
  };

  const handleExportJSON = () => {
    downloadFile(exportAsJSON(books), `library-${dateStamp()}.json`, "application/json");
  };

  const handleDelete = async (id) => {
    const updated = await removeBookFromLibrary(id);
    setBooks(updated);
  };

  const handleClearAll = async () => {
    if (!confirm(`Delete all ${books.length} books? This cannot be undone.`)) return;
    await clearLibrary();
    setBooks([]);
  };

  if (books.length === 0) {
    return (
      <div style={{ maxWidth: "600px", margin: "0 auto", textAlign: "center" }}>
        <p style={{ fontFamily: FONTS.serif, fontSize: "20px", color: COLORS.text, marginBottom: "8px" }}>
          Your library is empty
        </p>
        <p style={{ fontFamily: FONTS.sans, fontSize: "14px", color: COLORS.textFaint, marginBottom: "24px" }}>
          Upload some shelf photos to get started.
        </p>
        <Button onClick={onScanMore}>Scan books →</Button>
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
        marginBottom: "24px",
        textAlign: "center",
      }}>Your Library</h2>

      {/* Stats grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "12px",
        marginBottom: "28px",
      }}>
        <Stat label="Books" value={stats.totalBooks} />
        <Stat label="Authors" value={stats.totalAuthors} />
        <Stat label="Countries" value={stats.totalCountries} />
        <Stat label="Total pages" value={stats.totalPages.toLocaleString()} />
      </div>

      {/* Country bar chart */}
      {stats.byCountry.length > 0 && (
        <Section title="Books by country">
          <BarList items={stats.byCountry} max={stats.maxCountryCount} />
        </Section>
      )}

      {/* Action bar */}
      <div style={{
        display: "flex",
        gap: "10px",
        marginBottom: "16px",
        alignItems: "center",
        flexWrap: "wrap",
      }}>
        <input
          placeholder="Search title, author..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            flex: "1 1 200px",
            padding: "9px 14px",
            border: `1px solid #e0dbd0`,
            borderRadius: "6px",
            fontFamily: FONTS.sans,
            fontSize: "13px",
            color: COLORS.text,
            background: COLORS.card,
            outline: "none",
          }}
        />
        {languages.length > 1 && (
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">All languages</option>
            {languages.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={selectStyle}
        >
          <option value="title">Sort by title</option>
          <option value="author">Sort by author</option>
          <option value="year">Sort by year</option>
        </select>
      </div>

      {/* Book list */}
      <div style={{
        background: COLORS.card,
        borderRadius: "10px",
        border: `1px solid ${COLORS.border}`,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", color: COLORS.textGhost, fontFamily: FONTS.sans, fontSize: "13px" }}>
            No books match your filter.
          </div>
        ) : (
          filtered.map((book, i) => (
            <LibraryRow
              key={book.id}
              book={book}
              isLast={i === filtered.length - 1}
              onDelete={() => handleDelete(book.id)}
            />
          ))
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <Button variant="danger" onClick={handleClearAll}>Clear library</Button>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={handleExportJSON}>Export JSON</Button>
          <Button variant="secondary" onClick={handleExportCSV}>Export CSV</Button>
          <Button onClick={onScanMore}>Scan more →</Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function Stat({ label, value }) {
  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: "8px",
      padding: "16px",
      textAlign: "center",
    }}>
      <div style={{ fontFamily: FONTS.mono, fontSize: "24px", color: COLORS.text, fontWeight: 400 }}>{value}</div>
      <div style={{
        fontFamily: FONTS.sans,
        fontSize: "11px",
        color: "#999",
        marginTop: "4px",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}>{label}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: "10px",
      padding: "20px",
      marginBottom: "24px",
    }}>
      <h3 style={{
        fontFamily: FONTS.sans,
        fontSize: "11px",
        color: "#999",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        margin: "0 0 16px",
        fontWeight: 600,
      }}>{title}</h3>
      {children}
    </div>
  );
}

function BarList({ items, max }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {items.map(([label, count]) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{
            fontFamily: FONTS.sans,
            fontSize: "12px",
            color: COLORS.textMuted,
            width: "100px",
            textAlign: "right",
            flexShrink: 0,
          }}>{label}</span>
          <div style={{ flex: 1, height: "20px", background: "#f4f0e8", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${(count / max) * 100}%`,
              background: COLORS.accent,
              borderRadius: "3px",
              transition: "width 0.6s ease",
              minWidth: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingRight: "6px",
            }}>
              <span style={{ fontFamily: FONTS.mono, fontSize: "10px", color: "#fff" }}>{count}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LibraryRow({ book, isLast, onDelete }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 60px 80px 80px 30px",
        padding: "14px 20px",
        alignItems: "center",
        borderBottom: isLast ? "none" : `1px solid ${COLORS.borderSoft}`,
        background: hover ? COLORS.cardSubtle : "transparent",
        transition: "background 0.15s",
        gap: "8px",
      }}
    >
      <div>
        <div style={{ fontFamily: FONTS.serif, fontSize: "13px", color: COLORS.text, lineHeight: 1.3 }}>
          {book.title}
        </div>
        {book.titleRoman && (
          <div style={{ fontFamily: FONTS.sans, fontSize: "11px", color: "#bbb", marginTop: "1px" }}>
            {book.titleRoman}
          </div>
        )}
      </div>
      <div style={{ fontFamily: FONTS.sans, fontSize: "12px", color: COLORS.textMuted }}>
        {book.authorRoman || book.author}
      </div>
      <div style={{ fontFamily: FONTS.mono, fontSize: "12px", color: "#999", textAlign: "center" }}>
        {book.year || "—"}
      </div>
      <div style={{ fontFamily: FONTS.sans, fontSize: "11px", color: "#999", textAlign: "center" }}>
        {book.country || "—"}
      </div>
      <div style={{
        fontFamily: FONTS.sans,
        fontSize: "10px",
        color: "#bbb",
        textAlign: "right",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}>{book.language || ""}</div>
      <button
        onClick={onDelete}
        aria-label="Remove from library"
        style={{
          background: "none",
          border: "none",
          color: hover ? COLORS.danger : "transparent",
          cursor: "pointer",
          fontSize: "16px",
          padding: "4px",
          transition: "color 0.15s",
        }}
      >×</button>
    </div>
  );
}

// ---------- Stats ----------

function computeStats(books) {
  const authors = new Set();
  const countries = new Set();
  const byCountry = {};
  let totalPages = 0;

  for (const b of books) {
    if (b.author) authors.add(b.authorRoman || b.author);
    if (b.country) {
      countries.add(b.country);
      byCountry[b.country] = (byCountry[b.country] || 0) + 1;
    }
    if (b.pages) totalPages += b.pages;
  }

  const sortedCountries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]);
  const maxCountryCount = sortedCountries.length > 0 ? sortedCountries[0][1] : 0;

  return {
    totalBooks: books.length,
    totalAuthors: authors.size,
    totalCountries: countries.size,
    totalPages,
    byCountry: sortedCountries,
    maxCountryCount,
  };
}

function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const selectStyle = {
  padding: "9px 12px",
  border: `1px solid #e0dbd0`,
  borderRadius: "6px",
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: COLORS.textMuted,
  background: COLORS.card,
  outline: "none",
  cursor: "pointer",
};
