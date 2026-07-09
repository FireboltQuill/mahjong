// Audio module: SFX + optional background music. HTMLAudioElement-based
// with graceful fallback when asset files don't exist. Preload gated
// behind first user gesture per browser autoplay policies. See spec §12.

const AUDIO_KEY = "mahjong_audio";
const AUDIO_VERSION = 1;
const AUDIO_LAST_ANNOUNCED_KEY = "mahjong_last_announced";
const AUDIO_LAST_ANNOUNCED_VERSION = 1;
const AUDIO_ASSET_PATH = "audio/";

// Spec §12.2 asset list.
const AUDIO_SFX_NAMES = [
  "draw", "discard", "peng", "chi", "gang",
  "hu_win", "hu_lose", "dianpao", "round_over", "tile_select",
];
const AUDIO_MUSIC_NAME = "bgm_loop";

const DEFAULT_AUDIO_SETTINGS = {
  v: AUDIO_VERSION,
  sfxVolume: 0.6,
  musicVolume: 0.3,
  sfxMuted: false,
  musicMuted: false,
};

function loadAudioSettings() {
  return loadJson(AUDIO_KEY, AUDIO_VERSION, () => ({ ...DEFAULT_AUDIO_SETTINGS }));
}

function saveAudioSettings(next) {
  return saveJson(AUDIO_KEY, next);
}

// Module-scope state so all handlers share the same elements. Reset
// happens implicitly via idempotency guards; the ready flag flips true
// after the first user-gesture unlock and stays true for the session.
const audioState = {
  ready: false,
  sfxElements: new Map(),
  musicElement: null,
  context: null,
  settings: null,
  warned: new Set(),
};

// Spec §12.4 — called from the first user gesture. Creates
// HTMLAudioElement per SFX with preload="auto" and starts fetching.
// Also creates an AudioContext + plays a 1-sample silent buffer to
// unlock iOS Safari's audio output for the whole page (§12.3 iOS
// deferred, but the pattern is cheap on desktop too).
// Idempotent — safe to call from every click handler.
function initAudioAfterGesture() {
  if (audioState.ready) return;
  audioState.ready = true;
  audioState.settings = audioState.settings || loadAudioSettings();

  // iOS unlock — silent buffer through AudioContext.
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx && !audioState.context) {
      const ctx = new Ctx();
      const buffer = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0);
      audioState.context = ctx;
    }
  } catch {}

  const s = audioState.settings;
  for (const name of AUDIO_SFX_NAMES) {
    try {
      const el = new Audio(`${AUDIO_ASSET_PATH}${name}.mp3`);
      el.preload = "auto";
      el.volume = s.sfxVolume;
      el.addEventListener("error", () => {
        if (!audioState.warned.has(name)) {
          audioState.warned.add(name);
          // Single warning per missing asset per session.
          console.warn(`[audio] missing asset: ${name}.mp3`);
        }
      });
      audioState.sfxElements.set(name, el);
    } catch {}
  }

  try {
    const bgm = new Audio(`${AUDIO_ASSET_PATH}${AUDIO_MUSIC_NAME}.mp3`);
    bgm.preload = "auto";
    bgm.loop = true;
    bgm.volume = s.musicVolume;
    bgm.addEventListener("error", () => {
      if (!audioState.warned.has(AUDIO_MUSIC_NAME)) {
        audioState.warned.add(AUDIO_MUSIC_NAME);
        console.warn(`[audio] missing asset: ${AUDIO_MUSIC_NAME}.mp3`);
      }
    });
    audioState.musicElement = bgm;
  } catch {}
}

// Play a sound effect by name. No-ops silently if audio isn't ready
// yet (pre-gesture), settings are muted, or the asset is missing.
function playSfx(name) {
  if (!audioState.ready) return;
  const s = audioState.settings;
  if (!s || s.sfxMuted) return;
  const el = audioState.sfxElements.get(name);
  if (!el) return;
  try {
    // Restart if already playing so rapid repeats aren't lost.
    el.currentTime = 0;
    el.volume = s.sfxVolume;
    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {}
}

function startMusic() {
  if (!audioState.ready) return;
  const s = audioState.settings;
  if (!s || s.musicMuted) return;
  const el = audioState.musicElement;
  if (!el) return;
  try {
    el.volume = s.musicVolume;
    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {}
}

function stopMusic() {
  if (!audioState.ready) return;
  const el = audioState.musicElement;
  if (!el) return;
  try {
    el.pause();
    el.currentTime = 0;
  } catch {}
}

// Push new settings + persist. Updates volumes on any live elements
// so slider drags apply immediately.
function updateAudioSettings(next) {
  audioState.settings = next;
  saveAudioSettings(next);
  for (const el of audioState.sfxElements.values()) {
    try { el.volume = next.sfxVolume; } catch {}
  }
  if (audioState.musicElement) {
    try { audioState.musicElement.volume = next.musicVolume; } catch {}
    if (next.musicMuted) {
      try { audioState.musicElement.pause(); } catch {}
    }
  }
}

// Spec §12.6 resume-SFX gate side channel. Written when a resolution
// SFX fires; read + cleared on resume via §12.6.1 precedence.
function markResolutionAnnounced(gameId, roundNumber) {
  saveJson(AUDIO_LAST_ANNOUNCED_KEY, {
    v: AUDIO_LAST_ANNOUNCED_VERSION,
    gameId,
    roundNumber,
  });
}

function readAndClearResolutionAnnounced() {
  const val = loadJson(AUDIO_LAST_ANNOUNCED_KEY, AUDIO_LAST_ANNOUNCED_VERSION, null);
  removeStorageKey(AUDIO_LAST_ANNOUNCED_KEY);
  return val;
}
