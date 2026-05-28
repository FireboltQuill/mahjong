// ============================================================
// SCORING
// ============================================================

const BASE_SMALL_HU = 10;
const BASE_LARGE_HU = 20;
const STARTING_PER_ROUND = 25;

const ALL_TILE_KINDS = (() => {
  const kinds = [];
  for (const suit of SUITS) for (const rank of RANKS) kinds.push({ suit, rank, honor: null });
  for (const w of WINDS) kinds.push({ suit: "wind", rank: null, honor: w });
  for (const d of DRAGONS) kinds.push({ suit: "dragon", rank: null, honor: d });
  return kinds;
})();

// Count distinct tile kinds that would complete the player's 13-tile state into a valid Hu.
function countWinningTileKinds(hand, openMelds) {
  let count = 0;
  for (const kind of ALL_TILE_KINDS) {
    if (checkWinWithTile({ hand, openMelds }, { ...kind, id: "test" })) count++;
  }
  return count;
}

// Build the win-info record describing how the round ended.
// winType: "zimo" (self-draw) | "dianpao" (claimed off a discard)
// discarder: seat index of the player whose discard was claimed (dianpao only)
function buildWinInfo(winner, winningTile, winType, discarder) {
  const handMinus = winner.hand.filter((t) => t.id !== winningTile.id);
  return {
    type: winType,
    winningTile,
    discarder: winType === "dianpao" ? discarder : null,
    sevenPairs: winner.openMelds.length === 0 && isSevenPairs(winner.hand),
    largeHu: countWinningTileKinds(handMinus, winner.openMelds) === 1,
  };
}

// Per-player point deltas. Each non-winner's loss starts at the base (10 small,
// 20 large) and is multiplied by 2 for each applicable modifier:
//   - they have no claimed open meld
//   - they discarded the winning tile (dianpao only)
//   - the win was a zimo (applies to every non-winner)
//   - the win was seven pairs (applies to every non-winner)
// The winner gains the sum of all losses.
function computeScoreDeltas(winInfo, winnerIdx, players) {
  const base = winInfo.largeHu ? BASE_LARGE_HU : BASE_SMALL_HU;
  const deltas = [0, 0, 0, 0];
  const mults = [0, 0, 0, 0];
  let winnerGain = 0;
  for (let i = 0; i < 4; i++) {
    if (i === winnerIdx) continue;
    let mult = 1;
    const hasOpenMeld = players[i].openMelds.some((m) => m.claimed);
    if (!hasOpenMeld) mult *= 2;
    if (winInfo.type === "dianpao" && winInfo.discarder === i) mult *= 2;
    if (winInfo.type === "zimo") mult *= 2;
    if (winInfo.sevenPairs) mult *= 2;
    const loss = base * mult;
    deltas[i] = -loss;
    mults[i] = mult;
    winnerGain += loss;
  }
  deltas[winnerIdx] = winnerGain;
  return { deltas, mults, base };
}

// Records a win on the state: updates scores, stores winInfo and breakdown.
function applyWin(st, winnerIdx, winningTile, winType, discarder) {
  const winner = st.players[winnerIdx];
  const winInfo = buildWinInfo(winner, winningTile, winType, discarder);
  const breakdown = computeScoreDeltas(winInfo, winnerIdx, st.players);
  const newScores = st.scores.map((s, i) => s + breakdown.deltas[i]);
  return {
    ...st,
    winner: winnerIdx,
    winInfo,
    scoreBreakdown: breakdown,
    scores: newScores,
  };
}

