// ============================================================
// CLAIM DETECTION
// ============================================================

function findChiOptions(hand, discardedTile) {
  if (!isSuit(discardedTile)) return [];
  const options = [];
  const suit = discardedTile.suit;
  const rank = discardedTile.rank;
  const suitTiles = hand.filter((t) => t.suit === suit);

  // discard could be low, mid, or high of sequence
  const sequences = [
    [rank, rank + 1, rank + 2],
    [rank - 1, rank, rank + 1],
    [rank - 2, rank - 1, rank],
  ];

  for (const seq of sequences) {
    if (seq[0] < 1 || seq[2] > 9) continue;
    const needed = seq.filter((r) => r !== rank);
    const found = [];
    const used = new Set();
    let valid = true;
    for (const r of needed) {
      const t = suitTiles.find((t) => t.rank === r && !used.has(t.id));
      if (t) {
        found.push(t);
        used.add(t.id);
      } else {
        valid = false;
        break;
      }
    }
    if (valid) {
      options.push({ type: "chi", tiles: [...found, discardedTile].sort((a, b) => a.rank - b.rank), fromHand: found });
    }
  }
  return options;
}

function findPengOption(hand, discardedTile) {
  const matching = hand.filter((t) => tilesMatch(t, discardedTile));
  if (matching.length >= 2) {
    return { type: "peng", tiles: [matching[0], matching[1], discardedTile], fromHand: [matching[0], matching[1]] };
  }
  return null;
}

function findGangOption(hand, discardedTile) {
  const matching = hand.filter((t) => tilesMatch(t, discardedTile));
  if (matching.length >= 3) {
    return { type: "gang", tiles: [matching[0], matching[1], matching[2], discardedTile], fromHand: [matching[0], matching[1], matching[2]] };
  }
  return null;
}

function findConcealedGangs(hand) {
  const counts = countTiles(hand);
  const gangs = [];
  for (const k in counts) {
    if (counts[k].count === 4) {
      const tiles = hand.filter((t) => tileKey(t) === k);
      gangs.push({ type: "gang", tiles, concealed: true });
    }
  }
  return gangs;
}

// Promoted Gang (加杠): the player has an open peng and a 4th matching
// tile in hand. The peng meld upgrades to a gang and the player draws a
// replacement, same as concealed gang. Returns one candidate per
// promotable peng.
function findPromotedGangs(player) {
  const out = [];
  for (let i = 0; i < player.openMelds.length; i++) {
    const m = player.openMelds[i];
    if (m.type !== "peng") continue;
    const k = tileKey(m.tiles[0]);
    const handTile = player.hand.find((t) => tileKey(t) === k);
    if (handTile) out.push({ meldIdx: i, tile: handTile, pengTiles: m.tiles });
  }
  return out;
}

