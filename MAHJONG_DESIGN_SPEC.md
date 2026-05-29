# Mahjong Improvements Design Spec

**Repository:** `FireboltQuill/mahjong`  
**Source roadmap:** `IMPROVEMENTS.md`  
**Document purpose:** Convert the improvement roadmap into a GitHub-ready implementation design spec with clear decisions, dependencies, state/storage contracts, edge cases, and acceptance criteria.

---

## 1. Executive summary

This design spec covers the planned feature set for the Mahjong web app:

1. Training mode / discard hints
2. Resume in-progress game
3. Lifetime statistics
4. Achievements
5. Daily challenge and deterministic seeded play
6. Tile animations
7. AI portraits and reactions
8. Sound effects and background music
9. Round replay

The main architectural direction is:

- Keep gameplay state deterministic after the seeded-RNG work lands.
- Keep UI effects such as animations, reactions, and audio outside replayable game logic.
- Persist structured user data with versioned `localStorage` payloads.
- Introduce pure engine step functions before building replay.
- Keep the current no-bundler, ordered `<script type="text/babel">` architecture, but make dependency order explicit.

This spec intentionally separates decisions from implementation notes. Any unresolved design choice should be recorded under **Open decisions** rather than mixed into feature prose.

### 1.1 Non-goals

The following are intentionally out of scope for this improvement pass:

- Multiplayer support.
- Backend or server-side persistence.
- User accounts or cloud sync.
- Online leaderboards for daily challenge.
- A bundler/module migration. The current ordered script-tag architecture remains in place.
- New Mahjong rulesets beyond the existing app rules.

---

## 2. Design principles

### 2.1 Determinism

After seeded play is introduced, any gameplay-affecting randomness must come from an explicit RNG argument. Gameplay code must not directly call `Math.random()` except where explicitly allowed.

Allowed exception:

- `gameId` generation may use `crypto.randomUUID()` or a random fallback because it is only an identifier. It does not affect gameplay, replay, AI decisions, shuffling, scoring, or daily challenge comparability.

### 2.2 UI effects are non-authoritative

Animations, AI reactions, sound effects, and replay playback controls are presentation concerns. They must not determine game outcomes and must not be required to reconstruct a round.

### 2.3 Versioned persistence

Every structured `localStorage` payload must include a schema version field:

```js
{ v: 1, ...payload }
```

Schema examples in this document show the JSON payload shape stored under a key. The actual implementation must still call `JSON.stringify` before writing and `JSON.parse` after reading because `localStorage` stores strings only.

Simple scalar keys, such as a single boolean persisted as a string, may remain unversioned.

On version mismatch, the default behaviour is to discard the old payload and start fresh unless a migration is both simple and clearly safer.

### 2.4 Single source of truth for state transitions

Replay and live play should share the same pure state-transition functions. React component handlers should become wrappers around pure engine functions, adding logs, animations, audio, reactions, and timers only after the deterministic transition is known.

### 2.5 Mobile and accessibility matter

Every new UI feature must be checked on a narrow viewport, especially around the existing bottom-aligned player hand. New modals, tabs, sliders, buttons, and replay controls must remain keyboard accessible.

---

## 3. Implementation phases

| Phase | Feature | Depends on | Primary files |
|---:|---|---|---|
| 0 | Shared persistence helpers | None | `js/storage.jsx`, `index.html` |
| 1 | Training mode / hints | Existing AI discard logic | `js/main.jsx`, `js/styles.jsx`, `js/lang.jsx` |
| 2 | Resume in progress | Phase 0 | `js/main.jsx`, `js/storage.jsx`, `js/lang.jsx` |
| 3 | Lifetime statistics | Phase 2 `gameId` | `js/lifetime.jsx`, `js/main.jsx`, `js/lang.jsx` |
| 4 | Achievements | Phases 1, 2, 3 | `js/achievements.jsx`, `js/main.jsx`, `js/styles.jsx`, `js/lang.jsx` |
| 5 | Seeded RNG / daily challenge | Phase 2 save schema awareness | `js/rng.jsx`, `js/tiles.jsx`, `js/ai.jsx`, `js/names.jsx`, `js/game-state.jsx`, `js/main.jsx`, `js/lang.jsx` |
| 6 | Tile animations | Deterministic tile IDs recommended | `js/main.jsx`, `js/styles.jsx` |
| 7 | AI portraits / reactions | Phase 6 cleanup pattern useful | `js/portraits.jsx`, `js/main.jsx`, `js/styles.jsx`, `js/lang.jsx` |
| 8 | Sound effects / music | Phase 2 resume logic | `js/audio.jsx`, `audio/*`, `js/main.jsx`, `js/lang.jsx` |
| 9a | Engine extraction | Phase 5 deterministic state | `js/engine.jsx`, `js/main.jsx` |
| 9b | Replay data and UI | Phase 9a | `js/replay.jsx`, `js/main.jsx`, `js/styles.jsx`, `js/lang.jsx` |

---

## 4. Shared storage helper

Before adding more persisted features, add a small helper module so each feature does not duplicate parse/version/error handling.

### 4.1 New file

`js/storage.jsx`

### 4.2 API

```js
function deepClone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function resolveFallback(fallbackOrFactory) {
  // Always deep-clone, even when the caller passed a factory.
  // Factories that return references to module-level constants
  // (e.g. `() => DEFAULT_LIFETIME_STATS`) would otherwise leak
  // the shared object — see §4.2 acceptance criteria.
  const value = typeof fallbackOrFactory === "function"
    ? fallbackOrFactory()
    : fallbackOrFactory;
  return deepClone(value);
}

function loadJson(key, expectedVersion, fallbackOrFactory) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return resolveFallback(fallbackOrFactory);
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== expectedVersion) {
      return resolveFallback(fallbackOrFactory);
    }
    return parsed;
  } catch {
    return resolveFallback(fallbackOrFactory);
  }
}

function saveJson(key, payload) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function removeStorageKey(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
```

Prefer passing a fallback factory for object/array defaults, for example `() => ({ ...DEFAULT_LIFETIME_STATS })`. `resolveFallback` deep-clones the result regardless, so a factory returning a shared reference is also safe — but writing the spread at the call site documents intent.

### 4.3 Acceptance criteria

- All new structured storage features use `loadJson` and `saveJson`.
- Version mismatch returns a fresh fallback without throwing.
- Corrupt JSON returns a fresh fallback without throwing.
- Storage write failure does not crash the app.
- Mutating a returned fallback object does not pollute future default loads.

---

## 5. Feature 1: Training mode / hints

### 5.1 Goal

Give the human player optional “best discard” guidance during their discard turn.

### 5.2 Decisions

- Training mode is off by default.
- The hint engine always uses expert discard logic, regardless of selected game difficulty.
- Hint selection persists until cleared, the player chooses a different tile, or the relevant discard flow completes.
- Training-mode games still count toward lifetime stats and most achievements.
- The `purist` achievement explicitly checks whether the hint button was used.

### 5.3 State and storage

Persist the menu setting:

```js
localStorage["mahjong_training_mode"] = "true" | "false"
```

Add to game state:

```js
state.hintUsedThisGame = false;
```

Important placement:

- `hintUsedThisGame` belongs on the match-level game info created by `createInitialState`.
- It must not be initialized by `initRound`, because `nextRound` calls `initRound({...prev, ...})` and the field must carry through unchanged across rounds.

The computed hint itself is not stored on state. It is derived on demand.

### 5.4 UI behaviour

Menu:

- Add a checkbox-style toggle labelled `Training Mode (hints on your turn)`.

In game:

Show a `Hint` button only when all of the following are true:

```js
trainingMode === true
isPlayerTurn === true
state.phase === "discard"
state.turnDrawn === true
```

On click:

- Compute the recommended discard index.
- Highlight the recommended tile with a gold glow.
- Show a small `↑ best` tag above the tile, not underneath it, to avoid clipping on short mobile viewports.
- Set `state.hintUsedThisGame = true` on first use.

### 5.5 Hint logic

Use the existing AI discard function:

```js
aiChooseDiscard(
  player.hand,
  player.openMelds,
  state.players,
  "expert",
  "generic",
  state.wall.length,
  PLAYER_IDX
)
```

No new AI heuristic is required for the first version.

### 5.6 Acceptance criteria

- Training mode defaults to off on a fresh browser profile.
- Training mode persists across refreshes.
- The hint button only appears during the player’s valid discard window.
- Clicking `Hint` highlights exactly one tile.
- Clicking `Hint` sets `state.hintUsedThisGame` once per match.
- Refreshing after using a hint preserves `hintUsedThisGame = true`.
- Advancing rounds does not reset `hintUsedThisGame`.
- A 360×640 viewport does not clip the hint tag.
- Selecting a different tile clears the hint highlight.

---

## 6. Feature 2: Resume in progress

### 6.1 Goal

A refresh, accidental tab close, or page backgrounding should not lose a game in progress.

### 6.2 Decisions

- Resume saves active games, including post-win / round-over states, until the finished game is acknowledged.
- Finished games are cleared once the user reaches or exits the game summary state.
- Saves are debounced during normal play but flushed synchronously on page lifecycle events.
- Admin-modified games are resumable.
- Admin-modified games are not replayable unless future replay support explicitly records admin actions.

### 6.3 Storage schema

Initial schema:

```js
localStorage["mahjong_in_progress"] = {
  v: 1,
  state: slimmedState,
  lang,
  difficulty,
  windRoundsSetting,
  trainingMode
}
```

After deterministic tile IDs ship, bump to:

```js
v: 2
```

The version bump is required because pre-deterministic saves may contain random base-36 tile IDs that do not match the new decimal-string tile ID invariant.

### 6.4 `gameId`

Introduce `state.gameId` in this feature.

Generation:

```js
function makeGameId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Non-secure-context fallback. Uses Math.random; gameId is an identifier
  // with no gameplay impact, so this is the one allowed exception to the
  // determinism rule (see §2.1).
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2).padEnd(8, "0");
  return `${t}-${r}`;
}
```

The `padEnd` is load-bearing: `Math.random().toString(36).slice(2)` can return a string shorter than 8 chars when the random draw is small. For example, `(0.5).toString(36) === "0.i"`, so `slice(2) === "i"`. Without padding, IDs occasionally collapse to a tail like `"i"` and stop looking like identifiers in logs. Once Feature 5 ships `randomUint32()`, the fallback may switch to `randomUint32().toString(36) + randomUint32().toString(36)` for a stronger source — either form is acceptable because `gameId` is identifier-only.

Rules:

- Created once per match in `createInitialState`.
- Persists across rounds.
- Not regenerated by `initRound`.
- Used later by lifetime stats, achievements, replay linkage, and resume-SFX suppression.

### 6.5 Slim saved state

Before writing the resume save:

- Keep only the last 50 human-readable log entries.
- Drop `tileAnims` completely.
- Drop `aiReactions` completely.
- Keep current-round `actionLog` once replay exists.
- Do not trim `actionLog`; replay clears it at round end after persisting finished-round replay data. The action log is naturally bounded by round length (typically < 60 actions ≈ ~5 KB), so it does not require slim-save trimming.

### 6.6 Save trigger

Recommended implementation:

Add a game-state revision counter:

```js
state.persistRev
```

The save effect can then depend on:

```js
[state.persistRev, showMenu, state.gameOverAcknowledged]
```

This is safer than manually listing coarse fields such as `phase`, `currentTurn`, `roundNumber`, and `scores`, because later replay/action-log changes could otherwise fail to trigger a save.

#### 6.6.1 Bump rules

The bump is co-located with the `setState` merge that produces the underlying change. Feature 9a's single-`setState` invariant (§13.5) requires all four of (step result + actionLog append + log append + persistRev increment) to land in the same merge — so adding the bump is a one-line change per step wrapper once those wrappers exist.

**Bump these mutations:**

| Source | Mutation | Bumps? |
|---|---|---:|
| `stepDraw` wrapper | hand/wall change | yes |
| `stepDiscard` wrapper | hand/discards/lastDiscard change | yes |
| `stepClaim` wrapper | meld formation, hand/discards change | yes |
| `stepDeclareHu` wrapper | win resolution | yes |
| `stepDeclareGang` wrapper | meld formation, replacement draw | yes |
| `stepResolvePass` wrapper / `stepPassClaim` | claim window closes, turn advances | yes |
| `nextRound` | round transition | yes |
| `applyAdmin` | full state replacement | yes |
| `gameOverAcknowledged` flip | terminal acknowledgement | yes |
| Restore from resume save | initial state load | reset to saved value (don't bump) |

**Do not bump these mutations:**

| Source | Mutation | Bumps? |
|---|---|---:|
| `tileAnims` push / cleanup (Feature 6) | animation only | no |
| `aiReactions` push / cleanup (Feature 7) | reaction only | no |
| `awaitingPlayerClaim` set/clear | UI prompt only — same underlying game state | no |
| `playerDeclinedClaims` append | UI prompt resolution — also re-derivable from claim flow | no |
| `selectedTile` change | hand-tile selection in UI | no |
| `lang` / `difficulty` setting changes | UI settings only | no |
| `showMenu` / `showHelp` / `showAdmin` / etc. toggles | modal visibility | no |
| Audio settings updates (Feature 8) | not part of `state` at all | no |

**Borderline cases — resolved:**

- `state.hintUsedThisGame` toggle (Feature 1) — **bump.** Match-scope flag that affects achievement outcome; needs to survive resume.
- `state.adminTouched` flag (set inside `applyAdmin`) — **bumped transitively** by the `applyAdmin` row above.
- `state.dailyGame` flag (Feature 5) — **bumped** at game-start when `createInitialState` returns; this is the initial-state load and the counter starts at 0 then bumps on the first user mutation.
- `state.dailyDate` field (Feature 5) — same as `dailyGame`: set inside `createInitialState`, counted as part of the initial-state load. It never changes after game start, so no further bumps are needed.

When in doubt, the question to ask is: "If the user refreshes after this mutation, do they expect to see the post-mutation state on restore?" If yes, bump.

#### 6.6.2 Phase ordering caveat

Feature 2 ships before Feature 9a per §3, but Feature 9a is what *makes* `persistRev` a one-line addition by funnelling state transitions through engine step wrappers. In Phase 2, before the wrappers exist, each existing gameplay-mutating `setState` callsite in `main.jsx` must be hand-edited to include `persistRev: prev.persistRev + 1`. Expect this to be sprawling. Phase 9a's wrapper migration consolidates those scattered bumps into the four-thing merge above; until then, treat the per-callsite bumps as scaffolding with a known follow-up.

### 6.7 Debounce and lifecycle flush

Normal play:

- Debounce writes with a 500ms trailing timeout.
- Clear pending timeout on unmount and on clear triggers.

Lifecycle events:

Register handlers for:

- `beforeunload`
- `pagehide`
- `visibilitychange` when `document.hidden === true`

Each handler calls `flushSave()` **unconditionally** — not gated on `saveTimerRef.current` being non-null. `flushSave()` itself decides whether a save is still valid.

**Why unconditional matters.** Consider the sequence: user discards → debounce timer fires → save written → 600ms passes → user closes tab. With a gated flush (`if (saveTimerRef.current) flushSave()`), the close-event handler no-ops because the timer already fired and was cleared. Any `setState` between the timer fire and the close (e.g. an auto-play AI move that happened during those 600ms) would be lost. The unconditional form pays a redundant write in the common case (cheap — `localStorage.setItem` of an already-current state is ~microseconds) but guarantees the close-event always captures the latest state.

`flushSave()` must:

- Read the latest state from `stateRef.current`.
- Clear any pending debounce timer so it can't later overwrite a more recent flush.
- Call `shouldPersistResume(state, showMenu)` before writing.
- If the state is resumable, write synchronously to `localStorage`.
- If the state is no longer resumable, remove `mahjong_in_progress` instead of writing a stale snapshot.
- Respect a `resumeClearedRef` or equivalent guard so lifecycle events cannot resurrect a save that was intentionally cleared after game completion or a fresh-game start.

`shouldPersistResume` is the predicate that decides whether the current state is worth saving:

```js
function shouldPersistResume(state, showMenu) {
  if (resumeClearedRef.current) return false;       // intentional clear; do not resurrect
  if (state.gameOverAcknowledged) return false;     // game finished and acknowledged
  if (!state.gameId) return false;                  // no game in progress
  return true;                                      // mid-game or post-win pre-ack
}
```

`showMenu` is passed for future extensibility (e.g. if "user on the main menu without a game" needs a different policy) but the current rules don't read it. The post-win pre-ack window must return true so a refresh on the round-over modal restores to the resolved state (§6.10 acceptance criterion).

**`stateRef` must be updated in its own ungated effect**, not inside the debounced save effect:

```js
useEffect(() => { stateRef.current = state; });           // runs every render
useEffect(() => { /* debounced save uses stateRef */ },   // runs on persist triggers
         [state.persistRev, showMenu, state.gameOverAcknowledged]);
```

If `stateRef.current = state` is assigned inside the debounced save callback, the ref lags by up to 500ms — and the close-event handler then reads a stale state, defeating the whole point of unconditional flush. The first effect has no dependency array on purpose: it must run every render so the ref is always current.

Do not use `unload`. It's deprecated and unreliable on mobile.

### 6.8 Clear triggers

Remove `mahjong_in_progress` when:

- `gameOverAcknowledged` flips to true.
- User chooses Back to Menu from the game-over screen.
- User starts a fresh game from any menu path.
- Save read fails.
- Save schema version mismatches.

Also clear related side-channel storage such as `mahjong_last_announced` once audio ships.

### 6.9 UI

On menu mount:

- If a valid save exists, show `Resume Game` as the primary action.
- Keep `Start Game` as a secondary action.

If the user changes language, difficulty, wind rounds, or training mode while a valid resume save exists:

- Warn that resume will use the saved game settings.
- Starting a new game discards the old resume save.

### 6.10 Acceptance criteria

- Refreshing mid-round restores the game state.
- Refreshing on the round-over modal restores to the resolved round-over state.
- Refreshing after game summary acknowledgement does not offer resume.
- Corrupt save data is discarded without crashing.
- Version-mismatched save data is discarded without crashing.
- Closing the tab shortly after a move loses at most one tile action.
- iOS-style backgrounding is handled as well as practical through `pagehide` and `visibilitychange`.
- Animation and reaction state never reappears after resume.
- Lifecycle events after a clear trigger do not recreate `mahjong_in_progress`.

---

## 7. Feature 3: Lifetime statistics

### 7.1 Goal

Persist long-term player statistics across games.

### 7.2 Storage schema

```js
localStorage["mahjong_lifetime_stats"] = {
  v: 1,
  lifetimeUpdatedFor,
  gamesPlayed,
  gamesWon,
  roundsPlayed,
  roundsWon,
  roundsDianpaoGiven,
  smallHu,
  largeHu,
  zimoHu,
  sevenPairsHu,
  biggestSingleGain,
  biggestSingleLoss,
  bestEndingBalance,
  worstEndingBalance,
  currentWinStreak,
  longestWinStreak,
  totalScoreNet
}
```

`lifetimeUpdatedFor` stores the most recent `gameId` already folded into lifetime stats.

**Defaults.** `DEFAULT_LIFETIME_STATS` zeros every counter except the four extremum fields and `lifetimeUpdatedFor`, which start as `null`:

- `biggestSingleGain: null` — first observed gain replaces null; subsequent updates take `Math.max`.
- `biggestSingleLoss: null` — first observed loss replaces null; subsequent updates take `Math.min` (losses are negative).
- `bestEndingBalance: null` — first finished game's ending balance replaces null; subsequent updates take `Math.max`.
- `worstEndingBalance: null` — first finished game's ending balance replaces null; subsequent updates take `Math.min`.
- `lifetimeUpdatedFor: null`.

`null` is preferred over `0` so the UI can render "—" before any game is played without a sentinel-value check. `mergeLifetime` must short-circuit the `Math.min`/`Math.max` calls when the prior value is `null`. Without this, the UI shows "Best balance: 0" before any game completes — falsely informative.

### 7.3 Counter semantics

Human-only counters:

- `gamesPlayed`: increments at game over.
- `gamesWon`: human final score equals the highest final score. Shared first place counts as a win.
- `roundsPlayed`: increments per completed round.
- `roundsWon`: increments when the human wins a round by Hu.
- `roundsDianpaoGiven`: increments when the human discards the winning tile.
- `smallHu` and `largeHu`: mutually exclusive win-type counters; together they equal `roundsWon`.
- `zimoHu` and `sevenPairsHu`: independent counters that may overlap with `smallHu` or `largeHu`.
- `biggestSingleGain`: largest single completed-round human score increase.
- `biggestSingleLoss`: largest single completed-round human score decrease.
- `bestEndingBalance`: highest human final score at game end.
- `worstEndingBalance`: lowest human final score at game end.
- `currentWinStreak` / `longestWinStreak`: consecutive games where the human has the highest final score, including shared first.
- `totalScoreNet`: sum of `finalScore - startingScore` across all games.

### 7.4 Helper module

New file: `js/lifetime.jsx`

API:

```js
const DEFAULT_LIFETIME_STATS = { ... };

function loadLifetime() { ... }
function mergeLifetime(prev, delta) { ... }
function saveLifetime(next) { ... }
```

The game-over effect should use these helpers rather than inlining `localStorage` calls.

### 7.5 Update trigger

When `gameOverAcknowledged` flips to true, the game-over effect must run the following steps **synchronously and in order** before the resume save is cleared (§6.8):

1. Load current lifetime stats.
2. If `lifetimeUpdatedFor === state.gameId`, no-op (and skip to step 6).
3. Compute delta from the just-finished game.
4. Merge and save (`saveLifetime(nextLifetime)`).
5. Set `lifetimeUpdatedFor` to `state.gameId` in the saved payload.
6. Run `checkAchievements(...)` (see §8.7).
7. Only after the above succeed, call `removeStorageKey("mahjong_in_progress")` and clear the audio side-channel.

If steps 4 and 7 were reversed (or ran from independent effects with no enforced order), a crash between resume-clear and lifetime-save would lose the just-finished game's delta entirely — the resume save no longer exists to retry from, and `lifetimeUpdatedFor` was never bumped. Single-effect ordering is therefore load-bearing, not stylistic.

### 7.6 UI

Add a `Stats` button on the menu.

Stats modal tabs or sections:

- Games
- Wins
- Records
- Streaks
- Achievements, once Feature 4 ships

Include a `Reset stats` action with confirmation.

Decision:

- Resetting lifetime stats does not reset achievements. Achievements have a separate reset action if one is added later.

### 7.7 Acceptance criteria

- Stats survive refresh and new sessions.
- Stats update once per finished game, not once per render.
- Shared first place counts as `gamesWon`.
- `smallHu + largeHu === roundsWon`.
- `zimoHu` and `sevenPairsHu` can cause total Hu-type counters to exceed `roundsWon`.
- Reset stats requires confirmation and restores the default zeroed shape.
- Resetting stats does not remove unlocked achievements.

---

## 8. Feature 4: Achievements

### 8.1 Goal

Add unlockable badges that reward long-term play and notable game events.

### 8.2 Dependencies

- Feature 1 for `hintUsedThisGame`.
- Feature 2 for `gameId`.
- Feature 3 for post-game lifetime stats.
- Feature 5 for `dailyGame` and daily-only achievements.

### 8.3 Storage schema

```js
localStorage["mahjong_achievements"] = {
  v: 1,
  unlocked: {
    [achievementId]: ISO_DATE
  }
}
```

### 8.4 Definition shape

Use an explicit trigger and mode rather than overloading `scope`:

```js
{
  id,
  nameKey,
  descriptionKey,
  trigger: "round" | "game",
  mode: "any" | "normal" | "daily",
  predicate(ctx)
}
```

`mode` resolves the daily-achievement ambiguity cleanly:

- `any`: normal or daily games.
- `normal`: non-daily games only.
- `daily`: daily games only.

Predicate context:

```js
{
  state,
  lifetime,
  latestRoundResult,
  roundResults,
  dailyResults,
  roundStats
}
```

`roundStats` should contain any per-round facts that are hard to infer safely after the fact:

```js
{
  humanClaimedDiscardThisRound,
  wallCountAtWin,
  scoresAfterRound,
  humanWasLowestOrTiedLowestAfterRound
}
```

Do not rely only on visible meld state for `no_claim_win`; record whether the human actually claimed a discard during the round.

### 8.5 Seed achievement list

Normal / any:

- `first_hu`: first Hu.
- `first_large_hu`: first Large Hu.
- `first_seven_pairs`: first Seven Pairs win.
- `first_zimo`: first Zimo.
- `wins_10`: ten games won.
- `wins_50`: fifty games won.
- `no_claim_win`: win a round without claiming discards.
- `bankrupt_table`: end a game with all three AIs at negative scores. The human's final score does not need to be positive — bankrupting the AI seats is what counts.
- `last_tile`: Hu on the last wall tile. Defined as `roundStats.wallCountAtWin === 0`, where `wallCountAtWin` is sampled *immediately after the winning tile leaves the wall* for zimo, and *at the moment the claim resolves* for Hu by claim. For Hu by claim, `wallCountAtWin === 0` therefore means "no tiles remained in the wall when this player called Hu on the discard".
- `comeback_kid`: win a game after being tied-for-lowest or lowest for at least `Math.ceil(state.totalRounds / 2)` rounds.
- `streak_5`: win five games in a row.
- `purist`: win a non-daily game without using the hint button.

Daily-only:

- `daily_win_1`: win one daily challenge.
- `daily_win_streak_7`: win seven daily challenges in a row.

### 8.6 Important predicates

`comeback_kid`:

- Lowest means `playerScore === Math.min(...scoresAfter)`.
- Tied-for-lowest counts.
- Game win means human final score equals the maximum final score.
- Shared first counts as a win.

`purist` is registered with `mode: "normal"`, so the achievement framework already filters out daily games before the predicate is called. The predicate itself is then minimal:

```js
humanWon && state.hintUsedThisGame === false
```

Do **not** add a `state.dailyGame !== true` clause to the predicate. The daily exclusion lives in `mode: "normal"`, not in the predicate. Duplicating it would signal that the framework's mode handling isn't load-bearing — which is the whole point of having a `mode` field. Every future achievement would then belt-and-braces the same way, and the mode field would decay into documentation.

### 8.7 Update order with lifetime stats

Do not rely on React effect declaration order.

Use one combined game-over effect:

1. `prevLifetime = loadLifetime()`
2. Compute game delta.
3. `nextLifetime = mergeLifetime(prevLifetime, delta)`
4. `saveLifetime(nextLifetime)`
5. `checkAchievements({ state, lifetime: nextLifetime, ... })`

This prevents achievements such as `wins_50` and `streak_5` from unlocking one game late.

### 8.8 UI

Stats modal gains an Achievements tab.

Badge grid:

- Locked badges are dimmed and show limited text.
- Unlocked badges show name, description, and unlock date.

Toast notifications:

- Newly unlocked achievements enqueue `{ id, name }`.
- Display one toast at a time for around 2.5 seconds.
- Multiple simultaneous unlocks display sequentially.
- Toasts render above all modals via a dedicated `Z_TOAST` z-index constant.

### 8.9 Acceptance criteria

- Achievements persist across sessions.
- Already unlocked achievements do not re-toast on reload.
- Achievements unlocked in the same game as a lifetime-stat milestone use post-merge stats.
- Toasts appear above the Game Summary modal.
- `purist` does not unlock from daily challenge wins.
- Achievement names and descriptions are localised in English and Chinese.

---

## 9. Feature 5: Seeded RNG and daily challenge

### 9.1 Goal

Create deterministic seeded games so daily challenge players receive the same wall sequence for the same UTC date, while replay can later reconstruct rounds from seeds and action logs.

### 9.2 New RNG module

New file: `js/rng.jsx`

API:

```js
function seededRng(seed) {
  // Mulberry32, seed coerced with >>> 0
}

const defaultRng = {
  next() { return Math.random(); },
  nextInt(n) { return Math.floor(Math.random() * n); },
  pick(arr) { return arr[this.nextInt(arr.length)]; }
};

function randomUint32() {
  if (globalThis.crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    globalThis.crypto.getRandomValues(arr);
    return arr[0] >>> 0;
  }
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}
```

### 9.3 Shuffle policy

`rng.jsx` should not own shuffling.

Keep shuffle in `tiles.jsx`:

```js
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
```

All gameplay-affecting reorders must use explicit RNG input.

#### 9.3.1 Existing `Math.random` call sites (audit checklist)

Exhaustive inventory at time of writing — every one of these must be addressed during Feature 5 implementation. Line numbers verified against the current working tree.

| File | Line | Purpose | Fix |
|---|---:|---|---|
| `js/tiles.jsx` | 47 | `createTile` id (`Math.random().toString(36).substr(2, 9)`) | Replace with caller-supplied deterministic id (see §9.4). |
| `js/tiles.jsx` | 108 | `shuffle` swap | Thread `rng` argument as in §9.3. |
| `js/names.jsx` | 62 | `pickN` Fisher-Yates partial shuffle | Thread `rng` argument; signature becomes `pickN(pool, count, rng)`. |
| `js/names.jsx` | 76 | `pickPlayerNames` group pick | Thread `rng` argument; signature becomes `pickPlayerNames(groups, count, rng)`. |
| `js/ai.jsx` | 476 | `assignPersonalities` biased sort | See §9.3.2 — fix the biased-sort bug at the same time. |

Confirmed by inspection: `aiChooseDiscard` and `aiDecideClaim` in `ai.jsx` contain **no** `Math.random` calls. No change needed in those functions.

#### 9.3.2 Fix the biased sort in `assignPersonalities`

The current implementation at `ai.jsx:476` is:

```js
const shuffled = [...PERSONALITY_POOL].sort(() => Math.random() - 0.5);
```

This has **two independent bugs**:

1. **Non-deterministic.** Reads `Math.random` — breaks daily-wall and replay invariants once they exist.
2. **Non-uniform.** `Array.prototype.sort` with a non-deterministic comparator violates the sort contract and produces a biased permutation distribution. V8 in particular skews heavily — some personality assignments are systematically more likely than others. This is a real bug independent of determinism.

Fix both at once by using a proper Fisher-Yates shuffle with threaded RNG:

```js
function assignPersonalities(rng) {
  const arr = [...PERSONALITY_POOL];
  shuffle(arr, rng);  // proper Fisher-Yates from tiles.jsx, threaded rng
  return [null, arr[0], arr[1], arr[2]];  // seat 0 is human
}
```

Call site is `createInitialState` (`game-state.jsx:9`) — thread `cosmeticRng` per §9.6, except in daily mode where personalities come from a fixed pool (see §9.7).

### 9.4 Deterministic tile IDs

Change tile creation from random IDs to caller-supplied deterministic IDs.

New signatures:

```js
createTile(suit, rank, honor, id)
createDeck()
```

`createDeck()` creates IDs as decimal strings:

```js
"0" ... "135"
```

Rules:

- IDs remain strings to preserve existing equality/filter assumptions.
- The deck counter is local to `createDeck`.
- No `state.tileIdCounter` is needed for normal play.
- Admin-created tiles use IDs starting at `max(existingNumericId + 1, 1000)`.
- Admin tile ID allocation is local to each `applyAdmin` invocation and seeded by the current board state.

**Admin tile-ID reuse — acknowledged limitation.** The collision-floor scan only considers tiles currently present on the board. If an admin pass removes a tile, its numeric ID is released — a later admin pass scanning the board may mint a fresh tile with the same numeric ID, and the FLIP ref map (§10.5) keyed on `tile.id` may still hold a stale slot for the removed tile. The result is animation glitches during admin sessions where two distinct tile entities briefly share a ref slot.

This is left as an acknowledged non-bug rather than fixed because:

1. Admin-touched matches are excluded from replay (§6.2), so determinism isn't impacted.
2. Tracking `state.usedAdminIds` at match scope to avoid reuse adds state for a cosmetic concern.
3. Admin tooling exists for debugging, not gameplay polish.

If admin tile animations ever become visibly wrong in practice, the fix is to maintain `state.usedAdminIds = []` and compute the floor as `max(scannedMax + 1, 1000, max(state.usedAdminIds) + 1)`, appending newly minted IDs before returning from `applyAdmin`.

### 9.5 Seed model

Match-level seed:

```js
state.matchSeed
```

Round-level seeds:

```js
state.roundSeeds = {
  [roundNumber]: roundSeed
}
```

Round seed helper:

```js
function seedForRound(matchSeed, roundNumber) {
  // Two-stage mix: XOR a well-spread per-round constant into the match seed,
  // then run one xorshift step. The single-Math.imul form
  // (matchSeed ^ roundNumber) is too close to identity for small roundNumber:
  // adjacent match seeds map to adjacent round seeds, which Mulberry32
  // tolerates but is avoidable.
  let h = (matchSeed ^ Math.imul(roundNumber + 1, 0x85EBCA6B)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0xC2B2AE35) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h >>> 0;
}
```

### 9.6 Initial-state order

`createInitialState(windRounds = 1, lang = "en", seed, { dailyDate } = {})` must run in this order. The new signature accepts a `dailyDate` to branch personality assignment for daily mode.

1. Determine `matchSeed = (seed ?? randomUint32()) >>> 0`.
2. Build `cosmeticRng = seededRng((matchSeed ^ 0x9E3779B9) >>> 0)`.
3. Assign personalities and player names. **Branches on daily mode:**
   - *Normal mode:*
     ```js
     const personalities = assignPersonalities(cosmeticRng);
     const { groupName, names } = pickPlayerNames(loadNameGroups(), 4, cosmeticRng);
     ```
   - *Daily mode (`dailyDate` present):*
     ```js
     const personalities = assignPersonalities(cosmeticRng); // pool is the fixed PERSONALITY_POOL
     const { groupName, names } = pickPlayerNames(DAILY_NAME_GROUPS, 4, cosmeticRng);
     ```
     `DAILY_NAME_GROUPS` is a fixed module-level constant in `names.jsx`, not loaded from `loadNameGroups()`. This is what makes daily mode's AI seating identical across users with different local custom groups.
4. Assemble match-level `gameInfo` including `matchSeed`, `gameId`, `hintUsedThisGame: false`, `dailyGame: !!dailyDate`, `dailyDate` (or `null`).
5. Compute `roundSeed = seedForRound(matchSeed, 1)`.
6. Call `initRound(gameInfo, lang, roundSeed)`, which returns `actionLog: []` and `roundStartInfo: {...}` (see §14.2).

The new helper signatures referenced above:

```js
assignPersonalities(rng)             // was: assignPersonalities()
pickPlayerNames(groups, count, rng)  // was: pickPlayerNames(groups, count)
pickN(pool, count, rng)              // was: pickN(pool, count)
```

Each one calls `rng.nextInt(...)` / `rng.next()` instead of `Math.random()`. Threading the RNG as an explicit argument (not a module global) keeps these helpers callable from replay/test contexts.

### 9.7 Split deck RNG from cosmetic RNG

Daily challenge must produce the same wall regardless of each user’s local custom name groups.

Therefore:

- `deckRng` is derived from `roundSeed` and only shuffles the deck.
- `cosmeticRng` is derived from `matchSeed ^ constant` and is allowed to vary based on local name/personality consumption.

Daily challenge determinism applies to both wall order and AI gameplay decisions. Custom local name groups may affect display names only. They must not change AI strategy, AI personality, discard logic, claim logic, or any other gameplay-affecting decision in daily mode.

The §9.6 daily branch is what makes this true: daily mode draws personalities and names from a fixed `PERSONALITY_POOL` and `DAILY_NAME_GROUPS`, not from `loadNameGroups()`. Both `cosmeticRng` and `deckRng` are then seeded entirely from `matchSeed` (which in daily mode is `seedFromDate(dailyDate)`), so two users on the same UTC date receive the same wall *and* the same AI personalities regardless of how each user has customised their local name groups.

### 9.8 Daily seed

Daily date key:

```js
new Date().toISOString().slice(0, 10)
```

This is UTC by design.

Seed hash:

```js
function seedFromDate(str) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
```

The UI should clearly show that the daily challenge is UTC-based and should show the next reset time in the user’s local time.

**Capture point.** The date string is captured exactly once, when `createInitialState` is called for a daily game, and stored on state:

```js
state.dailyDate = "YYYY-MM-DD"  // UTC, frozen at game-start
```

All subsequent reads — the seed derivation, the result-storage key in `mahjong_daily.results`, the in-game "today's daily" label, the already-played check on game-over — must read `state.dailyDate`, not recompute `new Date().toISOString().slice(0, 10)`.

This prevents a midnight-UTC flip mid-game from re-keying an in-progress daily as the next day's. A player starting at 23:55 UTC therefore continues playing "today's" daily after the UTC rollover — by intent. The menu's "today's daily" affordance, however, *does* recompute the current UTC date each render so the menu reflects the current day's challenge after rollover.

### 9.9 Daily challenge settings

Daily challenge uses fixed settings so results are comparable:

- Difficulty: `expert`.
- Wind rounds: `1`.
- Training mode: forced off.
- Admin tools: disabled.
- Replay/spectate/non-recording replays do not create or overwrite the recorded daily result.

### 9.10 Daily result storage

```js
localStorage["mahjong_daily"] = {
  v: 1,
  rulesVersion: 1,
  results: {
    [YYYY_MM_DD_UTC]: {
      played: true,
      recorded: true,
      completedAt,
      won,
      finalScore,
      rank,
      matchSeed
    }
  }
}
```

`won` is stored explicitly rather than inferred from `rank` so daily streak calculations remain stable if ranking or tie rules change later.

**Field meanings:**

- `played: true` — there is a result recorded for this date. (The slot only exists when `played === true`; the field is therefore effectively a sentinel and could be omitted, but is kept for explicit readability when inspecting localStorage.)
- `recorded: true` — this entry was written by the first qualifying play. **`recorded: false` is never written** (non-recording plays don't touch `results[date]` at all); the field exists in the schema only so payload readers can assume its presence and so future "I attempted today's daily but quit" placeholder logic has a slot to occupy without a schema bump.
- `rulesVersion: 1` — daily ranking / tie / scoring rules version. `v` bumps when the payload shape changes; `rulesVersion` bumps when scoring or tie-breaking rules change such that old `rank` and `finalScore` values are no longer comparable across versions. Streak calculations should treat results with `rulesVersion < current` as "played" but not contribute to the streak `won` count.

If already played today:

- Show previous result.
- Allow `Play again`, but mark it as non-recording.
- Non-recording plays do not update `results[dateKeyUtc]`, daily achievements, or daily streak counters.

#### 9.10.1 Daily streak predicate

`daily_win_streak_7` and the underlying daily streak counter use this rule:

```js
function dailyWinStreakAsOf(results, today /* "YYYY-MM-DD" UTC */) {
  let streak = 0;
  let cursor = today;
  while (true) {
    const entry = results[cursor];
    if (!entry || !entry.played) break;
    if (entry.rulesVersion !== CURRENT_RULES_VERSION) break;
    if (!entry.won) break;
    streak += 1;
    cursor = utcDateMinusOneDay(cursor);
  }
  return streak;
}
```

Key rules:

- A streak is **consecutive UTC dates** ending at `today`. Skipping a day (no `results[date]` entry) breaks the streak — not because the missing day is a loss but because dailies are date-anchored. The user must play every day to keep the streak alive.
- A loss (`won === false`) breaks the streak.
- A `rulesVersion` mismatch breaks the streak; old wins do not count toward streaks under new rules.
- `daily_win_streak_7` unlocks when `dailyWinStreakAsOf(results, state.dailyDate) >= 7`, evaluated after that day's result is written.

### 9.11 Resume save migration

When deterministic tile IDs ship, bump `mahjong_in_progress.v` from `1` to `2`.

Old saves should be discarded rather than migrated.

### 9.12 Acceptance criteria

- Same UTC date produces the same initial wall across browsers and users.
- Custom local player names do not affect wall order or AI gameplay decisions.
- Daily challenge uses the fixed settings listed in section 9.9.
- Daily challenge disables training mode.
- Daily results are keyed by UTC date.
- A daily replay/non-recording play does not overwrite the first recorded result.
- UI explains UTC reset timing.
- No gameplay-affecting code path introduced in this phase uses direct `Math.random()`.
- Admin-created tiles cannot collide with existing deck or previous admin-created tile IDs.

---

## 10. Feature 6: Tile animations

### 10.1 Goal

Make draws, discards, claims, and wins feel kinetic without adding a library or bundler.

### 10.2 State

```js
state.tileAnims = {
  [tileId]: {
    kind,
    startedAt,
    ttl,
    gen,
    dx,
    dy
  }
}
```

Use a plain object, not `Map`, to match immutable state updates.

`gen` comes from a component-level monotonic `animGenRef`.

### 10.3 Collision policy

Latest animation wins per tile ID.

When overwriting an animation for a tile:

1. Clear the old timer if present.
2. Write the new entry with a new generation number.
3. Schedule a cleanup timer.
4. Timer deletes only if the current entry still has the captured generation.

This prevents stale draw timers from deleting newer discard animations.

### 10.4 Animation kinds

Each kind has a fixed `ttl` (in milliseconds, written into `state.tileAnims[id].ttl`) and a recommended CSS easing. Keep timings short so animations don't gate AI auto-play (600ms `setTimeout` in main.jsx:140).

| Kind | TTL | Easing | DOM measurement? | Notes |
|---|---:|---|---|---|
| `draw` | 240ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` | no | Generic slide-in from the wall edge — the tile element fades in with a brief Y translate. No FLIP read. |
| `discard` | 280ms | `cubic-bezier(0.4, 0, 0.2, 1)` | **yes** (FLIP) | Read hand-tile rect before setState, read discard-pool rect after setState, apply inverse transform, animate to zero. |
| `claim-pop` | 320ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot) | no | Scale 0.8 → 1.1 → 1.0 with gold flash overlay on the new meld tiles. |
| `win-shimmer` | 1400ms | `linear` | no | Diagonal gold-gradient sweep across the winning hand container; runs as a CSS keyframe on the wrapper, not per-tile. |

**Timing budget against AI auto-play:** the AI's 600ms `setTimeout` between actions (main.jsx:140) means animations must complete or be near-complete before the next AI move triggers. The combined draw + discard cycle (240 + 280 = 520ms) fits inside that budget. `claim-pop` is 320ms — well within budget. `win-shimmer` (1400ms) only runs at round end, when no AI auto-play is scheduled.

If `prefers-reduced-motion: reduce` is active (§10.7), no animations are pushed and the AI timer effectively becomes the only pacing source.

### 10.5 FLIP discard requirements

Maintain a callback-ref map:

```js
const tileRefsRef = useRef(new Map());
```

Each tile render uses:

```jsx
ref={(el) => el
  ? tileRefsRef.current.set(tile.id, el)
  : tileRefsRef.current.delete(tile.id)}
```

Precondition audit (perform before any FLIP code lands). The current codebase predates deterministic IDs and uses index keys in most tile-render sites. Concrete fix list, verified against `main.jsx`:

| Site | Line | Current key | Required key |
|---|---:|---|---|
| Player hand tile button | 1343 | `key={t.id}` | already correct ✓ |
| Discard pool — seat 0 (you) | 1235 | `key={i}` | `key={t.id}` |
| Discard pool — seat 1 (south) | 1225 | `key={i}` | `key={t.id}` |
| Discard pool — seat 2 (west) | 1205 | `key={i}` | `key={t.id}` |
| Discard pool — seat 3 (north) | 1215 | `key={i}` | `key={t.id}` |
| Player open meld group | 1323 | `key={mi}` | `key={m.tiles[0].id}` (or a stable meld id) |
| Player open meld tile | 1326 | `key={ti}` | `key={t.id}` |
| Opponent open meld group | 721 | `key={mi}` | same as player meld |
| Opponent open meld tile | 723 | `key={ti}` | `key={t.id}` |
| Round-over winning tile (standard) | 1437, 1447, 1453 | `key={ti}` | `key={t.id}` |
| Round-over winning tile (seven pairs) | 1437 | `key={ti}` | `key={t.id}` |
| Log entries | 1369 | `key={i}` | OK to keep — append-only, not animated |

Open meld groups need a stable meld-level key because tiles within the meld are immutable (the meld is formed once), so keying on `m.tiles[0].id` is sufficient. Index keys cause React to reuse DOM nodes across meld additions, which would attach stale FLIP refs to newly-formed melds.

### 10.6 Cleanup

- Timers stored in `animTimersRef`.
- Timers cleared on unmount, reset, and round transition.
- Add a low-frequency interval sweep as backup.
- Sweep must use functional `setState(prev => ...)`.

### 10.7 Reduced motion

Respect `prefers-reduced-motion: reduce`.

When reduced motion is active:

- Skip pushing animation state entirely.
- Do not schedule timers.

### 10.8 Acceptance criteria

- Draw, discard, claim, and win animations are visible in normal mode.
- Reduced-motion users do not receive animation state or timers.
- Immediate draw-then-discard does not prematurely delete the discard animation.
- Round transition clears pending animation timers.
- Tile refs do not grow unbounded across rounds.
- All tile render sites use stable tile ID keys.

---

## 11. Feature 7: AI portraits and reactions

### 11.1 Goal

Make AI seats feel more like characters while keeping image support optional.

### 11.2 Data

Name groups may evolve from strings to objects:

```js
{ name: "Manon", portrait: "url-or-dataurl" }
```

Backward compatibility:

- Bare strings remain valid.

New file:

```js
js/portraits.jsx
```

API:

```js
function getPortrait(seatIdx, name) { ... }
```

Default rendering uses initials chips with seat-scoped colour derivation.

### 11.3 Reaction state

```js
state.aiReactions = {
  [seatIdx]: {
    line,
    kind,
    expiresAt,
    gen
  }
}
```

Use the same latest-wins and generation-stamped cleanup pattern as tile animations.

### 11.4 Reaction triggers

- AI wins by Hu: reaction on that AI.
- AI deals the winning discard: reaction on that AI.
- AI suffers a big round loss: reaction on that AI.
- AI score crosses from non-negative to negative: bankrupt reaction.
- AI comeback: was lowest in previous standings and is now leading.

Big-loss threshold:

- Start with losses worse than `-80`.
- Recalibrate after play data if it fires too often or too rarely.

#### 11.4.1 Reaction line seed content

Each reaction kind has a small pool of lines per language. The wrapper picks one using the `cosmeticRng` (§9.7) — keeping daily challenges deterministic in dialogue too — and writes it into `state.aiReactions[seat].line`. Lines should be short enough to fit in the reaction bubble at 360px viewport (≈ 20 chars EN, 12 chars ZH).

```js
const REACTION_LINES = {
  hu_win:        { en: ["Hu!", "Got it!", "That's mine!", "Yes!"],                zh: ["胡了！", "我胡！", "中了！", "好！"] },
  hu_lose:       { en: ["Not again...", "Tough break.", "Ugh.", "I had it."],     zh: ["又这样…", "亏了…", "唉…", "差一点。"] },
  dealt_winner:  { en: ["Sorry!", "My bad.", "Take it.", "That was reckless."],   zh: ["抱歉！", "失误了。", "拿去吧。", "失算。"] },
  big_loss:      { en: ["Painful.", "That hurts.", "Costly turn.", "Bleeding."],  zh: ["心痛。", "好痛。", "太亏。", "失血。"] },
  bankrupt:      { en: ["Out of chips.", "Broke...", "Down and out.", "Empty."],  zh: ["破产了。", "没了…", "完了。", "空了。"] },
  comeback:      { en: ["Back on top!", "Climbing back.", "Watch out!", "Here we go!"], zh: ["回来了！", "翻身！", "小心点！", "走起！"] },
};
```

The pool sizes are intentionally small (4 each) so daily challenges don't surface a wildly different line on each replay; bigger pools dilute the determinism feel even if technically deterministic.

**Selection rule:** at game start, the wrapper picks one *seed line index* per reaction kind per AI seat via `cosmeticRng` and stores it on `state.aiReactions._seeds[seat][kind]`. Reactions then index into the pool with that frozen seed, so the same AI always says the same thing on its first hu of a given game. (Future variation can rotate through the pool by incrementing the seed per fire — out of scope for v1.)

### 11.5 UI

- Add avatar / initials chip to opponent strip header.
- Reaction bubble appears near the AI strip for about 3 seconds.
- Latest reaction replaces previous reaction for the same AI.
- Add a menu toggle to disable AI reactions.

### 11.6 Acceptance criteria

- Existing string-based name groups still work.
- AI avatars render without image assets.
- Reactions expire reliably.
- Newer reactions are not removed by stale timers.
- Reaction bubbles can be disabled.
- Replay does not re-fire AI reaction bubbles.

---

## 12. Feature 8: Sound effects and music

### 12.1 Goal

Add optional audio cues for game events and optional low-volume background music.

### 12.2 Assets

Directory:

```text
audio/
```

Suggested assets:

- `draw.mp3`
- `discard.mp3`
- `peng.mp3`
- `chi.mp3`
- `gang.mp3`
- `hu_win.mp3`
- `hu_lose.mp3`
- `dianpao.mp3`
- `round_over.mp3`
- `tile_select.mp3` (optional — only wired if the §12.5 "Optional tile select" trigger is enabled)
- `bgm_loop.mp3` (optional — ship after SFX if size budget is tight per §12.2 below)

Use CC0 or generated assets.

Size target:

- SFX only: around 200–400KB.
- SFX + BGM: ideally under 900KB.
- If size becomes a problem, ship SFX first and defer BGM.

**Codec strategy.** Ship MP3 only — Safari, Chrome, Firefox, and Edge all support MP3 natively in `<audio>` since ≈ 2017. Do not ship a second OGG copy: it doubles the asset bundle for zero practical benefit (the only browsers that need OGG instead of MP3 are end-of-life Firefox forks). If a future browser regression breaks MP3 in any mainstream browser, add OGG fallback then; do not pre-emptively double the bytes today.

**Preload strategy.** No bundler means no static asset hashing — assets are served from `audio/*.mp3` relative to `index.html`. Use a single shared `Map<name, HTMLAudioElement>` keyed by SFX name. First user gesture triggers `initAudioAfterGesture` which:

1. Creates one `HTMLAudioElement` per SFX with `preload="auto"`, sets `src` to `audio/${name}.mp3`.
2. Calls `.load()` on each — browsers will fetch in parallel.
3. For BGM (if shipped): creates one element with `loop=true`, `preload="auto"`, but does **not** call `.play()` until §12.7's Music toggle is on.

**iOS Safari audio unlock pattern.** iOS requires audio to start within a user-gesture call stack. The `initAudioAfterGesture` call satisfies this on first interaction, but cached `HTMLAudioElement`s created before the gesture remain locked. To handle this robustly: lazy-create elements on first `playSfx(name)` call rather than at gesture time, AND make `initAudioAfterGesture` play a 1-sample silent buffer through `AudioContext` (creating + resuming the context inside the gesture handler) to fully unlock the page's audio output.

**Missing-asset graceful degradation.** `playSfx(name)` must `catch` the rejected `.play()` Promise and the `error` event on each `<audio>` element, suppressing them silently. Logging a single console warning per missing asset (not per call) is enough. The acceptance criterion "Missing audio assets fail gracefully" (§12.8) means no thrown errors and no spam.

### 12.3 Storage schema

```js
localStorage["mahjong_audio"] = {
  v: 1,
  sfxVolume,
  musicVolume,
  sfxMuted,
  musicMuted
}
```

Defaults:

- `sfxVolume = 0.6`
- `musicVolume = 0.3`
- both unmuted

### 12.4 Audio module

New file:

```js
js/audio.jsx
```

API:

```js
function initAudioAfterGesture() { ... }
function playSfx(name) { ... }
function startMusic() { ... }
function stopMusic() { ... }
function setVolumes(settings) { ... }
```

Audio preload must wait until a user gesture to avoid autoplay blocking.

### 12.5 Trigger points

- Draw
- Discard
- Claims: chi, peng, gang
- Human Hu
- AI Hu
- Human dianpao
- Round-over modal transition
- Optional tile select

### 12.6 Resume SFX gate

Round-over / win SFX must not replay just because the user resumes into an already resolved round.

Case A: resume save captured the post-win state.

- During restore, prime `prevResolutionRef` with the restored winner/draw state.
- First render after restore does not see a `null -> resolved` transition.

Case B: crash or close occurred inside the save debounce window.

- Write side-channel key when resolution SFX fires:

```js
localStorage["mahjong_last_announced"] = {
  gameId,
  roundNumber
}
```

- On resume, if the side-channel matches current `gameId` and `roundNumber`, suppress the next resolution SFX transition once.
- Clear the side-channel with resume-clear triggers.

#### 12.6.1 Precedence and consumption order

Case A and Case B address the same SFX-on-resume problem but cover disjoint failure modes. They compose, and the order matters.

On resume, perform both steps unconditionally — do not let one short-circuit the other:

1. **Always** read and clear the `mahjong_last_announced` side-channel. If it matches the resumed `gameId` and `roundNumber`, set `suppressNextResolutionSfx = true`. Reading and clearing happen atomically (read, then `removeStorageKey`) before any render-driven SFX logic runs.
2. **Always** prime `prevResolutionRef` from the restored state — even if Case A has already covered the no-transition path. Priming is a write to a ref; it has no cost if redundant.
3. The first render after restore then runs its `prev → next` resolution comparison. If `prevResolutionRef` was primed (Case A), there is no transition, no SFX, and `suppressNextResolutionSfx` is left intact (a subsequent crash-and-resume during the next round resolution still gets its one-shot suppression). If somehow a transition does fire (Case B path: the restored state was pre-resolution but the side-channel says SFX already played), the suppression flag consumes itself on that transition.

Do not gate Case B on "Case A didn't catch it" — that creates a window where a Case A-covered resume leaves a stale side-channel that fires on the *next* round's resolution. Always consume the side-channel on resume; let it be a no-op when Case A handled the suppression.

#### 12.6.2 React Strict Mode is enabled — verify both gates

`React.StrictMode` is enabled at the app root (`main.jsx:1717`). This is **not a future concern** — effects, refs, and `setState` updaters run twice in development today, and the Case A / Case B SFX gate must survive this.

**Case A (`prevResolutionRef` priming):** refs persist across Strict Mode's intentional double-effect-run, so the resolution-SFX effect should fire once even under Strict Mode. First invocation sees `prev = null`, fires `playSfx`, writes ref to non-null. Second invocation sees `prev = non-null`, no-ops. **Acceptance:** in development with Strict Mode active, finishing a round plays the round-over SFX exactly once.

**Case B (side-channel consumption):** `mahjong_last_announced` is read from `localStorage` inside the resume effect and `suppressNextResolutionSfx` is consumed on the next transition. Strict Mode's double-run could consume the flag twice if the read-and-clear isn't structured correctly. Use this shape:

```js
useEffect(() => {
  const announced = loadJson("mahjong_last_announced", 1, null);
  if (announced && announced.gameId === state.gameId && announced.roundNumber === state.roundNumber) {
    suppressNextResolutionSfxRef.current = true;
  }
  removeStorageKey("mahjong_last_announced");
}, []);  // resume effect — runs once per mount, but Strict Mode mounts twice
```

The `removeStorageKey` is **outside** any guard, so a Strict Mode second run sees the empty side-channel and the ref is set the second time too (idempotent). Test: refresh inside the <500ms debounce window after a win, with Strict Mode on, fires exactly one resolution SFX (not zero, not two).

This same Strict-Mode-survives discipline applies to every other one-shot localStorage flag in the spec — read-and-clear must be paired so the second run doesn't get a different answer.

### 12.7 UI

Menu:

- SFX volume slider.
- Music volume slider.
- Mute toggles.

In-game:

- Small quick mute button in the top bar.

Accessibility:

- Sliders need accessible labels.
- Mute buttons need readable text or `aria-label`.

### 12.8 Acceptance criteria

- Audio does not play before user interaction.
- SFX volume and mute settings persist.
- Music volume and mute settings persist.
- Refreshing on a round-over modal does not replay the round-over SFX.
- Replay playback is silent.
- Missing audio assets fail gracefully.

---

## 13. Feature 9a: Engine extraction

### 13.1 Goal

Extract pure gameplay transitions so live play and replay can share the same deterministic engine.

### 13.2 New file

```js
js/engine.jsx
```

or expanded `js/game-state.jsx` if keeping files smaller is preferred.

### 13.3 Pure step functions

```js
stepDraw(state, seat, { expectedTileId } = {})
stepDiscard(state, seat, tileId)
stepClaim(state, claim)
stepDeclareHu(state, seat, { winningTileId, discarder, expectedWinType, expectedLargeHu, expectedSevenPairs } = {})
stepDeclareGang(state, seat, { tileKey, source, tileIds, expectedReplacementTileId } = {})
stepResolvePass(state)
```

`stepPassClaim` is **not** a separate step function. Pass decisions are not load-bearing for replay state reconstruction (see §13.6 note on `pass_claim` removal). They live entirely inside the live `resolveClaims` walk.

Each function:

- Takes state in.
- Returns next state out.
- Performs no side effects.
- Does not read DOM refs.
- Does not write logs.
- Does not play audio.
- Does not push animation or reaction state.
- Does not schedule timers.

`applyWin` is already pure and should be called from the relevant step functions rather than duplicated.

**`expected*` semantics.** All fields with an `expected` prefix are **validation-only** parameters that the replay engine passes when re-running an action against the seeded engine; the live engine ignores them. The wall's order and the engine's `applyWin` derivation are the source of truth — the action log records what *did* happen so that replay can sanity-check the reproduction. Implementation pattern:

```js
function stepDraw(state, seat, { expectedTileId } = {}) {
  const tile = state.wall[0];
  if (expectedTileId !== undefined && tile.id !== expectedTileId) {
    throw new ReplayMismatchError({ at: "stepDraw", expected: expectedTileId, got: tile.id });
  }
  // ... pop wall, push to hand, return next state
}
```

For `stepDeclareHu`, the engine recomputes `winInfo` via `buildWinInfo` (scoring.jsx:29). The expected fields validate the recomputed result against the action log:

- `expectedWinType: "zimo" | "dianpao"` — matches `winInfo.type`.
- `expectedLargeHu: boolean` — matches `winInfo.largeHu`.
- `expectedSevenPairs: boolean` — matches `winInfo.sevenPairs`.

For `stepDeclareGang`, `expectedReplacementTileId` validates the wall tile drawn as replacement for both `"concealed"` and `"discard"` sources (both cause a replacement draw — see Appendix A.6).

Live wrappers must not pass any `expected*` field; they let the engine derive the truth.

### 13.4 Live wrappers

React component handlers remain responsible for:

- Human-readable logs.
- Scroll refs.
- Language/difficulty refs.
- Animation pushes.
- AI reactions.
- SFX.
- AI auto-play timer scheduling.
- Claim/pass UI coordination.

Wrappers are allowed to remain dozens of lines. The goal is not one-line handlers; the goal is deterministic engine isolation.

### 13.5 Single setState invariant

For action-emitting live handlers, merge these in one `setState(prev => ...)` updater:

1. Pure step result.
2. `state.actionLog` append.
3. Human-readable `state.log` append.
4. `persistRev` increment.

Do not split state transition and action-log append into separate `setState` calls.

**Side effects live outside the updater.** SFX calls (`playSfx`), animation pushes (`pushAnim`), and AI reaction triggers (`enqueueReaction`) must run in the *handler scope* — typically immediately before or after the `setState(...)` call — not inside the updater function. Two reasons:

1. **React Strict Mode is enabled** (main.jsx:1717) and runs updaters twice intentionally in development. Calling `playSfx("draw")` inside the updater fires the sound twice. This is happening **today** in the dev build, not a hypothetical.
2. **The updater is supposed to be a pure function of `prev`.** Side effects in the updater break that contract and make the handler harder to reason about.

The clean shape:

```js
function handleDraw(seat) {
  const tile = state.wall[state.wall.length - 1];   // peek for SFX/animation
  playSfx("draw");                                  // side effect: BEFORE setState
  pushAnim(tile.id, "draw");                        // side effect: BEFORE setState

  setState(prev => mergeForDraw(prev, seat));       // pure merge: step + actionLog + log + persistRev

  scheduleNextAiTurn();                             // side effect: AFTER setState
}
```

Animation pushes can also happen *after* `setState` resolves if the FLIP measurement needs the next layout — that's per-animation-kind; `draw` doesn't need a layout read so it can fire before.

### 13.6 Action payload schemas

All actions:

```js
{ seat, type, ...payload }
```

Types:

```js
"draw"
"discard"
"claim"
"declare_hu"
"declare_gang"
"resolve_pass"
```

Schemas:

```js
{ type: "draw", seat, expectedTileId }

{ type: "discard", seat, tileId }

{
  type: "claim",
  seat,
  claimType,             // "chi" | "peng"  (gang from discard is logged as declare_gang, see below)
  discarder,             // seat that just discarded
  claimedTileId,         // the discard being claimed
  handTileIds,           // the tiles in claimer's hand that combine with claimedTileId
  resultingMeldTileIds   // the final meld's tile ids in their final order
}

{
  type: "declare_hu",
  seat,
  winningTileId,
  discarder,             // null for zimo, otherwise the discarder
  expectedWinType,       // "zimo" | "dianpao" — matches winInfo.type
  expectedLargeHu,       // boolean — matches winInfo.largeHu
  expectedSevenPairs     // boolean — matches winInfo.sevenPairs
}

{
  type: "declare_gang",
  seat,
  tileKey,                    // suit_rank or suit_honor
  source,                     // "concealed" | "discard"
  tileIds,                    // the four tile ids forming the gang
  handTileIds,                // for source: "discard", the three tiles taken from hand
  claimedTileId,              // for source: "discard", the discard id being clawed into the gang
  discarder,                  // for source: "discard", the seat that discarded the tile
  expectedReplacementTileId   // the wall tile drawn as replacement (both sources)
}

{ type: "resolve_pass" }
```

**Why `handTileIds` is recorded explicitly on `claim`:** chi has multiple legal in-hand combinations (a claimer holding 1, 2, 3, 4 of bamboo who claims a 2-bamboo discard can form either 1-2-3 or 2-3-4). Recording the chosen `handTileIds` disambiguates without re-running AI claim logic. For peng the two needed tiles are unique up to id, but recording them is still required so replay can verify they were in-hand at claim time.

**Why gang from discard is `declare_gang`, not `claim`:** despite the live code routing it through `executeClaim` (main.jsx:369), the action schema unifies all gang formations under `declare_gang` because both concealed and discard-source gangs cause a replacement draw, and `claim` actions do not. Keeping the schema clean here makes the replay engine simpler: any `claim` action skips the wall, any `declare_gang` action pops one tile from the wall as the replacement.

**Why `pass_claim` was removed:** pass decisions are not load-bearing for replay state reconstruction. The action log shows `discard` followed by either a `claim`/`declare_gang`/`declare_hu` (someone took it) or a `resolve_pass` (all declined). Mid-window per-player decline tracking is internal to live `resolveClaims`; replay does not need to reproduce the prompt-and-decline UX.

**Why `"promoted"` gang source was removed:** the codebase does not implement promoted gang (peng → gang upgrade by drawing the fourth tile). Out of scope per §1.1 (no new rulesets). If the rule is ever added, extend the enum and add a `promoted_gang` action type that consumes the existing peng meld and the drawn tile.

Replay actions must contain enough information to reproduce human and AI choices without running live AI decision wrappers. The replay engine validates all `expected*` fields and aborts with a `ReplayMismatchError` on disagreement; it does not re-decide those choices.

### 13.7 Acceptance criteria

- A full game can be completed after extraction with no behaviour regressions.
- Engine step functions are callable without React component context.
- Step functions do not write logs or trigger UI side effects.
- Action log entries align exactly with produced state transitions.
- Human and AI choices are fully represented in the action log.
- AI autoplay cannot interleave between state transition and action-log append.

---

## 14. Feature 9b: Replay data and UI

### 14.1 Goal

Let the player scrub through a completed round or game action by action.

### 14.2 State

Current round:

```js
state.actionLog = []
```

`initRound` returns `actionLog: []`. The action log begins recording at the dealer's first *discard* — the initial 13-tile-per-player deal and the dealer's first wall draw are reproducible from `roundSeed` alone, so they are not logged. Replay reconstructs hands at action 0 by calling `initRound(gameInfo, lang, roundSeed)` and then applying recorded actions in order.

Round-start snapshot:

```js
state.roundStartInfo = {
  dealer,
  roundWind,
  roundNumber,
  totalRounds,
  windRounds,
  scores,            // scores ENTERING this round
  roundResults,      // prior rounds' results
  personalities,
  playerNames,
  nameGroup,
  matchSeed,         // for replay derivation
  gameId             // for replay linkage
}
```

`roundStartInfo` is written by `initRound` (it's a frozen snapshot of the round's starting context) and persists through resume saves. It is the **sole** input to replay's `initRound(roundStartInfo, lang, roundSeed)` reconstruction — wherever this spec previously used `gameInfo` in a replay context (notably §14.3 and §14.7), it means `roundStartInfo`. The names refer to the same shape; `roundStartInfo` is the canonical term and is used throughout §14 from here on.

### 14.3 Replay storage

```js
localStorage["mahjong_replays"] = {
  v: 1,
  games: [
    {
      id,                    // equals state.gameId
      startedAt,             // Date.now() at createInitialState time
      matchSeed,
      roundsByNumber: {
        [roundNumber]: {
          roundSeed,
          roundStartInfo,    // exactly the shape from §14.2
          actions            // copy of state.actionLog at round end
        }
      }
    }
  ]
}
```

`id` equals `state.gameId`. The per-round `roundStartInfo` is a full snapshot rather than a delta because rounds-by-number lookup must work independently — e.g. the game-over modal's "Replay any round" picker constructs a replay from `roundsByNumber[N]` alone.

### 14.4 Write timing

At round end:

1. Persist `roundsByNumber[roundNumber]` using `state.roundStartInfo` (verbatim — it is the canonical snapshot per §14.2), `state.roundSeeds[roundNumber]`, and a copy of `state.actionLog`.
2. Clear `state.actionLog` in the live state.
3. Only then allow `nextRound` to overwrite `roundStartInfo`.

Replay can only meaningfully cover Feature-5-and-later games: it requires both deterministic tile IDs (Feature 5) and the per-round `roundSeed`. Pre-Feature-5 games are excluded from replay storage; the schema version bump in §6.3 (`v: 1 → v: 2`) ensures legacy resume saves are discarded rather than fed into the replay pipeline.

Current manual Next Round flow makes this naturally safe, but future auto-advance features must explicitly wait for replay persistence.

### 14.5 Eviction

Keep the 10 most recently started replayable games.

- "Most recently started" is measured by `startedAt` (set at `createInitialState` time, see §14.3). Evict in ascending `startedAt` order, retaining the top 10.
- Evict only when appending a new game entry, not on every mid-game round update.
- Do not create an empty replay stub at game start; doing so would evict older finished games before the new game has replayable content.

#### 14.5.1 Storage budget and quota failure

Rough upper bound: 10 games × up to 16 rounds × ~150 actions × ~80 bytes/action ≈ 1.9 MB, plus lifetime stats, achievements, daily results, audio settings, current resume save. Within the ~5 MB per-origin localStorage budget most browsers allow, but **iOS Safari** historically evicts aggressively and the per-origin cap is fragile.

Write strategy on `mahjong_replays`:

1. Try `saveJson("mahjong_replays", next)`.
2. If it returns `false` (quota exceeded), drop the oldest game from `next.games`, retry. Repeat until success or the list reaches one entry.
3. If a one-entry write still fails, swallow silently — replay is non-critical; resume and lifetime stats matter more and use other keys. Log a single console warning per session.

This mirrors how the action log itself is bounded (trim to last 50 log entries before resume save, §6.5) — accept smaller history rather than letting one feature corrupt the storage envelope. Lifetime stats and the in-progress save must never fail to write because replay history was greedy.

### 14.6 Resume linkage

On resume:

- Current round’s `actionLog` and `roundStartInfo` come from `mahjong_in_progress.state`.
- Finished rounds come from `mahjong_replays.games.find(g => g.id === state.gameId)`.
- If no replay entry exists yet, treat finished rounds as empty.

### 14.7 Replay engine

```js
function replayRound(roundSeed, roundStartInfo, actions, upToActionIdx, lang) {
  let state = initRound(roundStartInfo, lang, roundSeed);
  for (const action of actions.slice(0, upToActionIdx + 1)) {
    state = applyReplayAction(state, action);
  }
  return state;
}
```

`applyReplayAction(state, action)` dispatches on `action.type` to the matching pure step function (§13.3), passing the action payload's validation fields (`expectedTileId`, `expectedWinType`, etc.) so the engine can verify the reproduction matches.

Rules:

- Rebuild from seed and action log.
- Do not pass both a seed and a full initial state.
- Do not run live wrappers.
- Do not emit logs, audio, reactions, or live-game side effects.
- On `ReplayMismatchError` from any step function, abort replay and surface a "replay corrupted" message to the UI rather than continuing with a divergent state.

#### 14.7.1 Mid-scrub error UX

A replay can have hundreds of actions; a `ReplayMismatchError` halfway through is recoverable for the UI but not for the replay engine state. Handle it like this:

```js
function replayRound(roundSeed, roundStartInfo, actions, upToActionIdx, lang) {
  let state = initRound(roundStartInfo, lang, roundSeed);
  let lastGoodIdx = -1;
  try {
    for (let i = 0; i <= upToActionIdx; i++) {
      state = applyReplayAction(state, actions[i]);
      lastGoodIdx = i;
    }
    return { state, ok: true, lastGoodIdx };
  } catch (err) {
    if (err instanceof ReplayMismatchError) {
      return { state, ok: false, lastGoodIdx, error: err };
    }
    throw err;  // unknown errors propagate
  }
}
```

UI consumes the result:

- `ok: true` — the scrubber works freely over the action range; the user can move forward and backward.
- `ok: false` — the scrubber is **clamped** to `lastGoodIdx`. Attempting to scrub past that point shows an inline banner: *"Replay corrupted at action N — this game's later actions can't be reproduced."* The Show All Hands toggle and previous/play/next buttons still work within `[0, lastGoodIdx]`.

This means replay UI never shows the user a partially-reconstructed state; either you're seeing a faithful reproduction or you're seeing a clear stop.

**When does this fire in practice?** Only if action log persistence and engine state diverge — schema version mismatches caught in §6.3 / §9.11 prevent the obvious cases. The remaining vectors are: spec changes to step functions between recording and replay (rare, but a sticky issue across releases), and corrupted localStorage (already handled by §4.2's discard policy at load time). The error surface is therefore narrow but not zero.

### 14.8 UI

Round-over modal:

- Add Replay tab.
- Existing tab bar should become horizontally scrollable on narrow screens.

Replay tab:

- Mini board.
- Timeline range slider.
- Previous / play / next buttons.
- Optional `Show all hands` toggle.
- Default step interval around 1 second.

Game-over modal:

- Add `Replay any round` picker.
- Opens a dedicated replay modal sharing the same replay UI component.

### 14.9 Acceptance criteria

- A completed round can be replayed from action 0 to final action.
- Replay result at final action matches the live final round state.
- Replay does not play SFX.
- Replay does not create new logs.
- Replay does not re-fire AI reactions.
- Replay works after resuming mid-game.
- Replay UI fits on a 360px-wide viewport.
- Old replay entries are evicted down to 10 games.

---

## 15. Cross-feature interaction rules

### 15.1 Training mode × stats and achievements

Training-mode games count toward lifetime stats and achievements.

Exception:

- `purist` requires `state.hintUsedThisGame === false`.

### 15.2 Daily challenge × training mode

Daily challenge forces `trainingMode = false` for fairness.

The saved menu preference is not overwritten; daily mode only overrides the setting for that game.

Daily mode also uses fixed AI gameplay profiles. Local custom names/personality cosmetics must not alter AI decisions in daily games.

### 15.3 Daily challenge × stats and achievements

Daily games count toward lifetime stats.

Daily games set:

```js
state.dailyGame = true
```

Daily-only achievements use `mode: "daily"`.

### 15.4 Replay × animations

Replay skips animations by default.

A replay-side toggle may re-enable animations later, but live animation timers must not be reused by replay.

### 15.5 Replay × AI reactions

Replay does not re-fire AI reactions.

### 15.6 Replay × sound effects

Replay is silent by design because it calls pure engine functions, not live wrappers.

### 15.7 Resume × replay

Resume save contains only current-round replay state.

Finished rounds live in `mahjong_replays`.

The replay UI merges both sources.

---

## 16. Accessibility checklist

Apply this checklist to every UI feature in this spec.

### 16.1 Focus and keyboard

- Do not globally remove focus outlines without replacing them with visible `:focus-visible` styling.
- Buttons, checkboxes, tabs, sliders, and replay controls must be keyboard reachable.
- Modals should close with Escape where appropriate.
- Modals should trap focus while open.

### 16.2 Reduced motion

- Respect `prefers-reduced-motion: reduce`.
- Prefer skipping animation state entirely rather than only disabling CSS keyframes.

### 16.3 Screen-reader text

- Icon-only buttons require `aria-label`.
- Volume sliders require labels.
- Replay timeline slider requires a meaningful label.
- Achievement toasts should not steal focus.

### 16.4 Mobile viewport

Verify at minimum:

- 360×640 viewport.
- Hint label does not clip.
- Replay tabs fit via horizontal scrolling.
- Toasts do not cover primary action buttons.
- Bottom player hand remains usable.

---

## 17. Script load order

Because the app uses ordered Babel script tags rather than bundler imports, every new file must be added to `index.html` in dependency order.

Final target order:

1. `storage.jsx`
2. `rng.jsx`
3. `tiles.jsx`
4. `lang.jsx`
5. `parsers.jsx`
6. `validation.jsx`
7. `claims.jsx`
8. `ai.jsx`
9. `scoring.jsx`
10. `names.jsx`
11. `game-state.jsx`
12. `engine.jsx`
13. `portraits.jsx`
14. `lifetime.jsx`
15. `achievements.jsx`
16. `audio.jsx`
17. `replay.jsx`
18. `styles.jsx`
19. `main.jsx`

`names.jsx` should load before `game-state.jsx` because `createInitialState` depends on name selection.

`styles.jsx` should remain before `main.jsx` if the main component references style constants.

**Cross-phase retroactive touches.** Adding a new feature sometimes requires editing earlier-phase code:

- Phase 8 (audio) introduces `mahjong_last_announced` and must add a line to §6.8's clear-trigger list in the Phase 2 resume-clear path. Forgetting this leaves stale SFX-suppression flags lingering across games.
- Phase 9b (replay) introduces `mahjong_replays` and must add a line to §6.5's slim-save (preserving `actionLog`) and to the Phase 2 lifecycle handlers (persist `actionLog` at round end before `nextRound`).

When a phase ships, scan earlier phases for "once X ships" or "when Y exists" markers and apply the deferred edits as part of the same PR.

---

## 18. Storage key registry

| Key | Versioned | Helper | Owner | Purpose |
|---|---:|---|---|---|
| `mahjong_training_mode` | No | direct `localStorage` | Training mode | Boolean menu setting stored as string |
| `mahjong_in_progress` | Yes | `loadJson` / `saveJson` (no factory — fallback is `null`) | Resume | Current resumable game |
| `mahjong_lifetime_stats` | Yes | `loadJson` with factory `() => ({ ...DEFAULT_LIFETIME_STATS })` | Stats | Lifetime counters |
| `mahjong_achievements` | Yes | `loadJson` with factory `() => ({ v: 1, unlocked: {} })` | Achievements | Unlocked badge dates |
| `mahjong_daily` | Yes | `loadJson` with factory `() => ({ v: 1, rulesVersion: CURRENT_RULES_VERSION, results: {} })` | Daily challenge | Recorded daily results and streak source data by UTC date |
| `mahjong_audio` | Yes | `loadJson` with factory `() => ({ v: 1, ...DEFAULT_AUDIO_SETTINGS })` | Audio | Volume and mute settings |
| `mahjong_last_announced` | Yes | `loadJson` / `saveJson` (no factory — fallback is `null`) | Audio/resume | Resolution-SFX suppression side channel |
| `mahjong_replays` | Yes | `loadJson` with factory; writes via §14.5.1 quota fallback | Replay | Finished-round replay data |

The `mahjong_training_mode` key is a single string (`"true"` or `"false"`) and reads/writes directly via `localStorage.getItem`/`setItem` — it does not need the JSON helpers.

---

## 19. Testing checklist

### 19.1 Core gameplay regression

- Start game.
- Draw.
- Discard.
- Claim chi/peng/gang if available.
- Win by zimo.
- Win by dianpao.
- Complete all rounds.
- Start a new game.

### 19.2 Persistence

- Refresh mid-round.
- Refresh immediately after a discard.
- Refresh immediately after using a hint — confirm `state.hintUsedThisGame === true` after restore, and confirm `purist` does **not** unlock on a subsequent same-game win.
- Refresh on round-over modal.
- Refresh on game summary.
- Corrupt each structured localStorage key and confirm app recovers.
- Bump schema versions and confirm old payloads are discarded.
- Mutate a fallback object returned by `loadJson` and reload — confirm the next load returns a fresh default, not the mutated copy.

### 19.3 Determinism

- Same seed creates same wall.
- Same UTC daily date creates same wall.
- Custom name groups do not affect daily wall.
- Replay final state matches live final state.

### 19.4 UI and accessibility

- 360×640 viewport.
- Keyboard-only menu navigation.
- Keyboard-only modal navigation.
- Reduced-motion OS setting.
- Audio muted state.
- Replay controls via keyboard.

### 19.5 Edge cases

- Admin apply twice in one round; no tile ID collision.
- Draw then immediately discard same tile; animation cleanup remains correct.
- Multiple achievements unlock at once; toasts queue correctly.
- Resume after round-over; SFX does not replay.
- Resume inside debounce-loss window; no duplicate resolution SFX.
- Replay current round before any completed round exists.

### 19.6 Daily challenge regression

- Same UTC date produces the same initial wall in two fresh browser profiles.
- Local custom names do not change wall order.
- Local custom names do not change AI gameplay decisions in daily mode.
- First recorded daily result is preserved after a non-recording replay/play-again run.
- Daily win streak uses explicit `won` values from `mahjong_daily`.
- Starting a daily at 23:55 UTC and finishing past 00:05 UTC writes the result under the starting date's key, not the rollover date.

### 19.7 Replay regression

- Replaying a round does not call AI decision helpers.
- Replaying a round validates `expectedTileId` where practical.
- Human pass decisions and AI choices are represented in the action log.
- Replay final state matches the original resolved round state.
- `mahjong_replays` write degrades to dropping the oldest game when quota is exceeded.

---

## 20. Document workflow

This spec lives at the repo root (`MAHJONG_DESIGN_SPEC.md`) alongside `IMPROVEMENTS.md`. The repo deploys to GitHub Pages from `main`, so spec edits are committed directly to `main` rather than through a docs branch.

Conventions:

- `IMPROVEMENTS.md` is the high-level roadmap and checklist (the *why* and the sequencing).
- `MAHJONG_DESIGN_SPEC.md` (this document) is the implementation contract (the *what* — state, schemas, signatures, acceptance criteria).
- When a feature ships, both documents are updated in the same commit: roadmap status in `IMPROVEMENTS.md`, any technical deviations from this spec recorded inline here.
- If the two disagree, the design spec wins on implementation details; the roadmap wins on intent.

---

## Appendix A: Codebase audit (current state)

This appendix freezes a map of `main.jsx` and its supporting files at spec time so implementers do not need to reverse-engineer the existing structure before applying each phase's changes. Line numbers verified against the working tree.

### A.1 React Strict Mode is enabled

`main.jsx:1717` mounts the root inside `React.StrictMode`:

```js
ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(React.StrictMode, null, React.createElement(MahjongGame))
);
```

Every effect, every `setState` updater, every ref initialization runs **twice** in development. This is load-bearing for §6.7 (resume save), §7.5 (game-over effect), §8.7 (combined lifetime/achievement effect), §12.6 (SFX gate), §13.5 (single-setState invariant), and §14.4 (replay persistence). All of these must be written to survive double-invocation; the spec sections call out the specific patterns required.

### A.2 `useState` / `useRef` inventory

| Hook | Line | Purpose | Persisted across resume? |
|---|---:|---|---|
| `state` | 10 | main game state | yes (slim-save §6.5) |
| `windRoundsSetting` | 11 | menu config | no — re-read from save's `windRoundsSetting` |
| `showMenu` | 12 | menu visibility | no |
| `selectedTileIdx` | 13 | UI selection | no |
| `claimOptions` | 14 | claim-prompt option list | no |
| `lang` | 15 | localization | no — read from save's `lang` |
| `difficulty` | 16 | AI difficulty | no — read from save's `difficulty` |
| `showHelp` | 17 | help modal | no |
| `showAdmin` | 18 | admin modal | no |
| `adminInput` | 19 | admin form buffer | no |
| `adminTab` | 20 | admin tab | no |
| `showNames` | 21 | names modal | no |
| `nameGroups` | 22 | persisted name groups | via `mahjong_name_groups` |
| `newNameInputs` / `newGroupInput` | 23–24 | input buffers | no |
| `roundOverTab` / `gameOverTab` | 25–26 | modal tab UI | no |
| `gameOverAcknowledged` | 27 | terminal ack | **no** — lives in component state, not on `state`. The save effect's dep array reads it from component scope. On resume, it defaults to `false`; if the restored state is round-over, the round-over modal re-renders. |
| `winSize` | 28 | viewport | no |
| `logRef` | 29 | log scroll ref | n/a |
| `autoPlayRef` | 30 | reserved | n/a |
| `langRef` / `diffRef` / `namesRef` | 31–44 | mirror state for setState updaters | n/a |

### A.3 `useEffect` inventory

| Line | Trigger | Side effect |
|---:|---|---|
| 69 | mount | window resize listener |
| 81 | `state.log` | log-panel auto-scroll |
| 86 | `state.winner`, `state.isDraw` | reset `roundOverTab` to `"winner"` on new round |
| 94 | `state.winner`, `state.isDraw`, `state.roundNumber` | append per-round result to `state.roundResults` (with duplicate-guard for Strict Mode safety) |
| 134 | `state.currentTurn`, `state.phase`, `state.turnDrawn`, `state.winner`, `state.isDraw`, `showMenu`, `state.awaitingPlayerClaim` | AI auto-play via 600ms `setTimeout` |

The roundResults-recording effect already uses the Strict-Mode-safe pattern (`if (prev.roundResults.some((r) => r.round === prev.roundNumber)) return prev`). Future game-over and lifetime/achievement effects must use the same dedup pattern keyed on `state.gameId`.

### A.4 Handler inventory and `persistRev` bump map

This table tells you exactly which `main.jsx` handlers must include `persistRev: prev.persistRev + 1` in their `setState` merge once Phase 2 adds the counter. Phase 9a wrapper extraction will consolidate these but Phase 2 must scaffold them per-callsite (§6.6.2).

| Handler / source | Line | setState? | Bumps persistRev? | Notes |
|---|---:|---|---|---|
| `addLog` | 58 | yes | no (log-only) | Slim-save trims log to last 50 lines anyway |
| `useEffect` roundResults recording | 97 | yes | yes | Strict-Mode dedup already in place |
| `useEffect` AI auto-play → `processAIAction` | 141 | yes | yes | 600ms timer; will become wrapper around step functions in Phase 9a |
| `handlePlayerDraw` | 403 | yes | yes | Also calls `setSelectedTileIdx(null)` outside the setState |
| `handlePlayerDiscard` | 433 | yes | yes | Same selectedTileIdx clear outside |
| `handleDeclareHu` | 456 | yes | yes | Zimo path only — dianpao goes through `handlePlayerClaim` |
| `handleDeclareConcealedGang` | 471 | yes | yes | Does **not** check zimo on replacement — human must click Hu manually after |
| `handlePlayerClaim` | 498 | yes | yes | Branches to `executeClaim` or back to `resolveClaims` |
| `applyAdmin` | 600 | yes | yes | Must also set `adminTouched: true` (Phase 2 addition) |
| `nextRound` | 660 | yes | yes | Spreads `prev` into `initRound` per §5.3 — confirmed line 669 |
| `startNewGame` | 519 | yes | reset (initial-state load) | Also resets `selectedTileIdx`, `claimOptions`, `roundOverTab`, `gameOverTab`, `gameOverAcknowledged` |
| `startWithAdmin` | 648 | yes | reset | Same as startNewGame plus opens admin |
| `setGameOverAcknowledged(true)` | 1548 | n/a (separate React state) | yes (triggers save effect) | Dep of save effect at §6.6 |
| `executeClaim` (internal) | 324 | no (called from above) | inherits caller | Helper |
| `resolveClaims` (internal) | 232 | no (called from above) | inherits caller | Helper |
| `advanceTurn` (internal) | 389 | no (called from above) | inherits caller | Helper |
| `processAIAction` (internal) | 146 | no (called from useEffect at 141) | inherits caller | Helper |

### A.5 `applyAdmin` scope (exact field list)

`applyAdmin` (lines 600–645) mutates exactly the following fields:

**Sets:**
- `currentTurn` (from `adminInput.turn`)
- `phase` (from `adminInput.phase`)
- `turnDrawn` (derived: `phase === "discard"`)
- `wall` (prepends parsed user tiles, drops equal count from front)
- `players[*].hand` (from `parseTileList`)
- `players[*].openMelds` (from `parseMeldList`)
- `players[*].discards` (from `parseTileList`)
- `scores` (from `adminInput.players[*].score`)

**Clears (sets to null/empty/false):**
- `lastDiscard`, `lastDiscarder`, `lastDrawn`
- `awaitingPlayerClaim`, `playerDeclinedClaims`, `pendingClaims`
- `winner`, `winInfo`, `scoreBreakdown`, `isDraw`

**Does NOT touch:**
- `dealer`, `roundWind`, `roundNumber`, `totalRounds`, `windRounds`
- `roundResults`, `personalities`, `playerNames`, `nameGroup`, `gameId`, `matchSeed`, `roundSeeds`
- `log` (log entries from before admin remain)
- `hintUsedThisGame`, `dailyGame`, `dailyDate` (when these fields are added)

**Phase 2 additions:** `applyAdmin` must also set `adminTouched: true` and bump `persistRev`. Replay (§14.8) excludes any match where `adminTouched === true`.

**Tile-ID release hazard:** because `applyAdmin` rebuilds hands/melds/discards from parsed input, tile IDs from the prior board state are released. Per §9.4, the next admin pass scans the current board for collision floor — released IDs from a previous admin pass can be reused, which is the acknowledged FLIP-ref glitch noted in §9.4.2.

### A.6 Concealed gang and replacement draws

`processAIAction` (lines 171–194) handles AI concealed gang **atomically** within a single draw step:

1. AI draws a tile from the wall (`state.wall[0]`)
2. If concealed gang found, remove 4 matching tiles, add meld, draw replacement from wall, replacement becomes new `winTile`
3. Check `validateHu` on the post-replacement hand; if true, call `applyWin` with `winType: "zimo"`
4. Return next state

`handleDeclareConcealedGang` (lines 471–496) handles the human path:

1. Human clicks gang button (requires `state.phase === "discard"` and `turnDrawn === true`)
2. Remove 4 matching tiles, add meld, draw replacement from wall, update `lastDrawn`
3. Return — does **not** check Hu. Human must click the Hu button afterward if the replacement won.

**Action log decomposition (Phase 9a):**

- Concealed gang during AI turn → `declare_gang(source: "concealed", expectedReplacementTileId)`. If AI also wins, a separate `declare_hu(expectedWinType: "zimo")` follows.
- Concealed gang during human turn → `declare_gang(source: "concealed", expectedReplacementTileId)`. Human's Hu click (if any) produces a separate `declare_hu` action.
- Gang from discard (claimed) → `declare_gang(source: "discard", expectedReplacementTileId, claimedTileId, handTileIds, discarder)`. The discard pool's tile is moved into the meld; the discarder seat's `discards` array loses the tile.

In all cases, `stepDeclareGang` is a single pure step that handles meld formation + replacement draw atomically. No separate `stepDraw` action follows for the replacement.

### A.7 AI determinism scan results

`ai.jsx` was scanned end-to-end for non-determinism beyond the documented `Math.random` at line 476.

**Findings — no risk:**

- `for (const k in counts)` and `Object.values(counts)` iterations (lines 11, 35, 257, 295) are over `countTiles` results. `countTiles` (`validation.jsx:5`) inserts keys in the iteration order of its input array, which is `sortHand(...)` — a deterministic comparator. Iteration order is therefore deterministic per identical input hand.
- `for (const opt of opts)` iteration (line 458) over `findChiOptions` results — `findChiOptions` builds the array via three deterministic sequence checks, no RNG, no Object iteration.
- No `Date.now()`, `performance.now()`, `new Date()`, or `setTimeout` usage in any decision function.
- No closure-captured cache state, no module-level mutable counters.
- No `Set` or `Map` iteration where insertion order would matter (the few `Set` uses in `validation.jsx`/`main.jsx` are for `has()` checks, not iteration).

**Conclusion:** after the §9.3.2 biased-sort fix lands, the AI is fully deterministic given identical state. The daily-challenge wall + AI invariant in §9.7 is implementable.

### A.8 Action-log coverage gaps (resolved in §13.6)

The action-schema audit against `claims.jsx`, `scoring.jsx`, `validation.jsx`, and `main.jsx` produced three structural fixes already applied to §13.6:

1. **`winType` enum corrected** from `"smallHu" | "largeHu" | "sevenPairs"` to `"zimo" | "dianpao"`. The smallHu/largeHu/sevenPairs flags are derived by `buildWinInfo` (scoring.jsx:29); they are validated separately via `expectedLargeHu` and `expectedSevenPairs`.
2. **`"promoted"` removed from `declare_gang.source` enum.** Not implemented in this codebase.
3. **`pass_claim` action type removed.** Pass decisions are not load-bearing for replay; the action log shape itself distinguishes "all passed" (next action is a `resolve_pass` or a draw from the next seat) from "someone claimed" (next action is `claim` / `declare_gang` / `declare_hu`).

**Confirmed covered without changes:**

- Robbing the kong (qiang gang hu): **not implemented** in this codebase, so no schema impact.
- Multiple Hu candidates on one discard: `resolveClaims` (main.jsx:232) walks seats in deterministic order with priority Hu > Gang > Peng > Chi, breaking ties by turn distance. The single recorded `declare_hu` action is unambiguous.
- Dealer's first turn: initRound (game-state.jsx:42) deals 14 tiles to the dealer; the dealer enters the round in `phase: "discard"` with `turnDrawn: true`. The action log naturally starts with the dealer's first discard.
- Chow disambiguation: `handTileIds` on the `claim` action resolves this.

### A.9 Module-level Math.random call sites (Phase 5 fix list)

Already enumerated in §9.3.1 with line numbers. Repeated here for cross-reference convenience: `tiles.jsx:47`, `tiles.jsx:108`, `names.jsx:62`, `names.jsx:76`, `ai.jsx:476`. After Phase 5 these are the only sites that need to change; no other Math.random calls exist in gameplay code.

---

## Appendix B: Engine decomposition map (Phase 9a)

Per-handler decomposition: for each existing `main.jsx` handler, this table specifies what becomes the pure step function call and what stays in the React wrapper. Use this as the actual checklist for the Phase 9a refactor.

### B.1 `handlePlayerDraw` (line 403)

**Pure step:** `stepDraw(state, PLAYER_IDX)` — pops wall, adds to hand, returns next state with `phase: "discard"`, `turnDrawn: true`, `lastDrawn: tile`.

**Wrapper responsibilities:**
- Guard: `prev.currentTurn !== PLAYER_IDX || prev.phase !== "draw"` → return prev (preserve current behaviour)
- Empty wall: return `{ ...prev, isDraw: true, log: [...] }` — could be part of step but cleaner as wrapper since it's a terminal state, not a draw
- Append `actionLog` entry: `{ type: "draw", seat: PLAYER_IDX, expectedTileId: drawn.id }`
- Append human-readable `log` entry
- Bump `persistRev`
- Check `validateHu` post-draw; if true, append a "can hu" hint to the log (no state mutation)
- Call `setSelectedTileIdx(null)` outside the setState

**Side effects (outside setState):** play `draw.mp3`, push `tileAnims[drawn.id] = { kind: "draw", ... }`.

### B.2 `handlePlayerDiscard` (line 433)

**Pure step:** `stepDiscard(state, PLAYER_IDX, tileId)` — removes from hand, appends to discards, sets `lastDiscard`/`lastDiscarder`, transitions to `phase: "claim"`, clears `playerDeclinedClaims`.

**Wrapper responsibilities:**
- Guard same as draw
- Append `actionLog`: `{ type: "discard", seat: PLAYER_IDX, tileId }`
- Append human-readable log
- Bump `persistRev`
- Call `setSelectedTileIdx(null)` outside

**Side effects:** play `discard.mp3`, push FLIP animation from hand position to discard pool.

### B.3 `handleDeclareHu` (line 456)

**Pure step:** `stepDeclareHu(state, PLAYER_IDX, { winningTileId, discarder: null })` — calls `applyWin` internally, sets winner/winInfo/scoreBreakdown/scores.

**Wrapper responsibilities:**
- Guard: `prev.currentTurn !== PLAYER_IDX` → return prev
- `validateHu` check: if false, append "bad hu" log and return without calling step
- Append `actionLog`: `{ type: "declare_hu", seat: PLAYER_IDX, winningTileId, discarder: null, expectedWinType: "zimo", expectedLargeHu, expectedSevenPairs }`
- Append human-readable log
- Bump `persistRev`

**Side effects:** play `hu_win.mp3`, push `win-shimmer` animation, enqueue AI reactions on losing seats.

### B.4 `handleDeclareConcealedGang` (line 471)

**Pure step:** `stepDeclareGang(state, PLAYER_IDX, { tileKey, source: "concealed", tileIds })` — removes 4 tiles from hand, adds meld, pops wall replacement, updates `lastDrawn`.

**Wrapper responsibilities:**
- Guard same as draw + `phase === "discard"`
- Empty wall: return draw-state terminal
- Append `actionLog`: `{ type: "declare_gang", seat: PLAYER_IDX, tileKey, source: "concealed", tileIds, expectedReplacementTileId }`
- Append human-readable log
- Bump `persistRev`

**Side effects:** play `gang.mp3`, push `claim-pop` animation.

### B.5 `handlePlayerClaim` (line 498) — accept branch

**Pure step (chi/peng):** `stepClaim(state, { seat: PLAYER_IDX, claimType, claimedTileId, handTileIds, resultingMeldTileIds, discarder })` — moves tiles from hand to new meld, removes discard from discarder's pool, sets `currentTurn` to claimer, transitions to `discard` with `turnDrawn: true`.

**Pure step (gang from discard):** `stepDeclareGang(state, PLAYER_IDX, { source: "discard", tileKey, tileIds, claimedTileId, handTileIds, discarder })` — same as concealed but takes from discard, draws replacement.

**Pure step (hu by claim):** `stepDeclareHu(state, PLAYER_IDX, { winningTileId, discarder })` — calls `applyWin` with `winType: "dianpao"`.

**Wrapper responsibilities:**
- Guard: no `awaitingPlayerClaim` → return prev
- Branch on `claim.type` to the correct step
- Append appropriate `actionLog` entry
- Clear `awaitingPlayerClaim`, `playerDeclinedClaims`
- Bump `persistRev`
- Call `setClaimOptions(null)` outside

**Side effects:** play `chi.mp3`/`peng.mp3`/`gang.mp3`/`hu_win.mp3` depending on type.

### B.6 `handlePlayerClaim` (line 498) — decline branch

**Not a step function call.** Pure logic that appends to `playerDeclinedClaims` and re-runs `resolveClaims`. Stays entirely in the wrapper (no engine boundary).

- Append decline to `playerDeclinedClaims`
- Re-run `resolveClaims(newSt)` which either: prompts for another claim, executes an AI claim, or calls `advanceTurn`
- If `advanceTurn` is reached without any claim, append `actionLog`: `{ type: "resolve_pass" }`
- Bump `persistRev`

### B.7 `processAIAction` (line 146) — draw phase

Wraps three potential pure steps in sequence:

1. `stepDraw(state, p)`
2. If post-draw hand has a concealed gang: `stepDeclareGang(state, p, { source: "concealed", ... })` — recursive on the same AI turn
3. If post-replacement `validateHu` succeeds: `stepDeclareHu(state, p, { winningTileId: winTile.id, discarder: null })`

**Wrapper responsibilities:**
- Empty wall: terminal draw state
- One `setState` updater contains the full chain of step results plus all appended actions
- Bump `persistRev` once for the entire chain
- 600ms `setTimeout` reset on next dep change (`useEffect` already handles this)

**Side effects:** play `draw.mp3`; if gang fires, `gang.mp3`; if hu fires, `hu_win.mp3` + reaction enqueues.

### B.8 `processAIAction` (line 146) — discard phase

**Pure step:** `stepDiscard(state, p, discardedTileId)`.

**Wrapper responsibilities:**
- Call `aiChooseDiscard` to determine the tile (must happen OUTSIDE the setState updater — Strict Mode would call it twice, which is fine since deterministic, but cleaner to compute once)
- Append `actionLog`: `{ type: "discard", seat: p, tileId }`
- Bump `persistRev`

**Side effects:** play `discard.mp3`.

### B.9 `processAIAction` (line 146) — claim phase (`resolveClaims`)

`resolveClaims` walks priority order Hu > Gang > Peng > Chi. The wrapper-side logic:

- For each seat (in priority order), call `aiDecideClaim`
- If a claim is found, call the appropriate step function (`stepClaim` / `stepDeclareGang` / `stepDeclareHu`)
- If no claim: call `stepResolvePass(state)` — pure transition from claim phase back to draw phase for next seat
- Append exactly one terminal action: `claim` / `declare_gang` / `declare_hu` / `resolve_pass`
- Bump `persistRev` once

This is the hottest single setState merge — it can fire on the same tick the human discards. Strict Mode invokes it twice, so:

- `aiDecideClaim` must be deterministic (confirmed in A.7)
- AI claim's `handTileIds` must be picked deterministically (it is: `findPengOption` returns first match, `findChiOptions` returns in fixed sequence order)

### B.10 `nextRound` (line 660)

**Pure step:** `initRound(gameInfo, lang, roundSeed)` — same call as today, no changes.

**Wrapper responsibilities:**
- Compute `roundSeed = seedForRound(matchSeed, roundNumber)` and store in `state.roundSeeds`
- Spread `prev` into the `gameInfo` arg (confirmed line 669)
- If `roundNumber > totalRounds`: emit terminal log and return without `initRound`
- Bump `persistRev`
- **Phase 9b add:** persist the just-finished round's replay data (§14.4) BEFORE returning the new round state — uses `state.roundStartInfo`, `state.roundSeeds[prevRoundNumber]`, and the full `state.actionLog`

### B.11 `applyAdmin` (line 600)

**Not a step function call.** Admin is a full-state replacement that bypasses gameplay logic. Stays in the wrapper.

- Set `adminTouched: true`
- Bump `persistRev`
- Clear `actionLog: []` — the action log is no longer reproducible against the new state
- Do NOT bump `roundSeeds` — admin doesn't reseed

### B.12 `startNewGame` / `startWithAdmin` (lines 519, 648)

**Pure step:** `createInitialState(windRoundsSetting, lang, seed?, { dailyDate? })` per §9.6.

**Wrapper responsibilities:**
- Reset `selectedTileIdx`, `claimOptions`, `roundOverTab`, `gameOverTab`, `gameOverAcknowledged`, `showMenu`
- For `startWithAdmin`: open admin overlay with the freshly created state
- Initial `persistRev: 0` (state starts at 0, bumped by first user mutation)
- Clear `resumeClearedRef` (allows next save cycle to write again)

---

## Appendix C: Phase ordering checklist

A condensed map of cross-phase touches that get easy to forget. Every time a phase ships, scan this list for "retroactive" edits.

| When this phase ships | Update these earlier-phase touchpoints |
|---|---|
| Phase 0 (storage helper) | None — foundational |
| Phase 1 (training mode) | Add `state.hintUsedThisGame: false` to `createInitialState` return |
| Phase 2 (resume) | Add `gameId`, `persistRev`, `adminTouched` to `state`. Hand-scaffold `persistRev: prev.persistRev + 1` into every handler in Appendix A.4's "bumps yes" rows. Add `applyAdmin` `adminTouched` set. |
| Phase 3 (lifetime stats) | Combined game-over effect with synchronous ordering per §7.5 |
| Phase 4 (achievements) | Sample `roundStats.humanClaimedDiscardThisRound` inside the claim wrappers (B.5), `wallCountAtWin` inside Hu wrappers (B.3/B.5 hu branch), `humanWasLowestOrTiedLowestAfterRound` from `state.scores` in the round-end effect. |
| Phase 5 (seeded RNG) | Replace every Math.random in Appendix A.9. Branch `createInitialState` on daily mode (§9.6). Bump `mahjong_in_progress.v` to 2. |
| Phase 6 (animations) | Apply the §10.5 key-fix audit. Push animations in wrappers (B.1, B.2, B.4, B.5). |
| Phase 7 (portraits/reactions) | Enqueue reactions in B.3 (own win), B.5 (own claim — dianpao given), B.7 (AI Hu), B.9 (AI dianpao given). |
| Phase 8 (audio) | Wire SFX calls in B.1, B.2, B.3, B.4, B.5, B.7, B.8, B.9. Add `mahjong_last_announced` to §6.8 clear-trigger list. |
| Phase 9a (engine) | Convert every handler in Appendix B per the per-handler decomposition. Consolidate the scattered `persistRev` bumps from Phase 2 into the four-thing merge (§13.5). |
| Phase 9b (replay) | Add per-round persistence to `nextRound` wrapper (B.10). Add admin-touched exclusion to replay UI (§14.8). |

