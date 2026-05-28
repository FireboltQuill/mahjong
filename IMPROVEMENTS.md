# Improvements roadmap

Specs for the planned improvements, in implementation order. Anything in **Open Qs** is something I want explicit answers on before starting that item.

---

## 1. Hand-analyzer / hints

**Goal.** Give the human player optional "best discard" guidance during their turn.

**State + storage.**
- New menu setting `trainingMode` (boolean), persisted to `localStorage["mahjong_training_mode"]`. Default `false`.
- No new game-state fields — the hint is computed on demand each render.

**UI.**
- Menu adds a checkbox-style toggle next to the difficulty selector, label "🎓 Training Mode (hints on your turn)".
- When `trainingMode === true` AND it's the human's turn AND `phase === "discard"`:
  - A `💡 Hint` button appears in the action bar.
  - Clicking it highlights one tile in the hand (gold glow + a small "↑ best" tag underneath).
  - Pressing again, or selecting any tile, clears the highlight.

**Logic.**
- Call `aiChooseDiscard(player.hand, player.openMelds, state.players, "expert", "generic", state.wall.length, PLAYER_IDX)` to get the recommended discard index. No new AI code.

**Files.** `js/main.jsx` (state + button + highlight render), `js/styles.jsx` (hint highlight style), `js/lang.jsx` (strings).

**Open Qs.**
- Hint always uses expert AI regardless of selected difficulty? *Default: yes — this is a teaching tool.*
- One-shot per turn, or persistent until clicked again? *Default: persistent until cleared.*

---

## 2. Resume in progress

**Goal.** A page refresh / accidental close doesn't lose a game in progress.

**State + storage.**
- `localStorage["mahjong_in_progress"]` = `{ v: 1, state, lang, difficulty, windRoundsSetting, trainingMode }`. `v` is a schema version; mismatched versions are discarded on load.
- Saved snapshot is a JSON-serialized copy of the current `state` (small, <50KB even with full wall).

**Save trigger.**
- `useEffect` watching `state`. Saves whenever a game is active: `!showMenu && state.winner === null && !state.isDraw`.
- Debounce trivial — `setItem` is synchronous and fast; just save every render that meets the condition.

**Clear trigger.**
- "Back to Menu" from the game-over screen.
- Starting a fresh game from the menu (any path: Start Game, Admin entry, Daily Challenge).
- On any read failure or version mismatch.

**UI.**
- On menu mount, if a valid in-progress save exists, render `↻ Resume Game` as the primary button (replacing "Start Game" as the gold-styled action). "Start Game" stays available as a secondary button below.
- Click Resume: restore `state` + settings, hide the menu.

**Files.** `js/main.jsx` (save effect, restore logic, menu button), `js/lang.jsx` (strings).

**Open Qs.**
- If the user changes language / difficulty on the menu while a resume save exists, do we override the saved values or warn? *Default: warn — these settings are baked into the saved game.*
- If the saved game was an admin-set scenario, do we still resume it? *Default: yes, it's all just state.*

---

## 3. Lifetime stats

**Goal.** Persistent counters across all games so the player can see long-term progress.

**State + storage.**
- `localStorage["mahjong_lifetime_stats"]` = `{ v: 1, ...counters }`.
- Tracked counters:
  - `gamesPlayed` — increments on game-over.
  - `gamesWon[seatIdx]` — wins per seat? No — wins for the human only. Just `gamesWon` (int).
  - `roundsPlayed`, `roundsWon` (human's wins), `roundsDianpaoGiven` (human discarded the winning tile).
  - `huCount` split: `smallHu`, `largeHu`, `zimoHu`, `sevenPairsHu` (all for the human's wins).
  - `biggestSingleGain`, `biggestSingleLoss` (records ever).
  - `bestEndingBalance`, `worstEndingBalance`.
  - `currentWinStreak`, `longestWinStreak` (consecutive games where human had highest score).
  - `totalScoreNet` (sum of `final_score - starting_score` across all games).

**Update trigger.**
- Existing useEffect on round-end already records `roundResults`. Add a second effect on game-end (`gameOver && gameOverAcknowledged === false` once per game) that folds the just-finished match into the lifetime stats.
- Guard via a `lifetimeUpdatedFor` field (game id / start timestamp) to avoid double-counting on re-renders.

**UI.**
- New `📊 Stats` button on the menu next to Manage Names.
- Opens a panel modal with the counters grouped: **Games** / **Wins** / **Records** / **Streaks**.
- "Reset stats" button at the bottom with a confirmation step.

**Files.** `js/main.jsx` (effect + modal), new `js/lifetime.jsx` (load/save/merge helpers + default stats shape), `js/lang.jsx` (strings).

**Open Qs.**
- Track per-AI-seat stats too (so we know which AI personality beats us most)? *Default: no — keep player-centric to start.*
- "Win" definition for win-streak: human had the highest final score, or human had ≥1 Hu in the game? *Default: highest final score.*

---

## 4. Achievements

**Goal.** A long-tail list of unlockable badges to give players reasons to revisit.

**State + storage.**
- `localStorage["mahjong_achievements"]` = `{ v: 1, unlocked: { [id]: ISO_DATE } }`.
- Achievements defined as an array `ACHIEVEMENTS` of `{ id, name, description, predicate, scope }`.
  - `scope` is `"round"` or `"game"` — determines when the predicate runs.
  - `predicate(ctx)` returns `true` if the achievement should unlock. `ctx` includes `state`, `lifetime`, `latestRoundResult`, `roundResults`.

**Seed list (subject to your additions/removals).**
- `first_hu` — Your first Hu.
- `first_large_hu` — Your first Large Hu (single-wait win).
- `first_seven_pairs` — Your first Seven Pairs win.
- `first_zimo` — Your first Zimo.
- `wins_10`, `wins_50` — Total games won.
- `no_claim_win` — Win a Hu without claiming any discards in that round.
- `bankrupt_table` — End a game with all three AIs in the negative.
- `last_tile` — Hu on the very last wall tile.
- `comeback_kid` — Win a game after being at the lowest score for ≥half the rounds.
- `streak_5` — Win 5 games in a row.

**Update trigger.**
- After each round: walk `ACHIEVEMENTS` with `scope === "round"`, unlock matching ones.
- After each game-end: walk `scope === "game"` predicates.
- Newly unlocked achievements during a session show a transient toast in the bottom-right of the screen.

**UI.**
- Achievements panel reachable from the menu Stats button (separate tab inside Stats).
- Grid of badges: locked ones are dim/grey + show only the name, unlocked ones show name + description + date unlocked.
- Toast: `🏆 Unlocked: <name>` with a fade in/out.

**Files.** New `js/achievements.jsx` (definitions + load/save/check helpers), `js/main.jsx` (effects + toast renderer), `js/styles.jsx` (badge + toast styles), `js/lang.jsx` (strings — keep the achievement names/descriptions in `lang.jsx` for translation).

**Open Qs.**
- Notify only mid-session, or also re-announce unlocked ones from a previous session? *Default: only the ones unlocked in this session.*
- Localize achievement names/descriptions or keep English-only? *Default: localize both EN and ZH.*

---

## 5. Daily seed / challenge

**Goal.** A deterministic shuffle so the same wall is dealt to every player on a given calendar day.

**Implementation.**
- New `js/rng.jsx` with a Mulberry32 PRNG. Exposes `seededRng(seed)` returning a `{ next, nextInt, pick }` object.
- All current `Math.random` usages need to route through an RNG. Specifically:
  - `shuffle(arr)` in `tiles.jsx`
  - `createTile`'s id generator in `tiles.jsx` (use a deterministic counter instead of `Math.random` for daily games)
  - `assignPersonalities` in `ai.jsx`
  - `pickPlayerNames` in `names.jsx`
  - `aiChooseDiscard` and `aiDecideClaim` if they use `Math.random` for ties — verify.
- Switch is a top-level `currentRng` ref/global set by the game-start path. Normal games keep `Math.random`; daily mode swaps in the seeded one.
- Seed = today's date in UTC, hashed: `seedFromDate("2026-06-01")` → integer.

**UI.**
- "🎯 Daily Challenge" button on the menu.
- Click: locks settings to fixed (e.g. 1 wind round, expert difficulty), starts a game with today's seed. Shows the date and seed at the top of the modal.
- `localStorage["mahjong_daily"][YYYY-MM-DD]` = `{ played: bool, finalScore, rank }`. If already played today, the daily button shows the previous result and a "Play again (won't save)" option.

**Files.** New `js/rng.jsx`, modifications to `js/tiles.jsx` / `js/ai.jsx` / `js/names.jsx` / `js/game-state.jsx` to thread the RNG through, `js/main.jsx` for the daily-mode button + flow, `js/lang.jsx`.

**Open Qs.**
- Daily mode forces a specific difficulty/round count, or matches the user's current menu settings? *Default: forces (so everyone's comparing the same scenario).*
- Tile `id`s must also be deterministic for replay (item 9) to work. Switch tile id from `Math.random` to a per-deck counter regardless of mode? *Default: yes — it's the same change either way, and it removes a source of nondeterminism.*

---

## 6. Tile animations

**Goal.** Make draws, discards, claims and wins feel kinetic instead of snapping.

**Implementation.**
- Pure CSS keyframes + transitions; no library, no bundler.
- New `state.tileAnims` Map keyed by tile id → `{ kind, startedAt, ttl }`. Used to drive transient classes via `style` prop overrides.
- Animation kinds:
  - `draw` — tile slides in from the right of the hand (or wherever the seat sits) with a small scale-up.
  - `discard` — tile slides from the player's hand position to the matching discard pool quadrant.
  - `claim-pop` — claimed tile scales 1.0 → 1.2 → 1.0 with a gold flash.
  - `win-shimmer` — winning hand row gets a sweeping gold gradient animation.
- Animations are fire-and-forget: pushed to `tileAnims` for ~500ms then removed.

**Trigger points.**
- `handlePlayerDraw` / AI draw — add a `draw` anim for the new tile.
- `handlePlayerDiscard` / AI discard — add a `discard` anim for the discarded tile.
- `executeClaim` — `claim-pop` for the claimed tile.
- `applyWin` — `win-shimmer` on all winning hand tiles.

**Files.** `js/main.jsx` (state + trigger calls + per-tile style merge), `js/styles.jsx` (keyframe definitions added as a string injected via `<style>`), no other files.

**Open Qs.**
- Should there be a "reduce motion" toggle for the OS-level `prefers-reduced-motion` users? *Default: yes — honor the media query and disable shimmer + slides.*
- Speed: ~300ms feels right for draws/discards, ~500ms for claims/wins. Confirm or adjust.

---

## 7. AI reactions / portraits

**Goal.** AI players feel like characters, not just labels.

**Data.**
- Each name group entry optionally carries portraits: `{ name: "Manon", portrait: "url-or-dataurl" }`. Backward-compatible — bare strings still work.
- For now: no images shipped. Default behavior: render a colored initials chip (e.g. "MA" on a hue derived from the name).
- New `js/portraits.jsx` exposing `getPortrait(name)` (returns `{ kind: "image", url }` or `{ kind: "initials", text, hue }`).

**Reactions.**
- New `state.aiReactions` Map: `seatIdx → { line, kind, expiresAt }`.
- Event triggers (added to existing setState callbacks):
  - AI hu → reaction on AI: line from `reactionsOwnHu`.
  - AI dianpao → reaction on the discarder: line from `reactionsDianpaoLoss`.
  - AI gets a big loss (>40 points in one round) → `reactionsBigLoss`.
  - AI goes below 0 → `reactionsBankrupt`.
  - AI comeback (was lowest, now leading) → `reactionsComeback`.
- Lines vary by personality: each `personality × event` gets its own array of lines in `LANG.en.reactions` and `LANG.zh.reactions`. AI picks a random line from its bucket.

**UI.**
- Opponent strip header: avatar/initials chip to the left of the name.
- Reaction renders as a small chat bubble that pops up next to the strip for ~3 seconds, then fades. Bubble tail points at the avatar.

**Files.** New `js/portraits.jsx`, modifications to `js/main.jsx` (state + render + event hooks), `js/lang.jsx` (lots of new lines), `js/styles.jsx` (bubble + avatar styles).

**Open Qs.**
- Image support stays optional (initials only at first), or do we ship a small image set immediately? *Default: initials only — adding images can be a follow-up.*
- Bubble lifetime + max one bubble per AI at a time? *Default: yes, latest wins.*
- Do we want a master "Disable AI reactions" toggle on the menu? *Default: yes.*

---

## 8. Sound effects + music

**Goal.** Audio cues for the major events + optional background music.

**Asset list.**
- `draw.mp3` — short click on draw.
- `discard.mp3` — soft thunk on discard.
- `peng.mp3`, `chi.mp3`, `gang.mp3` — distinct chime per claim type.
- `hu_win.mp3` — celebratory ding when YOU win.
- `hu_lose.mp3` — softer note when an AI wins.
- `dianpao.mp3` — ouch tone when you dianpao.
- `round_over.mp3` — neutral swell on round end.
- `tile_select.mp3` — quiet tick when player selects a hand tile (skippable if too noisy).
- `bgm_loop.mp3` — optional ambient music track.

All from CC0 sources (freesound.org / opengameart.org) or generated. Stored under `audio/` in the repo (kept small — total <500KB if possible).

**State + storage.**
- `localStorage["mahjong_audio"]` = `{ sfxVolume: 0–1, musicVolume: 0–1, sfxMuted, musicMuted }`. Defaults: sfx 0.6, music 0.3, neither muted.
- `js/audio.jsx` preloads all clips into `Audio` objects on first interaction (browsers block autoplay before user gesture); exposes `playSfx(name)` / `startMusic()` / `stopMusic()` / `setVolumes()`.

**Trigger points.** Existing state-mutation paths add a single `playSfx(...)` call:
- Draw, discard, each claim type, applyWin (branch on `winnerIdx === PLAYER_IDX`), round-over modal mount.

**UI.**
- Two volume sliders + mute toggles on the menu under a new "🔊 Audio" section.
- A small 🔇/🔊 button on the in-game top bar for quick mute.

**Files.** New `js/audio.jsx`, audio assets under `audio/`, modifications to `js/main.jsx` (settings UI + trigger calls), `js/lang.jsx`.

**Open Qs.**
- Source audio yourself (free packs) or do you want me to pick? *Default: I pick from CC0 sources and add them to a `audio/` dir.*
- Music track style: ambient lo-fi, traditional Chinese instrumentation, or none and just SFX? *Default: ambient instrumental, kept very low by default.*

---

## 9. Round replay

**Goal.** After a round (or whole game) ends, scrub through it turn-by-turn.

**Requires.** Item 5 (seeded PRNG) — replay needs deterministic re-execution from the initial state.

**Data.**
- `state.actionLog` is appended on every player action. Entry shape: `{ seat, type, ...payload, phaseSnapshot }`. Types: `"draw"`, `"claim"`, `"discard"`, `"declare_hu"`, `"declare_gang"`, `"resolve_pass"`.
- `state.roundSeeds[round]` = the seed that initialized that round's wall (for replay reconstruction).

**Replay engine.**
- `replayRound(initialState, actions, upToActionIdx)` — re-runs `actions[0..upToActionIdx]` against `initialState`, returns the resulting state.
- The engine reuses the existing `processAIAction` / `handlePlayer*` functions, but driven by the action log instead of user input / AI decisions.

**UI.**
- Round-over modal gets a **Replay** tab (4th tab alongside Who Won / Scoring / Stats).
- The tab renders a mini board: hands, melds, discards from the snapshot at the current action.
- Below: a timeline (range slider) and `« prev` / `play ▶` / `next »` buttons. Play steps through at ~1s intervals.
- A "Show all hands" toggle reveals AI hands during replay (debug / learning).
- Game-over modal gets a "Replay any round" picker that opens the round-over replay for the chosen round.

**Files.** New `js/replay.jsx` (action log + replay engine + replay state shape), modifications to every action handler in `js/main.jsx` to append to the action log, the round-over modal in `js/main.jsx` for the new tab, `js/styles.jsx`, `js/lang.jsx`.

**Open Qs.**
- Store full state snapshots per action (simpler, ~1MB/match) or only actions and re-derive (cheap memory, more code)? *Default: actions + re-derive, since memory cost matters on mobile.*
- Replay shows AI thinking (their reactions / personality) or just the mechanical actions? *Default: just actions, no chat bubbles.*

---

## Cross-cutting notes

- **Schema versions** on every localStorage payload (`v: 1`). Bump and migrate when format changes; default to "discard and start fresh" if migration is too complex.
- **Privacy.** Everything is local — no network calls anywhere in this list.
- **Documentation.** When each item lands, append a brief mention to the appropriate per-file note in `CLAUDE.md` so future Claude sessions know what's there.
