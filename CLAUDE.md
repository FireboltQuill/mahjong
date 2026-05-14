# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project shape

Single-page Mahjong game. The entire app — game logic, AI, React UI, styles — lives in `index.html` (~2400 lines). React 18 and Babel-standalone are loaded from CDN; JSX is compiled in the browser at runtime. There is no `package.json`, no bundler, no test framework, and no linter.

Deployed via GitHub Pages straight from `main` — pushing to `origin/main` updates the live site. The local working tree's parent folder is named `Untitled` for historical reasons; the repo root is the directory containing `index.html` and this file.

To run locally: open `index.html` directly in a browser, or serve the directory (`python3 -m http.server`) and navigate to `index.html`.

## Code map inside index.html

The file is divided by `// ===` banner comments. Search for the banner text to jump to a section:

- **TILE SYSTEM** — `createTile`, `createDeck`, `sortHand`, `tileKey`, `tileDisplay`. Tile objects are `{ suit, rank, honor, id }`; `id` is a random string used for identity comparisons throughout (don't compare tiles by reference). Tile faces render as `<img>` from the FluffyStuff CDN SVGs; `TileFace` is a text-based fallback.
- **LOCALIZATION** — `LANG.en` and `LANG.zh`. Every user-facing string lives here, including log message functions like `logDiscard(name, tile)`. When you add UI text, add both `en` and `zh` entries.
- **HAND VALIDATION** — `decompose` (recursive backtracking into melds+pair), `isSevenPairs`, `validateHu`, `checkWinWithTile`. House rules are enforced inside `validateHu`:
  1. all three suits present across melds + pair
  2. ≥1 meld contains a terminal (1/9) or honor tile
  3. ≥1 *claimed* open meld (concealed gang does **not** count; Seven Pairs path waives this)
- **CLAIM DETECTION** — `findChiOptions`, `findPengOption`, `findGangOption`, `findConcealedGangs`.
- **AI LOGIC** — two evaluators (`evaluateHandProgressEasy`, `evaluateHandProgressExpert`) plus the dispatch fns `aiChooseDiscard` / `aiDecideClaim`. Difficulty `medium` reuses expert eval with relaxed thresholds and half-weighted defense. Expert AI is house-rule-aware (scores +/- for the three rules above) and tracks visible tiles via `gatherVisible(players)` for defense and `tilesRemaining`. Personalities (`generic` / `aggressive` / `defensive` / `adaptive`) live in `PERSONALITIES` and adjust claim thresholds and defense weight; `adaptive` is computed per turn from wall ratio and opponent threat in `getAdaptiveConfig`.
- **GAME STATE** — `createInitialState`, `initRound`. State is treated as immutable: every transition returns a new object via `setState((prev) => ...)`.
- **MAIN COMPONENT** (`MahjongGame`) — the React component and all turn handlers. See "State machine" below.
- **STYLES** — `makeStyles(vw, vh)` returns a style dict scaled to viewport. The styles are recomputed on resize via `winSize` state; don't hardcode pixel values, route them through the `s()` / `ts()` scalers.

## State machine and turn flow

`state.phase` is one of `"draw"`, `"discard"`, `"claim"`. `state.currentTurn` is the seat index (0–3); seat 0 (`PLAYER_IDX`) is always the human. Turn order is **counter-clockwise**: `next = (currentTurn + 1) % 4`.

AI auto-play runs from a `useEffect` watching `currentTurn`/`phase`/etc.; it calls `processAIAction` on a 600ms timer. The same effect is also what drives `resolveClaims` after a discard (phase becomes `"claim"`).

Claim priority is **Hu > Gang > Peng > Chi**, and chi is only allowed from the seat immediately after the discarder (`(discarder + 1) % 4`). `resolveClaims` walks all non-discarder seats in priority order; if the human can claim, it sets `awaitingPlayerClaim` and waits for `handlePlayerClaim`. Declined claim types are tracked in `playerDeclinedClaims` so the same prompt doesn't reappear for the same discard.

## Things that bite

- **Stale state inside `setState` callbacks.** `lang` and `difficulty` are mirrored into `langRef` / `diffRef` because the callbacks need the *current* value, not the closed-over one. Use `_L()` / `_TN()` / `_SL()` (the underscore-prefixed helpers) inside any logic that builds log messages from within a state updater. The non-underscored `L`, `TN`, `SL` are fine in render code.
- **Tile identity uses `id`.** Use `tilesMatch(a, b)` (compares `tileKey`) for *kind* equality and `a.id === b.id` for the *specific tile*. Filtering a hand to remove a claimed tile always goes through `id`.
- **Concealed gang ≠ open meld.** `m.claimed` is the flag that satisfies House Rule 3, not `openMelds.length > 0`. Concealed gangs have `concealed: true` and live in `openMelds` but with `claimed: false`.
- **Seven Pairs is a separate branch in `validateHu`.** It requires fully concealed (no entries in `openMelds`) and still enforces Rules 1 & 2.
- **No build step means no JSX outside `index.html`.** If you extract code into a separate file, you have to either inline-script it (and Babel-transform it) or introduce a real build pipeline. Don't add a `package.json` unless that's the explicit ask.
- The bottom of `index.html` calls `ReactDOM.createRoot(...).render(...)` three times in a row. The duplicates are dead but harmless; remove them if you're touching that area.
