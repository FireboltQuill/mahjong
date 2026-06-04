// ============================================================
// TILE SHORT-SPEC PARSING (for the admin console)
// ============================================================
// Examples:
//   b1..b9   bamboo 1..9
//   c1..c9   characters 1..9
//   d1..d9   dots 1..9
//   E/S/W/N  east/south/west/north wind
//   R/G/P    red/green/white(plate) dragon
const ADMIN_HONOR_MAP = {
  E: ["wind", "east"], S: ["wind", "south"],
  W: ["wind", "west"], N: ["wind", "north"],
  R: ["dragon", "red"], G: ["dragon", "green"], P: ["dragon", "white"],
};

// Admin-side parser. idGen is required so each minted tile gets a
// caller-controlled deterministic id (spec §9.4). main.jsx's applyAdmin
// computes a starting id via the §9.4 collision-floor scan and passes
// an incrementing factory in.
function parseTileSpec(spec, idGen) {
  if (!spec) return null;
  const t = spec.trim();
  if (!t) return null;
  const suitMatch = /^([bcd])([1-9])$/i.exec(t);
  if (suitMatch) {
    const suitMap = { b: "bamboo", c: "characters", d: "dots" };
    return createTile(suitMap[suitMatch[1].toLowerCase()], parseInt(suitMatch[2], 10), null, idGen());
  }
  const honor = ADMIN_HONOR_MAP[t.toUpperCase()];
  if (honor) return createTile(honor[0], null, honor[1], idGen());
  return null;
}

function parseTileList(input, idGen) {
  if (!input) return [];
  return input.split(/[\s,]+/).filter(Boolean).map((s) => parseTileSpec(s, idGen)).filter(Boolean);
}

function tileToSpec(t) {
  if (t.suit === "wind") return { east: "E", south: "S", west: "W", north: "N" }[t.honor];
  if (t.suit === "dragon") return { red: "R", green: "G", white: "P" }[t.honor];
  return ({ bamboo: "b", characters: "c", dots: "d" }[t.suit]) + t.rank;
}

function parseMeld(meldStr, idGen) {
  if (!meldStr) return null;
  const trimmed = meldStr.trim();
  if (!trimmed) return null;
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx < 0) return null;
  let type = trimmed.slice(0, colonIdx).trim().toLowerCase();
  let concealed = false;
  if (type.endsWith("!")) {
    concealed = true;
    type = type.slice(0, -1).trim();
  }
  if (!["peng", "chi", "gang"].includes(type)) return null;
  const tiles = parseTileList(trimmed.slice(colonIdx + 1), idGen);
  if (tiles.length === 0) return null;
  return { type, tiles, claimed: !concealed, concealed };
}

// Melds are separated by ';' (tile lists inside a meld are space-separated).
function parseMeldList(input, idGen) {
  if (!input) return [];
  return input.split(";").map((s) => s.trim()).filter(Boolean).map((s) => parseMeld(s, idGen)).filter(Boolean);
}

function meldToSpec(m) {
  return `${m.type}${m.concealed ? "!" : ""}:${m.tiles.map(tileToSpec).join(" ")}`;
}
