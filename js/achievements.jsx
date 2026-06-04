// Achievements — unlockable badges keyed on game-over context. The
// game-over effect in main.jsx runs checkAchievements after the lifetime
// merge so predicates see post-merge counters (spec §8.7). See spec §8.

const ACHIEVEMENTS_KEY = "mahjong_achievements";
const ACHIEVEMENTS_VERSION = 1;
const PLAYER_IDX = 0;

const DEFAULT_ACHIEVEMENTS = {
  v: ACHIEVEMENTS_VERSION,
  unlocked: {},
};

function loadAchievements() {
  return loadJson(ACHIEVEMENTS_KEY, ACHIEVEMENTS_VERSION, () => ({ ...DEFAULT_ACHIEVEMENTS, unlocked: {} }));
}

function saveAchievements(next) {
  return saveJson(ACHIEVEMENTS_KEY, next);
}

function resetAchievements() {
  return saveJson(ACHIEVEMENTS_KEY, { ...DEFAULT_ACHIEVEMENTS, unlocked: {} });
}

// §8.4 — Achievement definitions. Each entry has:
//   id          — stable storage key
//   icon        — emoji shown in the badge grid and toast
//   nameKey     — lang string key for the title
//   descKey     — lang string key for the description
//   mode        — "any" | "normal" | "daily" (spec §8.4 framework filter)
//   predicate   — ({state, lifetime, roundResults}) => boolean
//
// Daily-only achievements (daily_win_1, daily_win_streak_7) are deferred
// to Phase 5 when daily games and the mahjong_daily payload exist.
const ACHIEVEMENTS = [
  {
    id: "first_hu",
    icon: "🀄",
    nameKey: "achFirstHuName",
    descKey: "achFirstHuDesc",
    mode: "any",
    predicate: ({ roundResults }) =>
      roundResults.some((r) => !r.isDraw && r.winner === PLAYER_IDX),
  },
  {
    id: "first_large_hu",
    icon: "💰",
    nameKey: "achFirstLargeHuName",
    descKey: "achFirstLargeHuDesc",
    mode: "any",
    predicate: ({ roundResults }) =>
      roundResults.some((r) => !r.isDraw && r.winner === PLAYER_IDX && r.largeHu),
  },
  {
    id: "first_seven_pairs",
    icon: "7️⃣",
    nameKey: "achFirstSevenPairsName",
    descKey: "achFirstSevenPairsDesc",
    mode: "any",
    predicate: ({ roundResults }) =>
      roundResults.some((r) => !r.isDraw && r.winner === PLAYER_IDX && r.sevenPairs),
  },
  {
    id: "first_zimo",
    icon: "✨",
    nameKey: "achFirstZimoName",
    descKey: "achFirstZimoDesc",
    mode: "any",
    predicate: ({ roundResults }) =>
      roundResults.some((r) => !r.isDraw && r.winner === PLAYER_IDX && r.type === "zimo"),
  },
  {
    id: "wins_10",
    icon: "🔟",
    nameKey: "achWins10Name",
    descKey: "achWins10Desc",
    mode: "any",
    predicate: ({ lifetime }) => lifetime.gamesWon >= 10,
  },
  {
    id: "wins_50",
    icon: "🎯",
    nameKey: "achWins50Name",
    descKey: "achWins50Desc",
    mode: "any",
    predicate: ({ lifetime }) => lifetime.gamesWon >= 50,
  },
  {
    id: "no_claim_win",
    icon: "🤐",
    nameKey: "achNoClaimWinName",
    descKey: "achNoClaimWinDesc",
    mode: "any",
    // House Rule 3 requires at least one claimed open meld for a standard
    // Hu, so the only way to win a round without claiming discards is
    // Seven Pairs. Both this and first_seven_pairs unlock together on
    // first 7P win — intentional double-badge.
    predicate: ({ roundResults }) =>
      roundResults.some((r) => !r.isDraw && r.winner === PLAYER_IDX && r.sevenPairs),
  },
  {
    id: "bankrupt_table",
    icon: "💸",
    nameKey: "achBankruptTableName",
    descKey: "achBankruptTableDesc",
    mode: "any",
    // Per §8.5: human's final score is not constrained.
    predicate: ({ state }) =>
      state.scores[1] < 0 && state.scores[2] < 0 && state.scores[3] < 0,
  },
  {
    id: "last_tile",
    icon: "🎴",
    nameKey: "achLastTileName",
    descKey: "achLastTileDesc",
    mode: "any",
    // wallRemaining captures state.wall.length at the moment the round
    // result was recorded — 0 means Hu landed when the wall was empty.
    predicate: ({ roundResults }) =>
      roundResults.some((r) => !r.isDraw && r.winner === PLAYER_IDX && r.wallRemaining === 0),
  },
  {
    id: "comeback_kid",
    icon: "📈",
    nameKey: "achComebackKidName",
    descKey: "achComebackKidDesc",
    mode: "any",
    predicate: ({ state, roundResults }) => {
      const finalScores = state.scores;
      const humanWon = finalScores[PLAYER_IDX] === Math.max(...finalScores);
      if (!humanWon) return false;
      const lowRounds = roundResults.filter((r) => {
        const min = Math.min(...r.scoresAfter);
        return r.scoresAfter[PLAYER_IDX] === min;
      }).length;
      return lowRounds >= Math.ceil(state.totalRounds / 2);
    },
  },
  {
    id: "streak_5",
    icon: "🔥",
    nameKey: "achStreak5Name",
    descKey: "achStreak5Desc",
    mode: "any",
    predicate: ({ lifetime }) => lifetime.currentWinStreak >= 5,
  },
  {
    id: "purist",
    icon: "🧘",
    nameKey: "achPuristName",
    descKey: "achPuristDesc",
    mode: "normal",
    // §8.6 — the mode: "normal" filter excludes daily games; the
    // predicate stays minimal. Don't add state.dailyGame !== true.
    predicate: ({ state }) => {
      const humanWon = state.scores[PLAYER_IDX] === Math.max(...state.scores);
      return humanWon && state.hintUsedThisGame === false;
    },
  },
  // Daily-only achievements — mode: "daily" framework filter ensures
  // these only run when state.dailyGame === true.
  {
    id: "daily_win_1",
    icon: "📅",
    nameKey: "achDailyWin1Name",
    descKey: "achDailyWin1Desc",
    mode: "daily",
    predicate: ({ state }) =>
      state.scores[PLAYER_IDX] === Math.max(...state.scores),
  },
  {
    id: "daily_win_streak_7",
    icon: "📆",
    nameKey: "achDailyWinStreak7Name",
    descKey: "achDailyWinStreak7Desc",
    mode: "daily",
    // The daily/main flow records the current result via recordDailyResult
    // BEFORE checkAchievements runs, so dailyWinStreakAsOf already
    // includes today's win.
    predicate: ({ state, dailyResults }) =>
      state.scores[PLAYER_IDX] === Math.max(...state.scores) &&
      dailyResults &&
      dailyWinStreakAsOf(dailyResults, state.dailyDate) >= 7,
  },
];

// §8.4 mode framework: filter predicates by game mode before running
// them. Returns newly unlocked achievements (ones whose predicate is
// satisfied AND aren't already unlocked).
function checkAchievements(ctx) {
  const { achievements, state } = ctx;
  const isDaily = !!state.dailyGame;
  const newlyUnlocked = [];
  for (const ach of ACHIEVEMENTS) {
    if (achievements.unlocked[ach.id]) continue;
    if (ach.mode === "normal" && isDaily) continue;
    if (ach.mode === "daily" && !isDaily) continue;
    if (ach.predicate(ctx)) newlyUnlocked.push(ach);
  }
  return newlyUnlocked;
}
