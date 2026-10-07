import { create } from 'zustand';

/** UI state only — SQLite is the source of truth (ARCHITECTURE §2). */
interface AppState {
  ready: boolean;
  error: string | null;
  /** Bumped after every write so screens reload their queries. */
  dataVersion: number;
  setReady: (ready: boolean, error?: string | null) => void;
  bump: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  ready: false,
  error: null,
  dataVersion: 0,
  setReady: (ready, error = null) => set({ ready, error }),
  bump: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
}));

export const bumpData = () => useAppStore.getState().bump();
