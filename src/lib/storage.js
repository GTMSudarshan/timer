const PREFIX = "pomodoro_";

/**
 * Small promise-based wrapper around localStorage.
 * Keys returned by `list()` are unprefixed on purpose — callers should never
 * need to know how the browser stores the data.
 */
export const storage = {
  async get(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? null : { value: raw };
    } catch {
      return null;
    }
  },

  async set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, String(value));
    } catch {
      // Quota exceeded / private mode — the app keeps working in memory.
    }
  },

  async list(prefix = "") {
    try {
      const keys = [];
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key && key.startsWith(PREFIX + prefix)) {
          keys.push(key.slice(PREFIX.length));
        }
      }
      return { keys };
    } catch {
      return { keys: [] };
    }
  },

  async remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      // ignore
    }
  },
};

export default storage;
