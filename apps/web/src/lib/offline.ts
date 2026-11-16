import { useEffect, useState, useSyncExternalStore } from "react";
import type { LibrarySnapshot } from "@nodoteca/core";
import { fetchSnapshot } from "./exporter.ts";

/**
 * Offline copy of the whole library, kept in IndexedDB.
 * Refreshed while online; read by the queries when the network is gone.
 * Read-only on purpose: queuing edits for later risks conflicts between devices.
 */

interface Stored {
  userId: string;
  savedAt: string;
  data: LibrarySnapshot;
}

const DB_NAME = "nodoteca";
const STORE = "offline";
const KEY = "snapshot";

let memory: Stored | null = null;
let activeUserId: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** The saved copy for the signed-in user, if any. */
export async function currentSnapshot(): Promise<Stored | null> {
  if (!activeUserId) return null;
  if (memory?.userId === activeUserId) return memory;
  try {
    const stored = await idb<Stored | undefined>("readonly", (s) => s.get(KEY));
    memory = stored && stored.userId === activeUserId ? stored : null;
  } catch {
    memory = null;
  }
  notify();
  return memory;
}

async function save(userId: string, data: LibrarySnapshot) {
  memory = { userId, savedAt: new Date().toISOString(), data };
  notify();
  try {
    await idb("readwrite", (s) => s.put(memory, KEY));
  } catch {
    /* kept in memory for this session */
  }
}

/** Forget the copy (sign-out). */
export async function clearSnapshot() {
  memory = null;
  activeUserId = null;
  notify();
  try {
    await idb("readwrite", (s) => s.delete(KEY));
  } catch {
    /* nothing stored */
  }
}

let syncTimer: ReturnType<typeof setTimeout> | undefined;
let syncing = false;

/** Refresh the copy soon (debounced), if online. */
export function scheduleSync(delay = 3000) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void syncNow(), delay);
}

async function syncNow() {
  const userId = activeUserId;
  if (!userId || !navigator.onLine || syncing) return;
  syncing = true;
  try {
    await save(userId, await fetchSnapshot());
  } catch {
    /* try again on the next change or reconnect */
  } finally {
    syncing = false;
  }
}

/** Keep the copy fresh for this user: now, and every time the connection comes back. */
export function useOfflineSync(userId: string) {
  useEffect(() => {
    activeUserId = userId;
    void currentSnapshot();
    scheduleSync(1500);
    const onOnline = () => scheduleSync(500);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      clearTimeout(syncTimer);
    };
  }, [userId]);
}

/** Errors that mean "no network" rather than "the server said no". */
export function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String(err.message) : "";
  return !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed/i.test(msg);
}

/** Run the online query; with no network, answer from the saved copy instead. */
export async function withOffline<T>(online: () => Promise<T>, local: (data: LibrarySnapshot) => T): Promise<T> {
  if (navigator.onLine) {
    try {
      return await online();
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  const copy = await currentSnapshot();
  if (!copy) throw new Error("offline-no-copy");
  return local(copy.data);
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
  );
}

/** When the offline copy was last saved (re-renders when it changes). */
export function useSavedAt(): string | null {
  const [savedAt, setSavedAt] = useState(memory?.savedAt ?? null);
  useEffect(() => {
    const update = () => setSavedAt(memory?.savedAt ?? null);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return savedAt;
}
