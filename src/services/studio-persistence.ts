import {
  EMPTY_STUDIO_STATE,
  type PersistedStudioState,
} from "@/lib/project-storage";

export const STUDIO_STORAGE_KEY = "vizzy:studio-state";
const STUDIO_STORE_EVENT = "vizzy:studio-state-change";
const EMPTY_SNAPSHOT = JSON.stringify(EMPTY_STUDIO_STATE);

/** Serialized-state boundary used by the React store. */
export interface StudioPersistence {
  subscribe(listener: () => void): () => void;
  getSnapshot(): string;
  getServerSnapshot(): string;
  write(state: PersistedStudioState): void;
}

/** Browser-local prototype persistence. Domain commands never depend on this adapter. */
export function createBrowserStudioPersistence(): StudioPersistence {
  return {
    subscribe(listener) {
      const handleStorage = (event: StorageEvent) => {
        if (event.key === STUDIO_STORAGE_KEY) listener();
      };

      window.addEventListener("storage", handleStorage);
      window.addEventListener(STUDIO_STORE_EVENT, listener);

      return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(STUDIO_STORE_EVENT, listener);
      };
    },

    getSnapshot() {
      try {
        return window.localStorage.getItem(STUDIO_STORAGE_KEY) ?? EMPTY_SNAPSHOT;
      } catch {
        return EMPTY_SNAPSHOT;
      }
    },

    getServerSnapshot() {
      return EMPTY_SNAPSHOT;
    },

    write(state) {
      try {
        window.localStorage.setItem(STUDIO_STORAGE_KEY, JSON.stringify(state));
        window.dispatchEvent(new Event(STUDIO_STORE_EVENT));
      } catch {
        // Unavailable browser storage preserves the prototype's existing no-op behavior.
      }
    },
  };
}
