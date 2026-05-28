// ============================================================
// HAND VALIDATION
// ============================================================

function countTiles(tiles) {
  const counts = {};
  for (const t of tiles) {
    const k = tileKey(t);
    if (!counts[k]) counts[k] = { key: k, tile: t, count: 0 };
    counts[k].count++;
  }
  return counts;
}

// Try all decompositions of concealed tiles into melds + 1 pair
function decompose(tiles) {
  const results = [];
  tryDecompose(tiles, [], null, results);
  return results;
}

function tryDecompose(remaining, melds, pair, results) {
  if (remaining.length === 0) {
    if (pair && melds.length > 0) {
      results.push({ melds: [...melds], pair: [...pair] });
    } else if (pair && melds.length === 0) {
      results.push({ melds: [], pair: [...pair] });
    }
    return;
  }

  const sorted = sortHand(remaining);
  const first = sorted[0];
  const firstKey = tileKey(first);

  // Try pair (only if no pair yet)
  if (!pair) {
    const pairTiles = sorted.filter((t) => tileKey(t) === firstKey);
    if (pairTiles.length >= 2) {
      const rest = [...sorted];
      const idx1 = rest.findIndex((t) => t.id === pairTiles[0].id);
      rest.splice(idx1, 1);
      const idx2 = rest.findIndex((t) => t.id === pairTiles[1].id);
      rest.splice(idx2, 1);
      tryDecompose(rest, melds, [pairTiles[0], pairTiles[1]], results);
    }
  }

  // Try peng (triplet)
  const matchingTiles = sorted.filter((t) => tileKey(t) === firstKey);
  if (matchingTiles.length >= 3) {
    const rest = [...sorted];
    for (let i = 0; i < 3; i++) {
      const idx = rest.findIndex((t) => t.id === matchingTiles[i].id);
      rest.splice(idx, 1);
    }
    tryDecompose(rest, [...melds, { type: "peng", tiles: matchingTiles.slice(0, 3) }], pair, results);
  }

  // Try chi (sequence) - only for suit tiles
  if (isSuit(first) && first.rank <= 7) {
    const suit = first.suit;
    const r = first.rank;
    const t1 = sorted.find((t) => t.suit === suit && t.rank === r);
    const t2 = sorted.find((t) => t.suit === suit && t.rank === r + 1 && t.id !== t1?.id);
    const t3 = sorted.find((t) => t.suit === suit && t.rank === r + 2 && t.id !== t1?.id && t.id !== t2?.id);
    if (t1 && t2 && t3) {
      const rest = [...sorted];
      for (const t of [t1, t2, t3]) {
        const idx = rest.findIndex((x) => x.id === t.id);
        rest.splice(idx, 1);
      }
      tryDecompose(rest, [...melds, { type: "chi", tiles: [t1, t2, t3] }], pair, results);
    }
  }
}

// Check if tiles form 7 distinct pairs (七对子)
function isSevenPairs(tiles) {
  if (tiles.length !== 14) return false;
  const counts = countTiles(tiles);
  const entries = Object.values(counts);
  // Must be exactly 7 distinct tile types, each with count 2
  if (entries.length !== 7) return false;
  return entries.every((e) => e.count === 2);
}

function validateHu(player) {
  // === Seven Pairs path (七对子) ===
  // Must be fully concealed (no open melds), 14 tiles, 7 pairs
  if (player.openMelds.length === 0 && isSevenPairs(player.hand)) {
    // Rule 1: all three suits represented
    const suitsPresent = new Set();
    for (const t of player.hand) {
      if (isSuit(t)) suitsPresent.add(t.suit);
    }
    if (!SUITS.every((s) => suitsPresent.has(s))) return false;

    // Rule 2: at least one pair has terminal or honor
    const hasTerminalOrHonor = player.hand.some((t) => isTerminalOrHonor(t));
    if (!hasTerminalOrHonor) return false;

    return true; // Open meld requirement waived for 7 pairs
  }

  // === Standard path (4 melds + 1 pair) ===
  // Rule 3: at least one open meld from a claim
  const hasOpenClaim = player.openMelds.some((m) => m.claimed);
  if (!hasOpenClaim) return false;

  // Figure out how many concealed melds we need
  const openMeldCount = player.openMelds.length;
  const concealedNeeded = 4 - openMeldCount;
  const concealedTiles = [...player.hand];

  // We need exactly (concealedNeeded * 3 + 2) concealed tiles for melds + pair
  // But with gangs, open melds use 4 tiles, so just check decomposition
  if (concealedTiles.length !== concealedNeeded * 3 + 2) return false;

  const decompositions = decompose(concealedTiles);

  for (const d of decompositions) {
    if (d.melds.length !== concealedNeeded) continue;

    const allMelds = [...player.openMelds.map((m) => m), ...d.melds];
    const pair = d.pair;

    // Rule 1: all three suits represented (melds + pair)
    const suitsPresent = new Set();
    for (const m of allMelds) {
      for (const t of m.tiles) {
        if (isSuit(t)) suitsPresent.add(t.suit);
      }
    }
    for (const t of pair) {
      if (isSuit(t)) suitsPresent.add(t.suit);
    }
    if (!SUITS.every((s) => suitsPresent.has(s))) continue;

    // Rule 2: at least one meld has terminal or honor
    const hasTerminalOrHonor = allMelds.some((m) => m.tiles.some((t) => isTerminalOrHonor(t)));
    if (!hasTerminalOrHonor) continue;

    return true;
  }
  return false;
}

// Check if adding a tile would complete a valid hand
function checkWinWithTile(player, tile) {
  const testPlayer = {
    ...player,
    hand: [...player.hand, tile],
  };
  return validateHu(testPlayer);
}

