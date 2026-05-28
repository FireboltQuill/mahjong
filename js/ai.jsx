// ============================================================
// AI LOGIC
// ============================================================

// --- EASY AI (original) ---

function evaluateHandProgressEasy(hand, openMelds) {
  let score = 0;
  const counts = countTiles(hand);

  for (const k in counts) {
    const c = counts[k];
    if (c.count >= 3) score += 6;
    else if (c.count === 2) score += 3;
  }

  for (const suit of SUITS) {
    const suitTiles = hand.filter((t) => t.suit === suit);
    const ranks = [...new Set(suitTiles.map((t) => t.rank))].sort((a, b) => a - b);
    for (let i = 0; i < ranks.length - 1; i++) {
      if (ranks[i + 1] - ranks[i] <= 2) score += 2;
    }
  }

  const suitsPresent = new Set();
  for (const t of hand) if (isSuit(t)) suitsPresent.add(t.suit);
  for (const m of openMelds) for (const t of m.tiles) if (isSuit(t)) suitsPresent.add(t.suit);
  score += suitsPresent.size * 2;

  const hasTermHonor = hand.some((t) => isTerminalOrHonor(t)) || openMelds.some((m) => m.tiles.some((t) => isTerminalOrHonor(t)));
  if (hasTermHonor) score += 3;

  // Seven pairs bonus (only if no open melds)
  if (openMelds.length === 0) {
    const pairCount = Object.values(counts).filter((c) => c.count >= 2).length;
    if (pairCount >= 5) score += pairCount * 3;
  }

  return score;
}

function aiChooseDiscardEasy(hand, openMelds, _allDiscards) {
  let bestDiscard = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < hand.length; i++) {
    const testHand = hand.filter((_, j) => j !== i);
    const score = evaluateHandProgressEasy(testHand, openMelds);
    if (score > bestScore) {
      bestScore = score;
      bestDiscard = i;
    }
  }
  return bestDiscard;
}

function aiDecideClaimEasy(player, discardedTile, claimType, _seatIndex, _discarderIndex, _allDiscards) {
  if (claimType === "hu") return true;
  const currentScore = evaluateHandProgressEasy(player.hand, player.openMelds);

  if (claimType === "gang") {
    const opt = findGangOption(player.hand, discardedTile);
    if (!opt) return false;
    const newHand = player.hand.filter((t) => !opt.fromHand.some((f) => f.id === t.id));
    const newMelds = [...player.openMelds, { ...opt, claimed: true }];
    return evaluateHandProgressEasy(newHand, newMelds) > currentScore;
  }
  if (claimType === "peng") {
    const opt = findPengOption(player.hand, discardedTile);
    if (!opt) return false;
    const newHand = player.hand.filter((t) => !opt.fromHand.some((f) => f.id === t.id));
    const newMelds = [...player.openMelds, { ...opt, claimed: true }];
    return evaluateHandProgressEasy(newHand, newMelds) > currentScore;
  }
  if (claimType === "chi") {
    const opts = findChiOptions(player.hand, discardedTile);
    if (opts.length === 0) return false;
    for (const opt of opts) {
      const newHand = player.hand.filter((t) => !opt.fromHand.some((f) => f.id === t.id));
      const newMelds = [...player.openMelds, { ...opt, claimed: true }];
      if (evaluateHandProgressEasy(newHand, newMelds) > currentScore + 1) return opt;
    }
    return false;
  }
  return false;
}

// --- EXPERT AI ---

// Count how many copies of a tile are visible (discards + open melds of all players)
function countVisible(tile, allDiscards, allOpenMelds) {
  const k = tileKey(tile);
  let n = 0;
  for (const d of allDiscards) if (tileKey(d) === k) n++;
  for (const m of allOpenMelds) for (const t of m.tiles) if (tileKey(t) === k) n++;
  return n;
}

// How many copies remain unseen (max 4 of each)
function tilesRemaining(tile, hand, allDiscards, allOpenMelds) {
  const k = tileKey(tile);
  let seen = countVisible(tile, allDiscards, allOpenMelds);
  seen += hand.filter((t) => tileKey(t) === k).length;
  return Math.max(0, 4 - seen);
}

// Gather all discards and open melds from all players
function gatherVisible(players) {
  const allDiscards = [];
  const allOpenMelds = [];
  for (const p of players) {
    allDiscards.push(...p.discards);
    allOpenMelds.push(...p.openMelds);
  }
  return { allDiscards, allOpenMelds };
}

// Count completed melds in concealed hand (greedy) — returns { melds, pairs, leftovers }
function countConcealedMelds(hand) {
  const sorted = [...hand].sort((a, b) => {
    if (a.suit !== b.suit) return a.suit < b.suit ? -1 : 1;
    if (a.rank !== b.rank) return (a.rank || 0) - (b.rank || 0);
    return (a.honor || "") < (b.honor || "") ? -1 : 1;
  });

  // Try to find the best decomposition using a simple greedy + backtrack
  let bestResult = { melds: 0, pairs: 0, leftover: sorted.length };

  function tryDecomp(tiles, melds, pairs) {
    if (tiles.length === 0) {
      if (melds > bestResult.melds || (melds === bestResult.melds && pairs > bestResult.pairs)) {
        bestResult = { melds, pairs, leftover: 0 };
      }
      return;
    }
    if (melds + Math.floor(tiles.length / 3) <= bestResult.melds && melds <= bestResult.melds) return;

    const t = tiles[0];
    const rest = tiles.slice(1);

    // Try triplet
    const matching = tiles.filter((x) => tilesMatch(x, t));
    if (matching.length >= 3) {
      const after = [...tiles];
      let removed = 0;
      const filtered = after.filter((x) => {
        if (removed < 3 && tilesMatch(x, t)) { removed++; return false; }
        return true;
      });
      tryDecomp(filtered, melds + 1, pairs);
    }

    // Try sequence (suit tiles only)
    if (isSuit(t) && t.rank <= 7) {
      const r2 = tiles.find((x) => x.suit === t.suit && x.rank === t.rank + 1);
      const r3 = tiles.find((x) => x.suit === t.suit && x.rank === t.rank + 2);
      if (r2 && r3) {
        const after = [...tiles];
        [t, r2, r3].forEach((rem) => {
          const idx = after.findIndex((x) => x.id === rem.id);
          if (idx >= 0) after.splice(idx, 1);
        });
        tryDecomp(after, melds + 1, pairs);
      }
    }

    // Try pair
    if (matching.length >= 2 && pairs === 0) {
      const after = [...tiles];
      let removed = 0;
      const filtered = after.filter((x) => {
        if (removed < 2 && tilesMatch(x, t)) { removed++; return false; }
        return true;
      });
      tryDecomp(filtered, melds, pairs + 1);
    }

    // Skip this tile
    tryDecomp(rest, melds, pairs);
  }

  tryDecomp(sorted, 0, 0);
  return bestResult;
}

// Count "useful waits" — how many different tiles could form a new meld with existing partial groups
function countWaits(hand, allDiscards, allOpenMelds) {
  let waits = 0;
  const checked = new Set();

  // Check each unique tile that could complete something
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 9; rank++) {
      const testTile = { suit, rank, honor: null };
      const k = tileKey(testTile);
      if (checked.has(k)) continue;
      checked.add(k);
      const remaining = tilesRemaining(testTile, hand, allDiscards, allOpenMelds);
      if (remaining === 0) continue;

      // Would adding this tile increase our meld count?
      const before = countConcealedMelds(hand);
      const testHand = [...hand, testTile];
      const after = countConcealedMelds(testHand);
      if (after.melds > before.melds || (after.melds === before.melds && after.pairs > before.pairs)) {
        waits += remaining;
      }
    }
  }
  // Honor tiles
  for (const w of WINDS) {
    const testTile = { suit: "wind", rank: null, honor: w };
    const k = tileKey(testTile);
    if (checked.has(k)) continue;
    checked.add(k);
    const remaining = tilesRemaining(testTile, hand, allDiscards, allOpenMelds);
    if (remaining === 0) continue;
    const before = countConcealedMelds(hand);
    const after = countConcealedMelds([...hand, testTile]);
    if (after.melds > before.melds || (after.melds === before.melds && after.pairs > before.pairs)) {
      waits += remaining;
    }
  }
  for (const d of DRAGONS) {
    const testTile = { suit: "dragon", rank: null, honor: d };
    const k = tileKey(testTile);
    if (checked.has(k)) continue;
    checked.add(k);
    const remaining = tilesRemaining(testTile, hand, allDiscards, allOpenMelds);
    if (remaining === 0) continue;
    const before = countConcealedMelds(hand);
    const after = countConcealedMelds([...hand, testTile]);
    if (after.melds > before.melds || (after.melds === before.melds && after.pairs > before.pairs)) {
      waits += remaining;
    }
  }

  return waits;
}

function evaluateHandProgressExpert(hand, openMelds, allDiscards, allOpenMelds) {
  let score = 0;

  // Core: count concealed melds and pairs
  const decomp = countConcealedMelds(hand);
  const totalMelds = decomp.melds + openMelds.length;
  score += totalMelds * 20;
  score += decomp.pairs * 8;

  // Waits/tile efficiency (capped for performance)
  if (hand.length <= 10) {
    const waits = countWaits(hand, allDiscards, allOpenMelds);
    score += waits * 2;
  }

  // Partial groups: connected tiles that aren't yet melds
  const counts = countTiles(hand);
  for (const k in counts) {
    if (counts[k].count === 2) score += 4; // pairs
  }
  for (const suit of SUITS) {
    const ranks = hand.filter((t) => t.suit === suit).map((t) => t.rank);
    const uniq = [...new Set(ranks)].sort((a, b) => a - b);
    for (let i = 0; i < uniq.length - 1; i++) {
      const gap = uniq[i + 1] - uniq[i];
      if (gap === 1) score += 3; // adjacent
      else if (gap === 2) score += 1; // one-gap
    }
  }

  // === HOUSE RULE AWARENESS ===

  // Rule 1: all 3 suits
  const suitsPresent = new Set();
  for (const t of hand) if (isSuit(t)) suitsPresent.add(t.suit);
  for (const m of openMelds) for (const t of m.tiles) if (isSuit(t)) suitsPresent.add(t.suit);
  if (suitsPresent.size === 3) score += 15;
  else if (suitsPresent.size === 2) score += 6;
  else score -= 5;

  // Rule 2: terminal/honor in at least one meld
  const meldHasTermHonor = openMelds.some((m) => m.tiles.some((t) => isTerminalOrHonor(t)));
  const handHasTermHonor = hand.some((t) => isTerminalOrHonor(t));
  if (meldHasTermHonor) score += 10;
  else if (handHasTermHonor) score += 4;
  else score -= 8;

  // Rule 3: need at least one open (claimed) meld
  const hasOpenClaim = openMelds.some((m) => m.claimed);
  if (hasOpenClaim) score += 10;
  else if (openMelds.length === 0) score -= 2; // neutral, still early

  // === SEVEN PAIRS PATH ===
  // If no open melds, evaluate 7 pairs viability
  if (openMelds.length === 0) {
    const pairCount = Object.values(counts).filter((c) => c.count >= 2).length;
    if (pairCount >= 5) {
      // Strong 7 pairs potential — bonus scales with pair count
      let sevenPairsScore = pairCount * 8;
      // Check house rules for 7 pairs too
      const spSuits = new Set();
      for (const t of hand) if (isSuit(t)) spSuits.add(t.suit);
      if (spSuits.size === 3) sevenPairsScore += 10;
      if (hand.some((t) => isTerminalOrHonor(t))) sevenPairsScore += 5;
      // Use 7 pairs score if it's better than standard path
      score = Math.max(score, sevenPairsScore);
    }
  }

  // Penalty for isolated tiles (no neighbors, only 1 copy) — dead tiles
  for (const t of hand) {
    if (isHonor(t)) {
      const copies = hand.filter((x) => tilesMatch(x, t)).length;
      if (copies === 1) {
        const visible = countVisible(t, allDiscards, allOpenMelds);
        if (visible >= 2) score -= 3; // only 1 left, hard to use
      }
    } else {
      const copies = hand.filter((x) => tilesMatch(x, t)).length;
      if (copies === 1) {
        const hasNeighbor = hand.some((x) => x.suit === t.suit && x.rank !== t.rank && Math.abs(x.rank - t.rank) <= 2);
        if (!hasNeighbor) score -= 2; // isolated suit tile
      }
    }
  }

  return score;
}

// --- PERSONALITY CONFIGS ---
// defenseW: weight on safe-discard logic (0=ignore, 1=normal, 2=heavy)
// pengThr: minimum score gain to peng (lower = claim more)
// chiThr: minimum score gain to chi
// gangThr: minimum score gain to gang (0 = always if not worse)
// firstOpenBonus: extra value assigned to first claimed meld (rule 3)

const PERSONALITIES = {
  generic:    { defenseW: 1.0, pengThr: 3,  chiThr: 5,  gangThr: 0,  firstOpenBonus: 8  },
  aggressive: { defenseW: 0.0, pengThr: -2, chiThr: 0,  gangThr: -5, firstOpenBonus: 12 },
  defensive:  { defenseW: 2.5, pengThr: 8,  chiThr: 12, gangThr: 2,  firstOpenBonus: 4  },
  adaptive:   null, // computed dynamically
};

const PERSONALITY_POOL = ["generic", "aggressive", "defensive", "adaptive", "generic"];

function getAdaptiveConfig(wallLen, players, seatIndex) {
  // Early game (>60 tiles): patient, slightly defensive
  // Mid game (30-60): balanced
  // Late game (<30): aggressive, race to win
  const wallRatio = wallLen / 136;

  // Check if any opponent looks close (many open melds)
  let opponentThreat = false;
  for (let i = 0; i < 4; i++) {
    if (i === seatIndex) continue;
    if (players[i].openMelds.length >= 3) opponentThreat = true;
    if (players[i].hand.length <= 4 && players[i].openMelds.length >= 2) opponentThreat = true;
  }

  if (opponentThreat) {
    // Switch to defensive when someone looks close to winning
    return { defenseW: 2.0, pengThr: 6, chiThr: 10, gangThr: 0, firstOpenBonus: 6 };
  }
  if (wallRatio > 0.45) {
    // Early: patient
    return { defenseW: 1.2, pengThr: 5, chiThr: 8, gangThr: 0, firstOpenBonus: 8 };
  }
  if (wallRatio > 0.2) {
    // Mid: balanced
    return { defenseW: 1.0, pengThr: 3, chiThr: 5, gangThr: 0, firstOpenBonus: 8 };
  }
  // Late: aggressive push
  return { defenseW: 0.3, pengThr: -1, chiThr: 1, gangThr: -3, firstOpenBonus: 12 };
}

function getPersonalityConfig(personality, wallLen, players, seatIndex) {
  if (personality === "adaptive") return getAdaptiveConfig(wallLen, players, seatIndex);
  return PERSONALITIES[personality] || PERSONALITIES.generic;
}

// --- EVAL by difficulty ---

function evalHand(hand, openMelds, players, difficulty) {
  if (difficulty === "easy") return evaluateHandProgressEasy(hand, openMelds);
  const { allDiscards, allOpenMelds } = gatherVisible(players);
  return evaluateHandProgressExpert(hand, openMelds, allDiscards, allOpenMelds);
}

// --- UNIFIED DISPATCH ---

function aiChooseDiscard(hand, openMelds, players, difficulty, personality, wallLen, seatIndex) {
  if (difficulty === "easy") return aiChooseDiscardEasy(hand, openMelds);

  // Medium and Expert both use expert eval
  const { allDiscards, allOpenMelds } = gatherVisible(players);
  const cfg = getPersonalityConfig(personality, wallLen, players, seatIndex);
  let bestDiscard = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < hand.length; i++) {
    const testHand = hand.filter((_, j) => j !== i);
    let score = evaluateHandProgressExpert(testHand, openMelds, allDiscards, allOpenMelds);

    // Defense logic (medium uses half weight, expert uses full personality weight)
    const dw = difficulty === "medium" ? cfg.defenseW * 0.5 : cfg.defenseW;
    if (dw > 0) {
      const disc = hand[i];
      const visible = countVisible(disc, allDiscards, allOpenMelds);
      const inHand = hand.filter((t) => tilesMatch(t, disc)).length;

      if (visible === 0 && inHand === 1) score -= 3 * dw;
      if (visible >= 3) score += 2 * dw;
      const discardedBefore = allDiscards.filter((t) => tilesMatch(t, disc)).length;
      if (discardedBefore >= 1) score += 2 * dw;
    }

    if (score > bestScore) { bestScore = score; bestDiscard = i; }
  }
  return bestDiscard;
}

function aiDecideClaim(player, discardedTile, claimType, seatIndex, discarderIndex, players, difficulty, personality, wallLen) {
  if (claimType === "hu") return true;
  if (difficulty === "easy") return aiDecideClaimEasy(player, discardedTile, claimType, seatIndex, discarderIndex);

  // Medium and Expert both use expert eval + personality thresholds
  const cfg = getPersonalityConfig(personality, wallLen, players, seatIndex);
  const { allDiscards, allOpenMelds } = gatherVisible(players);
  const currentScore = evaluateHandProgressExpert(player.hand, player.openMelds, allDiscards, allOpenMelds);
  const hadOpen = player.openMelds.some((m) => m.claimed);
  const openBonus = hadOpen ? 0 : cfg.firstOpenBonus;

  if (claimType === "gang") {
    const opt = findGangOption(player.hand, discardedTile);
    if (!opt) return false;
    const newHand = player.hand.filter((t) => !opt.fromHand.some((f) => f.id === t.id));
    const newMelds = [...player.openMelds, { ...opt, claimed: true }];
    const newScore = evaluateHandProgressExpert(newHand, newMelds, allDiscards, allOpenMelds);
    return newScore + openBonus >= currentScore + cfg.gangThr;
  }

  if (claimType === "peng") {
    const opt = findPengOption(player.hand, discardedTile);
    if (!opt) return false;
    const newHand = player.hand.filter((t) => !opt.fromHand.some((f) => f.id === t.id));
    const newMelds = [...player.openMelds, { ...opt, claimed: true }];
    const newScore = evaluateHandProgressExpert(newHand, newMelds, allDiscards, allOpenMelds);
    // Medium is slightly less strategic than expert
    const thr = difficulty === "medium" ? Math.max(0, cfg.pengThr - 1) : cfg.pengThr;
    return newScore + openBonus > currentScore + thr;
  }

  if (claimType === "chi") {
    const opts = findChiOptions(player.hand, discardedTile);
    if (opts.length === 0) return false;
    let bestOpt = null;
    let bestGain = -Infinity;

    for (const opt of opts) {
      const newHand = player.hand.filter((t) => !opt.fromHand.some((f) => f.id === t.id));
      const newMelds = [...player.openMelds, { ...opt, claimed: true }];
      const newScore = evaluateHandProgressExpert(newHand, newMelds, allDiscards, allOpenMelds);
      const gain = newScore + openBonus - currentScore;
      if (gain > bestGain) { bestGain = gain; bestOpt = opt; }
    }

    const thr = difficulty === "medium" ? Math.max(1, cfg.chiThr - 2) : cfg.chiThr;
    if (bestGain > thr) return bestOpt;
    return false;
  }

  return false;
}

function assignPersonalities() {
  // Randomly assign from pool for seats 1-3 (AI players)
  const shuffled = [...PERSONALITY_POOL].sort(() => Math.random() - 0.5);
  return [null, shuffled[0], shuffled[1], shuffled[2]]; // idx 0 = human
}

