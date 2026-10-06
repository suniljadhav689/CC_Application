import { create } from 'zustand';

const useStore = create((set, get) => ({
  // Connection mode: 'live' | 'readonly' | 'checking'
  mode: 'checking',
  lastSyncedAt: null,

  setMode: (mode) => set({ mode }),
  setLastSyncedAt: (ts) => set({ lastSyncedAt: ts }),

  // Analytics summary cache
  summary: null,
  setSummary: (s) => set({ summary: s }),

  // Filters
  filters: {
    search: '',
    card_id: null,
    category: null,
    is_fraud: null,
    is_friends: null,
    date_from: null,
    date_to: null,
  },
  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),
  resetFilters: () =>
    set({
      filters: {
        search: '', card_id: null, category: null,
        is_fraud: null, is_friends: null, date_from: null, date_to: null,
      },
    }),
}));

export default useStore;
