# Improvements roadmap

This document is the roadmap and rationale for the next nine features. It captures *what* we're building, *why*, *what was decided and why*, and *what remains open*. It deliberately does not capture implementation details — those live in `MAHJONG_DESIGN_SPEC.md`.

## How to read this alongside the design spec

- **`IMPROVEMENTS.md`** (this file) — roadmap, rationale, sequencing, open questions. Read when deciding *whether* and *when* to do something, or to understand *why* a decision was made.
- **`MAHJONG_DESIGN_SPEC.md`** — implementation contract: state shapes, file paths, function signatures, acceptance criteria. Read when actually writing code.

If the two disagree, the design spec wins on implementation details and this doc wins on intent and rationale. When a feature ships, mark it here (rationale archive) and update there (current contract).

## Implementation order

Recommended sequencing — some flex allowed, see per-feature dependency notes:

1. Training mode / hints
2. Resume in progress
3. Lifetime statistics
4. Achievements
5. Seeded RNG + daily challenge
6. Tile animations
7. AI portraits + reactions
8. Sound effects + music
9a. Engine extraction
9b. Replay data + UI

The shape is roughly "low-risk additions first, then determinism work, then UI polish, then the replay refactor." Items 2–5 form a tight cluster — each adds long-lived state the next consumes. Try to land them in order without skipping.

---

## 1. Training mode / hints

**Goal.** Optional "best discard" guidance during the human player's discard turn.

**Why.** The expert AI already evaluates discards every turn; surfacing that evaluation as a teaching aid is essentially free for the user and zero new AI work for us. Most polished mahjong apps have hints — we should too. Also lays groundwork for Feature 4's `purist` achievement.

**Key decisions.**
- Off by default; persistent menu toggle.
- Hint engine always uses expert difficulty regardless of the game's selected difficulty. This is a teaching tool — there's no value in a worse hint.
- The "hint was used this game" flag lives at *match* scope, not round scope. If it were per-round, it would reset every `nextRound` and defeat the `purist` achievement.

**Open Qs.**
- One-shot per turn, or persistent until cleared? *Default: persistent until cleared.*

---

## 2. Resume in progress

**Goal.** A refresh, accidental tab close, or backgrounded tab doesn't lose a game in progress.

**Why.** The app is single-page with no server state; a refresh today drops everything. This is the single most likely "I'd play this again tomorrow" feature for casual users.

**Key decisions.**
- Save fires on real game-state changes only — not on animation pushes or transient UI state. Otherwise the high-frequency mutations from Features 6 (animations) and 7 (reactions) thrash localStorage and serialize state that's deliberately not restored.
- Debounced during normal play; synchronously flushed on page lifecycle events. The mobile path is load-bearing: iOS Safari often doesn't fire `beforeunload` on background, so `pagehide` + `visibilitychange` are the primary signals on mobile.
- Save includes post-win / round-over states (not just pre-resolution). Refresh on the round-over modal restores directly to the resolved state, rather than restoring pre-win and relying on Feature 5's determinism to re-resolve. The `gameOverAcknowledged` clear-trigger handles "don't offer to resume a finished game."
- **`gameId` introduced here.** Used by Feature 3 (guard against double-counting), Feature 4 (unlocked-once gate), Feature 8 (resume-SFX suppression), and Feature 9 (replay linkage). Introducing it in Feature 2 means later features don't have to retrofit it onto saves that pre-date them.
- Admin-touched games are *resumable* but **not replayable** — admin overrides bypass the action log. Feature 9 detects this case and degrades gracefully.

**Open Qs.**
- If the user changes language/difficulty on the menu while a resume save exists, override or warn? *Default: warn — these settings are baked into the saved game.*

---

## 3. Lifetime statistics

**Goal.** Persistent counters across all games so the player can see long-term progress.

**Why.** Closes the feedback loop on long-term skill. Required for the wins-based achievements in Feature 4. Cheap to add once Feature 2's `gameId` exists.

**Key decisions.**
- Human-centric counters only. Per-AI-seat stats might be interesting later but add complexity for limited payoff in a single-player app.
- "Won the game" = highest final score, shared first counts as a win. Other definitions (e.g. "had ≥1 Hu") would be more lenient but less interesting on a stat sheet, and inconsistent with "win streak" intuition.
- Win-type counters (`zimoHu`, `sevenPairsHu`) overlap with size counters (`smallHu`, `largeHu`) and each other. UI labels must reflect that "Wins by large hu" can be true alongside "Wins by zimo."
- Lifetime-stats fold-in and Feature 4's achievement check share a single effect — order matters because count-based achievements (`wins_50`) need the *post-fold* value.

**Open Qs.**
- Track per-AI-seat stats too? *Default: no.*

---

## 4. Achievements

**Goal.** Long-tail unlockable badges to give players reasons to revisit.

**Why.** Achievements are the cheapest hook into "I should come back tomorrow" behavior. Most are computed entirely from data Features 2/3/5 already produce, so the incremental cost is mostly UI and copywriting.

**Key decisions.**
- Each achievement carries a `mode` ("normal" / "daily" / "any") field. Makes the daily inclusion/exclusion structural rather than burying it inside every predicate. Cleaner than the original "scope" approach.
- Achievement check must run *after* the lifetime-stats fold-in for that game — otherwise count-based unlocks lag by one game. Combine into a single effect with explicit step order, don't rely on React effect-declaration order.
- New unlocks toast at the bottom-right of the screen. Toasts must render above all modals — game-scope predicates fire while Game Summary is open, so a toast underneath the modal backdrop is invisible.
- Localize names and descriptions in EN and ZH alongside the rest of the app's strings.

**Dependencies.** Feature 1 (hint-usage flag for `purist`), Feature 2 (`gameId`), Feature 3 (post-merge lifetime counters), Feature 5 (`dailyGame` flag).

**Open Qs.**
- Re-announce previously unlocked achievements at session start, or only mid-session unlocks? *Default: mid-session only.*

---

## 5. Seeded RNG + daily challenge

**Goal.** A deterministic shuffle so the same wall is dealt to every player on the same UTC date. Also unblocks Feature 9 (replay).

**Why.** Daily challenge is the most leverageable social-loop feature: shared seed, comparable scores, natural come-back-tomorrow hook. Determinism is also a hard prerequisite for replay — there's no point persisting an action log if we can't reproduce the initial wall from a seed.

**Key decisions.**
- Two seeded RNGs per match: a deck RNG (per round, deterministic from `roundSeed`, controls only the shuffle) and a cosmetic RNG (per match, controls personality + name assignment). Required because `pickPlayerNames` reads per-user `localStorage` — if a single shared RNG were used, two users on the same daily seed would diverge after the per-user name pick and produce different walls. The split confines per-user variance to cosmetics.
- Tile IDs become deterministic decimal-string counters from `createDeck`, not `Math.random().toString(36)`. Required for replay. Also lets the admin id-allocator scan for collisions deterministically.
- Daily seed is UTC, not local. Same daily wall globally. UI should show the next reset time in the user's local time so they aren't surprised by the daily flipping at an unfamiliar hour.
- The existing biased `.sort(() => Math.random() - 0.5)` in `assignPersonalities` is fixed alongside this work — it's both non-deterministic and produces a non-uniform distribution. The determinism work touches that line anyway.

**Dependencies.** None hard, but the resume save format gets a schema bump because pre-Feature-5 saves carry random base-36 tile IDs that break the new id-format invariant.

**Open Qs.**
- Daily mode forces difficulty / round count, or matches the user's current menu settings? *Default: forces — so everyone's comparing the same scenario.*

---

## 6. Tile animations

**Goal.** Draws, discards, claims, and wins feel kinetic instead of snapping.

**Why.** Pure polish, but cheap — CSS keyframes only, no library, no bundler. Without animations the UI feels like it's teleporting tiles around, which is the single biggest "feels unfinished" tell on a board game.

**Key decisions.**
- Latest-wins per tile id, with generation-stamped cleanup. Without the generation stamp, an immediate draw-then-discard race lets a stale draw-cleanup timer delete the fresh discard animation mid-flight.
- Discard uses FLIP (First-Last-Invert-Play) measurement; everything else is a generic slide-in. Discard is the only animation where "comes from the player's hand" is the load-bearing visual continuity — generic slide-in loses that.
- Honor `prefers-reduced-motion` by *skipping the animation state push entirely*, not just disabling CSS keyframes. Otherwise users with reduced motion still pay the setState / timer cost for animations they can't see.

**Open Qs.**
- Speed: ~300ms for draws/discards, ~500ms for claims/wins. Confirm or adjust after seeing it in motion.

---

## 7. AI portraits + reactions

**Goal.** AI seats feel like characters, not just labels.

**Why.** Reinforces the name-group flavor that already exists (Street Fighter / Bleach / etc.) — characters with reactions are more memorable than three identical "AI" labels.

**Key decisions.**
- Image support is optional. Default rendering is initials chips with seat-scoped color. Ship without images; add a small set later if desired. Avoids a content-creation blocker.
- Reactions use the same latest-wins, generation-stamped cleanup pattern as Feature 6's animations.
- Reactions localized — they're player-facing text and the app already supports EN/ZH.
- Master "Disable AI reactions" toggle on the menu. Some players will find them noisy.

**Open Qs.**
- Big-loss reaction threshold: start at `-80`, tune after play data. Too lenient and the bubble becomes background noise; too strict and it never fires.

---

## 8. Sound effects + music

**Goal.** Audio cues for the major events, optional ambient background music.

**Why.** Audio is the single biggest "feels like a real app" tier you can add to a web game. Most players will leave it on.

**Key decisions.**
- All assets CC0 (freesound.org / opengameart.org) or generated. No licensing risk.
- Size budget: SFX-only ~200–400KB, SFX+BGM ~500–900KB. If BGM blows the budget, ship SFX first and revisit later.
- Audio waits for first user interaction to preload — browsers block autoplay before a gesture.
- Round-over SFX needs a *resume gate*. Without it, refreshing on the round-over modal re-fires the win/lose SFX. Two disjoint cases — "save captured the post-win state" vs. "crash inside the debounce window" — need disjoint mechanisms.

**Dependencies.** Feature 2 (resume gate hooks the resume restore flow). Feature 9a's pure step functions make "replay is silent" structural rather than enforced — no SFX code path is reachable from the replay engine.

**Open Qs.**
- Music track style: ambient lo-fi, traditional Chinese instrumentation, or none. *Default: ambient instrumental, low volume.*

---

## 9. Round replay

**Goal.** After a round (or whole game) ends, scrub through it turn-by-turn.

**Why.** A killer learning feature for an opaque game like mahjong — "why did the AI claim that chi" is much easier to answer with a replay than a static log. Also a frequent ask in mahjong app reviews.

**Key decisions.**
- Split into two phases. **9a (engine extraction)** is a mechanical refactor with no user-visible change; **9b (replay UI)** is the payoff. Land 9a in a single PR and verify with a full game before starting 9b — otherwise debugging "is this a refactor bug or a replay bug" gets miserable.
- Pure step functions (`stepDraw`, `stepDiscard`, etc.) in a new module. Live handlers become wrappers that call the step fn and then handle UI side effects. Replay calls the step fns directly, never the wrappers.
- Replay storage is action log + per-round seed, not full state snapshots. ~15–25KB per game; 10-game cap keeps total well under quota.
- Admin-touched games are excluded from replay (see Feature 2). Detected via a flag set inside the admin apply path.

**Dependencies.** Feature 2 (`gameId` for linkage), Feature 5 (deterministic state). 9b strictly after 9a.

**Open Qs.**
- Replay shows AI reactions / personality bubbles, or just mechanical actions? *Default: just actions.*

---

## Cross-cutting principles

These apply to every feature in this roadmap.

### Determinism (after Feature 5)

Any code path affecting game state must accept an explicit RNG argument, not read `Math.random()` directly. Any code path synthesizing a tile must allocate its id from a deterministic counter, not `Math.random().toString(36)`. **One explicit exception:** `gameId` (Feature 2) is an identifier with no gameplay impact and may use `crypto.randomUUID()` with a `Math.random`-based fallback.

The determinism rule is enforced by convention, not the type system — flag any new `Math.random` usage in code review against this principle.

### UI effects are not authoritative

Animations (6), reactions (7), audio (8), and replay playback controls (9b) are presentation concerns. They must not determine game outcomes and must not be required to reconstruct a round. This is what makes Feature 9b's "replay is silent" structural rather than enforced — SFX fires from live wrappers, replay calls step functions directly.

### Versioned persistence

Every structured `localStorage` payload includes a `v:` field. On version mismatch, default to discard-and-start-fresh unless the migration is trivial and clearly safer. Single-flag keys (bare booleans / numbers) are exempt — the schema-version rule applies to structured payloads.

A schema bump on an in-progress save (Feature 5 bumps `mahjong_in_progress.v` from 1 to 2) means a refresh during that deploy window loses any in-progress game. Acceptable because deploys are infrequent and the alternative — one-off id-rewrite migrations — is more code than the save is worth.

### Mobile + accessibility checked per feature

Every new UI element verified at 360×640 viewport (shortest common phone). Keyboard accessibility, `prefers-reduced-motion`, screen-reader labels checked per feature, not bolted on later. The design spec has the per-feature checklist.

---

## Cross-feature interaction rules

Locked decisions about how the features compose, so implementation doesn't drift into ambiguity.

- **Training mode (1) × stats / achievements (3 + 4).** Training-mode games count toward lifetime stats and most achievements. Only `purist` is gated on the hint-not-used flag.
- **Daily (5) × training mode (1).** Daily mode forces `trainingMode = false` for fairness. The user's saved menu preference is not overwritten — daily only overrides for that game.
- **Daily (5) × achievements (4).** Daily games count toward shared achievements (`mode: "any"`). A dedicated daily-only family uses `mode: "daily"`.
- **`purist` × daily.** `purist` is `mode: "normal"` (excludes daily). Daily mode forces training off, which would otherwise trivially unlock `purist` on every daily win.
- **Replay (9) × animations (6).** Replay skips animations by default — users want to scrub quickly. Optional toggle to re-enable.
- **Replay (9) × reactions (7).** Replay does not re-fire reaction bubbles.
- **Replay (9) × audio (8).** Replay is silent by construction. Step functions are pure; SFX lives in the live wrappers replay doesn't call.
- **Resume (2) × replay (9).** Resume save persists only the current round's action log inside `state`. Finished rounds live in a separate `mahjong_replays` key. Replay UI merges both sources.
- **Resume (2) × audio (8).** A resumed post-win state must not re-fire the win/lose SFX. The resume-SFX gate has two mechanisms — one for when the save captured the post-win state, one for when it didn't due to a crash inside the debounce window.

---

*For state shapes, function signatures, file paths, line citations, and acceptance criteria, see `MAHJONG_DESIGN_SPEC.md`.*
