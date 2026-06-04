// Seeded RNG primitives for deterministic gameplay (spec §9.2).
// Mulberry32 because it's tiny, fast, has full 32-bit period, and only
// uses Math.imul + xorshift — operations that produce identical results
// across browsers without any host-specific behaviour (unlike Math.random
// or v8's sort comparator).

function seededRng(seed) {
  let s = seed >>> 0;
  function next() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    nextInt(n) { return Math.floor(next() * n); },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
  };
}

// Fallback RNG that delegates to Math.random — used only by code paths
// the spec explicitly allows (gameId generation, cosmeticRng for
// non-daily games when no seed is supplied).
const defaultRng = {
  next() { return Math.random(); },
  nextInt(n) { return Math.floor(Math.random() * n); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
};

// Cryptographically strong uint32 for seeding when no caller-supplied
// seed exists (spec §9.2). Falls back to Math.random in non-secure
// contexts because daily mode supplies its own deterministic seed and
// non-daily games don't need cryptographic randomness.
function randomUint32() {
  if (globalThis.crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    globalThis.crypto.getRandomValues(arr);
    return arr[0] >>> 0;
  }
  return (Math.floor(Math.random() * 0x100000000)) >>> 0;
}

// Per-round seed derivation from a match seed (spec §9.5). Two-stage
// mix so adjacent matchSeeds with small roundNumbers don't produce
// adjacent round seeds — the single-Math.imul form is close to identity
// for roundNumber 1..16.
function seedForRound(matchSeed, roundNumber) {
  let h = (matchSeed ^ Math.imul(roundNumber + 1, 0x85EBCA6B)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0xC2B2AE35) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h >>> 0;
}

// FNV-1a 32-bit hash of a daily date string (spec §9.8). Same UTC date
// produces the same matchSeed across browsers/users without any clock
// or device-specific input.
function seedFromDate(str) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Today's UTC date in YYYY-MM-DD form. Used for daily challenge keying.
function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

// One day earlier than the given UTC date (for daily streak walking
// per spec §9.10.1). Input/output: "YYYY-MM-DD".
function utcDateMinusOneDay(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
