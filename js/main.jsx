const { useState, useEffect, useCallback, useRef, useMemo } = React;

// ============================================================
// MAIN COMPONENT
// ============================================================

const PLAYER_IDX = 0;

function MahjongGame() {
  const [state, setState] = useState(() => createInitialState(1, "en"));
  const [windRoundsSetting, setWindRoundsSetting] = useState(1);
  const [showMenu, setShowMenu] = useState(true);
  const [selectedTileIdx, setSelectedTileIdx] = useState(null);
  const [claimOptions, setClaimOptions] = useState(null);
  const [lang, setLang] = useState("en");
  const [difficulty, setDifficulty] = useState("easy");
  const [showHelp, setShowHelp] = useState(false);
  const [showStats, setShowStats] = useState(false);
  // Lifetime stats loaded once at mount and refreshed when the modal
  // opens or after a game-over merge (spec §7).
  const [stats, setStats] = useState(() => loadLifetime());
  // Phase 4 achievements (§8). achievements is the loaded payload;
  // toastQueue holds entries pending display (one at a time, ~2.5s each).
  const [achievements, setAchievements] = useState(() => loadAchievements());
  const [toastQueue, setToastQueue] = useState([]);
  // Stats modal: "stats" or "achievements" tab. Reset to "stats" on open.
  const [statsTab, setStatsTab] = useState("stats");
  // Daily challenge modal (spec §9.9).
  const [showDaily, setShowDaily] = useState(false);
  const [dailyData, setDailyData] = useState(() => loadDaily());
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminInput, setAdminInput] = useState(null);
  const [adminTab, setAdminTab] = useState("state"); // "state" | "names"
  const [showNames, setShowNames] = useState(false);
  const [nameGroups, setNameGroups] = useState(() => loadNameGroups());
  const [newNameInputs, setNewNameInputs] = useState({}); // per-group input buffer
  const [newGroupInput, setNewGroupInput] = useState("");
  const [roundOverTab, setRoundOverTab] = useState("winner"); // "winner" | "scoring" | "stats"
  const [gameOverTab, setGameOverTab] = useState("standings"); // "standings" | "stats"
  const [gameOverAcknowledged, setGameOverAcknowledged] = useState(false);
  // Training mode (spec §5). The menu setting persists in localStorage
  // as a plain "true"/"false" string per §18 registry. hintIdx is the
  // currently-highlighted hand tile and lives in component state only —
  // never persisted, never on game state.
  const [trainingMode, setTrainingMode] = useState(() => {
    try { return localStorage.getItem("mahjong_training_mode") === "true"; }
    catch { return false; }
  });
  const [hintIdx, setHintIdx] = useState(null);
  // Menu setup is shown as a summary line on the home screen; clicking
  // Edit opens a modal with the full Wind/Difficulty/Training controls.
  const [showSetup, setShowSetup] = useState(false);
  const [winSize, setWinSize] = useState({ w: typeof window !== "undefined" ? window.innerWidth : 1200, h: typeof window !== "undefined" ? window.innerHeight : 800 });
  const logRef = useRef(null);
  const autoPlayRef = useRef(null);
  const langRef = useRef(lang);
  langRef.current = lang;
  const diffRef = useRef(difficulty);
  diffRef.current = difficulty;

  // Resume in-progress (spec §6). gameStarted gates the save effect so
  // the throwaway initial state created by useState above is never
  // written to localStorage. hasResumeSave drives the menu UI. The refs
  // are accessed from lifecycle handlers and the debounced save effect.
  const [gameStarted, setGameStarted] = useState(false);
  // Resume schema v=2 (spec §6.3, §9.11). v=1 saves contained random
  // base-36 tile ids that don't match the §9.4 deterministic format, so
  // legacy saves are discarded by version mismatch in loadJson.
  const [hasResumeSave, setHasResumeSave] = useState(() => {
    const save = loadJson("mahjong_in_progress", 2, null);
    return save !== null;
  });
  const stateRef = useRef(state);
  const saveTimerRef = useRef(null);
  const flushSaveRef = useRef(() => {});
  const resumeClearedRef = useRef(false);

  // Localization helpers
  const L = LANG[lang];
  const TN = (t) => L.tileName(t);
  // SL is the per-seat display name. Every seat (human + 3 AIs) gets a name
  // from the chosen group at game start; we fall back to the localized
  // seatsShort label when state.playerNames is missing (e.g. before first
  // game).
  const namesRef = useRef(state.playerNames);
  namesRef.current = state.playerNames;
  const SL = useMemo(() => {
    const names = state.playerNames || [];
    return L.seatsShort.map((short, i) => names[i] || short);
  }, [L, state.playerNames]);
  // For game logic (called inside setState where `lang` state may be stale)
  const _L = () => LANG[langRef.current];
  const _TN = (t) => _L().tileName(t);
  const _SL = () => {
    const names = namesRef.current || [];
    return _L().seatsShort.map((short, i) => names[i] || short);
  };

  const addLog = useCallback((msg) => {
    setState((prev) => ({ ...prev, log: [...prev.log.slice(-50), msg] }));
  }, []);

  // Prevent buttons from receiving focus on click (click still fires)
  const preventFocus = useCallback((e) => {
    if (e.target.tagName === "BUTTON" || e.target.closest("button")) {
      e.preventDefault();
    }
  }, []);

  // Track window size for responsive scaling
  useEffect(() => {
    const onResize = () => setWinSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Persist training-mode menu setting (spec §5.3). Scalar key, no
  // versioning — see §18 registry.
  useEffect(() => {
    try { localStorage.setItem("mahjong_training_mode", String(trainingMode)); }
    catch {}
  }, [trainingMode]);

  // Clear the hint highlight whenever the discard window closes or moves
  // to a different seat (spec §5.2 "relevant discard flow completes").
  useEffect(() => {
    setHintIdx(null);
  }, [state.phase, state.currentTurn, state.turnDrawn]);

  // ============================================================
  // RESUME IN-PROGRESS (spec §6)
  // ============================================================

  // §6.5 — produce the slim payload written to localStorage. Drops UI-
  // ephemeral fields (none today; tileAnims/aiReactions will be dropped
  // here once Phase 6/7 land). Trims the human-readable log to the last
  // 50 lines.
  function slimState(st) {
    const slim = { ...st };
    slim.log = (st.log || []).slice(-50);
    delete slim.tileAnims;     // Phase 6 (no-op until then)
    delete slim.aiReactions;   // Phase 7 (no-op until then)
    return slim;
  }

  // §6.7 — predicate that decides whether the current state should be
  // persisted. Closes over gameStarted (the throwaway-gate),
  // gameOverAcknowledged (terminal), and the cleared-ref guard.
  function shouldPersistResume() {
    if (!gameStarted) return false;
    if (resumeClearedRef.current) return false;
    if (gameOverAcknowledged) return false;
    if (!stateRef.current?.gameId) return false;
    return true;
  }

  // §6.7 — synchronous write/remove. Called from the debounced save
  // effect and from lifecycle handlers (unconditional). Reads state via
  // stateRef so lifecycle handlers see the latest value, never the
  // closure value from when listeners were attached.
  function flushSave() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!gameStarted) return;  // throwaway-state guard; do not touch storage
    if (!shouldPersistResume()) {
      removeStorageKey("mahjong_in_progress");
      return;
    }
    saveJson("mahjong_in_progress", {
      v: 2,  // §9.11 — bumped from v=1 when deterministic tile ids shipped
      state: slimState(stateRef.current),
      lang: langRef.current,
      difficulty: diffRef.current,
      windRoundsSetting,
      trainingMode,
    });
  }

  // §6.7 stateRef sync — runs every render, no dep array. Without this,
  // flushSave called from a lifecycle handler reads a stale state.
  useEffect(() => { stateRef.current = state; });

  // flushSaveRef tracks the latest closure of flushSave so the
  // mount-only lifecycle effect below can call the current version.
  useEffect(() => { flushSaveRef.current = flushSave; });

  // §6.6 debounced save. Skips when gameStarted is false (throwaway
  // state at mount). The 500ms trailing timeout coalesces rapid state
  // changes; lifecycle handlers flush synchronously regardless.
  useEffect(() => {
    if (!gameStarted) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      flushSaveRef.current();
      saveTimerRef.current = null;
    }, 500);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [state.persistRev, showMenu, gameOverAcknowledged, gameStarted, lang, difficulty, windRoundsSetting, trainingMode]);

  // §6.7 lifecycle flush. Mount-only effect; handlers call flushSaveRef
  // which always points at the latest closure. Unconditional — see the
  // close-race walkthrough in §6.7 for why we don't gate on
  // saveTimerRef being non-null.
  useEffect(() => {
    function handler() { flushSaveRef.current(); }
    function visHandler() { if (document.hidden) flushSaveRef.current(); }
    window.addEventListener("beforeunload", handler);
    window.addEventListener("pagehide", handler);
    document.addEventListener("visibilitychange", visHandler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("pagehide", handler);
      document.removeEventListener("visibilitychange", visHandler);
    };
  }, []);

  // ============================================================
  // LIFETIME STATS (spec §7)
  // ============================================================
  //
  // Single combined game-over effect (spec §7.5 / §8.7). Runs when
  // gameOverAcknowledged flips true. Idempotent under React Strict Mode
  // via the lifetimeUpdatedFor === gameId short-circuit — second
  // invocation sees the freshly written lifetimeUpdatedFor and no-ops.
  // Spec §7.5 also mandates this synchronous ordering precede the resume
  // save clear; Phase 2's debounced save effect fires the clear 500ms
  // later, so this effect's saveLifetime always lands first.
  useEffect(() => {
    if (!gameOverAcknowledged) return;
    if (!state.gameId) return;
    const prev = loadLifetime();
    if (prev.lifetimeUpdatedFor === state.gameId) return;
    const delta = computeLifetimeDelta(state, PLAYER_IDX);
    const next = mergeLifetime(prev, delta);
    next.lifetimeUpdatedFor = state.gameId;
    saveLifetime(next);
    setStats(next);
    // Spec §9.10 — record today's daily result BEFORE achievements run
    // so the streak walker in daily_win_streak_7's predicate sees the
    // freshly written entry.
    let dailyAfter = null;
    if (state.dailyGame && state.dailyDate) {
      dailyAfter = recordDailyResult(state, state.dailyDate);
    }
    // §8.7 — achievements step runs against post-merge lifetime so
    // wins_10 / streak_5 / etc. see the freshly written totals. The
    // lifetimeUpdatedFor short-circuit above guards us against Strict
    // Mode double-invocation; the same gameId can't unlock the same
    // achievement twice.
    const prevAch = loadAchievements();
    const newlyUnlocked = checkAchievements({
      state,
      lifetime: next,
      roundResults: state.roundResults || [],
      achievements: prevAch,
      dailyResults: dailyAfter ? dailyAfter.results : null,
    });
    if (newlyUnlocked.length > 0) {
      const isoDate = new Date().toISOString().slice(0, 10);
      const nextAch = { v: 1, unlocked: { ...prevAch.unlocked } };
      for (const a of newlyUnlocked) nextAch.unlocked[a.id] = isoDate;
      saveAchievements(nextAch);
      setAchievements(nextAch);
      setToastQueue((q) => [...q, ...newlyUnlocked]);
    }
  }, [gameOverAcknowledged, state.gameId]);

  // Toast dismissal effect — show one at a time for ~2.5s.
  useEffect(() => {
    if (toastQueue.length === 0) return;
    const timer = setTimeout(() => {
      setToastQueue((q) => q.slice(1));
    }, 2500);
    return () => clearTimeout(timer);
  }, [toastQueue]);

  // Dynamic styles based on viewport
  const S = useMemo(() => makeStyles(winSize.w, winSize.h), [winSize.w, winSize.h]);
  const maxDiscards = Math.max(0, ...state.players.map((p) => p.discards.length));
  const discardDyn = computeDiscardOverride(maxDiscards, winSize.w, winSize.h);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.log]);

  // Reset round-over tab to default each time a new round begins (winner cleared).
  useEffect(() => {
    if (state.winner === null && !state.isDraw) {
      setRoundOverTab("winner");
    }
  }, [state.winner, state.isDraw]);

  // Record per-round outcome the first time a round ends, so the game-over
  // stats and round history can be computed without re-tracking it elsewhere.
  useEffect(() => {
    if (state.winner === null && !state.isDraw) return;
    if (state.roundResults.some((r) => r.round === state.roundNumber)) return;
    setState((prev) => {
      if (prev.roundResults.some((r) => r.round === prev.roundNumber)) return prev;
      const base = {
        round: prev.roundNumber,
        dealer: prev.dealer,
        roundWind: prev.roundWind,
        wallRemaining: prev.wall.length,
        scoresAfter: [...prev.scores],
      };
      const result = prev.winner !== null
        ? {
            ...base,
            winner: prev.winner,
            type: prev.winInfo.type,
            discarder: prev.winInfo.discarder,
            deltas: prev.scoreBreakdown.deltas,
            baseValue: prev.scoreBreakdown.base,
            sevenPairs: prev.winInfo.sevenPairs,
            largeHu: prev.winInfo.largeHu,
            isDraw: false,
          }
        : {
            ...base,
            winner: null,
            type: "draw",
            discarder: null,
            deltas: [0, 0, 0, 0],
            baseValue: 0,
            sevenPairs: false,
            largeHu: false,
            isDraw: true,
          };
      return { ...prev, roundResults: [...prev.roundResults, result], persistRev: prev.persistRev + 1 };
    });
  }, [state.winner, state.isDraw, state.roundNumber]);

  // AI auto-play
  useEffect(() => {
    if (showMenu || state.winner !== null || state.isDraw) return;
    if (state.awaitingPlayerClaim) return;
    if (state.currentTurn === PLAYER_IDX && state.phase === "discard" && state.turnDrawn) return;
    if (state.currentTurn === PLAYER_IDX && state.phase === "draw") return;

    const timer = setTimeout(() => {
      // Identity check: processAIAction returns prev unchanged on guard
      // failures (winner/isDraw/human turn) and a new object on every
      // mutation path. Bump persistRev only when state actually changed.
      setState((prev) => {
        const next = processAIAction(prev);
        return next === prev ? prev : { ...next, persistRev: prev.persistRev + 1 };
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [state.currentTurn, state.phase, state.turnDrawn, state.winner, state.isDraw, showMenu, state.awaitingPlayerClaim]);

  function processAIAction(st) {
    if (st.winner !== null || st.isDraw) return st;

    // If we're in claim resolution phase
    if (st.phase === "claim") {
      return resolveClaims(st);
    }

    const p = st.currentTurn;
    if (p === PLAYER_IDX) return st; // Don't auto-play for human

    const player = st.players[p];

    // Draw phase
    if (st.phase === "draw") {
      if (st.wall.length === 0) {
        return { ...st, isDraw: true, log: [...st.log, _L().logExhaust] };
      }
      const tile = st.wall[0];
      const newWall = st.wall.slice(1);
      const newHand = sortHand([...player.hand, tile]);
      const newPlayers = st.players.map((pl, i) => (i === p ? { ...pl, hand: newHand } : pl));
      let newSt = { ...st, players: newPlayers, wall: newWall, phase: "discard", turnDrawn: true, lastDrawn: tile };
      let winTile = tile;

      // Check for concealed gang
      const cGangs = findConcealedGangs(newHand);
      if (cGangs.length > 0) {
        const gang = cGangs[0];
        const afterHand = newHand.filter((t) => !gang.tiles.some((g) => g.id === t.id));
        const newMelds = [...player.openMelds, { ...gang, claimed: false }];

        if (newSt.wall.length === 0) {
          return { ...newSt, isDraw: true, log: [...newSt.log, _L().logExhaust] };
        }
        const replacementTile = newSt.wall[0];
        const afterWall = newSt.wall.slice(1);
        const afterHandWithReplacement = sortHand([...afterHand, replacementTile]);

        newPlayers[p] = { ...newPlayers[p], hand: afterHandWithReplacement, openMelds: newMelds };
        newSt = {
          ...newSt,
          players: [...newPlayers],
          wall: afterWall,
          lastDrawn: replacementTile,
          log: [...newSt.log, _L().logGangConc(_SL()[p], _TN(gang.tiles[0]))],
        };
        winTile = replacementTile;
      }

      // Check for promoted gang (drew the 4th tile that matches an open
      // peng). Auto-promotes; same shape as the concealed branch above.
      // Only one promotion per draw — chains are an edge case.
      const playerAfterCGang = newSt.players[p];
      const pGangs = findPromotedGangs(playerAfterCGang);
      if (pGangs.length > 0) {
        const pg = pGangs[0];
        const promotedMeld = { ...playerAfterCGang.openMelds[pg.meldIdx], type: "gang", tiles: [...playerAfterCGang.openMelds[pg.meldIdx].tiles, pg.tile] };
        const newMelds = playerAfterCGang.openMelds.map((m, i) => i === pg.meldIdx ? promotedMeld : m);
        const handMinusTile = playerAfterCGang.hand.filter((t) => t.id !== pg.tile.id);

        if (newSt.wall.length === 0) {
          return { ...newSt, isDraw: true, log: [...newSt.log, _L().logExhaust] };
        }
        const replacementTile = newSt.wall[0];
        const afterWall = newSt.wall.slice(1);
        const handAfterReplacement = sortHand([...handMinusTile, replacementTile]);

        newPlayers[p] = { ...newPlayers[p], hand: handAfterReplacement, openMelds: newMelds };
        newSt = {
          ...newSt,
          players: [...newPlayers],
          wall: afterWall,
          lastDrawn: replacementTile,
          log: [...newSt.log, _L().logPromotedGang(_SL()[p], _TN(pg.tile))],
        };
        winTile = replacementTile;
      }

      // Check self-draw win
      const checkPlayer = newSt.players[p];
      if (validateHu(checkPlayer)) {
        const won = applyWin(newSt, p, winTile, "zimo", null);
        return { ...won, log: [...won.log, _L().logZimo(_SL()[p], _TN(winTile))] };
      }

      return { ...newSt, log: [...newSt.log, _L().logDraw(_SL()[p])] };
    }

    // Discard phase
    if (st.phase === "discard" && st.turnDrawn) {
      const discardIdx = aiChooseDiscard(player.hand, player.openMelds, st.players, diffRef.current, (st.personalities || [])[p] || "generic", st.wall.length, p);
      const discarded = player.hand[discardIdx];
      const newHand = player.hand.filter((_, i) => i !== discardIdx);
      const newPlayers = st.players.map((pl, i) =>
        i === p ? { ...pl, hand: newHand, discards: [...pl.discards, discarded] } : pl
      );

      let newSt = {
        ...st,
        players: newPlayers,
        lastDiscard: discarded,
        lastDiscarder: p,
        phase: "claim",
        turnDrawn: false,
        playerDeclinedClaims: [],
        log: [...st.log, _L().logDiscard(_SL()[p], _TN(discarded))],
      };

      return newSt;
    }

    return st;
  }

  function resolveClaims(st) {
    const disc = st.lastDiscard;
    const discarder = st.lastDiscarder;
    if (!disc) return advanceTurn(st);

    // Track which claim types the player has already declined for this discard
    const declined = st.playerDeclinedClaims || [];

    // Check claims in priority order: Hu > Gang > Peng > Chi
    // Check all players (except discarder)
    let bestClaim = null;
    let bestPriority = -1;
    let bestPlayer = -1;

    for (let i = 0; i < 4; i++) {
      if (i === discarder) continue;
      const player = st.players[i];

      // Hu check
      if (checkWinWithTile(player, disc)) {
        const priority = 4;
        const turnDist = (i - discarder + 4) % 4;
        if (priority > bestPriority || (priority === bestPriority && turnDist < (bestPlayer - discarder + 4) % 4)) {
          if (i === PLAYER_IDX) {
            if (!declined.includes("hu")) {
              return { ...st, awaitingPlayerClaim: { type: "hu", playerIdx: i, tile: disc } };
            }
          } else if (aiDecideClaim(player, disc, "hu", i, discarder, st.players, diffRef.current, (st.personalities || [])[i] || "generic", st.wall.length)) {
            bestClaim = { type: "hu", playerIdx: i };
            bestPriority = priority;
            bestPlayer = i;
          }
        }
      }

      // Gang check
      const gangOpt = findGangOption(player.hand, disc);
      if (gangOpt && bestPriority < 3) {
        if (i === PLAYER_IDX) {
          if (!declined.includes("gang")) {
            return { ...st, awaitingPlayerClaim: { type: "gang", playerIdx: i, tile: disc, option: gangOpt } };
          }
        } else if (aiDecideClaim(player, disc, "gang", i, discarder, st.players, diffRef.current, (st.personalities || [])[i] || "generic", st.wall.length)) {
          bestClaim = { type: "gang", playerIdx: i, option: gangOpt };
          bestPriority = 3;
          bestPlayer = i;
        }
      }

      // Peng check
      const pengOpt = findPengOption(player.hand, disc);
      if (pengOpt && bestPriority < 2) {
        if (i === PLAYER_IDX) {
          if (!declined.includes("peng")) {
            return { ...st, awaitingPlayerClaim: { type: "peng", playerIdx: i, tile: disc, option: pengOpt } };
          }
        } else if (aiDecideClaim(player, disc, "peng", i, discarder, st.players, diffRef.current, (st.personalities || [])[i] || "generic", st.wall.length)) {
          bestClaim = { type: "peng", playerIdx: i, option: pengOpt };
          bestPriority = 2;
          bestPlayer = i;
        }
      }

      // Chi check (only from left neighbor)
      const nextInTurn = (discarder + 1) % 4;
      if (i === nextInTurn && bestPriority < 1) {
        const chiOpts = findChiOptions(player.hand, disc);
        if (chiOpts.length > 0) {
          if (i === PLAYER_IDX) {
            if (!declined.includes("chi")) {
              return { ...st, awaitingPlayerClaim: { type: "chi", playerIdx: i, tile: disc, options: chiOpts } };
            }
          } else {
            const aiResult = aiDecideClaim(player, disc, "chi", i, discarder, st.players, diffRef.current, (st.personalities || [])[i] || "generic", st.wall.length);
            if (aiResult) {
              const opt = typeof aiResult === "object" ? aiResult : chiOpts[0];
              bestClaim = { type: "chi", playerIdx: i, option: opt };
              bestPriority = 1;
              bestPlayer = i;
            }
          }
        }
      }
    }

    if (bestClaim) {
      return executeClaim(st, bestClaim);
    }

    return advanceTurn(st);
  }

  function executeClaim(st, claim) {
    const p = claim.playerIdx;
    const player = st.players[p];
    const disc = st.lastDiscard;

    if (claim.type === "hu") {
      const newHand = [...player.hand, disc];
      const newPlayers = st.players.map((pl, i) => (i === p ? { ...pl, hand: sortHand(newHand) } : pl));
      // Remove from discarder's discard pool
      const discarder = st.lastDiscarder;
      newPlayers[discarder] = {
        ...newPlayers[discarder],
        discards: newPlayers[discarder].discards.filter((t) => t.id !== disc.id),
      };
      const afterClaim = { ...st, players: newPlayers, awaitingPlayerClaim: null };
      const won = applyWin(afterClaim, p, disc, "dianpao", discarder);
      return { ...won, log: [...won.log, _L().logDianpao(_SL()[p], _TN(disc))] };
    }

    const opt = claim.option;
    const newHand = player.hand.filter((t) => !opt.fromHand.some((f) => f.id === t.id));
    const meld = { type: opt.type, tiles: opt.tiles, claimed: true };
    const newMelds = [...player.openMelds, meld];

    // Remove disc from discarder's pool
    const discarder = st.lastDiscarder;
    const newPlayers = st.players.map((pl, i) => {
      if (i === p) return { ...pl, hand: sortHand(newHand), openMelds: newMelds };
      if (i === discarder) return { ...pl, discards: pl.discards.filter((t) => t.id !== disc.id) };
      return pl;
    });

    let newSt = {
      ...st,
      players: newPlayers,
      currentTurn: p,
      lastDiscard: null,
      lastDiscarder: null,
      awaitingPlayerClaim: null,
      log: [
        ...st.log,
        _L().logClaim(_SL()[p], _TN(disc), _L().actionLabel[claim.type] || claim.type),
      ],
    };

    if (claim.type === "gang") {
      // Draw replacement
      if (newSt.wall.length === 0) {
        return { ...newSt, isDraw: true, log: [...newSt.log, _L().logExhaust] };
      }
      const replacement = newSt.wall[0];
      const afterWall = newSt.wall.slice(1);
      const afterHand = sortHand([...newHand, replacement]);
      newSt.players = newSt.players.map((pl, i) => (i === p ? { ...pl, hand: afterHand } : pl));
      newSt.wall = afterWall;
      newSt.phase = "discard";
      newSt.turnDrawn = true;
    } else {
      newSt.phase = "discard";
      newSt.turnDrawn = true;
    }

    return newSt;
  }

  function advanceTurn(st) {
    const next = (st.lastDiscarder + 1) % 4;
    return {
      ...st,
      currentTurn: next,
      phase: "draw",
      lastDiscard: null,
      lastDiscarder: null,
      turnDrawn: false,
      playerDeclinedClaims: [],
    };
  }

  // Player actions
  function handlePlayerDraw() {
    setState((prev) => {
      if (prev.currentTurn !== PLAYER_IDX || prev.phase !== "draw") return prev;
      if (prev.wall.length === 0) {
        return { ...prev, isDraw: true, log: [...prev.log, _L().logExhaust], persistRev: prev.persistRev + 1 };
      }
      const tile = prev.wall[0];
      const newWall = prev.wall.slice(1);
      const player = prev.players[PLAYER_IDX];
      const newHand = sortHand([...player.hand, tile]);
      const newPlayers = prev.players.map((pl, i) => (i === PLAYER_IDX ? { ...pl, hand: newHand } : pl));
      let newSt = {
        ...prev,
        players: newPlayers,
        wall: newWall,
        phase: "discard",
        turnDrawn: true,
        lastDrawn: tile,
        log: [...prev.log, _L().logYouDraw(_TN(tile))],
        persistRev: prev.persistRev + 1,
      };

      if (validateHu(newSt.players[PLAYER_IDX])) {
        newSt.log = [...newSt.log, _L().logCanHu];
      }

      return newSt;
    });
    setSelectedTileIdx(null);
  }

  function handlePlayerDiscard(tileIdx) {
    setState((prev) => {
      if (prev.currentTurn !== PLAYER_IDX || prev.phase !== "discard" || !prev.turnDrawn) return prev;
      const player = prev.players[PLAYER_IDX];
      const discarded = player.hand[tileIdx];
      const newHand = player.hand.filter((_, i) => i !== tileIdx);
      const newPlayers = prev.players.map((pl, i) =>
        i === PLAYER_IDX ? { ...pl, hand: newHand, discards: [...pl.discards, discarded] } : pl
      );
      return {
        ...prev,
        players: newPlayers,
        lastDiscard: discarded,
        lastDiscarder: PLAYER_IDX,
        phase: "claim",
        turnDrawn: false,
        playerDeclinedClaims: [],
        log: [...prev.log, _L().logYouDiscard(_TN(discarded))],
        persistRev: prev.persistRev + 1,
      };
    });
    setSelectedTileIdx(null);
  }

  function handleDeclareHu() {
    setState((prev) => {
      if (prev.currentTurn !== PLAYER_IDX) return prev;
      const player = prev.players[PLAYER_IDX];
      if (validateHu(player)) {
        // The player can only zimo immediately after drawing, so lastDrawn is
        // the winning tile. Fall back to the latest hand tile if unset.
        const winTile = prev.lastDrawn || player.hand[player.hand.length - 1];
        const won = applyWin(prev, PLAYER_IDX, winTile, "zimo", null);
        return { ...won, log: [...won.log, _L().logYouHu], persistRev: prev.persistRev + 1 };
      }
      return { ...prev, log: [...prev.log, _L().logBadHu], persistRev: prev.persistRev + 1 };
    });
  }

  function handleDeclareConcealedGang(tiles) {
    setState((prev) => {
      if (prev.currentTurn !== PLAYER_IDX || prev.phase !== "discard") return prev;
      const player = prev.players[PLAYER_IDX];
      const newHand = player.hand.filter((t) => !tiles.some((g) => g.id === t.id));
      const meld = { type: "gang", tiles, claimed: false, concealed: true };
      const newMelds = [...player.openMelds, meld];

      if (prev.wall.length === 0) {
        return { ...prev, isDraw: true, log: [...prev.log, _L().logExhaust], persistRev: prev.persistRev + 1 };
      }
      const replacement = prev.wall[0];
      const afterWall = prev.wall.slice(1);
      const afterHand = sortHand([...newHand, replacement]);
      const newPlayers = prev.players.map((pl, i) =>
        i === PLAYER_IDX ? { ...pl, hand: afterHand, openMelds: newMelds } : pl
      );
      return {
        ...prev,
        players: newPlayers,
        wall: afterWall,
        lastDrawn: replacement,
        log: [...prev.log, _L().logYouGang(_TN(tiles[0]))],
        persistRev: prev.persistRev + 1,
      };
    });
  }

  // Promoted Gang (加杠): convert an open peng to a gang using a 4th
  // matching tile from hand, then draw a replacement. Same shape as
  // handleDeclareConcealedGang — both must run during the human's
  // discard window and both consume the wall's next tile.
  function handleDeclarePromotedGang(meldIdx, tile) {
    setState((prev) => {
      if (prev.currentTurn !== PLAYER_IDX || prev.phase !== "discard" || !prev.turnDrawn) return prev;
      const player = prev.players[PLAYER_IDX];
      const meld = player.openMelds[meldIdx];
      if (!meld || meld.type !== "peng") return prev;
      if (tileKey(meld.tiles[0]) !== tileKey(tile)) return prev;
      if (!player.hand.some((t) => t.id === tile.id)) return prev;

      const newHand = player.hand.filter((t) => t.id !== tile.id);
      const newMeld = { ...meld, type: "gang", tiles: [...meld.tiles, tile] };
      const newMelds = player.openMelds.map((m, i) => i === meldIdx ? newMeld : m);

      if (prev.wall.length === 0) {
        return { ...prev, isDraw: true, log: [...prev.log, _L().logExhaust], persistRev: prev.persistRev + 1 };
      }
      const replacement = prev.wall[0];
      const afterWall = prev.wall.slice(1);
      const afterHand = sortHand([...newHand, replacement]);
      const newPlayers = prev.players.map((pl, i) =>
        i === PLAYER_IDX ? { ...pl, hand: afterHand, openMelds: newMelds } : pl
      );
      return {
        ...prev,
        players: newPlayers,
        wall: afterWall,
        lastDrawn: replacement,
        log: [...prev.log, _L().logYouPromotedGang(_TN(tile))],
        persistRev: prev.persistRev + 1,
      };
    });
  }

  // Training-mode hint: compute the expert-discard recommendation for
  // the human's current hand and highlight that tile. Idempotent —
  // clicking Hint repeatedly recomputes (deterministic since the hand
  // hasn't changed during a discard window). hintUsedThisGame flips
  // exactly once per match and survives round transitions because the
  // flag lives on match-scope game info per spec §5.3.
  function handleHint() {
    if (state.currentTurn !== PLAYER_IDX) return;
    if (state.phase !== "discard" || !state.turnDrawn) return;
    const me = state.players[PLAYER_IDX];
    const idx = aiChooseDiscard(
      me.hand, me.openMelds, state.players,
      "expert", "generic", state.wall.length, PLAYER_IDX
    );
    setHintIdx(idx);
    if (!state.hintUsedThisGame) {
      setState((prev) => prev.hintUsedThisGame ? prev : { ...prev, hintUsedThisGame: true, persistRev: prev.persistRev + 1 });
    }
  }

  function handlePlayerClaim(accept, option) {
    setState((prev) => {
      if (!prev.awaitingPlayerClaim) return prev;
      const claim = prev.awaitingPlayerClaim;
      let next;
      if (accept) {
        const claimObj = {
          type: claim.type,
          playerIdx: claim.playerIdx,
          option: option || claim.option,
        };
        next = executeClaim({ ...prev, playerDeclinedClaims: [] }, claimObj);
      } else {
        // Player declined — record it and continue resolving
        const declined = [...(prev.playerDeclinedClaims || []), claim.type];
        const newSt = { ...prev, awaitingPlayerClaim: null, playerDeclinedClaims: declined };
        next = resolveClaims(newSt);
      }
      // Identity check matches the AI auto-play wrapper at line ~270.
      return next === prev ? prev : { ...next, persistRev: prev.persistRev + 1 };
    });
    setClaimOptions(null);
  }

  function startNewGame() {
    // Spec §6.8 — Start Game from any menu path discards the prior save.
    removeStorageKey("mahjong_in_progress");
    setHasResumeSave(false);
    setHintIdx(null);
    resumeClearedRef.current = false;
    setState(createInitialState(windRoundsSetting, langRef.current));
    setShowMenu(false);
    setSelectedTileIdx(null);
    setClaimOptions(null);
    setRoundOverTab("winner");
    setGameOverTab("standings");
    setGameOverAcknowledged(false);
    setGameStarted(true);
  }

  // Spec §6.9 — Resume restores the saved game's state and settings,
  // discarding any in-menu settings changes. Called from the menu's
  // Resume Game button. After this, the save effect resumes normally.
  function resumeGame() {
    const save = loadJson("mahjong_in_progress", 2, null);
    if (!save || !save.state) return;
    resumeClearedRef.current = false;
    setHintIdx(null);
    setState(save.state);
    if (save.lang) setLang(save.lang);
    if (save.difficulty) setDifficulty(save.difficulty);
    if (save.windRoundsSetting) setWindRoundsSetting(save.windRoundsSetting);
    if (typeof save.trainingMode === "boolean") setTrainingMode(save.trainingMode);
    setShowMenu(false);
    setSelectedTileIdx(null);
    setClaimOptions(null);
    setRoundOverTab("winner");
    setGameOverTab("standings");
    setGameOverAcknowledged(false);
    setHasResumeSave(false);
    setGameStarted(true);
  }

  // Daily challenge (spec §9.9). Opens a modal showing today's status
  // (played / not played, result + streak), with a button to launch
  // the daily run. Uses fixed settings: 1 wind round, Expert AI,
  // training mode forced off.
  function openDaily() {
    setDailyData(loadDaily());
    setShowDaily(true);
  }
  // Start (or replay) today's daily challenge. asReplay=true marks the
  // run as non-recording per spec §9.10 — daily results are written
  // only on the first qualifying play.
  function startDailyGame(asReplay) {
    removeStorageKey("mahjong_in_progress");
    setHasResumeSave(false);
    setHintIdx(null);
    resumeClearedRef.current = false;
    const dailyDate = todayUtcDate();
    // Daily seeds are derived from the UTC date so every player sees
    // the same wall + AI personalities for the same date.
    const seed = seedFromDate(dailyDate);
    setState(createInitialState(1, langRef.current, seed, { dailyDate }));
    // Spec §9.9 — daily forces difficulty Expert and disables training
    // mode for fairness. The user's menu preferences aren't overwritten
    // in localStorage; they only override for this session's UI refs.
    setDifficulty("expert");
    setTrainingMode(false);
    setShowDaily(false);
    setShowMenu(false);
    setSelectedTileIdx(null);
    setClaimOptions(null);
    setRoundOverTab("winner");
    setGameOverTab("standings");
    setGameOverAcknowledged(false);
    setGameStarted(true);
    // asReplay is currently informational — recordDailyResult already
    // skips overwriting an existing recorded entry per §9.10. Reserved
    // for future stamping if non-recording attempts need distinction.
    void asReplay;
  }

  // Lifetime stats modal (spec §7.6). Re-read on open so stats stay
  // current even if a game ended while the modal was last closed.
  function openStats() {
    setStats(loadLifetime());
    setAchievements(loadAchievements());
    setStatsTab("stats");
    setShowStats(true);
  }
  function resetStats() {
    // §7.6 decision — resetting stats does NOT remove unlocked
    // achievements. Achievements have a separate reset path (below).
    if (!window.confirm(L.statsResetConfirm)) return;
    resetLifetime();
    setStats({ ...DEFAULT_LIFETIME_STATS });
  }
  // §7.6 — the separate achievements reset action. Mirrors resetStats
  // but only clears mahjong_achievements; lifetime stats are kept.
  function resetAchievementsAction() {
    if (!window.confirm(L.statsResetAchievementsConfirm)) return;
    resetAchievements();
    setAchievements({ ...DEFAULT_ACHIEVEMENTS, unlocked: {} });
  }

  // Name group editor: mutations also persist to localStorage.
  function persistGroups(next) {
    setNameGroups(next);
    saveNameGroups(next);
  }
  function addNameToGroup(groupIdx) {
    const trimmed = (newNameInputs[groupIdx] || "").trim();
    if (!trimmed) return;
    const g = nameGroups[groupIdx];
    if (!g || g.names.includes(trimmed)) {
      setNewNameInputs((s) => ({ ...s, [groupIdx]: "" }));
      return;
    }
    const next = nameGroups.map((grp, i) =>
      i === groupIdx ? { ...grp, names: [...grp.names, trimmed] } : grp
    );
    persistGroups(next);
    setNewNameInputs((s) => ({ ...s, [groupIdx]: "" }));
  }
  function removeNameFromGroup(groupIdx, name) {
    const next = nameGroups.map((g, i) =>
      i === groupIdx ? { ...g, names: g.names.filter((n) => n !== name) } : g
    );
    persistGroups(next);
  }
  function addGroup() {
    const trimmed = newGroupInput.trim();
    if (!trimmed) return;
    if (nameGroups.some((g) => g.name === trimmed)) {
      setNewGroupInput("");
      return;
    }
    persistGroups([...nameGroups, { name: trimmed, names: [] }]);
    setNewGroupInput("");
  }
  function removeGroup(groupIdx) {
    persistGroups(nameGroups.filter((_, i) => i !== groupIdx));
  }
  function resetNameGroups() {
    persistGroups(DEFAULT_NAME_GROUPS.map((g) => ({ name: g.name, names: [...g.names] })));
  }

  // Admin console: populate form from a state snapshot and open the modal.
  function openAdmin(snapshot) {
    const src = snapshot || state;
    setAdminInput({
      turn: src.currentTurn,
      phase: src.phase,
      wall: src.wall.slice(0, 14).map(tileToSpec).join(" "),
      players: src.players.map((p, i) => ({
        hand: p.hand.map(tileToSpec).join(" "),
        melds: p.openMelds.map(meldToSpec).join("; "),
        discards: p.discards.map(tileToSpec).join(" "),
        score: String(src.scores[i]),
      })),
    });
    setAdminTab("state");
    setShowAdmin(true);
  }
  function closeAdmin() {
    setShowAdmin(false);
  }
  function updateAdmin(changes) {
    setAdminInput((prev) => ({ ...prev, ...changes }));
  }
  function updateAdminPlayer(idx, changes) {
    setAdminInput((prev) => ({
      ...prev,
      players: prev.players.map((p, i) => (i === idx ? { ...p, ...changes } : p)),
    }));
  }
  function applyAdmin() {
    setState((prev) => {
      // Spec §9.4 + Appendix A.5 — collision-floor scan across every
      // place a tile id can live. Plus prev.usedAdminIds (Appendix A.6)
      // so admin-minted ids minted in PRIOR admin passes aren't reused.
      let scannedMax = -1;
      const scan = (t) => {
        if (!t) return;
        const n = parseInt(t.id, 10);
        if (Number.isFinite(n) && n > scannedMax) scannedMax = n;
      };
      for (const pl of prev.players) {
        for (const t of pl.hand) scan(t);
        for (const m of pl.openMelds) for (const t of m.tiles) scan(t);
        for (const t of pl.discards) scan(t);
      }
      for (const t of prev.wall) scan(t);
      scan(prev.lastDiscard);
      scan(prev.lastDrawn);
      const usedAdminIds = prev.usedAdminIds || [];
      const maxUsedAdmin = usedAdminIds.length > 0 ? Math.max(...usedAdminIds) : -1;
      let nextId = Math.max(scannedMax + 1, 1000, maxUsedAdmin + 1);
      const mintedThisCall = [];
      const idGen = () => { const v = nextId++; mintedThisCall.push(v); return v; };

      const newPlayers = prev.players.map((p, i) => {
        const inp = adminInput.players[i];
        return {
          ...p,
          hand: parseTileList(inp.hand, idGen),
          openMelds: parseMeldList(inp.melds, idGen),
          discards: parseTileList(inp.discards, idGen),
        };
      });
      const newWallTiles = parseTileList(adminInput.wall, idGen);
      // Prepend the user's tiles to the wall, dropping an equal count from the
      // front of the existing wall so length stays bounded.
      const newWall = newWallTiles.length > 0
        ? [...newWallTiles, ...prev.wall.slice(newWallTiles.length)]
        : prev.wall;
      const newScores = adminInput.players.map((p) => parseInt(p.score, 10) || 0);
      return {
        ...prev,
        currentTurn: adminInput.turn,
        phase: adminInput.phase,
        // turnDrawn tracks whether the current player has already drawn this
        // turn. Discard phase implies they have (14 tiles in hand); draw phase
        // implies they haven't (13 tiles). Without this, the player can hit a
        // dead state where they can neither draw nor discard.
        turnDrawn: adminInput.phase === "discard",
        wall: newWall,
        players: newPlayers,
        scores: newScores,
        // Stale references that would point at tiles whose IDs we just rewrote.
        lastDiscard: null,
        lastDiscarder: null,
        lastDrawn: null,
        awaitingPlayerClaim: null,
        playerDeclinedClaims: [],
        pendingClaims: null,
        // Pulling someone out of a finished round resets win/draw flags.
        winner: null,
        winInfo: null,
        scoreBreakdown: null,
        isDraw: false,
        // Spec §6.2 — once any admin edit lands, the action log can no
        // longer faithfully reconstruct the match. Replay (§14.8) excludes
        // adminTouched matches; this flag survives resume saves.
        adminTouched: true,
        usedAdminIds: [...usedAdminIds, ...mintedThisCall],
        persistRev: prev.persistRev + 1,
      };
    });
    setShowAdmin(false);
  }
  // Menu admin entry: start a normal game and open admin so the user can
  // overwrite the initial state.
  function startWithAdmin() {
    // Same clear-prior-save semantics as startNewGame (§6.8).
    removeStorageKey("mahjong_in_progress");
    setHasResumeSave(false);
    setHintIdx(null);
    resumeClearedRef.current = false;
    const initialState = createInitialState(windRoundsSetting, langRef.current);
    setState(initialState);
    setShowMenu(false);
    setSelectedTileIdx(null);
    setClaimOptions(null);
    setRoundOverTab("winner");
    setGameOverTab("standings");
    setGameOverAcknowledged(false);
    setGameStarted(true);
    openAdmin(initialState);
  }

  function nextRound() {
    setState((prev) => {
      const newDealer = (prev.dealer + 1) % 4;
      const roundNum = prev.roundNumber + 1;
      if (roundNum > prev.totalRounds) {
        return { ...prev, log: [...prev.log, _L().logOver], persistRev: prev.persistRev + 1 };
      }
      const windIdx = Math.floor((roundNum - 1) / 4);
      const newRoundWind = SEAT_WINDS[windIdx] || "east";
      // Spec §9.5 — derive the next round's seed from matchSeed +
      // roundNumber. roundSeeds map accumulates all per-round seeds so
      // replay (Phase 9b) can reconstruct any round in isolation.
      const newRoundSeed = seedForRound(prev.matchSeed, roundNum);
      const newRoundSeeds = { ...prev.roundSeeds, [roundNum]: newRoundSeed };
      // initRound returns {...gameInfo, ...overrides}, so persistRev
      // from the spread is the prev value; bump on top of the result.
      const next = initRound({
        ...prev,
        dealer: newDealer,
        roundWind: newRoundWind,
        roundNumber: roundNum,
        roundSeeds: newRoundSeeds,
      }, langRef.current, newRoundSeed);
      return { ...next, persistRev: prev.persistRev + 1 };
    });
  }

  // Derived state
  const player = state.players[PLAYER_IDX];
  const isPlayerTurn = state.currentTurn === PLAYER_IDX;
  const canDraw = isPlayerTurn && state.phase === "draw";
  const canDiscard = isPlayerTurn && state.phase === "discard" && state.turnDrawn;
  const canHu = isPlayerTurn && state.phase === "discard" && state.turnDrawn && validateHu(player);
  const concealedGangs = isPlayerTurn && state.phase === "discard" && state.turnDrawn ? findConcealedGangs(player.hand) : [];
  const promotedGangs = isPlayerTurn && state.phase === "discard" && state.turnDrawn ? findPromotedGangs(player) : [];
  const roundOver = state.winner !== null || state.isDraw;
  const gameOver = roundOver && state.roundNumber >= state.totalRounds;

  // ============================================================
  // HELPER: Render an opponent info strip
  // ============================================================
  const personalityLabel = (key) => {
    const map = { generic: L.pGeneric, aggressive: L.pAggressive, defensive: L.pDefensive, adaptive: L.pAdaptive };
    return map[key] || map.generic;
  };

  function renderOpponent(pIdx, posLabel) {
    const opp = state.players[pIdx];
    const isActive = state.currentTurn === pIdx;
    const pers = (state.personalities || [])[pIdx];
    return (
      <div style={{ ...S.oppStrip, ...(isActive ? S.oppStripActive : {}) }}>
        <div style={S.oppHeader}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ ...S.oppName, ...(isActive ? S.oppNameActive : {}) }}>
              {isActive && <span style={S.turnIndicator}>▶ </span>}
              {SL[pIdx]}
            </span>
            {posLabel && <span style={S.positionLabel}>{posLabel}</span>}
            {pers && difficulty !== "easy" && (
              <span style={S.personalityTag}>{personalityLabel(pers)}</span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            <span style={{ ...S.scoreChip, ...(state.scores[pIdx] < 0 ? S.scoreChipBroke : {}) }}>{state.scores[pIdx]} {L.scoreLabel}</span>
            <span style={S.oppTileCount}>{opp.hand.length} {L.tiles}</span>
          </div>
        </div>
        {opp.openMelds.length > 0 && (
          <div style={S.oppMeldsRow}>
            {opp.openMelds.map((m, mi) => (
              <div key={mi} style={S.oppMeldGroup}>
                {m.tiles.map((t, ti) => (
                  <span key={ti} style={{ ...S.oppMeldTile, ...(m.concealed ? S.concealedTile : {}) }}>
                    {m.concealed ? "🀫" : tileSymbol(t)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================

  // ============================================================
  // TILE FACE RENDERER (text-based, no emoji)
  // ============================================================
  function TileFace({ tile, fontSize }) {
    const d = tileDisplay(tile);
    const fs = fontSize || 20;
    const topFs = d.bot ? fs * 0.65 : fs * 0.75;
    const botFs = fs * 0.38;
    return (
      <span style={{
        display: "inline-flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", lineHeight: 1, color: d.color,
        fontWeight: "bold", fontFamily: "'Georgia', 'Songti SC', serif",
        width: "1em", height: "1em", fontSize: fs,
      }}>
        <span style={{ fontSize: topFs, lineHeight: 1.1 }}>{d.top}</span>
        {d.bot && <span style={{ fontSize: botFs, lineHeight: 1, marginTop: -1 }}>{d.bot}</span>}
      </span>
    );
  }

  // ============================================================
  // NAME GROUPS EDITOR (shared between the menu overlay and admin tab)
  // ============================================================
  function renderGroupsEditor() {
    return (
      <>
        <p style={S.adminLegend}>{L.namesHint}</p>
        <div style={S.namesInputRow}>
          <input
            style={S.namesInput}
            placeholder={L.addGroupPlaceholder}
            value={newGroupInput}
            onChange={(e) => setNewGroupInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addGroup(); }}
          />
          <button tabIndex={-1} style={S.langBtn} onClick={addGroup}>{L.addGroupBtn}</button>
        </div>
        {nameGroups.length === 0 ? (
          <p style={S.adminLegend}>{L.namesEmpty}</p>
        ) : (
          nameGroups.map((g, gi) => (
            <div key={`${g.name}-${gi}`} style={S.namesGroupBox}>
              <div style={S.namesGroupHeader}>
                <span style={S.namesGroupTitle}>{g.name}</span>
                <button tabIndex={-1} style={S.namesRemoveBtn} onClick={() => removeGroup(gi)}>×</button>
              </div>
              {g.names.length === 0 ? (
                <p style={S.adminLegend}>{L.groupEmpty}</p>
              ) : (
                <div style={S.namesList}>
                  {g.names.map((n) => (
                    <div key={n} style={S.namesRow}>
                      <span style={S.namesRowText}>{n}</span>
                      <button tabIndex={-1} style={S.namesRemoveBtn} onClick={() => removeNameFromGroup(gi, n)}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={S.namesInputRow}>
                <input
                  style={S.namesInput}
                  placeholder={L.addNamePlaceholder}
                  value={newNameInputs[gi] || ""}
                  onChange={(e) => setNewNameInputs((s) => ({ ...s, [gi]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") addNameToGroup(gi); }}
                />
                <button tabIndex={-1} style={S.langBtn} onClick={() => addNameToGroup(gi)}>{L.addNameBtn}</button>
              </div>
            </div>
          ))
        )}
      </>
    );
  }

  // ============================================================
  // MANAGE NAMES OVERLAY
  // ============================================================
  function renderNamesOverlay() {
    return (
      <div style={S.overlay} onClick={() => setShowNames(false)}>
        <div style={S.namesPanel} onClick={(e) => e.stopPropagation()}>
          <div style={S.adminHeader}>
            <h2 style={S.adminTitle}>{L.manageNamesTitle}</h2>
            <button tabIndex={-1} style={S.menuBtn} onClick={() => setShowNames(false)}>{L.helpClose}</button>
          </div>
          <div style={S.namesScroll}>
            {renderGroupsEditor()}
          </div>
          <div style={S.adminFooter}>
            <button tabIndex={-1} style={S.langBtn} onClick={resetNameGroups}>{L.resetNamesBtn}</button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // STATS OVERLAY (spec §7.6)
  // ============================================================
  function renderStatsOverlay() {
    const dash = L.statsEmDash;
    const fmtN = (n) => n === null || n === undefined ? dash : String(n);
    const fmtSigned = (n) => {
      if (n === null || n === undefined) return dash;
      return n > 0 ? `+${n}` : String(n);
    };
    const fmtPct = (num, denom) => {
      if (!denom) return dash;
      return `${Math.round((num / denom) * 100)}%`;
    };

    function valueStyle(n, kind) {
      if (n === null || n === undefined || n === 0) return S.statsKvValueL;
      if (kind === "gain" && n > 0) return { ...S.statsKvValueL, ...S.statsValuePositive };
      if (kind === "loss" && n < 0) return { ...S.statsKvValueL, ...S.statsValueNegative };
      if (kind === "net") return n > 0
        ? { ...S.statsKvValueL, ...S.statsValuePositive }
        : { ...S.statsKvValueL, ...S.statsValueNegative };
      return S.statsKvValueL;
    }

    function row(label, value, kind) {
      return (
        <div style={S.statsKvRow}>
          <span style={S.statsKvLabelL}>{label}</span>
          <span style={valueStyle(kind === "raw" ? null : value, kind)}>{value}</span>
        </div>
      );
    }

    return (
      <div style={S.overlay} onClick={() => setShowStats(false)}>
        <div style={S.statsPanel} onClick={(e) => e.stopPropagation()}>
          <div style={S.statsHeader}>
            <h2 style={S.statsTitle}>{L.statsTitle}</h2>
            <button tabIndex={-1} style={S.menuBtn} onClick={() => setShowStats(false)}>{L.statsClose}</button>
          </div>
          <div style={S.tabBar}>
            {[
              ["stats", L.statsTabStats],
              ["achievements", L.statsTabAchievements],
            ].map(([id, label]) => (
              <button
                key={id}
                tabIndex={-1}
                style={{ ...S.tabBtn, ...(statsTab === id ? S.tabBtnActive : {}) }}
                onClick={() => setStatsTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={S.statsScroll}>
            <div style={S.tabPanes}>
              <div style={{ ...S.tabPane, ...(statsTab !== "stats" ? S.tabPaneHidden : {}) }} aria-hidden={statsTab !== "stats"}>
                <div style={S.statsSection}>
                  <div style={S.statsSectionHeader}>{L.statsSectionGames}</div>
                  {row(L.lblGamesPlayed, fmtN(stats.gamesPlayed))}
                  {row(L.lblGamesWon, fmtN(stats.gamesWon))}
                  {row(L.lblWinRate, fmtPct(stats.gamesWon, stats.gamesPlayed))}
                </div>
                <div style={S.statsSection}>
                  <div style={S.statsSectionHeader}>{L.statsSectionWins}</div>
                  {row(L.lblRoundsPlayed, fmtN(stats.roundsPlayed))}
                  {row(L.lblRoundsWon, fmtN(stats.roundsWon))}
                  {row(L.lblSmallHu, fmtN(stats.smallHu))}
                  {row(L.lblLargeHu, fmtN(stats.largeHu))}
                  {row(L.lblZimoHu, fmtN(stats.zimoHu))}
                  {row(L.lblSevenPairsHu, fmtN(stats.sevenPairsHu))}
                  {row(L.lblRoundsDianpao, fmtN(stats.roundsDianpaoGiven))}
                </div>
                <div style={S.statsSection}>
                  <div style={S.statsSectionHeader}>{L.statsSectionRecords}</div>
                  {row(L.lblBiggestGain, fmtSigned(stats.biggestSingleGain), "gain")}
                  {row(L.lblBiggestLoss, fmtSigned(stats.biggestSingleLoss), "loss")}
                  {row(L.lblBestBalance, fmtN(stats.bestEndingBalance))}
                  {row(L.lblWorstBalance, fmtN(stats.worstEndingBalance))}
                  {row(L.lblTotalNet, fmtSigned(stats.totalScoreNet), "net")}
                </div>
                <div style={S.statsSection}>
                  <div style={S.statsSectionHeader}>{L.statsSectionStreaks}</div>
                  {row(L.lblCurrentStreak, fmtN(stats.currentWinStreak))}
                  {row(L.lblLongestStreak, fmtN(stats.longestWinStreak))}
                </div>
              </div>
              <div style={{ ...S.tabPane, ...(statsTab !== "achievements" ? S.tabPaneHidden : {}) }} aria-hidden={statsTab !== "achievements"}>
                <div style={S.achGrid}>
                  {ACHIEVEMENTS.map((ach) => {
                    const unlockedAt = achievements.unlocked[ach.id];
                    const isUnlocked = !!unlockedAt;
                    return (
                      <div key={ach.id} style={{ ...S.achBadge, ...(isUnlocked ? {} : S.achBadgeLocked) }}>
                        <div style={S.achIcon}>{ach.icon}</div>
                        <div style={S.achName}>{L[ach.nameKey]}</div>
                        <div style={S.achDesc}>{L[ach.descKey]}</div>
                        {isUnlocked && <div style={S.achDate}>{L.achUnlockedAt(unlockedAt)}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <div style={S.statsFooter}>
            {statsTab === "achievements" ? (
              <button tabIndex={-1} style={S.statsResetBtn} onClick={resetAchievementsAction}>{L.statsResetAchievementsBtn}</button>
            ) : (
              <button tabIndex={-1} style={S.statsResetBtn} onClick={resetStats}>{L.statsResetBtn}</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // ADMIN CONSOLE OVERLAY
  // ============================================================
  function renderAdminOverlay() {
    if (!adminInput) return null;
    return (
      <div style={S.overlay} onClick={closeAdmin}>
        <div style={S.adminPanel} onClick={(e) => e.stopPropagation()}>
          <div style={S.adminHeader}>
            <h2 style={S.adminTitle}>{L.adminTitle}</h2>
            <button tabIndex={-1} style={S.menuBtn} onClick={closeAdmin}>{L.adminClose}</button>
          </div>
          <div style={S.tabBar}>
            {[
              ["state", L.adminTabState],
              ["names", L.adminTabNames],
            ].map(([id, label]) => (
              <button
                key={id}
                tabIndex={-1}
                style={{ ...S.tabBtn, ...(adminTab === id ? S.tabBtnActive : {}) }}
                onClick={() => setAdminTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={S.adminScroll}>
            {adminTab === "state" && (
              <>
                <p style={S.adminLegend}>{L.adminLegend}</p>
                <p style={S.adminLegend}>{L.adminMeldExample}</p>

                <div style={S.adminTopRow}>
                  <label style={S.adminInlineLabel}>
                    {L.adminTurn}:
                    <select
                      style={S.adminSelect}
                      value={adminInput.turn}
                      onChange={(e) => updateAdmin({ turn: parseInt(e.target.value, 10) })}
                    >
                      {[0, 1, 2, 3].map((i) => (
                        <option key={i} value={i}>{SL[i]}</option>
                      ))}
                    </select>
                  </label>
                  <label style={S.adminInlineLabel}>
                    {L.adminPhase}:
                    <select
                      style={S.adminSelect}
                      value={adminInput.phase}
                      onChange={(e) => updateAdmin({ phase: e.target.value })}
                    >
                      <option value="draw">{L.adminPhaseDraw}</option>
                      <option value="discard">{L.adminPhaseDiscard}</option>
                      <option value="claim">{L.adminPhaseClaim}</option>
                    </select>
                  </label>
                </div>

                <div style={S.adminField}>
                  <label style={S.adminLabel}>{L.adminWall}</label>
                  <textarea
                    style={S.adminTextarea}
                    value={adminInput.wall}
                    onChange={(e) => updateAdmin({ wall: e.target.value })}
                    rows={2}
                  />
                </div>

                {adminInput.players.map((p, i) => (
                  <div key={i} style={S.adminPlayerBox}>
                    <div style={S.adminPlayerHeader}>
                      <span style={S.adminPlayerName}>{SL[i]}</span>
                      <label style={S.adminInlineLabel}>
                        {L.adminScore}:
                        <input
                          style={S.adminScoreInput}
                          type="number"
                          value={p.score}
                          onChange={(e) => updateAdminPlayer(i, { score: e.target.value })}
                        />
                      </label>
                    </div>
                    <div style={S.adminField}>
                      <label style={S.adminLabel}>{L.adminHand}</label>
                      <textarea
                        style={S.adminTextarea}
                        value={p.hand}
                        onChange={(e) => updateAdminPlayer(i, { hand: e.target.value })}
                        rows={2}
                      />
                    </div>
                    <div style={S.adminField}>
                      <label style={S.adminLabel}>{L.adminMelds}</label>
                      <textarea
                        style={S.adminTextarea}
                        value={p.melds}
                        onChange={(e) => updateAdminPlayer(i, { melds: e.target.value })}
                        rows={1}
                      />
                    </div>
                    <div style={S.adminField}>
                      <label style={S.adminLabel}>{L.adminDiscards}</label>
                      <textarea
                        style={S.adminTextarea}
                        value={p.discards}
                        onChange={(e) => updateAdminPlayer(i, { discards: e.target.value })}
                        rows={1}
                      />
                    </div>
                  </div>
                ))}
              </>
            )}
            {adminTab === "names" && (
              <>
                {renderGroupsEditor()}
                <div style={{ marginTop: 12 }}>
                  <button tabIndex={-1} style={S.langBtn} onClick={resetNameGroups}>{L.resetNamesBtn}</button>
                </div>
              </>
            )}
          </div>
          <div style={S.adminFooter}>
            <button tabIndex={-1} style={S.langBtn} onClick={closeAdmin}>{L.adminCancel}</button>
            {adminTab === "state" && (
              <button tabIndex={-1} style={S.startBtn} onClick={applyAdmin}>{L.adminApply}</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // DAILY CHALLENGE OVERLAY (spec §9.9)
  // ============================================================
  function renderDailyOverlay() {
    const today = todayUtcDate();
    const entry = dailyData.results[today];
    const streak = dailyWinStreakAsOf(dailyData, today);
    // Hours/minutes until next UTC midnight, used for the reset hint.
    const now = new Date();
    const nextMid = new Date(now);
    nextMid.setUTCDate(nextMid.getUTCDate() + 1);
    nextMid.setUTCHours(0, 0, 0, 0);
    const msLeft = nextMid - now;
    const hLeft = Math.floor(msLeft / 3_600_000);
    const mLeft = Math.floor((msLeft % 3_600_000) / 60_000);
    return (
      <div style={S.overlay} onClick={() => setShowDaily(false)}>
        <div style={S.setupPanel} onClick={(e) => e.stopPropagation()}>
          <div style={S.setupModalHeader}>
            <h2 style={S.setupModalTitle}>{L.dailyChallengeTitle}</h2>
            <button tabIndex={-1} style={S.menuBtn} onClick={() => setShowDaily(false)}>{L.dailyClose}</button>
          </div>
          <div style={S.setupModalContent}>
            <p style={S.resumeNote}>{L.dailyToday} {today}</p>
            <p style={S.resumeNote}>{L.dailyResetIn(hLeft, mLeft)}</p>
            <p style={{ ...S.resumeNote, marginTop: 12 }}>
              {entry ? L.dailyAlreadyPlayed : L.dailyNotPlayed}
            </p>
            {entry && (
              <>
                <p style={S.resumeNote}>{entry.won ? L.dailyResultWon : L.dailyResultLost}</p>
                <p style={S.resumeNote}>{L.dailyFinalScore(entry.finalScore)}</p>
                <p style={S.resumeNote}>{L.dailyRank(entry.rank)}</p>
              </>
            )}
            <p style={{ ...S.resumeNote, marginTop: 8 }}>{L.dailyStreak(streak)}</p>
            <p style={{ ...S.resumeNote, marginTop: 12, fontStyle: "italic" }}>{L.dailyNote}</p>
          </div>
          <div style={S.setupModalFooter}>
            <button tabIndex={-1} style={S.setupDoneBtn} onClick={() => startDailyGame(!!entry)}>
              {entry ? L.dailyReplayBtn : L.dailyStartBtn}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // ACHIEVEMENT TOAST (spec §8.8)
  // ============================================================
  function renderAchievementToast(ach) {
    return (
      <div style={S.achToast}>
        <span style={S.achToastIcon}>{ach.icon}</span>
        <span>{L.achToastUnlocked(L[ach.nameKey])}</span>
      </div>
    );
  }

  // ============================================================
  // SETUP OVERLAY (Game Setup popup)
  // ============================================================
  function renderSetupOverlay() {
    return (
      <div style={S.overlay} onClick={() => setShowSetup(false)}>
        <div style={S.setupPanel} onClick={(e) => e.stopPropagation()}>
          <div style={S.setupModalHeader}>
            <h2 style={S.setupModalTitle}>{L.setupTitle}</h2>
            <button tabIndex={-1} style={S.menuBtn} onClick={() => setShowSetup(false)}>{L.helpClose}</button>
          </div>
          <div style={S.setupModalContent}>
            <div style={S.menuSetting}>
              <label style={S.menuLabel}>{L.windRoundsLabel}</label>
              <div style={S.windButtons}>
                {[1, 2, 4].map((n) => (
                  <button
                    tabIndex={-1}
                    key={n}
                    style={{ ...S.windBtn, ...(windRoundsSetting === n ? S.windBtnActive : {}) }}
                    onClick={() => setWindRoundsSetting(n)}
                  >
                    {L.windRoundsBtn(n)}
                  </button>
                ))}
              </div>
            </div>
            <div style={S.menuSetting}>
              <label style={S.menuLabel}>{L.difficultyLabel}</label>
              <div style={S.windButtons}>
                {["easy", "medium", "expert"].map((d) => (
                  <button
                    tabIndex={-1}
                    key={d}
                    style={{ ...S.windBtn, ...(difficulty === d ? S.windBtnActive : {}) }}
                    onClick={() => setDifficulty(d)}
                  >
                    {d === "easy" ? L.diffEasy : d === "medium" ? L.diffMedium : L.diffExpert}
                  </button>
                ))}
              </div>
            </div>
            <div style={S.menuToggleRow}>
              <button
                tabIndex={-1}
                style={{ ...S.menuToggleBtn, ...(trainingMode ? S.menuToggleBtnActive : {}) }}
                onClick={() => setTrainingMode((v) => !v)}
                aria-pressed={trainingMode}
              >
                <span style={{ ...S.menuToggleBox, ...(trainingMode ? S.menuToggleBoxActive : {}) }}>
                  {trainingMode ? "✓" : ""}
                </span>
                <span>{L.trainingModeLabel}</span>
              </button>
            </div>
          </div>
          <div style={S.setupModalFooter}>
            <button tabIndex={-1} style={S.setupDoneBtn} onClick={() => setShowSetup(false)}>
              {L.setupDoneBtn}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // HELP OVERLAY
  // ============================================================
  function renderHelpOverlay() {
    const isEn = lang === "en";
    return (
      <div style={S.overlay} onClick={() => setShowHelp(false)}>
        <div style={S.helpPanel} onClick={(e) => e.stopPropagation()}>
          <div style={S.helpHeader}>
            <h2 style={S.helpTitle}>{L.howToPlay}</h2>
            <button tabIndex={-1} style={S.menuBtn} onClick={() => setShowHelp(false)}>{L.helpClose}</button>
          </div>
          <div style={S.helpScroll}>
            <h3 style={S.helpSectionTitle}>{isEn ? "Tiles" : "牌"}</h3>
            <p style={S.helpText}>{isEn
              ? "136 tiles total: 3 suits (Bamboo 条, Characters 万, Dots 饼) with ranks 1-9, 4 copies each (108 tiles). Plus 4 Wind tiles (East, South, West, North) and 3 Dragon tiles (Red, Green, White), 4 copies each (28 tiles)."
              : "共136张牌：三种花色（条、万、饼），每种1-9各4张（108张）。加上风牌（东南西北）和三元牌（中、发、白），各4张（28张）。"
            }</p>

            <h3 style={S.helpSectionTitle}>{isEn ? "Setup" : "开局"}</h3>
            <p style={S.helpText}>{isEn
              ? "Each player is dealt 13 tiles. The dealer gets a 14th and starts by discarding. Turn order is counter-clockwise: East → South → West → North."
              : "每人发13张牌。庄家多拿一张，先出牌。逆时针顺序：东→南→西→北。"
            }</p>

            <h3 style={S.helpSectionTitle}>{isEn ? "Your Turn" : "出牌"}</h3>
            <p style={S.helpText}>{isEn
              ? "1. Draw a tile from the wall. 2. Optionally declare a concealed Gang (4 identical tiles) or Hu (win). 3. Discard one tile."
              : "1. 从牌墙摸一张牌。2. 可选：暗杠（四张相同）或胡牌。3. 打出一张牌。"
            }</p>

            <h3 style={S.helpSectionTitle}>{isEn ? "Claiming Discards" : "吃碰杠"}</h3>
            <p style={S.helpText}>{isEn
              ? "Chi (吃): form a sequence of 3 — next player only. Peng (碰): form a triplet — any player. Gang (杠): form a quad — any player. Hu (胡): win — any player. Priority: Hu > Gang > Peng > Chi."
              : "吃：组成顺子，仅下家可吃。碰：组成刻子，任何人可碰。杠：组成四张，任何人可杠。胡：胡牌最优先。优先级：胡 > 杠 > 碰 > 吃。"
            }</p>

            <h3 style={S.helpSectionTitle}>{isEn ? "Winning (Hu)" : "胡牌"}</h3>
            <p style={S.helpText}>{isEn
              ? "Standard win: 4 melds + 1 pair (14 tiles). Seven Pairs (七小对): 7 distinct concealed pairs. Win by self-draw (Zimo 自摸) or claiming a discard (Dianpao 点炮)."
              : "标准胡牌：4组面子 + 1对将（14张）。七小对：7组暗对。可自摸或点炮胡牌。"
            }</p>

            <h3 style={S.helpSectionTitle}>{isEn ? "House Rules" : "番种规则"}</h3>
            <div style={S.helpRuleBox}>
              <p style={S.helpText}><strong>{isEn ? "Rule 1 — All Three Suits" : "规则一 — 三种花色"}</strong></p>
              <p style={S.helpText}>{isEn
                ? "Hand must include tiles from all 3 suits (Bamboo, Characters, Dots). The pair can count. Honors don't count toward suits."
                : "手牌须包含条、万、饼三种花色。将牌可算一种花色。字牌不算花色。"
              }</p>
            </div>
            <div style={S.helpRuleBox}>
              <p style={S.helpText}><strong>{isEn ? "Rule 2 — Terminal / Honor Meld" : "规则二 — 幺九/字牌"}</strong></p>
              <p style={S.helpText}>{isEn
                ? "At least one meld must contain a terminal (rank 1 or 9) or be honor tiles (winds/dragons). The pair doesn't count."
                : "至少一组面子含幺九牌（1或9）或字牌。将牌不算。"
              }</p>
            </div>
            <div style={S.helpRuleBox}>
              <p style={S.helpText}><strong>{isEn ? "Rule 3 — Open Meld Required" : "规则三 — 须有明牌"}</strong></p>
              <p style={S.helpText}>{isEn
                ? "Must have at least one open meld from claiming a discard. Concealed Gangs don't count. Waived for Seven Pairs (七小对)."
                : "须有至少一组明牌（吃碰杠）。暗杠不算。七小对免除此规则。"
              }</p>
            </div>

            <h3 style={S.helpSectionTitle}>{isEn ? "Gang Details" : "杠牌详情"}</h3>
            <p style={S.helpText}>{isEn
              ? "Exposed Gang: claim a discard when you hold 3 of it. Concealed Gang: declare on your turn when you hold all 4. Both draw a replacement tile. Concealed Gangs stay face-down and don't count as open melds."
              : "明杠：别人打出你有三张的牌时杠。暗杠：手中四张相同时声明。杠后都要补一张牌。暗杠不算明牌。"
            }</p>

            <h3 style={S.helpSectionTitle}>{isEn ? "Round End" : "一局结束"}</h3>
            <p style={S.helpText}>{isEn
              ? "A round ends when someone declares Hu (win) or the wall runs out (draw). The dealer rotates each round. Configure 1, 2, or 4 wind rounds (4, 8, or 16 rounds)."
              : "有人胡牌或牌墙摸完则一局结束。庄家每局轮换。可设置1、2或4圈风（4、8或16局）。"
            }</p>

            <h3 style={S.helpSectionTitle}>{isEn ? "AI Difficulty" : "AI难度"}</h3>
            <p style={S.helpText}>{isEn
              ? "Easy: simple heuristics, no defense. Medium: expert evaluation, relaxed thresholds. Expert: full tile efficiency, defensive play, and unique AI personalities (aggressive, defensive, adaptive)."
              : "简单：基本策略，无防守。中等：专家评估，宽松阈值。专家：完整牌效率分析、防守出牌、AI性格（激进、保守、随机应变）。"
            }</p>
          </div>
        </div>
      </div>
    );
  }

  if (showMenu) {
    return (
      <>
      <div style={S.menuContainer} onMouseDown={preventFocus}>
        <style dangerouslySetInnerHTML={{__html: `
          *:focus, *:active, *:focus-visible {
            outline: none !important;
            outline-width: 0 !important;
            -webkit-tap-highlight-color: transparent !important;
          }
          button:focus, button:active, button:focus-visible {
            box-shadow: none !important;
          }
        `}} />
        <div style={S.menuCard}>
          <div style={S.menuMain}>
            <h1 style={S.menuTitle}>{L.title}</h1>
            <p style={S.menuSubtitle}>{L.subtitle}</p>
            <div style={S.setupSummaryRow}>
              <span style={S.setupSummaryText}>
                <span style={S.setupSummaryLabel}>{L.setupLabel}:</span>
                {L.setupRoundsFmt(windRoundsSetting * 4)} · {difficulty === "easy" ? L.diffEasy : difficulty === "medium" ? L.diffMedium : L.diffExpert} · {trainingMode ? L.setupTrainOn : L.setupTrainOff}
              </span>
              <button tabIndex={-1} style={S.setupEditBtn} onClick={() => setShowSetup(true)}>
                {L.setupEditBtn}
              </button>
            </div>
            {(gameStarted || hasResumeSave) && (
              <>
                <div style={S.menuBtnRow}>
                  <button
                    tabIndex={-1}
                    style={S.startBtn}
                    onClick={gameStarted ? () => setShowMenu(false) : resumeGame}
                  >
                    {L.resumeGame}
                  </button>
                </div>
                {!gameStarted && <p style={S.resumeNote}>{L.resumeNote}</p>}
              </>
            )}
            <div style={S.menuBtnRow}>
              <button tabIndex={-1} style={S.startBtn} onClick={startNewGame}>{L.startGame}</button>
              <button tabIndex={-1} style={S.langBtn} onClick={() => setLang(lang === "en" ? "zh" : "en")}>{L.langToggle}</button>
            </div>
            <div style={S.menuHelpRow}>
              <button tabIndex={-1} style={S.langBtn} onClick={() => setShowHelp(true)}>{L.howToPlay}</button>
              <button tabIndex={-1} style={S.langBtn} onClick={openDaily}>{L.dailyChallengeBtn}</button>
              <button tabIndex={-1} style={S.langBtn} onClick={openStats}>{L.statsBtn}</button>
              <button tabIndex={-1} style={S.langBtn} onClick={() => setShowNames(true)}>{L.manageNamesBtn}</button>
              <button tabIndex={-1} style={S.langBtn} onClick={startWithAdmin}>{L.adminMenuBtn}</button>
            </div>
          </div>
        </div>
      </div>
      {showHelp && renderHelpOverlay()}
      {showStats && renderStatsOverlay()}
      {showSetup && renderSetupOverlay()}
      {showDaily && renderDailyOverlay()}
      {showAdmin && renderAdminOverlay()}
      {showNames && renderNamesOverlay()}
      {toastQueue.length > 0 && renderAchievementToast(toastQueue[0])}
      </>
    );
  }

  return (
    <>
    <div style={S.gameContainer} onMouseDown={preventFocus}>
      <style dangerouslySetInnerHTML={{__html: `
        *:focus, *:active, *:focus-visible {
          outline: none !important;
          outline-width: 0 !important;
          -webkit-tap-highlight-color: transparent !important;
        }
        button:focus, button:active, button:focus-visible {
          box-shadow: none !important;
        }
      `}} />
      {/* ---- TOP BAR ---- */}
      <div style={S.topBar}>
        <div style={S.topBarLeft}>
          <span style={S.roundInfo}>
            {L.roundInfo(state.roundNumber, state.totalRounds, L.windDisplay(state.roundWind))}
          </span>
          <span style={S.wallCount}>{L.wallCount(state.wall.length)}</span>
        </div>
        <div style={S.topBarRight}>
          {!isPlayerTurn && !state.awaitingPlayerClaim && !roundOver && (
            <span style={S.statusText}>{L.turnOther(SL[state.currentTurn])}</span>
          )}
          {isPlayerTurn && canDraw && <span style={S.statusTextYou}>{L.turnDraw}</span>}
          {isPlayerTurn && canDiscard && <span style={S.statusTextYou}>{L.turnDiscard}</span>}
          <button tabIndex={-1} style={S.langBtn} onClick={() => setLang(lang === "en" ? "zh" : "en")}>{L.langToggle}</button>
          {!state.dailyGame && (
            <button tabIndex={-1} style={S.menuBtn} onClick={() => openAdmin()}>{L.adminBtn}</button>
          )}
          <button tabIndex={-1} style={S.menuBtn} onClick={() => setShowHelp(true)}>?</button>
          <button tabIndex={-1} style={S.menuBtn} onClick={() => setShowMenu(true)}>☰</button>
        </div>
      </div>

      {/* ---- GAME TABLE + LOG ---- */}
      <div style={S.tableArea}>
        {/* Game area: everything except log */}
        <div style={S.gameArea}>
          {/* Top: West AI centered. Flow goes South → West → North (right to left). */}
          <div style={S.topOppRow}>
            <div style={S.turnArrow}>←</div>
            {renderOpponent(2)}
            <div style={S.turnArrow}>←</div>
          </div>

          {/* Middle: North | Discard Pool | South */}
          <div style={S.midRow}>
            <div style={S.sideOpp}>
              {renderOpponent(3)}
              <div style={S.turnArrow}>↓</div>
            </div>

            <div style={S.discardPoolScroll}>
              <div style={S.discardPoolContainer}>
                <div style={S.discardPoolHeader}>
                  <span style={S.discardPoolTitle}>{L.poolTitle}</span>
                  {state.lastDiscard && (
                    <span style={S.lastDiscardBadge}>
                      {L.latest} <span style={S.lastDiscardEmoji}>{tileSymbol(state.lastDiscard)}</span> {TN(state.lastDiscard)}
                      <span style={S.lastDiscardFrom}> — {SL[state.lastDiscarder]}</span>
                    </span>
                  )}
                </div>
                <div style={S.discardTableLayout}>
                  <div style={S.discardPositionTop}>
                    <div style={S.discardPlayerLabel}>{SL[2]}</div>
                    <div style={S.discardTilesWrap}>
                      {state.players[2].discards.length === 0 && <span style={S.discardEmpty}>—</span>}
                      {state.players[2].discards.map((t, i) => {
                        const isLast = state.lastDiscard && t.id === state.lastDiscard.id;
                        return <span key={i} style={{ ...S.discardTile, ...(discardDyn || {}), ...(isLast ? S.discardTileLatest : {}) }} title={TN(t)}>{tileSymbol(t)}</span>;
                      })}
                    </div>
                  </div>
                  <div style={S.discardPositionSide}>
                    <div style={S.discardPlayerLabel}>{SL[3]}</div>
                    <div style={S.discardTilesWrap}>
                      {state.players[3].discards.length === 0 && <span style={S.discardEmpty}>—</span>}
                      {state.players[3].discards.map((t, i) => {
                        const isLast = state.lastDiscard && t.id === state.lastDiscard.id;
                        return <span key={i} style={{ ...S.discardTile, ...(discardDyn || {}), ...(isLast ? S.discardTileLatest : {}) }} title={TN(t)}>{tileSymbol(t)}</span>;
                      })}
                    </div>
                  </div>
                  <div style={S.discardPositionSide}>
                    <div style={S.discardPlayerLabel}>{SL[1]}</div>
                    <div style={S.discardTilesWrap}>
                      {state.players[1].discards.length === 0 && <span style={S.discardEmpty}>—</span>}
                      {state.players[1].discards.map((t, i) => {
                        const isLast = state.lastDiscard && t.id === state.lastDiscard.id;
                        return <span key={i} style={{ ...S.discardTile, ...(discardDyn || {}), ...(isLast ? S.discardTileLatest : {}) }} title={TN(t)}>{tileSymbol(t)}</span>;
                      })}
                    </div>
                  </div>
                  <div style={S.discardPositionBottom}>
                    <div style={S.discardPlayerLabel}>{SL[0]}</div>
                    <div style={S.discardTilesWrap}>
                      {state.players[0].discards.length === 0 && <span style={S.discardEmpty}>—</span>}
                      {state.players[0].discards.map((t, i) => {
                        const isLast = state.lastDiscard && t.id === state.lastDiscard.id;
                        return <span key={i} style={{ ...S.discardTile, ...(discardDyn || {}), ...(isLast ? S.discardTileLatest : {}) }} title={TN(t)}>{tileSymbol(t)}</span>;
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={S.sideOpp}>
              <div style={S.turnArrow}>↑</div>
              {renderOpponent(1)}
            </div>
          </div>

          <div style={S.turnOrderLabel}>↻ {L.turnOrder}</div>

        {/* ---- CLAIM PROMPT ---- */}
        {state.awaitingPlayerClaim && (
        <div style={S.claimBanner}>
          <div style={S.claimBannerInner}>
            <div style={S.claimBannerLeft}>
              <span style={S.claimTileBig}>{tileSymbol(state.awaitingPlayerClaim.tile)}</span>
              <div style={S.claimBannerText}>
                <p style={S.claimTitle}>
                  {state.lastDiscarder !== null && L.discardedBy(SL[state.lastDiscarder])}
                  <strong>{TN(state.awaitingPlayerClaim.tile)}</strong>
                </p>
                <p style={S.claimQuestion}>
                  {L.youCan}<strong>{L.actionLabel[state.awaitingPlayerClaim.type] || state.awaitingPlayerClaim.type.toUpperCase()}</strong>
                  {state.awaitingPlayerClaim.type === "hu" && L.winRound}
                </p>
              </div>
            </div>
            <div style={S.claimBannerBtns}>
              {state.awaitingPlayerClaim.type === "chi" && state.awaitingPlayerClaim.options ? (
                <>
                  {state.awaitingPlayerClaim.options.map((opt, i) => (
                    <button tabIndex={-1} key={i} style={S.claimAccept} onClick={() => handlePlayerClaim(true, opt)}>
                      <span style={S.chiBtnGlyphs}>
                        {opt.tiles.map((t, ti) => <span key={ti}>{tileSymbol(t)}</span>)}
                      </span>
                    </button>
                  ))}
                  <button tabIndex={-1} style={S.claimDecline} onClick={() => handlePlayerClaim(false)}>{L.pass}</button>
                </>
              ) : (
                <>
                  <button tabIndex={-1} style={S.claimAccept} onClick={() => handlePlayerClaim(true)}>
                    {state.awaitingPlayerClaim.type === "hu" ? L.huBtn : L.claimBtn(L.actionLabel[state.awaitingPlayerClaim.type])}
                  </button>
                  <button tabIndex={-1} style={S.claimDecline} onClick={() => handlePlayerClaim(false)}>{L.pass}</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- PLAYER AREA ---- */}
      <div style={S.playerSection}>
        <div style={S.playerScoreRow}>
          <span style={{ ...S.scoreChip, ...(state.scores[PLAYER_IDX] < 0 ? S.scoreChipBroke : {}) }}>{SL[PLAYER_IDX]}: {state.scores[PLAYER_IDX]} {L.scoreLabel}</span>
        </div>
        {/* Action bar */}
        <div style={S.actionBar}>
          {canDraw && (
            <button tabIndex={-1} style={S.actionBtn} onClick={handlePlayerDraw}>{L.drawTile}</button>
          )}
          {canDiscard && selectedTileIdx !== null && (
            <button tabIndex={-1} style={S.actionBtnDanger} onClick={() => handlePlayerDiscard(selectedTileIdx)}>
              {L.discardSel}
            </button>
          )}
          {canHu && (
            <button tabIndex={-1} style={S.actionBtnWin} onClick={handleDeclareHu}>{L.declareHu}</button>
          )}
          {concealedGangs.map((g, i) => (
            <button tabIndex={-1} key={`cg${i}`} style={S.actionBtn} onClick={() => handleDeclareConcealedGang(g.tiles)}>
              {L.gangBtn(TN(g.tiles[0]))}
            </button>
          ))}
          {promotedGangs.map((g, i) => (
            <button tabIndex={-1} key={`pg${i}`} style={S.actionBtn} onClick={() => handleDeclarePromotedGang(g.meldIdx, g.tile)}>
              {L.promotedGangBtn(TN(g.tile))}
            </button>
          ))}
          {trainingMode && canDiscard && (
            <button tabIndex={-1} style={S.actionBtn} onClick={handleHint}>{L.hintBtn}</button>
          )}
        </div>

        {/* Open melds */}
        {player.openMelds.length > 0 && (
          <div style={S.playerMeldsRow}>
            {player.openMelds.map((m, mi) => (
              <div key={mi} style={S.playerMeldGroup}>
                {m.tiles.map((t, ti) => (
                  <span key={ti} style={{ ...S.playerMeldTile, ...(m.concealed ? S.concealedTile : {}) }}>
                    {m.concealed ? "🀫" : tileSymbol(t)}
                  </span>
                ))}
                <span style={S.meldTag}>{m.claimed ? L.open : L.hidden}</span>
              </div>
            ))}
          </div>
        )}

        {/* Hand */}
        <div style={S.playerHand}>
          {player.hand.map((t, i) => {
            const selected = selectedTileIdx === i;
            const isHint = hintIdx === i;
            return (
              <button
                tabIndex={-1}
                key={t.id}
                style={{
                  ...S.handTile,
                  ...(selected ? S.handTileSelected : {}),
                  ...(canDiscard ? S.handTileClickable : {}),
                  ...(isHint ? S.hintHighlight : {}),
                }}
                onClick={() => {
                  if (canDiscard) {
                    if (selected) handlePlayerDiscard(i);
                    else { setSelectedTileIdx(i); setHintIdx(null); }
                  }
                }}
                title={TN(t)}
              >
                {isHint && <span style={S.hintBadge}>{L.hintBestTag}</span>}
                <span style={S.tileImg}>{tileSymbol(t)}</span>
                <span style={S.tileLabel}>{TN(t)}</span>
              </button>
            );
          })}
        </div>
      </div>
      </div>

        {/* Log panel */}
        <div style={S.logPanel} ref={logRef}>
          {state.log.map((msg, i) => (
            <div key={i} style={S.logEntry}>{msg}</div>
          ))}
        </div>
      </div>

      {/* ---- ROUND OVER OVERLAY ---- */}
      {roundOver && !gameOverAcknowledged && (
        <div style={S.overlay}>
          <div style={S.roundOverBox}>
            <div style={S.tabBar}>
              {[
                ["winner", L.tabWinner],
                ["scoring", L.tabScoring],
                ["stats", L.tabStats],
              ].map(([id, label]) => (
                <button
                  key={id}
                  tabIndex={-1}
                  style={{ ...S.tabBtn, ...(roundOverTab === id ? S.tabBtnActive : {}) }}
                  onClick={() => setRoundOverTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={S.tabPanes}>
              <div style={{ ...S.tabPane, ...(roundOverTab !== "winner" ? S.tabPaneHidden : {}) }} aria-hidden={roundOverTab !== "winner"}>
                {state.winner !== null ? (
                  (() => {
                    const winner = state.players[state.winner];
                    const is7p = winner.openMelds.length === 0 && isSevenPairs(winner.hand);
                    return (
                    <>
                    <h2 style={S.winTitle}>
                      {state.winner === PLAYER_IDX ? L.youWin : L.otherWins(SL[state.winner])}
                    </h2>
                    {is7p && <p style={{ color: "#c9a961", fontSize: 14, letterSpacing: 2, marginBottom: 8, textTransform: "uppercase" }}>{L.sevenPairs}</p>}
                    {state.winInfo && (
                      <p style={S.winTypeBadge}>
                        {state.winInfo.type === "zimo" ? L.winTypeZimo : L.winTypeDianpao}
                        {" · "}
                        {state.winInfo.largeHu ? L.largeHu : L.smallHu}
                      </p>
                    )}
                    <div style={S.winningHand}>
                      <p style={S.winHandLabel}>{L.winHand}</p>
                      <div style={S.winTilesRow}>
                        {(() => {
                          const winId = state.winInfo && state.winInfo.winningTile ? state.winInfo.winningTile.id : null;
                          const tileStyle = (t) =>
                            winId && t.id === winId ? { ...S.winTile, ...S.winTileHighlight } : S.winTile;
                          return is7p ? (
                            (() => {
                              const pairs = [];
                              const used = new Set();
                              for (const t of winner.hand) {
                                if (used.has(t.id)) continue;
                                const match = winner.hand.find((x) => x.id !== t.id && !used.has(x.id) && tileKey(x) === tileKey(t));
                                if (match) {
                                  pairs.push([t, match]);
                                  used.add(t.id);
                                  used.add(match.id);
                                }
                              }
                              return pairs.map((pair, pi) => (
                                <div key={pi} style={S.winMeldGroup}>
                                  {pair.map((t, ti) => (
                                    <span key={ti} style={tileStyle(t)}>{tileSymbol(t)}</span>
                                  ))}
                                </div>
                              ));
                            })()
                          ) : (
                            <>
                              {winner.openMelds.map((m, mi) => (
                                <div key={`m${mi}`} style={S.winMeldGroup}>
                                  {m.tiles.map((t, ti) => (
                                    <span key={ti} style={tileStyle(t)}>{tileSymbol(t)}</span>
                                  ))}
                                </div>
                              ))}
                              <div style={S.winMeldGroup}>
                                {winner.hand.map((t, ti) => (
                                  <span key={ti} style={tileStyle(t)}>{tileSymbol(t)}</span>
                                ))}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      {state.winInfo && state.winInfo.winningTile && (
                        <p style={S.winningTileLabel}>{L.winningTile}: {TN(state.winInfo.winningTile)}</p>
                      )}
                    </div>
                    </>
                    );
                  })()
                ) : (
                  <h2 style={S.winTitle}>{L.drawExhausted}</h2>
                )}
              </div>

              <div style={{ ...S.tabPane, ...(roundOverTab !== "scoring" ? S.tabPaneHidden : {}) }} aria-hidden={roundOverTab !== "scoring"}>
                {state.scoreBreakdown ? (
                  <div style={S.breakdownBox}>
                    <p style={S.breakdownTitle}>{L.breakdownTitle}</p>
                    <p style={S.breakdownBase}>
                      {L.baseLabel}: {state.scoreBreakdown.base}
                    </p>
                    {state.players.map((_, i) => {
                      const delta = state.scoreBreakdown.deltas[i];
                      const isWinner = i === state.winner;
                      const mods = [];
                      if (!isWinner) {
                        if (!state.players[i].openMelds.some((m) => m.claimed)) mods.push(L.modNoOpen);
                        if (state.winInfo.type === "dianpao" && state.winInfo.discarder === i) mods.push(L.modDianpao);
                        if (state.winInfo.type === "zimo") mods.push(L.modZimo);
                        if (state.winInfo.sevenPairs) mods.push(L.modSevenPairs);
                      }
                      return (
                        <div key={i} style={S.breakdownRow}>
                          <span style={S.breakdownName}>{SL[i]}</span>
                          <span style={S.breakdownMods}>
                            {isWinner
                              ? L.winnerGains(delta)
                              : (mods.length > 0
                                  ? `${mods.join(" + ")} ${L.loserLoses(state.scoreBreakdown.mults[i], -delta)}`
                                  : `${L.loserLoses(state.scoreBreakdown.mults[i], -delta)}`)}
                          </span>
                          <span style={isWinner ? S.breakdownDeltaPos : S.breakdownDeltaNeg}>
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                          <span style={S.breakdownTotal}>= {state.scores[i]}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={S.breakdownBase}>{L.scoringNoExchange}</p>
                )}
              </div>

              <div style={{ ...S.tabPane, ...(roundOverTab !== "stats" ? S.tabPaneHidden : {}) }} aria-hidden={roundOverTab !== "stats"}>
                <div style={S.statsView}>
                  <p style={S.statsHeader}>
                    {L.roundHeader(state.roundNumber, state.totalRounds, L.windDisplay(state.roundWind), SL[state.dealer])}
                  </p>
                  <div style={S.statsKvBox}>
                    <div style={S.statsKvRow}>
                      <span style={S.statsKvLabel}>{L.wallRemainingLabel}</span>
                      <span style={S.statsKvValue}>{state.wall.length}</span>
                    </div>
                    {state.winner !== null && state.personalities && state.personalities[state.winner] && difficulty !== "easy" && (
                      <div style={S.statsKvRow}>
                        <span style={S.statsKvLabel}>{L.winnerPersonality}</span>
                        <span style={S.statsKvValue}>{personalityLabel(state.personalities[state.winner])}</span>
                      </div>
                    )}
                  </div>
                  <p style={S.statsSubtitle}>{L.standingsNow}</p>
                  <div style={S.standingsBox}>
                    {state.players
                      .map((_, i) => ({ idx: i, score: state.scores[i] }))
                      .sort((a, b) => b.score - a.score)
                      .map((entry, rank) => (
                        <div key={entry.idx} style={rank === 0 ? S.standingsRowWinner : S.standingsRow}>
                          <span style={S.standingsRank}>{rank + 1}{L.rankSuffix(rank + 1)}</span>
                          <span style={S.standingsName}>{SL[entry.idx]}</span>
                          <span style={{ ...S.standingsScore, ...(entry.score < 0 ? { color: "#f0a0a0" } : {}) }}>{entry.score}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={S.roundOverActions}>
              {gameOver ? (
                <button tabIndex={-1} style={S.startBtn} onClick={() => setGameOverAcknowledged(true)}>{L.gameSummary}</button>
              ) : (
                <button tabIndex={-1} style={S.startBtn} onClick={nextRound}>{L.nextRound}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- GAME OVER SUMMARY ---- */}
      {gameOver && gameOverAcknowledged && (
        <div style={S.overlay}>
          <div style={S.roundOverBox}>
            <h2 style={S.winTitle}>{L.gameOverTitle}</h2>
            <div style={S.tabBar}>
              {[
                ["standings", L.tabStandings],
                ["stats", L.tabStats],
              ].map(([id, label]) => (
                <button
                  key={id}
                  tabIndex={-1}
                  style={{ ...S.tabBtn, ...(gameOverTab === id ? S.tabBtnActive : {}) }}
                  onClick={() => setGameOverTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={S.tabPanes}>
              <div style={{ ...S.tabPane, ...(gameOverTab !== "standings" ? S.tabPaneHidden : {}) }} aria-hidden={gameOverTab !== "standings"}>
                <p style={S.finalStandingsLabel}>{L.finalStandings}</p>
                <div style={S.standingsBox}>
                  {state.players
                    .map((_, i) => ({ idx: i, score: state.scores[i] }))
                    .sort((a, b) => b.score - a.score)
                    .map((entry, rank) => (
                      <div key={entry.idx} style={rank === 0 ? S.standingsRowWinner : S.standingsRow}>
                        <span style={S.standingsRank}>{rank + 1}{L.rankSuffix(rank + 1)}</span>
                        <span style={S.standingsName}>{SL[entry.idx]}{rank === 0 ? " 🏆" : ""}</span>
                        <span style={{ ...S.standingsScore, ...(entry.score < 0 ? { color: "#f0a0a0" } : {}) }}>{entry.score}</span>
                      </div>
                    ))}
                </div>
              </div>
              <div style={{ ...S.tabPane, ...(gameOverTab !== "stats" ? S.tabPaneHidden : {}) }} aria-hidden={gameOverTab !== "stats"}>
                {(() => {
                  const results = state.roundResults;
                  const stats = state.players.map((_, i) => {
                    const wins = results.filter((r) => r.winner === i);
                    const dianpaos = results.filter((r) => r.discarder === i && !r.isDraw).length;
                    const deltas = results.map((r) => r.deltas[i]);
                    const biggestGain = deltas.length ? Math.max(0, ...deltas) : 0;
                    const biggestLoss = deltas.length ? Math.min(0, ...deltas) : 0;
                    return {
                      wins: wins.length,
                      dianpaos,
                      biggestGain,
                      biggestLoss,
                      smallHu: wins.filter((r) => !r.largeHu).length,
                      largeHu: wins.filter((r) => r.largeHu).length,
                      zimo: wins.filter((r) => r.type === "zimo").length,
                      sevenPairs: wins.filter((r) => r.sevenPairs).length,
                    };
                  });
                  let best = null;
                  results.forEach((r) => {
                    if (r.winner === null) return;
                    const gain = r.deltas[r.winner];
                    if (!best || gain > best.gain) best = { gain, winner: r.winner, round: r.round };
                  });
                  const bankruptcies = state.players.map((_, i) => {
                    for (const r of results) {
                      if (r.scoresAfter[i] < 0) return r.round;
                    }
                    return null;
                  });
                  const anyBroke = bankruptcies.some((b) => b !== null);
                  return (
                    <div style={S.statsView}>
                      <p style={S.statsSubtitle}>{L.playerStatsTitle}</p>
                      <div style={S.statsTable}>
                        <div style={S.statsTableHeaderRow}>
                          <span></span>
                          {state.players.map((_, i) => (
                            <span key={i} style={S.statsTableHeader}>{SL[i]}</span>
                          ))}
                        </div>
                        {[
                          [L.statWins, (s) => s.wins],
                          [L.statSmallHu, (s) => s.smallHu],
                          [L.statLargeHu, (s) => s.largeHu],
                          [L.statZimo, (s) => s.zimo],
                          [L.statSevenPairs, (s) => s.sevenPairs],
                          [L.statDianpao, (s) => s.dianpaos],
                          [L.statBiggestGain, (s) => s.biggestGain > 0 ? `+${s.biggestGain}` : "—"],
                          [L.statBiggestLoss, (s) => s.biggestLoss < 0 ? s.biggestLoss : "—"],
                        ].map(([label, accessor], rowIdx) => (
                          <div key={rowIdx} style={S.statsTableRow}>
                            <span style={S.statsTableRowLabel}>{label}</span>
                            {stats.map((s, i) => (
                              <span key={i} style={S.statsTableCell}>{accessor(s)}</span>
                            ))}
                          </div>
                        ))}
                      </div>

                      {best && (
                        <>
                          <p style={S.statsSubtitle}>{L.bestRoundLabel}</p>
                          <p style={S.bestRoundLine}>{L.bestRoundLine(SL[best.winner], best.gain, best.round)}</p>
                        </>
                      )}

                      <p style={S.statsSubtitle}>{L.bankruptcyTitle}</p>
                      {anyBroke ? (
                        <div style={S.bankruptcyList}>
                          {bankruptcies.map((r, i) => r !== null && (
                            <p key={i} style={S.bankruptcyLine}>{L.bankruptcyLine(SL[i], r)}</p>
                          ))}
                        </div>
                      ) : (
                        <p style={S.bankruptcyLine}>{L.noBankruptcy}</p>
                      )}

                      <p style={S.statsSubtitle}>{L.historyTitle}</p>
                      <div style={S.historyBox}>
                        {state.roundResults.map((r) => (
                          <div key={r.round} style={S.historyRow}>
                            <span style={S.historyRound}>R{r.round}</span>
                            {r.isDraw ? (
                              <span style={S.historyEntry}>{L.historyDraw}</span>
                            ) : (
                              <span style={S.historyEntry}>
                                <span style={S.historyName}>{SL[r.winner]}</span>
                                <span style={S.historyGain}> +{r.deltas[r.winner]}</span>
                                {" · "}
                                {r.type === "zimo"
                                  ? L.historyZimo
                                  : L.historyDianpao(SL[r.discarder])}
                                {" · "}
                                {r.largeHu ? L.largeHu : L.smallHu}
                                {r.sevenPairs ? ` · ${L.statSevenPairs}` : ""}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
            <div style={S.roundOverActions}>
              <button tabIndex={-1} style={S.startBtn} onClick={() => setShowMenu(true)}>{L.backMenu}</button>
            </div>
          </div>
        </div>
      )}
    </div>
    {showHelp && renderHelpOverlay()}
    {showStats && renderStatsOverlay()}
    {showSetup && renderSetupOverlay()}
    {showDaily && renderDailyOverlay()}
    {showAdmin && renderAdminOverlay()}
    {showNames && renderNamesOverlay()}
    {toastQueue.length > 0 && renderAchievementToast(toastQueue[0])}
    </>
  );
}


ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(React.StrictMode, null, React.createElement(MahjongGame))
);
