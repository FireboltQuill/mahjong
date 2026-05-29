// ============================================================
// GAME STATE
// ============================================================

const SEAT_WINDS = ["east", "south", "west", "north"];
const SEAT_LABELS = ["East (You)", "South (AI)", "West (AI)", "North (AI)"];

function createInitialState(windRounds = 1, lang = "en") {
  const personalities = assignPersonalities();
  const totalRounds = windRounds * 4;
  const startingScore = totalRounds * STARTING_PER_ROUND;
  // Pick a random name group, then four distinct names from it (one for the
  // human at seat 0, three for the AIs at seats 1–3). Names stay fixed for
  // the whole match so a player keeps their name as the dealer rotates.
  const { groupName, names } = pickPlayerNames(loadNameGroups(), 4);
  return initRound({
    dealer: 0,
    roundWind: "east",
    roundNumber: 1,
    totalRounds,
    windRounds,
    scores: [startingScore, startingScore, startingScore, startingScore],
    roundResults: [],
    personalities,
    playerNames: names,
    nameGroup: groupName,
    // Match-scope hint usage flag (spec §5.3). Lives here, not in
    // initRound, because nextRound spreads prev → gameInfo and we want
    // this flag to carry through round transitions.
    hintUsedThisGame: false,
  }, lang);
}

function initRound(gameInfo, lang = "en") {
  const ll = LANG[lang];
  const deck = shuffle(createDeck());
  const players = [];
  for (let i = 0; i < 4; i++) {
    players.push({
      hand: sortHand(deck.splice(0, 13)),
      openMelds: [],
      discards: [],
      seatWind: SEAT_WINDS[(i - gameInfo.dealer + 4) % 4],
    });
  }
  players[gameInfo.dealer].hand.push(deck.splice(0, 1)[0]);
  players[gameInfo.dealer].hand = sortHand(players[gameInfo.dealer].hand);

  return {
    ...gameInfo,
    players,
    wall: deck,
    currentTurn: gameInfo.dealer,
    phase: "discard",
    lastDiscard: null,
    lastDiscarder: null,
    claims: [],
    winner: null,
    winInfo: null,
    scoreBreakdown: null,
    isDraw: false,
    log: [ll.logRoundBegin(gameInfo.roundNumber, ll.seats[gameInfo.dealer])],
    pendingClaims: null,
    selectedTile: null,
    awaitingPlayerClaim: null,
    playerDeclinedClaims: [],
    turnDrawn: true,
    lastDrawn: null,
  };
}

