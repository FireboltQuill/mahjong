# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project shape

Single-page Mahjong game. `index.html` is now a slim shell (HTML, CSS, CDN imports) and the app code is split across `js/*.jsx` files loaded as ordered `<script type="text/babel" src="...">` tags. React 18 and Babel-standalone are loaded from CDN; JSX is compiled in the browser at runtime. There is no `package.json`, no bundler, no test framework, and no linter.

Each `.jsx` file is a regular script (not an ES module). Top-level functions and constants land in the shared script scope, so later files can reference declarations from earlier files. **Load order in `index.html` matches the dependency order** — change the order only if you also change the dependencies.

Deployed via GitHub Pages straight from `main` — pushing to `origin/main` updates the live site. The local working tree's parent folder is named `Untitled` for historical reasons; the repo root is the directory containing `index.html`, `CLAUDE.md`, and `js/`.

To run locally: **serve the directory** (`python3 -m http.server`) and open `http://localhost:8000/`. Opening `index.html` directly via `file://` may fail because babel-standalone fetches each external script and some browsers block that on `file://`.

## File map

```
index.html         shell: HTML/CSS, CDN scripts, ordered script tags
js/
  tiles.jsx        TILE SYSTEM — constants, glyphs, tile factory, sortHand
  lang.jsx         LOCALIZATION — LANG.en + LANG.zh, all user-facing strings
  parsers.jsx      TILE SHORT-SPEC PARSING — admin tile/meld parsers
  validation.jsx   HAND VALIDATION — decompose, isSevenPairs, validateHu, checkWinWithTile
  claims.jsx       CLAIM DETECTION — findChi/Peng/Gang/ConcealedGangs
  ai.jsx           AI LOGIC — evaluators, dispatch, personalities
  scoring.jsx      SCORING — small/large Hu base, modifier stacking, applyWin
  game-state.jsx   GAME STATE — createInitialState, initRound, SEAT_* constants
  styles.jsx       STYLES — color constants, calcScale, computeDiscardOverride, makeStyles
  main.jsx         MAIN COMPONENT — MahjongGame, all turn handlers, ReactDOM render
```

Dependency direction (earlier-listed files don't depend on later ones):

```
tiles ─┬─ parsers ─┐
       ├─ validation ─┬─ claims ─┐
       ├──────────────┼──────────┴─ ai ──┐
       └──────────────┴──── scoring ─────┤
                                         ├─ game-state ──┐
       lang ─────────────────────────────┘               │
       styles ───────────────────────────────────────────┴─ main
```

## Per-file notes

- **tiles.jsx** — `createTile`, `createDeck`, `sortHand`, `tileKey`, `tilesMatch`, `tileSymbol`, `tileName`, `tileColor`. Tile objects are `{ suit, rank, honor, id }`; `id` is a random string used for identity comparisons throughout (don't compare tiles by reference). Tiles render as Unicode mahjong glyphs (U+1F000–U+1F02B) wrapped in a span with a CSS `color` tint per suit/honor (`SUIT_COLOR`, `DRAGON_COLOR`, `WIND_COLOR`). U+1F004 (red dragon) is forced into text presentation via `︎` so it doesn't render as a color emoji like the others. `tileDisplay` is dead code (left over from a previous text-tile fallback).
- **lang.jsx** — `LANG.en` and `LANG.zh`. Every user-facing string lives here, including log message functions like `logDiscard(name, tile)`. When you add UI text, add both `en` and `zh` entries.
- **parsers.jsx** — `parseTileSpec`, `parseTileList`, `tileToSpec`, `parseMeld`, `parseMeldList`, `meldToSpec`. Compact text format for the admin console: `b1`–`b9` bamboo, `c1`–`c9` characters, `d1`–`d9` dots, `E S W N` winds, `R G P` dragons. Melds use `type:tile tile tile`, multiple separated by `;`, and `!` after the type marks the meld concealed.
- **validation.jsx** — `decompose` (recursive backtracking into melds+pair), `isSevenPairs`, `validateHu`, `checkWinWithTile`. House rules are enforced inside `validateHu`:
  1. all three suits present across melds + pair
  2. ≥1 meld contains a terminal (1/9) or honor tile
  3. ≥1 *claimed* open meld (concealed gang does **not** count; Seven Pairs path waives this)
- **claims.jsx** — `findChiOptions`, `findPengOption`, `findGangOption`, `findConcealedGangs`.
- **ai.jsx** — two evaluators (`evaluateHandProgressEasy`, `evaluateHandProgressExpert`) plus the dispatch fns `aiChooseDiscard` / `aiDecideClaim`. Difficulty `medium` reuses expert eval with relaxed thresholds and half-weighted defense. Expert AI is house-rule-aware (scores +/- for the three rules above) and tracks visible tiles via `gatherVisible(players)` for defense and `tilesRemaining`. Personalities (`generic` / `aggressive` / `defensive` / `adaptive`) live in `PERSONALITIES` and adjust claim thresholds and defense weight; `adaptive` is computed per turn from wall ratio and opponent threat in `getAdaptiveConfig`. `assignPersonalities` also lives here.
- **scoring.jsx** — `BASE_SMALL_HU = 10`, `BASE_LARGE_HU = 20`, `STARTING_PER_ROUND = 25` (initial bankroll = `totalRounds × 25`). `countWinningTileKinds` powers large-Hu detection (a Large Hu is a single-wait — exactly one distinct tile kind would have completed the 13-tile state). `buildWinInfo` builds the win descriptor (`type`, `winningTile`, `discarder`, `sevenPairs`, `largeHu`). `computeScoreDeltas` returns the per-loser multiplier — ×2 for each of: loser has no claimed open meld, loser discarded the winning tile, win was a zimo, win was seven pairs. `applyWin` writes `winner` / `winInfo` / `scoreBreakdown` / `scores` onto state. Negative scores are allowed (no clamping); score chips on the top bar and opponent strips render red when below 0.
- **game-state.jsx** — `SEAT_WINDS`, `SEAT_LABELS`, `createInitialState`, `initRound`. State is immutable: every transition returns a new object via `setState((prev) => ...)`. Notable fields on state:
  - `roundResults` — one entry per finished round, populated by a `useEffect` in main.jsx watching `winner`/`isDraw`. Used by the game-over Stats tab and the round-history list.
  - `winInfo`, `scoreBreakdown` — written by `applyWin`, consumed by the round-over modal.
  - `lastDrawn` — the most recent draw (regular or concealed-gang replacement). `handleDeclareHu` reads this to know the winning tile for large-Hu detection.
- **styles.jsx** — color constants (`gold`, `goldDim`, `green`, `greenDim`, `bg`, `bgLight`, `felt`), `calcScale`, `computeDiscardOverride`, `makeStyles(vw, vh)` returns a style dict scaled to viewport. The styles are recomputed on resize via `winSize` state in main.jsx; don't hardcode pixel values, route them through the `s()` / `ts()` scalers.
- **main.jsx** — `MahjongGame` component (the React UI and all turn handlers) plus the `ReactDOM.createRoot(...).render(...)` call at the very bottom. `TileFace` is also defined here but dead. See "State machine" and "Modals" below.

## State machine and turn flow

`state.phase` is one of `"draw"`, `"discard"`, `"claim"`. `state.currentTurn` is the seat index (0–3); seat 0 (`PLAYER_IDX`) is always the human. Turn order is **counter-clockwise**: `next = (currentTurn + 1) % 4`.

AI auto-play runs from a `useEffect` watching `currentTurn`/`phase`/etc.; it calls `processAIAction` on a 600ms timer. The same effect is also what drives `resolveClaims` after a discard (phase becomes `"claim"`).

Claim priority is **Hu > Gang > Peng > Chi**, and chi is only allowed from the seat immediately after the discarder (`(discarder + 1) % 4`). `resolveClaims` walks all non-discarder seats in priority order; if the human can claim, it sets `awaitingPlayerClaim` and waits for `handlePlayerClaim`. Declined claim types are tracked in `playerDeclinedClaims` so the same prompt doesn't reappear for the same discard.

## Round-over and game-over modals

Both modals use a tab bar + a CSS grid-stack (`tabPanes`/`tabPane`/`tabPaneHidden`): every pane renders into the same grid cell so the modal sizes to the tallest pane, and inactive panes are hidden via `visibility: hidden` + `pointerEvents: none` + `aria-hidden`. Switching tabs no longer resizes the box.

- **Round-over** (`roundOver && !gameOverAcknowledged`) — three tabs:
  - **Who Won** — winner / draw header, win-type badge (Zimo or Dianpao + Small or Large Hu), winning hand with the winning tile highlighted (gold drop-shadow on the actual glyph, not its em-box).
  - **Scoring** — per-loser breakdown (base + applied modifiers + delta + running total). Draws show "no points exchanged".
  - **Stats** — round header (round X of Y, prevailing wind, dealer), wall tiles remaining, winner's AI personality (medium/expert only), current standings.
  - Action button: Next Round, or on the final round Game Summary → which sets `gameOverAcknowledged`.
- **Game-over** (`gameOver && gameOverAcknowledged`) — two tabs:
  - **Standings** — final ranked scores, broke scores red, winner trophy.
  - **Stats** — per-player grid (Wins, Small/Large Hu, Zimo, 7 Pairs, Dianpao given, Biggest gain/loss), biggest single haul of the match, bankruptcy callout (first round each player went below 0), full round history.

## Admin console

A 🔧 button on both the start menu and the in-game top bar opens `renderAdminOverlay` (defined in main.jsx). It edits per-player hand / open melds / discards / score, plus current turn, phase, and the wall's next tiles. `applyAdmin` rewrites those fields, prepends the wall input to the existing wall (dropping an equal count from the front), clears stale references (`lastDiscard`, `lastDrawn`, `awaitingPlayerClaim`, `winner`, `winInfo`, `scoreBreakdown`, `isDraw`), and derives `turnDrawn` from the chosen phase (`discard` → true, `draw`/`claim` → false) so the game doesn't end up in a stuck state where the player can neither draw nor discard.

## Things that bite

- **Stale state inside `setState` callbacks.** `lang` and `difficulty` are mirrored into `langRef` / `diffRef` because the callbacks need the *current* value, not the closed-over one. Use `_L()` / `_TN()` / `_SL()` (the underscore-prefixed helpers) inside any logic that builds log messages from within a state updater. The non-underscored `L`, `TN`, `SL` are fine in render code.
- **Tile identity uses `id`.** Use `tilesMatch(a, b)` (compares `tileKey`) for *kind* equality and `a.id === b.id` for the *specific tile*. Filtering a hand to remove a claimed tile always goes through `id`.
- **Concealed gang ≠ open meld.** `m.claimed` is the flag that satisfies House Rule 3 and the no-open-meld scoring modifier, not `openMelds.length > 0`. Concealed gangs have `concealed: true` and live in `openMelds` but with `claimed: false`.
- **Seven Pairs is a separate branch in `validateHu`.** It requires fully concealed (no entries in `openMelds`) and still enforces Rules 1 & 2.
- **Large Hu is a single-wait check, not a hand-shape check.** It's computed by enumerating all 34 tile kinds against `checkWinWithTile` against the 13-tile state (after subtracting the actual winning tile). Anything that changes `validateHu` will silently shift the Large/Small split.
- **The winning tile must be findable by `id`** at the point `applyWin` runs. For player zimo (`handleDeclareHu`), this comes from `state.lastDrawn`, which is set on every draw including the concealed-gang replacement. If you add a new code path that hands the player a 14th tile, set `lastDrawn` too or the large-Hu highlight will land on an arbitrary tile.
- **No build step means no JSX outside what babel-standalone can transform.** All `js/*.jsx` files are processed at runtime via `<script type="text/babel" src="...">`. Adding a new file? Drop a new script tag in `index.html` *after* its dependencies. Don't add a `package.json` unless that's the explicit ask.
- **`file://` won't work locally.** Babel-standalone fetches each external script, and browsers block fetch on `file://` by default. Use `python3 -m http.server` (or any static server) for local dev. GitHub Pages serves over `http(s)://`, so production is fine.
