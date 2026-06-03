// Lifetime stats — long-term counters persisted across games. Driven by
// the game-over effect in main.jsx that fires when gameOverAcknowledged
// flips true. See spec §7.

const LIFETIME_KEY = "mahjong_lifetime_stats";
const LIFETIME_VERSION = 1;

// §7.2 — defaults. Extremums and lifetimeUpdatedFor start as null so the
// UI can render "—" before any game is played, without a sentinel-value
// special case. mergeLifetime short-circuits null prev values.
const DEFAULT_LIFETIME_STATS = {
  v: LIFETIME_VERSION,
  lifetimeUpdatedFor: null,
  gamesPlayed: 0,
  gamesWon: 0,
  roundsPlayed: 0,
  roundsWon: 0,
  roundsDianpaoGiven: 0,
  smallHu: 0,
  largeHu: 0,
  zimoHu: 0,
  sevenPairsHu: 0,
  biggestSingleGain: null,
  biggestSingleLoss: null,
  bestEndingBalance: null,
  worstEndingBalance: null,
  currentWinStreak: 0,
  longestWinStreak: 0,
  totalScoreNet: 0,
};

function loadLifetime() {
  return loadJson(LIFETIME_KEY, LIFETIME_VERSION, () => ({ ...DEFAULT_LIFETIME_STATS }));
}

function saveLifetime(next) {
  return saveJson(LIFETIME_KEY, next);
}

function resetLifetime() {
  return saveJson(LIFETIME_KEY, { ...DEFAULT_LIFETIME_STATS });
}

// §7.3 — Compute the per-game delta from a finished match state.
// PLAYER_IDX is the human seat (always 0 in current code). Includes
// humanWon for streak update inside mergeLifetime.
function computeLifetimeDelta(state, PLAYER_IDX) {
  const finalScores = state.scores;
  const startingScore = state.totalRounds * STARTING_PER_ROUND;
  const maxScore = Math.max(...finalScores);
  const humanWon = finalScores[PLAYER_IDX] === maxScore;

  let roundsPlayed = 0;
  let roundsWon = 0;
  let roundsDianpaoGiven = 0;
  let smallHu = 0;
  let largeHu = 0;
  let zimoHu = 0;
  let sevenPairsHu = 0;
  let biggestSingleGain = null;
  let biggestSingleLoss = null;

  for (const r of state.roundResults || []) {
    roundsPlayed += 1;
    const humanDelta = (r.deltas && r.deltas[PLAYER_IDX]) || 0;
    if (humanDelta > 0) {
      biggestSingleGain = biggestSingleGain === null ? humanDelta : Math.max(biggestSingleGain, humanDelta);
    } else if (humanDelta < 0) {
      biggestSingleLoss = biggestSingleLoss === null ? humanDelta : Math.min(biggestSingleLoss, humanDelta);
    }
    if (r.isDraw) continue;
    if (r.winner === PLAYER_IDX) {
      roundsWon += 1;
      if (r.largeHu) largeHu += 1;
      else smallHu += 1;
      if (r.type === "zimo") zimoHu += 1;
      if (r.sevenPairs) sevenPairsHu += 1;
    } else if (r.discarder === PLAYER_IDX) {
      roundsDianpaoGiven += 1;
    }
  }

  return {
    gamesPlayed: 1,
    gamesWon: humanWon ? 1 : 0,
    roundsPlayed,
    roundsWon,
    roundsDianpaoGiven,
    smallHu,
    largeHu,
    zimoHu,
    sevenPairsHu,
    biggestSingleGain,
    biggestSingleLoss,
    bestEndingBalance: finalScores[PLAYER_IDX],
    worstEndingBalance: finalScores[PLAYER_IDX],
    totalScoreNet: finalScores[PLAYER_IDX] - startingScore,
    humanWon,
  };
}

// §7.2 — merge prev cumulative stats with a single-game delta. Caller
// sets lifetimeUpdatedFor on the returned object before calling
// saveLifetime so the idempotency check in §7.5 works on next entry.
function mergeLifetime(prev, delta) {
  const nextCurrentStreak = delta.humanWon ? prev.currentWinStreak + 1 : 0;
  return {
    v: LIFETIME_VERSION,
    lifetimeUpdatedFor: prev.lifetimeUpdatedFor,
    gamesPlayed: prev.gamesPlayed + delta.gamesPlayed,
    gamesWon: prev.gamesWon + delta.gamesWon,
    roundsPlayed: prev.roundsPlayed + delta.roundsPlayed,
    roundsWon: prev.roundsWon + delta.roundsWon,
    roundsDianpaoGiven: prev.roundsDianpaoGiven + delta.roundsDianpaoGiven,
    smallHu: prev.smallHu + delta.smallHu,
    largeHu: prev.largeHu + delta.largeHu,
    zimoHu: prev.zimoHu + delta.zimoHu,
    sevenPairsHu: prev.sevenPairsHu + delta.sevenPairsHu,
    biggestSingleGain:
      prev.biggestSingleGain === null ? delta.biggestSingleGain
      : delta.biggestSingleGain === null ? prev.biggestSingleGain
      : Math.max(prev.biggestSingleGain, delta.biggestSingleGain),
    biggestSingleLoss:
      prev.biggestSingleLoss === null ? delta.biggestSingleLoss
      : delta.biggestSingleLoss === null ? prev.biggestSingleLoss
      : Math.min(prev.biggestSingleLoss, delta.biggestSingleLoss),
    bestEndingBalance:
      prev.bestEndingBalance === null ? delta.bestEndingBalance
      : Math.max(prev.bestEndingBalance, delta.bestEndingBalance),
    worstEndingBalance:
      prev.worstEndingBalance === null ? delta.worstEndingBalance
      : Math.min(prev.worstEndingBalance, delta.worstEndingBalance),
    totalScoreNet: prev.totalScoreNet + delta.totalScoreNet,
    currentWinStreak: nextCurrentStreak,
    longestWinStreak: Math.max(prev.longestWinStreak, nextCurrentStreak),
  };
}
