// AI portraits — a library of hand-drawn SVG portraits rendered per AI
// seat. Each portrait is a stylized silhouette assembled from SVG
// primitives (no external assets, no font emoji, no imported art) and
// mapped to a name via an explicit lookup table. Names not in the
// table fall back to a deterministic hash so daily-only or custom
// names still get a stable portrait. See spec §11.2.

// Seat-scoped fallback palette. Only used when a portrait fails to
// render (should never happen at runtime).
const PORTRAIT_COLORS = [
  { bg: "#3d6b4a", fg: "#e8d9a8" },
  { bg: "#5c3a5c", fg: "#f0d0d0" },
  { bg: "#6b4a2a", fg: "#e8d9a8" },
  { bg: "#3a4a6b", fg: "#e0e8f0" },
];

// 28 hand-designed presets. Each combines a background gradient, a
// hair silhouette, a skin tone, an eye color, and an optional
// accessory. Designed to be visually distinct at 32px via strong bg
// contrast and clear silhouette differences.
const PORTRAIT_PRESETS = [
  // 0..3 — Street Fighter group. Broad traits: hair colour + silhouette
  // + general palette + category of accessory. Designs remain original.
  { id: 0,  bg: "#3a4a6a", bgAlt: "#20304a", hair: "#d8b878", hairStyle: "long-wavy",         skin: "#e8d0b0", eye: "#3a5a8a", accessory: "earring-silver" }, // Manon: blonde wavy, elegant navy
  { id: 1,  bg: "#4a1a3a", bgAlt: "#280a20", hair: "#3a1a3a", hairStyle: "asymmetric-bob",    skin: "#d9b088", eye: "#8a3aa8", accessory: "cyber-line" },   // Juri: near-black/violet edgy cut, purple eye
  { id: 2,  bg: "#2a4a3a", bgAlt: "#152a20", hair: "#d8b878", hairStyle: "twin-tails",        skin: "#e0c0a0", eye: "#3a5a8a", accessory: "tribal-mark" }, // Cammy: blonde twin braids, red cheek marks
  { id: 3,  bg: "#2a4a7a", bgAlt: "#1a3050", hair: "#241820", hairStyle: "twin-tails",        skin: "#e8c8a8", eye: "#4a3020", accessory: "ribbon-pink" }, // Chun Li: black double buns, Chinese blue
  // 4..7 — Guilty Gear group.
  { id: 4,  bg: "#7a3a5a", bgAlt: "#4a1a35", hair: "#d8b078", hairStyle: "long-with-forelock", skin: "#f0d0b8", eye: "#4a2a2a", accessory: "feather" },      // Elphelt: blonde with forelock, pink palette
  { id: 5,  bg: "#2a3a5a", bgAlt: "#152540", hair: "#5a8ac8", hairStyle: "long-straight",     skin: "#e8d8d0", eye: "#7a9ac0", accessory: null },           // Dizzy: light blue long hair, cool blue
  { id: 6,  bg: "#3a3a5a", bgAlt: "#25254a", hair: "#e8dcd0", hairStyle: "pixie",             skin: "#a67a58", eye: "#4a2a5a", accessory: "forehead-jewel" }, // Ramlethal: white pixie, dark skin, indigo
  { id: 7,  bg: "#4a2030", bgAlt: "#2a1020", hair: "#e4508a", hairStyle: "side-braid",        skin: "#e8c8a8", eye: "#4a3020", accessory: "eyepatch" },     // Baiken: hot pink side ponytail, eyepatch
  // 8..11 — Tekken group.
  { id: 8,  bg: "#6a4a1a", bgAlt: "#4a2a08", hair: "#d8a860", hairStyle: "high-ponytail",     skin: "#e8c8a8", eye: "#6a4a2a", accessory: "headband-white" }, // Lidia: blonde updo, martial-arts amber
  { id: 9,  bg: "#2a4a3a", bgAlt: "#153a2a", hair: "#241820", hairStyle: "long-straight",     skin: "#e8c8a8", eye: "#3a2a20", accessory: null },           // Jun: black long straight, spiritual jade
  { id: 10, bg: "#3a2a5a", bgAlt: "#1a1a4a", hair: "#241820", hairStyle: "wavy-long",         skin: "#a67a58", eye: "#4a2a5a", accessory: "forehead-jewel" }, // Zafina: dark skin, black wavy, mystical purple
  { id: 11, bg: "#7a5a8a", bgAlt: "#5a3a70", hair: "#e8d0a0", hairStyle: "drills",            skin: "#f0d8c0", eye: "#6a3a2a", accessory: "ribbon-pink" },  // Lili: blonde drills, princess pastel pink
  // 12..15 — Bleach group.
  { id: 12, bg: "#2a4a3a", bgAlt: "#153a2a", hair: "#241820", hairStyle: "braid",             skin: "#e0c0a0", eye: "#3a2a20", accessory: null },           // Retsu: black front braid, healer green
  { id: 13, bg: "#4a6a8a", bgAlt: "#2a4a6a", hair: "#e8e0d8", hairStyle: "long-straight",     skin: "#dcbfa8", eye: "#4a6a8a", accessory: null },           // Sode no Shirayuki: white ice-spirit
  { id: 14, bg: "#4a2a5a", bgAlt: "#2a1a35", hair: "#4a2a4a", hairStyle: "high-ponytail",     skin: "#8a5a3a", eye: "#d8a848", accessory: null },           // Yoruichi: dark skin, purple ponytail, cat eyes
  { id: 15, bg: "#7a5a3a", bgAlt: "#4a3018", hair: "#d8b078", hairStyle: "hime",              skin: "#f0d8b8", eye: "#6a4a2a", accessory: "veil-back" },   // Senjumaru: blonde hime, veil trailing
  // 16..19 — Naruto group.
  { id: 16, bg: "#2a5a5a", bgAlt: "#1a3a3a", hair: "#a83030", hairStyle: "long-with-forelock", skin: "#e8c8a8", eye: "#3a5a4a", accessory: "headband-red" }, // Mei: red hair covering one eye, Mist palette
  { id: 17, bg: "#6a5a2a", bgAlt: "#4a3a15", hair: "#d8c090", hairStyle: "twin-tails",        skin: "#dcb888", eye: "#3a5a4a", accessory: "headband-white" }, // Temari: blonde ponytails, Sand village
  { id: 18, bg: "#6a6a8a", bgAlt: "#3a3a5a", hair: "#e8e0d8", hairStyle: "long-straight",     skin: "#dcbba4", eye: "#b83a4a", accessory: "horns" },       // Kaguya: white long, horns, lunar palette
  { id: 19, bg: "#4a5a7a", bgAlt: "#2a3a5a", hair: "#d8b078", hairStyle: "bob",               skin: "#e8d0b8", eye: "#4a5a7a", accessory: "earring-silver" }, // Samui: blonde bob, Cloud cerulean
  // 20..23 — One Piece group.
  { id: 20, bg: "#4a2a5a", bgAlt: "#2a1a3a", hair: "#241820", hairStyle: "wavy-long",         skin: "#e8c8a8", eye: "#4a2a5a", accessory: null },           // Robin: black wavy, historian purple
  { id: 21, bg: "#7a3050", bgAlt: "#4a1a35", hair: "#241820", hairStyle: "long-straight",     skin: "#e8c8a8", eye: "#4a3020", accessory: "circlet-gold" }, // Boa: black long, empress heart-red palette
  { id: 22, bg: "#7a6a3a", bgAlt: "#5a4a20", hair: "#5a8ac8", hairStyle: "long-straight",     skin: "#e8c8a8", eye: "#3a5a8a", accessory: "circlet-gold" }, // Vivi: blue long, Arabian gold + saffron
  { id: 23, bg: "#7a3a5a", bgAlt: "#4a1a35", hair: "#e484aa", hairStyle: "high-ponytail",     skin: "#f0d8c0", eye: "#4a3020", accessory: null },           // Bonney: pink ponytail, tropical pink
  // 24..27 — Freezing group.
  { id: 24, bg: "#3a5a3a", bgAlt: "#1a3a1a", hair: "#e8c890", hairStyle: "bob",               skin: "#f0d8b8", eye: "#4a5a3a", accessory: null },           // Chiffon: blonde bob, calm forest
  { id: 25, bg: "#6a2a3a", bgAlt: "#3a1a25", hair: "#d8b078", hairStyle: "long-straight",     skin: "#e8c8a8", eye: "#4a3a4a", accessory: null },           // Cassandra: blonde long, garnet warrior
  { id: 26, bg: "#4a5a8a", bgAlt: "#2a3a5a", hair: "#e8d0a0", hairStyle: "long-wavy",         skin: "#f0d8b8", eye: "#3a5a8a", accessory: null },           // Satellizer: blonde long wavy, azure
  { id: 27, bg: "#3a3a3a", bgAlt: "#1a1a1a", hair: "#181214", hairStyle: "bob",               skin: "#e0c0a0", eye: "#4a3020", accessory: "headband-red" }, // Kazuha: black bob, red hairband
];

// Explicit name → portrait id mapping. Same names as the default
// DEFAULT_NAME_GROUPS in names.jsx; the mapping is stable so the same
// AI name always gets the same portrait regardless of which group
// they end up in.
const PORTRAIT_NAME_MAP = {
  // Street Fighter group
  "Manon": 0, "Juri": 1, "Cammy": 2, "Chun Li": 3,
  // Guilty Gear group
  "Elphelt": 4, "Dizzy": 5, "Ramlethal": 6, "Baiken": 7,
  // Tekken group
  "Lidia": 8, "Jun": 9, "Zafina": 10, "Lili": 11,
  // Bleach group
  "Retsu": 12, "Sode no Shirayuki": 13, "Yoruichi": 14, "Senjumaru": 15,
  // Naruto group
  "Mei": 16, "Temari": 17, "Kaguya": 18, "Samui": 19,
  // One Piece group
  "Robin": 20, "Boa": 21, "Vivi": 22, "Jewelry": 23,
  // Freezing group
  "Chiffon": 24, "Cassandra": 25, "Satellizer": 26, "Kazuha": 27,
};

// FNV-ish name hash for names not in the explicit map (Daily group,
// custom user-defined names, "You" fallback).
function portraitIndexForName(name) {
  const key = String(name || "");
  if (Object.prototype.hasOwnProperty.call(PORTRAIT_NAME_MAP, key)) {
    return PORTRAIT_NAME_MAP[key];
  }
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % PORTRAIT_PRESETS.length;
}

function portraitPresetForName(name) {
  return PORTRAIT_PRESETS[portraitIndexForName(name)];
}

// ---- SVG parts ----

function HairBack({ style, color }) {
  switch (style) {
    case "long-straight":
      return (
        <g>
          <rect x="26" y="42" width="48" height="58" fill={color}/>
          <ellipse cx="50" cy="40" rx="24" ry="16" fill={color}/>
        </g>
      );
    case "long-wavy":
      return (
        <g>
          <rect x="26" y="42" width="48" height="58" fill={color}/>
          <ellipse cx="50" cy="40" rx="24" ry="16" fill={color}/>
          <ellipse cx="22" cy="66" rx="4" ry="7" fill={color}/>
          <ellipse cx="78" cy="66" rx="4" ry="7" fill={color}/>
          <ellipse cx="24" cy="86" rx="4" ry="6" fill={color}/>
          <ellipse cx="76" cy="86" rx="4" ry="6" fill={color}/>
        </g>
      );
    case "wavy-long":
      return (
        <g>
          <rect x="26" y="42" width="48" height="58" fill={color}/>
          <ellipse cx="50" cy="40" rx="24" ry="16" fill={color}/>
          <ellipse cx="22" cy="72" rx="5" ry="8" fill={color}/>
          <ellipse cx="78" cy="72" rx="5" ry="8" fill={color}/>
          <ellipse cx="20" cy="92" rx="5" ry="6" fill={color}/>
          <ellipse cx="80" cy="92" rx="5" ry="6" fill={color}/>
        </g>
      );
    case "hime":
      return (
        <g>
          <rect x="26" y="42" width="48" height="58" fill={color}/>
          <ellipse cx="50" cy="38" rx="24" ry="15" fill={color}/>
        </g>
      );
    case "twin-tails":
      return (
        <g>
          <ellipse cx="50" cy="38" rx="23" ry="15" fill={color}/>
          <ellipse cx="24" cy="72" rx="7" ry="18" fill={color}/>
          <ellipse cx="76" cy="72" rx="7" ry="18" fill={color}/>
        </g>
      );
    case "drills":
      return (
        <g>
          <ellipse cx="50" cy="38" rx="22" ry="15" fill={color}/>
          <circle cx="24" cy="60" r="5" fill={color}/>
          <circle cx="24" cy="72" r="4.5" fill={color}/>
          <circle cx="24" cy="82" r="4" fill={color}/>
          <circle cx="76" cy="60" r="5" fill={color}/>
          <circle cx="76" cy="72" r="4.5" fill={color}/>
          <circle cx="76" cy="82" r="4" fill={color}/>
        </g>
      );
    case "bob":
      return (
        <g>
          <ellipse cx="50" cy="40" rx="25" ry="17" fill={color}/>
          <path d={`M25 42 L25 66 Q25 70 30 70 L36 70 L36 55 Z`} fill={color}/>
          <path d={`M75 42 L75 66 Q75 70 70 70 L64 70 L64 55 Z`} fill={color}/>
        </g>
      );
    case "wild-messy":
      return (
        <g>
          <ellipse cx="50" cy="41" rx="27" ry="20" fill={color}/>
          <path d="M22 46 L18 56 M78 46 L82 56 M32 22 L34 26 M50 20 L50 24 M68 22 L66 26 M28 60 L22 68 M72 60 L78 68" stroke={color} strokeWidth="5" strokeLinecap="round"/>
        </g>
      );
    case "braid":
      return (
        <g>
          <ellipse cx="50" cy="40" rx="24" ry="16" fill={color}/>
          <ellipse cx="70" cy="58" rx="6" ry="5" fill={color}/>
          <ellipse cx="73" cy="68" rx="5" ry="4" fill={color}/>
          <ellipse cx="76" cy="78" rx="4" ry="4" fill={color}/>
          <ellipse cx="79" cy="88" rx="3" ry="3" fill={color}/>
        </g>
      );
    case "side-braid":
      return (
        <g>
          <ellipse cx="50" cy="40" rx="24" ry="16" fill={color}/>
          <ellipse cx="30" cy="58" rx="6" ry="5" fill={color}/>
          <ellipse cx="27" cy="68" rx="5" ry="4" fill={color}/>
          <ellipse cx="24" cy="78" rx="4" ry="4" fill={color}/>
          <ellipse cx="21" cy="88" rx="3" ry="3" fill={color}/>
        </g>
      );
    case "ponytail":
      return (
        <g>
          <ellipse cx="50" cy="35" rx="23" ry="14" fill={color}/>
          <ellipse cx="82" cy="62" rx="6" ry="22" fill={color}/>
        </g>
      );
    case "high-ponytail":
      return (
        <g>
          <ellipse cx="50" cy="42" rx="22" ry="17" fill={color}/>
          <ellipse cx="50" cy="22" rx="11" ry="12" fill={color}/>
        </g>
      );
    case "asymmetric-bob":
      return (
        <g>
          <ellipse cx="50" cy="40" rx="25" ry="17" fill={color}/>
          <path d={`M25 42 L25 58 Q25 60 27 60 L32 60 L32 52 Z`} fill={color}/>
          <path d={`M75 42 L75 86 Q75 90 71 90 L64 90 L64 60 Z`} fill={color}/>
        </g>
      );
    case "top-knot":
      return (
        <g>
          <ellipse cx="50" cy="42" rx="22" ry="15" fill={color}/>
          <circle cx="50" cy="20" r="9" fill={color}/>
          <rect x="47" y="26" width="6" height="6" fill={color}/>
        </g>
      );
    case "long-with-forelock":
      return (
        <g>
          <rect x="26" y="42" width="48" height="58" fill={color}/>
          <ellipse cx="50" cy="40" rx="24" ry="16" fill={color}/>
        </g>
      );
    case "short-spiky":
    case "short-swept":
    case "buzz":
    case "pixie":
    default:
      return null;
  }
}

function HairFront({ style, color }) {
  switch (style) {
    case "short-spiky":
      return (
        <path d="M28 44 Q28 22 50 22 Q72 22 72 44 L68 38 L64 42 L58 34 L52 44 L46 34 L40 42 L34 38 L32 42 Z" fill={color}/>
      );
    case "long-straight":
    case "long-wavy":
    case "wavy-long":
      return (
        <path d="M28 38 Q40 28 50 32 Q60 28 72 38 L70 52 Q50 46 30 52 Z" fill={color}/>
      );
    case "hime":
      return (
        <g>
          <rect x="28" y="42" width="6" height="20" fill={color}/>
          <rect x="66" y="42" width="6" height="20" fill={color}/>
          <path d="M28 38 Q40 26 50 32 Q60 26 72 38 L72 48 L28 48 Z" fill={color}/>
        </g>
      );
    case "twin-tails":
    case "drills":
      return (
        <path d="M30 38 Q40 26 50 32 Q60 26 70 38 L68 50 Q50 44 32 50 Z" fill={color}/>
      );
    case "bob":
      return (
        <path d="M30 38 Q40 28 50 32 Q60 28 70 38 L68 50 Q50 44 32 50 Z" fill={color}/>
      );
    case "short-swept":
      return (
        <path d="M28 44 Q28 24 50 24 Q72 24 72 44 L70 40 Q60 32 42 38 Q32 42 30 46 Z" fill={color}/>
      );
    case "ponytail":
    case "high-ponytail":
      return (
        <path d="M28 38 Q50 26 72 38 L70 48 Q50 42 30 48 Z" fill={color}/>
      );
    case "buzz":
      return (
        <path d="M30 44 Q30 32 50 32 Q70 32 70 44 Q68 40 60 38 Q50 36 40 38 Q32 40 30 44 Z" fill={color}/>
      );
    case "wild-messy":
      return (
        <path d="M28 38 Q40 24 50 32 Q60 24 72 38 L70 50 Q50 44 30 50 Z" fill={color}/>
      );
    case "braid":
    case "side-braid":
    case "asymmetric-bob":
      return (
        <path d="M28 38 Q40 28 50 32 Q60 28 72 38 L70 50 Q50 46 30 50 Z" fill={color}/>
      );
    case "top-knot":
      return (
        <path d="M30 38 Q40 28 50 32 Q60 28 70 38 L68 50 Q50 44 32 50 Z" fill={color}/>
      );
    case "pixie":
      return (
        <path d="M28 46 Q28 22 50 22 Q72 22 72 46 L68 42 Q60 38 50 40 Q40 38 32 42 Z" fill={color}/>
      );
    case "long-with-forelock":
      return (
        <g>
          <path d="M28 38 Q40 28 50 32 Q60 28 72 38 L70 52 Q50 46 30 52 Z" fill={color}/>
          <path d="M32 50 Q28 60 34 66 Q37 62 36 50 Z" fill={color}/>
          <path d="M68 50 Q72 60 66 66 Q63 62 64 50 Z" fill={color}/>
        </g>
      );
    default:
      return null;
  }
}

function Accessory({ kind }) {
  switch (kind) {
    case "headband-red":
      return (
        <g>
          <path d="M22 44 Q50 30 78 44 L78 50 Q50 40 22 50 Z" fill="#b4232a"/>
          <path d="M22 44 Q50 30 78 44" fill="none" stroke="#e4444a" strokeWidth="1.3" opacity="0.6"/>
        </g>
      );
    case "headband-white":
      return (
        <g>
          <path d="M22 44 Q50 30 78 44 L78 50 Q50 40 22 50 Z" fill="#f0e8d8"/>
          <path d="M22 44 Q50 30 78 44" fill="none" stroke="#c8c0b0" strokeWidth="1.2" opacity="0.6"/>
          <circle cx="50" cy="37" r="3.2" fill="#c4232a"/>
        </g>
      );
    case "circlet-gold":
      return (
        <g>
          <rect x="26" y="36" width="48" height="3" fill="#d4b048"/>
          <polygon points="46,36 54,36 50,43" fill="#d4b048"/>
          <circle cx="50" cy="39.5" r="1.6" fill="#c43232"/>
        </g>
      );
    case "eyepatch":
      return (
        <g>
          <ellipse cx="42" cy="55" rx="6" ry="4.5" fill="#181018"/>
          <line x1="30" y1="53" x2="55" y2="50" stroke="#181018" strokeWidth="1.4"/>
          <line x1="35" y1="60" x2="55" y2="58" stroke="#181018" strokeWidth="1.4"/>
        </g>
      );
    case "crescent-mark":
      return (
        <path d="M46 40 Q50 36 54 40 Q52 42 50 41 Q48 42 46 40 Z" fill="#c48a48"/>
      );
    case "face-mask":
      return (
        <g>
          <path d="M32 62 Q50 68 68 62 L68 78 L32 78 Z" fill="#1a3838"/>
          <path d="M32 62 Q50 66 68 62" fill="none" stroke="#0a2828" strokeWidth="1"/>
        </g>
      );
    case "cyber-line":
      return (
        <g>
          <line x1="54" y1="59" x2="63" y2="63" stroke="#5ad0e0" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="63" cy="63" r="1.2" fill="#5ad0e0"/>
        </g>
      );
    case "leaf":
      return (
        <ellipse cx="41" cy="30" rx="6" ry="2.4" transform="rotate(-30 41 30)" fill="#6a9a4a"/>
      );
    case "ribbon-pink":
      return (
        <g>
          <polygon points="30,64 24,60 24,68" fill="#e484aa"/>
          <polygon points="70,64 76,60 76,68" fill="#e484aa"/>
        </g>
      );
    case "earring-silver":
      return (
        <circle cx="31" cy="62" r="2" fill="#c8c8d8"/>
      );
    case "forehead-jewel":
      return (
        <g>
          <circle cx="50" cy="41" r="2.6" fill="#c43a5a"/>
          <circle cx="49" cy="40" r="0.9" fill="#f0a0b8" opacity="0.9"/>
        </g>
      );
    case "scar-cheek":
      return (
        <line x1="34" y1="46" x2="42" y2="60" stroke="#a04030" strokeWidth="1.4" strokeLinecap="round"/>
      );
    case "flower":
      return (
        <g transform="translate(30 35)">
          <circle cx="0" cy="0" r="2" fill="#e8b048"/>
          <circle cx="-2.4" cy="-1" r="1.8" fill="#e484aa"/>
          <circle cx="2.4" cy="-1" r="1.8" fill="#e484aa"/>
          <circle cx="-1" cy="2" r="1.8" fill="#e484aa"/>
          <circle cx="1" cy="2" r="1.8" fill="#e484aa"/>
        </g>
      );
    case "tribal-mark":
      return (
        <g>
          <path d="M36 52 L34 58 L32 54" fill="none" stroke="#a03830" strokeWidth="1.3" strokeLinecap="round"/>
          <path d="M64 52 L66 58 L68 54" fill="none" stroke="#a03830" strokeWidth="1.3" strokeLinecap="round"/>
        </g>
      );
    case "feather":
      return (
        <g>
          <path d="M74 24 Q80 30 74 40 Q72 34 68 32 Z" fill="#e8b048"/>
          <line x1="74" y1="24" x2="70" y2="42" stroke="#8a5020" strokeWidth="0.8"/>
        </g>
      );
    case "horns":
      return (
        <g>
          <path d="M36 24 Q34 14 40 12 Q42 18 42 26 Z" fill="#5a4032" stroke="#2a1a10" strokeWidth="0.6"/>
          <path d="M64 24 Q66 14 60 12 Q58 18 58 26 Z" fill="#5a4032" stroke="#2a1a10" strokeWidth="0.6"/>
        </g>
      );
    case "glasses":
      return (
        <g fill="none" stroke="#2a2020" strokeWidth="1.2">
          <circle cx="42" cy="56" r="4"/>
          <circle cx="58" cy="56" r="4"/>
          <line x1="46" y1="56" x2="54" y2="56"/>
        </g>
      );
    case "veil-back":
      return (
        <g>
          <path d="M22 42 Q22 62 30 80 L30 100 L20 100 L20 42 Z" fill="#f0e0c8" opacity="0.75"/>
          <path d="M78 42 Q78 62 70 80 L70 100 L80 100 L80 42 Z" fill="#f0e0c8" opacity="0.75"/>
        </g>
      );
    default:
      return null;
  }
}

// Render a preset as a self-contained inline SVG. `size` is the pixel
// width/height of the output element; the SVG uses viewBox="0 0 100 100"
// internally so it scales cleanly.
function PortraitSvg({ preset, size }) {
  const p = preset;
  const gid = `pg${p.id}`;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size || 32}
      height={size || 32}
      preserveAspectRatio="xMidYMid slice"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.bg}/>
          <stop offset="100%" stopColor={p.bgAlt || p.bg}/>
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${gid})`}/>
      <HairBack style={p.hairStyle} color={p.hair}/>
      <ellipse cx="50" cy="56" rx="18" ry="22" fill={p.skin} stroke="rgba(0,0,0,0.22)" strokeWidth="0.5"/>
      <rect x="43" y="73" width="14" height="12" fill={p.skin}/>
      <path d="M18 100 Q18 84 40 80 L60 80 Q82 84 82 100 Z" fill={p.bgAlt || p.bg} opacity="0.85"/>
      <HairFront style={p.hairStyle} color={p.hair}/>
      <path d="M40 53 Q43 51 46 53" fill="none" stroke="#3a2416" strokeWidth="1.2" strokeLinecap="round" opacity="0.85"/>
      <path d="M54 53 Q57 51 60 53" fill="none" stroke="#3a2416" strokeWidth="1.2" strokeLinecap="round" opacity="0.85"/>
      <ellipse cx="43" cy="57" rx="2.1" ry="1.7" fill={p.eye}/>
      <ellipse cx="57" cy="57" rx="2.1" ry="1.7" fill={p.eye}/>
      <ellipse cx="43.5" cy="56.4" rx="0.5" ry="0.5" fill="rgba(255,255,255,0.7)"/>
      <ellipse cx="57.5" cy="56.4" rx="0.5" ry="0.5" fill="rgba(255,255,255,0.7)"/>
      <path d="M46 66 Q50 68.5 54 66" fill="none" stroke="#4a2818" strokeWidth="1.1" strokeLinecap="round"/>
      <Accessory kind={p.accessory}/>
    </svg>
  );
}

function getPortrait(seatIdx, name) {
  void seatIdx;
  return portraitPresetForName(name);
}

function portraitColors(seatIdx) {
  return PORTRAIT_COLORS[seatIdx] || PORTRAIT_COLORS[0];
}
