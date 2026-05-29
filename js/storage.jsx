// Versioned localStorage helpers shared by every structured persistence
// feature (resume, lifetime stats, achievements, daily, audio, replays)
// so they don't duplicate parse/version/error handling. See spec §4.

// ============================================================
// STORAGE HELPERS
// ============================================================

function deepClone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function resolveFallback(fallbackOrFactory) {
  // Always deep-clone, even when the caller passed a factory.
  // Factories that return references to module-level constants
  // (e.g. `() => DEFAULT_LIFETIME_STATS`) would otherwise leak the
  // shared object across loads — see spec §4.2.
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
