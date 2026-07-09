// AI portraits — a small library that renders an initials chip for a
// seat when no image URL is available. Name groups can eventually
// evolve to { name, portrait } objects (spec §11.2); when they do,
// getPortrait returns the image URL and the renderer swaps to <img>.
// For v1 only initials chips ship, since no image assets exist yet.
// Bare-string name groups remain valid — see loadNameGroups.

// Seat-scoped palette. Deterministic — same seat always gets the same
// color regardless of who's sitting there.
const PORTRAIT_COLORS = [
  { bg: "#3d6b4a", fg: "#e8d9a8" }, // seat 0 — human (deep green)
  { bg: "#5c3a5c", fg: "#f0d0d0" }, // seat 1 — south (plum)
  { bg: "#6b4a2a", fg: "#e8d9a8" }, // seat 2 — west (brown)
  { bg: "#3a4a6b", fg: "#e0e8f0" }, // seat 3 — north (navy)
];

// Get the initials for a display name. Handles both Latin and CJK
// (single character → keep as is, otherwise take the first char of
// each space-separated word up to two).
function initialsFor(name) {
  if (!name) return "?";
  const s = String(name).trim();
  if (!s) return "?";
  // CJK / single-char name: just use the first char.
  if (s.length === 1) return s;
  // Multi-word Latin: take first char of first two words.
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
}

// v1: no portrait images. Returns null so callers render initials.
// When § 11.2's object shape lands, this reads name-group entries and
// returns the URL when present. Kept as a distinct function so the
// caller doesn't need to know about the transition.
function getPortrait(seatIdx, name) {
  // Reserved for future asset support. Return null → initials fallback.
  void seatIdx;
  void name;
  return null;
}

// Colors for a given seat (safe-indexed).
function portraitColors(seatIdx) {
  return PORTRAIT_COLORS[seatIdx] || PORTRAIT_COLORS[0];
}
