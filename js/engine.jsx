// ============================================================
// ENGINE (Phase 9a — spec §13)
// ============================================================
// Pure state transitions. Each step function takes a game state
// in and returns a next state out. No side effects: no DOM, no
// audio, no logs, no timers, no reaction/animation pushes.
//
// Live wrappers (main.jsx) remain responsible for SFX, animations,
// human-readable log entries, AI-reaction enqueues, and the
// actionLog + persistRev append. Per §13.5, the wrapper's single
// setState updater merges (step result + actionLog append +
// human log append + persistRev increment) atomically.
//
// `expected*` fields on step opts are validation-only: the replay
// engine (Phase 9b) passes them to check the log against the seeded
// engine. Live wrappers must not pass them — the engine derives
// truth from the wall + current state.

class ReplayMismatchError extends Error {
  constructor({ at, expected, got, ...rest }) {
    super(`[engine] ${at}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
    this.name = "ReplayMismatchError";
    this.at = at;
    this.expected = expected;
    this.got = got;
    Object.assign(this, rest);
  }
}

// Small helpers — kept module-local so nothing leaks into the
// global namespace beyond the step functions + error class.
function findTileInHand(hand, id, at) {
  const t = hand.find((x) => x.id === id);
  if (!t) throw new ReplayMismatchError({ at, expected: `tile ${id} in hand`, got: hand.map((x) => x.id) });
  return t;
}

function findTileInDiscards(discards, id, at) {
  const t = discards.find((x) => x.id === id);
  if (!t) throw new ReplayMismatchError({ at, expected: `tile ${id} in discards`, got: discards.map((x) => x.id) });
  return t;
}

// §13.3 stepDraw — pop wall[0] into seat's hand.
// If the wall is empty, returns a terminal draw state (isDraw: true).
// The wrapper decides whether to emit the exhaust-log entry.
function stepDraw(state, seat, opts = {}) {
  const { expectedTileId } = opts;
  if (state.wall.length === 0) {
    return { ...state, isDraw: true };
  }
  const tile = state.wall[0];
  if (expectedTileId !== undefined && tile.id !== expectedTileId) {
    throw new ReplayMismatchError({ at: "stepDraw", expected: expectedTileId, got: tile.id });
  }
  const player = state.players[seat];
  const newHand = sortHand([...player.hand, tile]);
  const newPlayers = state.players.map((pl, i) => (i === seat ? { ...pl, hand: newHand } : pl));
  return {
    ...state,
    players: newPlayers,
    wall: state.wall.slice(1),
    phase: "discard",
    turnDrawn: true,
    lastDrawn: tile,
  };
}

// §13.3 stepDiscard — remove tile from seat's hand, append to
// discards, transition to claim phase, clear declined tracking.
function stepDiscard(state, seat, tileId) {
  const player = state.players[seat];
  const discarded = findTileInHand(player.hand, tileId, "stepDiscard");
  const newHand = player.hand.filter((t) => t.id !== tileId);
  const newPlayers = state.players.map((pl, i) =>
    i === seat ? { ...pl, hand: newHand, discards: [...pl.discards, discarded] } : pl
  );
  return {
    ...state,
    players: newPlayers,
    lastDiscard: discarded,
    lastDiscarder: seat,
    phase: "claim",
    turnDrawn: false,
    playerDeclinedClaims: [],
  };
}

// §13.3 stepClaim — chi or peng only. Gang from discard is
// stepDeclareGang (§A.6). The claimer takes the discard into a new
// open meld; claimer becomes currentTurn in discard phase with
// turnDrawn: true.
//
// `handTileIds` disambiguates chi (1-2-3 vs. 2-3-4 both legal on a
// 2-tile claim); `resultingMeldTileIds` fixes final meld order.
function stepClaim(state, claim) {
  const { seat, claimType, discarder, claimedTileId, handTileIds, resultingMeldTileIds } = claim;
  if (claimType !== "chi" && claimType !== "peng") {
    throw new Error(`stepClaim only handles chi/peng — got ${claimType}. Use stepDeclareGang for gang.`);
  }
  const claimer = state.players[seat];
  const discarderState = state.players[discarder];
  const claimedTile = findTileInDiscards(discarderState.discards, claimedTileId, "stepClaim");
  const handTiles = handTileIds.map((id) => findTileInHand(claimer.hand, id, "stepClaim"));
  // Rebuild meld in the requested final order.
  const byId = new Map();
  for (const t of handTiles) byId.set(t.id, t);
  byId.set(claimedTile.id, claimedTile);
  const meldTiles = resultingMeldTileIds.map((id) => {
    const t = byId.get(id);
    if (!t) throw new ReplayMismatchError({ at: "stepClaim.meldOrder", expected: id, got: [...byId.keys()] });
    return t;
  });
  const newHand = claimer.hand.filter((t) => !handTileIds.includes(t.id));
  const meld = { type: claimType, tiles: meldTiles, claimed: true };
  const newPlayers = state.players.map((pl, i) => {
    if (i === seat) return { ...pl, hand: sortHand(newHand), openMelds: [...pl.openMelds, meld] };
    if (i === discarder) return { ...pl, discards: pl.discards.filter((t) => t.id !== claimedTileId) };
    return pl;
  });
  return {
    ...state,
    players: newPlayers,
    currentTurn: seat,
    phase: "discard",
    turnDrawn: true,
    lastDiscard: null,
    lastDiscarder: null,
    awaitingPlayerClaim: null,
    playerDeclinedClaims: [],
  };
}

// §13.3 stepDeclareHu — zimo (discarder null) or dianpao.
// For zimo the winning tile is already in hand (typically lastDrawn).
// For dianpao we first move the claimed discard into the winner's
// hand so applyWin's handMinus calculation lines up.
function stepDeclareHu(state, seat, opts) {
  const { winningTileId, discarder = null, expectedWinType, expectedLargeHu, expectedSevenPairs } = opts;
  const player = state.players[seat];
  let workingState;
  let winTile;

  if (discarder === null) {
    // Zimo — winning tile is in seat's hand.
    winTile = winningTileId !== undefined
      ? findTileInHand(player.hand, winningTileId, "stepDeclareHu.zimo")
      : (state.lastDrawn || player.hand[player.hand.length - 1]);
    workingState = applyWin(state, seat, winTile, "zimo", null);
  } else {
    // Dianpao — move discard into winner's hand, remove from discarder.
    const discarderState = state.players[discarder];
    winTile = findTileInDiscards(discarderState.discards, winningTileId, "stepDeclareHu.dianpao");
    const newPlayers = state.players.map((pl, i) => {
      if (i === seat) return { ...pl, hand: sortHand([...pl.hand, winTile]) };
      if (i === discarder) return { ...pl, discards: pl.discards.filter((t) => t.id !== winningTileId) };
      return pl;
    });
    const afterClaim = { ...state, players: newPlayers, awaitingPlayerClaim: null };
    workingState = applyWin(afterClaim, seat, winTile, "dianpao", discarder);
  }

  const wi = workingState.winInfo;
  if (expectedWinType !== undefined && wi.type !== expectedWinType) {
    throw new ReplayMismatchError({ at: "stepDeclareHu.winType", expected: expectedWinType, got: wi.type });
  }
  if (expectedLargeHu !== undefined && wi.largeHu !== expectedLargeHu) {
    throw new ReplayMismatchError({ at: "stepDeclareHu.largeHu", expected: expectedLargeHu, got: wi.largeHu });
  }
  if (expectedSevenPairs !== undefined && wi.sevenPairs !== expectedSevenPairs) {
    throw new ReplayMismatchError({ at: "stepDeclareHu.sevenPairs", expected: expectedSevenPairs, got: wi.sevenPairs });
  }
  return workingState;
}

// §13.3 stepDeclareGang — concealed or from-discard. Both pop one
// replacement tile from the wall. Returns terminal draw state if
// the wall can't fund the replacement.
//
// concealed: all four tileIds come from seat's hand.
// discard: three handTileIds from seat's hand, plus claimedTileId
//   from discarder's discards. Claimer becomes currentTurn in
//   discard phase.
function stepDeclareGang(state, seat, opts) {
  const { source, tileIds, handTileIds, claimedTileId, discarder, expectedReplacementTileId } = opts;
  if (source !== "concealed" && source !== "discard") {
    throw new Error(`stepDeclareGang: invalid source ${source}`);
  }
  if (state.wall.length === 0) {
    return { ...state, isDraw: true };
  }
  const replacement = state.wall[0];
  if (expectedReplacementTileId !== undefined && replacement.id !== expectedReplacementTileId) {
    throw new ReplayMismatchError({ at: "stepDeclareGang.replacement", expected: expectedReplacementTileId, got: replacement.id });
  }
  const player = state.players[seat];
  let newPlayers;
  let meld;

  if (source === "concealed") {
    const meldTiles = tileIds.map((id) => findTileInHand(player.hand, id, "stepDeclareGang.concealed"));
    const newHand = player.hand.filter((t) => !tileIds.includes(t.id));
    const afterHand = sortHand([...newHand, replacement]);
    meld = { type: "gang", tiles: meldTiles, claimed: false, concealed: true };
    newPlayers = state.players.map((pl, i) =>
      i === seat ? { ...pl, hand: afterHand, openMelds: [...pl.openMelds, meld] } : pl
    );
  } else {
    // source === "discard"
    const handTiles = handTileIds.map((id) => findTileInHand(player.hand, id, "stepDeclareGang.discard.hand"));
    const discardTile = findTileInDiscards(state.players[discarder].discards, claimedTileId, "stepDeclareGang.discard.pool");
    const newHand = player.hand.filter((t) => !handTileIds.includes(t.id));
    const afterHand = sortHand([...newHand, replacement]);
    meld = { type: "gang", tiles: [...handTiles, discardTile], claimed: true };
    newPlayers = state.players.map((pl, i) => {
      if (i === seat) return { ...pl, hand: afterHand, openMelds: [...pl.openMelds, meld] };
      if (i === discarder) return { ...pl, discards: pl.discards.filter((t) => t.id !== claimedTileId) };
      return pl;
    });
  }

  const base = {
    ...state,
    players: newPlayers,
    wall: state.wall.slice(1),
    lastDrawn: replacement,
  };
  if (source === "discard") {
    base.currentTurn = seat;
    base.phase = "discard";
    base.turnDrawn = true;
    base.lastDiscard = null;
    base.lastDiscarder = null;
    base.awaitingPlayerClaim = null;
    base.playerDeclinedClaims = [];
  }
  return base;
}

// §13.3 stepResolvePass — everyone declined the discard. Turn
// advances to the next seat clockwise from the discarder, entering
// draw phase.
function stepResolvePass(state) {
  return {
    ...state,
    currentTurn: (state.lastDiscarder + 1) % 4,
    phase: "draw",
    lastDiscard: null,
    lastDiscarder: null,
    turnDrawn: false,
    playerDeclinedClaims: [],
  };
}
