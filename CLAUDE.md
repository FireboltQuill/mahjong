# Mahjong — project notes

Short reference so a fresh Claude Code session can pick up quickly. Not a spec; the
authoritative design doc is `MAHJONG_DESIGN_SPEC.md` at the repo root. Read that first
before touching gameplay code.

## Repo layout

- The git repo lives in this directory (`.../mahjong/Untitled/`), **not** the parent
  `mahjong/` folder — the parent isn't a git repo. `spec-kit/` alongside is unrelated.
- No bundler. `index.html` loads each `js/*.jsx` as a separate
  `<script type="text/babel">` transformed by babel-standalone in the browser.
  Script order in `index.html` is the dependency order (tiles → validation → claims
  → scoring → game-state → engine → main). Add new files to `index.html` in the
  right slot; there's no import graph.
- Shared global scope — functions defined in one file are callable from any later one.

## Deploy + branch workflow

- `main` deploys to GitHub Pages. Push to main = production.
- Roadmap work: one branch per phase (`phase-N-...`), sequential, merged to main
  before the next phase begins.
- Cosmetic / bugfix work: its own branch off main, one PR each.
- Spec-only edits go straight to main.
- `gh pr create` after pushing a branch. Squash-merge is the pattern (see `(#NN)` in
  main's log).

## Local dev + verification

```bash
python3 -m http.server 8765   # serve from this directory
open http://localhost:8765/
```

Headless verification via puppeteer (installed via npx, share the cache):

```bash
NODE_PATH=/Users/dylanwang/.npm/_npx/7d92d9a2d2ccc630/node_modules \
  node /tmp/your-test.js
```

For screenshots of specific UI states, drive the app with `page.evaluate` — the
Start Game button is the entry point, tile buttons are identifiable by matching
`/bamboo|dots|characters|dragon|wind/` in their text and by being in the bottom
third of the viewport.

## Audio placeholders

`audio/*.m4a` are synth-generated placeholders (macOS `afconvert` — no LAME available
so mp3 encoding is out). Real assets can be either `.m4a` with the same names or
`.mp3` if you flip `AUDIO_ASSET_EXT` in `js/audio.jsx` back. Spec §12.2 has the
generation notes.

## Where the codebase stands

- Phases 0–8 shipped. **Phase 9a (engine extraction) is on main** — `js/engine.jsx`
  holds the six pure step functions (stepDraw/Discard/Claim/DeclareHu/DeclareGang/
  ResolvePass); wrappers in `js/main.jsx` compose them into single-`setState`
  updates per spec §13.5, and every action-emitting handler appends a `state.actionLog`
  entry per §13.6.
- **Phase 9b (replay data + UI) is next.** Depends on 9a's actionLog + engine.
  See spec §14 + Appendix B.10 for the plan; replay storage lives in
  `localStorage["mahjong_replays"]`.

## Known open items

- **Promoted-gang / spec drift.** `handleDeclarePromotedGang` and the AI's
  promoted-gang branch (in `processAIAction`) mutate state without emitting an
  actionLog entry. Spec §13.6 excludes promoted gang from the schema on the
  (stale) claim that the codebase doesn't implement it — it does. Needs a spec
  update + `stepDeclareGang` extension (or a new `stepPromotedGang`) before
  Phase 9b replay can reproduce that branch.
- **Tianhu disabled.** PR #32 (hu-after-chi crash fix) requires `state.lastDrawn`
  to be in hand for the Hu button to appear; `initRound` leaves `lastDrawn` null,
  so a dealer's natural-hu initial deal no longer shows Hu. Accepted trade-off;
  if you ever want it back, seed `lastDrawn` in `initRound` to the dealer's 14th
  tile or introduce a dedicated `canDeclareHu` state flag.
- **Open PRs to be aware of.** Check `gh pr list --state open` on arrival.

## Key modules

| File | Role |
|---|---|
| `MAHJONG_DESIGN_SPEC.md` | Authoritative — always cross-check gameplay changes here |
| `js/main.jsx` | React component, ~3000 lines, all handlers + UI |
| `js/engine.jsx` | Pure step functions (Phase 9a) |
| `js/game-state.jsx` | `createInitialState`, `initRound` |
| `js/validation.jsx` | `validateHu`, `checkWinWithTile`, `isSevenPairs` |
| `js/scoring.jsx` | `applyWin`, `buildWinInfo`, `computeScoreDeltas` |
| `js/claims.jsx` | `findChiOptions`, `findPengOption`, `findGangOption`, `findConcealedGangs`, `findPromotedGangs` |
| `js/audio.jsx` | HTMLAudioElement-based SFX + music (Phase 8) |
| `js/ai.jsx` | `aiChooseDiscard`, `aiDecideClaim` — deterministic given identical state |
| `js/storage.jsx` | `loadJson` / `saveJson` version-checked persistence |

## Conventions worth knowing

- **State transitions belong in `js/engine.jsx`.** New action types should ship a
  new `stepFoo` there (pure — no DOM, no audio, no logs, no timers) plus a wrapper
  in `main.jsx` that handles SFX + animation + logs + actionLog append.
- **Side effects (`playSfx`, `pushAnim`, `pushReaction`) must fire outside the
  `setState` updater** — Strict Mode double-invokes updaters, so anything inside
  will double-fire. See spec §13.5.
- **`persistRev` bumps on every gameplay-mutating setState.** The debounced save
  effect keys off this counter.
- **AI decisions must stay deterministic** given identical state (Appendix A.7).
  No `Date.now()`, no unseeded `Math.random`, no closure-captured caches.
