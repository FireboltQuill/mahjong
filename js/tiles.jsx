// Tile system: constants, glyphs, tile factory, sortHand.

// ============================================================
// TILE SYSTEM
// ============================================================

const SUITS = ["bamboo", "characters", "dots"];
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const WINDS = ["east", "south", "west", "north"];
const DRAGONS = ["red", "green", "white"];

const TILE_SYMBOLS = {
  bamboo: ["", "🀐", "🀑", "🀒", "🀓", "🀔", "🀕", "🀖", "🀗", "🀘"],
  characters: ["", "🀇", "🀈", "🀉", "🀊", "🀋", "🀌", "🀍", "🀎", "🀏"],
  dots: ["", "🀙", "🀚", "🀛", "🀜", "🀝", "🀞", "🀟", "🀠", "🀡"],
  wind: { east: "🀀", south: "🀁", west: "🀂", north: "🀃" },
  // U+FE0E forces text (monochrome) presentation on the red dragon, which is
  // the only mahjong glyph in the standard emoji set and otherwise renders as
  // a color emoji while the other tiles stay monochrome.
  dragon: { red: "🀄︎", green: "🀅", white: "🀆" },
};

// Text-based tile display
const SUIT_CHAR = { bamboo: "条", characters: "万", dots: "饼" };
const SUIT_COLOR = { bamboo: "#2d8a4e", characters: "#c43232", dots: "#2266aa" };
const DRAGON_COLOR = { red: "#c43232", green: "#2d8a4e", white: "#555" };
const WIND_COLOR = "#4a3a8a";
function tileColor(t) {
  if (t.suit === "wind") return WIND_COLOR;
  if (t.suit === "dragon") return DRAGON_COLOR[t.honor];
  return SUIT_COLOR[t.suit];
}
function tileDisplay(t) {
  if (t.suit === "wind") {
    const labels = { east: "東", south: "南", west: "西", north: "北" };
    return { top: labels[t.honor], color: WIND_COLOR };
  }
  if (t.suit === "dragon") {
    const labels = { red: "中", green: "發", white: "白" };
    return { top: labels[t.honor], color: DRAGON_COLOR[t.honor] };
  }
  return { top: String(t.rank), bot: SUIT_CHAR[t.suit], color: SUIT_COLOR[t.suit] };
}


// Deterministic tile IDs per spec §9.4. id is a string so existing
// equality/filter call-sites (t.id === other.id) still work; createDeck
// assigns "0".."135" in order, admin-supplied tiles use IDs starting at
// max(scannedMax + 1, 1000) per applyAdmin's id factory.
function createTile(suit, rank, honor, id) {
  return { suit, rank, honor, id: String(id) };
}

function tileKey(t) {
  if (t.honor) return `${t.suit}_${t.honor}`;
  return `${t.suit}_${t.rank}`;
}

function tileSymbol(t) {
  let sym;
  if (t.suit === "wind") sym = TILE_SYMBOLS.wind[t.honor];
  else if (t.suit === "dragon") sym = TILE_SYMBOLS.dragon[t.honor];
  else sym = TILE_SYMBOLS[t.suit][t.rank];
  return <span style={{ color: tileColor(t) }}>{sym}</span>;
}

function tileName(t) {
  if (t.suit === "wind") return `${t.honor} wind`;
  if (t.suit === "dragon") return `${t.honor} dragon`;
  return `${t.rank} ${t.suit}`;
}

function tilesMatch(a, b) {
  return tileKey(a) === tileKey(b);
}

function isHonor(t) {
  return t.suit === "wind" || t.suit === "dragon";
}

function isTerminal(t) {
  return !isHonor(t) && (t.rank === 1 || t.rank === 9);
}

function isTerminalOrHonor(t) {
  return isHonor(t) || isTerminal(t);
}

function isSuit(t) {
  return SUITS.includes(t.suit);
}

function createDeck() {
  const tiles = [];
  let id = 0;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      for (let i = 0; i < 4; i++) tiles.push(createTile(suit, rank, null, id++));
    }
  }
  for (const w of WINDS) {
    for (let i = 0; i < 4; i++) tiles.push(createTile("wind", null, w, id++));
  }
  for (const d of DRAGONS) {
    for (let i = 0; i < 4; i++) tiles.push(createTile("dragon", null, d, id++));
  }
  return tiles;
}

// Fisher-Yates with caller-supplied rng (spec §9.3). Gameplay-affecting
// shuffles MUST pass a deterministic rng — see §9.3.1 for the audit.
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortHand(hand) {
  return [...hand].sort((a, b) => {
    const suitOrder = { bamboo: 0, characters: 1, dots: 2, wind: 3, dragon: 4 };
    if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
    if (a.rank && b.rank) return a.rank - b.rank;
    if (a.honor && b.honor) {
      const ho = { east: 0, south: 1, west: 2, north: 3, red: 0, green: 1, white: 2 };
      return (ho[a.honor] || 0) - (ho[b.honor] || 0);
    }
    return 0;
  });
}
