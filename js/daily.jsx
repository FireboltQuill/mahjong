// Daily challenge storage + streak math (spec §9.10).

const DAILY_KEY = "mahjong_daily";
const DAILY_VERSION = 1;
// Bump when scoring/tie rules change such that old rank/won values are
// no longer comparable. Streak walking discards entries with mismatched
// rulesVersion per spec §9.10.1.
const DAILY_RULES_VERSION = 1;

const DEFAULT_DAILY = {
  v: DAILY_VERSION,
  rulesVersion: DAILY_RULES_VERSION,
  results: {},
};

function loadDaily() {
  return loadJson(DAILY_KEY, DAILY_VERSION, () => ({ ...DEFAULT_DAILY, results: {} }));
}

function saveDaily(next) {
  return saveJson(DAILY_KEY, next);
}

function resetDaily() {
  return saveJson(DAILY_KEY, { ...DEFAULT_DAILY, results: {} });
}

// Compute (and persist) today's daily result on game-over. Caller passes
// the final state. recorded === true on first qualifying play; subsequent
// non-recording replay/play-again calls do not invoke this. matchSeed is
// captured for reproducibility / sharing in future revisions.
function recordDailyResult(state, dailyDate) {
  if (!dailyDate) return null;
  const cur = loadDaily();
  if (cur.results[dailyDate] && cur.results[dailyDate].recorded) {
    // First recorded result wins (spec §9.10 — non-recording replay
    // does not overwrite). Caller can detect by reloading.
    return cur;
  }
  const finalScores = state.scores;
  const maxScore = Math.max(...finalScores);
  const won = finalScores[0] === maxScore;
  // Rank = 1 + (number of seats with strictly higher score). Shared
  // first → rank 1 (matches the §7.3 "shared first counts as a win"
  // convention used by lifetime stats).
  const rank = 1 + finalScores.filter((s) => s > finalScores[0]).length;
  const next = {
    ...cur,
    v: DAILY_VERSION,
    rulesVersion: DAILY_RULES_VERSION,
    results: {
      ...cur.results,
      [dailyDate]: {
        played: true,
        recorded: true,
        rulesVersion: DAILY_RULES_VERSION,
        completedAt: new Date().toISOString(),
        won,
        finalScore: finalScores[0],
        rank,
        matchSeed: state.matchSeed,
      },
    },
  };
  saveDaily(next);
  return next;
}

// Daily win streak walking (spec §9.10.1). Counts consecutive UTC days
// ending at `today` where the human won AND rulesVersion matches the
// current rules. Missing day or loss or rulesVersion mismatch breaks
// the streak.
function dailyWinStreakAsOf(daily, today) {
  if (!daily || !daily.results) return 0;
  let streak = 0;
  let cursor = today;
  while (true) {
    const entry = daily.results[cursor];
    if (!entry || !entry.played) break;
    if (entry.rulesVersion !== undefined && entry.rulesVersion !== DAILY_RULES_VERSION) break;
    if (!entry.won) break;
    streak += 1;
    cursor = utcDateMinusOneDay(cursor);
  }
  return streak;
}
