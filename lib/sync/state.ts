/**
 * Estado en memoria del motor de sync (sincronizando, último error), expuesto
 * como "external store" para `useSyncExternalStore`.
 */

export interface EngineState {
  syncing: boolean;
  lastError?: string;
}

/** Clave de `meta` con la fecha ISO de la última sincronización correcta. */
export const META_LAST_SYNC = "lastSyncAt";

let state: EngineState = { syncing: false };
const listeners = new Set<() => void>();

/** Instantánea estable (misma referencia mientras no cambie). */
export function getEngineState(): EngineState {
  return state;
}

export function setEngineState(patch: Partial<EngineState>): void {
  const next = { ...state, ...patch };
  if (next.syncing === state.syncing && next.lastError === state.lastError) return;
  state = next;
  for (const l of listeners) l();
}

export function subscribeEngine(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Solo para tests. */
export function resetEngineState(): void {
  state = { syncing: false };
  for (const l of listeners) l();
}
