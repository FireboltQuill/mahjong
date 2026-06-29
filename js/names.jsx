// Player names — organized into themed groups. Each game picks one group at
// random, then four distinct names from inside that group (one for the human
// player, three for the AIs). Users can edit groups from the menu or the
// admin console; changes persist to localStorage.

const NAMES_GROUPS_KEY = "mahjong_name_groups";
const NAMES_LEGACY_KEY = "mahjong_ai_names"; // pre-groups flat-list key

const DEFAULT_NAME_GROUPS = [
  { name: "Street Fighter", names: ["Manon", "Juri", "Cammy", "Chun Li"] },
  { name: "Guilty Gear",  names: ["Elphelt", "Dizzy", "Ramlethal", "Baiken"] },
  { name: "Tekken",  names: ["Lidia", "Jun", "Zafina", "Lili"] },
  { name: "Bleach",   names: ["Retsu", "Sode no Shirayuki", "Yoruichi", "Senjumaru"] },
  { name: "Naruto",   names: ["Mei", "Temari", "Kaguya", "Samui"] },
  { name: "One Piece", names: ["Robin", "Boa", "Vivi", "Jewelry"] },
  { name: "Freezing",  names: ["Chiffon", "Cassandra", "Satellizer", "Kazuha"] },
];

// Daily challenge name pool — fixed regardless of the user's
// customized DEFAULT_NAME_GROUPS / loaded groups (spec §9.6, §9.7).
// Identical across users so daily AI seat names match.
const DAILY_NAME_GROUPS = [
  { name: "Daily", names: ["Aster", "Briar", "Cypress", "Daphne"] },
];

function sanitizeGroups(arr) {
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const g of arr) {
    if (!g || typeof g.name !== "string" || !Array.isArray(g.names)) continue;
    const groupName = g.name.trim();
    if (!groupName) continue;
    const names = g.names.map((n) => (typeof n === "string" ? n.trim() : "")).filter(Boolean);
    out.push({ name: groupName, names });
  }
  return out;
}

function loadNameGroups() {
  try {
    const raw = localStorage.getItem(NAMES_GROUPS_KEY);
    if (raw !== null) {
      const cleaned = sanitizeGroups(JSON.parse(raw));
      if (cleaned !== null) return cleaned;
    }
    // One-time migration from the pre-groups flat list into a single "Custom" group.
    const legacy = localStorage.getItem(NAMES_LEGACY_KEY);
    if (legacy !== null) {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed) && parsed.some((n) => typeof n === "string" && n.trim())) {
        const names = parsed.map((n) => (typeof n === "string" ? n.trim() : "")).filter(Boolean);
        return [{ name: "Custom", names }];
      }
    }
  } catch {}
  return DEFAULT_NAME_GROUPS.map((g) => ({ name: g.name, names: [...g.names] }));
}

function saveNameGroups(groups) {
  try {
    localStorage.setItem(NAMES_GROUPS_KEY, JSON.stringify(groups));
  } catch {}
}

// Fisher-Yates partial shuffle: distinct random selection of `count` items.
// rng must be passed by caller (spec §9.3.1 audit — removed Math.random).
function pickN(pool, count, rng) {
  const usable = [...pool];
  for (let i = 0; i < count && i < usable.length; i++) {
    const j = i + rng.nextInt(usable.length - i);
    [usable[i], usable[j]] = [usable[j], usable[i]];
  }
  return usable.slice(0, count);
}

// Pick a random group (one with at least one name), then `count` distinct
// names from it. Falls back to "You" for the human and "AI N" for AI seats
// when the chosen group runs out, so the game stays playable.
function pickPlayerNames(groups, count, rng) {
  const usable = (groups || []).filter((g) => g && Array.isArray(g.names) && g.names.length > 0);
  let chosenGroup = null;
  let pool = [];
  if (usable.length > 0) {
    chosenGroup = usable[rng.nextInt(usable.length)];
    pool = chosenGroup.names;
  }
  const picked = pickN(pool, count, rng);
  const names = [];
  for (let i = 0; i < count; i++) {
    if (i < picked.length) names.push(picked[i]);
    else if (i === 0) names.push("You");
    else names.push(`AI ${i}`);
  }
  return { groupName: chosenGroup ? chosenGroup.name : null, names };
}
