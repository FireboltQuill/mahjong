# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project shape

Single-page Mahjong game. The entire app — game logic, AI, React UI, styles — lives in `index.html` (~3500 lines). React 18 and Babel-standalone are loaded from CDN; JSX is compiled in the browser at runtime. There is no `package.json`, no bundler, no test framework, and no linter.

Deployed via GitHub Pages straight from `main` — pushing to `origin/main` updates the live site. The local working tree's parent folder is named `Untitled` for historical reasons; the repo root is the directory containing `index.html` and this file.

To run locally: open `index.html` directly in a browser, or serve the directory (`python3 -m http.server`) and navigate to `index.html`.

## Code map inside index.html

The file is divided by `// ===` banner comments. Search for the banner text to jump to a section:

- **TILE SYSTEM** — `createTile`, `createDeck`, `sortHand`, `tileKey`, `tilesMatch`, `tileSymbol`, `tileName`, `tileColor`. Tile objects are `{ suit, rank, honor, id }`; `id` is a random string used for identity comparisons throughout (don't compare tiles by reference). Tiles render as Unicode mahjong glyphs (U+1F000–U+1F02B) wrapped in a span with a CSS `color` tint per suit/honor (`SUIT_COLOR`, `DRAGON_COLOR`, `WIND_COLOR`). U+1F004 (red dragon) is forced into text presentation via `︎` so it doesn't render as a color emoji like the others. `TileFace` and `tileDisplay` are still defined but unused — leftovers from a previous text fallback.
- **LOCALIZATION** — `LANG.en` and `LANG.zh`. Every user-facing string lives here, including log message functions like `logDiscard(name, tile)`. When you add UI text, add both `en` and `zh` entries.
- **TILE SHORT-SPEC PARSING** — `parseTileSpec`, `parseTileList`, `tileToSpec`, `parseMeld`, `parseMeldList`, `meldToSpec`. Compact text format for the admin console: `b1`–`b9` bamboo, `c1`–`c9` characters, `d1`–`d9` dots, `E S W N` winds, `R G P` dragons. Melds use `type:tile tile tile`, multiple separated by `;`, and `!` after the type marks the meld concealed.
- **HAND VALIDATION** — `decompose` (recursive backtracking into melds+pair), `isSevenPairs`, `validateHu`, `checkWinWithTile`. House rules are enforced inside `validateHu`:
  1. all three suits present across melds + pair
  2. ≥1 meld contains a terminal (1/9) or honor tile
  3. ≥1 *claimed* open meld (concealed gang does **not** count; Seven Pairs path waives this)
- **CLAIM DETECTION** — `findChiOptions`, `findPengOption`, `findGangOption`, `findConcealedGangs`.
- **AI LOGIC** — two evaluators (`evaluateHandProgressEasy`, `evaluateHandProgressExpert`) plus the dispatch fns `aiChooseDiscard` / `aiDecideClaim`. Difficulty `medium` reuses expert eval with relaxed thresholds and half-weighted defense. Expert AI is house-rule-aware (scores +/- for the three rules above) and tracks visible tiles via `gatherVisible(players)` for defense and `tilesRemaining`. Personalities (`generic` / `aggressive` / `defensive` / `adaptive`) live in `PERSONALITIES` and adjust claim thresholds and defense weight; `adaptive` is computed per turn from wall ratio and opponent threat in `getAdaptiveConfig`.
- **SCORING** — `BASE_SMALL_HU = 10`, `BASE_LARGE_HU = 20`, `STARTING_PER_ROUND = 25` (initial bankroll = `totalRounds × 25`). `countWinningTileKinds` powers large-Hu detection (a Large Hu is a single-wait — exactly one distinct tile kind would have completed the 13-tile state). `buildWinInfo` builds the win descriptor (`type`, `winningTile`, `discarder`, `sevenPairs`, `largeHu`). `computeScoreDeltas` returns the per-loser multiplier — ×2 for each of: loser has no claimed open meld, loser discarded the winning tile, win was a zimo, win was seven pairs. `applyWin` writes `winner` / `winInfo` / `scoreBreakdown` / `scores` onto state. Negative scores are allowed (no clamping); score chips on the top bar and opponent strips render red when below 0.
- **GAME STATE** — `createInitialState`, `initRound`. State is immutable: every transition returns a new object via `setState((prev) => ...)`. Notable fields on state:
  - `roundResults` — one entry per finished round, populated by a `useEffect` watching `winner`/`isDraw`. Used by the game-over Stats tab and the round-history list.
  - `winInfo`, `scoreBreakdown` — written by `applyWin`, consumed by the round-over modal.
  - `lastDrawn` — the most recent draw (regular or concealed-gang replacement). `handleDeclareHu` reads this to know the winning tile for large-Hu detection.
- **MAIN COMPONENT** (`MahjongGame`) — the React component and all turn handlers. See "State machine" and "Modals" below.
- **STYLES** — `makeStyles(vw, vh)` returns a style dict scaled to viewport. The styles are recomputed on resize via `winSize` state; don't hardcode pixel values, route them through the `s()` / `ts()` scalers.

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

A 🔧 button on both the start menu and the in-game top bar opens `renderAdminOverlay`. It edits per-player hand / open melds / discards / score, plus current turn, phase, and the wall's next tiles. `applyAdmin` rewrites those fields, prepends the wall input to the existing wall (dropping an equal count from the front), clears stale references (`lastDiscard`, `lastDrawn`, `awaitingPlayerClaim`, `winner`, `winInfo`, `scoreBreakdown`, `isDraw`), and derives `turnDrawn` from the chosen phase (`discard` → true, `draw`/`claim` → false) so the game doesn't end up in a stuck state where the player can neither draw nor discard.

## Things that bite

- **Stale state inside `setState` callbacks.** `lang` and `difficulty` are mirrored into `langRef` / `diffRef` because the callbacks need the *current* value, not the closed-over one. Use `_L()` / `_TN()` / `_SL()` (the underscore-prefixed helpers) inside any logic that builds log messages from within a state updater. The non-underscored `L`, `TN`, `SL` are fine in render code.
- **Tile identity uses `id`.** Use `tilesMatch(a, b)` (compares `tileKey`) for *kind* equality and `a.id === b.id` for the *specific tile*. Filtering a hand to remove a claimed tile always goes through `id`.
- **Concealed gang ≠ open meld.** `m.claimed` is the flag that satisfies House Rule 3 and the no-open-meld scoring modifier, not `openMelds.length > 0`. Concealed gangs have `concealed: true` and live in `openMelds` but with `claimed: false`.
- **Seven Pairs is a separate branch in `validateHu`.** It requires fully concealed (no entries in `openMelds`) and still enforces Rules 1 & 2.
- **Large Hu is a single-wait check, not a hand-shape check.** It's computed by enumerating all 34 tile kinds against `checkWinWithTile` against the 13-tile state (after subtracting the actual winning tile). Anything that changes `validateHu` will silently shift the Large/Small split.
- **The winning tile must be findable by `id`** at the point `applyWin` runs. For player zimo (`handleDeclareHu`), this comes from `state.lastDrawn`, which is set on every draw including the concealed-gang replacement. If you add a new code path that hands the player a 14th tile, set `lastDrawn` too or the large-Hu highlight will land on an arbitrary tile.
- **No build step means no JSX outside `index.html`.** If you extract code into a separate file, you have to either inline-script it (and Babel-transform it) or introduce a real build pipeline. Don't add a `package.json` unless that's the explicit ask.
- The bottom of `index.html` calls `ReactDOM.createRoot(...).render(...)` three times in a row. The duplicates are dead but harmless; remove them if you're touching that area.
