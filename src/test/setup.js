import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Some Node runtimes expose a stubbed localStorage that throws. Provide a
// deterministic in-memory implementation for the storage unit tests.
if (
  typeof globalThis.localStorage === "undefined" ||
  typeof globalThis.localStorage.clear !== "function"
) {
  class MemoryStorage {
    #items = new Map();

    getItem(key) {
      return this.#items.has(String(key)) ? this.#items.get(String(key)) : null;
    }

    setItem(key, value) {
      this.#items.set(String(key), String(value));
    }

    removeItem(key) {
      this.#items.delete(String(key));
    }

    clear() {
      this.#items.clear();
    }

    key(index) {
      return [...this.#items.keys()][index] ?? null;
    }

    get length() {
      return this.#items.size;
    }
  }

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
  });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});
