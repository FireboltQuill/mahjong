// AI reactions — short lines shown near an AI seat in response to
// gameplay events (§11). Same latest-wins generation-stamped cleanup
// pattern as tile animations (§10.3, §11.3).

// Seed line pools per §11.4.1. Small (4 entries per kind × 2 langs) so
// daily challenges don't feel randomized between visits — the
// cosmeticRng picks a stable index per seat per kind at game start.
const REACTION_LINES = {
  hu_win:       { en: ["Hu!", "Got it!", "That's mine!", "Yes!"],                zh: ["胡了！", "我胡！", "中了！", "好！"] },
  hu_lose:      { en: ["Not again...", "Tough break.", "Ugh.", "I had it."],     zh: ["又这样…", "亏了…", "唉…", "差一点。"] },
  dealt_winner: { en: ["Sorry!", "My bad.", "Take it.", "That was reckless."],   zh: ["抱歉！", "失误了。", "拿去吧。", "失算。"] },
  big_loss:     { en: ["Painful.", "That hurts.", "Costly turn.", "Bleeding."],  zh: ["心痛。", "好痛。", "太亏。", "失血。"] },
  bankrupt:     { en: ["Out of chips.", "Broke...", "Down and out.", "Empty."],  zh: ["破产了。", "没了…", "完了。", "空了。"] },
  comeback:     { en: ["Back on top!", "Climbing back.", "Watch out!", "Here we go!"], zh: ["回来了！", "翻身！", "小心点！", "走起！"] },
};

// Default threshold for the big_loss kind (spec §11.4). Start conservative;
// negative numbers because losses are negative deltas.
const REACTION_BIG_LOSS_THRESHOLD = -80;

// Deterministically pick a seed index per seat per reaction kind using
// the cosmeticRng (spec §11.4.1). Returns
//   { [seatIdx]: { [kind]: seedIdx } }
// for the 3 AI seats and the 6 kinds. Human seat gets no entry.
function seedReactionIndices(cosmeticRng) {
  const seeds = {};
  const kinds = Object.keys(REACTION_LINES);
  for (let seat = 1; seat <= 3; seat++) {
    seeds[seat] = {};
    for (const kind of kinds) {
      const pool = REACTION_LINES[kind].en;
      seeds[seat][kind] = cosmeticRng.nextInt(pool.length);
    }
  }
  return seeds;
}

// Return the seat's frozen line for `kind` in `lang`. Falls back to
// pool[0] if the seed hasn't been populated (backward compat with
// pre-Phase-7 saves).
function reactionLineFor(seeds, seatIdx, kind, lang) {
  const pool = REACTION_LINES[kind] && REACTION_LINES[kind][lang];
  if (!pool || pool.length === 0) return "";
  const idx = seeds && seeds[seatIdx] && seeds[seatIdx][kind];
  const safe = typeof idx === "number" && idx >= 0 && idx < pool.length ? idx : 0;
  return pool[safe];
}
