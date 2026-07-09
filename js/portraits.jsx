// AI portraits — a small library of hand-drawn SVG portraits rendered
// per AI seat. Each portrait is a stylized silhouette assembled from
// SVG primitives (no external assets, no font emoji, no imported art)
// and mapped to a name via a deterministic hash so the same AI name
// always gets the same portrait. See spec §11.2.

// Seat-scoped fallback palette. Only used when a portrait fails to
// render (should never happen at runtime).
const PORTRAIT_COLORS = [
  { bg: "#3d6b4a", fg: "#e8d9a8" },
  { bg: "#5c3a5c", fg: "#f0d0d0" },
  { bg: "#6b4a2a", fg: "#e8d9a8" },
  { bg: "#3a4a6b", fg: "#e0e8f0" },
];

// 12 hand-designed presets. Each combines a background gradient, a hair
// silhouette, a skin tone, an eye color, and an optional accessory.
// Presets read as silhouettes at 28px thanks to strong bg/hair contrast.
const PORTRAIT_PRESETS = [
  { id: 0,  bg: "#7a2530", bgAlt: "#4a1520", hair: "#141014", hairStyle: "short-spiky", skin: "#d9b088", eye: "#2a2020", accessory: "headband-red" },
  { id: 1,  bg: "#3d2a5c", bgAlt: "#2a1a44", hair: "#8b6ab8", hairStyle: "long-straight", skin: "#e8c8b0", eye: "#4a2a5a", accessory: null },
  { id: 2,  bg: "#a67a2d", bgAlt: "#6e4d1a", hair: "#e8c860", hairStyle: "twin-tails", skin: "#f0d8b8", eye: "#4a3a2a", accessory: "ribbon-pink" },
  { id: 3,  bg: "#2f4670", bgAlt: "#1c2c48", hair: "#c8c8dc", hairStyle: "short-swept", skin: "#e8d8c8", eye: "#5a7a9a", accessory: "earring-silver" },
  { id: 4,  bg: "#1f4444", bgAlt: "#0d2222", hair: "#0d0d1c", hairStyle: "ponytail", skin: "#c9a37c", eye: "#4a7a5a", accessory: "face-mask" },
  { id: 5,  bg: "#6c1f34", bgAlt: "#3f0f22", hair: "#180818", hairStyle: "bob", skin: "#e8c8b0", eye: "#7a4a8a", accessory: "circlet-gold" },
  { id: 6,  bg: "#25605e", bgAlt: "#0f3e3c", hair: "#3f8060", hairStyle: "wild-messy", skin: "#c8a878", eye: "#4a3a2a", accessory: "eyepatch" },
  { id: 7,  bg: "#7a3860", bgAlt: "#4e1f40", hair: "#e484aa", hairStyle: "bob", skin: "#f0d8c8", eye: "#6a4a8a", accessory: "crescent-mark" },
  { id: 8,  bg: "#8a562a", bgAlt: "#553318", hair: "#b3502c", hairStyle: "braid", skin: "#f0c8a8", eye: "#6a4a2a", accessory: null },
  { id: 9,  bg: "#a56048", bgAlt: "#6e3a26", hair: "#161010", hairStyle: "buzz", skin: "#c8996f", eye: "#3a1a10", accessory: "headband-white" },
  { id: 10, bg: "#243450", bgAlt: "#101c30", hair: "#4ab8c8", hairStyle: "asymmetric-bob", skin: "#e0d0c0", eye: "#5ad0e0", accessory: "cyber-line" },
  { id: 11, bg: "#2f5432", bgAlt: "#153015", hair: "#6a4426", hairStyle: "top-knot", skin: "#c8a480", eye: "#4a6a3a", accessory: "leaf" },
];

// Simple deterministic hash for name → preset id. FNV-ish mix so short
// strings still spread across the preset range.
function portraitIndexForName(name) {
  const s = String(name || "");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % PORTRAIT_PRESETS.length;
}

// Preset lookup that never fails.
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
    case "twin-tails":
      return (
        <g>
          <ellipse cx="50" cy="38" rx="23" ry="15" fill={color}/>
          <ellipse cx="24" cy="72" rx="7" ry="18" fill={color}/>
          <ellipse cx="76" cy="72" rx="7" ry="18" fill={color}/>
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
    case "ponytail":
      return (
        <g>
          <ellipse cx="50" cy="35" rx="23" ry="14" fill={color}/>
          <ellipse cx="82" cy="62" rx="6" ry="22" fill={color}/>
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
    case "short-spiky":
    case "short-swept":
    case "buzz":
    default:
      return null; // no hair behind head for these styles
  }
}

function HairFront({ style, color }) {
  switch (style) {
    case "short-spiky":
      return (
        <path d="M28 44 Q28 22 50 22 Q72 22 72 44 L68 38 L64 42 L58 34 L52 44 L46 34 L40 42 L34 38 L32 42 Z" fill={color}/>
      );
    case "long-straight":
      return (
        <path d="M28 44 Q40 38 50 42 Q60 38 72 44 L70 52 Q50 46 30 52 Z" fill={color}/>
      );
    case "twin-tails":
      return (
        <path d="M30 42 Q40 36 50 40 Q60 36 70 42 L68 50 Q50 44 32 50 Z" fill={color}/>
      );
    case "bob":
      return (
        <path d="M30 42 Q40 38 50 40 Q60 38 70 42 L68 50 Q50 44 32 50 Z" fill={color}/>
      );
    case "short-swept":
      return (
        <path d="M28 44 Q28 24 50 24 Q72 24 72 44 L70 40 Q60 32 42 38 Q32 42 30 46 Z" fill={color}/>
      );
    case "ponytail":
      return (
        <path d="M28 42 Q50 36 72 42 L70 48 Q50 42 30 48 Z" fill={color}/>
      );
    case "buzz":
      return (
        <path d="M30 44 Q30 32 50 32 Q70 32 70 44 Q68 40 60 38 Q50 36 40 38 Q32 40 30 44 Z" fill={color}/>
      );
    case "wild-messy":
      return (
        <path d="M28 44 Q40 32 50 40 Q60 32 72 44 L70 50 Q50 44 30 50 Z" fill={color}/>
      );
    case "braid":
    case "asymmetric-bob":
      return (
        <path d="M28 44 Q40 38 50 42 Q60 38 72 44 L70 50 Q50 46 30 50 Z" fill={color}/>
      );
    case "top-knot":
      return (
        <path d="M30 44 Q40 38 50 40 Q60 38 70 44 L68 50 Q50 44 32 50 Z" fill={color}/>
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
          <rect x="26" y="42" width="48" height="5" fill="#b4232a"/>
          <rect x="26" y="42" width="48" height="1" fill="#e4444a" opacity="0.6"/>
        </g>
      );
    case "headband-white":
      return (
        <g>
          <rect x="26" y="42" width="48" height="5" fill="#f0e8d8"/>
          <circle cx="50" cy="44.5" r="2.2" fill="#c4232a"/>
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
      <ellipse cx="50" cy="56" rx="18" ry="22" fill={p.skin}/>
      <rect x="43" y="73" width="14" height="12" fill={p.skin}/>
      <path d="M18 100 Q18 84 40 80 L60 80 Q82 84 82 100 Z" fill={p.bgAlt || p.bg} opacity="0.85"/>
      <HairFront style={p.hairStyle} color={p.hair}/>
      <ellipse cx="43" cy="56" rx="1.7" ry="1.3" fill={p.eye}/>
      <ellipse cx="57" cy="56" rx="1.7" ry="1.3" fill={p.eye}/>
      <path d="M46 66 Q50 68 54 66" fill="none" stroke="#5a3020" strokeWidth="0.8" strokeLinecap="round"/>
      <Accessory kind={p.accessory}/>
    </svg>
  );
}

// Preferred entry-point for callers. Returns preset object for a name.
function getPortrait(seatIdx, name) {
  void seatIdx;
  return portraitPresetForName(name);
}

// Colors for a given seat (safe-indexed). Retained for backwards-
// compatible fallback use.
function portraitColors(seatIdx) {
  return PORTRAIT_COLORS[seatIdx] || PORTRAIT_COLORS[0];
}
