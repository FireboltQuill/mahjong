# Mahjong Improvements Design Spec

**Repository:** `FireboltQuill/mahjong`
**Source roadmap:** `IMPROVEMENTS.md`
**Document purpose:** The implementation contract for the nine planned features. State shapes, file paths, function signatures, acceptance criteria, and edge cases live here.

**Read this alongside `IMPROVEMENTS.md`.** That document carries the *why* (rationale, sequencing, open questions); this one carries the *what* (state, schemas, signatures, acceptance criteria). If they disagree, the design spec wins on implementation details; the roadmap wins on intent and rationale. When a feature ships, update both: roadmap status in `IMPROVEMENTS.md`, technical deviations here.

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
| 0 | Shared persistence helpers and roadmap cleanup | None | `js/storage.jsx`, `index.html` |
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
function loadJson(key, expectedVersion, fallback, migrate) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed) return fallback;
    if (parsed.v === expectedVersion) return parsed;
    if (typeof migrate === "function") {
      const migrated = migrate(parsed);
      if (migrated && migrated.v === expectedVersion) return migrated;
    }
    return fallback;
  } catch {
    return fallback;
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

// Scalar (string/boolean-as-string) helpers — keep unversioned scalar keys
// like `mahjong_training_mode` from inlining localStorage calls.
function loadString(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw;
  } catch {
    return fallback;
  }
}

function saveString(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}
```

The optional `migrate` callback is the escape hatch from §2.3: callers can pass a function that takes the old payload and returns a `{ v: expectedVersion, ... }` shape. If migration returns anything else (null, wrong version, throws), `loadJson` falls back. Callers that want strict "discard on mismatch" simply omit `migrate`. Default policy stays "discard"; migrations are opt-in per call.

### 4.3 Acceptance criteria

- All new structured storage features use `loadJson` and `saveJson`.
- All scalar storage features use `loadString` and `saveString` — no inline `localStorage.getItem` in feature code.
- Version mismatch with no `migrate` callback returns fallback without throwing.
- Version mismatch with a `migrate` callback returning the expected version returns the migrated payload.
- Version mismatch with a `migrate` callback that throws or returns the wrong shape returns fallback without throwing.
- Corrupt JSON returns fallback without throwing.
- Storage write failure does not crash the app.

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
- **Verify before implementing:** confirm `nextRound` in `main.jsx` actually spreads `prev` into `initRound`'s argument. If it doesn't (e.g., it constructs a fresh `gameInfo` by hand), the match-level field will be silently dropped at round transition. The fix is to spread `prev` rather than work around it at the call site.

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
- Admin-touched games are detectable via `state.adminTouched = true`, set inside `applyAdmin` and persisted through the resume save. Feature 9 uses this to hide or disable the replay tab; without the flag, replay would silently produce nonsense for these games.

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
  if (crypto?.randomUUID) return crypto.randomUUID();
  // Non-secure-context fallback. Uses Math.random; gameId is an
  // identifier with no gameplay impact, so this is the one allowed
  // exception to the determinism rule (see IMPROVEMENTS.md cross-cutting).
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2).padEnd(8, "0");
  return `${t}-${r}`;
}
```

`padEnd` is required: `Math.random().toString(36).slice(2)` can return a string shorter than 8 chars when the random draw is small (`(0.5).toString(36) === "0.i"`, slice(2) = `"i"`). Padding fixes the tail length.

Once Feature 5 lands and `randomUint32()` exists in `rng.jsx`, the fallback may alternatively be `randomUint32().toString(36) + randomUint32().toString(36)` for a stronger source — either form is acceptable for an identifier-only value.

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
- Do not trim `actionLog`; replay clears it at round end after persisting finished-round replay data.

### 6.6 Save trigger

Recommended implementation:

Add a game-state revision counter:

```js
state.persistRev  // monotonically increasing integer, starts at 0
```

The save effect depends on:

```js
[state.persistRev, showMenu, state.gameOverAcknowledged]
```

This is safer than manually listing coarse fields (`phase`, `currentTurn`, `roundNumber`, `scores`), because future state fields could be added without remembering to add them to the watch list.

#### 6.6.1 Bump rules

The bump is co-located with the `setState` merge that produces the underlying change. Feature 9a's single-`setState` invariant (§13.5) requires all four of (step result + actionLog append + log append + persistRev increment) to land in the same merge — so adding the bump is a one-line change per step wrapper.

**Phase ordering caveat.** Feature 2 ships before Feature 9a per the phases table in §3, but Feature 9a is what *makes* `persistRev` a one-line addition by funnelling state transitions through engine step wrappers. In Phase 2, before the wrappers exist, each existing `setState` callsite that performs a gameplay mutation must be hand-edited to include `persistRev: prev.persistRev + 1`. Expect this to be sprawling — `main.jsx` is the main offender. Phase 9a's wrapper migration consolidates those scattered bumps into the four-thing merge described above; until then, treat the per-callsite bumps as scaffolding with a known follow-up.

**Bump these mutations:**

| Source | Mutation | Bumps? |
|---|---|---:|
| `stepDraw` wrapper | hand/wall change | yes |
| `stepDiscard` wrapper | hand/discards/lastDiscard change | yes |
| `stepClaim` wrapper | meld formation, hand/discards change | yes |
| `stepDeclareHu` wrapper | win resolution | yes |
| `stepDeclareGang` wrapper | meld formation, replacement draw | yes |
| `stepResolvePass` wrapper | claim window closes, turn advances | yes |
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
- `state.adminTouched` flag (set inside `applyAdmin`, see Feature 9 §14.10) — **bumped transitively** by the `applyAdmin` row above.
- `state.dailyGame` flag (Feature 5) — **bumped** at game-start when `createInitialState` returns; this is the initial-state load and the counter starts at 0 then bumps on the first user mutation.

When in doubt, the question to ask is: "If the user refreshes after this mutation, do they expect to see the post-mutation state on restore?" If yes, bump.

### 6.7 Debounce and lifecycle flush

Normal play:

- Debounce writes with a 500ms trailing timeout.
- Clear pending timeout on unmount and on clear triggers.

Lifecycle events:

Register handlers for:

- `beforeunload`
- `pagehide`
- `visibilitychange` when `document.hidden === true`

Each handler calls `flushSave()` **unconditionally** — not gated on `saveTimerRef.current` being non-null.

**Why unconditional matters.** Consider the sequence: user discards → debounce timer fires → save written → 600ms passes → user closes tab. With a gated flush (`if (saveTimerRef.current) flushSave()`), the close-event handler no-ops because the timer already fired and was cleared. Any setState between the timer fire and the close (e.g. an auto-play AI move that happened during those 600ms) would be lost. The unconditional form pays a redundant write in the common case (cheap — `localStorage.setItem` of an already-current state is ~microseconds) but guarantees the close-event always captures the latest state.

`flushSave()` must:

- Read the latest state from `stateRef.current`.
- Write synchronously to `localStorage`.
- Clear any pending debounce timer so it can't later overwrite a more recent flush.

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

**Defaults.** `DEFAULT_LIFETIME_STATS` zeros every counter except the four "extremum" fields, which start as `null`:

- `biggestSingleGain: null` — first observed gain replaces null; subsequent updates take `Math.max`.
- `biggestSingleLoss: null` — first observed loss replaces null; subsequent updates take `Math.min` (losses are negative).
- `bestEndingBalance: null` — first finished game's ending balance replaces null; subsequent updates take `Math.max`.
- `worstEndingBalance: null` — first finished game's ending balance replaces null; subsequent updates take `Math.min`.
- `lifetimeUpdatedFor: null`.

`null` is preferred over `±Infinity` so the UI can render "—" before any game is played without a sentinel-value check. `mergeLifetime` must short-circuit the `Math.min`/`Math.max` calls when the prior value is `null`.

### 7.3 Counter semantics

Human-only counters:

- `gamesPlayed`: increments at game over.
- `gamesWon`: human final score equals the highest final score. Shared first place counts as a win.
- `roundsPlayed`: increments per completed round.
- `roundsWon`: increments when the human wins a round by Hu.
- `roundsDianpaoGiven`: increments when the human discards the winning tile.
- `smallHu` and `largeHu`: mutually exclusive win-type counters; together they equal `roundsWon`.
- `zimoHu` and `sevenPairsHu`: independent counters that may overlap with `smallHu` or `largeHu`.
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

When `gameOverAcknowledged` flips to true:

1. Load current lifetime stats.
2. If `lifetimeUpdatedFor === state.gameId`, no-op.
3. Compute delta from the just-finished game.
4. Merge and save.
5. Set `lifetimeUpdatedFor` to `state.gameId`.

### 7.6 UI

Add a `Stats` button on the menu.

Stats modal tabs or sections:

- Games
- Wins
- Records
- Streaks
- Achievements, once Feature 4 ships

Include a `Reset stats` action with confirmation.

### 7.7 Acceptance criteria

- Stats survive refresh and new sessions.
- Stats update once per finished game, not once per render.
- Shared first place counts as `gamesWon`.
- `smallHu + largeHu === roundsWon`.
- `zimoHu` and `sevenPairsHu` can cause total Hu-type counters to exceed `roundsWon`.
- Reset stats requires confirmation and restores the default zeroed shape.

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

**Future extensibility.** If training-mode-specific achievements ever appear (e.g., "win 5 games using hints"), extend `mode` with `"training"` and `"non-training"` rather than re-introducing predicate-level gating. Keeping the framework filter authoritative is the same principle that drove the `purist` decision in §8.6 — don't dilute it.

Predicate context:

```js
{
  state,
  lifetime,
  latestRoundResult,
  roundResults
}
```

### 8.5 Seed achievement list

Normal / any:

- `first_hu`: first Hu.
- `first_large_hu`: first Large Hu.
- `first_seven_pairs`: first Seven Pairs win.
- `first_zimo`: first Zimo.
- `wins_10`: ten games won.
- `wins_50`: fifty games won.
- `no_claim_win`: win a round without claiming discards.
- `bankrupt_table`: end a game with all three AIs negative.
- `last_tile`: Hu on the last wall tile.
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

**Data requirement.** This predicate needs per-round cumulative standings, not just per-round outcomes. Today's `roundResults` shape (as appended by `applyWin`) captures the resolution of each round but not the four-player cumulative scores after that round. Before this achievement can ship, extend the entry shape to:

```js
{
  // ...existing fields (winner, winType, delta, etc.)
  scoresAfter: [number, number, number, number]
}
```

`scoresAfter` is computed inside `applyWin` (or the round-end branch of the engine wrappers, post-extraction) from the pre-round scores plus the resolved deltas. With that field present, the predicate is:

```js
const lowRounds = roundResults.filter(r =>
  r.scoresAfter[0] === Math.min(...r.scoresAfter)
).length;
const humanWon = state.scores[0] === Math.max(...state.scores);
return humanWon && lowRounds >= Math.ceil(state.totalRounds / 2);
```

Without `scoresAfter`, `comeback_kid` cannot be implemented honestly; do not ship it against a `state.scores`-only approximation that conflates final standings with mid-game standings.

`purist` is registered with `mode: "normal"`, so the achievement framework already filters out daily games before the predicate is called. The predicate itself is then minimal:

```js
humanWon && state.hintUsedThisGame === false
```

The daily exclusion lives in `mode: "normal"`, not in the predicate. Don't add a `state.dailyGame !== true` clause here — it would be redundant with the `mode` filter and would suggest the framework's mode handling isn't load-bearing, which is the whole point of having a `mode` field.

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
  if (crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
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

### 9.3.1 Existing `Math.random` call sites (audit checklist)

Exhaustive inventory at time of writing — every one of these must be addressed during Feature 5 implementation:

| File | Line | Purpose | Fix |
|---|---:|---|---|
| `js/tiles.jsx` | 47 | `createTile` id | Replace with caller-supplied deterministic id (see §9.4) |
| `js/tiles.jsx` | 108 | `shuffle` swap | Thread `rng` argument as above |
| `js/names.jsx` | 62 | `pickN` Fisher-Yates | Thread `rng` argument; signature becomes `pickN(pool, count, rng)` |
| `js/names.jsx` | 76 | `pickPlayerNames` group pick | Thread `rng` argument; signature becomes `pickPlayerNames(groups, count, rng)` |
| `js/ai.jsx` | 476 | `assignPersonalities` shuffle | See §9.3.2 — also fix the biased-sort bug |

Confirmed by inspection: `aiChooseDiscard` and `aiDecideClaim` contain **no** `Math.random` calls. No change needed in those functions.

### 9.3.2 Fix the biased sort in `assignPersonalities`

The current implementation at `ai.jsx:476` is:

```js
const shuffled = [...PERSONALITY_POOL].sort(() => Math.random() - 0.5);
```

This has two independent bugs:

1. **Non-deterministic.** Reads `Math.random` — breaks daily-wall and replay invariants once they exist.
2. **Non-uniform.** `Array.prototype.sort` with a non-deterministic comparator violates the sort contract and produces a biased permutation distribution (well-documented; v8 in particular skews heavily). This is a real bug independent of determinism — some personality assignments are systematically more likely than others.

Fix both at once:

```js
function assignPersonalities(rng) {
  const arr = [...PERSONALITY_POOL];
  shuffle(arr, rng);  // proper Fisher-Yates from tiles.jsx, threaded rng
  return [null, arr[0], arr[1], arr[2]];  // seat 0 is human
}
```

Call site is `createInitialState` (`game-state.jsx:9`) — thread `cosmeticRng` per §9.6.

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

#### 9.4.1 What "current board state" means for the admin id scan

The collision-floor scan must look at every place a tile id can live. Exhaustive list:

- `state.players[i].hand` for each seat
- `state.players[i].openMelds[j].tiles` for each seat / meld
- `state.players[i].discards` for each seat
- `state.wall`
- `state.lastDiscard`
- `state.lastDrawn`

`state.lastDrawn` is included as belt-and-braces. Under normal flow it always points to a tile also present in the drawer's hand, so the hand scan catches it transitively. But `applyAdmin` rebuilds player hands wholesale and can leave a stale `lastDrawn` reference pointing at a tile no longer present anywhere else — the scan would miss it, and the next admin invocation could mint a colliding id. Scanning `lastDrawn` is cheaper than remembering to null it inside `applyAdmin`.

Parse each `t.id` as `parseInt(id, 10)`; treat non-numeric ids (from pre-Feature-5 saves) as `-1`. The floor at `1000` then handles the case where every existing id is non-numeric.

#### 9.4.2 Admin tile ID reuse and FLIP refs

The scan only considers *currently present* tiles. If an admin pass removes a tile, its ID is released — a later admin pass scanning the board may mint a fresh tile with the same numeric ID, because nothing in state remembers that the ID was ever used. Under normal play this is harmless. Under animation it is not: §10.5 FLIP refs key off `tile.id`, and `tileRefsRef.current` may still hold a stale ref slot from the removed tile if cleanup hasn't run yet.

**Resolution:** track admin-minted IDs at match scope so they're never reused within a match.

```js
state.usedAdminIds = []  // array of numeric ids minted by any applyAdmin in this match
```

`applyAdmin` computes its starting floor as `max(scannedMax + 1, 1000, max(state.usedAdminIds) + 1)` and appends every newly minted id to `state.usedAdminIds` before returning. Persists across rounds (lives on match-scope game info, like `gameId`).

Acceptable alternative: no tracking, but document that admin-touched matches set `state.adminTouched = true` (which they already do per §6.2) and that animation glitches in admin-touched matches are an acknowledged non-bug. Pick one and apply it consistently.

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

`createInitialState(windRounds = 1, lang = "en", seed)` must run in this order:

1. Determine `matchSeed = (seed ?? randomUint32()) >>> 0`.
2. Build `cosmeticRng = seededRng((matchSeed ^ 0x9E3779B9) >>> 0)`.
3. Assign personalities and player names from `cosmeticRng`.
4. Assemble match-level `gameInfo` including `matchSeed`.
5. Compute `roundSeed = seedForRound(matchSeed, 1)`.
6. Call `initRound(gameInfo, lang, roundSeed)`.

### 9.7 Split deck RNG from cosmetic RNG

Daily challenge must produce the same wall regardless of each user’s local custom name groups.

Therefore:

- `deckRng` is derived from `roundSeed` and only shuffles the deck.
- `cosmeticRng` is derived from `matchSeed ^ constant` and is allowed to vary based on local name/personality consumption.

### 9.8 Daily seed

Daily date key:

```js
new Date().toISOString().slice(0, 10)
```

This is UTC by design.

**Capture point.** The date string is captured exactly once, when `createInitialState` is called for a daily game, and stored on state:

```js
state.dailyDate = "YYYY-MM-DD"  // UTC, frozen at game-start
```

All subsequent reads — the seed derivation, the result-storage key in `mahjong_daily.results`, the UI "today's daily" label, the `already-played` check on game-over — must read `state.dailyDate`, not recompute `new Date().toISOString().slice(0, 10)`.

This prevents a midnight-UTC flip mid-game from re-keying an in-progress daily as the next day's. It also means a player starting at 23:55 UTC continues playing "today's" daily after the UTC rollover — by intent. The menu's "today's daily" affordance, however, *does* recompute the current UTC date each render so the menu reflects the current day's challenge after rollover.

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

### 9.9 Daily result storage

```js
localStorage["mahjong_daily"] = {
  v: 1,
  results: {
    [YYYY_MM_DD_UTC]: {
      played: true,
      finalScore,
      rank
    }
  }
}
```

If already played today:

- Show previous result.
- Allow `Play again`, but mark it as non-recording.

### 9.10 Resume save migration

When deterministic tile IDs ship, bump `mahjong_in_progress.v` from `1` to `2`.

Old saves should be discarded rather than migrated.

### 9.11 Acceptance criteria

- Same UTC date produces the same initial wall across browsers and users.
- Custom local player names do not affect wall order.
- Daily challenge uses fixed difficulty and round settings.
- Daily challenge disables training mode.
- Daily results are keyed by UTC date.
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

- `draw`: generic slide-in, no DOM measurement.
- `discard`: FLIP animation from hand tile position to discard pool position.
- `claim-pop`: scale and gold flash.
- `win-shimmer`: sweeping gold gradient over winning hand.

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

Precondition:

- All tile JSX should use `key={tile.id}`, not index keys.

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
- `tile_select.mp3`
- `bgm_loop.mp3`

Use CC0 or generated assets.

Size target:

- SFX only: around 200–400KB.
- SFX + BGM: ideally under 900KB.
- If size becomes a problem, ship SFX first and defer BGM.

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

#### 12.6.2 React Strict Mode verification

Strict Mode is not currently enabled in this codebase, so this is a future concern rather than an immediate blocker. **If Strict Mode is ever turned on**, re-test:

- The `prevResolutionRef` comparison: refs persist across Strict Mode's intentional double-effect-run, so the SFX should fire once. First invocation sees `prev = null`, fires, writes ref to non-null. Second invocation sees `prev = non-null`, no-ops.
- The Case B side-channel consumption: `mahjong_last_announced` is read from `localStorage` inside the effect body and the `suppressNextResolutionSfx` flag is consumed on the next transition. Strict Mode's double-run could consume the flag twice in succession — verify that the second run finds the flag already cleared and behaves correctly.

Acceptance criterion if Strict Mode is enabled: refresh inside the <500ms debounce window after a win, with Strict Mode on, fires exactly one resolution SFX (not zero, not two).

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
stepDraw(state, seat)
stepDiscard(state, seat, tileId)
stepClaim(state, claim)
stepDeclareHu(state, seat)
stepDeclareGang(state, seat, tileKey)
stepResolvePass(state)
```

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

For action-emitting live handlers, merge these in one `setState(prev => ...)` callback:

1. Pure step result.
2. `state.actionLog` append.
3. Human-readable `state.log` append.
4. `persistRev` increment.

Do not split state transition and action-log append into separate `setState` calls.

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
{ seat, type: "draw", tileId }
{ seat, type: "discard", tileId }
{ seat, type: "claim", claimType, tileIds }
{ seat, type: "declare_hu", winType, winningTileId, discarder }
{ seat, type: "declare_gang", tileKey, source }
{ seat, type: "resolve_pass" }
```

### 13.7 Acceptance criteria

- A full game can be completed after extraction with no behaviour regressions.
- Engine step functions are callable without React component context.
- Step functions do not write logs or trigger UI side effects.
- Action log entries align exactly with produced state transitions.
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

Round-start snapshot:

```js
state.roundStartInfo = {
  dealer,
  roundWind,
  roundNumber,
  totalRounds,
  windRounds,
  scores,
  roundResults,
  personalities,
  playerNames,
  nameGroup
}
```

`roundStartInfo` is written by `initRound` and persists through resume saves.

### 14.3 Replay storage

```js
localStorage["mahjong_replays"] = {
  v: 1,
  games: [
    {
      id,
      startedAt,
      matchSeed,
      roundsByNumber: {
        [roundNumber]: {
          roundSeed,
          gameInfo,
          actions
        }
      }
    }
  ]
}
```

`id` equals `state.gameId`.

### 14.4 Write timing

At round end:

1. Persist `roundsByNumber[roundNumber]` using `state.roundStartInfo`, `state.roundSeeds[roundNumber]`, and a copy of `state.actionLog`.
2. Clear `state.actionLog` in the live state.
3. Only then allow `nextRound` to overwrite `roundStartInfo`.

Current manual Next Round flow makes this naturally safe, but future auto-advance features must explicitly wait for replay persistence.

### 14.5 Eviction

Keep the last 10 replayable games.

Evict only when appending a new game entry, not on every mid-game round update.

Do not create an empty replay stub at game start; doing so would evict older finished games before the new game has replayable content.

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
function replayRound(roundSeed, gameInfo, actions, upToActionIdx) {
  let state = initRound(gameInfo, lang, roundSeed);
  for (const action of actions.slice(0, upToActionIdx + 1)) {
    state = applyReplayAction(state, action);
  }
  return state;
}
```

Rules:

- Rebuild from seed and action log.
- Do not pass both a seed and a full initial state.
- Do not run live wrappers.
- Do not emit logs, audio, reactions, or live-game side effects.

### 14.8 Admin-touched games

Admin-touched games (`state.adminTouched === true`, set inside `applyAdmin` per §6.2) cannot be replayed — admin overrides bypass the action log, so the replay engine has no actions to re-run. Detect and handle:

- In the round-over modal: hide the Replay tab entirely, or render it with a `"Replay unavailable — game was modified via admin console"` placeholder.
- In the game-over modal's `Replay any round` picker: omit admin-touched games from the picker list.

The `adminTouched` flag is *match-scope* — once any round of a match has been admin-modified, the entire match's replay is unreliable (subsequent rounds may inherit corrupted scores or dealer rotation that the replay engine can't reproduce). Don't try to replay specific non-admin rounds of an admin-touched match.

### 14.9 UI

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

### 14.10 Acceptance criteria

- A completed round can be replayed from action 0 to final action.
- Replay result at final action matches the live final round state.
- Replay does not play SFX.
- Replay does not create new logs.
- Replay does not re-fire AI reactions.
- Replay works after resuming mid-game.
- Replay UI fits on a 360px-wide viewport.
- Old replay entries are evicted down to 10 games.
- Admin-touched games (`state.adminTouched === true`) are excluded from the replay UI; resume still works for them.

---

## 15. Cross-feature interaction rules

### 15.1 Training mode × stats and achievements

Training-mode games count toward lifetime stats and achievements.

Exception:

- `purist` requires `state.hintUsedThisGame === false`.

### 15.2 Daily challenge × training mode

Daily challenge forces `trainingMode = false` for fairness.

The saved menu preference is not overwritten; daily mode only overrides the setting for that game.

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

---

## 18. Storage key registry

| Key | Versioned | Helper | Owner | Purpose |
|---|---:|---|---|---|
| `mahjong_training_mode` | No | `loadString`/`saveString` | Training mode | Boolean menu setting stored as string |
| `mahjong_in_progress` | Yes | `loadJson`/`saveJson` | Resume | Current resumable game |
| `mahjong_lifetime_stats` | Yes | `loadJson`/`saveJson` | Stats | Lifetime counters |
| `mahjong_achievements` | Yes | `loadJson`/`saveJson` | Achievements | Unlocked badge dates |
| `mahjong_daily` | Yes | `loadJson`/`saveJson` | Daily challenge | Daily results by UTC date |
| `mahjong_audio` | Yes | `loadJson`/`saveJson` | Audio | Volume and mute settings |
| `mahjong_last_announced` | Yes | `loadJson`/`saveJson` | Audio/resume | Resolution-SFX suppression side channel |
| `mahjong_replays` | Yes | `loadJson`/`saveJson` (with quota fallback, §14.5.1) | Replay | Finished-round replay data |

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
- Refresh on round-over modal.
- Refresh on game summary.
- Corrupt each structured localStorage key and confirm app recovers.
- Bump schema versions and confirm old payloads are discarded.

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
