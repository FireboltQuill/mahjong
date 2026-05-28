// AI player names. The default list ships with the app; the user can edit it
// from the menu and additions/removals are persisted to localStorage.

const NAMES_STORAGE_KEY = "mahjong_ai_names";

const DEFAULT_AI_NAMES = [
  "Elphelt", "Manon", "Lidia", "Ramlethal", "Hilda", 
];

function loadAiNames() {
  try {
    const raw = localStorage.getItem(NAMES_STORAGE_KEY);
    if (raw === null) return [...DEFAULT_AI_NAMES];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_AI_NAMES];
    const cleaned = parsed
      .filter((n) => typeof n === "string")
      .map((n) => n.trim())
      .filter(Boolean);
    return cleaned;
  } catch {
    return [...DEFAULT_AI_NAMES];
  }
}

function saveAiNames(names) {
  try {
    localStorage.setItem(NAMES_STORAGE_KEY, JSON.stringify(names));
  } catch {}
}

// Pick `count` distinct random names from the pool, in random order. If the
// pool is shorter than `count`, the remainder is filled with "AI 2" / "AI 3" /
// etc. so the game can still start with an empty or undersized list.
function pickRandomNames(pool, count) {
  const usable = [...pool];
  for (let i = 0; i < count && i < usable.length; i++) {
    const j = i + Math.floor(Math.random() * (usable.length - i));
    [usable[i], usable[j]] = [usable[j], usable[i]];
  }
  const picked = usable.slice(0, count);
  while (picked.length < count) picked.push(`AI ${picked.length + 1}`);
  return picked;
}
